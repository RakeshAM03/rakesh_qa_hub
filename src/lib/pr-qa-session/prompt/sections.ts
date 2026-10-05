/**
 * PR QA Session prompt sections. Each function returns Markdown lines (or [] when the section
 * doesn't apply), so steps and sub-blocks can be toggled by template, focus areas and inputs.
 * Nothing here names a company, product, repo or URL — everything comes from the inputs.
 */

import { NOT_PROVIDED, type PrInfo, type SessionContext } from "./inputs";

type Lines = string[];

const bullets = (items: (string | false | null | undefined)[]) => items.filter((x): x is string => Boolean(x)).map((x) => `- ${x}`);
const h3 = (title: string, body: Lines) => (body.length ? [`### ${title}`, "", ...body, ""] : []);

const has = (c: SessionContext, step: number) => c.steps.has(step);
const feAnalysis = (c: SessionContext) => Boolean(c.fe) && c.mode !== "api";
const beAnalysis = (c: SessionContext) => Boolean(c.be) && c.mode !== "ui";
const contract = (c: SessionContext) => c.both && c.mode !== "ui";
const impact = (c: SessionContext) => c.mode !== "api";
const aiReview = (c: SessionContext) => c.mode === "full" || c.mode === "security";
const categories = (c: SessionContext) => ({
  A: c.mode !== "api",
  B: c.mode === "full" || c.mode === "security",
  C: c.mode !== "api",
  D: (c.mode === "full" || c.mode === "security" || c.mode === "api") && Boolean(c.be),
});

const TEMPLATE_LABEL = { full: "Full Session", api: "API Only", ui: "UI Regression", security: "Security" } as const;

// ---------------------------------------------------------------- header

export function title(): Lines {
  return ["# PR QA Session", ""];
}

export function prerequisites(c: SessionContext): Lines {
  return [
    "## Prerequisites",
    "",
    ...bullets([
      "`gh` CLI is authenticated (`gh auth status` shows a logged-in account with read access to the repos below).",
      "Playwright MCP is connected (you can call `browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_console_messages` and `browser_network_requests`).",
      "Resuming an interrupted session: the user says \"Resume from Step N\" and pastes the outputs of the completed steps. Continue from Step N without redoing earlier steps and without re-asking approved decisions.",
      c.loginMethod === NOT_PROVIDED && (has(c, 3) || has(c, 4) || has(c, 5) || has(c, 6)) && "Login method is not provided — ask the user before Step 3.",
    ]),
    "",
  ];
}

export function dataSafety(): Lines {
  return [
    "## Data Safety",
    "",
    ...bullets([
      "Screenshots may contain client data. Keep them inside this session; describe findings without copying personal data.",
      "No real customer names, candidate / user data or credentials in any spec, TODO, report or commit message. Use placeholders such as `<customer_name>`, `<account_id>`, `<user_email>`.",
      "Credentials are never part of this prompt. Read them from environment variables (e.g. `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, or the names your team uses) or ask the user at run time. Never print, log, screenshot or commit them; one-time codes (OTP / MFA) are always asked for at run time.",
    ]),
    "",
  ];
}

export function inputsTable(c: SessionContext): Lines {
  const i = c.inputs;
  const row = (k: string, v: string) => `| ${k} | ${v.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>")} |`;
  const diff = (p: PrInfo | null) => (p ? (p.diffCmd ? `\`${p.diffCmd}\`` : `${NOT_PROVIDED} (invalid PR URL)`) : NOT_PROVIDED);
  const login =
    c.loginMethod === NOT_PROVIDED
      ? `Login method: ${NOT_PROVIDED} — ask before Step 3`
      : `${c.loginMethod}${c.loginUrl !== NOT_PROVIDED ? ` via ${c.loginUrl}` : ""} — credentials from env vars or asked at run time`;
  return [
    "## Inputs",
    "",
    "| Input | Value |",
    "|---|---|",
    row("Frontend PR diff", diff(c.fe)),
    row("Backend PR diff", diff(c.be)),
    row("Additional PR diffs", c.extras.length ? c.extras.map((p) => `${p.label}: ${p.diffCmd ? `\`${p.diffCmd}\`` : `${p.url} (invalid PR URL)`}`).join("<br>") : "none"),
    row("Test Environment", c.env),
    row("Login", login),
    row("Frontend repo", c.fe?.repo ?? NOT_PROVIDED),
    row("Backend repo", c.be?.repo ?? NOT_PROVIDED),
    row("PR URLs", [c.fe, c.be, ...c.extras].filter(Boolean).map((p) => p!.url).join("<br>") || NOT_PROVIDED),
    row("Additional Context", i.context.trim() ? "see Risk Context below" : "none"),
    row("Focus Areas", c.focus.size ? [...c.focus].join(", ") : "none"),
    row("Existing spec folders", c.folders.join(", ")),
    row("Template", `${TEMPLATE_LABEL[c.mode]} — steps ${[...c.steps].sort((a, b) => a - b).join(", ")}`),
    "",
  ];
}

export function riskContext(c: SessionContext): Lines {
  const text = c.inputs.context.trim();
  if (!text) return [];
  const scale = {
    Critical: "Critical risk: negative and edge cases are mandatory for every P1 area; each P1 test case needs at least one negative and one boundary variant; no P1 area may be marked out of scope.",
    High: "High risk: negative cases are mandatory for every P1 area, plus edge cases for P1 areas that touch shared utilities, hooks or context providers.",
    Medium: "Medium risk: standard depth — a negative case for every P1 area and boundaries where the code has limits.",
    Low: "Low risk: lighter depth — happy path plus one negative case per changed area, but every contract mismatch still gets its own P1 test case.",
  } as const;
  return ["## Risk Context", "", ...text.split(/\r?\n/), "", ...(c.risk ? [`**Risk level: ${c.risk}.** Scale test-case depth to it — ${scale[c.risk]}`, ""] : [])];
}

/** Explains what was skipped and why (single PR, template mode, deselected steps). */
export function scopeNotes(c: SessionContext): Lines {
  const notes: string[] = [];
  if (c.feOnly) notes.push("Only a frontend PR was given — Contract Mismatch Analysis and Category D (API contract specs) are skipped: there is no backend change to compare against.");
  if (c.beOnly) notes.push("Only a backend PR was given — Frontend Diff Analysis is skipped, and the UI steps only cover screens that consume the changed endpoints (found through the impact radius).");
  if (c.mode === "api") notes.push("API Only template — Step 1 covers the backend diff and contracts, Step 3 runs API test cases only, and Step 9 generates Category D only.");
  if (c.mode === "ui") notes.push("UI Regression template — Step 1 covers the frontend diff and the impact radius, and Step 9 generates Categories A and C only.");
  if (c.mode === "security") notes.push("Security template — the Security focus is always on and Step 6 is weighted toward security.");
  const skipped = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((s) => !c.steps.has(s));
  if (skipped.length) notes.push(`Not in this session: ${skipped.map((s) => `Step ${s} ${c.stepName(s)}`).join(", ")}. Skip them; step numbers below are unchanged so references stay valid.`);
  return notes.length ? ["## Scope", "", ...bullets(notes), ""] : [];
}

export function resumeBlock(c: SessionContext): Lines {
  if (c.approved) {
    return [
      "## Resume",
      "",
      `Steps 1–2 are already done and approved (saved in the TC Library as “${c.approved.name}”, pasted at the end of this prompt). Start from Step 3 and work from that plan — do not redo the analysis or the plan.`,
      "",
    ];
  }
  if (c.resumeFrom <= 1) return [];
  return [
    "## Resume",
    "",
    `This session resumes at **Step ${c.resumeFrom}**. Before doing anything else, ask the user to paste:`,
    ...bullets(["the Step 1 analysis (diff analysis, impact radius table and AI code quality flags)", "the approved Step 2 test plan (with any \"Approved with changes\" notes)", c.resumeFrom > 3 ? `the outputs of Steps 3–${c.resumeFrom - 1}` : null]),
    "",
    `Then continue from Step ${c.resumeFrom}. Do not redo earlier steps.`,
    "",
  ];
}

// ---------------------------------------------------------------- Step 1

function diffAnalysisFe(p: PrInfo): Lines {
  return [
    `Run \`${p.diffCmd ?? `gh pr diff <num> --repo <owner/repo>`}\`. For **each changed file**:`,
    ...bullets([
      "its responsibility (what the file does in the app)",
      "code-level changes — functions, props, conditionals, API calls, state, defaults / fallbacks, error handling",
      "new behaviour, previous behaviour, and what can go wrong",
    ]),
    "",
    "For **each API call**, document the request and response shape before and after. Flag fields that were renamed, removed or made optional.",
    "Flag high-risk changes: removed null checks, changed type assumptions, payload structure changes, removed error boundaries.",
  ];
}

function diffAnalysisBe(p: PrInfo): Lines {
  return [
    `Run \`${p.diffCmd ?? `gh pr diff <num> --repo <owner/repo>`}\`. For **each changed file**:`,
    ...bullets([
      "the service / controller / handler responsibility",
      "changes to endpoints, request / response schema, query logic, auth, caching, background jobs, DB migrations, and error codes or shapes",
      "new behaviour, previous behaviour, and what can go wrong",
    ]),
  ];
}

export function step1(c: SessionContext): Lines {
  if (!has(c, 1)) return [];
  const sec = c.focus.has("Security");
  const strictContract = c.focus.has("Contract Testing");
  const out: Lines = ["## Step 1 — Analyse the PR", "", "Ignore the PR title and description entirely. Read every changed file in the diff.", ""];
  if (feAnalysis(c)) out.push(...h3("Frontend Diff Analysis", diffAnalysisFe(c.fe!)));
  if (beAnalysis(c)) out.push(...h3("Backend Diff Analysis", diffAnalysisBe(c.be!)));
  for (const p of c.extras) out.push(...h3(`${p.label} Diff Analysis (${p.repo})`, [...diffAnalysisFe(p).slice(0, 4), "Note how this PR interacts with the frontend / backend PRs above (shared files, shared endpoints, merge order)."]));
  if (contract(c)) {
    out.push(
      ...h3("Contract Mismatch Analysis", [
        "Compare every endpoint the frontend calls with what the backend now serves. Check for:",
        ...bullets([
          "fields the frontend expects that the backend no longer sends",
          "new required backend fields the frontend doesn't send",
          "status codes or error shapes the frontend doesn't handle",
          "changed URL, method or auth",
        ]),
        "",
        "Mark every mismatch as **P1**.",
        ...(strictContract
          ? ["", "**Contract Testing focus:** list every changed field (request and response) with old type → new type, required / optional and nullability. Treat silent type widening, enum changes and changed defaults as mismatches too. Every changed field gets its own TC-API in Step 2."]
          : []),
      ]),
    );
  }
  if (impact(c)) {
    out.push(
      ...h3("Impact Radius Analysis", [
        ...bullets([
          "importers of each changed file",
          "all call sites of each changed function — search the whole repo (e.g. `rg -n \"<functionName>\"`), not only the diff",
          "all frontend consumers of each changed endpoint",
          "affected routes / pages",
          `existing spec coverage — search ${c.folders.map((f) => `\`${f}\``).join(", ")} for specs that touch each changed file, function, route or endpoint`,
          "shared utilities, hooks and context providers — flag them as **highest blast radius**",
        ]),
      ]),
    );
  }
  if (aiReview(c)) {
    out.push(
      ...h3("AI Code Quality Review", [
        "Treat every PR as AI-generated. Check:",
        ...bullets([
          "requirement fidelity — the PR description vs what the code actually does",
          "hallucinated APIs or imports (functions, packages or endpoints that don't exist)",
          "missing error handling — **P1** if it can cause a silent failure or a blank UI",
          "copy-paste adaptation failures (wrong variable, stale label, duplicated branch)",
          "type-safety shortcuts — `!`, `as`, `@ts-ignore`, `eslint-disable` without a justification",
          "hardcoded secrets or environment values",
        ]),
      ]),
    );
  }
  if (sec) {
    out.push(
      ...h3("Security Review (Security focus)", [
        ...bullets([
          "authentication / authorisation changes — new or removed guards, role checks, middleware order",
          "IDOR risks — IDs taken from the request without an ownership check",
          "input sanitisation and output encoding (XSS, injection, path traversal)",
          "secrets, tokens or keys in code, config or logs",
        ]),
      ]),
    );
  }
  const tables: Lines = [];
  if (impact(c)) tables.push("| Changed File | Imports From | Consumed By | Existing Specs | Risk Level |", "|---|---|---|---|---|", "");
  if (aiReview(c)) tables.push("| Flag Type | Location | Detail | Severity |", "|---|---|---|---|", "", 'If nothing is flagged, write: "AI Code Quality Review — no flags raised."', "");
  if (tables.length) out.push("### Required output tables", "", ...tables);
  out.push("Do not summarise. Do not paraphrase intent. Work only from the code.", "");
  return out;
}

// ---------------------------------------------------------------- Step 2

export function step2(c: SessionContext): Lines {
  if (!has(c, 2)) return [];
  const coverage = [
    contract(c) && "one dedicated **P1** test case for each contract mismatch",
    c.focus.has("Contract Testing") && "a **TC-API** for every changed request / response field",
    impact(c) && "at least one test case for each consumer or route in the impact table",
    "a regression-check test case for each area that has existing specs",
    c.focus.has("Regression") && `**Regression focus:** a mandatory regression-check test case for every existing spec found in ${c.folders.join(", ")} (one per spec, named after it)`,
    c.focus.has("Security") && "security test cases for every auth / authorisation change and every user-controlled ID",
    c.risk && `scale depth to the **${c.risk}** risk level from the Risk Context`,
  ];
  return [
    "## Step 2 — Test Plan (pause for review)",
    "",
    c.mode === "api" ? "Plan **API test cases only** (TC-API-xx); exercise them with an API client against the test environment." : "",
    "### Test case table",
    "",
    "| ID | Title | Area | Type | Priority | Steps | Expected Result | Spec Category |",
    "|---|---|---|---|---|---|---|---|",
    "",
    ...bullets([
      "ID: `TC-01`, `TC-02` … for UI; `TC-API-01` … for API",
      "Type: Functional / UI / UX / Exploratory / API / Contract / Integration",
      "Priority: P1 / P2 / P3",
      "Expected result: inferred from the code in Step 1 (not from the PR description)",
      "Spec Category: A / B / C / D / None — the Step 9 category this case will become",
    ]),
    "",
    "**Ordering:** contract-mismatch test cases first, then P1, P2, P3. Within a priority, direct-diff cases come before consumer-area cases.",
    "",
    "### Test data prerequisites",
    "",
    "For each test case, list the data and state it needs (accounts and roles, records, feature flags). If a prerequisite can't be confirmed, mark the test case **Blocked** upfront and say why.",
    "",
    "### Out of scope",
    "",
    "Each excluded area must give exactly one of these reasons, tied to the impact table: unchanged / no shared dependency · covered by `<spec>` · low-risk consumer.",
    "",
    "### Risk flags",
    "",
    "List the risks that worry you most, with the Step 1 evidence for each.",
    "",
    "### Coverage rules",
    "",
    ...bullets(coverage),
    "",
    "**STOP — Do not begin any browser interaction until the plan is approved. Reply `Approved` or `Approved with changes:`.**",
    "",
  ].filter((l, n, a) => !(l === "" && a[n - 1] === ""));
}

// ---------------------------------------------------------------- Steps 3–6

const consoleCheck = "Call `browser_console_messages` after each key interaction and report errors and warnings.";

function loginLine(c: SessionContext): string {
  if (c.loginMethod === NOT_PROVIDED) return `Navigate to ${c.env}. Login method: ${NOT_PROVIDED} — ask the user how to log in before starting.`;
  return `Navigate to ${c.env} and log in with **${c.loginMethod}**${c.loginUrl !== NOT_PROVIDED ? ` at ${c.loginUrl}` : ""}. Take credentials from environment variables (e.g. \`TEST_USER_EMAIL\`, \`TEST_USER_PASSWORD\`) or ask the user at run time${/sso|magic/i.test(c.loginMethod) ? "; ask the user for any MFA / OTP code or magic-link step when it appears" : ""}. Never type credentials into notes, reports or specs.`;
}

export function step3(c: SessionContext): Lines {
  if (!has(c, 3)) return [];
  const perf = c.focus.has("Performance");
  return [
    "## Step 3 — Feature Validation (Playwright MCP, live browser)",
    "",
    ...bullets([
      loginLine(c),
      c.mode === "api" ? "Execute the approved **TC-API** cases only, in priority order, using an API client (base URL and tokens from env vars)." : "Execute the approved test cases in priority order.",
    ]),
    "",
    "For each test case:",
    ...bullets([
      c.mode !== "api" && "take a screenshot at the key point",
      consoleCheck,
      "flag any 4xx / 5xx network response, even if the UI looks fine (`browser_network_requests`)",
      "record expected vs actual, **Pass / Fail / Blocked**, and severity",
      impact(c) && "for consumer areas, note whether the change was visible or transparent",
    ]),
    "",
    ...bullets([
      c.be && "For backend test cases, capture the real request and response and compare them with the Step 1 contract.",
      "For Blocked test cases, give the exact reason and the downstream test cases that are also affected. Never skip a test case silently.",
      perf && "**Performance focus:** capture network timing and payload size for each changed call, check for N+1 request patterns and re-render loops, and compare before / after where possible (e.g. against production or the base branch).",
    ]),
    "",
    "No automation code in this step.",
    "",
  ];
}

export function step4(c: SessionContext): Lines {
  if (!has(c, 4)) return [];
  const uiFocus = c.focus.has("UI / UX");
  return [
    "## Step 4 — UI Validation",
    "",
    ...bullets([
      c.beOnly && "Only screens that consume the changed endpoints (from the impact radius).",
      "layout, alignment, typography, spacing and colour",
      "responsive checks at 1280px and 1440px",
      "icons, buttons and labels",
      "loading, spinner and skeleton states",
      "adjacent components, for regressions",
      "every theme or colour mode, if the product has them",
      uiFocus && "**UI / UX focus:** zoom to 200% (no clipped or overlapping content), long text and overflow (long names, long translations, many items), and RTL layout if the product supports RTL languages",
      "console check after each significant interaction",
    ]),
    "",
    "No automation code.",
    "",
  ];
}

export function step5(c: SessionContext): Lines {
  if (!has(c, 5)) return [];
  const uiFocus = c.focus.has("UI / UX");
  return [
    "## Step 5 — UX Validation",
    "",
    ...bullets([
      "flow continuity — no dead ends or unexpected jumps",
      "clear, actionable error messages",
      "success, failure and loading feedback",
      "query parameters preserved across redirects",
      "tab order, focus states and contrast",
      uiFocus && "**UI / UX focus:** keyboard-only completion of each flow, visible focus at 200% zoom, and error recovery without losing typed input",
      "console check after each flow",
    ]),
    "",
    "No automation code.",
    "",
  ];
}

export function step6(c: SessionContext): Lines {
  if (!has(c, 6)) return [];
  const sec = c.focus.has("Security");
  return [
    "## Step 6 — Exploratory",
    "",
    ...bullets([
      impact(c) && "Drive this from the impact radius table: visit every UI area that uses each high-blast-radius utility, hook or context provider.",
      "Manually run the core flow of each existing spec found in Step 1.",
      "Cover boundaries, empty states, invalid inputs, filter combinations, adjacent modules, and reload / navigate-back persistence.",
      sec && "**Security focus:** tamper with IDs in URLs and requests (other users' records), remove or expire tokens, and enter XSS payloads (`<script>alert(1)</script>`, `\"><img src=x onerror=alert(1)>`) in every input; confirm nothing executes and nothing leaks.",
      c.mode === "security" && "Weight this step toward security: spend at least half of the exploratory time on the security checks above.",
      c.focus.has("Performance") && "**Performance focus:** repeat the heaviest flows with throttled network and large data sets; note slow requests and UI jank.",
      "Console check after each sweep.",
      "Done when every consumer area has been checked. Mark areas you can't reach as **Untested**. Don't expand scope beyond Step 1.",
    ]),
    "",
  ];
}

// ---------------------------------------------------------------- Steps 7–10

export function step7(c: SessionContext): Lines {
  if (!has(c, 7)) return [];
  return [
    "## Step 7 — Report",
    "",
    "| Finding ID | TC / Exploratory | Scenario | Expected (from Step 1) | Actual | Reproducibility | Screenshot | Severity | Likely Root Cause |",
    "|---|---|---|---|---|---|---|---|---|",
    "",
    ...bullets([
      "Finding IDs: `BUG-01`, `BUG-02` …; TC reference or \"Exploratory\".",
      "Reproducibility: Always / Intermittent / Requires specific state.",
      "Likely root cause: the specific code change from Step 1.",
      'Tag indirect impact as "Indirect impact — traced via Step 1 impact radius from `<file>`".',
      "Flag findings in areas that already have specs — that spec needs updating.",
    ]),
    "",
    "**STOP — wait for the team's findings before Step 8.**",
    "",
  ];
}

export function step8(c: SessionContext): Lines {
  if (!has(c, 8)) return [];
  return [
    "## Step 8 — Defect Consolidation",
    "",
    ...bullets([
      "Merge the team's findings with yours.",
      "De-duplicate, assign final IDs, and map each defect to a root-cause change.",
      "Flag risk areas the plan missed.",
      "For every impact-table area with zero findings, state whether it is **clean** or **untested**.",
    ]),
    "",
  ];
}

export function step9(c: SessionContext): Lines {
  if (!has(c, 9)) return [];
  const cat = categories(c);
  const blocks: Lines = [];
  if (cat.A) blocks.push("- **Category A — Feature specs** `@feature @smoke`: happy path, one file per feature area — `<area>.spec.ts`");
  if (cat.B) blocks.push("- **Category B — Defect specs** `@regression @critical`: one test per confirmed bug — `<area>.defect.spec.ts`");
  if (cat.C) blocks.push("- **Category C — Regression guards** `@regression`: edge cases and consumers from the impact table — `<area>.regression.spec.ts`");
  if (cat.D) blocks.push("- **Category D — API contract specs** `@regression @api`: one per changed endpoint covering success, error, missing required fields and renamed fields; base URL and tokens from env vars — `<endpoint>.api.spec.ts`");
  const ref = c.inputs.specRef.replace(/\s+$/, "");
  return [
    "## Step 9 — Automation Generation (only after Steps 3–8)",
    "",
    ...(blocks.length ? blocks : ["- No spec category applies to this session's inputs — explain what you would automate instead."]),
    "",
    "Rules:",
    ...bullets([
      "use selectors you observed live (prefer roles, labels and test ids)",
      "assert the correct behaviour, not the current broken behaviour",
      "no hardcoded paths, URLs or credentials — env vars only (e.g. `BASE_URL`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `API_TOKEN`)",
      "self-contained Page Object Models",
      "shared helpers inline, or marked `// TODO: move to shared helpers`",
      "droppable into any Playwright project",
      ref ? "mirror the style reference below (structure, naming, fixtures, assertions)" : "no style reference was given — use idiomatic Playwright Test style",
      "readable test titles",
      "`// TODO:` for any value that couldn't be confirmed",
      "placeholders for client data (`<customer_name>`, `<account_id>`)",
      "one code block per spec; never combine unrelated features in one file",
    ]),
    "",
    ...(ref ? ["Style reference:", "", "```ts", ...ref.replace(/\r\n?/g, "\n").split("\n"), "```", ""] : []),
  ];
}

export function step10(c: SessionContext): Lines {
  if (!has(c, 10)) return [];
  const groups: [number[], string, string[]][] = [
    [[1], "Step 1", ["every changed file analysed (frontend and backend)", contract(c) ? "contract mismatches listed, each marked P1" : "", impact(c) ? "impact radius table complete" : "", aiReview(c) ? "AI code quality flags table (or \"no flags raised\")" : ""]],
    [[2], "Step 2", ["test plan approved", "ordering, prerequisites, out-of-scope reasons and coverage rules met"]],
    [[3], "Step 3", ["every approved test case executed with Pass / Fail / Blocked", "screenshots, console and network checks recorded"]],
    [[4, 5, 6], "Steps 4–6", ["UI, UX and exploratory checks done", "every consumer area checked or marked Untested"]],
    [[7, 8], "Steps 7–8", ["report table complete", "team findings merged and every impact-table area marked clean or untested"]],
    [[9], "Step 9", ["specs generated for each applicable category", "no hardcoded URLs, credentials or client data"]],
  ];
  const lines: Lines = ["## Step 10 — Session Closure Checklist", ""];
  for (const [ids, label, items] of groups) {
    if (!ids.some((id) => c.steps.has(id))) continue;
    lines.push(`**${label}**`, ...items.filter(Boolean).map((t) => `- [ ] ${t}`), "");
  }
  lines.push("Then give:", ...bullets(["open risks", "untested areas", "a **Go / No-Go recommendation** with its reason"]), "");
  return lines;
}

export function approvedAppendix(c: SessionContext): Lines {
  return c.approved ? ["---", "", `## Approved Steps 1–2 (from TC Library: ${c.approved.name})`, "", c.approved.output.trim(), ""] : [];
}

export const STEP_SECTIONS = [step1, step2, step3, step4, step5, step6, step7, step8, step9, step10];
