"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, GitBranch, MoreHorizontal, Pencil, Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { colorStyles } from "@/lib/ci/colors";
import { rangeLabel, totalPagesFor } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { DispatchDialog } from "./dispatch-dialog";
import { RunsTable } from "./runs-table";
import type { Run, Suite } from "./types";

const POLL_MS = 20_000;

type RunsResult = { runs: Run[]; total: number; perPage: number } | { error: string };

/** One page of runs; null when the request was aborted. */
async function fetchRuns(suiteId: string, page: number, signal?: AbortSignal): Promise<RunsResult | null> {
  try {
    const res = await fetch(`/api/ci/suites/${suiteId}/runs?page=${page}`, { signal });
    const json = await res.json();
    if (!res.ok) return { error: json.error ?? "Couldn't load runs." };
    return { runs: json.runs, total: json.total, perPage: json.perPage };
  } catch (err) {
    return (err as Error).name === "AbortError" ? null : { error: "Couldn't load runs." };
  }
}

type SuiteSectionProps = {
  suite: Suite;
  index: number;
  count: number;
  githubConnected: boolean;
  aiEnabled: boolean;
  refreshKey: number;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onDispatch: (ref: string, inputs: Record<string, string>) => Promise<boolean>;
};

export function SuiteSection(props: SuiteSectionProps) {
  const { suite, index, count, githubConnected, aiEnabled, refreshKey, onEdit, onDelete, onMove, onDispatch } = props;
  const style = colorStyles(suite.color);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ runs: Run[]; total: number; perPage: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localKey, setLocalKey] = useState(0);
  const [dispatchOpen, setDispatchOpen] = useState(false);

  const apply = (result: RunsResult) => {
    if ("error" in result) setError(result.error);
    else {
      setData(result);
      setError(null);
    }
  };

  useEffect(() => {
    if (!githubConnected) return;
    const controller = new AbortController();
    fetchRuns(suite.id, page, controller.signal).then((r) => r && apply(r));
    return () => controller.abort();
  }, [githubConnected, suite.id, page, refreshKey, localKey]);

  // Poll while any run on this page is queued or in progress.
  const active = data?.runs.some((r) => r.status !== "completed") ?? false;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => fetchRuns(suite.id, page).then((r) => r && apply(r)), POLL_MS);
    return () => clearInterval(id);
  }, [active, suite.id, page]);

  async function run(ref: string, inputs: Record<string, string>) {
    const ok = await onDispatch(ref, inputs);
    if (ok) setTimeout(() => setLocalKey((k) => k + 1), 3000);
    return ok;
  }

  const total = data?.total ?? 0;
  const perPage = data?.perPage ?? 10;
  const pages = totalPagesFor(total, perPage);
  const empty = total === 0;

  return (
    <section
      id={`suite-${suite.id}`}
      aria-labelledby={`suite-${suite.id}-title`}
      className={cn("scroll-mt-4 overflow-hidden rounded-xl border border-t-4 border-neutral-200 bg-white shadow-xs", style.border)}
    >
      <header className={cn("flex flex-wrap items-center gap-2 px-4 py-3", style.header)}>
        <div className="min-w-0 flex-1">
          <h2 id={`suite-${suite.id}-title`} className="truncate text-base font-semibold text-neutral-900">
            CI Reports — {suite.name}
          </h2>
          <p className="truncate font-mono text-xs text-neutral-500">
            {suite.repo} · {suite.workflowFile}
          </p>
        </div>
        <div className="flex items-center">
          <Button
            onClick={() => (suite.dispatchInputs.length ? setDispatchOpen(true) : void run("", {}))}
            disabled={!githubConnected}
            className={cn(suite.dispatchInputs.length > 0 && "rounded-r-none")}
          >
            <Play /> Run Workflow
          </Button>
          {suite.dispatchInputs.length > 0 && (
            <Button
              onClick={() => setDispatchOpen(true)}
              disabled={!githubConnected}
              aria-label="Run options"
              className="rounded-l-none border-l border-white/20 px-2"
            >
              <ChevronDown />
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`More actions for ${suite.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMove(-1)} disabled={index === 0}>
              <ArrowUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMove(1)} disabled={index === count - 1}>
              <ArrowDown /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} variant="destructive">
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {!githubConnected ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <GitBranch className="size-8 text-neutral-300" aria-hidden />
          <p className="font-medium text-neutral-700">Connect GitHub to see runs</p>
          <p className="max-w-md text-sm text-neutral-500">
            Add a fine-grained <code>GITHUB_TOKEN</code> with Actions read/write access to this repo in the environment
            settings, then refresh.
          </p>
        </div>
      ) : error ? (
        <p className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}{" "}
          <button type="button" className="font-medium underline" onClick={() => setLocalKey((k) => k + 1)}>
            Retry
          </button>
        </p>
      ) : data && data.runs.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-neutral-500">No runs yet. Click Run Workflow to start the first one.</p>
      ) : (
        <RunsTable
          suiteId={suite.id}
          runs={data?.runs ?? null}
          aiEnabled={aiEnabled}
          onRcaLoaded={(runId, summary) =>
            setData((d) => d && { ...d, runs: d.runs.map((r) => (r.id === runId ? { ...r, rcaSummary: summary } : r)) })
          }
        />
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 px-4 py-2 text-sm text-neutral-500">
        <span aria-live="polite">Showing {rangeLabel(page, perPage, total)}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="First page" disabled={empty || page <= 1} onClick={() => setPage(1)}>
            <ChevronsLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={empty || page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={empty || page >= pages} onClick={() => setPage(page + 1)}>
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Last page" disabled={empty || page >= pages} onClick={() => setPage(pages)}>
            <ChevronsRight />
          </Button>
        </div>
      </footer>

      {suite.dispatchInputs.length > 0 && (
        <DispatchDialog open={dispatchOpen} onOpenChange={setDispatchOpen} suite={suite} onRun={run} />
      )}
    </section>
  );
}
