/** Calendar-day helpers. Dates travel as "YYYY-MM-DD" strings to avoid time-zone shifts. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date of `d` as YYYY-MM-DD. */
export const toLocalIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** YYYY-MM-DD → local Date at midnight (for date pickers). */
export function isoToLocalDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const todayIso = () => toLocalIso(new Date());

export function addDaysIso(iso: string, days: number) {
  const d = isoToLocalDate(iso);
  d.setDate(d.getDate() + days);
  return toLocalIso(d);
}

/** "2026-10-02" → "02/10/2026" */
export function isoToDdMmYyyy(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const longFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
/** "2026-10-02" → "Oct 2, 2026" */
export const isoToLong = (iso: string) => longFmt.format(isoToLocalDate(iso));

const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
/** "2026-10-02" → "Oct 2" */
export const isoToShort = (iso: string) => shortFmt.format(isoToLocalDate(iso));
