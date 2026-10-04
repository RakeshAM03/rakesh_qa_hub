"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { useChartTheme } from "@/components/shared/use-chart-theme";
import { useYourName, YourNameField } from "@/components/shared/your-name";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { analysisFromClusters, analyze } from "@/lib/failure-analyzer/analyze";
import { CATEGORIES, CATEGORY_ORDER, type CategoryId } from "@/lib/failure-analyzer/rules";
import type { Analysis, Cluster, ParseResult } from "@/lib/failure-analyzer/types";
import { formatDateTime } from "@/lib/format";
import { InputCard } from "./input-card";
import { Results, useCategoryColor, type KnownIssue } from "./results";

type HistoryItem = {
  id: string;
  name: string;
  source: string;
  totalFailures: number;
  passed: number | null;
  skipped: number | null;
  categoryCounts: Record<CategoryId, number>;
  createdBy: string | null;
  createdAt: string;
};

type Current = { analysis: Analysis; source: string; savedName?: string };

export function FailureAnalyzer() {
  const [tab, setTab] = useState("analyze");
  const [current, setCurrent] = useState<Current | null>(null);
  const [known, setKnown] = useState<KnownIssue[]>([]);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [markKnown, setMarkKnown] = useState<Cluster | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  const loadKnown = useCallback(() => {
    fetch("/api/failure-analyzer/known-issues")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { issues: KnownIssue[] }) => setKnown(d.issues))
      .catch(() => toast.error("Couldn't load known issues."));
  }, []);
  const loadHistory = useCallback(() => {
    fetch("/api/failure-analyzer/analyses")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { analyses: HistoryItem[] }) => setHistory(d.analyses))
      .catch(() => toast.error("Couldn't load saved analyses."));
  }, []);
  useEffect(() => {
    loadKnown();
    loadHistory();
  }, [loadKnown, loadHistory]);

  function onParsed(result: ParseResult, source: string) {
    setCurrent({ analysis: analyze(result.failures, { passed: result.passed, skipped: result.skipped }), source });
  }

  async function open(id: string) {
    const res = await fetch(`/api/failure-analyzer/analyses/${id}`);
    if (!res.ok) return toast.error("Couldn't open that analysis.");
    const { analysis: a } = await res.json();
    setCurrent({
      analysis: analysisFromClusters(a.clusters as Cluster[], { total: a.totalFailures, passed: a.passed, skipped: a.skipped }),
      source: a.source,
      savedName: a.name,
    });
    setTab("analyze");
  }

  async function remove(id: string) {
    const res = await withPasscode((headers) => fetch(`/api/failure-analyzer/analyses/${id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
    toast.success("Analysis deleted");
    loadHistory();
  }

  async function removeKnown(id: string) {
    const res = await withPasscode((headers) => fetch(`/api/failure-analyzer/known-issues?id=${encodeURIComponent(id)}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
    toast.success("Known issue removed");
    loadKnown();
  }

  return (
    <>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="analyze">Analyze</TabsTrigger>
          <TabsTrigger value="known">Known issues{known.length ? ` (${known.length})` : ""}</TabsTrigger>
          <TabsTrigger value="history">History{history?.length ? ` (${history.length})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="analyze" className="flex flex-col gap-6">
          <InputCard onParsed={onParsed} />
          {current ? (
            <Results
              analysis={current.analysis}
              source={current.source}
              savedName={current.savedName}
              knownIssues={known}
              onSave={current.savedName ? undefined : () => setSaveOpen(true)}
              onMarkKnown={setMarkKnown}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-card px-6 py-12 text-center text-sm text-neutral-600">
              Paste failures or upload a report, then click Analyze — failures are grouped by likely root cause.
            </div>
          )}
        </TabsContent>
        <TabsContent value="known">
          <KnownIssuesList issues={known} onDelete={removeKnown} />
        </TabsContent>
        <TabsContent value="history" className="flex flex-col gap-6">
          <HistoryView items={history} onOpen={open} onDelete={remove} />
        </TabsContent>
      </Tabs>

      <MarkKnownDialog
        cluster={markKnown}
        onClose={() => setMarkKnown(null)}
        onSaved={() => {
          setMarkKnown(null);
          loadKnown();
        }}
      />
      {current && !current.savedName && (
        <SaveDialog
          open={saveOpen}
          current={current}
          onClose={() => setSaveOpen(false)}
          onSaved={(name) => {
            setSaveOpen(false);
            setCurrent({ ...current, savedName: name });
            loadHistory();
          }}
        />
      )}
      {passcodeDialog}
    </>
  );
}

function MarkKnownDialog({ cluster, onClose, onSaved }: { cluster: Cluster | null; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSig, setLastSig] = useState<string | null>(null);
  if (cluster && cluster.signature !== lastSig) {
    setLastSig(cluster.signature);
    setLabel(CATEGORIES[cluster.category].label.split(" /")[0] + " flake");
    setNotes("");
  }
  async function save() {
    if (!cluster || !label.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/failure-analyzer/known-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: cluster.signature, label, notes: notes || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      toast.success("Marked as a known issue");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!cluster} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as known flaky</DialogTitle>
          <DialogDescription>Future analyses will badge matching failures and let you hide them.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ki-label">Label</Label>
            <Input id="ki-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ki-notes">Notes (optional)</Label>
            <Textarea id="ki-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </div>
          {cluster && <p className="break-words font-mono text-xs text-neutral-600">{cluster.message.slice(0, 200)}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !label.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaveDialog({ open, current, onClose, onSaved }: { open: boolean; current: Current; onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { name: yourName } = useYourName();
  async function save() {
    setBusy(true);
    try {
      const a = current.analysis;
      const res = await fetch("/api/failure-analyzer/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          source: current.source.slice(0, 100),
          totalFailures: a.total,
          passed: a.passed ?? null,
          skipped: a.skipped ?? null,
          categoryCounts: a.categoryCounts,
          clusters: a.categories.flatMap((c) => c.clusters),
          createdBy: yourName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the analysis.");
      toast.success("Analysis saved");
      setName("");
      onSaved(data.analysis.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the analysis.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save analysis</DialogTitle>
          <DialogDescription>Saves the summary and clusters (not the raw logs) so you can compare runs over time.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fa-save-name">Name (optional)</Label>
            <Input id="fa-save-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the date and time" maxLength={200} />
          </div>
          <YourNameField id="fa-your-name" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KnownIssuesList({ issues, onDelete }: { issues: KnownIssue[]; onDelete: (id: string) => void }) {
  if (!issues.length) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-card px-6 py-12 text-center text-sm text-neutral-600">
        No known issues yet — use “Mark as known flaky” on a cluster to add one.
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-card shadow-xs" aria-label="Known issues">
      {issues.map((k) => (
        <li key={k.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-900">{k.label}</p>
            {k.notes && <p className="text-sm text-neutral-600">{k.notes}</p>}
            <p className="text-xs text-neutral-600">
              <code>{k.signature}</code> · added {formatDateTime(k.createdAt)}
            </p>
          </div>
          <Button size="icon" variant="ghost" aria-label={`Delete ${k.label}`} onClick={() => onDelete(k.id)}>
            <Trash2 className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function HistoryView({ items, onOpen, onDelete }: { items: HistoryItem[] | null; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const t = useChartTheme();
  const color = useCategoryColor();
  if (items === null) return <p className="text-sm text-neutral-600">Loading…</p>;
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-card px-6 py-12 text-center text-sm text-neutral-600">
        No saved analyses yet — analyze some failures and click “Save analysis”.
      </div>
    );
  }
  const used = CATEGORY_ORDER.filter((id) => items.some((i) => (i.categoryCounts[id] ?? 0) > 0));
  const trend = [...items].reverse().map((i) => ({ label: formatDateTime(i.createdAt), ...Object.fromEntries(used.map((id) => [id, i.categoryCounts[id] ?? 0])) }));
  return (
    <>
      <section aria-labelledby="fa-trend" className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs sm:p-5">
        <h2 id="fa-trend" className="mb-3 text-base font-semibold text-neutral-900">
          Failures per category over time
        </h2>
        {items.length < 2 ? (
          <p className="text-sm text-neutral-600">Save at least two analyses to see a trend.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={trend} margin={{ left: -16, right: 8 }}>
                <CartesianGrid vertical={false} stroke={t.grid} />
                <XAxis dataKey="label" tick={t.tick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={t.tick} tickLine={false} axisLine={false} />
                <Tooltip {...t.tooltip} cursor={{ fill: t.cursor }} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.label }} />
                {used.map((id, i) => (
                  <Bar
                    key={id}
                    dataKey={id}
                    name={CATEGORIES[id].label}
                    stackId="a"
                    fill={color(id)}
                    stroke={t.surface}
                    strokeWidth={1}
                    maxBarSize={36}
                    radius={i === used.length - 1 ? [4, 4, 0, 0] : 0}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      <ul className="flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-card shadow-xs" aria-label="Saved analyses">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-900">{i.name}</p>
              <p className="text-xs text-neutral-600">
                {formatDateTime(i.createdAt)} · {i.source} · {i.totalFailures} failures
                {i.createdBy ? ` · saved by ${i.createdBy}` : ""}
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                {CATEGORY_ORDER.filter((id) => (i.categoryCounts[id] ?? 0) > 0)
                  .map((id) => `${CATEGORIES[id].label.split(" /")[0]} ${i.categoryCounts[id]}`)
                  .join(" · ")}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onOpen(i.id)}>
              <Eye className="size-4" aria-hidden /> Open
            </Button>
            <Button size="icon" variant="ghost" aria-label={`Delete ${i.name}`} onClick={() => onDelete(i.id)}>
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
