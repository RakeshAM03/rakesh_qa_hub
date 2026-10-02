import Papa from "papaparse";

import { DEFAULT_SEVERITY, splitSteps, toSeverity, type BugInput } from "./types";

export const CSV_MAX_BYTES = 2 * 1024 * 1024;

export const CSV_COLUMNS = [
  "Title",
  "Severity",
  "Steps",
  "Expected",
  "Actual",
  "Environment",
  "Notes",
] as const;

type Column = (typeof CSV_COLUMNS)[number];

/** Header aliases, matched case-insensitively after trimming. */
const HEADER_ALIASES: Record<string, Column> = {
  title: "Title",
  severity: "Severity",
  priority: "Severity",
  steps: "Steps",
  "steps to reproduce": "Steps",
  expected: "Expected",
  "expected result": "Expected",
  actual: "Actual",
  "actual result": "Actual",
  environment: "Environment",
  "environment url": "Environment",
  env: "Environment",
  notes: "Notes",
};

export type CsvResult = {
  bugs: BugInput[];
  /** Data rows without a Title. */
  skipped: number;
  /** Set when the file can't be used at all. */
  error?: string;
};

export function parseBugCsv(text: string): CsvResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? `__ignored:${h}`,
  });

  if (!parsed.meta.fields?.includes("Title")) {
    return { bugs: [], skipped: 0, error: 'The CSV needs a header row with a "Title" column.' };
  }

  const bugs: BugInput[] = [];
  let skipped = 0;
  for (const row of parsed.data) {
    const get = (c: Column) => row[c]?.trim() || undefined;
    const title = get("Title");
    if (!title) {
      skipped++;
      continue;
    }
    bugs.push({
      title,
      severity: toSeverity(get("Severity")) ?? DEFAULT_SEVERITY,
      steps: splitSteps(get("Steps")),
      expected: get("Expected"),
      actual: get("Actual"),
      environmentUrl: get("Environment"),
      notes: get("Notes"),
    });
  }
  return { bugs, skipped };
}

/** Contents of bug-template.csv: the header row and one example row. */
export function bugCsvTemplate(): string {
  return Papa.unparse({
    fields: [...CSV_COLUMNS],
    data: [
      [
        "Login button broken on mobile",
        "P1",
        "Open the app on mobile\nTap Login",
        "Login page opens",
        "Nothing happens",
        "https://staging.example.com",
        "Only on narrow screens",
      ],
    ],
  });
}
