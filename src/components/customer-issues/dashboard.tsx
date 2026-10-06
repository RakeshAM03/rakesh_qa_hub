"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Lightbulb } from "lucide-react";

import { useChartTheme } from "@/components/shared/use-chart-theme";
import { breakdown, catchableByProduct, kpis, leakageInsights, perMonth, subBreakdown, topModules, type Bar as BarRow } from "@/lib/customer-issues/dashboard";
import type { Lists } from "@/lib/customer-issues/model";
import type { IssueDto } from "@/lib/customer-issues/server";

import { Tile } from "./pack-page";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const monthLabel = (ym: string) => MONTH.format(new Date(`${ym}-01T00:00:00Z`));
const todayIso = () => new Date().toISOString().slice(0, 10);

/** KPIs, charts and leakage insights for the (product-filtered) issues. */
export function Dashboard({ issues, lists, productFiltered }: { issues: IssueDto[]; lists: Lists; productFiltered: boolean }) {
  const t = useChartTheme();
  const today = todayIso();
  const k = useMemo(() => kpis(issues, lists, today), [issues, lists, today]);
  const insights = useMemo(() => leakageInsights(issues, lists, today), [issues, lists, today]);
  const [drill, setDrill] = useState<string | null>(null);

  const categories = breakdown(issues, lists, "rcaCategoryId");
  const months = perMonth(issues, today);
  // Up to 7 products get their own colour (fixed order); the rest fold into "Other products".
  const productIds = [...new Set(issues.map((i) => i.productId ?? ""))].sort((a, b) => (lists.name(a) ?? "~").localeCompare(lists.name(b) ?? "~"));
  const coloured = productIds.filter((p) => p).slice(0, 7);
  const monthRows = months.map((m) => {
    const row: Record<string, string | number> = { month: monthLabel(m.month) };
    let other = 0;
    for (const [p, n] of Object.entries(m.byProduct)) {
      if (coloured.includes(p)) row[p] = n;
      else other += n;
    }
    row.other = other;
    return row;
  });
  const catchable = catchableByProduct(issues, lists);

  const delta = k.thisQuarter - k.lastQuarter;
  return (
    <section aria-label="Dashboard" className="flex flex-col gap-5">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Key figures">
        <Tile label={`Issues ${k.quarter}`} value={k.thisQuarter} hint={`${k.previousQuarter}: ${k.lastQuarter}${delta ? ` (${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)})` : " (same)"}`} />
        <Tile label="% catchable by QA" value={k.catchablePct === null ? "—" : `${k.catchablePct}%`} hint="Yes + Partially, valid bugs" />
        <Tile label="% found by customers first" value={k.customerFirstPct === null ? "—" : `${k.customerFirstPct}%`} hint="Detected by = Customer" />
        <Tile label="Needs RCA" value={k.needsRca} hint="Should trend to 0" tone={k.needsRca ? "text-rose-800" : undefined} />
        <Tile label="Valid bugs without regression cases" value={k.missingCases} hint="Should be 0" tone={k.missingCases ? "text-rose-800" : undefined} />
        <Tile label="Recurring issues" value={k.recurring} />
        <Tile label="Avg days to resolve / detect" value={`${k.avgDaysToResolve ?? "—"} / ${k.avgDaysToDetect ?? "—"}`} hint="Resolve: created → resolved · Detect: release → reported" />
        <Tile label="Preventions not done" value={k.preventionsNotDone} hint={k.othersPct !== null ? `"Others" category: ${k.othersPct}% of RCAs` : undefined} />
      </ul>

      {insights.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Leakage insights" role="region">
          <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Lightbulb className="size-4" aria-hidden /> Leakage insights{productFiltered ? " (this product)" : ""}
          </p>
          <ul className="list-disc pl-5 text-sm text-amber-900">
            {insights.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Issues per month" rows={months.map((m) => [monthLabel(m.month), m.total])} headers={["Month", "Issues"]}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthRows} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid vertical={false} stroke={t.grid} />
              <XAxis dataKey="month" tick={t.tick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={t.tick} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: t.cursor }} {...t.tooltip} />
              {coloured.length + (productIds.some((p) => !coloured.includes(p)) ? 1 : 0) > 1 && <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={null} formatter={(v) => <span style={{ color: t.label }}>{v}</span>} />}
              {coloured.map((p, i) => (
                <Bar key={p} dataKey={p} name={lists.name(p) ?? "Unknown"} stackId="p" fill={t.series(i)} stroke={t.surface} strokeWidth={1} maxBarSize={28} isAnimationActive={false} />
              ))}
              <Bar dataKey="other" name={coloured.length ? "Other / no product" : "Issues"} stackId="p" fill={coloured.length ? t.neutral : t.series(0)} stroke={t.surface} strokeWidth={1} maxBarSize={28} isAnimationActive={false} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={drill ? `Sub-categories: ${lists.name(drill)}` : "RCA categories"}
          hint={drill ? undefined : "Click a bar for its sub-categories"}
          action={
            drill && (
              <button type="button" className="text-xs text-rose-800 hover:underline" onClick={() => setDrill(null)}>
                ← All categories
              </button>
            )
          }
          rows={(drill ? subBreakdown(issues, lists, drill) : categories).map((b) => [b.name, b.count])}
          headers={[drill ? "Sub-category" : "Category", "Issues"]}
        >
          <HBars data={drill ? subBreakdown(issues, lists, drill) : categories} onSelect={drill ? undefined : setDrill} />
        </ChartCard>

        <ChartCard title="Should have been caught at — where the process leaks" rows={breakdown(issues, lists, "caughtAtId").map((b) => [b.name, b.count])} headers={["Stage", "Issues"]}>
          <HBars data={breakdown(issues, lists, "caughtAtId")} />
        </ChartCard>

        <ChartCard title="Why it escaped" rows={breakdown(issues, lists, "whyEscapedId").map((b) => [b.name, b.count])} headers={["Reason", "Issues"]}>
          <HBars data={breakdown(issues, lists, "whyEscapedId")} />
        </ChartCard>

        <ChartCard title="Catchable by QA, per product (valid bugs)" rows={catchable.map((c) => [c.name, `Yes ${c.YES} · Partially ${c.PARTIAL} · No ${c.NO} · Not set ${c.UNSET}`])} headers={["Product", "Catchable"]}>
          <ResponsiveContainer width="100%" height={Math.max(120, catchable.length * 40 + 50)}>
            <BarChart data={catchable} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={8}>
              <CartesianGrid horizontal={false} stroke={t.grid} />
              <XAxis type="number" allowDecimals={false} tick={t.tick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={130} tick={t.tick} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: t.cursor }} {...t.tooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={null} formatter={(v) => <span style={{ color: t.label }}>{v}</span>} />
              <Bar dataKey="YES" name="Yes" stackId="c" fill={t.series(0)} stroke={t.surface} strokeWidth={1} maxBarSize={22} isAnimationActive={false} />
              <Bar dataKey="PARTIAL" name="Partially" stackId="c" fill={t.series(1)} stroke={t.surface} strokeWidth={1} maxBarSize={22} isAnimationActive={false} />
              <Bar dataKey="NO" name="No" stackId="c" fill={t.series(2)} stroke={t.surface} strokeWidth={1} maxBarSize={22} isAnimationActive={false} />
              <Bar dataKey="UNSET" name="Not set" stackId="c" fill={t.neutral} stroke={t.surface} strokeWidth={1} maxBarSize={22} isAnimationActive={false} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Disposition — how many reports were real bugs" rows={breakdown(issues, lists, "dispositionId", true).map((b) => [b.name, b.count])} headers={["Disposition", "Issues"]}>
          <HBars data={breakdown(issues, lists, "dispositionId", true)} />
        </ChartCard>

        <ChartCard title="Top modules with customer issues" rows={topModules(issues).map((b) => [b.name, b.count])} headers={["Module", "Issues"]}>
          <HBars data={topModules(issues)} />
        </ChartCard>

        <ChartCard title="Owner team" rows={breakdown(issues, lists, "ownerTeamId").map((b) => [b.name, b.count])} headers={["Owner team", "Issues"]}>
          <HBars data={breakdown(issues, lists, "ownerTeamId")} />
        </ChartCard>
      </div>
    </section>
  );
}

/** Ranked horizontal bars in one hue (identity is on the axis, so no colour coding needed). */
function HBars({ data, onSelect }: { data: BarRow[]; onSelect?: (id: string) => void }) {
  const t = useChartTheme();
  if (!data.length) return <p className="py-8 text-center text-sm text-neutral-600">No data yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(100, data.length * 30 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={t.grid} />
        <XAxis type="number" allowDecimals={false} tick={t.tick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={190} tick={t.tick} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: t.cursor }} formatter={(v) => [String(v), "Issues"]} {...t.tooltip} />
        <Bar
          dataKey="count"
          fill={t.series(0)}
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          isAnimationActive={false}
          cursor={onSelect ? "pointer" : undefined}
          onClick={onSelect ? (d) => onSelect(String((d as unknown as { payload: BarRow }).payload.id)) : undefined}
        >
          <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: t.label }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartCard({ title, hint, action, children, rows, headers }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; rows: (string | number)[][]; headers: [string, string] }) {
  return (
    <figure className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-card p-4 shadow-xs">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-neutral-900">{title}</span>
        {action}
      </figcaption>
      {hint && <p className="-mt-1 text-xs text-neutral-600">{hint}</p>}
      {children}
      <details className="text-xs text-neutral-700">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1 pr-3 font-medium">{headers[0]}</th>
              <th className="py-1 font-medium">{headers[1]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([a, b]) => (
              <tr key={String(a)} className="border-t border-neutral-200">
                <td className="py-1 pr-3">{a}</td>
                <td className="py-1 tabular-nums">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
