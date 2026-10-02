import { describe, expect, it } from "vitest";

import { parseFindings } from "./parser";

const SAMPLE = `Here are the findings:

1. **P1 — Login button broken on mobile**
   Steps: Open on mobile, tap Login
   Expected: Login page opens
   Actual: Nothing happens

2. **P2 — Table overflows on small screen**
   Steps:
     1. Open the orders page
     2. Resize to 375px
   Expected: Table scrolls horizontally
   Actual: Page scrolls sideways
   Env: https://staging.example.com
   Notes: Probably a missing overflow-x
   on the wrapper

That's all.`;

describe("parseFindings", () => {
  it("splits numbered items and reads severity, title and fields", () => {
    const bugs = parseFindings(SAMPLE);
    expect(bugs).toHaveLength(2);
    expect(bugs[0]).toEqual({
      title: "Login button broken on mobile",
      severity: "P1",
      steps: ["Open on mobile", "Tap Login"],
      expected: "Login page opens",
      actual: "Nothing happens",
      environmentUrl: undefined,
      notes: undefined,
    });
  });

  it("keeps nested numbered steps inside their item and joins multi-line values", () => {
    const [, second] = parseFindings(SAMPLE);
    expect(second.severity).toBe("P2");
    expect(second.steps).toEqual(["Open the orders page", "Resize to 375px"]);
    expect(second.environmentUrl).toBe("https://staging.example.com");
    expect(second.notes).toBe("Probably a missing overflow-x\non the wrapper");
  });

  it("defaults severity to P2 when missing", () => {
    const [bug] = parseFindings("1. Save button does nothing\nExpected: Saves");
    expect(bug.severity).toBe("P2");
    expect(bug.title).toBe("Save button does nothing");
  });

  it("accepts other separators, bracketed and trailing severities", () => {
    const bugs = parseFindings(
      "1. P0: Data loss on save\n2. [P3] Typo in footer\n3. Slow search (P1)\n4) **P2** - Wrong icon",
    );
    expect(bugs.map((b) => [b.severity, b.title])).toEqual([
      ["P0", "Data loss on save"],
      ["P3", "Typo in footer"],
      ["P1", "Slow search"],
      ["P2", "Wrong icon"],
    ]);
  });

  it("does not read severity from inside words", () => {
    const [a, b] = parseFindings("1. Fix TOP2 banner\n2. P10 items shown");
    expect(a).toMatchObject({ severity: "P2", title: "Fix TOP2 banner" });
    expect(b).toMatchObject({ severity: "P2", title: "P10 items shown" });
  });

  it("reads labels case-insensitively, with bold and bullets", () => {
    const [bug] = parseFindings(
      "1. P1 — Broken link\n- **STEPS:** Click Help\n- **expected result:** Help opens\n* Actual: 404\nEnvironment: https://qa.example.com",
    );
    expect(bug.steps).toEqual(["Click Help"]);
    expect(bug.expected).toBe("Help opens");
    expect(bug.actual).toBe("404");
    expect(bug.environmentUrl).toBe("https://qa.example.com");
  });

  it("keeps unlabelled lines before the first label as notes", () => {
    const [bug] = parseFindings("1. P1 — Crash\n   Happens after the update.\n   Notes: Check logs");
    expect(bug.notes).toBe("Happens after the update.\nCheck logs");
  });

  it("returns nothing when there are no numbered items", () => {
    expect(parseFindings("No issues found.")).toEqual([]);
    expect(parseFindings("")).toEqual([]);
  });

  it("handles Windows line endings", () => {
    const [bug] = parseFindings("1. P1 — A\r\nSteps: x, y\r\nActual: z");
    expect(bug.steps).toEqual(["X", "Y"]);
    expect(bug.actual).toBe("z");
  });
});
