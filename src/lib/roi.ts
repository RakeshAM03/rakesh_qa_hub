/**
 * Automation ROI calculations. Pure functions over project inputs, optional CI
 * runs and coverage snapshots. Dates are UTC calendar days (YYYY-MM-DD).
 */

export type Project = {
  id: string;
  name: string;
  ciSuiteId?: string | null;
  totalTests: number;
  automatedTests: number;
  manualMinutesPerTest: number;
  automatedSecondsPerTest?: number | null;
  runsPerMonth?: number | null;
  buildHours: number;
  maintenanceHoursPerMonth: number;
  hourlyCost?: number | null;
};

/** A CI run of the linked suite (completed or not). */
export type CiRun = { date: string; durationSec: number | null; conclusion: string | null; completed: boolean };

/** CI data for a project; null = not linked or couldn't be fetched (estimates are used). */
export type CiData = { runs: CiRun[] } | null;

export type Snapshot = { projectId: string; date: string; totalTests: number; automatedTests: number };

export type Period = { from: string; to: string };

const DAY = 86_400_000;
const MONTH_DAYS = 365.25 / 12;
const r1 = (n: number) => Math.round(n * 10) / 10;
const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Days in a period, inclusive. */
export const periodDays = (p: Period) => Math.max(0, Math.round((ms(p.to) - ms(p.from)) / DAY) + 1);
/** Months in a period (days ÷ average month length). */
export const periodMonths = (p: Period) => periodDays(p) / MONTH_DAYS;

/** The same-length period just before `p` (for ↑/↓ comparisons). */
export function previousPeriod(p: Period): Period {
  const days = periodDays(p);
  const to = ms(p.from) - DAY;
  return { from: iso(to - (days - 1) * DAY), to: iso(to) };
}

export type PresetId = "30d" | "90d" | "year";
export function presetPeriod(id: PresetId, today: string): Period {
  if (id === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  const days = id === "30d" ? 30 : 90;
  return { from: iso(ms(today) - (days - 1) * DAY), to: today };
}

const inPeriod = (date: string, p: Period) => date.slice(0, 10) >= p.from && date.slice(0, 10) <= p.to;

export type ProjectMetrics = {
  runs: number;
  manualAvoidedHours: number;
  executionHours: number;
  maintenanceHours: number;
  netHours: number;
  coverage: number;
  passRate: number | null;
  costSaved: number | null;
  usingEstimates: boolean;
};

/**
 * One project over a period:
 * runs = CI runs (linked) or runs/month × months; manual avoided = runs × automated
 * × manual minutes ÷ 60; execution = CI durations or runs × automated × seconds ÷ 3600;
 * net = avoided − execution − maintenance/month × months.
 */
export function projectMetrics(p: Project, period: Period, ci: CiData): ProjectMetrics {
  const months = periodMonths(period);
  const usingEstimates = !ci;
  const runsInPeriod = ci ? ci.runs.filter((r) => inPeriod(r.date, period)) : [];
  const runs = ci ? runsInPeriod.length : (p.runsPerMonth ?? 0) * months;
  const manualAvoidedHours = (runs * p.automatedTests * p.manualMinutesPerTest) / 60;
  const executionHours = ci
    ? runsInPeriod.reduce((n, r) => n + (r.durationSec ?? 0), 0) / 3600
    : (runs * p.automatedTests * (p.automatedSecondsPerTest ?? 0)) / 3600;
  const maintenanceHours = p.maintenanceHoursPerMonth * months;
  const netHours = manualAvoidedHours - executionHours - maintenanceHours;
  const completed = runsInPeriod.filter((r) => r.completed);
  const passRate = ci && completed.length ? (completed.filter((r) => r.conclusion === "success").length / completed.length) * 100 : null;
  return {
    runs: ci ? runs : r1(runs),
    manualAvoidedHours: r1(manualAvoidedHours),
    executionHours: r1(executionHours),
    maintenanceHours: r1(maintenanceHours),
    netHours: r1(netHours),
    coverage: coverage(p.automatedTests, p.totalTests),
    passRate: passRate === null ? null : Math.round(passRate),
    costSaved: p.hourlyCost ? Math.round(netHours * p.hourlyCost) : null,
    usingEstimates,
  };
}

export const coverage = (automated: number, total: number) => (total > 0 ? Math.round((automated / total) * 1000) / 10 : 0);

/** ROI % = (cumulative net − build) ÷ build × 100 (null without a build cost). */
export const roiPercent = (cumulativeNet: number, buildHours: number) => (buildHours > 0 ? Math.round(((cumulativeNet - buildHours) / buildHours) * 100) : null);

export type MonthPoint = { month: string; label: string; net: number; cumulative: number };

/** Calendar months touched by a period, each clipped to the period. */
export function monthsOf(period: Period): Period[] {
  const out: Period[] = [];
  let cur = ms(`${period.from.slice(0, 7)}-01`);
  const end = ms(period.to);
  while (cur <= end && out.length < 60) {
    const d = new Date(cur);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    out.push({ from: iso(Math.max(cur, ms(period.from))), to: iso(Math.min(next - DAY, end)) });
    cur = next;
  }
  return out;
}

const monthLabel = (isoDate: string) => new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(ms(isoDate)));

/** Monthly net and cumulative hours over the period, and the break-even month. */
export function monthlySeries(p: Project, period: Period, ci: CiData) {
  let cumulative = 0;
  let breakEven: string | null = null;
  const points: MonthPoint[] = monthsOf(period).map((m) => {
    const net = projectMetrics(p, m, ci).netHours;
    cumulative = r1(cumulative + net);
    if (!breakEven && p.buildHours > 0 && cumulative >= p.buildHours) breakEven = monthLabel(m.from);
    return { month: m.from.slice(0, 7), label: monthLabel(m.from), net, cumulative };
  });
  return { points, breakEven, cumulative };
}

export type Row = ProjectMetrics & { id: string; name: string; roi: number | null; breakEven: string | null; buildHours: number };

export type Summary = {
  rows: Row[];
  kpis: {
    hoursSaved: number;
    hoursSavedPrevious: number;
    roi: number | null;
    coverage: number;
    passRate: number | null;
    costSaved: number | null;
  };
  cumulative: { label: string; cumulative: number; buildCost: number }[];
  breakEven: string | null;
  coverageSeries: { date: string; overall: number; [projectId: string]: number | string }[];
  passRateTrend: { week: string; passRate: number; runs: number }[];
};

/** Weighted coverage across projects (Σ automated ÷ Σ total). */
export function overallCoverage(projects: Pick<Project, "automatedTests" | "totalTests">[]) {
  return coverage(
    projects.reduce((n, p) => n + p.automatedTests, 0),
    projects.reduce((n, p) => n + p.totalTests, 0),
  );
}

/** Coverage over time from snapshots: one value per project per snapshot date, plus an overall line. */
export function coverageOverTime(projects: Project[], snapshots: Snapshot[]) {
  const dates = [...new Set(snapshots.map((s) => s.date.slice(0, 10)))].sort();
  const byProject = new Map<string, Snapshot[]>();
  for (const s of [...snapshots].sort((a, b) => a.date.localeCompare(b.date))) byProject.set(s.projectId, [...(byProject.get(s.projectId) ?? []), s]);
  return dates.map((date) => {
    const point: { date: string; overall: number; [k: string]: number | string } = { date, overall: 0 };
    let auto = 0;
    let total = 0;
    for (const p of projects) {
      const latest = (byProject.get(p.id) ?? []).filter((s) => s.date.slice(0, 10) <= date).at(-1);
      if (!latest) continue;
      point[p.id] = coverage(latest.automatedTests, latest.totalTests);
      auto += latest.automatedTests;
      total += latest.totalTests;
    }
    point.overall = coverage(auto, total);
    return point;
  });
}

/** ISO-week (Monday) start for a date. */
function weekStart(date: string) {
  const t = ms(date);
  const day = (new Date(t).getUTCDay() + 6) % 7;
  return iso(t - day * DAY);
}

/** Weekly pass rate across linked suites' completed runs. */
export function passRateByWeek(ciByProject: CiData[], period: Period) {
  const weeks = new Map<string, { ok: number; done: number }>();
  for (const ci of ciByProject) {
    for (const r of ci?.runs ?? []) {
      if (!r.completed || !inPeriod(r.date, period)) continue;
      const w = weekStart(r.date);
      const cur = weeks.get(w) ?? { ok: 0, done: 0 };
      cur.done++;
      if (r.conclusion === "success") cur.ok++;
      weeks.set(w, cur);
    }
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, passRate: Math.round((v.ok / v.done) * 100), runs: v.done }));
}

/** Everything the dashboard shows for a period. */
export function summarize(projects: Project[], period: Period, ciById: Map<string, CiData>, snapshots: Snapshot[]): Summary {
  const prev = previousPeriod(period);
  const rows: Row[] = projects.map((p) => {
    const ci = ciById.get(p.id) ?? null;
    const m = projectMetrics(p, period, ci);
    const series = monthlySeries(p, period, ci);
    return { id: p.id, name: p.name, buildHours: p.buildHours, ...m, roi: roiPercent(series.cumulative, p.buildHours), breakEven: series.breakEven };
  });
  const hoursSaved = r1(rows.reduce((n, r) => n + r.netHours, 0));
  const hoursSavedPrevious = r1(projects.reduce((n, p) => n + projectMetrics(p, prev, ciById.get(p.id) ?? null).netHours, 0));
  const build = projects.reduce((n, p) => n + p.buildHours, 0);

  // Overall cumulative line (monthly) vs total build cost.
  const months = monthsOf(period);
  const perProject = projects.map((p) => monthlySeries(p, period, ciById.get(p.id) ?? null).points);
  let breakEven: string | null = null;
  const cumulative = months.map((m, i) => {
    const c = r1(perProject.reduce((n, pts) => n + (pts[i]?.cumulative ?? 0), 0));
    if (!breakEven && build > 0 && c >= build) breakEven = monthLabel(m.from);
    return { label: monthLabel(m.from), cumulative: c, buildCost: build };
  });

  const passRows = rows.filter((r) => r.passRate !== null);
  const linkedRuns = projects.map((p) => ciById.get(p.id) ?? null).filter(Boolean);
  const allCompleted = linkedRuns.flatMap((ci) => ci!.runs.filter((r) => r.completed && inPeriod(r.date, period)));
  const passRate = passRows.length && allCompleted.length ? Math.round((allCompleted.filter((r) => r.conclusion === "success").length / allCompleted.length) * 100) : null;
  const costRows = rows.filter((r) => r.costSaved !== null);

  return {
    rows,
    kpis: {
      hoursSaved,
      hoursSavedPrevious,
      roi: roiPercent(cumulative.at(-1)?.cumulative ?? 0, build),
      coverage: overallCoverage(projects),
      passRate,
      costSaved: costRows.length ? costRows.reduce((n, r) => n + (r.costSaved ?? 0), 0) : null,
    },
    cumulative,
    breakEven,
    coverageSeries: coverageOverTime(projects, snapshots),
    passRateTrend: passRateByWeek(linkedRuns, period),
  };
}

/** "Automation saved 312 hours in the last 90 days across 4 projects (ROI 160%, coverage 74%)." */
export function summaryText(s: Summary, periodLabel: string, currency: string) {
  const n = s.rows.length;
  const parts = [`ROI ${s.kpis.roi === null ? "—" : `${s.kpis.roi}%`}`, `coverage ${Math.round(s.kpis.coverage)}%`];
  if (s.kpis.passRate !== null) parts.push(`CI pass rate ${s.kpis.passRate}%`);
  const cost = s.kpis.costSaved !== null ? ` (≈ ${currency}${s.kpis.costSaved.toLocaleString("en-US")} saved)` : "";
  return `Automation saved ${Math.round(s.kpis.hoursSaved)} hours ${periodLabel} across ${n} project${n === 1 ? "" : "s"}${cost} (${parts.join(", ")}).`;
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
};

export function rowsCsv(rows: Row[], currency: string) {
  const header = ["Project", "Coverage %", "Runs", "Manual effort avoided (h)", "Execution (h)", "Maintenance (h)", "Hours saved", "ROI %", "Break-even", "Pass rate %", `Cost saved (${currency})`, "Using estimates"];
  return [header, ...rows.map((r) => [r.name, r.coverage, r.runs, r.manualAvoidedHours, r.executionHours, r.maintenanceHours, r.netHours, r.roi, r.breakEven ?? "Not yet", r.passRate, r.costSaved, r.usingEstimates ? "yes" : "no"])]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}
