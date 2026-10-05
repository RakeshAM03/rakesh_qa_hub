/** Reads a pasted Claude answer: JSON (fenced or not, with text around it), else a Markdown table. */

import { validateResult, type ParseOutcome } from "./schema";

/** Balanced {…} or […] starting at `start`, skipping braces inside strings. */
function balanced(text: string, start: number): string | null {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return c === close ? text.slice(start, i + 1) : null;
    }
  }
  return null;
}

/** All JSON candidates in the text: fenced blocks first, then each balanced object/array. */
export function jsonCandidates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/```(?:json|JSON)?\s*\n([\s\S]*?)```/g)) out.push(m[1].trim());
  for (let i = 0; i < text.length && out.length < 50; i++) {
    if (text[i] === "{" || text[i] === "[") {
      const b = balanced(text, i);
      if (b) {
        out.push(b);
        i += b.length - 1;
      }
    }
  }
  return out;
}

/** The first parsable JSON value that looks like an answer (object with testCases, or an array). */
export function extractJson(text: string): unknown | undefined {
  let firstParsed: unknown;
  for (const c of jsonCandidates(text)) {
    try {
      const v = JSON.parse(c);
      if (firstParsed === undefined) firstParsed = v;
      if (Array.isArray(v) || (v && typeof v === "object" && "testCases" in v)) return v;
    } catch {
      // try the next candidate
    }
  }
  return firstParsed;
}

// ---------- Markdown table fallback ----------

const ALIASES: Record<string, string[]> = {
  id: ["id", "tc id", "test case id", "test id", "#"],
  title: ["title", "test case", "test case title", "scenario", "name", "description", "test scenario"],
  category: ["category"],
  type: ["type", "test type"],
  priority: ["priority", "severity"],
  preconditions: ["preconditions", "precondition", "pre-conditions", "prerequisites"],
  steps: ["steps", "test steps", "steps to reproduce", "procedure"],
  testData: ["test data", "data", "input", "inputs"],
  expectedResult: ["expected result", "expected", "expected results", "expected outcome"],
  requirementRef: ["requirement", "requirement ref", "ac", "acceptance criteria", "req"],
  automationCandidate: ["automation", "automation candidate", "automate", "automatable"],
};

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\" && body[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (c === "`") {
      inCode = !inCode;
      cur += c;
    } else if (c === "|" && !inCode) {
      cells.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

const isDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const clean = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").replace(/\*\*(.*?)\*\*/g, "$1").trim();

export function parseMarkdownTable(text: string): Record<string, string>[] | null {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes("|") || !isDivider(lines[i + 1])) continue;
    const header = splitRow(lines[i]).map((h) => clean(h).toLowerCase().replace(/[*_`]/g, ""));
    const map = header.map((h) => Object.entries(ALIASES).find(([, names]) => names.includes(h))?.[0] ?? null);
    if (!map.includes("title") || !(map.includes("expectedResult") || map.includes("steps"))) continue;
    const rows: Record<string, string>[] = [];
    for (let j = i + 2; j < lines.length && lines[j].includes("|"); j++) {
      const cells = splitRow(lines[j]);
      const row: Record<string, string> = {};
      map.forEach((key, k) => {
        if (key && cells[k] !== undefined) row[key] = clean(cells[k]);
      });
      if (row.title) rows.push(row);
    }
    if (rows.length) return rows;
  }
  return null;
}

/** Steps from one cell: "1. a 2. b", "a; b", or one per line. */
export function splitSteps(cell: string): string[] {
  const t = cell.trim();
  if (!t) return [];
  if (t.includes("\n")) return t.split("\n").map((s) => s.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim()).filter(Boolean);
  const numbered = t.split(/\s*(?:^|\s)\d+[.)]\s+/).map((s) => s.trim()).filter(Boolean);
  if (numbered.length > 1) return numbered;
  return t.split(/\s*;\s*/).filter(Boolean);
}

export type AnswerSource = "json" | "markdown";

export function parseAnswer(text: string): (ParseOutcome & { source?: AnswerSource }) {
  if (!text.trim()) return { ok: false, error: "Paste Claude's answer first." };
  const json = extractJson(text);
  let jsonError: string | null = null;
  if (json !== undefined) {
    const outcome = validateResult(Array.isArray(json) ? { testCases: json } : json);
    if (outcome.ok) return { ...outcome, source: "json" };
    jsonError = outcome.error;
  }
  const rows = parseMarkdownTable(text);
  if (rows) {
    const outcome = validateResult({ testCases: rows.map((r) => ({ ...r, steps: splitSteps(r.steps ?? "") })) });
    if (outcome.ok) return { ...outcome, source: "markdown" };
  }
  return {
    ok: false,
    error: jsonError ? `The JSON doesn't match the expected format — ${jsonError}` : "Couldn't find test cases: no JSON object or Markdown table with Title and Expected result columns.",
  };
}
