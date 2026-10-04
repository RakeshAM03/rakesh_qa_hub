"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, FlaskConical, HelpCircle, Lightbulb, Loader2, Plus, Printer, Settings2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/page-header";
import { useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { copyText, downloadText } from "@/lib/browser";
import { isoToLong } from "@/lib/dates";
import { sendHandoff } from "@/lib/handoff";
import {
  CHANGE_SIZE_LABELS,
  computeAreas,
  DEFAULT_SETTINGS,
  FACTOR_HELP,
  focusAreasFor,
  LEVELS,
  matrixCell,
  planCsv,
  planMarkdown,
  prioritise,
  prQaContext,
  riskLevel,
  type AreaInput,
  type ChangeSize,
  type ComputedArea,
  type Level,
  type Settings,
} from "@/lib/risk";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  availableHours: number;
  testers: number | null;
  notes: string | null;
  release: { id: string; name: string; linkedRepos: string[] } | null;
  settings: Settings;
  areas: AreaInput[];
};
type Suggestion = { defectHistory?: { value: number; reason: string }; complexity?: { value: number; reason: string } };
type Factor = keyof typeof FACTOR_HELP;

export const LEVEL_TONE: Record<Level, string> = {
  Critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  High: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  Low: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
};
const CELL_TONE: Record<Level, string> = {
  Critical: "bg-red-200/70 dark:bg-red-900/50",
  High: "bg-orange-200/70 dark:bg-orange-900/40",
  Medium: "bg-amber-100 dark:bg-amber-900/30",
  Low: "bg-green-100 dark:bg-green-900/30",
};

export function LevelPill({ level, score }: { level: Level; score?: number }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", LEVEL_TONE[level])}>
      {level}
      {score !== undefined && ` · ${score}`}
    </span>
  );
}

export function PlanDetail({ id }: { id: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [areas, setAreas] = useState<AreaInput[]>([]);
  const [missing, setMissing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [features, setFeatures] = useState<{ id: string; name: string }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deferTarget, setDeferTarget] = useState<ComputedArea | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, Partial<AreaInput>>());
  const inflight = useRef(0);
  const { withPasscode, passcodeDialog } = useAdminPasscode();
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    fetch(`/api/risk-planner/plans/${id}`)
      .then(async (r) => {
        if (r.status === 404) return alive && setMissing(true);
        const d = await r.json();
        if (!alive) return;
        setPlan(d.plan);
        setAreas(d.plan.areas);
      })
      .catch(() => toast.error("Couldn't load the plan."));
    fetch("/api/bug-tracker/features")
      .then((r) => r.json())
      .then((d) => alive && setFeatures(d.features ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  const linkKey = areas.map((a) => `${a.id}:${a.featurePageId ?? ""}:${a.complexity}`).join("|");
  const loadSuggestions = useCallback(() => {
    fetch(`/api/risk-planner/suggestions?planId=${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { suggestions: Record<string, Suggestion> }) => setSuggestions(d.suggestions))
      .catch(() => {});
  }, [id]);
  useEffect(() => {
    if (!plan) return;
    const t = setTimeout(loadSuggestions, 800);
    return () => clearTimeout(t);
  }, [plan, linkKey, loadSuggestions]);

  const settings = plan?.settings ?? DEFAULT_SETTINGS;
  const computed = useMemo(() => (plan ? computeAreas(areas, plan.availableHours, settings) : []), [areas, plan, settings]);
  const byId = useMemo(() => new Map(computed.map((a) => [a.id, a])), [computed]);

  async function flush(areaId: string) {
    const patch = pending.current.get(areaId);
    pending.current.delete(areaId);
    if (!patch) return;
    inflight.current++;
    try {
      const res = await fetch(`/api/risk-planner/areas/${areaId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save.");
      inflight.current--;
      if (!inflight.current && !pending.current.size) setSaveState("saved");
    } catch (e) {
      inflight.current--;
      setSaveState("error");
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    }
  }

  /** Updates an area locally (instant recompute) and saves it after a short pause. */
  function editArea(areaId: string, patch: Partial<AreaInput>, immediate = false) {
    setAreas((prev) => prev.map((a) => (a.id === areaId ? { ...a, ...patch } : a)));
    if ("name" in patch && !patch.name?.trim()) return; // don't save an empty name
    pending.current.set(areaId, { ...pending.current.get(areaId), ...patch });
    clearTimeout(timers.current.get(areaId));
    setSaveState("saving");
    timers.current.set(areaId, setTimeout(() => flush(areaId), immediate ? 0 : 600));
  }

  async function patchPlan(patch: Record<string, unknown>, success?: string) {
    const res = await fetch(`/api/risk-planner/plans/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.error ?? "Couldn't save.");
    setPlan(d.plan);
    if (success) toast.success(success);
  }

  async function addArea() {
    const res = await fetch("/api/risk-planner/areas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: id, name: `Area ${areas.length + 1}` }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.error ?? "Couldn't add the area.");
    setAreas((prev) => [...prev, d.area]);
    setTimeout(() => document.getElementById(`area-name-${d.area.id}`)?.focus(), 50);
  }

  async function deleteArea(a: AreaInput) {
    const res = await withPasscode((headers) => fetch(`/api/risk-planner/areas/${a.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
    setAreas((prev) => prev.filter((x) => x.id !== a.id));
    toast.success("Area deleted");
  }

  function applyAll() {
    let n = 0;
    for (const a of areas) {
      const s = suggestions[a.id];
      const patch: Partial<AreaInput> = {};
      if (s?.defectHistory && s.defectHistory.value !== a.defectHistory) patch.defectHistory = s.defectHistory.value;
      if (s?.complexity && s.complexity.value !== a.complexity) patch.complexity = s.complexity.value;
      if (Object.keys(patch).length) {
        editArea(a.id, patch);
        n++;
      }
    }
    toast.success(n ? `Applied suggestions to ${n} area${n === 1 ? "" : "s"}` : "Nothing to apply");
  }

  if (missing) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-14 text-center text-sm text-neutral-600">
        This plan doesn&apos;t exist (it may have been deleted). <Link href="/risk-planner" className="font-medium underline">Back to plans</Link>
      </div>
    );
  }
  if (!plan) return <Skeleton className="h-96 w-full" />;

  const { active, deferred } = prioritise(computed);
  const allocated = Math.round(active.reduce((n, a) => n + a.hours, 0) * 10) / 10;
  const over = allocated > plan.availableHours;
  const pendingSuggestions = areas.filter((a) => {
    const s = suggestions[a.id];
    return (s?.defectHistory && s.defectHistory.value !== a.defectHistory) || (s?.complexity && s.complexity.value !== a.complexity);
  }).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={plan.name}
        icon={ShieldAlert}
        iconClassName="text-amber-600"
        backHref="/risk-planner"
        backLabel="Risk-Based Test Planner"
        subtitle={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {(plan.startDate || plan.endDate) && (
              <span>
                {plan.startDate ? isoToLong(plan.startDate) : "…"} – {plan.endDate ? isoToLong(plan.endDate) : "…"}
              </span>
            )}
            <span>{plan.availableHours} h available</span>
            {plan.testers ? <span>{plan.testers} testers</span> : null}
            {plan.release && (
              <Link href={`/release-readiness/${plan.release.id}`} className="underline">
                Release: {plan.release.name}
              </Link>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={() => copyText(planMarkdown(plan, computed), "Plan copied as Markdown")}>
              <Copy className="size-4" aria-hidden /> Copy Markdown
            </Button>
            <Button variant="outline" onClick={() => downloadText(`${plan.name.replace(/[^\w.-]+/g, "_")}-test-plan.csv`, planCsv(computed), "text/csv")}>
              <Download className="size-4" aria-hidden /> CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> Print
            </Button>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="size-4" aria-hidden /> Scoring settings
            </Button>
            <Button
              variant="outline"
              aria-label="Delete plan"
              onClick={async () => {
                const res = await withPasscode((headers) => fetch(`/api/risk-planner/plans/${id}`, { method: "DELETE", headers }));
                if (!res) return;
                if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
                toast.success("Plan deleted");
                router.push("/risk-planner");
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        }
      />
      {plan.notes && <p className="-mt-3 text-sm whitespace-pre-wrap text-neutral-700">{plan.notes}</p>}

      {/* Areas table */}
      <section aria-labelledby="rp-areas" className="rounded-xl border border-t-4 border-neutral-200 border-t-amber-500 bg-card p-4 shadow-xs">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="rp-areas" className="text-base font-semibold text-neutral-900">
            Areas
          </h2>
          <HowCalculated settings={settings} />
          <span className="ml-auto text-xs text-neutral-500" role="status" data-testid="save-state">
            {saveState === "saving" ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
              </span>
            ) : saveState === "saved" ? (
              <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
                <Check className="size-3" aria-hidden /> Saved
              </span>
            ) : saveState === "error" ? (
              <span className="text-red-600">Not saved</span>
            ) : null}
          </span>
          {pendingSuggestions > 0 && (
            <Button size="sm" variant="outline" className="print:hidden" onClick={applyAll}>
              <Lightbulb className="size-4 text-amber-500" aria-hidden /> Apply all suggestions ({pendingSuggestions})
            </Button>
          )}
          <Button size="sm" className="bg-amber-600 text-white hover:bg-amber-700 print:hidden" onClick={addArea}>
            <Plus className="size-4" aria-hidden /> Add area
          </Button>
        </div>
        {areas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">No areas yet — add the features or areas in scope.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs" aria-label="Areas">
              <thead className="border-b border-neutral-200 text-[11px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="py-2 pr-2 font-semibold">Area</th>
                  <th className="px-2 py-2 font-semibold">Feature page</th>
                  <th className="px-2 py-2 font-semibold">Change</th>
                  <th className="px-2 py-2 font-semibold">Complexity</th>
                  <th className="px-2 py-2 font-semibold">Defects</th>
                  <th className="px-2 py-2 font-semibold">Dependencies</th>
                  <th className="px-2 py-2 font-semibold">Impact</th>
                  <th className="px-2 py-2 font-semibold">Usage</th>
                  <th className="px-2 py-2 font-semibold">L × I</th>
                  <th className="px-2 py-2 font-semibold">Risk</th>
                  <th className="px-2 py-2 font-semibold">Hours</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                {areas.map((a) => {
                  const c = byId.get(a.id)!;
                  const sug = suggestions[a.id];
                  return (
                    <tr key={a.id} id={`area-${a.id}`} className={cn("border-b border-neutral-200 align-middle last:border-0", a.deferred && "opacity-60")} data-testid="area-row" data-area={a.name}>
                      <td className="py-2 pr-2">
                        <Input
                          id={`area-name-${a.id}`}
                          value={a.name}
                          onChange={(e) => editArea(a.id, { name: e.target.value })}
                          aria-label="Area name"
                          aria-invalid={!a.name.trim()}
                          className={cn("h-8 min-w-36 text-xs", !a.name.trim() && "border-red-500")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Select value={a.featurePageId ?? "none"} onValueChange={(v) => editArea(a.id, { featurePageId: v === "none" ? null : v }, true)}>
                          <SelectTrigger size="sm" className="w-36 text-xs" aria-label={`Feature page for ${a.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            <SelectItem value="none">—</SelectItem>
                            {features.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.name}
                              </SelectItem>
                            ))}
                            {a.featurePageId && !features.some((f) => f.id === a.featurePageId) && <SelectItem value={a.featurePageId}>(deleted page)</SelectItem>}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Select value={a.changeSize} onValueChange={(v) => editArea(a.id, { changeSize: v as ChangeSize })}>
                          <SelectTrigger size="sm" className="w-28 text-xs" aria-label={`Change size for ${a.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {(Object.keys(CHANGE_SIZE_LABELS) as ChangeSize[]).map((s) => (
                              <SelectItem key={s} value={s}>
                                {CHANGE_SIZE_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      {(["complexity", "defectHistory", "dependencies", "businessImpact", "usageFrequency"] as Factor[]).map((f) => {
                        const s = f === "defectHistory" ? sug?.defectHistory : f === "complexity" ? sug?.complexity : undefined;
                        return (
                          <td key={f} className="px-2 py-2">
                            <div className="flex items-center gap-1">
                              <Scale value={a[f]} factor={f} area={a.name} onChange={(v) => editArea(a.id, { [f]: v })} />
                              {s && s.value !== a[f] && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="inline-flex items-center rounded px-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300 print:hidden"
                                      onClick={() => editArea(a.id, { [f]: s.value })}
                                      aria-label={`Apply suggested ${FACTOR_HELP[f].label} ${s.value} for ${a.name}`}
                                    >
                                      💡{s.value}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-64">Suggested {s.value}: {s.reason}. Click to apply.</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums text-neutral-700">
                        {c.likelihood} × {c.impact}
                      </td>
                      <td className="px-2 py-2">
                        <LevelPill level={c.level} score={c.score} />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          value={a.hoursOverride ?? ""}
                          placeholder={a.deferred ? "—" : String(c.hours)}
                          onChange={(e) => editArea(a.id, { hoursOverride: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                          aria-label={`Hours override for ${a.name}`}
                          title="Leave empty to allocate automatically"
                          className="h-8 w-20 text-xs"
                          disabled={a.deferred}
                        />
                      </td>
                      <td className="py-2 pl-2">
                        <Button size="icon" variant="ghost" className="size-8 print:hidden" aria-label={`Delete ${a.name}`} onClick={() => deleteArea(a)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <RiskMatrix areas={computed.filter((a) => !a.deferred)} settings={settings} />

        {/* Prioritised plan */}
        <section aria-labelledby="rp-plan" className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs">
          <h2 id="rp-plan" className="mb-3 text-base font-semibold text-neutral-900">
            Prioritised test plan
          </h2>
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-xs text-neutral-600">
              <span data-testid="capacity">
                {allocated} h allocated of {plan.availableHours} h
              </span>
              {over && <span className="font-semibold text-red-600">Over capacity by {Math.round((allocated - plan.availableHours) * 10) / 10} h</span>}
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label="Capacity" aria-valuemin={0} aria-valuemax={plan.availableHours} aria-valuenow={allocated}>
              <div className={cn("h-full rounded-full", over ? "bg-red-500" : "bg-amber-500")} style={{ width: `${plan.availableHours ? Math.min(100, (allocated / plan.availableHours) * 100) : 0}%` }} />
            </div>
          </div>
          {active.length === 0 ? (
            <p className="text-sm text-neutral-500">Add areas to see the plan.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-neutral-200" aria-label="Prioritised plan">
              {active.map((a, i) => (
                <li key={a.id} className="flex flex-col gap-1.5 py-2.5" data-testid="plan-row">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-6 text-sm font-bold text-neutral-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-neutral-900">{a.name}</span>
                    <LevelPill level={a.level} score={a.score} />
                    <span className="text-sm font-semibold tabular-nums text-neutral-900">{a.hours} h</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-8">
                    <DepthText area={a} onSave={(depthOverride) => editArea(a.id, { depthOverride }, true)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-8">
                    {a.testTypes.map((t) => (
                      <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-700">
                        {t}
                      </span>
                    ))}
                    <span className="ml-auto flex items-center gap-2 print:hidden">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          sendHandoff("pr-qa-session", { context: prQaContext(a), focusAreas: focusAreasFor(a), source: "Risk-Based Test Planner" });
                          router.push("/pr-qa-session");
                        }}
                      >
                        <FlaskConical className="size-4" aria-hidden /> Send to PR QA Session
                      </Button>
                      <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                        <Switch checked={false} onCheckedChange={() => setDeferTarget(a)} aria-label={`Defer ${a.name}`} /> Defer
                      </label>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {deferred.length > 0 && (
            <div className="mt-4 rounded-lg border border-neutral-200 p-3">
              <h3 className="mb-2 text-sm font-semibold text-neutral-900">Accepted risks (out of scope / deferred)</h3>
              <ul className="flex flex-col gap-1.5" aria-label="Accepted risks">
                {deferred.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-neutral-900">{a.name}</span>
                    <LevelPill level={a.level} score={a.score} />
                    <span className="flex-1 text-neutral-600">— {a.deferReason}</span>
                    <Button size="sm" variant="ghost" className="print:hidden" onClick={() => editArea(a.id, { deferred: false }, true)}>
                      Bring back
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <DeferDialog
        area={deferTarget}
        onClose={() => setDeferTarget(null)}
        onSubmit={(reason) => {
          editArea(deferTarget!.id, { deferred: true, deferReason: reason }, true);
          setDeferTarget(null);
        }}
      />
      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onSave={(s) => patchPlan({ settings: s }, "Scoring settings saved")} />
      {passcodeDialog}
    </div>
  );
}

/** 1–5 segmented control with a tooltip per level. */
function Scale({ value, factor, area, onChange }: { value: number; factor: Factor; area: string; onChange: (v: number) => void }) {
  const help = FACTOR_HELP[factor];
  return (
    <div role="radiogroup" aria-label={`${help.label} for ${area}`} className="inline-flex overflow-hidden rounded-md border border-neutral-300">
      {[1, 2, 3, 4, 5].map((n) => (
        <Tooltip key={n}>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} — ${help.levels[n - 1]}`}
              onClick={() => onChange(n)}
              className={cn("w-6 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100", value === n && "bg-amber-500 text-white hover:bg-amber-500")}
            >
              {n}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {help.label} {n}: {help.levels[n - 1]}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function DepthText({ area, onSave }: { area: ComputedArea; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  if (!editing) {
    return (
      <span className="text-xs text-neutral-600">
        {area.depth}
        {area.depthOverride && <span className="ml-1 text-amber-700">(custom)</span>}{" "}
        <button
          type="button"
          className="text-xs font-medium text-amber-700 hover:underline print:hidden"
          onClick={() => {
            setValue(area.depth);
            setEditing(true);
          }}
        >
          Change
        </button>
      </span>
    );
  }
  return (
    <form
      className="flex w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value.trim() || null);
        setEditing(false);
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Test depth for ${area.name}`} className="h-8 flex-1 text-xs" maxLength={500} autoFocus />
      <Button size="sm" type="submit">
        Save
      </Button>
      <Button
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => {
          onSave(null);
          setEditing(false);
        }}
      >
        Reset
      </Button>
    </form>
  );
}

function RiskMatrix({ areas, settings }: { areas: ComputedArea[]; settings: Settings }) {
  const cells = new Map<string, ComputedArea[]>();
  for (const a of areas) {
    const { x, y } = matrixCell(a);
    cells.set(`${x}-${y}`, [...(cells.get(`${x}-${y}`) ?? []), a]);
  }
  return (
    <section aria-labelledby="rp-matrix" className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs">
      <h2 id="rp-matrix" className="mb-3 text-base font-semibold text-neutral-900">
        Risk matrix
      </h2>
      <div className="flex gap-2">
        <div className="flex w-5 items-center justify-center">
          <span className="-rotate-90 text-xs whitespace-nowrap text-neutral-500">Likelihood →</span>
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-5 gap-1" role="grid" aria-label="Risk matrix: likelihood by impact">
            {[5, 4, 3, 2, 1].map((y) =>
              [1, 2, 3, 4, 5].map((x) => {
                const list = cells.get(`${x}-${y}`) ?? [];
                const level = riskLevel(x * y, settings);
                return (
                  <div key={`${x}-${y}`} role="gridcell" aria-label={`Likelihood ${y}, impact ${x}: ${list.length ? list.map((a) => a.name).join(", ") : "no areas"}`} className={cn("flex min-h-16 flex-col gap-1 rounded-md p-1", CELL_TONE[level])} data-cell={`${x}-${y}`}>
                    {list.map((a) => (
                      <Tooltip key={a.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="truncate rounded bg-white/90 px-1 py-0.5 text-left text-[10px] font-medium text-neutral-900 shadow-xs hover:ring-2 hover:ring-amber-500 dark:bg-neutral-900/80 dark:text-neutral-100"
                            onClick={() => {
                              const row = document.getElementById(`area-${a.id}`);
                              row?.scrollIntoView({ behavior: "smooth", block: "center" });
                              document.getElementById(`area-name-${a.id}`)?.focus({ preventScroll: true });
                            }}
                          >
                            {a.name}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {a.name}: {a.level}, score {a.score} (likelihood {a.likelihood}, impact {a.impact}), {a.hours} h
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                );
              }),
            )}
          </div>
          <div className="mt-1 grid grid-cols-5 text-center text-[10px] text-neutral-500">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
          <p className="text-center text-xs text-neutral-500">Impact →</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-600" aria-label="Legend">
        {LEVELS.map((l) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded-sm", CELL_TONE[l])} aria-hidden /> {l}
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowCalculated({ settings: s }: { settings: Settings }) {
  const w = s.likelihoodWeights;
  const iw = s.impactWeights;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 print:hidden">
          <HelpCircle className="size-3.5" aria-hidden /> How is this calculated?
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 text-xs leading-5" align="start">
        <p>
          <strong>Change size → score:</strong> {Object.entries(CHANGE_SIZE_LABELS).map(([k, l]) => `${l} ${s.changeSizeScores[k as ChangeSize]}`).join(", ")}.
        </p>
        <p className="mt-1">
          <strong>Likelihood (1–5)</strong> = change size {w.changeSize}%, complexity {w.complexity}%, defect history {w.defectHistory}%, dependencies {w.dependencies}% (weighted average, one decimal).
        </p>
        <p className="mt-1">
          <strong>Impact (1–5)</strong> = business impact {iw.businessImpact}%, usage frequency {iw.usageFrequency}%.
        </p>
        <p className="mt-1">
          <strong>Risk score</strong> = likelihood × impact (1–25). <strong>Levels:</strong> Critical ≥ {s.thresholds.critical}, High ≥ {s.thresholds.high}, Medium ≥ {s.thresholds.medium}, Low below.
        </p>
        <p className="mt-1">
          <strong>Hours:</strong> available hours split by risk score, at least {s.minHours} h per area, rounded to {s.roundTo} h. Overrides are kept and the rest is redistributed; deferred areas get none.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function DeferDialog({ area, onClose, onSubmit }: { area: ComputedArea | null; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  if ((area?.id ?? null) !== shown) {
    setShown(area?.id ?? null);
    setReason("");
  }
  return (
    <Dialog open={!!area} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return toast.error("A reason is required to defer an area.");
            onSubmit(reason.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>Defer “{area?.name}”</DialogTitle>
            <DialogDescription>It drops out of the hour allocation and is listed under accepted risks.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="defer-reason">Reason</Label>
            <Input id="defer-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Not changed this sprint; covered by automation" maxLength={1000} autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Defer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDrawer({ open, onOpenChange, settings, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; settings: Settings; onSave: (s: Settings) => Promise<unknown> }) {
  const [s, setS] = useState<Settings>(settings);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setS(structuredClone(settings));
  }
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const field = (label: string, value: number, onChange: (n: number) => void, step = 1) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-neutral-700">{label}</span>
      <Input type="number" min={0} step={step} value={value} onChange={(e) => onChange(num(e.target.value))} className="h-8 w-24" aria-label={label} />
    </label>
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Scoring settings</SheetTitle>
          <SheetDescription>For this plan only.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Change size → score</legend>
            {(Object.keys(CHANGE_SIZE_LABELS) as ChangeSize[]).map((k) => field(CHANGE_SIZE_LABELS[k], s.changeSizeScores[k], (n) => setS({ ...s, changeSizeScores: { ...s.changeSizeScores, [k]: n } })))}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Likelihood weights (%)</legend>
            {field("Change size", s.likelihoodWeights.changeSize, (n) => setS({ ...s, likelihoodWeights: { ...s.likelihoodWeights, changeSize: n } }))}
            {field("Complexity", s.likelihoodWeights.complexity, (n) => setS({ ...s, likelihoodWeights: { ...s.likelihoodWeights, complexity: n } }))}
            {field("Defect history", s.likelihoodWeights.defectHistory, (n) => setS({ ...s, likelihoodWeights: { ...s.likelihoodWeights, defectHistory: n } }))}
            {field("Dependencies", s.likelihoodWeights.dependencies, (n) => setS({ ...s, likelihoodWeights: { ...s.likelihoodWeights, dependencies: n } }))}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Impact weights (%)</legend>
            {field("Business impact", s.impactWeights.businessImpact, (n) => setS({ ...s, impactWeights: { ...s.impactWeights, businessImpact: n } }))}
            {field("Usage frequency", s.impactWeights.usageFrequency, (n) => setS({ ...s, impactWeights: { ...s.impactWeights, usageFrequency: n } }))}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Level thresholds (score ≥)</legend>
            {field("Critical", s.thresholds.critical, (n) => setS({ ...s, thresholds: { ...s.thresholds, critical: n } }), 0.1)}
            {field("High", s.thresholds.high, (n) => setS({ ...s, thresholds: { ...s.thresholds, high: n } }), 0.1)}
            {field("Medium", s.thresholds.medium, (n) => setS({ ...s, thresholds: { ...s.thresholds, medium: n } }), 0.1)}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Test depth by level</legend>
            {LEVELS.map((l) => (
              <label key={l} className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-700">{l}</span>
                <Input value={s.depth[l]} onChange={(e) => setS({ ...s, depth: { ...s.depth, [l]: e.target.value } })} className="h-8 text-xs" aria-label={`${l} depth`} />
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Hours</legend>
            {field("Minimum per area", s.minHours, (n) => setS({ ...s, minHours: n }), 0.5)}
            {field("Round to", s.roundTo, (n) => setS({ ...s, roundTo: n || 0.5 }), 0.25)}
          </fieldset>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setS(structuredClone(DEFAULT_SETTINGS))}>
              Reset to defaults
            </Button>
            <Button
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={async () => {
                await onSave(s);
                onOpenChange(false);
              }}
            >
              Save settings
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
