"use client";

import { useEffect, useState } from "react";
import { GitBranch, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { toastResponseError, useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { PageHeader } from "@/components/shell/page-header";
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
import { Skeleton } from "@/components/ui/skeleton";
import { colorStyles } from "@/lib/ci/colors";
import { cn } from "@/lib/utils";
import { SuiteDialog, type SuitePayload } from "./suite-dialog";
import { SuiteSection } from "./suite-section";
import type { Suite } from "./types";

type State = { suites: Suite[]; githubConnected: boolean; aiEnabled: boolean };

export function CiReports() {
  const [state, setState] = useState<State | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; suite: Suite | null }>({ open: false, suite: null });
  const [toDelete, setToDelete] = useState<Suite | null>(null);
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ci/suites")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => !cancelled && setState(json))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const suites = state?.suites ?? [];
  const setSuites = (fn: (list: Suite[]) => Suite[]) => setState((s) => s && { ...s, suites: fn(s.suites) });

  async function saveSuite(payload: SuitePayload): Promise<string | null> {
    const existing = dialog.suite;
    const res = await withPasscode((headers) =>
      fetch(existing ? `/api/ci/suites/${existing.id}` : "/api/ci/suites", {
        method: existing ? "PATCH" : "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    if (!res) return "Cancelled — the admin passcode is needed to change suites.";
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error ?? "Couldn't save the suite.";
    setSuites((list) => (existing ? list.map((s) => (s.id === existing.id ? data.suite : s)) : [...list, data.suite]));
    toast.success(existing ? "Suite updated" : `Added “${data.suite.name}”`);
    return null;
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...suites];
    const [item] = next.splice(index, 1);
    next.splice(index + direction, 0, item);
    const res = await withPasscode((headers) =>
      fetch("/api/ci/suites/reorder", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next.map((s) => s.id) }),
      }),
    );
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't reorder the suites.");
    setSuites(() => next);
  }

  async function confirmDelete() {
    const suite = toDelete;
    setToDelete(null);
    if (!suite) return;
    const res = await withPasscode((headers) => fetch(`/api/ci/suites/${suite.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't delete the suite.");
    setSuites((list) => list.filter((s) => s.id !== suite.id));
    toast.success(`Deleted “${suite.name}”`);
  }

  async function dispatch(suite: Suite, ref: string, inputs: Record<string, string>) {
    const res = await withPasscode((headers) =>
      fetch(`/api/ci/suites/${suite.id}/dispatch`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: ref || undefined, inputs }),
      }),
    );
    if (!res) return false;
    if (!res.ok) {
      await toastResponseError(res, "Couldn't start the workflow.");
      return false;
    }
    const data = await res.json();
    toast.success(`Started ${suite.name} on ${data.ref}. It will appear in the table shortly.`);
    return true;
  }

  function jump(suite: Suite) {
    setActive(suite.id);
    document.getElementById(`suite-${suite.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <PageHeader
        title="CI Reports"
        icon={GitBranch}
        iconClassName="text-neutral-700"
        actions={
          suites.length > 0 && (
            <Button onClick={() => setDialog({ open: true, suite: null })}>
              <Plus /> Add suite
            </Button>
          )
        }
      />

      {failed ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Couldn&apos;t load CI suites. Refresh to try again.</p>
      ) : state === null ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : suites.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <GitBranch className="size-10 text-neutral-300" aria-hidden />
          <p className="text-lg font-medium text-neutral-800">No CI suites yet — add your first one</p>
          <p className="max-w-md text-sm text-neutral-500">
            Point a suite at a GitHub Actions workflow to trigger it from here and see its runs, jobs and results.
          </p>
          <Button onClick={() => setDialog({ open: true, suite: null })}>
            <Plus /> Add suite
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <nav aria-label="Jump to suite" className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-xs">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Jump to</span>
            {suites.map((s) => {
              const style = colorStyles(s.color);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jump(s)}
                  aria-current={active === s.id ? "true" : undefined}
                  className={cn("h-8 rounded-full border px-3 text-sm font-medium transition-colors", active === s.id ? style.chipActive : style.chip)}
                >
                  {s.name}
                </button>
              );
            })}
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setRefreshKey((k) => k + 1)}>
              <RefreshCw /> Refresh
            </Button>
          </nav>

          {suites.map((suite, i) => (
            <SuiteSection
              key={suite.id}
              suite={suite}
              index={i}
              count={suites.length}
              githubConnected={state.githubConnected}
              aiEnabled={state.aiEnabled}
              refreshKey={refreshKey}
              onEdit={() => setDialog({ open: true, suite })}
              onDelete={() => setToDelete(suite)}
              onMove={(d) => move(i, d)}
              onDispatch={(ref, inputs) => dispatch(suite, ref, inputs)}
            />
          ))}
        </div>
      )}

      <SuiteDialog
        open={dialog.open}
        suite={dialog.suite}
        githubConnected={state?.githubConnected ?? false}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSubmit={saveSuite}
      />
      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The suite is removed from this page for everyone. Its workflow and runs on GitHub aren&apos;t affected.
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
    </>
  );
}
