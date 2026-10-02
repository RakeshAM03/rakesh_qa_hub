"use client";

import { Fragment, useState } from "react";
import { ChevronRight, ExternalLink, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Markdown } from "@/components/shared/markdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatDuration, type Run } from "./types";

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 whitespace-nowrap";

const STATUS: Record<string, string> = {
  queued: "bg-neutral-100 text-neutral-700",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-neutral-100 text-neutral-700",
};
const CONCLUSION: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  failure: "bg-red-100 text-red-800",
  cancelled: "bg-neutral-200 text-neutral-700",
};
const pill = "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap";

type RunsTableProps = {
  suiteId: string;
  runs: Run[] | null;
  aiEnabled: boolean;
  onRcaLoaded: (runId: number, summary: string) => void;
};

export function RunsTable({ suiteId, runs, aiEnabled, onRcaLoaded }: RunsTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [rca, setRca] = useState<{ run: Run; summary?: string; detail?: string; loading: boolean } | null>(null);

  async function openRca(run: Run) {
    setRca({ run, loading: true });
    try {
      const res = await fetch(`/api/ci/suites/${suiteId}/runs/${run.id}/rca`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRca({ run, summary: data.summary, detail: data.detail, loading: false });
      onRcaLoaded(run.id, data.summary);
    } catch (err) {
      setRca(null);
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't get the root cause.");
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-sm">
        <thead className="border-b border-neutral-200">
          <tr>
            {["Run", "Status", "Report", "Conclusion", "Jobs", "Root cause", "Trigger", "Duration", "Started", "Actor"].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs === null
            ? Array.from({ length: 4 }, (_, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td colSpan={10} className="px-3 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            : runs.map((run) => {
                const open = expanded.has(run.id);
                return (
                  <Fragment key={run.id}>
                    <tr data-testid="ci-run" className="border-t border-neutral-100 align-middle">
                      <td className="px-3 py-2.5">
                        <a href={run.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-neutral-900 hover:underline">
                          #{run.number} <ExternalLink className="size-3 text-neutral-400" />
                        </a>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn(pill, STATUS[run.status] ?? STATUS.queued)}>
                          {run.status !== "completed" && <Loader2 className="size-3 animate-spin" aria-hidden />}
                          {run.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <a href={run.reportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-neutral-700 hover:underline">
                          <FileText className="size-3.5" /> Report
                        </a>
                      </td>
                      <td className="px-3 py-2.5">
                        {run.conclusion ? (
                          <span className={cn(pill, CONCLUSION[run.conclusion] ?? "bg-neutral-100 text-neutral-700")}>{run.conclusion}</span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {run.jobs.total > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((s) => {
                                const next = new Set(s);
                                if (next.has(run.id)) next.delete(run.id);
                                else next.add(run.id);
                                return next;
                              })
                            }
                            aria-expanded={open}
                            className="inline-flex items-center gap-1 tabular-nums hover:underline"
                          >
                            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
                            {run.jobs.passed}/{run.jobs.total}
                          </button>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="max-w-64 px-3 py-2.5">
                        {run.conclusion !== "failure" || !aiEnabled ? (
                          <span className="text-neutral-400">—</span>
                        ) : run.rcaSummary ? (
                          <button type="button" onClick={() => openRca(run)} className="line-clamp-2 text-left text-neutral-800 hover:underline">
                            {run.rcaSummary}
                          </button>
                        ) : (
                          <Button variant="outline" size="xs" onClick={() => openRca(run)}>
                            <Sparkles /> Analyse
                          </Button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-neutral-600">{run.event}</td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{formatDuration(run.durationSec)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-neutral-600">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <time dateTime={run.startedAt} tabIndex={0}>
                              {formatRelative(run.startedAt)}
                            </time>
                          </TooltipTrigger>
                          <TooltipContent>{formatDateTime(run.startedAt)}</TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-3 py-2.5">
                        {run.actor ? (
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            {/* eslint-disable-next-line @next/next/no-img-element -- small external avatar */}
                            <img src={run.actor.avatarUrl} alt="" width={20} height={20} className="size-5 rounded-full" />
                            {run.actor.login}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-neutral-50">
                        <td />
                        <td colSpan={9} className="px-3 py-2">
                          <ul className="flex flex-wrap gap-2">
                            {run.jobs.list.map((job) => (
                              <li key={job.id}>
                                <a
                                  href={job.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn(pill, CONCLUSION[job.conclusion ?? ""] ?? STATUS[job.status] ?? STATUS.queued, "hover:underline")}
                                >
                                  {job.name}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
        </tbody>
      </table>

      <Dialog open={rca !== null} onOpenChange={(o) => !o && setRca(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Root cause — run #{rca?.run.number}</DialogTitle>
            <DialogDescription>AI summary of the failed job logs. Check it against the logs before acting on it.</DialogDescription>
          </DialogHeader>
          {rca?.loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-neutral-500">
              <Loader2 className="size-4 animate-spin" /> Reading the failed job logs…
            </div>
          ) : (
            rca && (
              <div className="max-h-[60vh] overflow-y-auto">
                <p className="mb-3 font-medium">{rca.summary}</p>
                <Markdown>{rca.detail ?? ""}</Markdown>
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
