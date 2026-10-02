"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalyticsSection } from "./analytics-section";
import { HistorySection } from "./history-section";
import { LogEntryForm } from "./log-entry-form";
import { ManageResourcesDialog } from "./manage-resources-dialog";
import type { Resource } from "./status";

export function QaTracker() {
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [resourcesKey, setResourcesKey] = useState(0);
  const [dataKey, setDataKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/qa-tracker/resources")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { resources: Resource[] }) => {
        if (cancelled) return;
        setResources(data.resources);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [resourcesKey]);

  const active = resources ?? [];
  // Fall back to the first tab if the selected person was deactivated or removed.
  const tabId = selectedId && active.some((r) => r.id === selectedId) ? selectedId : (active[0]?.id ?? null);

  return (
    <section
      aria-labelledby="qa-tracker-card-title"
      className="overflow-hidden rounded-xl border border-t-4 border-neutral-200 border-t-green-600 bg-white shadow-xs"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-green-100 bg-green-50 px-4 py-3">
        <ClipboardList className="size-4 text-green-700" aria-hidden />
        <h2 id="qa-tracker-card-title" className="flex-1 text-base font-semibold text-neutral-900">
          QA Tracker
        </h2>
        <Button variant="outline" size="sm" onClick={() => setManageOpen(true)} className="bg-white">
          <Users /> Manage resources
        </Button>
      </header>

      <div className="flex flex-col gap-8 p-4 sm:p-5">
        {failed ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Couldn&apos;t load the team.</p>
        ) : resources === null ? (
          <Skeleton className="h-40" />
        ) : (
          <LogEntryForm
            resources={active}
            onManageResources={() => setManageOpen(true)}
            onLogged={(id) => {
              setSelectedId(id);
              setDataKey((k) => k + 1);
            }}
          />
        )}

        <AnalyticsSection refreshKey={dataKey} />

        {resources !== null && (
          <HistorySection
            resources={active}
            selectedId={tabId}
            onSelect={setSelectedId}
            refreshKey={dataKey}
            onChanged={() => setDataKey((k) => k + 1)}
          />
        )}
      </div>

      <ManageResourcesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        onChanged={() => {
          setResourcesKey((k) => k + 1);
          setDataKey((k) => k + 1);
        }}
      />
    </section>
  );
}
