import { SEVERITIES, type Bug } from "./types";

const rank = (b: Bug) => SEVERITIES.indexOf(b.severity);

/**
 * Inserts new bugs keeping the list sorted by severity (P0 first), and after
 * existing bugs of the same severity. Manual reordering is preserved.
 */
export function insertBySeverity(list: Bug[], added: Bug[]): Bug[] {
  const next = [...list];
  for (const bug of added) {
    let at = next.length;
    for (let i = next.length - 1; i >= 0; i--) {
      if (rank(next[i]) <= rank(bug)) break;
      at = i;
    }
    next.splice(at, 0, bug);
  }
  return next;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function severityCounts(bugs: Bug[]) {
  return Object.fromEntries(
    SEVERITIES.map((s) => [s, bugs.filter((b) => b.severity === s).length]),
  ) as Record<(typeof SEVERITIES)[number], number>;
}
