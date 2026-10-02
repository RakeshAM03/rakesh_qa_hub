/** The focused code review prompt from the spec, for one or more PR URLs. */
export function buildReviewPrompt(prUrls: string[]): string {
  return `You are a senior engineer doing a focused code review of these PRs:
${prUrls.map((u) => `- ${u}`).join("\n")}

Use \`gh pr view\` and \`gh pr diff\` to read each PR. Review only the changed code and
the code it directly affects. Look for:
- Logic Error — wrong conditions, ordering, state or data handling
- Regression Risk — changes that can break existing behaviour
- Security — injection, auth/permission gaps, secrets, unsafe input handling
- Missing Error Handling — unhandled failures, missing retries/rollbacks, silent errors
- Requirement Fidelity — code that doesn't match the PR description or ticket

Severity:
- P0 — blocks release; data loss, security hole, broken core flow
- P1 — must fix soon; wrong behaviour in real scenarios
(lower levels optional)

Output ONLY real issues, no style nits, as a markdown table with these columns:
| Repo | Flag Type | Location | Detail | Severity | Suggested Fix |
- Repo: \`owner/name\`
- Location: \`#<PR number> > <file path>:<line>\`
- Detail: what is wrong and the concrete scenario where it fails
- Suggested Fix: the specific change to make`;
}
