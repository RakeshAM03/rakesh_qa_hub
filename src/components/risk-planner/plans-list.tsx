"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { MultiSelect } from "@/components/shared/multi-select";
import { useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { isoToShort } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type PlanRow = { id: string; name: string; startDate: string | null; endDate: string | null; availableHours: number; testers: number | null; releaseName: string | null; areas: number; highRisk: number; createdAt: string };

export function PlansList() {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  const load = useCallback(() => {
    fetch("/api/risk-planner/plans")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { plans: PlanRow[] }) => setPlans(d.plans))
      .catch(() => toast.error("Couldn't load plans."));
  }, []);
  useEffect(load, [load]);

  async function duplicate(p: PlanRow) {
    const res = await fetch(`/api/risk-planner/plans/${p.id}/duplicate`, { method: "POST" });
    if (!res.ok) return toast.error("Couldn't duplicate the plan.");
    toast.success("Plan duplicated");
    load();
  }
  async function remove(p: PlanRow) {
    const res = await withPasscode((headers) => fetch(`/api/risk-planner/plans/${p.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
    toast.success("Plan deleted");
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <Button className="self-start bg-amber-700 text-amber-50 hover:bg-amber-800" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> New Plan
      </Button>
      {plans === null ? (
        <Skeleton className="h-40 w-full" />
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-card px-6 py-14 text-center">
          <ShieldAlert className="size-8 text-neutral-400" aria-hidden />
          <p className="text-sm text-neutral-600">No test plans yet — create one to start prioritising.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-card shadow-xs">
          <table className="w-full text-left text-sm" aria-label="Test plans">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-wider text-neutral-600">
              <tr>
                {["Plan", "Period", "Areas", "High-risk areas", "Available hours", "Created", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-neutral-200 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/risk-planner/${p.id}`} className="font-semibold text-neutral-900 hover:underline">
                      {p.name}
                    </Link>
                    {p.releaseName && <span className="ml-2 text-xs text-neutral-600">· {p.releaseName}</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-700">{p.startDate || p.endDate ? `${p.startDate ? isoToShort(p.startDate) : "…"} – ${p.endDate ? isoToShort(p.endDate) : "…"}` : "—"}</td>
                  <td className="px-4 py-3 text-neutral-700">{p.areas}</td>
                  <td className={cn("px-4 py-3", p.highRisk ? "font-semibold text-red-700" : "text-neutral-700")}>{p.highRisk}</td>
                  <td className="px-4 py-3 text-neutral-700">
                    {p.availableHours} h{p.testers ? ` · ${p.testers} tester${p.testers === 1 ? "" : "s"}` : ""}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-700">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => router.push(`/risk-planner/${p.id}`)}>
                        Open
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Duplicate ${p.name}`} onClick={() => duplicate(p)}>
                        <Copy className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewPlanDialog open={open} onOpenChange={setOpen} plans={plans ?? []} onCreated={(id) => router.push(`/risk-planner/${id}`)} />
      {passcodeDialog}
    </div>
  );
}

function NewPlanDialog({ open, onOpenChange, plans, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; plans: PlanRow[]; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hours, setHours] = useState("40");
  const [testers, setTesters] = useState("");
  const [notes, setNotes] = useState("");
  const [releaseId, setReleaseId] = useState("none");
  const [from, setFrom] = useState<"blank" | "duplicate" | "features">("blank");
  const [copyId, setCopyId] = useState("");
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  const [options, setOptions] = useState<{ releases: { id: string; name: string }[]; features: { value: string; label: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open || options) return;
    Promise.all([fetch("/api/release-readiness/releases").then((r) => r.json()), fetch("/api/bug-tracker/features").then((r) => r.json())])
      .then(([rr, bt]) => setOptions({ releases: rr.releases ?? [], features: (bt.features ?? []).map((f: { id: string; name: string }) => ({ value: f.id, label: f.name })) }))
      .catch(() => setOptions({ releases: [], features: [] }));
  }, [open, options]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || hours === "" || Number(hours) < 0) return;
    if (from === "duplicate" && !copyId) return toast.error("Pick a plan to copy.");
    if (from === "features" && !featureIds.length) return toast.error("Pick at least one feature page.");
    setBusy(true);
    try {
      const res = await fetch("/api/risk-planner/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          startDate: startDate || null,
          endDate: endDate || null,
          availableHours: Number(hours),
          testers: testers ? Number(testers) : null,
          notes: notes || undefined,
          releaseId: releaseId === "none" ? null : releaseId,
          start: from === "duplicate" ? { from, planId: copyId } : from === "features" ? { from, featurePageIds: featureIds } : { from },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't create the plan.");
      onOpenChange(false);
      onCreated(data.plan.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New plan</DialogTitle>
            <DialogDescription>List the areas in scope, score them, and get a prioritised plan.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-name">
              Name <span className="text-red-700">*</span>
            </Label>
            <Input id="rp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 42" maxLength={200} aria-invalid={submitted && !name.trim()} />
            {submitted && !name.trim() && <p className="text-xs text-red-700">Required</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rp-start">Start date</Label>
              <DatePicker id="rp-start" value={startDate} onChange={setStartDate} allowFuture />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rp-end">End date</Label>
              <DatePicker id="rp-end" value={endDate} onChange={setEndDate} allowFuture />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rp-hours">
                Available testing hours <span className="text-red-700">*</span>
              </Label>
              <Input id="rp-hours" type="number" min={0} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rp-testers">Testers (optional)</Label>
              <Input id="rp-testers" type="number" min={0} value={testers} onChange={(e) => setTesters(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-release">Release (optional)</Label>
            <Select value={releaseId} onValueChange={setReleaseId}>
              <SelectTrigger id="rp-release" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="none">No release</SelectItem>
                {options?.releases.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-600">Linking a release lets suggestions use its AI PR Review repos.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-notes">Notes</Label>
            <Textarea id="rp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Start from</legend>
            {(
              [
                ["blank", "Blank"],
                ["duplicate", "Duplicate a previous plan"],
                ["features", "Import areas from Bug Tracker feature pages"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input type="radio" name="rp-from" value={v} checked={from === v} onChange={() => setFrom(v)} className="accent-amber-600" />
                {l}
              </label>
            ))}
            {from === "duplicate" && (
              <Select value={copyId} onValueChange={setCopyId}>
                <SelectTrigger className="w-full" aria-label="Plan to copy">
                  <SelectValue placeholder={plans.length ? "Pick a plan" : "No plans yet"} />
                </SelectTrigger>
                <SelectContent position="popper">
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {from === "features" && <MultiSelect label="Feature pages" options={options?.features ?? []} value={featureIds} onChange={setFeatureIds} empty="No feature pages yet — add them in Bug Tracker." />}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-amber-700 text-amber-50 hover:bg-amber-800">
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
