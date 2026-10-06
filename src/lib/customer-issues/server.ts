import "server-only";

import type { CustomerIssue, ListItem, Prisma, RegressionCase } from "@prisma/client";

import { db } from "@/lib/db";

import { completeness, daysToDetect, daysToResolve, Lists, needsRca, type Classification, type ListItemDto } from "./model";

export const listDto = (i: ListItem): ListItemDto => ({
  id: i.id,
  list: i.list,
  key: i.key,
  name: i.name,
  description: i.description,
  parentId: i.parentId,
  defaultCatchable: i.defaultCatchable,
  defaultOwnerId: i.defaultOwnerId,
  sortOrder: i.sortOrder,
  active: i.active,
});

export async function loadLists(): Promise<Lists> {
  const items = await db.listItem.findMany({ orderBy: [{ list: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
  return new Lists(items.map(listDto));
}

/** Issue columns that point at a list item, for "is this item in use?" checks. */
export const LIST_REF_FIELDS = ["productId", "dispositionId", "rcaCategoryId", "rcaSubcategoryId", "caughtAtId", "whyEscapedId", "detectedById", "scopeId", "impactId", "ownerTeamId"] as const;

export async function listItemUsage(id: string) {
  const issues = await db.customerIssue.count({ where: { OR: LIST_REF_FIELDS.map((f) => ({ [f]: id })) } });
  const children = await db.listItem.count({ where: { parentId: id } });
  const cases = await db.regressionCase.count({ where: { productId: id } });
  return { issues, children, cases };
}

// ---------------------------------------------------------------- issues

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export const classificationOf = (i: CustomerIssue): Classification => ({
  productId: i.productId,
  module: i.module,
  releasedIn: i.releasedIn,
  severity: i.severity,
  dispositionId: i.dispositionId,
  dispositionNote: i.dispositionNote,
  linkedIssueKey: i.linkedIssueKey,
  rcaCategoryId: i.rcaCategoryId,
  rcaSubcategoryId: i.rcaSubcategoryId,
  caughtAtId: i.caughtAtId,
  catchable: i.catchable,
  whyEscapedId: i.whyEscapedId,
  detectedById: i.detectedById,
  scopeId: i.scopeId,
  impactId: i.impactId,
  recurring: i.recurring,
  ownerTeamId: i.ownerTeamId,
  rca: i.rca,
  prevention: i.prevention,
  preventionStatus: i.preventionStatus,
  qaOwner: i.qaOwner,
  comments: i.comments,
  regressionRequired: i.regressionRequired,
});

/** Release dates by version from Release Readiness (fallback for "days to detect"). */
export async function releaseDatesByVersion(): Promise<Map<string, Date>> {
  const releases = await db.release.findMany({ where: { version: { not: null }, releasedAt: { not: null } }, select: { version: true, releasedAt: true } });
  return new Map(releases.map((r) => [r.version!.trim().toLowerCase(), r.releasedAt!]));
}

export type IssueDto = ReturnType<typeof issueDto>;

export function issueDto(i: CustomerIssue & { _count?: { cases: number } }, lists: Lists, releaseDates: Map<string, Date>, extra: { lastRunResult?: string | null } = {}) {
  const c = classificationOf(i);
  const releasedOn = i.releasedInDate ?? (i.releasedIn ? (releaseDates.get(i.releasedIn.trim().toLowerCase()) ?? null) : null);
  const comp = completeness(c, lists);
  return {
    id: i.id,
    issueKey: i.issueKey,
    issueUrl: i.issueUrl,
    source: i.source,
    lastSyncedAt: i.lastSyncedAt?.toISOString() ?? null,
    summary: i.summary,
    description: i.description,
    status: i.status,
    createdDate: iso(i.createdDate)!,
    resolvedDate: iso(i.resolvedDate),
    fixVersion: i.fixVersion,
    releasedInDate: iso(releasedOn),
    priority: i.priority,
    reporter: i.reporter,
    assignee: i.assignee,
    components: i.components,
    labels: i.labels,
    ...c,
    rcaComplete: i.rcaComplete,
    rcaCompletedAt: i.rcaCompletedAt?.toISOString() ?? null,
    tcLibraryEntryId: i.tcLibraryEntryId,
    daysToResolve: daysToResolve(i.createdDate, i.resolvedDate),
    daysToDetect: daysToDetect(i.createdDate, releasedOn),
    completeness: { done: comp.done, total: comp.total, missing: comp.missing, errors: comp.errors, canComplete: comp.canComplete },
    needsRca: needsRca(c, i.rcaComplete, lists),
    caseCount: i._count?.cases ?? 0,
    lastRunResult: extra.lastRunResult ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

/** Latest run result per issue (from the most recent run that included one of its cases). */
export async function lastRunResults(issueIds: string[]): Promise<Map<string, string>> {
  if (!issueIds.length) return new Map();
  const cases = await db.regressionCase.findMany({ where: { issueId: { in: issueIds } }, select: { id: true, issueId: true } });
  if (!cases.length) return new Map();
  const results = await db.regressionRunResult.findMany({
    where: { regressionCaseId: { in: cases.map((c) => c.id) } },
    select: { regressionCaseId: true, result: true, run: { select: { createdAt: true } } },
    orderBy: { run: { createdAt: "desc" } },
  });
  const issueOf = new Map(cases.map((c) => [c.id, c.issueId]));
  const latestRun = new Map<string, number>();
  const out = new Map<string, string>();
  // Worst result in the latest run per issue: FAIL > BLOCKED > PENDING > NA > PASS.
  const rank: Record<string, number> = { FAIL: 4, BLOCKED: 3, PENDING: 2, NA: 1, PASS: 0 };
  for (const r of results) {
    const issueId = issueOf.get(r.regressionCaseId!)!;
    const t = r.run.createdAt.getTime();
    const seen = latestRun.get(issueId);
    if (seen !== undefined && seen !== t) continue;
    latestRun.set(issueId, t);
    const prev = out.get(issueId);
    if (prev === undefined || rank[r.result] > rank[prev]) out.set(issueId, r.result);
  }
  return out;
}

/** Converts YYYY-MM-DD fields to Dates for Prisma. */
export const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(`${v}T00:00:00.000Z`));

export type IssueWrite = Prisma.CustomerIssueUncheckedUpdateInput;

const REF_LIST: Record<string, ListItemDto["list"]> = {
  productId: "PRODUCT",
  dispositionId: "DISPOSITION",
  rcaCategoryId: "RCA_CATEGORY",
  rcaSubcategoryId: "RCA_SUBCATEGORY",
  caughtAtId: "CAUGHT_AT",
  whyEscapedId: "WHY_ESCAPED",
  detectedById: "DETECTED_BY",
  scopeId: "SCOPE",
  impactId: "IMPACT",
  ownerTeamId: "OWNER_TEAM",
};

/** Every list reference must point at an item of the right list (null clears it). */
export function badReference(data: Record<string, unknown>, lists: Lists): string | null {
  for (const [field, list] of Object.entries(REF_LIST)) {
    const v = data[field];
    if (v === undefined || v === null) continue;
    const item = lists.get(String(v));
    if (!item || item.list !== list) return `Unknown ${field.replace(/Id$/, "").replace(/([A-Z])/g, " $1").toLowerCase()} — reload the page and pick it again.`;
  }
  return null;
}

export const caseDto = (c: RegressionCase) => ({
  id: c.id,
  issueId: c.issueId,
  caseId: c.caseId,
  title: c.title,
  category: c.category,
  type: c.type,
  priority: c.priority,
  preconditions: c.preconditions,
  steps: c.steps,
  testData: c.testData,
  expectedResult: c.expectedResult,
  productId: c.productId,
  module: c.module,
  mandatory: c.mandatory,
  automated: c.automated,
  automationRef: c.automationRef,
  retired: c.retired,
  retiredReason: c.retiredReason,
  sortOrder: c.sortOrder,
  updatedAt: c.updatedAt.toISOString(),
});
export type CaseDto = ReturnType<typeof caseDto>;
