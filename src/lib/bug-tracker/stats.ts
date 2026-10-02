/** % valid, rounded; null when there are no issues. */
export function percentValid(valid: number, total: number): number | null {
  return total > 0 ? Math.round((valid / total) * 100) : null;
}

export type PillTone = "green" | "amber" | "red" | "none";

/** Green ≥ 95%, amber 85–94%, red below 85%, grey when there are no issues. */
export function validTone(percent: number | null): PillTone {
  if (percent === null) return "none";
  if (percent >= 95) return "green";
  if (percent >= 85) return "amber";
  return "red";
}
