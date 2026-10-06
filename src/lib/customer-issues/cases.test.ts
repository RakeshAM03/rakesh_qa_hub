import { describe, expect, it } from "vitest";

import { DEFAULT_LISTS } from "@/config/customer-issues";

import { caseIdFor, checklistCases, coreCases, nextCaseNumber, requirementText, tcInputFor, tcLibraryMarkdown, variantsFor, type IssueForCases } from "./cases";
import { Lists, type ListItemDto } from "./model";

const lists = new Lists(DEFAULT_LISTS.map((i): ListItemDto => ({ key: null, description: null, parentId: null, defaultCatchable: null, defaultOwnerId: null, active: true, ...i })));
const id = (name: string) => lists.items.find((i) => i.name === name)!.id;

const issue: IssueForCases = {
  issueKey: "DEMO-103",
  summary: "Partner sync shows false 'rejected' status",
  description: "Sample: the partner sent an empty status.\n1. Open Partner sync\n2. Run a sync for a pending application",
  module: "Partner sync",
  rca: "An empty status from the partner was treated as 'rejected'. Empty now means pending.",
  prevention: "Unit tests for empty / null partner responses.",
  severity: "P2 - High",
  rcaCategoryId: id("Code Defect"),
  rcaSubcategoryId: id("Missing null/validation check"),
};

describe("IDs", () => {
  it("TC_CI_<issue-key>_<NN>, continuing after existing cases", () => {
    expect(caseIdFor("demo-103", 1)).toBe("TC_CI_DEMO-103_01");
    expect(nextCaseNumber("DEMO-103", [])).toBe(1);
    expect(nextCaseNumber("DEMO-103", ["TC_CI_DEMO-103_01", "TC_CI_DEMO-103_07", "TC_CI_DEMO-1_09"])).toBe(8);
  });
});

describe("requirement text for the Test Case Generator engine", () => {
  it("is built from summary + description + RCA + sub-category + prevention, with the coverage instructions", () => {
    const t = requirementText(issue, lists);
    for (const part of ["Customer issue DEMO-103: Partner sync shows false 'rejected' status", "the partner sent an empty status", "Root cause and fix (RCA):", "RCA category: Code Defect → Missing null/validation check", "Prevention action:", "The exact failure scenario", "Variants of the same root cause (Missing null/validation check): an empty response", "Closely related flows in Partner sync"]) {
      expect(t).toContain(part);
    }
  });

  it("uses focused types, Quick depth and the module as context", () => {
    const input = tcInputFor(issue, lists);
    expect(input.options.depth).toBe("quick");
    expect(input.context.moduleName).toBe("Partner sync");
    expect(input.types).toContain("regression");
  });
});

describe("root-cause variants", () => {
  it("come from the sub-category, then the main category, then a generic fallback", () => {
    expect(variantsFor(issue, lists)).toEqual(["an empty response or empty field", "a null value", "a partial response with some fields missing", "an unexpected value or type in the field"]);
    expect(variantsFor({ ...issue, rcaCategoryId: id("QA Skip"), rcaSubcategoryId: null }, lists)).toEqual(["the full regression of the impacted area"]);
    expect(variantsFor({ ...issue, rcaCategoryId: null, rcaSubcategoryId: null }, lists)).toHaveLength(2);
  });
});

describe("generated cases", () => {
  it("cover the exact failure (with the reported steps), every variant and related flows, in Standard format", () => {
    const core = coreCases(issue, lists);
    expect(core[0].title).toBe("Verify the customer scenario from DEMO-103 no longer fails: Partner sync shows false 'rejected' status");
    expect(core[0].steps.slice(0, 2)).toEqual(["Open Partner sync", "Run a sync for a pending application"]);
    expect(core[0].expectedResult).toContain("Fixed behaviour: An empty status from the partner was treated as 'rejected'.");
    expect(core[0].priority).toBe("P1");
    expect(core.slice(1, 5).map((c) => c.title)).toEqual([
      "Verify Partner sync handles an empty response or empty field (variant of DEMO-103)",
      "Verify Partner sync handles a null value (variant of DEMO-103)",
      "Verify Partner sync handles a partial response with some fields missing (variant of DEMO-103)",
      "Verify Partner sync handles an unexpected value or type in the field (variant of DEMO-103)",
    ]);
    expect(core.at(-1)!.title).toMatch(/^Verify related flows in Partner sync/);
    for (const c of core) {
      expect(c.title).toMatch(/^Verify /);
      expect(c.steps.length).toBeGreaterThanOrEqual(3);
      expect(c.expectedResult.split("\n").length).toBeGreaterThanOrEqual(3);
    }
  });

  it("checklist mode adds a few relevant engine cases, without templates or duplicates", () => {
    const all = checklistCases(issue, lists);
    const core = coreCases(issue, lists);
    expect(all.slice(0, core.length)).toEqual(core);
    expect(all.length).toBeGreaterThan(core.length);
    expect(all.length).toBeLessThanOrEqual(core.length + 4);
    expect(new Set(all.map((c) => c.title.toLowerCase())).size).toBe(all.length);
  });
});

describe("TC Library entry", () => {
  it("is a Markdown table with the RCA context; pipes and line breaks are escaped", () => {
    const md = tcLibraryMarkdown(issue, [{ ...coreCases(issue, lists)[0], title: "Verify a | b", caseId: "TC_CI_DEMO-103_01", mandatory: true, automated: "PLANNED" }], lists);
    expect(md).toContain("## DEMO-103 — Partner sync shows false 'rejected' status");
    expect(md).toContain("- RCA: Code Defect → Missing null/validation check");
    expect(md).toContain("| TC_CI_DEMO-103_01 | Verify a \\| b | Functional | Positive | P1 | Yes | PLANNED |");
    expect(md).toContain("1. The application is up and accessible in the test environment<br>2.");
  });
});
