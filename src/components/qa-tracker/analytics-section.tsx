"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { addDaysIso, isoToDdMmYyyy, isoToLong, isoToShort, todayIso } from "@/lib/dates";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/qa-tracker/schema";
import { STATUS_FILLS } from "./status";

type Analytics = {
  totals: { hours: number; tasks: number; loggedDays: number; avgHoursPerDay: number };
  byResource: { id: string; name: string; hours: number }[];
  byStatus: { status: TaskStatus; hours: number; tasks: number }[];
  daily: { date: string; hours: number }[];
};

const SERIES = "#2a78d6";
const PERIODS = [7, 14, 30];
const fmtHours = (n: number) => `${Number(n.toFixed(2))} h`;

/** Chart chrome for the current light/dark mode (SVG attributes can't use CSS variables). */
function useChartTheme() {
  const dark = useTheme().resolvedTheme === "dark";
  const c = dark
    ? { axis: "#a3a3a3", grid: "#2e2e36", label: "#d4d4d4", cursor: "#26262e", surface: "#1b1b22", border: "#33333d", text: "#f5f5f5", series: "#5598e7" }
    : { axis: "#737373", grid: "#e5e5e5", label: "#404040", cursor: "#f5f5f5", surface: "#ffffff", border: "#e5e5e5", text: "#171717", series: SERIES };
  return {
    ...c,
    tick: { fontSize: 12, fill: c.axis },
    tooltip: {
      contentStyle: { borderRadius: 8, border: `1px solid ${c.border}`, background: c.surface, fontSize: 12, boxShadow: "0 2px 8px rgb(0 0 0 / 0.15)" },
      labelStyle: { color: c.text, fontWeight: 600 },
      itemStyle: { color: c.label },
    },
  };
}

export function AnalyticsSection({ refreshKey }: { refreshKey: number }) {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<Analytics | null>(null);
  const [failed, setFailed] = useState(false);
  const to = todayIso();
  const from = addDaysIso(to, -(days - 1));

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/qa-tracker/analytics?${new URLSearchParams({ from, to })}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => {
        setData(json);
        setFailed(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [from, to, refreshKey]);

  const empty = data !== null && data.totals.tasks === 0;
  const t = useChartTheme();

  return (
    <section aria-labelledby="analytics-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="analytics-title" className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Time Tracking Analytics
        </h3>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger size="sm" className="w-36" aria-label="Analytics period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                Last {n} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {failed ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Couldn&apos;t load analytics.</p>
      ) : data === null ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
          <Skeleton className="h-56 sm:col-span-3" />
        </div>
      ) : empty ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
          No time data recorded yet.
          {days < 30 && " Try a longer period, or log an entry above."}
        </p>
      ) : (
        <>
          <p className="-mt-2 text-xs text-neutral-500">
            {isoToLong(from)} – {isoToLong(to)}
          </p>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Stat label="Total hours" value={fmtHours(data.totals.hours)} />
            <Stat label="Tasks logged" value={String(data.totals.tasks)} />
            <Stat
              label="Avg hours per day"
              value={fmtHours(data.totals.avgHoursPerDay)}
              note={`over ${data.totals.loggedDays} logged ${data.totals.loggedDays === 1 ? "day" : "days"}`}
            />
          </dl>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Hours per resource">
              <ResponsiveContainer width="100%" height={Math.max(120, data.byResource.length * 40 + 30)}>
                <BarChart data={data.byResource} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }} barCategoryGap={8}>
                  <CartesianGrid horizontal={false} stroke={t.grid} />
                  <XAxis type="number" tick={t.tick} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={150} tick={t.tick} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: t.cursor }} formatter={(v) => [fmtHours(Number(v)), "Hours"]} {...t.tooltip} />
                  <Bar dataKey="hours" fill={t.series} radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
                    <LabelList dataKey="hours" position="right" formatter={(v) => fmtHours(Number(v))} style={{ fontSize: 12, fill: t.label }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Hours by status">
              <ResponsiveContainer width="100%" height={150}>
                <BarChart
                  data={data.byStatus.map((s) => ({ ...s, label: TASK_STATUS_LABELS[s.status] }))}
                  layout="vertical"
                  margin={{ top: 4, right: 96, bottom: 4, left: 4 }}
                  barCategoryGap={8}
                >
                  <CartesianGrid horizontal={false} stroke={t.grid} />
                  <XAxis type="number" tick={t.tick} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={96} tick={t.tick} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: t.cursor }}
                    formatter={(v, _n, item) => [`${fmtHours(Number(v))} · ${item.payload.tasks} tasks`, "Time"]}
                    {...t.tooltip}
                  />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
                    {data.byStatus.map((s) => (
                      <Cell key={s.status} fill={STATUS_FILLS[s.status]} />
                    ))}
                    <LabelList
                      dataKey="tasks"
                      position="right"
                      content={({ x, y, width, height, index }) => {
                        const s = data.byStatus[Number(index)];
                        return (
                          <text x={Number(x) + Number(width) + 6} y={Number(y) + Number(height) / 2} dy={4} fontSize={12} fill={t.label}>
                            {fmtHours(s.hours)} · {s.tasks} {s.tasks === 1 ? "task" : "tasks"}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Daily hours">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.daily} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                <CartesianGrid vertical={false} stroke={t.grid} />
                <XAxis
                  dataKey="date"
                  tickFormatter={isoToShort}
                  tick={t.tick}
                  axisLine={{ stroke: t.grid }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis tick={t.tick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ stroke: t.axis, strokeDasharray: "3 3" }}
                  labelFormatter={(l) => isoToLong(String(l))}
                  formatter={(v) => [fmtHours(Number(v)), "Hours"]}
                  {...t.tooltip}
                />
                <Line
                  type="linear"
                  dataKey="hours"
                  stroke={t.series}
                  strokeWidth={2}
                  dot={days <= 14 ? { r: 3, fill: t.series, strokeWidth: 0 } : false}
                  activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <details className="text-sm">
            <summary className="cursor-pointer text-neutral-600 hover:text-neutral-900">Show the data as a table</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <DataTable caption="Hours per resource" head={["Resource", "Hours"]} rows={data.byResource.map((r) => [r.name, fmtHours(r.hours)])} />
              <DataTable
                caption="Hours by status"
                head={["Status", "Hours", "Tasks"]}
                rows={data.byStatus.map((s) => [TASK_STATUS_LABELS[s.status], fmtHours(s.hours), String(s.tasks)])}
              />
              <DataTable
                caption="Daily hours"
                head={["Date", "Hours"]}
                rows={data.daily.filter((d) => d.hours > 0).map((d) => [isoToDdMmYyyy(d.date), fmtHours(d.hours)])}
              />
            </div>
          </details>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-card p-4">
      <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-neutral-900 tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-neutral-500">{note}</dd>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <figure className="rounded-lg border border-neutral-200 bg-card p-4">
      <figcaption className="mb-2 text-sm font-medium text-neutral-800">{title}</figcaption>
      {children}
    </figure>
  );
}

function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <table className="w-full text-left text-xs">
      <caption className="mb-1 text-left font-medium text-neutral-700">{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} className="border-b border-neutral-200 py-1 pr-2 font-semibold text-neutral-500">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className="border-b border-neutral-100 py-1 pr-2 tabular-nums">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
