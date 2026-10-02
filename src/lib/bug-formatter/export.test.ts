import { describe, expect, it } from "vitest";

import { bugsToJira, bugsToMarkdown, bugToMarkdown, bugToSlack } from "./export";
import type { Bug } from "./types";

const full: Bug = {
  id: "1",
  title: "Login button broken on mobile",
  severity: "P1",
  environmentUrl: "https://staging.example.com",
  steps: ["Open on mobile", "Tap Login"],
  expected: "Login page opens",
  actual: "Nothing happens",
  notes: "Suspected root cause",
  source: "MANUAL",
  createdAt: "2026-10-02T00:00:00.000Z",
};
const minimal: Bug = { ...full, id: "2", title: "Typo", severity: "P3", steps: [], environmentUrl: undefined, expected: undefined, actual: undefined, notes: undefined };

describe("Markdown export", () => {
  it("matches the spec format", () => {
    expect(bugToMarkdown(full)).toBe(`## [P1] Login button broken on mobile

**Environment:** https://staging.example.com

**Steps to Reproduce**
1. Open on mobile
2. Tap Login

**Expected Result:** Login page opens
**Actual Result:** Nothing happens

**Notes:** Suspected root cause`);
  });

  it("omits empty sections and separates bugs with ---", () => {
    expect(bugToMarkdown(minimal)).toBe("## [P3] Typo");
    expect(bugsToMarkdown([full, minimal])).toContain("\n\n---\n\n## [P3] Typo");
  });
});

describe("Jira export", () => {
  it("uses wiki markup with numbered steps", () => {
    const out = bugsToJira([full, minimal]);
    expect(out).toContain("h2. \\[P1\\] Login button broken on mobile");
    expect(out).toContain("*Steps to Reproduce*\n# Open on mobile\n# Tap Login");
    expect(out).toContain("\n\n----\n\nh2. \\[P3\\] Typo");
  });

  it("escapes macro and link characters", () => {
    expect(bugsToJira([{ ...minimal, title: "Shows {name} [x]" }])).toContain("Shows \\{name\\} \\[x\\]");
  });
});

describe("Slack export", () => {
  it("uses bold with * and bullets, escaping < > &", () => {
    const out = bugToSlack({ ...full, actual: "<script> & more" });
    expect(out.split("\n")[0]).toBe("*[P1] Login button broken on mobile*");
    expect(out).toContain("• *Steps to Reproduce*\n    1. Open on mobile\n    2. Tap Login");
    expect(out).toContain("• *Actual Result:* &lt;script&gt; &amp; more");
  });
});
