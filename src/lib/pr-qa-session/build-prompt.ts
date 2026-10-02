import { SESSION_STEPS, type FocusArea } from "@/config/pr-qa-templates";

export type SessionInputs = {
  frontendPr: string;
  backendPr: string;
  additionalPrs: string[];
  testEnvUrl: string;
  context: string;
  focusAreas: FocusArea[];
  /** Selected step ids (1–10), in any order. */
  steps: number[];
  specRef: string;
  /** Approved Step 1 + Step 2 output loaded from the TC Library. */
  approvedPlan?: { name: string; output: string } | null;
};

const APPROVED_STEP_TEXT: Record<number, string[]> = {
  1: ["Analyse the PR — already done and approved (see “Approved Steps 1–2” below). Skip."],
  2: ["Test Plan — already done and approved (see “Approved Steps 1–2” below). Skip."],
};

/** Each step's lines; continuation lines are indented under the step text when assembled. */
const STEP_TEXT: Record<number, (inputs: SessionInputs) => string[]> = {
  1: (i) => [
    "Analyse the PR — use `gh pr view` and `gh pr diff` to read the description,",
    "changed files and linked tickets. Summarise what changed and the risk areas.",
    ...(i.frontendPr.trim() && i.backendPr.trim()
      ? [
          "Both frontend and backend PRs are given: compare API contracts",
          "(endpoints, request/response fields, types) and flag mismatches.",
        ]
      : []),
  ],
  2: () => [
    "Test Plan — list test scenarios (positive, negative, edge, regression)",
    "with priority, based on the analysis.",
  ],
  3: () => [
    "Feature Validation — execute the functional scenarios on the test",
    "environment with Playwright MCP; record pass/fail with evidence.",
  ],
  4: () => ["UI Validation — check layout, alignment, responsiveness, visual states."],
  5: () => ["UX Validation — check flows, error messages, empty/loading states, accessibility basics."],
  6: () => ["Exploratory — free-form testing around the changed areas to find unexpected issues."],
  7: () => ["Report — summarise results in a table: scenario, result, evidence, notes."],
  8: () => [
    "Defect Consolidation — deduplicate failures into bugs, each with title,",
    "steps to reproduce, expected vs actual, severity, environment.",
  ],
  9: (i) => {
    const lines = [
      "Automation Generation — write Playwright TypeScript specs for the key",
      "scenarios.",
    ];
    const ref = i.specRef.replace(/\s+$/, "");
    if (!ref.trim()) return lines;
    lines[1] += " Follow the style of this reference spec:";
    return [...lines, "", "```ts", ...ref.replace(/\r\n?/g, "\n").split("\n"), "```"];
  },
  10: () => [
    "Session Closure Checklist — confirm every step is done, list open risks,",
    "and give a go / no-go recommendation.",
  ],
};

const orNot = (value: string, fallback = "not provided") => value.trim() || fallback;

/**
 * Assembles the copy-ready QA session prompt. Only the selected steps are
 * included, renumbered from 1 in their original order.
 *
 * With an approved plan from the TC Library, steps 1 and 2 are always listed
 * (marked as done) so the remaining steps start at 3, and the saved output is
 * appended for Claude to work from.
 */
export function buildPrompt(inputs: SessionInputs): string {
  const approved = inputs.approvedPlan?.output.trim() ? inputs.approvedPlan : null;
  const selected = SESSION_STEPS.filter(
    (s) => inputs.steps.includes(s.id) || (approved && (s.id === 1 || s.id === 2)),
  );
  const additional = inputs.additionalPrs.map((p) => p.trim()).filter(Boolean);

  const lines = [
    "You are a senior QA engineer running a full QA session on the PR(s) below,",
    "using the gh CLI and the Playwright MCP.",
    "",
    "## Inputs",
    `- Frontend PR: ${orNot(inputs.frontendPr)}`,
    `- Backend PR: ${orNot(inputs.backendPr)}`,
    `- Additional PRs: ${additional.length ? additional.join(", ") : "none"}`,
    `- Test environment: ${orNot(inputs.testEnvUrl)}`,
    `- Context: ${orNot(inputs.context, "none")}`,
    `- Focus areas: ${
      inputs.focusAreas.length ? `${inputs.focusAreas.join(", ")} — give these extra attention` : "none"
    }`,
    "",
    "## Steps",
    ...selected.map((step, index) => {
      const marker = `${index + 1}. `;
      const pad = " ".repeat(marker.length);
      const [first, ...rest] = (approved && APPROVED_STEP_TEXT[step.id]) || STEP_TEXT[step.id](inputs);
      return [marker + first, ...rest.map((l) => (l ? pad + l : l))].join("\n");
    }),
    "",
    "## Output",
    approved
      ? "Steps 1–2 are already approved: skip them and start from Step 3, using the approved\ntest plan below. Work through the remaining steps in order, and show the output of\neach step under its own heading."
      : "Work through the steps in order, and show the output of each step under its own heading.",
  ];
  if (approved) {
    lines.push(
      "",
      `## Approved Steps 1–2 (from TC Library: ${approved.name})`,
      "",
      approved.output.trim(),
    );
  }
  return lines.join("\n");
}
