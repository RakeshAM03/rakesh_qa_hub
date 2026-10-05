import { describe, expect, it } from "vitest";

import { ALL_STEP_IDS, BUILT_IN_TEMPLATES, DEFAULT_SPEC_FOLDERS, FOCUS_AREAS } from "@/config/pr-qa-templates";

import { buildPrompt, NOT_PROVIDED, riskLevel, sanitizeLoginUrl, type SessionInputs } from ".";
import { templateInputSchema } from "../schema";

const FE = "https://github.com/example-org/frontend/pull/3419";
const BE = "https://github.com/example-org/backend/pull/386";

const base = (over: Partial<SessionInputs> = {}): SessionInputs => ({
  frontendPr: FE,
  backendPr: BE,
  additionalPrs: [],
  testEnvUrl: "https://qa.example.com",
  loginUrl: "https://qa.example.com/login",
  loginMethod: "sso",
  specFolders: DEFAULT_SPEC_FOLDERS,
  context: "",
  focusAreas: [],
  steps: ALL_STEP_IDS,
  specRef: "",
  mode: "full",
  resumeFrom: 1,
  ...over,
});

const template = (name: string, over: Partial<SessionInputs> = {}) => {
  const t = BUILT_IN_TEMPLATES.find((x) => x.name === name)!;
  return buildPrompt(base({ focusAreas: t.focusAreas, steps: t.steps, mode: t.mode, ...over }));
};

const stepHeadings = (p: string) => [...p.matchAll(/^## Step (\d+) —/gm)].map((m) => Number(m[1]));

describe("PR QA Session prompt — done-when check", () => {
  it("both PRs + Full Session + all focus areas has all 10 steps, both tables, both STOP gates, 4 spec categories and the closure checklist", () => {
    const p = template("Full Session");
    expect(p.startsWith("# PR QA Session\n")).toBe(true);
    expect(stepHeadings(p)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const h of ["## Prerequisites", "## Data Safety", "## Inputs", "### Frontend Diff Analysis", "### Backend Diff Analysis", "### Contract Mismatch Analysis", "### Impact Radius Analysis", "### AI Code Quality Review"]) expect(p).toContain(h);
    expect(p).toContain("| Changed File | Imports From | Consumed By | Existing Specs | Risk Level |");
    expect(p).toContain("| Flag Type | Location | Detail | Severity |");
    expect(p).toContain('"AI Code Quality Review — no flags raised."');
    expect(p).toContain("**STOP — Do not begin any browser interaction until the plan is approved. Reply `Approved` or `Approved with changes:`.**");
    expect(p).toContain("**STOP — wait for the team's findings before Step 8.**");
    for (const c of ["Category A — Feature specs** `@feature @smoke`", "Category B — Defect specs** `@regression @critical`", "Category C — Regression guards** `@regression`", "Category D — API contract specs** `@regression @api`"]) expect(p).toContain(c);
    expect(p).toContain("## Step 10 — Session Closure Checklist");
    for (const g of ["**Step 1**", "**Step 2**", "**Step 3**", "**Steps 4–6**", "**Steps 7–8**", "**Step 9**"]) expect(p).toContain(g);
    expect(p).toContain("**Go / No-Go recommendation**");
    expect(p).toContain("Ignore the PR title and description entirely. Read every changed file in the diff.");
    expect(p).toContain("Do not summarise. Do not paraphrase intent. Work only from the code.");
    expect(p).toContain("Mark every mismatch as **P1**.");
  });
});

describe("inputs", () => {
  it("parses PR URLs into gh pr diff commands and repos", () => {
    const p = buildPrompt(base({ additionalPrs: ["https://github.com/example-org/shared-lib/pull/12/files"] }));
    expect(p).toContain("| Frontend PR diff | `gh pr diff 3419 --repo example-org/frontend` |");
    expect(p).toContain("| Backend PR diff | `gh pr diff 386 --repo example-org/backend` |");
    expect(p).toContain("Additional PR 1: `gh pr diff 12 --repo example-org/shared-lib`");
    expect(p).toContain("| Frontend repo | example-org/frontend |");
    expect(p).toContain("### Additional PR 1 Diff Analysis (example-org/shared-lib)");
    expect(p).toContain("Run `gh pr diff 12 --repo example-org/shared-lib`.");
  });

  it("renders an empty test environment and login method as <not provided>", () => {
    const p = buildPrompt(base({ testEnvUrl: "  ", loginUrl: "", loginMethod: "" }));
    expect(p).toContain(`| Test Environment | ${NOT_PROVIDED} |`);
    expect(p).toContain(`| Login | Login method: ${NOT_PROVIDED} — ask before Step 3 |`);
    expect(p).toContain(`Navigate to ${NOT_PROVIDED}. Login method: ${NOT_PROVIDED} — ask the user how to log in before starting.`);
    expect(p).not.toMatch(/\| Test Environment \|\s*\|/);
  });

  it("uses the spec folders in the impact radius and the regression rules", () => {
    const p = buildPrompt(base({ specFolders: "e2e/, cypress/", focusAreas: ["Regression"] }));
    expect(p).toContain("search `e2e/`, `cypress/` for specs");
    expect(p).toContain("every existing spec found in e2e/, cypress/");
  });

  it("puts the style reference in Step 9", () => {
    const p = buildPrompt(base({ specRef: "test('x', async () => {});" }));
    expect(p).toContain("mirror the style reference below");
    expect(p).toContain("```ts\ntest('x', async () => {});\n```");
  });
});

describe("credentials are never stored or put in the prompt", () => {
  it("strips user:password@ and credential parameters from the login URL", () => {
    expect(sanitizeLoginUrl("https://qa-user:S3cret!@qa.example.com/login?next=/home&token=abc&password=x&otp=123456")).toEqual({ url: "https://qa.example.com/login?next=%2Fhome", removed: true });
    expect(sanitizeLoginUrl("https://qa.example.com/sso#access_token=abc")).toEqual({ url: "https://qa.example.com/sso", removed: true });
    expect(sanitizeLoginUrl("https://qa.example.com/login")).toEqual({ url: "https://qa.example.com/login", removed: false });
    expect(sanitizeLoginUrl("javascript:alert(1)")).toBeNull();
  });

  it("the prompt never contains credentials and tells Claude to use env vars or ask at run time", () => {
    const p = buildPrompt(base({ loginUrl: "https://qa-user:S3cret!@qa.example.com/login?token=abc123&email=qa@example.com", loginMethod: "email-password" }));
    expect(p).not.toMatch(/S3cret|abc123|qa-user|qa@example\.com/);
    expect(p).toContain("https://qa.example.com/login");
    expect(p).toContain("`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`");
    expect(p).toContain("or ask the user at run time");
    expect(p).toContain("Credentials are never part of this prompt.");
    expect(p).toContain("one-time codes (OTP / MFA) are always asked for at run time");
  });

  it("saved templates keep only the login URL (cleaned) and method", () => {
    const parsed = templateInputSchema.parse({ name: "Mine", focusAreas: [], steps: [1], loginUrl: "https://u:p@qa.example.com/login?password=x", loginMethod: "magic-link", specFolders: "e2e/" });
    expect(parsed).toMatchObject({ loginUrl: "https://qa.example.com/login", loginMethod: "magic-link", specFolders: "e2e/" });
    expect(templateInputSchema.safeParse({ name: "Mine", focusAreas: [], steps: [1], loginMethod: "username:bob" }).success).toBe(false);
  });
});

describe("single-PR sessions change the prompt", () => {
  it("frontend only: no contract analysis, no Category D, and an explanation", () => {
    const p = buildPrompt(base({ backendPr: "" }));
    expect(p).not.toContain("### Contract Mismatch Analysis");
    expect(p).not.toContain("**Category D — API contract specs**");
    expect(p).not.toContain("### Backend Diff Analysis");
    expect(p).toContain("Only a frontend PR was given — Contract Mismatch Analysis and Category D (API contract specs) are skipped");
    expect(p).toContain(`| Backend PR diff | ${NOT_PROVIDED} |`);
  });

  it("backend only: no frontend diff section, UI steps scoped to consumers, and an explanation", () => {
    const p = buildPrompt(base({ frontendPr: "" }));
    expect(p).not.toContain("### Frontend Diff Analysis");
    expect(p).not.toContain("### Contract Mismatch Analysis");
    expect(p).toContain("### Backend Diff Analysis");
    expect(p).toContain("Only a backend PR was given — Frontend Diff Analysis is skipped");
    expect(p).toContain("Only screens that consume the changed endpoints");
    expect(p).toContain("Category D — API contract specs");
  });
});

describe("templates", () => {
  it("Full Session: all 10 steps", () => {
    expect(stepHeadings(template("Full Session"))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("API Only: Steps 1 (BE + contract), 2, 3 (API TCs only), 7, 8, 9 (Category D), 10", () => {
    const p = template("API Only");
    expect(stepHeadings(p)).toEqual([1, 2, 3, 7, 8, 9, 10]);
    expect(p).toContain("### Backend Diff Analysis");
    expect(p).toContain("### Contract Mismatch Analysis");
    expect(p).not.toContain("### Frontend Diff Analysis");
    expect(p).not.toContain("### Impact Radius Analysis");
    expect(p).toContain("Plan **API test cases only** (TC-API-xx)");
    expect(p).toContain("Execute the approved **TC-API** cases only");
    expect(p).toContain("Category D");
    expect(p).not.toMatch(/Category [ABC] —/);
    expect(p).toContain("Not in this session: Step 4 UI Validation, Step 5 UX Validation, Step 6 Exploratory.");
  });

  it("UI Regression: Steps 1 (FE + impact radius), 2, 4, 5, 6, 7, 9 (A + C), 10", () => {
    const p = template("UI Regression");
    expect(stepHeadings(p)).toEqual([1, 2, 4, 5, 6, 7, 9, 10]);
    expect(p).toContain("### Frontend Diff Analysis");
    expect(p).toContain("### Impact Radius Analysis");
    expect(p).not.toContain("### Backend Diff Analysis");
    expect(p).not.toContain("### Contract Mismatch Analysis");
    expect(p).toMatch(/Category A —[\s\S]*Category C —/);
    expect(p).not.toMatch(/Category [BD] —/);
  });

  it("Security: all steps, Security focus forced on, Step 6 weighted toward security", () => {
    const t = BUILT_IN_TEMPLATES.find((x) => x.name === "Security")!;
    expect(t.mode).toBe("security");
    const p = buildPrompt(base({ focusAreas: [], mode: "security", steps: t.steps }));
    expect(stepHeadings(p)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p).toContain("| Focus Areas | Security |");
    expect(p).toContain("### Security Review (Security focus)");
    expect(p).toContain("spend at least half of the exploratory time on the security checks");
  });

  it("keeps original step numbers when steps are deselected", () => {
    expect(stepHeadings(buildPrompt(base({ steps: [1, 2, 9] })))).toEqual([1, 2, 9]);
  });
});

describe("focus areas inject instructions into the relevant steps", () => {
  const without = buildPrompt(base());
  const cases: [(typeof FOCUS_AREAS)[number], string[]][] = [
    ["Contract Testing", ["**Contract Testing focus:** list every changed field", "a **TC-API** for every changed request / response field"]],
    ["UI / UX", ["**UI / UX focus:** zoom to 200%", "RTL layout", "**UI / UX focus:** keyboard-only completion"]],
    ["Security", ["### Security Review (Security focus)", "IDOR risks", "**Security focus:** tamper with IDs", "XSS payloads"]],
    ["Performance", ["**Performance focus:** capture network timing and payload size", "N+1 request patterns and re-render loops"]],
    ["Regression", ["**Regression focus:** a mandatory regression-check test case for every existing spec"]],
  ];
  it.each(cases)("%s", (focus, texts) => {
    const p = buildPrompt(base({ focusAreas: [focus] }));
    for (const t of texts) {
      expect(p).toContain(t);
      expect(without).not.toContain(t);
    }
  });
});

describe("risk context", () => {
  it("puts additional context in its own section and scales depth to a risk level", () => {
    const p = buildPrompt(base({ context: "Checkout redesign.\nRisk: Critical — payment flow." }));
    expect(p).toContain("## Risk Context\n\nCheckout redesign.\nRisk: Critical — payment flow.");
    expect(p).toContain("**Risk level: Critical.** Scale test-case depth to it — Critical risk: negative and edge cases are mandatory for every P1 area");
    expect(p).toContain("scale depth to the **Critical** risk level");
    expect(riskLevel("this is a high-risk change")).toBe("High");
    expect(riskLevel("risk level - low")).toBe("Low");
    expect(riskLevel("critical path refactor")).toBeNull();
    expect(buildPrompt(base({ context: "" }))).not.toContain("## Risk Context");
  });
});

describe("resume", () => {
  it("resume from a later step asks for the Step 1 analysis and the approved plan", () => {
    const p = buildPrompt(base({ resumeFrom: 4 }));
    expect(p).toContain("This session resumes at **Step 4**");
    expect(p).toContain("the Step 1 analysis");
    expect(p).toContain("the approved Step 2 test plan");
    expect(p).toContain("the outputs of Steps 3–3");
    expect(buildPrompt(base())).not.toContain("## Resume");
  });

  it("a TC Library entry resumes at Step 3 with the saved Steps 1–2 appended", () => {
    const p = buildPrompt(base({ steps: [3, 4], approvedPlan: { name: "Saved plan", output: "## Step 1\nAnalysis" } }));
    expect(p).toContain("Steps 1–2 are already done and approved (saved in the TC Library as “Saved plan”");
    expect(p).toContain("## Approved Steps 1–2 (from TC Library: Saved plan)\n\n## Step 1\nAnalysis");
    expect(stepHeadings(p)).toEqual([1, 2, 3, 4]);
  });
});

describe("generic content", () => {
  it("names no company, product or internal URL — only what the inputs provide", () => {
    const p = buildPrompt(base({ frontendPr: "", backendPr: "https://github.com/example-org/backend/pull/1", testEnvUrl: "", loginUrl: "" }));
    expect(p.match(/github\.com\/[\w.-]+/g)).toEqual(["github.com/example-org"]);
    expect(p).not.toMatch(/https?:\/\/(?!github\.com\/example-org)/);
  });
});
