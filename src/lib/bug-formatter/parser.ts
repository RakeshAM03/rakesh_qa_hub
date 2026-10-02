import { DEFAULT_SEVERITY, splitSteps, toSeverity, type BugInput } from "./types";

type Field = "steps" | "expected" | "actual" | "environmentUrl" | "notes";

const LABELS: Record<string, Field> = {
  steps: "steps",
  "steps to reproduce": "steps",
  expected: "expected",
  "expected result": "expected",
  actual: "actual",
  "actual result": "actual",
  environment: "environmentUrl",
  env: "environmentUrl",
  notes: "notes",
  note: "notes",
};

// "Steps: ...", "- **Expected:** ...", "Env — ..." (label, then ":" or a long dash)
const LABEL_RE = new RegExp(
  `^\\s*(?:[-*•]\\s+)?(?:\\*\\*|__)?(${Object.keys(LABELS)
    .sort((a, b) => b.length - a.length)
    .join("|")})(?:\\*\\*|__)?\\s*(?::|—|–)\\s*(?:\\*\\*|__)?\\s*(.*)$`,
  "i",
);
const ITEM_RE = /^(\s*)\d+[.)]\s+(.*)$/;

function stripMarkdown(text: string) {
  return text.replace(/\*\*|__|`/g, "").trim();
}

/** Severity + title from an item's first line, e.g. "**P1 — Login broken**". */
function parseHeading(line: string): { severity: BugInput["severity"]; title: string } {
  const text = stripMarkdown(line);
  const match = text.match(/^\[?\(?(P[0-3])\b\)?\]?\s*(?:[—–\-:|]\s*)?(.*)$/i);
  if (match) {
    return { severity: toSeverity(match[1]) ?? DEFAULT_SEVERITY, title: match[2].trim() };
  }
  // Severity at the end: "Login broken (P1)" or "Login broken — P1"
  const trailing = text.match(/^(.*?)\s*(?:[—–\-:|]\s*)?\[?\(?\b(P[0-3])\)?\]?$/i);
  if (trailing && trailing[1]) {
    return { severity: toSeverity(trailing[2]) ?? DEFAULT_SEVERITY, title: trailing[1].trim() };
  }
  return { severity: DEFAULT_SEVERITY, title: text };
}

/** Splits the text into items at numbered lines with the smallest indent. */
function splitItems(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const indents = lines
    .map((l) => l.match(ITEM_RE)?.[1].replace(/\t/g, "    ").length)
    .filter((n): n is number => n !== undefined);
  if (indents.length === 0) return [];
  const itemIndent = Math.min(...indents);

  const items: string[][] = [];
  let open = false;
  let afterBlank = false;
  for (const line of lines) {
    const m = line.match(ITEM_RE);
    const indent = (line.match(/^\s*/)?.[0] ?? "").replace(/\t/g, "    ").length;
    if (m && m[1].replace(/\t/g, "    ").length === itemIndent) {
      items.push([m[2]]);
      open = true;
    } else if (open && afterBlank && indent <= itemIndent && !LABEL_RE.test(line)) {
      // Unindented prose after a blank line ("That's all.") closes the item.
      open = false;
    } else if (open) {
      items[items.length - 1].push(line);
    }
    afterBlank = line.trim() === "";
  }
  return items;
}

/**
 * Rule-based parser for Claude Code findings:
 * numbered items, a P0–P3 severity on the first line (default P2), and
 * labelled fields (Steps, Expected, Actual, Environment/Env, Notes) whose
 * values may continue over several lines until the next label or item.
 * Unlabelled lines before the first label are kept as notes.
 */
export function parseFindings(text: string): BugInput[] {
  const bugs: BugInput[] = [];

  for (const [heading, ...body] of splitItems(text)) {
    const { severity, title } = parseHeading(heading);
    if (!title) continue;

    const values: Partial<Record<Field, string[]>> = {};
    const preamble: string[] = [];
    let current: Field | null = null;

    for (const raw of body) {
      const match = raw.match(LABEL_RE);
      if (match) {
        current = LABELS[match[1].toLowerCase()];
        values[current] = match[2].trim() ? [match[2].trim()] : [];
      } else if (raw.trim()) {
        (current ? (values[current] ??= []) : preamble).push(raw.trim());
      }
    }

    const join = (field: Field) => {
      const v = values[field]?.map(stripMarkdown).join("\n").trim();
      return v ? v : undefined;
    };
    const notes = [preamble.map(stripMarkdown).join("\n").trim(), join("notes")]
      .filter(Boolean)
      .join("\n");

    bugs.push({
      title,
      severity,
      steps: splitSteps(values.steps?.map(stripMarkdown).join("\n")),
      expected: join("expected"),
      actual: join("actual"),
      environmentUrl: join("environmentUrl"),
      notes: notes || undefined,
    });
  }
  return bugs;
}
