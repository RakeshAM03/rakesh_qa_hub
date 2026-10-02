import { describe, expect, it } from "vitest";

import { toFlagType } from "./constants";
import { formatLocation, parseLocation } from "./location";
import { parseFlagTable, splitRow } from "./parse-table";
import { buildReviewPrompt } from "./prompt";

const OUTPUT = `I reviewed both PRs. Here is what I found:

| Repo | Flag Type | Location | Detail | Severity | Suggested Fix |
|------|-----------|----------|--------|----------|---------------|
| org/web | **Logic Error** | \`#12 > src/cart.ts:40\` | Discount applied twice when \`qty | 0\` | P0 | Apply once |
| org/api | Missing Error Handling | #7 > api/orders.py:88 | No catch on timeout<br>leaves order pending | P1 — must fix | Add retry |
| org/api | Style | #7 > api/x.py | Unknown type row | P2 | — |

Let me know if you want more detail.

| Other | Table |
|---|---|
| a | b |`;

describe("parseFlagTable", () => {
  it("extracts rows from the first matching table and ignores surrounding text", () => {
    const { flags, found } = parseFlagTable(OUTPUT);
    expect(found).toBe(true);
    expect(flags).toHaveLength(3);
    expect(flags[0]).toMatchObject({
      repo: "org/web",
      flagType: "LOGIC_ERROR",
      location: "#12 > src/cart.ts:40",
      prNumber: 12,
      filePath: "src/cart.ts",
      line: 40,
      detail: "Discount applied twice when `qty | 0`",
      severity: "P0",
      suggestedFix: "Apply once",
    });
  });

  it("reads severity from text, converts <br> and keeps unknown values for fixing", () => {
    const [, second, third] = parseFlagTable(OUTPUT).flags;
    expect(second.severity).toBe("P1");
    expect(second.detail).toBe("No catch on timeout\nleaves order pending");
    expect(third.flagType).toBeNull();
    expect(third.flagTypeText).toBe("Style");
    expect(third.severity).toBeNull();
    expect(third.severityText).toBe("P2");
  });

  it("matches headers case-insensitively and in any order", () => {
    const { flags } = parseFlagTable(
      "| severity | DETAIL | flag type |\n|:--|:--:|--:|\n| P1 | Broken | security |",
    );
    expect(flags).toEqual([expect.objectContaining({ severity: "P1", detail: "Broken", flagType: "SECURITY", repo: "" })]);
  });

  it("reports when no table with the expected columns exists", () => {
    expect(parseFlagTable("No issues found.").found).toBe(false);
    expect(parseFlagTable("| a | b |\n|---|---|\n| 1 | 2 |").found).toBe(false);
  });

  it("returns an empty list for a header-only table", () => {
    expect(parseFlagTable("| Flag Type | Detail | Severity |\n|---|---|---|\n\nNone.")).toEqual({ flags: [], found: true });
  });
});

describe("splitRow", () => {
  it("keeps escaped pipes and pipes inside code", () => {
    expect(splitRow("| a \\| b | `x | y` | c |")).toEqual(["a | b", "`x | y`", "c"]);
  });
});

describe("toFlagType", () => {
  it("maps labels, enum names and unambiguous prefixes", () => {
    expect(toFlagType("Regression Risk")).toBe("REGRESSION_RISK");
    expect(toFlagType("MISSING_ERROR_HANDLING")).toBe("MISSING_ERROR_HANDLING");
    expect(toFlagType("requirement")).toBe("REQUIREMENT_FIDELITY");
    expect(toFlagType("Sec")).toBeNull();
    expect(toFlagType("Performance")).toBeNull();
  });
});

describe("parseLocation", () => {
  it("handles the common shapes", () => {
    expect(parseLocation("#123 > src/a.ts:42")).toEqual({ prNumber: 123, filePath: "src/a.ts", line: 42 });
    expect(parseLocation("PR #5 › lib/b.py#L10-L20")).toEqual({ prNumber: 5, filePath: "lib/b.py", line: 10 });
    expect(parseLocation("src/c.ts")).toEqual({ prNumber: null, filePath: "src/c.ts", line: null });
    expect(parseLocation("#9")).toEqual({ prNumber: 9, filePath: null, line: null });
  });

  it("formats back to the spec style", () => {
    expect(formatLocation({ prNumber: 123, filePath: "src/a.ts", line: 42 })).toBe("#123 > src/a.ts:42");
    expect(formatLocation({ prNumber: null, filePath: "src/a.ts", line: null })).toBe("src/a.ts");
  });
});

describe("buildReviewPrompt", () => {
  it("lists the PRs and asks for the flag table", () => {
    const prompt = buildReviewPrompt(["https://github.com/org/web/pull/12", "https://github.com/org/api/pull/7"]);
    expect(prompt).toContain("- https://github.com/org/web/pull/12\n- https://github.com/org/api/pull/7");
    expect(prompt).toContain("| Repo | Flag Type | Location | Detail | Severity | Suggested Fix |");
  });
});
