/** Builds the PR QA Session prompt from small sections (see sections.ts). */

import { sessionContext, type SessionInputs } from "./inputs";
import { approvedAppendix, dataSafety, inputsTable, prerequisites, resumeBlock, riskContext, scopeNotes, STEP_SECTIONS, title } from "./sections";

export { NOT_PROVIDED, diffCommand, prInfo, riskLevel, sanitizeLoginUrl, sessionContext, type SessionInputs } from "./inputs";

export function buildPrompt(inputs: SessionInputs): string {
  const c = sessionContext(inputs);
  const lines = [
    ...title(),
    ...prerequisites(c),
    ...dataSafety(),
    ...inputsTable(c),
    ...riskContext(c),
    ...scopeNotes(c),
    ...resumeBlock(c),
    ...STEP_SECTIONS.flatMap((s) => s(c)),
    ...approvedAppendix(c),
  ];
  // No runs of blank lines; no trailing blank line.
  return lines
    .filter((l, n, a) => !(l === "" && a[n - 1] === ""))
    .join("\n")
    .trimEnd();
}
