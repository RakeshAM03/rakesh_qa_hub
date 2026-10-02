"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, CheckCircle2, CirclePlus, Pencil, RefreshCw, Trash2, XCircle, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ISSUE_STATUS_LABELS, type IssueStatus } from "@/lib/bug-tracker/schema";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { BugTrackerTopBar } from "./top-bar";

type Event = {
  id: string;
  type: "CREATED" | "UPDATED" | "STATUS_CHANGED" | "MARKED_VALID" | "MARKED_INVALID" | "DELETED";
  field: string | null;
  fromValue: string | null;
  toValue: string | null;
  actor: string | null;
  issueId: string | null;
  issueTitle: string;
  createdAt: string;
  featurePage: { id: string; name: string };
};

const ICONS: Record<Event["type"], { icon: LucideIcon; className: string }> = {
  CREATED: { icon: CirclePlus, className: "bg-blue-50 text-blue-600" },
  UPDATED: { icon: Pencil, className: "bg-neutral-100 text-neutral-600" },
  STATUS_CHANGED: { icon: RefreshCw, className: "bg-violet-50 text-violet-600" },
  MARKED_VALID: { icon: CheckCircle2, className: "bg-green-50 text-green-600" },
  MARKED_INVALID: { icon: XCircle, className: "bg-rose-50 text-rose-600" },
  DELETED: { icon: Trash2, className: "bg-red-50 text-red-600" },
};

const statusLabel = (v: string | null) => (v ? (ISSUE_STATUS_LABELS[v as IssueStatus] ?? v) : "—");

function describe(e: Event) {
  switch (e.type) {
    case "CREATED":
      return "reported";
    case "STATUS_CHANGED":
      return (
        <>
          changed status from <strong>{statusLabel(e.fromValue)}</strong> to <strong>{statusLabel(e.toValue)}</strong> on
        </>
      );
    case "MARKED_VALID":
      return "marked as valid";
    case "MARKED_INVALID":
      return "marked as invalid";
    case "DELETED":
      return "deleted";
    case "UPDATED":
      if (e.field === "assignee") return e.toValue ? <>assigned <strong>{e.toValue}</strong> to</> : "unassigned";
      if (e.field === "severity") return <>changed severity from <strong>{e.fromValue}</strong> to <strong>{e.toValue}</strong> on</>;
      return `edited the ${e.field ?? "details"} of`;
  }
}

export function ActivityFeed() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bug-tracker/activity")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events);
        setCursor(data.nextCursor);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const data = await (await fetch(`/api/bug-tracker/activity?before=${cursor}`)).json();
      setEvents((list) => [...(list ?? []), ...data.events]);
      setCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  // Group by calendar day (local time).
  const groups: { day: string; events: Event[] }[] = [];
  for (const e of events ?? []) {
    const day = formatDate(e.createdAt);
    if (groups.at(-1)?.day === day) groups.at(-1)!.events.push(e);
    else groups.push({ day, events: [e] });
  }

  return (
    <>
      <BugTrackerTopBar backHref="/bug-tracker" backLabel="Bug Tracker" />
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
        <Activity className="size-6 text-neutral-500" aria-hidden /> Activity
      </h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">Issue changes across all features, newest first.</p>

      {failed ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Couldn&apos;t load activity.</p>
      ) : events === null ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-card px-6 py-16 text-center text-neutral-600">
          No activity yet. Changes to issues will show up here.{" "}
          <Link href="/bug-tracker" className="font-medium underline">
            Go to the dashboard
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.day} aria-label={g.day}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{g.day}</h2>
              <ol className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-card">
                {g.events.map((e) => {
                  const { icon: Icon, className } = ICONS[e.type];
                  return (
                    <li key={e.id} data-testid="activity-event" className="flex items-start gap-3 px-4 py-3 text-sm">
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${className}`}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-neutral-700">
                          <span className="font-medium text-neutral-900">{e.actor || "Someone"}</span> {describe(e)}{" "}
                          {e.issueId && e.type !== "DELETED" ? (
                            <Link href={`/bug-tracker/${e.featurePage.id}?issue=${e.issueId}`} className="font-medium text-neutral-900 hover:underline">
                              “{e.issueTitle}”
                            </Link>
                          ) : (
                            <span className="font-medium text-neutral-900">“{e.issueTitle}”</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          in{" "}
                          <Link href={`/bug-tracker/${e.featurePage.id}`} className="hover:underline">
                            {e.featurePage.name}
                          </Link>
                        </p>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <time dateTime={e.createdAt} tabIndex={0} className="shrink-0 text-xs text-neutral-500">
                            {formatRelative(e.createdAt)}
                          </time>
                        </TooltipTrigger>
                        <TooltipContent>{formatDateTime(e.createdAt)}</TooltipContent>
                      </Tooltip>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {cursor && (
            <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="self-center">
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
