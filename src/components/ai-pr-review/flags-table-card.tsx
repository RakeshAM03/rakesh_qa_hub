"use client";

import { useEffect, useState } from "react";
import { Pencil, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Pagination } from "@/components/shared/pagination";
import { toastResponseError, useAdminPasscode } from "@/components/shared/use-admin-passcode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  FLAG_SEVERITIES,
  FLAG_TYPE_LABELS,
  FLAG_TYPES,
  type FlagSeverity,
  type FlagTypeKey,
} from "@/lib/ai-pr-review/constants";
import { formatLocation } from "@/lib/ai-pr-review/location";
import { cn } from "@/lib/utils";
import { FlagSeverityPill } from "./badges";
import { FlagForm, flagToForm } from "./flag-form";

type FlagRow = {
  id: string;
  date: string;
  repo: string;
  prNumber: number | null;
  filePath: string | null;
  line: number | null;
  flagType: FlagTypeKey;
  detail: string;
  severity: FlagSeverity;
  suggestedFix: string | null;
  loggedBy: string | null;
  fileUrl: string | null;
};
type Summary = { total: number; counts: Record<FlagTypeKey, number>; repos: string[] };

const ALL = "all";
const mmddyyyy = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
};

export function FlagsTableCard({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 300);
  const [severity, setSeverity] = useState<FlagSeverity | typeof ALL>(ALL);
  const [repo, setRepo] = useState<string>(ALL);
  const [type, setType] = useState<FlagTypeKey | null>(null);
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [data, setData] = useState<{ flags: FlagRow[]; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<FlagRow | null>(null);
  const [toDelete, setToDelete] = useState<FlagRow | null>(null);
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  // Any filter change goes back to page 1.
  const filterKey = JSON.stringify([q, severity, repo, type, size]);
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai-pr-review/flags/summary", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(setSummary)
      .catch(() => {});
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (q) params.set("q", q);
    if (severity !== ALL) params.set("severity", severity);
    if (repo !== ALL) params.set("repo", repo);
    if (type) params.set("type", type);
    fetch(`/api/ai-pr-review/flags?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => {
        setData({ flags: json.flags, total: json.total });
        setFailed(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [q, severity, repo, type, size, page, refreshKey]);

  async function confirmDelete() {
    const flag = toDelete;
    setToDelete(null);
    if (!flag) return;
    const res = await withPasscode((headers) => fetch(`/api/ai-pr-review/flags/${flag.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't delete the flag.");
    toast.success("Flag deleted");
    if (data?.flags.length === 1 && page > 1) setPage(page - 1);
    onChanged();
  }

  const total = summary?.total ?? 0;
  const noFlagsAtAll = summary !== null && summary.total === 0;

  return (
    <section aria-labelledby="all-flags-title" className="rounded-xl border border-neutral-200 bg-white shadow-xs">
      <header className="border-b border-neutral-100 px-4 py-3 sm:px-5">
        <h2 id="all-flags-title" className="text-base font-semibold text-neutral-900">
          All logged flags
        </h2>
        <p className="text-sm text-neutral-500">
          {total} {total === 1 ? "flag" : "flags"} across all sessions
        </p>
      </header>

      {noFlagsAtAll ? (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <ShieldCheck className="size-10 text-purple-200" aria-hidden />
          <p className="font-medium text-neutral-700">No flags logged yet</p>
          <p className="max-w-md text-sm text-neutral-500">
            Generate a review prompt, run it in Claude, then paste the output in &lsquo;Log flags from session&rsquo; to
            add your first flags.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by flag type">
            {FLAG_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(type === t ? null : t)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  type === t
                    ? "border-purple-600 bg-purple-600 text-white"
                    : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-purple-300",
                )}
              >
                {FLAG_TYPE_LABELS[t]} — <span className="font-semibold">{summary?.counts[t] ?? "…"}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search flags..."
                aria-label="Search flags"
                className="pl-9"
              />
            </div>
            <div className="flex gap-1" role="group" aria-label="Filter by severity">
              {([ALL, ...FLAG_SEVERITIES] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={severity === s}
                  onClick={() => setSeverity(s)}
                  className={cn(
                    "h-9 rounded-full border px-4 text-sm font-medium",
                    severity === s
                      ? "border-purple-600 bg-purple-600 text-white"
                      : "border-neutral-300 text-neutral-600 hover:border-purple-300",
                  )}
                >
                  {s === ALL ? "All" : s}
                </button>
              ))}
            </div>
            <Select value={repo} onValueChange={setRepo}>
              <SelectTrigger className="w-full lg:w-52" aria-label="Filter by repo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All repos</SelectItem>
                {summary?.repos.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Pagination
            page={page}
            size={size}
            total={data?.total ?? 0}
            onPageChange={setPage}
            activeClassName="bg-purple-600 text-white hover:bg-purple-700"
          >
            <label className="flex items-center gap-2">
              Rows per page
              <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
                <SelectTrigger size="sm" className="w-18" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </Pagination>

          {failed && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Couldn&apos;t load flags.</p>
          )}

          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  {["Date", "Repo", "Flag Type", "Location", "Detail", "Severity", "Logged by", "Suggested Fix"].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                  <th className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data === null
                  ? Array.from({ length: 5 }, (_, i) => (
                      <tr key={i} className="border-t border-neutral-100">
                        <td colSpan={9} className="px-3 py-3">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      </tr>
                    ))
                  : data.flags.length === 0
                    ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-10 text-center text-neutral-500">
                          No flags match these filters.
                        </td>
                      </tr>
                    )
                    : data.flags.map((f) => (
                        <FlagTableRow key={f.id} flag={f} onEdit={() => setEditing(f)} onDelete={() => setToDelete(f)} />
                      ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit flag</DialogTitle>
            <DialogDescription>Update this logged flag.</DialogDescription>
          </DialogHeader>
          {editing && (
            <FlagForm
              idPrefix="edit-flag"
              initial={flagToForm(editing)}
              onSubmit={async (input) => {
                const res = await fetch(`/api/ai-pr-review/flags/${editing.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...input, prNumber: input.prNumber ?? null, line: input.line ?? null }),
                }).catch(() => null);
                if (!res?.ok) {
                  if (res) await toastResponseError(res, "Couldn't update the flag.");
                  else toast.error("Couldn't reach the server.");
                  return false;
                }
                toast.success("Flag updated");
                setEditing(null);
                onChanged();
                return false;
              }}
              footer={({ submitting }) => (
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="bg-purple-600 text-white hover:bg-purple-700">
                    {submitting ? "Saving…" : "Save changes"}
                  </Button>
                </DialogFooter>
              )}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this flag?</AlertDialogTitle>
            <AlertDialogDescription>It will be removed for everyone. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {passcodeDialog}
    </section>
  );
}

function Truncated({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("block truncate", className)}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function Expandable({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220 || text.split("\n").length > 4;
  return (
    <div>
      <p className={cn("whitespace-pre-wrap break-words", !open && long && "line-clamp-4")}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-xs font-medium text-purple-700 hover:underline">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function FlagTableRow({ flag, onEdit, onDelete }: { flag: FlagRow; onEdit: () => void; onDelete: () => void }) {
  const location = formatLocation(flag);
  return (
    <tr data-testid="flag-row" className="border-t border-neutral-100 align-top">
      <td className="px-3 py-2.5 whitespace-nowrap text-neutral-600">
        <Truncated text={mmddyyyy(flag.date)} />
      </td>
      <td className="max-w-32 px-3 py-2.5">
        <Truncated text={flag.repo} />
      </td>
      <td className="min-w-28 px-3 py-2.5 font-semibold text-neutral-900">{FLAG_TYPE_LABELS[flag.flagType]}</td>
      <td className="max-w-44 px-3 py-2.5 font-mono text-xs">
        {flag.fileUrl ? (
          <a href={flag.fileUrl} target="_blank" rel="noopener noreferrer" className="text-purple-700 hover:underline">
            <Truncated text={location || flag.fileUrl} />
          </a>
        ) : (
          <Truncated text={location || "—"} className="text-neutral-600" />
        )}
      </td>
      <td className="min-w-64 px-3 py-2.5 text-neutral-800">
        <Expandable text={flag.detail} />
      </td>
      <td className="px-3 py-2.5">
        <FlagSeverityPill severity={flag.severity} />
      </td>
      <td className="max-w-28 px-3 py-2.5 text-neutral-600">
        <Truncated text={flag.loggedBy || "Anonymous"} />
      </td>
      <td className="min-w-48 px-3 py-2.5 text-neutral-700">{flag.suggestedFix ? <Expandable text={flag.suggestedFix} /> : "—"}</td>
      <td className="px-2 py-2 whitespace-nowrap">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit flag">
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete flag" className="text-neutral-500 hover:text-red-600">
          <Trash2 />
        </Button>
      </td>
    </tr>
  );
}
