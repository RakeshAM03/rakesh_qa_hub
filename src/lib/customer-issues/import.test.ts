import { describe, expect, it } from "vitest";

import { DEFAULT_LISTS } from "@/config/customer-issues";

import { autoMap, buildRows, distinctValues, parseDate, parseSeverity, suggestCategory, TEMPLATE_EXAMPLE, TEMPLATE_HEADERS } from "./import";
import { Lists, type ListItemDto } from "./model";

const lists = new Lists([
  ...DEFAULT_LISTS.map((i): ListItemDto => ({ key: null, description: null, parentId: null, defaultCatchable: null, defaultOwnerId: null, active: true, ...i })),
  { id: "p_a", list: "PRODUCT", key: null, name: "Demo Product A", description: null, parentId: null, defaultCatchable: null, defaultOwnerId: null, sortOrder: 0, active: true },
]);
const cat = (name: string) => lists.of("RCA_CATEGORY").find((c) => c.name === name)!.id;

describe("header auto-matching", () => {
  it("matches common headers, including the old sheet's Type / Catchable? / RCA / Comments", () => {
    expect(autoMap(["Issue key", "Summary", "Status", "Created date", "Catchable?", "Type", "RCA", "Comments", "Something else"])).toEqual({
      "Issue key": "issueKey",
      Summary: "summary",
      Status: "status",
      "Created date": "createdDate",
      "Catchable?": "catchable",
      Type: "category",
      RCA: "rca",
      Comments: "comments",
      "Something else": "",
    });
  });

  it("uses each target once (first header wins) and maps the template's own headers fully", () => {
    expect(autoMap(["Key", "Issue key"])).toEqual({ Key: "issueKey", "Issue key": "" });
    const m = autoMap(TEMPLATE_HEADERS);
    expect(Object.values(m).filter(Boolean)).toHaveLength(TEMPLATE_HEADERS.length);
  });
});

describe("old Type → RCA category mapping", () => {
  it("suggests categories by exact name, then keywords, else Others", () => {
    expect(suggestCategory("Code Defect", lists)).toBe(cat("Code Defect"));
    expect(suggestCategory("QA miss", lists)).toBe(cat("QA Miss"));
    expect(suggestCategory("Hotfix skipped QA", lists)).toBe(cat("QA Skip"));
    expect(suggestCategory("Deployment / cache", lists)).toBe(cat("Infra / Deployment"));
    expect(suggestCategory("Configuration", lists)).toBe(cat("Config / Data"));
    expect(suggestCategory("3rd party", lists)).toBe(cat("Integration / Third-party"));
    expect(suggestCategory("Spec unclear", lists)).toBe(cat("Requirement Gap"));
    expect(suggestCategory("???", lists)).toBe(cat("Others"));
  });

  it("lists the distinct old values for the confirmation step", () => {
    expect(distinctValues([{ Type: "Code" }, { Type: "Infra" }, { Type: "Code" }, { Type: "" }], "Type")).toEqual(["Code", "Infra"]);
  });
});

describe("values", () => {
  it("parses ISO, DD/MM/YYYY, '5 Oct 2026' and Excel dates; rejects impossible dates", () => {
    expect(parseDate("2026-10-05")).toBe("2026-10-05");
    expect(parseDate("05/10/2026")).toBe("2026-10-05");
    expect(parseDate("5-Oct-26")).toBe("2026-10-05");
    expect(parseDate("5 October 2026")).toBe("2026-10-05");
    expect(parseDate(new Date(Date.UTC(2026, 9, 5)))).toBe("2026-10-05");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("soon")).toBeNull();
  });

  it("maps severity words and P-levels", () => {
    expect(parseSeverity("P1")).toBe("P1 - Critical");
    expect(parseSeverity("High")).toBe("P2 - High");
    expect(parseSeverity("minor")).toBe("P4 - Low");
    expect(parseSeverity("")).toBeNull();
    expect(parseSeverity("whenever")).toBeUndefined();
  });
});

describe("buildRows", () => {
  const rows = [
    { Key: "demo-301", Title: "Sample: totals off by one", Status: "Resolved", Created: "01/09/2026", "Catchable?": "Partially", Type: "Code", Product: "Demo Product A", Disposition: "Valid Bug", "Sub-category": "Logic error" },
    { Key: "DEMO-302", Title: "Sample: banner flickers", Status: "Weird", Created: "", "Catchable?": "maybe", Type: "Deploy", Product: "Unknown product", Disposition: "Duplicate" },
    { Key: "nope", Title: "", Status: "", Created: "yesterday" },
    { Key: "", Title: "" },
  ];
  const mapping = autoMap(Object.keys(rows[0]));
  const categoryMap = { Code: cat("Code Defect"), Deploy: cat("Infra / Deployment") };
  const out = buildRows(rows, mapping, categoryMap, lists, { qaOwner: "Demo Reviewer", today: "2026-10-06" });

  it("builds valid rows with mapped categories, sub-categories, lists and defaults", () => {
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({ issueKey: "DEMO-301", status: "FIXED", createdDate: "2026-09-01", catchable: "PARTIAL", rcaCategoryId: cat("Code Defect"), productId: "p_a", qaOwner: "Demo Reviewer", regressionRequired: true });
    expect(lists.name(out.rows[0].rcaSubcategoryId as string)).toBe("Logic error");
    expect(out.rows[1]).toMatchObject({ issueKey: "DEMO-302", createdDate: "2026-10-06", rcaCategoryId: cat("Infra / Deployment"), regressionRequired: false });
    expect(out.rows[1]).not.toHaveProperty("productId");
  });

  it("reports row errors (skipped) and warnings (field left empty); blank lines are ignored", () => {
    expect(out.errors).toEqual([{ row: 4, message: `"NOPE" isn't an issue key like DEMO-101; summary is missing; created date "yesterday" isn't a date` }]);
    expect(out.warnings.map((w) => w.row)).toEqual([3, 3, 3]);
    expect(out.warnings.map((w) => w.message).join(" | ")).toMatch(/status "Weird".*catchable "maybe".*product "Unknown product"/);
  });

  it("the template example row imports cleanly", () => {
    const r = buildRows([Object.fromEntries(TEMPLATE_HEADERS.map((h, i) => [h, TEMPLATE_EXAMPLE[i]]))], autoMap(TEMPLATE_HEADERS), { "Code Defect": cat("Code Defect") }, lists, { today: "2026-10-06" });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.rows[0]).toMatchObject({ issueKey: "DEMO-201", severity: "P2 - High", catchable: "YES", recurring: false });
  });
});
