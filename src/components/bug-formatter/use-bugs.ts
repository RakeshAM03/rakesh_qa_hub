"use client";

import { useCallback, useMemo } from "react";
import { z } from "zod";

import { insertBySeverity, moveItem } from "@/lib/bug-formatter/list";
import { SEVERITIES, type Bug, type BugInput, type BugSource } from "@/lib/bug-formatter/types";
import { useLocalStorage } from "@/hooks/use-local-storage";

const STORAGE_KEY = "qa-hub:bug-formatter:findings";

const bugSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(SEVERITIES),
  environmentUrl: z.string().optional(),
  steps: z.array(z.string()),
  expected: z.string().optional(),
  actual: z.string().optional(),
  notes: z.string().optional(),
  source: z.enum(["CLAUDE", "MANUAL", "CSV"]),
  createdAt: z.string(),
});

function parse(raw: string | null): Bug[] {
  if (!raw) return [];
  try {
    const result = z.array(bugSchema).safeParse(JSON.parse(raw));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

/** The Findings list, kept as a localStorage draft so it survives a refresh. */
export function useBugs() {
  const [raw, setRaw] = useLocalStorage(STORAGE_KEY);
  const bugs = useMemo(() => parse(raw), [raw]);

  const update = useCallback(
    (fn: (list: Bug[]) => Bug[]) => setRaw((prev) => JSON.stringify(fn(parse(prev)))),
    [setRaw],
  );

  const add = useCallback(
    (inputs: BugInput[], source: BugSource) => {
      const now = new Date().toISOString();
      const added = inputs.map((input) => ({
        ...input,
        id: crypto.randomUUID(),
        source,
        createdAt: now,
      }));
      update((list) => insertBySeverity(list, added));
    },
    [update],
  );

  const replace = useCallback(
    (id: string, input: BugInput) =>
      update((list) => list.map((b) => (b.id === id ? { ...b, ...input } : b))),
    [update],
  );

  const remove = useCallback(
    (id: string) => update((list) => list.filter((b) => b.id !== id)),
    [update],
  );

  const move = useCallback(
    (from: number, to: number) => update((list) => moveItem(list, from, to)),
    [update],
  );

  const clear = useCallback(() => setRaw(null), [setRaw]);

  return { bugs, add, replace, remove, move, clear };
}
