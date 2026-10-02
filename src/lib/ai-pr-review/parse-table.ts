import { toFlagType, type FlagSeverity, type FlagTypeKey } from "./constants";
import { parseLocation } from "./location";

export type ParsedFlag = {
  repo: string;
  flagType: FlagTypeKey | null;
  /** Raw Flag Type text, kept so an unknown type can be shown and fixed. */
  flagTypeText: string;
  location: string;
  prNumber: number | null;
  filePath: string | null;
  line: number | null;
  detail: string;
  severity: FlagSeverity | null;
  severityText: string;
  suggestedFix: string;
};

const COLUMNS = {
  repo: ["repo", "repository"],
  flagType: ["flag type", "type", "flag"],
  location: ["location", "file", "where"],
  detail: ["detail", "details", "description", "issue"],
  severity: ["severity", "priority"],
  suggestedFix: ["suggested fix", "fix", "suggestion", "recommendation"],
} as const;
type Column = keyof typeof COLUMNS;
const REQUIRED: Column[] = ["flagType", "detail", "severity"];

/** Splits a markdown table row into cells, honouring escaped pipes and pipes inside `code`. */
export function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inCode = false;
  const text = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && text[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (ch === "`") {
      inCode = !inCode;
      cell += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

const isSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const clean = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\*\*|__/g, "")
    .trim();

function mapHeader(cells: string[]): Partial<Record<Column, number>> | null {
  const map: Partial<Record<Column, number>> = {};
  cells.forEach((cell, index) => {
    const name = clean(cell).toLowerCase();
    for (const [col, aliases] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
      if (map[col] === undefined && aliases.includes(name)) {
        map[col] = index;
        break;
      }
    }
  });
  return REQUIRED.every((c) => map[c] !== undefined) ? map : null;
}

/**
 * Extracts flags from the first markdown table in `text` whose header has the
 * expected columns (matched case-insensitively). Surrounding text is ignored.
 */
export function parseFlagTable(text: string): { flags: ParsedFlag[]; found: boolean } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes("|") || !isSeparator(lines[i + 1])) continue;
    const header = mapHeader(splitRow(lines[i]));
    if (!header) continue;

    const flags: ParsedFlag[] = [];
    for (let j = i + 2; j < lines.length && lines[j].includes("|"); j++) {
      const cells = splitRow(lines[j]);
      const get = (c: Column) => (header[c] === undefined ? "" : clean(cells[header[c]!] ?? ""));
      if (cells.every((c) => !c.trim())) continue;
      const flagTypeText = get("flagType");
      const severityText = get("severity");
      const sev = severityText.match(/\bP([0-3])\b/i)?.[1];
      const location = get("location").replace(/`/g, "");
      flags.push({
        repo: get("repo").replace(/`/g, ""),
        flagType: toFlagType(flagTypeText),
        flagTypeText,
        location,
        ...parseLocation(location),
        detail: get("detail"),
        severity: sev === "0" || sev === "1" ? (`P${sev}` as FlagSeverity) : null,
        severityText,
        suggestedFix: get("suggestedFix"),
      });
    }
    return { flags, found: true };
  }
  return { flags: [], found: false };
}
