/**
 * Customer Issue RCA — shared types and pure rules: list lookups, dependent dropdowns, category
 * defaults, validation, RCA completeness and computed day counts. No database or network access.
 */

import { KEYS, type CatchableValue, type ListKind } from "@/config/customer-issues";

export type ListItemDto = {
  id: string;
  list: ListKind;
  key: string | null;
  name: string;
  description: string | null;
  parentId: string | null;
  defaultCatchable: CatchableValue | null;
  defaultOwnerId: string | null;
  sortOrder: number;
  active: boolean;
};

export type IssueStatus = "OPEN" | "IN_PROGRESS" | "FIXED" | "CLOSED";
export type PreventionStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

/** The hub-owned classification fields (never touched by Jira sync). */
export type Classification = {
  productId: string | null;
  module: string | null;
  releasedIn: string | null;
  severity: string | null;
  dispositionId: string | null;
  dispositionNote: string | null;
  linkedIssueKey: string | null;
  rcaCategoryId: string | null;
  rcaSubcategoryId: string | null;
  caughtAtId: string | null;
  catchable: CatchableValue | null;
  whyEscapedId: string | null;
  detectedById: string | null;
  scopeId: string | null;
  impactId: string | null;
  recurring: boolean;
  ownerTeamId: string | null;
  rca: string | null;
  prevention: string | null;
  preventionStatus: PreventionStatus;
  qaOwner: string | null;
  comments: string | null;
  regressionRequired: boolean;
};

export const HUB_OWNED_FIELDS = [
  "productId",
  "module",
  "releasedIn",
  "severity",
  "dispositionId",
  "dispositionNote",
  "linkedIssueKey",
  "rcaCategoryId",
  "rcaSubcategoryId",
  "caughtAtId",
  "catchable",
  "whyEscapedId",
  "detectedById",
  "scopeId",
  "impactId",
  "recurring",
  "ownerTeamId",
  "rca",
  "prevention",
  "preventionStatus",
  "qaOwner",
  "comments",
  "regressionRequired",
  "rcaComplete",
  "rcaCompletedAt",
  "writeBackHash",
  "tcLibraryEntryId",
] as const;

export const EMPTY_CLASSIFICATION: Classification = {
  productId: null,
  module: null,
  releasedIn: null,
  severity: null,
  dispositionId: null,
  dispositionNote: null,
  linkedIssueKey: null,
  rcaCategoryId: null,
  rcaSubcategoryId: null,
  caughtAtId: null,
  catchable: null,
  whyEscapedId: null,
  detectedById: null,
  scopeId: null,
  impactId: null,
  recurring: false,
  ownerTeamId: null,
  rca: null,
  prevention: null,
  preventionStatus: "NOT_STARTED",
  qaOwner: null,
  comments: null,
  regressionRequired: true,
};

// ---------------------------------------------------------------- lists

export class Lists {
  private byId: Map<string, ListItemDto>;
  constructor(public items: ListItemDto[]) {
    this.byId = new Map(items.map((i) => [i.id, i]));
  }
  get(id: string | null | undefined) {
    return id ? (this.byId.get(id) ?? null) : null;
  }
  name(id: string | null | undefined) {
    return this.get(id)?.name ?? null;
  }
  key(id: string | null | undefined) {
    return this.get(id)?.key ?? null;
  }
  /** Items of a list in order; inactive ones only when `keep` (e.g. the issue's current value). */
  of(list: ListKind, keep?: string | null) {
    return this.items.filter((i) => i.list === list && (i.active || i.id === keep)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  /** Sub-categories of the selected main category (dependent dropdown). */
  subcategories(categoryId: string | null | undefined, keep?: string | null) {
    if (!categoryId) return [];
    return this.of("RCA_SUBCATEGORY", keep).filter((s) => s.parentId === categoryId);
  }
  byKey(list: ListKind, key: string) {
    return this.items.find((i) => i.list === list && i.key === key) ?? null;
  }
}

/**
 * Picking a main category: clears a sub-category from another category and pre-fills Catchable and
 * Owner team from the category's defaults (the user can change them afterwards).
 */
export function applyCategory(c: Classification, categoryId: string | null, lists: Lists): Classification {
  const cat = lists.get(categoryId);
  const sub = lists.get(c.rcaSubcategoryId);
  return {
    ...c,
    rcaCategoryId: categoryId,
    rcaSubcategoryId: sub && sub.parentId === categoryId ? sub.id : null,
    catchable: cat?.defaultCatchable ?? (cat ? null : c.catchable),
    ownerTeamId: cat?.defaultOwnerId ?? (cat ? null : c.ownerTeamId),
  };
}

/** Picking a disposition: Regression required defaults to Yes for a Valid Bug, No otherwise. */
export function applyDisposition(c: Classification, dispositionId: string | null, lists: Lists): Classification {
  return { ...c, dispositionId, regressionRequired: lists.key(dispositionId) === KEYS.VALID_BUG };
}

// ---------------------------------------------------------------- validation & completeness

export type FieldError = { field: keyof Classification; message: string };

const blank = (v: string | null | undefined) => !v || !v.trim();
const ISSUE_KEY = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

/** Rules that apply to any save (link keys, Others comment, why-escaped). */
export function validateClassification(c: Classification, lists: Lists): FieldError[] {
  const errors: FieldError[] = [];
  const disp = lists.key(c.dispositionId);
  if ((disp === KEYS.DUPLICATE || disp === KEYS.KNOWN_ISSUE || c.recurring) && blank(c.linkedIssueKey)) {
    errors.push({ field: "linkedIssueKey", message: c.recurring && disp !== KEYS.DUPLICATE && disp !== KEYS.KNOWN_ISSUE ? "Recurring issues need the previous issue key." : "Link the issue key this one duplicates / is known as." });
  } else if (!blank(c.linkedIssueKey) && !ISSUE_KEY.test(c.linkedIssueKey!.trim())) {
    errors.push({ field: "linkedIssueKey", message: "Use an issue key like DEMO-101." });
  }
  if (lists.key(c.rcaCategoryId) === KEYS.OTHERS && blank(c.comments)) errors.push({ field: "comments", message: "Explain in Comments why no RCA category fits." });
  if ((c.catchable === "YES" || c.catchable === "PARTIAL") && !c.whyEscapedId) errors.push({ field: "whyEscapedId", message: "Say why it escaped (required when it was catchable)." });
  const sub = lists.get(c.rcaSubcategoryId);
  if (sub && sub.parentId !== c.rcaCategoryId) errors.push({ field: "rcaSubcategoryId", message: "That sub-category belongs to another category." });
  return errors;
}

/** The fields an RCA needs, in the order they're shown ("7/9 fields"). */
export function rcaChecklist(c: Classification, lists: Lists): { field: keyof Classification; label: string; done: boolean }[] {
  const disp = lists.key(c.dispositionId);
  const items: { field: keyof Classification; label: string; done: boolean }[] = [{ field: "dispositionId", label: "Disposition", done: !!c.dispositionId }];
  if (disp === KEYS.VALID_BUG) {
    const hasSubs = lists.subcategories(c.rcaCategoryId, c.rcaSubcategoryId).length > 0;
    items.push(
      { field: "rcaCategoryId", label: "RCA category", done: !!c.rcaCategoryId },
      { field: "rcaSubcategoryId", label: "Sub-category", done: !!c.rcaSubcategoryId || (!!c.rcaCategoryId && !hasSubs) },
      { field: "caughtAtId", label: "Should have been caught at", done: !!c.caughtAtId },
      { field: "catchable", label: "Catchable by QA?", done: !!c.catchable },
      { field: "whyEscapedId", label: "Why it escaped", done: c.catchable === "NO" ? true : !!c.whyEscapedId },
      { field: "detectedById", label: "Detected by", done: !!c.detectedById },
      { field: "severity", label: "Severity", done: !blank(c.severity) },
      { field: "rca", label: "RCA", done: !blank(c.rca) },
    );
  } else if (disp === KEYS.DUPLICATE || disp === KEYS.KNOWN_ISSUE) {
    items.push({ field: "linkedIssueKey", label: "Linked issue key", done: !blank(c.linkedIssueKey) });
  } else if (disp) {
    items.push({ field: "dispositionNote", label: "Note", done: !blank(c.dispositionNote) });
  }
  return items;
}

export type Completeness = { done: number; total: number; missing: string[]; errors: FieldError[]; canComplete: boolean };

/** "7/9 fields" plus whether Mark RCA complete is allowed (all fields done, no rule broken). */
export function completeness(c: Classification, lists: Lists): Completeness {
  const items = rcaChecklist(c, lists);
  const errors = validateClassification(c, lists);
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, missing: items.filter((i) => !i.done).map((i) => i.label), errors, canComplete: done === items.length && errors.length === 0 };
}

/** Needs RCA = no disposition yet, or a Valid Bug whose RCA isn't complete. */
export function needsRca(c: Pick<Classification, "dispositionId">, rcaComplete: boolean, lists: Lists) {
  return !c.dispositionId || (lists.key(c.dispositionId) === KEYS.VALID_BUG && !rcaComplete);
}

/** Fields whose change clears "RCA complete" (the RCA must be re-confirmed). */
export const RCA_FIELDS: (keyof Classification)[] = ["dispositionId", "rcaCategoryId", "rcaSubcategoryId", "caughtAtId", "catchable", "whyEscapedId", "detectedById", "severity", "rca", "linkedIssueKey", "dispositionNote", "comments"];

// ---------------------------------------------------------------- days

const DAY = 86_400_000;
const toDay = (d: string | Date) => Math.floor(new Date(d).getTime() / DAY);

/** Resolved − created, in whole days (null until resolved). */
export const daysToResolve = (created: string | Date, resolved: string | Date | null | undefined) => (resolved ? Math.max(0, toDay(resolved) - toDay(created)) : null);

/** Created − release date of the version that introduced it: how long the bug lived in production. */
export const daysToDetect = (created: string | Date, releasedOn: string | Date | null | undefined) => (releasedOn ? Math.max(0, toDay(created) - toDay(releasedOn)) : null);
