/**
 * Customer Issue RCA dashboard: KPIs, chart data and leakage insights over the (product-filtered)
 * issue list. Pure — dates are UTC calendar days.
 */

import { KEYS } from "@/config/customer-issues";

import type { Lists } from "./model";

export type DashIssue = {
  createdDate: string;
  productId: string | null;
  module: string | null;
  dispositionId: string | null;
  rcaCategoryId: string | null;
  rcaSubcategoryId: string | null;
  caughtAtId: string | null;
  catchable: "YES" | "NO" | "PARTIAL" | null;
  whyEscapedId: string | null;
  detectedById: string | null;
  ownerTeamId: string | null;
  recurring: boolean;
  regressionRequired: boolean;
  preventionStatus: "NOT_STARTED" | "IN_PROGRESS" | "DONE";
  needsRca: boolean;
  caseCount: number;
  daysToResolve: number | null;
  daysToDetect: number | null;
};

export type Quarter = { from: string; to: string; label: string };

/** The quarter containing `today` and the one before it (half-open [from, to)). */
export function quarters(today: string): { current: Quarter; previous: Quarter } {
  const [y, m] = today.split("-").map(Number);
  const q = Math.floor((m - 1) / 3);
  const start = (yy: number, qq: number) => `${yy}-${String(qq * 3 + 1).padStart(2, "0")}-01`;
  const next = (yy: number, qq: number) => (qq === 3 ? start(yy + 1, 0) : start(yy, qq + 1));
  const [py, pq] = q === 0 ? [y - 1, 3] : [y, q - 1];
  return { current: { from: start(y, q), to: next(y, q), label: `Q${q + 1} ${y}` }, previous: { from: start(py, pq), to: next(py, pq), label: `Q${pq + 1} ${py}` } };
}

const inQ = (d: string, q: Quarter) => d >= q.from && d < q.to;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

export function kpis(issues: DashIssue[], lists: Lists, today: string) {
  const { current, previous } = quarters(today);
  const valid = issues.filter((i) => lists.key(i.dispositionId) === KEYS.VALID_BUG);
  const withCatchable = valid.filter((i) => i.catchable);
  const withDetected = issues.filter((i) => i.detectedById);
  return {
    quarter: current.label,
    previousQuarter: previous.label,
    thisQuarter: issues.filter((i) => inQ(i.createdDate, current)).length,
    lastQuarter: issues.filter((i) => inQ(i.createdDate, previous)).length,
    /** Yes + Partially, among Valid Bugs with Catchable set. */
    catchablePct: pct(withCatchable.filter((i) => i.catchable !== "NO").length, withCatchable.length),
    /** Detected by = Customer, among issues with Detected by set. */
    customerFirstPct: pct(withDetected.filter((i) => lists.key(i.detectedById) === KEYS.CUSTOMER).length, withDetected.length),
    needsRca: issues.filter((i) => i.needsRca).length,
    missingCases: valid.filter((i) => i.regressionRequired && i.caseCount === 0).length,
    recurring: issues.filter((i) => i.recurring).length,
    avgDaysToResolve: avg(issues.map((i) => i.daysToResolve)),
    avgDaysToDetect: avg(issues.map((i) => i.daysToDetect)),
    preventionsNotDone: valid.filter((i) => i.preventionStatus !== "DONE").length,
    othersPct: pct(valid.filter((i) => lists.key(i.rcaCategoryId) === KEYS.OTHERS).length, valid.filter((i) => i.rcaCategoryId).length),
  };
}

export type Bar = { id: string; name: string; count: number };

/** Count by a list field, biggest first (unset values as "Not set" when `includeUnset`). */
export function breakdown(issues: DashIssue[], lists: Lists, field: keyof Pick<DashIssue, "dispositionId" | "rcaCategoryId" | "rcaSubcategoryId" | "caughtAtId" | "whyEscapedId" | "ownerTeamId">, includeUnset = false): Bar[] {
  const m = new Map<string, number>();
  for (const i of issues) {
    const k = i[field] ?? (includeUnset ? "" : null);
    if (k === null) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([id, count]) => ({ id, name: id ? (lists.name(id) ?? "Unknown") : "Not set", count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Sub-categories of one main category (drill-down). */
export const subBreakdown = (issues: DashIssue[], lists: Lists, categoryId: string) => breakdown(issues.filter((i) => i.rcaCategoryId === categoryId), lists, "rcaSubcategoryId", true);

export function topModules(issues: DashIssue[], n = 8): Bar[] {
  const m = new Map<string, number>();
  for (const i of issues) if (i.module?.trim()) m.set(i.module.trim(), (m.get(i.module.trim()) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ id: name, name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, n);
}

/** Issues per month (last `months` months, oldest first), split by product id ("" = no product). */
export function perMonth(issues: DashIssue[], today: string, months = 12) {
  const [y, m] = today.split("-").map(Number);
  const keys: string[] = [];
  for (let k = months - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const rows = keys.map((month) => ({ month, total: 0, byProduct: {} as Record<string, number> }));
  const at = new Map(rows.map((r) => [r.month, r]));
  for (const i of issues) {
    const row = at.get(i.createdDate.slice(0, 7));
    if (!row) continue;
    row.total++;
    const p = i.productId ?? "";
    row.byProduct[p] = (row.byProduct[p] ?? 0) + 1;
  }
  return rows;
}

/** Catchable Yes / Partially / No / Not set per product (Valid Bugs). */
export function catchableByProduct(issues: DashIssue[], lists: Lists) {
  const m = new Map<string, { YES: number; PARTIAL: number; NO: number; UNSET: number }>();
  for (const i of issues.filter((x) => lists.key(x.dispositionId) === KEYS.VALID_BUG)) {
    const k = i.productId ?? "";
    const row = m.get(k) ?? { YES: 0, PARTIAL: 0, NO: 0, UNSET: 0 };
    row[i.catchable ?? "UNSET"]++;
    m.set(k, row);
  }
  return [...m.entries()].map(([id, v]) => ({ id, name: id ? (lists.name(id) ?? "Unknown") : "No product", ...v })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Auto text that points at where the process leaks. */
export function leakageInsights(issues: DashIssue[], lists: Lists, today: string): string[] {
  const { current, previous } = quarters(today);
  const thisQ = issues.filter((i) => inQ(i.createdDate, current));
  const lastQ = issues.filter((i) => inQ(i.createdDate, previous));
  const out: string[] = [];
  const stages = breakdown(thisQ, lists, "caughtAtId");
  const staged = stages.reduce((n, s) => n + s.count, 0);
  if (stages[0] && staged) out.push(`${stages[0].name} is the most common catch stage this quarter (${pct(stages[0].count, staged)}% of classified issues).`);
  const now = new Map(breakdown(thisQ, lists, "rcaCategoryId").map((b) => [b.id, b]));
  for (const before of breakdown(lastQ, lists, "rcaCategoryId")) {
    const after = now.get(before.id);
    if (after && after.count >= 2 && after.count >= before.count * 2) out.push(`${after.name} issues ${after.count >= before.count * 3 ? "more than doubled" : "doubled"} vs last quarter (${before.count} → ${after.count}).`);
  }
  for (const b of now.values()) if (!lastQ.some((i) => i.rcaCategoryId === b.id) && b.count >= 3) out.push(`${b.name} is new this quarter with ${b.count} issues.`);
  const recurring = issues.filter((i) => i.recurring).length;
  if (recurring) out.push(`${recurring} issue${recurring === 1 ? " is" : "s are"} recurring — check that their prevention actions are done.`);
  const k = kpis(issues, lists, today);
  if (k.customerFirstPct !== null && k.customerFirstPct >= 50) out.push(`Customers found ${k.customerFirstPct}% of issues first — monitoring and alerting may be missing problems.`);
  if (k.othersPct !== null && k.othersPct > 15) out.push(`${k.othersPct}% of RCAs use "Others" — consider adding a category or sub-category that fits them.`);
  if (k.missingCases) out.push(`${k.missingCases} valid bug${k.missingCases === 1 ? " has" : "s have"} no regression cases yet.`);
  return out;
}
