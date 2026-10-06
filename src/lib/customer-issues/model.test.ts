import { describe, expect, it } from "vitest";

import { DEFAULT_LISTS, KEYS } from "@/config/customer-issues";

import { applyCategory, applyDisposition, completeness, daysToDetect, daysToResolve, EMPTY_CLASSIFICATION, Lists, needsRca, validateClassification, type Classification, type ListItemDto } from "./model";

const lists = new Lists(DEFAULT_LISTS.map((i): ListItemDto => ({ key: null, description: null, parentId: null, defaultCatchable: null, defaultOwnerId: null, active: true, ...i })));
const id = (list: ListItemDto["list"], name: string) => lists.items.find((i) => i.list === list && i.name === name)!.id;
const VALID = id("DISPOSITION", "Valid Bug");
const DUP = id("DISPOSITION", "Duplicate");
const CODE = id("RCA_CATEGORY", "Code Defect");
const INFRA = id("RCA_CATEGORY", "Infra / Deployment");
const OTHERS = id("RCA_CATEGORY", "Others");

describe("default lists", () => {
  it("cover every category from the spec with sub-categories, defaults and stable keys", () => {
    expect(lists.of("RCA_CATEGORY").map((c) => c.name)).toEqual(["QA Miss", "QA Skip", "Code Defect", "Code Sync / Release", "Config / Data", "Infra / Deployment", "Integration / Third-party", "Requirement Gap", "Design / UX", "Security", "Others"]);
    expect(lists.of("DISPOSITION")).toHaveLength(6);
    expect(lists.of("CAUGHT_AT")).toHaveLength(9);
    expect(lists.of("PRODUCT")).toHaveLength(0);
    expect(lists.byKey("DETECTED_BY", KEYS.CUSTOMER)?.name).toBe("Customer");
    expect(new Set(DEFAULT_LISTS.map((i) => i.id)).size).toBe(DEFAULT_LISTS.length);
  });
});

describe("dependent dropdown", () => {
  it("shows only the selected category's sub-categories (and none without a category)", () => {
    expect(lists.subcategories(CODE).map((s) => s.name)).toEqual(["Logic error", "Missing null/validation check", "Error handling missing", "Performance/timeout in code", "Concurrency/race condition", "Backward-compatibility break"]);
    expect(lists.subcategories(null)).toEqual([]);
    expect(lists.subcategories(OTHERS)).toEqual([]);
  });

  it("hides inactive items unless the issue already uses them", () => {
    const sub = lists.subcategories(CODE)[0];
    const l = new Lists(lists.items.map((i) => (i.id === sub.id ? { ...i, active: false } : i)));
    expect(l.subcategories(CODE).map((s) => s.id)).not.toContain(sub.id);
    expect(l.subcategories(CODE, sub.id).map((s) => s.id)).toContain(sub.id);
  });
});

describe("category defaults", () => {
  it("pre-fill Catchable and Owner team, and clear a sub-category from another category", () => {
    const sub = lists.subcategories(CODE)[1].id;
    let c: Classification = applyCategory(EMPTY_CLASSIFICATION, CODE, lists);
    expect(c.catchable).toBe("YES");
    expect(lists.name(c.ownerTeamId)).toBe("Dev");
    c = { ...c, rcaSubcategoryId: sub, catchable: "PARTIAL" };
    c = applyCategory(c, INFRA, lists);
    expect(c.rcaSubcategoryId).toBeNull();
    expect(c.catchable).toBe("NO");
    expect(lists.name(c.ownerTeamId)).toBe("DevOps");
    expect(applyCategory(c, OTHERS, lists)).toMatchObject({ catchable: null, ownerTeamId: null });
  });

  it("Regression required defaults to Yes only for a Valid Bug", () => {
    expect(applyDisposition(EMPTY_CLASSIFICATION, VALID, lists).regressionRequired).toBe(true);
    expect(applyDisposition(EMPTY_CLASSIFICATION, DUP, lists).regressionRequired).toBe(false);
  });
});

describe("validation rules", () => {
  const fields = (c: Partial<Classification>) => validateClassification({ ...EMPTY_CLASSIFICATION, ...c }, lists).map((e) => e.field);

  it("Duplicate, Known Issue and Recurring need a linked issue key in KEY-123 form", () => {
    expect(fields({ dispositionId: DUP })).toContain("linkedIssueKey");
    expect(fields({ dispositionId: id("DISPOSITION", "Known Issue") })).toContain("linkedIssueKey");
    expect(fields({ dispositionId: VALID, recurring: true })).toContain("linkedIssueKey");
    expect(fields({ dispositionId: DUP, linkedIssueKey: "not a key" })).toContain("linkedIssueKey");
    expect(fields({ dispositionId: DUP, linkedIssueKey: "DEMO-101" })).not.toContain("linkedIssueKey");
  });

  it("Others needs a comment; catchable Yes / Partially needs why it escaped", () => {
    expect(fields({ rcaCategoryId: OTHERS })).toContain("comments");
    expect(fields({ rcaCategoryId: OTHERS, comments: "Unique one-off" })).not.toContain("comments");
    expect(fields({ catchable: "YES" })).toContain("whyEscapedId");
    expect(fields({ catchable: "PARTIAL" })).toContain("whyEscapedId");
    expect(fields({ catchable: "NO" })).not.toContain("whyEscapedId");
  });

  it("rejects a sub-category from another category", () => {
    expect(fields({ rcaCategoryId: INFRA, rcaSubcategoryId: lists.subcategories(CODE)[0].id })).toContain("rcaSubcategoryId");
  });
});

describe("RCA completeness and Needs RCA", () => {
  it("a Valid Bug needs category, sub-category, stage, catchable, why, detected by, severity and RCA", () => {
    let c: Classification = { ...EMPTY_CLASSIFICATION, dispositionId: VALID };
    expect(completeness(c, lists)).toMatchObject({ done: 1, total: 9, canComplete: false });
    c = applyCategory(c, CODE, lists);
    c = { ...c, rcaSubcategoryId: lists.subcategories(CODE)[1].id, caughtAtId: id("CAUGHT_AT", "Code review / unit tests"), detectedById: id("DETECTED_BY", "Customer"), severity: "P2 - High", rca: "Null partner status shown as rejected." };
    expect(completeness(c, lists)).toMatchObject({ done: 8, total: 9, missing: ["Why it escaped"], canComplete: false });
    c = { ...c, whyEscapedId: id("WHY_ESCAPED", "Missing test case") };
    expect(completeness(c, lists)).toMatchObject({ done: 9, total: 9, canComplete: true });
  });

  it("other dispositions need only their link or note", () => {
    expect(completeness({ ...EMPTY_CLASSIFICATION, dispositionId: DUP, linkedIssueKey: "DEMO-101" }, lists)).toMatchObject({ done: 2, total: 2, canComplete: true });
    expect(completeness({ ...EMPTY_CLASSIFICATION, dispositionId: id("DISPOSITION", "Can't Reproduce") }, lists)).toMatchObject({ done: 1, total: 2, missing: ["Note"] });
    expect(completeness(EMPTY_CLASSIFICATION, lists)).toMatchObject({ done: 0, total: 1 });
  });

  it("Needs RCA = no disposition, or a Valid Bug not yet complete", () => {
    expect(needsRca(EMPTY_CLASSIFICATION, false, lists)).toBe(true);
    expect(needsRca({ dispositionId: VALID }, false, lists)).toBe(true);
    expect(needsRca({ dispositionId: VALID }, true, lists)).toBe(false);
    expect(needsRca({ dispositionId: DUP }, false, lists)).toBe(false);
  });
});

describe("computed days", () => {
  it("days to resolve and days to detect", () => {
    expect(daysToResolve("2026-09-01", "2026-09-04")).toBe(3);
    expect(daysToResolve("2026-09-01", null)).toBeNull();
    expect(daysToDetect("2026-09-20", "2026-09-01")).toBe(19);
    expect(daysToDetect("2026-09-20", null)).toBeNull();
  });
});
