import "server-only";

import { createHash } from "node:crypto";

import { CATCHABLE_LABELS } from "@/config/customer-issues";
import { db } from "@/lib/db";

import { createJiraClient, jiraConfig, jiraFieldsChanged, jiraOwnedFields, JiraError, productFor, rcaComment, type ProductMapping } from "./jira";
import { loadLists, toDate } from "./server";

export class SyncBusyError extends Error {}

/**
 * Pulls issues for the stored JQL and upserts them by issue key. Jira-owned fields refresh every
 * time; hub-owned fields (classification, RCA, prevention, comments, cases) are never written,
 * except Product (from the mapping) and Released in, which are only filled while still empty.
 */
export async function runSync(trigger: "manual" | "schedule", opts: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}) {
  const cfg = jiraConfig();
  if (!cfg) throw new JiraError("Jira not connected — set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN.");
  const settings = await db.jiraSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  if (!settings.jql.trim()) throw new JiraError("Set a sync query (JQL) in Settings → Jira first.");
  const running = await db.jiraSyncLog.findFirst({ where: { finishedAt: null, startedAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
  if (running) throw new SyncBusyError("A sync is already running — try again in a minute.");

  const log = await db.jiraSyncLog.create({ data: { trigger } });
  const counts = { added: 0, updated: 0, unchanged: 0 };
  const errors: { key?: string; message: string }[] = [];
  try {
    const client = createJiraClient(cfg, opts);
    const issues = await client.searchAll(settings.jql);
    const mapping = (Array.isArray(settings.productMapping) ? settings.productMapping : []) as ProductMapping;
    const products = new Set((await loadLists()).of("PRODUCT").map((p) => p.id));
    const existing = new Map((await db.customerIssue.findMany({ where: { issueKey: { in: issues.map((i) => i.key.toUpperCase()) } } })).map((i) => [i.issueKey, i]));
    const now = new Date();
    for (const raw of issues) {
      try {
        const owned = jiraOwnedFields(raw, cfg.baseUrl);
        const productId = productFor(raw, mapping);
        const affectedVersion = raw.fields.versions?.[0]?.name ?? null;
        const data = { ...owned, createdDate: toDate(owned.createdDate)!, resolvedDate: toDate(owned.resolvedDate) ?? null, releasedInDate: toDate(owned.releasedInDate) ?? null };
        const current = existing.get(owned.issueKey);
        if (!current) {
          await db.customerIssue.create({ data: { ...data, source: "JIRA", lastSyncedAt: now, productId: productId && products.has(productId) ? productId : null, releasedIn: affectedVersion, regressionRequired: true } });
          counts.added++;
          continue;
        }
        const fill = {
          ...(!current.productId && productId && products.has(productId) ? { productId } : {}),
          ...(!current.releasedIn && affectedVersion ? { releasedIn: affectedVersion } : {}),
        };
        const changed = jiraFieldsChanged(current as unknown as Record<string, unknown>, owned) || current.source !== "JIRA" || Object.keys(fill).length > 0;
        await db.customerIssue.update({ where: { id: current.id }, data: changed ? { ...data, ...fill, source: "JIRA", lastSyncedAt: now } : { lastSyncedAt: now } });
        if (changed) counts.updated++;
        else counts.unchanged++;
      } catch (e) {
        errors.push({ key: raw.key, message: e instanceof Error ? e.message.slice(0, 300) : "Couldn't save this issue." });
      }
    }
  } catch (e) {
    errors.push({ message: e instanceof JiraError ? e.message : "The sync failed unexpectedly." });
  }
  return db.jiraSyncLog.update({ where: { id: log.id }, data: { ...counts, finishedAt: new Date(), errors: errors.length ? errors : undefined } });
}

/**
 * After an RCA is completed: posts the RCA summary as a Jira comment when write-back is on, the
 * issue came from Jira, and the same RCA wasn't posted before. Never throws (returns a note).
 */
export async function writeBackRca(issueId: string, hubUrl: string): Promise<string | null> {
  const cfg = jiraConfig();
  const settings = await db.jiraSettings.findUnique({ where: { id: "default" } });
  if (!cfg || !settings?.writeBackEnabled) return null;
  const issue = await db.customerIssue.findUnique({ where: { id: issueId }, include: { _count: { select: { cases: { where: { retired: false } } } } } });
  if (!issue || issue.source !== "JIRA" || !issue.rcaComplete) return null;
  const lists = await loadLists();
  const text = rcaComment({
    category: lists.name(issue.rcaCategoryId),
    subcategory: lists.name(issue.rcaSubcategoryId),
    stage: lists.name(issue.caughtAtId),
    catchable: issue.catchable ? CATCHABLE_LABELS[issue.catchable] : null,
    cases: issue._count.cases,
    link: `${hubUrl}/customer-issues/${issue.id}`,
  });
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 32);
  if (issue.writeBackHash === hash) return null;
  try {
    await createJiraClient(cfg).addComment(issue.issueKey, text);
    await db.customerIssue.update({ where: { id: issue.id }, data: { writeBackHash: hash } });
    return "RCA posted to Jira as a comment.";
  } catch (e) {
    return `Couldn't post the RCA to Jira: ${e instanceof JiraError ? e.message : "request failed"}`;
  }
}
