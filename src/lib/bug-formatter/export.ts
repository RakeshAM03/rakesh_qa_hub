import type { Bug } from "./types";

/** Markdown for one bug (the spec's export format); empty sections are left out. */
export function bugToMarkdown(bug: Bug): string {
  const parts = [`## [${bug.severity}] ${bug.title}`];
  if (bug.environmentUrl) parts.push(`**Environment:** ${bug.environmentUrl}`);
  if (bug.steps.length) {
    parts.push(
      ["**Steps to Reproduce**", ...bug.steps.map((s, i) => `${i + 1}. ${s}`)].join("\n"),
    );
  }
  const results = [
    bug.expected && `**Expected Result:** ${bug.expected}`,
    bug.actual && `**Actual Result:** ${bug.actual}`,
  ].filter(Boolean);
  if (results.length) parts.push(results.join("\n"));
  if (bug.notes) parts.push(`**Notes:** ${bug.notes}`);
  return parts.join("\n\n");
}

export function bugsToMarkdown(bugs: Bug[]): string {
  return bugs.map(bugToMarkdown).join("\n\n---\n\n");
}

/** Jira wiki markup. Braces and brackets are escaped so they don't become macros or links. */
function jiraEscape(text: string) {
  return text.replace(/([{}[\]|])/g, "\\$1");
}

export function bugToJira(bug: Bug): string {
  const parts = [`h2. \\[${bug.severity}\\] ${jiraEscape(bug.title)}`];
  if (bug.environmentUrl) parts.push(`*Environment:* ${bug.environmentUrl}`);
  if (bug.steps.length) {
    parts.push(["*Steps to Reproduce*", ...bug.steps.map((s) => `# ${jiraEscape(s)}`)].join("\n"));
  }
  const results = [
    bug.expected && `*Expected Result:* ${jiraEscape(bug.expected)}`,
    bug.actual && `*Actual Result:* ${jiraEscape(bug.actual)}`,
  ].filter(Boolean);
  if (results.length) parts.push(results.join("\n"));
  if (bug.notes) parts.push(`*Notes:* ${jiraEscape(bug.notes)}`);
  return parts.join("\n\n");
}

export function bugsToJira(bugs: Bug[]): string {
  return bugs.map(bugToJira).join("\n\n----\n\n");
}

/** Slack mrkdwn: & < > must be escaped. */
function slackEscape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function bugToSlack(bug: Bug): string {
  const lines = [`*[${bug.severity}] ${slackEscape(bug.title)}*`];
  if (bug.environmentUrl) lines.push(`• *Environment:* ${slackEscape(bug.environmentUrl)}`);
  if (bug.steps.length) {
    lines.push("• *Steps to Reproduce*");
    bug.steps.forEach((s, i) => lines.push(`    ${i + 1}. ${slackEscape(s)}`));
  }
  if (bug.expected) lines.push(`• *Expected Result:* ${slackEscape(bug.expected)}`);
  if (bug.actual) lines.push(`• *Actual Result:* ${slackEscape(bug.actual)}`);
  if (bug.notes) lines.push(`• *Notes:* ${slackEscape(bug.notes)}`);
  return lines.join("\n");
}

export function bugsToSlack(bugs: Bug[]): string {
  return bugs.map(bugToSlack).join("\n\n");
}
