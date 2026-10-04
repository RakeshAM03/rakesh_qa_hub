"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutTemplate, Plus, Rocket, Search } from "lucide-react";
import { toast } from "sonner";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { todayIso, isoToLong } from "@/lib/dates";
import { isDecided, STATUS_LABELS, type ReleaseStatus, type Verdict } from "@/lib/readiness";
import { cn } from "@/lib/utils";
import { ReleaseFormDialog } from "./release-form-dialog";
import { ProgressRing, StatusPill } from "./shared";

type Row = {
  id: string;
  name: string;
  version: string | null;
  targetDate: string | null;
  owner: string | null;
  status: ReleaseStatus;
  score: number;
  verdict: Verdict;
  passed: number;
  applicable: number;
  blockers: number;
};

const ALL = "ALL";

export function ReleasesList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState(ALL);
  const [q, setQ] = useState("");
  const query = useDebouncedValue(q, 250);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status !== ALL) params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/release-readiness/releases?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { releases: Row[] }) => setRows(d.releases))
      .catch(() => toast.error("Couldn't load releases."));
  }, [status, query]);
  useEffect(load, [load]);

  const today = todayIso();
  const filtering = status !== ALL || query.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or version" aria-label="Search releases" className="pl-8" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ALL}>All statuses</SelectItem>
            {(Object.keys(STATUS_LABELS) as ReleaseStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" asChild>
          <Link href="/release-readiness/templates">
            <LayoutTemplate className="size-4" aria-hidden /> Manage templates
          </Link>
        </Button>
        <Button onClick={() => setOpen(true)} className="bg-green-600 text-white hover:bg-green-700">
          <Plus className="size-4" aria-hidden /> New Release
        </Button>
      </div>

      {rows === null ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-card px-6 py-14 text-center">
          <Rocket className="size-8 text-neutral-400" aria-hidden />
          <p className="text-sm text-neutral-600">{filtering ? "No releases match these filters." : "No releases yet — create your first release checklist."}</p>
          {!filtering && (
            <Button onClick={() => setOpen(true)} className="bg-green-600 text-white hover:bg-green-700">
              <Plus className="size-4" aria-hidden /> New Release
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-card shadow-xs">
          <table className="w-full text-left text-sm" aria-label="Releases">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Release</th>
                <th className="px-4 py-3 font-semibold">Target date</th>
                <th className="px-4 py-3 font-semibold">Readiness</th>
                <th className="px-4 py-3 font-semibold">Gates</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const overdue = r.targetDate && r.targetDate < today && !isDecided(r.status);
                return (
                  <tr key={r.id} className="cursor-pointer border-b border-neutral-200 last:border-0 hover:bg-neutral-50" onClick={() => router.push(`/release-readiness/${r.id}`)}>
                    <td className="px-4 py-3">
                      <Link href={`/release-readiness/${r.id}`} className="font-semibold text-neutral-900 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {r.name}
                      </Link>
                      {r.version && <span className="ml-2 text-xs text-neutral-500">{r.version}</span>}
                    </td>
                    <td className={cn("px-4 py-3 whitespace-nowrap", overdue ? "font-semibold text-red-600" : "text-neutral-700")}>
                      {r.targetDate ? isoToLong(r.targetDate) : "—"}
                      {overdue && <span className="sr-only"> (overdue)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <ProgressRing score={r.score} verdict={r.verdict} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-neutral-700">
                      {r.passed} / {r.applicable} passed
                      {r.blockers > 0 && <span className="ml-2 text-xs font-semibold text-red-600">{r.blockers} blocker{r.blockers === 1 ? "" : "s"}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{r.owner || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ReleaseFormDialog
        open={open}
        onOpenChange={setOpen}
        title="New release"
        submitLabel="Create"
        onSubmit={async (v) => {
          const res = await fetch("/api/release-readiness/releases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...v, version: v.version || undefined, owner: v.owner || undefined, description: v.description || undefined }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Couldn't create the release.");
          router.push(`/release-readiness/${data.release.id}`);
        }}
      />
    </div>
  );
}
