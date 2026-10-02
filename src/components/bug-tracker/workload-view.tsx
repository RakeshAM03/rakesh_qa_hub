"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { BugTrackerTopBar } from "./top-bar";

type Row = { assignee: string | null; open: number; closed: number; openP0P1: number; total: number };

const th = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500";

export function WorkloadView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bug-tracker/workload")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => !cancelled && setRows(data.workload))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const max = Math.max(1, ...(rows ?? []).map((r) => r.total));

  return (
    <>
      <BugTrackerTopBar backHref="/bug-tracker" backLabel="Bug Tracker" />
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
        <Users className="size-6 text-neutral-500" aria-hidden /> Workload
      </h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">
        Valid issues per assignee — open (Open + In Progress) vs closed (Resolved + Closed) — to balance work across the team.
      </p>

      {failed ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Couldn&apos;t load the workload.</p>
      ) : rows === null ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center text-neutral-600">
          No valid issues yet. Add issues on a{" "}
          <Link href="/bug-tracker" className="font-medium underline">
            feature page
          </Link>{" "}
          and assign them to see the workload.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-neutral-200">
              <tr>
                <th className={th}>Assignee</th>
                <th className={`${th} text-right`}>Open</th>
                <th className={`${th} text-right`}>Open P0/P1</th>
                <th className={`${th} text-right`}>Closed</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={`${th} w-1/3`}>Open vs closed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.assignee ?? "unassigned"} data-testid="workload-row" className="border-t border-neutral-100">
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {r.assignee ?? <span className="text-neutral-500 italic">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.open}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.openP0P1 > 0 ? <span className="font-semibold text-red-700">{r.openP0P1}</span> : 0}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.closed}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.total}</td>
                  <td className="px-4 py-3">
                    <div
                      className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
                      style={{ width: `${(r.total / max) * 100}%` }}
                      role="img"
                      aria-label={`${r.open} open, ${r.closed} closed`}
                    >
                      {r.open > 0 && <span className="h-full rounded-l-full bg-amber-500" style={{ flex: r.open }} />}
                      {r.closed > 0 && <span className="h-full rounded-r-full bg-green-600" style={{ flex: r.closed }} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="flex gap-4 border-t border-neutral-100 px-4 py-2 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-amber-500" /> Open
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-green-600" /> Closed
            </span>
          </p>
        </div>
      )}
    </>
  );
}
