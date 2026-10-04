"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Camera, Copy, Download, HelpCircle, Pencil, Plus, Settings2, Trash2, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { DateRangeButton, type DateRange } from "@/components/shared/date-picker";
import { useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { useChartTheme } from "@/components/shared/use-chart-theme";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { copyText, downloadText } from "@/lib/browser";
import { isoToLong, todayIso } from "@/lib/dates";
import { presetPeriod, rowsCsv, summaryText, type Period, type PresetId, type Row, type Summary } from "@/lib/roi";
import { cn } from "@/lib/utils";

type ProjectInfo = {
  id: string;
  name: string;
  ciSuiteId: string | null;
  ciSuiteName: string | null;
  ciError: string | null;
  totalTests: number;
  automatedTests: number;
  manualMinutesPerTest: number;
  automatedSecondsPerTest: number | null;
  runsPerMonth: number | null;
  buildHours: number;
  maintenanceHoursPerMonth: number;
  hourlyCost: number | null;
  snapshots: number;
};
type Data = Summary & { period: Period; githubConnected: boolean; projects: ProjectInfo[] };
type PeriodChoice = PresetId | "custom";

const fmt = (n: number, d = 1) => n.toLocaleString("en-US", { maximumFractionDigits: d });

export function RoiDashboard() {
  const [choice, setChoice] = useState<PeriodChoice>("90d");
  const [custom, setCustom] = useState<DateRange>({ from: null, to: null });
  const [data, setData] = useState<Data | null>(null);
  const [currency, setCurrency] = useState("₹");
  const [manageOpen, setManageOpen] = useState(false);
  const [form, setForm] = useState<ProjectInfo | "new" | null>(null);
  const [snapshotFor, setSnapshotFor] = useState<ProjectInfo | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: keyof Row; dir: 1 | -1 }>({ key: "netHours", dir: -1 });
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  const today = todayIso();
  const period: Period | null = choice === "custom" ? (custom.from && custom.to ? { from: custom.from, to: custom.to } : null) : presetPeriod(choice, today);
  const periodLabel = choice === "30d" ? "in the last 30 days" : choice === "90d" ? "in the last 90 days" : choice === "year" ? "this year" : period ? `between ${isoToLong(period.from)} and ${isoToLong(period.to)}` : "";

  const load = useCallback(() => {
    if (!period) return;
    fetch(`/api/automation-roi/summary?from=${period.from}&to=${period.to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => toast.error("Couldn't load the dashboard."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.from, period?.to]);
  useEffect(load, [load]);
  useEffect(() => {
    fetch("/api/automation-roi/settings")
      .then((r) => r.json())
      .then((d) => setCurrency(d.currency ?? "₹"))
      .catch(() => {});
  }, []);

  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])];
    return list.sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (typeof x === "string" || typeof y === "string") return String(x ?? "").localeCompare(String(y ?? "")) * sort.dir;
      return ((Number(x ?? -Infinity) || 0) - (Number(y ?? -Infinity) || 0)) * sort.dir;
    });
  }, [data, sort]);

  async function remove(p: ProjectInfo) {
    const res = await withPasscode((headers) => fetch(`/api/automation-roi/projects/${p.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
    toast.success("Project deleted");
    load();
  }

  const empty = data && data.projects.length === 0;
  const info = (id: string) => data?.projects.find((p) => p.id === id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={choice} onValueChange={(v) => setChoice(v as PeriodChoice)}>
          <SelectTrigger className="w-44" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="year">This year</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        {choice === "custom" && <DateRangeButton value={custom} onChange={setCustom} label="Pick dates" />}
        <HowCalculated />
        <div className="ml-auto flex gap-2">
          {data && data.rows.length > 0 && (
            <>
              <Button variant="outline" onClick={() => copyText(summaryText(data, periodLabel, currency), "Summary copied")}>
                <Copy className="size-4" aria-hidden /> Copy summary
              </Button>
              <Button variant="outline" onClick={() => downloadText(`automation-roi-${data.period.from}-to-${data.period.to}.csv`, rowsCsv(data.rows, currency), "text/csv")}>
                <Download className="size-4" aria-hidden /> CSV
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setManageOpen(true)}>
            <Settings2 className="size-4" aria-hidden /> Manage projects
          </Button>
        </div>
      </div>

      {!period ? (
        <p className="text-sm text-neutral-600">Pick a start and end date.</p>
      ) : !data ? (
        <Skeleton className="h-96 w-full" />
      ) : empty ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-card px-6 py-14 text-center">
          <TrendingUp className="size-8 text-neutral-400" aria-hidden />
          <p className="text-sm text-neutral-600">No automation projects yet — add one to start tracking ROI.</p>
          <Button className="bg-emerald-700 text-emerald-50 hover:bg-emerald-800" onClick={() => setForm("new")}>
            <Plus className="size-4" aria-hidden /> Add project
          </Button>
        </div>
      ) : (
        <>
          <Kpis data={data} currency={currency} />
          <div className="grid gap-6 lg:grid-cols-2">
            <CumulativeChart data={data} />
            <CoverageChart data={data} />
            <HoursByProjectChart rows={data.rows} />
            <PassRateChart data={data} />
          </div>
          <section aria-labelledby="roi-table" className="overflow-x-auto rounded-xl border border-neutral-200 bg-card shadow-xs">
            <h2 id="roi-table" className="sr-only">
              Projects
            </h2>
            <table className="w-full text-left text-sm" aria-label="Projects">
              <thead className="border-b border-neutral-200 text-xs uppercase tracking-wider text-neutral-600">
                <tr>
                  {(
                    [
                      ["name", "Project"],
                      ["coverage", "Coverage"],
                      ["runs", "Runs"],
                      ["netHours", "Hours saved"],
                      ["roi", "ROI"],
                      ["breakEven", "Break-even"],
                      ["passRate", "Pass rate"],
                    ] as [keyof Row, string][]
                  ).map(([key, label]) => (
                    <th key={key} className="px-4 py-3 font-semibold" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                      <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-neutral-900" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : key === "name" ? 1 : -1 }))}>
                        {label}
                        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = info(r.id)!;
                  return (
                    <tr key={r.id} className="cursor-pointer border-b border-neutral-200 last:border-0 hover:bg-neutral-50" onClick={() => setDetail(r.id)} data-testid="roi-row">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-neutral-900">{r.name}</span>
                        {p.ciSuiteName && <span className="ml-2 text-xs text-neutral-600">CI: {p.ciSuiteName}</span>}
                        {p.ciSuiteId && r.usingEstimates && (
                          <UiTooltip>
                            <TooltipTrigger asChild>
                              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Using estimates</span>
                            </TooltipTrigger>
                            <TooltipContent>{p.ciError ?? "CI data unavailable"} — runs/month and seconds per test are used instead.</TooltipContent>
                          </UiTooltip>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-200" aria-hidden>
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, r.coverage)}%` }} />
                          </div>
                          <span className="tabular-nums">{fmt(r.coverage)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{fmt(r.runs)}</td>
                      <td className={cn("px-4 py-3 font-semibold tabular-nums", r.netHours < 0 && "text-red-700")}>{fmt(r.netHours)} h</td>
                      <td className={cn("px-4 py-3 tabular-nums", r.roi !== null && (r.roi >= 0 ? "text-emerald-700" : "text-red-700"))}>{r.roi === null ? "—" : `${fmt(r.roi, 0)}%`}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{r.breakEven ?? "Not yet"}</td>
                      <td className="px-4 py-3 tabular-nums">{r.passRate === null ? "—" : `${r.passRate}%`}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit ${r.name}`} onClick={() => setForm(p)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="size-8" aria-label={`Log a snapshot for ${r.name}`} onClick={() => setSnapshotFor(p)}>
                            <Camera className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="size-8" aria-label={`Delete ${r.name}`} onClick={() => remove(p)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          {!data.githubConnected && data.projects.some((p) => p.ciSuiteId) && (
            <p className="text-xs text-neutral-600">GitHub isn&apos;t connected (GITHUB_TOKEN), so linked projects use their manual estimates.</p>
          )}
        </>
      )}

      <ManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        projects={data?.projects ?? []}
        currency={currency}
        onAdd={() => setForm("new")}
        onEdit={(p) => setForm(p)}
        onSnapshot={(p) => setSnapshotFor(p)}
        onDelete={remove}
        onCurrency={async (c) => {
          const res = await withPasscode((headers) => fetch("/api/automation-roi/settings", { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ currency: c }) }));
          if (!res) return;
          if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't save.");
          setCurrency(c);
          toast.success("Currency saved");
        }}
      />
      <ProjectForm
        target={form}
        currency={currency}
        onClose={() => setForm(null)}
        onSaved={() => {
          setForm(null);
          load();
        }}
        withPasscode={withPasscode}
      />
      <SnapshotDialog
        project={snapshotFor}
        onClose={() => setSnapshotFor(null)}
        onSaved={() => {
          setSnapshotFor(null);
          load();
        }}
      />
      <DetailDrawer id={detail} data={data} currency={currency} onClose={() => setDetail(null)} />
      {passcodeDialog}
    </div>
  );
}

function HowCalculated() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-800">
          <HelpCircle className="size-3.5" aria-hidden /> How is this calculated?
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 text-xs leading-5" align="start">
        <ul className="flex list-disc flex-col gap-1 pl-4">
          <li>
            <strong>Runs</strong> = CI runs of the linked suite in the period (needs GITHUB_TOKEN), else runs per month × months.
          </li>
          <li>
            <strong>Manual effort avoided (h)</strong> = runs × automated tests × manual minutes ÷ 60.
          </li>
          <li>
            <strong>Execution time (h)</strong> = sum of CI run durations, else runs × automated tests × seconds ÷ 3600.
          </li>
          <li>
            <strong>Net hours saved</strong> = avoided − execution − maintenance hours/month × months.
          </li>
          <li>
            <strong>Break-even</strong> = first month in the period where cumulative net hours ≥ build cost.
          </li>
          <li>
            <strong>ROI %</strong> = (cumulative net hours − build cost) ÷ build cost × 100 (cumulative over the selected period).
          </li>
          <li>
            <strong>Coverage %</strong> = automated ÷ total × 100; <strong>pass rate</strong> = successful ÷ completed CI runs.
          </li>
          <li>
            <strong>Cost saved</strong> = net hours × hourly cost (when set).
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function Kpis({ data, currency }: { data: Data; currency: string }) {
  const k = data.kpis;
  const delta = k.hoursSaved - k.hoursSavedPrevious;
  const tiles: { label: string; value: string; extra?: React.ReactNode; tone?: string }[] = [
    {
      label: "Hours saved",
      value: `${fmt(k.hoursSaved, 0)} h`,
      extra:
        Math.abs(delta) < 0.5 ? (
          <span className="text-xs text-neutral-600">Same as the previous period</span>
        ) : (
          <span className={cn("inline-flex items-center gap-0.5 text-xs", delta >= 0 ? "text-emerald-700" : "text-red-700")}>
            {delta >= 0 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
            {fmt(Math.abs(delta), 0)} h vs previous period
          </span>
        ),
    },
    { label: "ROI", value: k.roi === null ? "—" : `${fmt(k.roi, 0)}%`, tone: k.roi !== null && k.roi > 0 ? "text-emerald-700" : k.roi !== null && k.roi < 0 ? "text-red-700" : undefined },
    { label: "Automation coverage", value: `${fmt(k.coverage)}%` },
    { label: "CI pass rate", value: k.passRate === null ? "—" : `${k.passRate}%` },
  ];
  if (k.costSaved !== null) tiles.push({ label: "Cost saved", value: `${currency}${fmt(k.costSaved, 0)}` });
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", tiles.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")} aria-label="Key figures">
      {tiles.map((t) => (
        <li key={t.label} className="rounded-xl border border-t-4 border-neutral-200 border-t-emerald-500 bg-card p-4 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-600">{t.label}</p>
          <p className={cn("mt-1 text-2xl font-bold tabular-nums text-neutral-900", t.tone)} data-testid={`kpi-${t.label.toLowerCase().replace(/\s+/g, "-")}`}>
            {t.value}
          </p>
          {t.extra}
        </li>
      ))}
    </ul>
  );
}

function ChartCard({ title, children, empty }: { title: string; children: React.ReactNode; empty?: string | null }) {
  return (
    <section aria-label={title} className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h2>
      {empty ? <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-neutral-300 px-4 text-center text-sm text-neutral-600">{empty}</div> : <div className="h-56">{children}</div>}
    </section>
  );
}

function CumulativeChart({ data }: { data: Data }) {
  const t = useChartTheme();
  const build = data.cumulative[0]?.buildCost ?? 0;
  return (
    <ChartCard title="Cumulative hours saved vs build cost" empty={data.cumulative.length ? null : "Not enough data for this period."}>
      <ResponsiveContainer>
        <LineChart data={data.cumulative} margin={{ left: -8, right: 16, top: 20 }}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="label" tick={t.tick} tickLine={false} axisLine={false} />
          <YAxis tick={t.tick} tickLine={false} axisLine={false} />
          <Tooltip {...t.tooltip} formatter={(v) => [`${fmt(Number(v))} h`, "Cumulative net hours"]} />
          {build > 0 && <ReferenceLine y={build} stroke={t.neutral} strokeDasharray="4 4" label={{ value: `Build cost ${fmt(build, 0)} h`, fill: t.label, fontSize: 11, position: "insideTopLeft" }} />}
          {data.breakEven && <ReferenceLine x={data.breakEven} stroke={t.series(2)} label={{ value: "Break-even", fill: t.label, fontSize: 11, position: "top" }} />}
          <Line type="linear" dataKey="cumulative" name="Cumulative net hours" stroke={t.series(0)} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function CoverageChart({ data }: { data: Data }) {
  const t = useChartTheme();
  const names = new Map(data.projects.map((p, i) => [p.id, { name: p.name, i }]));
  const ids = [...names.keys()].filter((id) => data.coverageSeries.some((pt) => id in pt)).slice(0, 7);
  return (
    <ChartCard title="Coverage over time" empty={data.coverageSeries.length >= 2 ? null : "Log snapshots on different days to see coverage grow."}>
      <ResponsiveContainer>
        <LineChart data={data.coverageSeries} margin={{ left: -8, right: 16, top: 8 }}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="date" tick={t.tick} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} unit="%" tick={t.tick} tickLine={false} axisLine={false} />
          <Tooltip {...t.tooltip} formatter={(v, n) => [`${fmt(Number(v))}%`, n]} />
          <Legend wrapperStyle={{ fontSize: 12, color: t.label }} />
          {ids.map((id) => (
            <Line key={id} type="linear" dataKey={id} name={names.get(id)!.name} stroke={t.series(names.get(id)!.i % 7)} strokeWidth={2} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
          ))}
          <Line type="linear" dataKey="overall" name="Overall" stroke={t.neutral} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function HoursByProjectChart({ rows }: { rows: Row[] }) {
  const t = useChartTheme();
  const sorted = [...rows].sort((a, b) => b.netHours - a.netHours);
  return (
    <ChartCard title="Hours saved by project" empty={rows.length ? null : "No projects."}>
      <ResponsiveContainer>
        <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis type="number" tick={t.tick} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={120} tick={t.tick} tickLine={false} axisLine={false} />
          <Tooltip {...t.tooltip} cursor={{ fill: t.cursor }} formatter={(v) => [`${fmt(Number(v))} h`, "Net hours saved"]} />
          <Bar dataKey="netHours" name="Net hours saved" fill={t.series(0)} radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function PassRateChart({ data }: { data: Data }) {
  const t = useChartTheme();
  const empty = !data.projects.some((p) => p.ciSuiteId)
    ? "Link a CI suite to a project to see its pass rate."
    : !data.githubConnected
      ? "Connect GitHub (GITHUB_TOKEN) to see CI pass rates."
      : data.passRateTrend.length < 1
        ? "No completed CI runs in this period."
        : null;
  return (
    <ChartCard title="CI pass rate trend (weekly)" empty={empty}>
      <ResponsiveContainer>
        <LineChart data={data.passRateTrend} margin={{ left: -8, right: 16, top: 8 }}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="week" tick={t.tick} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} unit="%" tick={t.tick} tickLine={false} axisLine={false} />
          <Tooltip {...t.tooltip} formatter={(v) => [`${v}%`, "Pass rate"]} />
          <Line type="linear" dataKey="passRate" name="Pass rate" stroke={t.series(2)} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ManageDialog({
  open,
  onOpenChange,
  projects,
  currency,
  onAdd,
  onEdit,
  onSnapshot,
  onDelete,
  onCurrency,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: ProjectInfo[];
  currency: string;
  onAdd: () => void;
  onEdit: (p: ProjectInfo) => void;
  onSnapshot: (p: ProjectInfo) => void;
  onDelete: (p: ProjectInfo) => void;
  onCurrency: (c: string) => void;
}) {
  const [cur, setCur] = useState(currency);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setCur(currency);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage projects</DialogTitle>
          <DialogDescription>Editing or deleting a project and changing the currency need the admin passcode.</DialogDescription>
        </DialogHeader>
        {projects.length === 0 ? (
          <p className="text-sm text-neutral-600">No projects yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-200" aria-label="Automation projects">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-neutral-600">
                    {" "}
                    · {p.automatedTests}/{p.totalTests} automated · {p.snapshots} snapshot{p.snapshots === 1 ? "" : "s"}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => onEdit(p)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => onSnapshot(p)}>
                  Snapshot
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => onDelete(p)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button className="self-start bg-emerald-700 text-emerald-50 hover:bg-emerald-800" onClick={onAdd}>
          <Plus className="size-4" aria-hidden /> Add project
        </Button>
        <form
          className="flex items-end gap-2 border-t border-neutral-200 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (cur.trim() && cur.trim() !== currency) onCurrency(cur.trim());
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="roi-currency">Currency symbol</Label>
            <Input id="roi-currency" value={cur} onChange={(e) => setCur(e.target.value)} maxLength={5} className="w-24" />
          </div>
          <Button type="submit" variant="outline" disabled={!cur.trim() || cur.trim() === currency}>
            Save currency
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FormValues = Record<"name" | "totalTests" | "automatedTests" | "manualMinutesPerTest" | "automatedSecondsPerTest" | "runsPerMonth" | "buildHours" | "maintenanceHoursPerMonth" | "hourlyCost", string> & { ciSuiteId: string };

function ProjectForm({
  target,
  currency,
  onClose,
  onSaved,
  withPasscode,
}: {
  target: ProjectInfo | "new" | null;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  withPasscode: (action: (headers: Record<string, string>) => Promise<Response>) => Promise<Response | null>;
}) {
  const blank: FormValues = { name: "", ciSuiteId: "none", totalTests: "", automatedTests: "", manualMinutesPerTest: "", automatedSecondsPerTest: "", runsPerMonth: "", buildHours: "", maintenanceHoursPerMonth: "0", hourlyCost: "" };
  const [v, setV] = useState<FormValues>(blank);
  const [suites, setSuites] = useState<{ id: string; name: string }[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = target === null ? null : target === "new" ? "new" : target.id;
  if (key !== shown) {
    setShown(key);
    setError(null);
    if (target && target !== "new") {
      const s = (n: number | null) => (n === null ? "" : String(n));
      setV({
        name: target.name,
        ciSuiteId: target.ciSuiteId ?? "none",
        totalTests: String(target.totalTests),
        automatedTests: String(target.automatedTests),
        manualMinutesPerTest: String(target.manualMinutesPerTest),
        automatedSecondsPerTest: s(target.automatedSecondsPerTest),
        runsPerMonth: s(target.runsPerMonth),
        buildHours: String(target.buildHours),
        maintenanceHoursPerMonth: String(target.maintenanceHoursPerMonth),
        hourlyCost: s(target.hourlyCost),
      });
    } else setV(blank);
  }
  useEffect(() => {
    if (target === null) return;
    fetch("/api/ci/suites")
      .then((r) => r.json())
      .then((d) => setSuites(d.suites ?? []))
      .catch(() => {});
  }, [target]);
  const set = (k: keyof FormValues, value: string) => setV((x) => ({ ...x, [k]: value }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const required: (keyof FormValues)[] = ["name", "totalTests", "automatedTests", "manualMinutesPerTest", "buildHours"];
    if (required.some((k) => !String(v[k]).trim())) return setError("Fill in the required fields.");
    const values = [v.totalTests, v.automatedTests, v.manualMinutesPerTest, v.automatedSecondsPerTest, v.runsPerMonth, v.buildHours, v.maintenanceHoursPerMonth, v.hourlyCost].map(num);
    if (values.some((n) => n !== null && (!Number.isFinite(n) || n < 0))) return setError("Numbers can't be negative.");
    if (Number(v.automatedTests) > Number(v.totalTests)) return setError("Automated test cases can't exceed the total.");
    const body = JSON.stringify({
      name: v.name,
      ciSuiteId: v.ciSuiteId === "none" ? null : v.ciSuiteId,
      totalTests: Math.round(Number(v.totalTests)),
      automatedTests: Math.round(Number(v.automatedTests)),
      manualMinutesPerTest: Number(v.manualMinutesPerTest),
      automatedSecondsPerTest: num(v.automatedSecondsPerTest),
      runsPerMonth: num(v.runsPerMonth),
      buildHours: Number(v.buildHours),
      maintenanceHoursPerMonth: num(v.maintenanceHoursPerMonth) ?? 0,
      hourlyCost: num(v.hourlyCost),
    });
    const res =
      target === "new"
        ? await fetch("/api/automation-roi/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body })
        : await withPasscode((headers) => fetch(`/api/automation-roi/projects/${(target as ProjectInfo).id}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body }));
    if (!res) return;
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setError(d.error ?? "Couldn't save the project.");
    toast.success(target === "new" ? "Project added" : "Project updated");
    onSaved();
  }

  const field = (k: keyof FormValues, label: string, hint?: string, required = false) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`roi-${k}`}>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Input id={`roi-${k}`} type="number" min={0} step="any" value={v[k]} onChange={(e) => set(k, e.target.value)} />
      {hint && <p className="text-xs text-neutral-600">{hint}</p>}
    </div>
  );

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{target === "new" ? "Add project" : "Edit project"}</DialogTitle>
            <DialogDescription>Numbers can be estimates — link a CI suite to use real run counts and durations.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="roi-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input id="roi-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Checkout regression" maxLength={200} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="roi-suite">Linked CI suite</Label>
              <Select value={v.ciSuiteId} onValueChange={(x) => set("ciSuiteId", x)}>
                <SelectTrigger id="roi-suite" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="none">None</SelectItem>
                  {suites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {field("totalTests", "Total test cases", "Manual + automated in scope", true)}
            {field("automatedTests", "Automated test cases", "Must be ≤ total", true)}
            {field("manualMinutesPerTest", "Avg manual time per test (min)", undefined, true)}
            {field("automatedSecondsPerTest", "Avg automated time per test (sec)", "Used if no CI suite is linked")}
            {field("runsPerMonth", "Runs per month (estimate)", "Used if no CI suite is linked")}
            {field("buildHours", "Build cost (hours)", "One-time effort to write the automation", true)}
            {field("maintenanceHoursPerMonth", "Maintenance (hours/month)")}
            {field("hourlyCost", `Hourly cost (${currency}, optional)`)}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-700 text-emerald-50 hover:bg-emerald-800">
              {target === "new" ? "Add project" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SnapshotDialog({ project, onClose, onSaved }: { project: ProjectInfo | null; onClose: () => void; onSaved: () => void }) {
  const [total, setTotal] = useState("");
  const [automated, setAutomated] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  if ((project?.id ?? null) !== shown) {
    setShown(project?.id ?? null);
    setTotal(String(project?.totalTests ?? ""));
    setAutomated(String(project?.automatedTests ?? ""));
  }
  async function save() {
    if (!project) return;
    const res = await fetch(`/api/automation-roi/projects/${project.id}/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totalTests: Number(total), automatedTests: Number(automated) }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.error ?? "Couldn't log the snapshot.");
    toast.success("Snapshot logged");
    onSaved();
  }
  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Log a snapshot</DialogTitle>
          <DialogDescription>Records today&apos;s counts for {project?.name} so coverage growth can be charted.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="snap-total">Total test cases</Label>
            <Input id="snap-total" type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="snap-auto">Automated</Label>
            <Input id="snap-auto" type="number" min={0} value={automated} onChange={(e) => setAutomated(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Log snapshot</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDrawer({ id, data, currency, onClose }: { id: string | null; data: Data | null; currency: string; onClose: () => void }) {
  const t = useChartTheme();
  const row = data?.rows.find((r) => r.id === id);
  const p = data?.projects.find((x) => x.id === id);
  const series = (data?.coverageSeries ?? []).filter((pt) => id && id in pt).map((pt) => ({ date: pt.date, coverage: pt[id!] as number }));
  return (
    <Sheet open={!!row && !!p} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {row && p && (
          <>
            <SheetHeader>
              <SheetTitle>{row.name}</SheetTitle>
              <SheetDescription>
                {data!.period.from} → {data!.period.to}
                {row.usingEstimates ? " · using estimates" : " · from CI runs"}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-6">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {(
                  [
                    ["Runs", fmt(row.runs)],
                    ["Manual effort avoided", `${fmt(row.manualAvoidedHours)} h`],
                    ["Execution time", `${fmt(row.executionHours)} h`],
                    ["Maintenance", `${fmt(row.maintenanceHours)} h`],
                    ["Net hours saved", `${fmt(row.netHours)} h`],
                    ["Build cost", `${fmt(row.buildHours)} h`],
                    ["ROI", row.roi === null ? "—" : `${fmt(row.roi, 0)}%`],
                    ["Break-even", row.breakEven ?? "Not yet"],
                    ["Coverage", `${fmt(row.coverage)}%`],
                    ["Pass rate", row.passRate === null ? "—" : `${row.passRate}%`],
                    ...(row.costSaved !== null ? [["Cost saved", `${currency}${fmt(row.costSaved, 0)}`]] : []),
                  ] as [string, string][]
                ).map(([k, val]) => (
                  <div key={k} className="contents">
                    <dt className="text-neutral-600">{k}</dt>
                    <dd className="text-right font-medium tabular-nums text-neutral-900">{val}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-600">Inputs</h3>
                <ul className="text-sm text-neutral-700">
                  <li>
                    {p.automatedTests} of {p.totalTests} test cases automated
                  </li>
                  <li>{p.manualMinutesPerTest} min per test by hand</li>
                  {p.automatedSecondsPerTest !== null && <li>{p.automatedSecondsPerTest} s per automated test</li>}
                  {p.runsPerMonth !== null && <li>{p.runsPerMonth} runs per month (estimate)</li>}
                  <li>{p.maintenanceHoursPerMonth} h maintenance per month</li>
                  {p.ciSuiteName && <li>CI suite: {p.ciSuiteName}</li>}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-600">Coverage over time</h3>
                {series.length < 2 ? (
                  <p className="text-sm text-neutral-600">Log snapshots on different days to see a trend.</p>
                ) : (
                  <div className="h-44">
                    <ResponsiveContainer>
                      <LineChart data={series} margin={{ left: -16, right: 8 }}>
                        <CartesianGrid vertical={false} stroke={t.grid} />
                        <XAxis dataKey="date" tick={t.tick} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} unit="%" tick={t.tick} tickLine={false} axisLine={false} />
                        <Tooltip {...t.tooltip} formatter={(v) => [`${v}%`, "Coverage"]} />
                        <Line type="linear" dataKey="coverage" stroke={t.series(0)} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
