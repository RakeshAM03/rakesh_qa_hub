/** Date helpers for generated data. Everything is UTC so output doesn't depend on the viewer's time zone. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Fills date tokens without checking the date is real (used for invalid-date edge cases too). */
export function formatParts(p: { y: number; m: number; d: number; h?: number; min?: number; s?: number }, format: string): string {
  const h = p.h ?? 0;
  return format.replace(/YYYY|MMM|MM|DD|HH|hh|mm|ss|A/g, (t) => {
    switch (t) {
      case "YYYY":
        return pad(p.y, 4);
      case "MMM":
        return MONTHS[(p.m - 1 + 12) % 12];
      case "MM":
        return pad(p.m);
      case "DD":
        return pad(p.d);
      case "HH":
        return pad(h);
      case "hh":
        return pad(h % 12 === 0 ? 12 : h % 12);
      case "mm":
        return pad(p.min ?? 0);
      case "ss":
        return pad(p.s ?? 0);
      default:
        return h < 12 ? "AM" : "PM";
    }
  });
}

/** `format` uses YYYY MMM MM DD HH hh mm ss A, or "iso" for an ISO 8601 UTC timestamp. */
export function formatDate(d: Date, format: string): string {
  if (format === "iso") return d.toISOString();
  return formatParts(
    { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes(), s: d.getUTCSeconds() },
    format,
  );
}

/** "YYYY-MM-DD" → UTC midnight, or null when empty/invalid. */
export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
}

export const shiftYears = (d: Date, years: number) => new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));

export const todayIso = () => new Date().toISOString().slice(0, 10);
