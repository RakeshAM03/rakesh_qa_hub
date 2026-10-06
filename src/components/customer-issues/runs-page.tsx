"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { MultiSelect } from "@/components/shared/multi-select";
import { useYourName } from "@/components/shared/your-name";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RUN_STATUS_LABELS } from "@/config/customer-issues";
import type { Lists } from "@/lib/customer-issues/model";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CiHeader } from "./ci-header";
import { useLists } from "./use-lists";

type RunRow = {
  id: string;
  name: string;
  productIds: string[];
  environment: string | null;
  build: string | null;
  release: { id: string; name: string; version: string | null } | null;
  status: keyof typeof RUN_STATUS_LABELS;
  createdAt: string;
  counts: { total: number; executed: number; pass: number; fail: number; blocked: number; na: number; pending: number };
};
const NONE = "__none";

export const STATUS_TONE: Record<string, string> = { IN_PROGRESS: "bg-blue-100 text-blue-800", BLOCKED: "bg-red-100 text-red-800", COMPLETE: "bg-green-100 text-green-800" };

/** Releases for the "link to a release" pickers. */
export function useReleases() {
  const [releases, setReleases] = useState<{ id: string; name: string; version: string | null }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/release-readiness/releases", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setReleases(j.releases))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return releases;
}

export function RunsPage() {
  const { lists } = useLists();
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/customer-issues/runs", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => setRuns(j.runs))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <>
      <CiHeader
        title="Release runs"
        subtitle="Run the mandatory regression pack for a release. A run is Complete only when every case is Pass (or N/A with a reason)."
        actions={
          <Button onClick={() => setOpen(true)} disabled={!lists} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
            <Plus aria-hidden /> New release run
          </Button>
        }
      />
      {!runs || !lists ? (
        <Skeleton className="h-60 w-full" />
      ) : !runs.length ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-700">No release runs yet. Start one before a release to execute the mandatory regression pack.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-card">
          <table className="w-full min-w-[820px] text-left text-sm" aria-label="Release runs">
            <thead className="border-b border-neutral-200 text-xs font-medium tracking-wide text-neutral-600 uppercase">
              <tr>
                <th className="px-3 py-2">Run</th>
                <th className="px-3 py-2">Products</th>
                <th className="px-3 py-2">Environment · build</th>
                <th className="px-3 py-2">Release</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {runs.map((r) => (
                <tr key={r.id} data-testid="run-row">
                  <td className="px-3 py-2">
                    <Link href={`/customer-issues/runs/${r.id}`} className="font-medium text-rose-800 hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-neutral-700">{r.productIds.length ? r.productIds.map((p) => lists.name(p) ?? "?").join(", ") : "All"}</td>
                  <td className="px-3 py-2 text-neutral-700">{[r.environment, r.build].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-2 text-neutral-700">{r.release ? `${r.release.name}${r.release.version ? ` ${r.release.version}` : ""}` : "—"}</td>
                  <td className="px-3 py-2">
                    <Badge className={cn("font-medium", STATUS_TONE[r.status])}>{RUN_STATUS_LABELS[r.status]}</Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-700 tabular-nums">
                    {r.counts.executed}/{r.counts.total} executed{r.counts.fail ? ` · ${r.counts.fail} failed` : ""}
                    {r.counts.blocked ? ` · ${r.counts.blocked} blocked` : ""}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-700">{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lists && <NewRunDialog open={open} onOpenChange={setOpen} lists={lists} />}
    </>
  );
}

function NewRunDialog({ open, onOpenChange, lists }: { open: boolean; onOpenChange: (o: boolean) => void; lists: Lists }) {
  const router = useRouter();
  const releases = useReleases();
  const { name: me } = useYourName();
  const [v, setV] = useState({ name: "", productIds: [] as string[], environment: "", build: "", releaseId: NONE });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) return setError("Name is required.");
    setBusy(true);
    const res = await fetch("/api/customer-issues/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: v.name, productIds: v.productIds, environment: v.environment || null, build: v.build || null, releaseId: v.releaseId === NONE ? null : v.releaseId, createdBy: me || null }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setError(d.error ?? "Couldn't create the run.");
    }
    const d = await res.json();
    router.push(`/customer-issues/runs/${d.id}`);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>New release run</DialogTitle>
            <DialogDescription>Takes a snapshot of the mandatory regression pack for the products in scope. Later edits to cases don&apos;t change this run.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="run-name">Name *</Label>
            <Input id="run-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="v2.5.0 regression" autoFocus />
          </div>
          <MultiSelect label="Products in scope" options={lists.of("PRODUCT").map((p) => ({ value: p.id, label: p.name }))} value={v.productIds} onChange={(productIds) => setV({ ...v, productIds })} empty="No products yet — the run will include every product." />
          <p className="-mt-1 text-xs text-neutral-600">Leave empty to include every product.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-env">Environment</Label>
              <Input id="run-env" value={v.environment} onChange={(e) => setV({ ...v, environment: e.target.value })} placeholder="Staging" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-build">Build / version</Label>
              <Input id="run-build" value={v.build} onChange={(e) => setV({ ...v, build: e.target.value })} placeholder="v2.5.0-rc1" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="run-release">Release Readiness release (optional)</Label>
            <Select value={v.releaseId} onValueChange={(releaseId) => setV({ ...v, releaseId })}>
              <SelectTrigger id="run-release" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={NONE}>Not linked</SelectItem>
                {releases.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.version ? ` ${r.version}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-600">Linking powers the &ldquo;Customer issue regression pack passed&rdquo; gate on that release.</p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
              Create run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
