export const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const DEFAULT_SEVERITY: Severity = "P2";

export type BugSource = "CLAUDE" | "MANUAL" | "CSV";

export type Bug = {
  id: string;
  title: string;
  severity: Severity;
  environmentUrl?: string;
  steps: string[];
  expected?: string;
  actual?: string;
  notes?: string;
  source: BugSource;
  createdAt: string;
};

/** A bug before it gets an id, source and timestamp. */
export type BugInput = Omit<Bug, "id" | "source" | "createdAt">;

/** Reads "P0".."P3" (also "p1", "1", "[P2]"); anything else is null. */
export function toSeverity(value: string | undefined | null): Severity | null {
  const match = value?.trim().match(/^\[?p?([0-3])\]?$/i);
  return match ? (`P${match[1]}` as Severity) : null;
}

/**
 * Turns a steps value into a list. Multi-line values keep one step per line;
 * a single line is split on "," ";" ">" "->" or "→". List markers are dropped
 * and each step starts with a capital letter.
 */
export function splitSteps(value: string | undefined | null): string[] {
  if (!value) return [];
  const lines = value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const parts = lines.length > 1 ? lines : (lines[0] ?? "").split(/\s*(?:->|→|>|;|,)\s*/);
  return parts
    .map((p) => p.replace(/^(?:\d+[.)]|[-*•])\s+/, "").trim())
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
}
