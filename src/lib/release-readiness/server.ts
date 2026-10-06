import "server-only";

import type { Prisma, Release, ReleaseGate, ReleaseSignoff } from "@prisma/client";

import { GitHubError, githubConnected, listRuns } from "@/lib/ci/github";
import { db } from "@/lib/db";
import {
  autoResultFor,
  DEFAULT_CONFIG,
  effectiveStatus,
  scoreRelease,
  type AutoData,
  type AutoResult,
  type GateLike,
  type Override,
  type RegressionRunLite,
  type SuiteRun,
} from "@/lib/readiness";
import type { TemplateSection } from "@/config/release-templates";

export const fromIsoDate = (v: string) => new Date(`${v}T00:00:00Z`);
export const toIsoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export const DEFAULT_SIGNOFF_ROLES = ["QA", "Dev lead", "Product"];

export function gateLike(g: ReleaseGate): GateLike {
  return {
    id: g.id,
    section: g.section,
    title: g.title,
    type: g.type,
    status: g.status,
    isBlocker: g.isBlocker,
    weight: g.weight,
    override: (g.override as Override | null) ?? null,
    autoResult: (g.autoResult as AutoResult | null) ?? null,
    config: (g.config as Record<string, number> | null) ?? null,
  };
}

export function gateDto(g: ReleaseGate) {
  return { ...gateLike(g), owner: g.owner, evidenceUrl: g.evidenceUrl, note: g.note, sortOrder: g.sortOrder, updatedBy: g.updatedBy, updatedAt: g.updatedAt, effective: effectiveStatus(gateLike(g)) };
}

export function signoffDto(s: ReleaseSignoff) {
  return { id: s.id, role: s.role, name: s.name, decision: s.decision, comment: s.comment, signedAt: s.signedAt };
}

/** List row: release fields plus computed score, counts and blockers. */
export function releaseSummaryDto(r: Release & { gates: ReleaseGate[] }) {
  const s = scoreRelease(r.gates.map(gateLike));
  return {
    id: r.id,
    name: r.name,
    version: r.version,
    targetDate: toIsoDate(r.targetDate),
    releasedAt: toIsoDate(r.releasedAt),
    owner: r.owner,
    status: r.status,
    createdAt: r.createdAt,
    score: s.score,
    verdict: s.verdict,
    passed: s.counts.PASS,
    applicable: s.total - s.counts.NA,
    total: s.total,
    blockers: s.blockers.length,
  };
}

export async function writeEvent(releaseId: string, type: string, detail: Prisma.InputJsonValue, actor?: string | null, tx: Prisma.TransactionClient = db) {
  await tx.releaseEvent.create({ data: { releaseId, type, detail, actor: actor?.trim() || "Anonymous" } });
}

/** Gate rows for a new release from template sections. */
export function gatesFromTemplate(sections: TemplateSection[]): Prisma.ReleaseGateCreateWithoutReleaseInput[] {
  let order = 0;
  return sections.flatMap((s) =>
    s.gates.map((g) => ({
      section: s.name,
      title: g.title,
      type: g.type,
      isBlocker: g.isBlocker,
      weight: g.weight,
      config: g.config ?? DEFAULT_CONFIG[g.type] ?? undefined,
      sortOrder: order++,
    })),
  );
}

/** Gathers the hub data the auto gates need. Never throws for an unavailable source. */
export async function loadAutoData(release: Release, gates: ReleaseGate[]): Promise<AutoData> {
  const needs = new Set(gates.map((g) => g.type));
  const needsIssues = needs.has("NO_P0") || needs.has("NO_P1") || needs.has("VALID_RATE");
  const flagDays = Math.max(14, ...gates.filter((g) => g.type === "NO_P0_FLAGS").map((g) => Number((g.config as { days?: number } | null)?.days ?? 14)));

  const [issues, flags, runs] = await Promise.all([
    needsIssues && release.linkedFeaturePageIds.length
      ? db.issue.findMany({ where: { featurePageId: { in: release.linkedFeaturePageIds } }, select: { severity: true, status: true, isValid: true } })
      : Promise.resolve([]),
    needs.has("NO_P0_FLAGS") && release.linkedRepos.length
      ? db.flag.findMany({
          where: { repo: { in: release.linkedRepos }, severity: "P0", date: { gte: new Date(Date.now() - flagDays * 86_400_000) } },
          select: { severity: true, date: true, repo: true },
        })
      : Promise.resolve([]),
    needs.has("CI_GREEN") && githubConnected() && release.linkedCiSuiteIds.length ? latestRuns(release.linkedCiSuiteIds) : Promise.resolve([] as SuiteRun[]),
  ]);
  const existingFeatures = release.linkedFeaturePageIds.length ? await db.featurePage.count({ where: { id: { in: release.linkedFeaturePageIds } } }) : 0;
  const regressionRun = needs.has("CUSTOMER_REGRESSION") ? await latestRegressionRun(release.id) : null;
  return {
    issues,
    regressionRun,
    linkedFeatures: existingFeatures,
    flags,
    linkedRepos: release.linkedRepos,
    ci: { connected: githubConnected(), linked: release.linkedCiSuiteIds.length, runs },
  };
}

/** Latest Customer Issue regression run linked to the release, with its result counts. */
async function latestRegressionRun(releaseId: string): Promise<RegressionRunLite | null> {
  const run = await db.regressionRun.findFirst({ where: { releaseId }, orderBy: { createdAt: "desc" }, include: { results: { select: { result: true } } } });
  if (!run) return null;
  const count = (r: string) => run.results.filter((x) => x.result === r).length;
  return { id: run.id, name: run.name, status: run.status, total: run.results.length, executed: run.results.length - count("PENDING"), failed: count("FAIL"), blocked: count("BLOCKED") };
}

async function latestRuns(suiteIds: string[]): Promise<SuiteRun[]> {
  const suites = await db.ciSuite.findMany({ where: { id: { in: suiteIds } } });
  const missing = suiteIds.length - suites.length;
  const results = await Promise.all(
    suites.map(async (s): Promise<SuiteRun> => {
      try {
        const { runs } = await listRuns(s.repo, s.workflowFile, 1, 20);
        const done = runs.find((r) => r.status === "completed");
        return { suiteName: s.name, conclusion: done ? (done.conclusion ?? "unknown") : null };
      } catch (e) {
        return { suiteName: s.name, error: e instanceof GitHubError ? e.message : "GitHub request failed" };
      }
    }),
  );
  if (missing) results.push({ suiteName: `${missing} deleted suite${missing === 1 ? "" : "s"}`, error: "suite no longer exists" });
  return results;
}

/** Recomputes auto gates; logs a ReleaseEvent for every gate whose result changed. */
export async function refreshAutoGates(releaseId: string, actor?: string | null) {
  const release = await db.release.findUnique({ where: { id: releaseId }, include: { gates: true } });
  if (!release) return null;
  const autoGates = release.gates.filter((g) => g.type !== "MANUAL");
  if (!autoGates.length) return release;
  const data = await loadAutoData(release, autoGates);
  const checkedAt = new Date().toISOString();
  for (const g of autoGates) {
    const next = autoResultFor(gateLike(g), data);
    if (!next) continue;
    const prev = g.autoResult as AutoResult | null;
    await db.releaseGate.update({ where: { id: g.id }, data: { autoResult: { ...next, checkedAt } } });
    if (prev?.status !== next.status || prev?.detail !== next.detail) {
      await writeEvent(releaseId, "AUTO_CHECK", { gate: g.title, from: prev?.status ?? null, to: next.status, detail: next.detail }, actor ?? "Auto check");
    }
  }
  return db.release.findUnique({ where: { id: releaseId }, include: { gates: true } });
}

export async function releaseDetail(id: string) {
  const r = await db.release.findUnique({
    where: { id },
    include: {
      gates: { orderBy: [{ sortOrder: "asc" }, { updatedAt: "asc" }] },
      signoffs: { orderBy: [{ sortOrder: "asc" }] },
      decisions: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });
  if (!r) return null;
  const [suites, features] = await Promise.all([
    r.linkedCiSuiteIds.length ? db.ciSuite.findMany({ where: { id: { in: r.linkedCiSuiteIds } }, select: { id: true, name: true } }) : [],
    r.linkedFeaturePageIds.length ? db.featurePage.findMany({ where: { id: { in: r.linkedFeaturePageIds } }, select: { id: true, name: true } }) : [],
  ]);
  return {
    id: r.id,
    name: r.name,
    version: r.version,
    targetDate: toIsoDate(r.targetDate),
    releasedAt: toIsoDate(r.releasedAt),
    owner: r.owner,
    description: r.description,
    status: r.status,
    linkedCiSuiteIds: r.linkedCiSuiteIds,
    linkedFeaturePageIds: r.linkedFeaturePageIds,
    linkedRepos: r.linkedRepos,
    linked: { suites, features },
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    gates: r.gates.map(gateDto),
    signoffs: r.signoffs.map(signoffDto),
    decisions: r.decisions,
    events: r.events,
    githubConnected: githubConnected(),
  };
}
