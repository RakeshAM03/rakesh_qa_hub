"use client";

import { useEffect, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DateRangeButton, type DateRange } from "@/components/shared/date-picker";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { isoToDdMmYyyy } from "@/lib/dates";
import { TASK_STATUSES, type TaskStatus } from "@/lib/qa-tracker/schema";
import { StatusPill, type Resource } from "./status";

type Log = { id: string; date: string; description: string; status: TaskStatus; hours: number };
type Group = { date: string; logs: Log[] };

type HistorySectionProps = {
  resources: Resource[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  refreshKey: number;
  /** A row was edited or deleted (analytics should refresh). */
  onChanged: () => void;
};

export function HistorySection({ resources, selectedId, onSelect, refreshKey, onChanged }: HistorySectionProps) {
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 300);
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toDelete, setToDelete] = useState<Log | null>(null);
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  const resourceId = selectedId ?? resources[0]?.id ?? null;
  const params = (offset: number) => {
    const p = new URLSearchParams({ resourceId: resourceId ?? "", offset: String(offset) });
    if (q) p.set("q", q);
    if (range.from) p.set("from", range.from);
    if (range.to) p.set("to", range.to);
    return p;
  };

  // Reset to a loading state whenever the query changes.
  const queryKey = JSON.stringify([resourceId, q, range, refreshKey]);
  const [lastQueryKey, setLastQueryKey] = useState(queryKey);
  if (queryKey !== lastQueryKey) {
    setLastQueryKey(queryKey);
    setGroups(null);
  }

  useEffect(() => {
    if (!resourceId) return;
    const controller = new AbortController();
    fetch(`/api/qa-tracker/logs?${params(0)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        setGroups(data.groups);
        setNextOffset(data.nextOffset);
        setFailed(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
    // params() only depends on the values listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, q, range, refreshKey]);

  async function loadMore() {
    if (nextOffset === null) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/qa-tracker/logs?${params(nextOffset)}`);
      const data = await res.json();
      setGroups((g) => [...(g ?? []), ...data.groups]);
      setNextOffset(data.nextOffset);
    } catch {
      toast.error("Couldn't load older entries.");
    } finally {
      setLoadingMore(false);
    }
  }

  function replaceLog(updated: Log) {
    setGroups((g) => g?.map((grp) => ({ ...grp, logs: grp.logs.map((l) => (l.id === updated.id ? updated : l)) })) ?? null);
  }

  async function patch(log: Log, body: Partial<Pick<Log, "status" | "hours">>) {
    const res = await fetch(`/api/qa-tracker/logs/${log.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res) return toast.error("Couldn't reach the server.");
    if (!res.ok) return toastResponseError(res, "Couldn't update the task.");
    replaceLog((await res.json()).log);
    toast.success("Task updated");
    onChanged();
  }

  async function confirmDelete() {
    const log = toDelete;
    setToDelete(null);
    if (!log) return;
    const res = await withPasscode((headers) => fetch(`/api/qa-tracker/logs/${log.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't delete the task.");
    setGroups((g) => g?.map((grp) => ({ ...grp, logs: grp.logs.filter((l) => l.id !== log.id) })).filter((grp) => grp.logs.length) ?? null);
    toast.success("Task deleted");
    onChanged();
  }

  if (resources.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
        Task history appears here once you add a resource and log work.
      </p>
    );
  }

  const filtered = Boolean(q || range.from);

  return (
    <section aria-label="Task history" className="flex flex-col gap-3">
      <Tabs value={resourceId ?? undefined} onValueChange={onSelect}>
        <div className="overflow-x-auto">
          <TabsList variant="line" className="h-auto w-max justify-start gap-4 rounded-none border-b border-neutral-200 p-0">
            {resources.map((r) => (
              <TabsTrigger
                key={r.id}
                value={r.id}
                className="h-10 flex-none rounded-none border-0 border-b-2 border-transparent px-1 data-[state=active]:border-neutral-900 data-[state=active]:font-semibold"
              >
                {r.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks..."
            aria-label="Search tasks"
            className="pl-9"
          />
        </div>
        <DateRangeButton value={range} onChange={setRange} />
      </div>

      {failed && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Couldn&apos;t load the history.</p>}

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="w-32 px-3 py-2 font-semibold">Date</th>
              <th className="px-3 py-2 font-semibold">Task Description</th>
              <th className="w-44 px-3 py-2 font-semibold">Status</th>
              <th className="w-32 px-3 py-2 font-semibold">Time Spent</th>
              <th className="w-12 px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {groups === null ? (
              Array.from({ length: 4 }, (_, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td colSpan={5} className="px-3 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-neutral-500">
                  {filtered ? "No tasks match these filters." : "No tasks logged yet for this person. Use Log Entry above to add the first one."}
                </td>
              </tr>
            ) : (
              groups.flatMap((group) =>
                group.logs.map((log, i) => (
                  <tr
                    key={log.id}
                    data-testid="history-row"
                    className={i === 0 ? "border-t border-neutral-200" : "border-t border-neutral-50"}
                  >
                    <td className="px-3 py-2 align-top font-medium whitespace-nowrap text-neutral-700">
                      {i === 0 ? isoToDdMmYyyy(group.date) : <span className="sr-only">{isoToDdMmYyyy(group.date)}</span>}
                    </td>
                    <td className="px-3 py-2 align-top break-words text-neutral-800">{log.description}</td>
                    <td className="px-3 py-1.5 align-top">
                      <Select value={log.status} onValueChange={(v) => patch(log, { status: v as TaskStatus })}>
                        <SelectTrigger
                          size="sm"
                          className="h-auto border-transparent bg-transparent p-0 shadow-none hover:bg-neutral-50"
                          aria-label={`Status for ${log.description}`}
                        >
                          <StatusPill status={log.status} />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {TASK_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              <StatusPill status={s} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-1.5 align-top">
                      <HoursInput log={log} onSave={(hours) => patch(log, { hours })} />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${log.description}`}
                        onClick={() => setToDelete(log)}
                        className="text-neutral-400 hover:text-red-600"
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                )),
              )
            )}
          </tbody>
        </table>
      </div>

      {nextOffset !== null && (
        <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="self-center">
          {loadingMore ? "Loading…" : "Load older dates"}
        </Button>
      )}

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toDelete?.description}” on {toDelete && isoToDdMmYyyy(toDelete.date)} will be removed. This can&apos;t be undone.
            </AlertDialogDescription>
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

/** Hours cell: edit in place, saved on blur or Enter when valid and changed. */
function HoursInput({ log, onSave }: { log: Log; onSave: (hours: number) => void }) {
  const [value, setValue] = useState(String(log.hours));
  const [lastHours, setLastHours] = useState(log.hours);
  if (log.hours !== lastHours) {
    setLastHours(log.hours);
    setValue(String(log.hours));
  }
  const n = Number(value);
  const invalid = value.trim() === "" || !(n > 0 && n <= 24 && Number.isInteger(n * 4));

  function commit() {
    if (invalid) {
      toast.error("Hours must be more than 0, up to 24, in steps of 0.25.");
      setValue(String(log.hours));
    } else if (n !== log.hours) {
      onSave(n);
    }
  }

  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0.25}
      max={24}
      step={0.25}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      aria-label={`Hours for ${log.description}`}
      aria-invalid={invalid}
      className="h-8 w-24 tabular-nums"
    />
  );
}
