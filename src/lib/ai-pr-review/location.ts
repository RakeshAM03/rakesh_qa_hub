export type ParsedLocation = { prNumber: number | null; filePath: string | null; line: number | null };

/**
 * Parses "#123 > src/app/page.tsx:42" (also "PR #123 › path", "#123 - path",
 * "path:42-50", "path#L42" or just "path"). Unknown parts are null.
 */
export function parseLocation(value: string): ParsedLocation {
  let text = value.replace(/[`*]/g, "").trim();
  let prNumber: number | null = null;
  const pr = text.match(/^(?:PR\s*)?#(\d+)\s*(?:>|›|»|→|-|—|:)?\s*/i);
  if (pr) {
    prNumber = Number(pr[1]);
    text = text.slice(pr[0].length);
  }
  let line: number | null = null;
  const lineMatch = text.match(/(?::|#L)(\d+)(?:-L?\d+)?$/);
  if (lineMatch) {
    line = Number(lineMatch[1]);
    text = text.slice(0, -lineMatch[0].length);
  }
  const filePath = text.trim() || null;
  return { prNumber, filePath, line };
}

export function formatLocation({ prNumber, filePath, line }: ParsedLocation): string {
  const file = filePath ? `${filePath}${line ? `:${line}` : ""}` : "";
  if (prNumber && file) return `#${prNumber} > ${file}`;
  if (prNumber) return `#${prNumber}`;
  return file;
}
