"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Gavel,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Rocket,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { PageHeader } from "@/components/shell/page-header";
import { useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { useYourName, YourNameField } from "@/components/shared/your-name";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { copyText } from "@/lib/browser";
import { isoToLong, todayIso } from "@/lib/dates";
import { formatDateTime, formatRelative } from "@/lib/format";
import {
  DECISION_LABELS,
  GATE_TYPE_LABELS,
  isDecided,
  releaseSummary,
  scoreRelease,
  targetDateText,
  VERDICT_LABELS,
  type AutoResult,
  type DecisionType,
  type GateStatus,
  type GateType,
  type Override,
  type ReleaseStatus,
  type Snapshot,
} from "@/lib/readiness";
import { cn } from "@/lib/utils";
import { ReleaseFormDialog } from "./release-form-dialog";
import { ProgressRing, StatusPill, VerdictText } from "./shared";

type Gate = {
  id: string;
  section: string;
  title: string;
  type: GateType;
  status: GateStatus;
  effective: GateStatus;
  isBlocker: boolean;
  weight: number;
  override: Override | null;
  autoResult: AutoResult | null;
  config: Record<string, number> | null;
  owner: string | null;
  evidenceUrl: string | null;
  note: string | null;
  sortOrder: number;
  updatedBy: string | null;
  updatedAt: string;
};
type Signoff = { id: string; role: string; name: string | null; decision: "PENDING" | "APPROVE" | "REJECT"; comment: string | null; signedAt: string | null };
type Decision = { id: string; decision: DecisionType; comment: string; knownIssues: string[]; snapshot: Snapshot; decidedBy: string | null; createdAt: string };
type Event = { id: string; type: string; detail: Record<string, unknown>; actor: string | null; createdAt: string };
export type ReleaseDetailData = {
  id: string;
  name: string;
  version: string | null;
  targetDate: string | null;
  releasedAt: string | null;
  owner: string | null;
  description: string | null;
  status: ReleaseStatus;
  linkedCiSuiteIds: string[];
  linkedFeaturePageIds: string[];
  linkedRepos: string[];
  linked: { suites: { id: string; name: string }[]; features: { id: string; name: string }[] };
  gates: Gate[];
  signoffs: Signoff[];
  decisions: Decision[];
  events: Event[];
  githubConnected: boolean;
};

const STATUS_OPTIONS: { value: GateStatus; label: string; tone: string }[] = [
  { value: "PENDING", label: "Pending", tone: "data-[on=true]:bg-neutral-600 data-[on=true]:text-white" },
  { value: "PASS", label: "Pass", tone: "data-[on=true]:bg-green-600 data-[on=true]:text-white" },
  { value: "FAIL", label: "Fail", tone: "data-[on=true]:bg-red-600 data-[on=true]:text-white" },
  { value: "NA", label: "N/A", tone: "data-[on=true]:bg-neutral-400 data-[on=true]:text-white" },
];

async function json(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

export function ReleaseDetail({ id }: { id: string }) {
  const [release, setRelease] = useState<ReleaseDetailData | null>(null);
  const [missing, setMissing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [releasedOpen, setReleasedOpen] = useState(false);
  const [overrideGate, setOverrideGate] = useState<{ gate: Gate; status: GateStatus } | null>(null);
  const [editGate, setEditGate] = useState<Gate | "new" | null>(null);
  const { displayName } = useYourName();
  const { withPasscode, passcodeDialog } = useAdminPasscode();
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    fetch(`/api/release-readiness/releases/${id}?refresh=1`)
      .then(async (r) => {
        if (r.status === 404) return alive && setMissing(true);
        const d = await json(r);
        if (alive) setRelease(d.release);
      })
      .catch(() => toast.error("Couldn't load the release."));
    return () => {
      alive = false;
    };
  }, [id]);

  /** Sends a mutation and swaps in the updated release. */
  const mutate = useCallback(
    async (url: string, init: RequestInit & { passcode?: boolean } = {}, success?: string) => {
      try {
        const run = (headers: Record<string, string> = {}) =>
          fetch(url, { ...init, headers: { "Content-Type": "application/json", ...headers, ...(init.headers as Record<string, string>) } });
        const res = init.passcode ? await withPasscode(run) : await run();
        if (!res) return false;
        const d = await json(res);
        if (d.release) setRelease(d.release);
        if (success) toast.success(success);
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong.");
        return false;
      }
    },
    [withPasscode],
  );
  const body = (o: object) => JSON.stringify({ ...o, actor: displayName });

  async function refresh() {
    setRefreshing(true);
    await mutate(`/api/release-readiness/releases/${id}/refresh`, { method: "POST", body: body({}) }, "Checks refreshed");
    setRefreshing(false);
  }

  const score = useMemo(() => (release ? scoreRelease(release.gates) : null), [release]);
  const sections = useMemo(() => {
    const map = new Map<string, Gate[]>();
    for (const g of release?.gates ?? []) map.set(g.section, [...(map.get(g.section) ?? []), g]);
    return [...map.entries()];
  }, [release]);

  if (missing) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-14 text-center text-sm text-neutral-600">
        This release doesn&apos;t exist (it may have been deleted). <Link href="/release-readiness" className="font-medium underline">Back to releases</Link>
      </div>
    );
  }
  if (!release || !score) return <Skeleton className="h-96 w-full" />;

  const latest = release.decisions[0] ?? null;
  const today = todayIso();
  const overdue = release.targetDate && release.targetDate < today && !isDecided(release.status);

  function setGateStatus(g: Gate, status: GateStatus) {
    if (g.type !== "MANUAL" && g.autoResult?.status && !g.override) {
      if (status !== g.autoResult.status) setOverrideGate({ gate: g, status });
      return;
    }
    if (g.override) {
      setOverrideGate({ gate: g, status });
      return;
    }
    mutate(`/api/release-readiness/gates/${g.id}`, { method: "PATCH", body: body({ status }) });
  }

  function move(g: Gate, dir: -1 | 1) {
    const order = release!.gates.map((x) => x.id);
    const i = order.indexOf(g.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    mutate(`/api/release-readiness/releases/${id}/gates`, { method: "PATCH", body: body({ order }) });
  }

  const summary = (format: "markdown" | "slack") =>
    releaseSummary(release, release.gates, release.signoffs, latest ? { decision: latest.decision, knownIssues: latest.knownIssues } : null, format);

  return (
    <div className="release-print flex flex-col gap-6">
      <PageHeader
        title={release.name}
        icon={Rocket}
        iconClassName="text-green-600"
        backHref="/release-readiness"
        backLabel="Release Readiness"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {release.version && <span className="font-medium text-neutral-700">{release.version}</span>}
            <StatusPill status={release.status} />
            {release.targetDate && (
              <span className={cn(overdue && "font-semibold text-red-600")}>
                Target {isoToLong(release.targetDate)} ({targetDateText(release.targetDate, today)})
              </span>
            )}
            {release.releasedAt && <span>Released {isoToLong(release.releasedAt)}</span>}
            {release.owner && <span>QA owner: {release.owner}</span>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Copy className="size-4" aria-hidden /> Copy summary
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => copyText(summary("markdown"), "Summary copied (Markdown)")}>Markdown</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => copyText(summary("slack"), "Summary copied (Slack)")}>Slack</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> Print / PDF
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" aria-hidden /> Edit
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const d = await json(await fetch(`/api/release-readiness/releases/${id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body({}) }));
                  toast.success("Release duplicated");
                  router.push(`/release-readiness/${d.release.id}`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Couldn't duplicate.");
                }
              }}
            >
              Duplicate
            </Button>
            <Button
              variant="outline"
              aria-label="Delete release"
              onClick={async () => {
                const res = await withPasscode((headers) => fetch(`/api/release-readiness/releases/${id}`, { method: "DELETE", headers }));
                if (!res) return;
                if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
                toast.success("Release deleted");
                router.push("/release-readiness");
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        }
      />
      {release.description && <p className="-mt-3 text-sm whitespace-pre-wrap text-neutral-700">{release.description}</p>}

      {/* Score card */}
      <section aria-label="Readiness score" className="rounded-xl border border-t-4 border-neutral-200 border-t-green-500 bg-card p-4 shadow-xs sm:p-5">
        <div className="flex flex-wrap items-center gap-6">
          <ProgressRing score={score.score} verdict={score.verdict} size={96} stroke={9} />
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <p className="text-lg" data-testid="rr-verdict">
              <VerdictText verdict={score.verdict} />
            </p>
            <p className="text-sm text-neutral-600" data-testid="rr-breakdown">
              {score.counts.PASS} passed · {score.counts.FAIL} failed · {score.counts.PENDING} pending · {score.counts.NA} not applicable
            </p>
            <p className="text-xs text-neutral-500">
              Weighted by gate weight; blockers count 3×. Ready ≥ 90% with no failed or pending blockers; at risk 70–89%; not ready below 70% or with a failed blocker.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 print:hidden">
            <Button variant="outline" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden /> Refresh checks
            </Button>
            {!latest && (
              <Button className="bg-green-600 text-white hover:bg-green-700" onClick={() => setDecisionOpen(true)}>
                <Gavel className="size-4" aria-hidden /> Record decision
              </Button>
            )}
          </div>
        </div>
        {score.blockers.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40" role="alert">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800 dark:text-red-200">
              <ShieldAlert className="size-4" aria-hidden /> Blockers
            </p>
            <ul className="mt-1 list-disc pl-6 text-sm text-red-800 dark:text-red-200">
              {score.blockers.map((b) => (
                <li key={b.id}>{b.title}</li>
              ))}
            </ul>
          </div>
        )}
        {(release.linked.suites.length > 0 || release.linked.features.length > 0 || release.linkedRepos.length > 0) && (
          <p className="mt-3 text-xs text-neutral-500">
            Linked: {[...release.linked.suites.map((s) => `CI: ${s.name}`), ...release.linked.features.map((f) => `Bugs: ${f.name}`), ...release.linkedRepos.map((r) => `Repo: ${r}`)].join(" · ")}
          </p>
        )}
      </section>

      {/* Checklist */}
      <section aria-labelledby="rr-checklist" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="rr-checklist" className="text-base font-semibold text-neutral-900">
            Checklist
          </h2>
          <Button size="sm" variant="outline" className="print:hidden" onClick={() => setEditGate("new")}>
            <Plus className="size-4" aria-hidden /> Add gate
          </Button>
        </div>
        {sections.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">No gates yet — add the first one.</p>}
        {sections.map(([name, gates]) => (
          <Collapsible key={name} defaultOpen asChild>
            <section aria-label={`${name} gates`} className="rounded-xl border border-neutral-200 bg-card shadow-xs">
              <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left">
                <h3 className="flex-1 text-sm font-semibold text-neutral-900">
                  {name} <span className="font-normal text-neutral-500">· {gates.filter((g) => g.effective === "PASS").length}/{gates.filter((g) => g.effective !== "NA").length}</span>
                </h3>
                <ChevronDown className="size-4 text-neutral-500 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
                  {gates.map((g) => (
                    <GateRow
                      key={g.id}
                      gate={g}
                      onStatus={(s) => setGateStatus(g, s)}
                      onBlocker={(isBlocker) => mutate(`/api/release-readiness/gates/${g.id}`, { method: "PATCH", body: body({ isBlocker }) })}
                      onEdit={() => setEditGate(g)}
                      onUp={() => move(g, -1)}
                      onDown={() => move(g, 1)}
                      onRefresh={refresh}
                      onClearOverride={() => mutate(`/api/release-readiness/gates/${g.id}`, { method: "PATCH", body: body({ override: null }) }, "Override cleared")}
                      onDelete={() =>
                        mutate(`/api/release-readiness/gates/${g.id}?actor=${encodeURIComponent(displayName)}`, { method: "DELETE", passcode: true }, "Gate deleted")
                      }
                    />
                  ))}
                </ul>
              </CollapsibleContent>
            </section>
          </Collapsible>
        ))}
      </section>

      <Signoffs release={release} mutate={mutate} />

      {/* Decision */}
      <section aria-labelledby="rr-decision" className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="rr-decision" className="flex-1 text-base font-semibold text-neutral-900">
            Decision
          </h2>
          <div className="flex gap-2 print:hidden">
            <Button size="sm" variant={latest ? "outline" : "default"} className={latest ? "" : "bg-green-600 text-white hover:bg-green-700"} onClick={() => setDecisionOpen(true)}>
              <Gavel className="size-4" aria-hidden /> {latest ? "Change decision" : "Record decision"}
            </Button>
            {(release.status === "GO" || release.status === "GO_WITH_ISSUES") && (
              <Button size="sm" variant="outline" onClick={() => setReleasedOpen(true)}>
                <Rocket className="size-4" aria-hidden /> Mark as released
              </Button>
            )}
          </div>
        </div>
        {!latest ? (
          <p className="text-sm text-neutral-500">No decision yet. Recording one freezes a snapshot of the checklist.</p>
        ) : (
          <DecisionCard decision={latest} />
        )}
        {release.decisions.length > 1 && (
          <Collapsible className="mt-3">
            <CollapsibleTrigger className="text-xs font-medium text-neutral-600 hover:underline">Earlier decisions ({release.decisions.length - 1})</CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-3">
              {release.decisions.slice(1).map((d) => (
                <DecisionCard key={d.id} decision={d} compact />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </section>

      <ActivityLog events={release.events} />

      <ReleaseFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit release"
        submitLabel="Save"
        initial={{
          name: release.name,
          version: release.version ?? "",
          targetDate: release.targetDate,
          owner: release.owner ?? "",
          description: release.description ?? "",
          linkedCiSuiteIds: release.linkedCiSuiteIds,
          linkedFeaturePageIds: release.linkedFeaturePageIds,
          linkedRepos: release.linkedRepos,
        }}
        onSubmit={async (v) => {
          const ok = await mutate(
            `/api/release-readiness/releases/${id}`,
            {
              method: "PATCH",
              body: body({
                name: v.name,
                version: v.version || null,
                targetDate: v.targetDate,
                owner: v.owner || null,
                description: v.description || null,
                linkedCiSuiteIds: v.linkedCiSuiteIds,
                linkedFeaturePageIds: v.linkedFeaturePageIds,
                linkedRepos: v.linkedRepos,
              }),
            },
            "Release updated",
          );
          if (ok) await mutate(`/api/release-readiness/releases/${id}/refresh`, { method: "POST", body: body({}) });
          else throw new Error("Couldn't save.");
        }}
      />
      <DecisionDialog
        open={decisionOpen}
        onOpenChange={setDecisionOpen}
        changing={!!latest}
        onSubmit={(d) => mutate(`/api/release-readiness/releases/${id}/decision`, { method: "POST", body: body(d), passcode: !!latest }, "Decision recorded")}
      />
      <ReleasedDialog open={releasedOpen} onOpenChange={setReleasedOpen} onSubmit={(releasedAt) => mutate(`/api/release-readiness/releases/${id}`, { method: "PATCH", body: body({ releasedAt }) }, "Marked as released")} />
      <OverrideDialog
        target={overrideGate}
        onClose={() => setOverrideGate(null)}
        onSubmit={(gate, status, note) =>
          gate.type === "MANUAL"
            ? mutate(`/api/release-readiness/gates/${gate.id}`, { method: "PATCH", body: body({ status, override: null }) })
            : mutate(`/api/release-readiness/gates/${gate.id}`, { method: "PATCH", body: body({ override: { status, note } }) }, "Override saved")
        }
      />
      <GateDialog
        target={editGate}
        sections={sections.map(([n]) => n)}
        onClose={() => setEditGate(null)}
        onSubmit={(values) =>
          editGate === "new"
            ? mutate(`/api/release-readiness/releases/${id}/gates`, { method: "POST", body: body(values) }, "Gate added")
            : mutate(`/api/release-readiness/gates/${(editGate as Gate).id}`, { method: "PATCH", body: body(values) }, "Gate updated")
        }
      />
      {passcodeDialog}
    </div>
  );
}

function GateRow({
  gate: g,
  onStatus,
  onBlocker,
  onEdit,
  onUp,
  onDown,
  onRefresh,
  onClearOverride,
  onDelete,
}: {
  gate: Gate;
  onStatus: (s: GateStatus) => void;
  onBlocker: (b: boolean) => void;
  onEdit: () => void;
  onUp: () => void;
  onDown: () => void;
  onRefresh: () => void;
  onClearOverride: () => void;
  onDelete: () => void;
}) {
  const auto = g.type !== "MANUAL";
  const failedBlocker = g.isBlocker && g.effective === "FAIL";
  return (
    <li className={cn("flex flex-col gap-2 px-4 py-3", failedBlocker && "bg-red-50/60 dark:bg-red-950/20")} data-testid="gate-row" data-gate={g.title}>
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label={`Status of ${g.title}`} className="inline-flex overflow-hidden rounded-lg border border-neutral-300 text-xs font-medium">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={g.effective === o.value}
              data-on={g.effective === o.value}
              onClick={() => g.effective !== o.value && onStatus(o.value)}
              className={cn("px-2.5 py-1 text-neutral-600 hover:bg-neutral-100 print:hidden", o.tone, "data-[on=true]:hover:opacity-90")}
            >
              {o.label}
            </button>
          ))}
          <span className="hidden px-2.5 py-1 print:inline">{STATUS_OPTIONS.find((o) => o.value === g.effective)?.label}</span>
        </div>
        <p className="min-w-0 flex-1 text-sm font-medium text-neutral-900">
          {g.title}
          {auto && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
              <Bot className="size-3" aria-hidden /> Auto
            </span>
          )}
          {g.isBlocker && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-200">Blocker</span>}
        </p>
        <div className="flex items-center gap-1 print:hidden">
          <Label htmlFor={`blk-${g.id}`} className="text-xs text-neutral-500">
            Blocker
          </Label>
          <Switch id={`blk-${g.id}`} checked={g.isBlocker} onCheckedChange={onBlocker} aria-label={`Blocker: ${g.title}`} />
          {auto && (
            <Button size="icon" variant="ghost" className="size-7" aria-label="Refresh checks" onClick={onRefresh}>
              <RefreshCw className="size-3.5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${g.title}`} onClick={onEdit}>
            <Pencil className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${g.title} up`} onClick={onUp}>
            <ArrowUp className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${g.title} down`} onClick={onDown}>
            <ArrowDown className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" aria-label={`Delete ${g.title}`} onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1 text-xs text-neutral-500">
        {auto && g.autoResult && !g.override && (
          <span className={cn(g.autoResult.status === null && "text-amber-700 dark:text-amber-300")}>
            {GATE_TYPE_LABELS[g.type]}: {g.autoResult.detail}
            {g.autoResult.status === null && " (set it manually)"}
          </span>
        )}
        {g.override && (
          <span className="text-violet-700 dark:text-violet-300">
            Overridden by {g.override.by}: {g.override.note}{" "}
            <button type="button" className="underline print:hidden" onClick={onClearOverride}>
              Clear override
            </button>
          </span>
        )}
        {g.owner && <span>Owner: {g.owner}</span>}
        {g.evidenceUrl && (
          <a href={g.evidenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">
            Evidence <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {g.note && <span>Note: {g.note}</span>}
        {g.updatedBy && (
          <span>
            Updated by {g.updatedBy} {formatRelative(g.updatedAt)}
          </span>
        )}
      </div>
    </li>
  );
}

function Signoffs({ release, mutate }: { release: ReleaseDetailData; mutate: (url: string, init?: RequestInit & { passcode?: boolean }, success?: string) => Promise<boolean> }) {
  const [signing, setSigning] = useState<Signoff | null>(null);
  const [role, setRole] = useState("");
  const { displayName, name: yourName } = useYourName();
  return (
    <section aria-labelledby="rr-signoffs" className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs sm:p-5">
      <h2 id="rr-signoffs" className="mb-3 text-base font-semibold text-neutral-900">
        Sign-offs
      </h2>
      <ul className="flex flex-col divide-y divide-neutral-200" aria-label="Sign-offs">
        {release.signoffs.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
            {s.decision === "APPROVE" ? <CheckCircle2 className="size-4 text-green-600" aria-label="Approved" /> : s.decision === "REJECT" ? <XCircle className="size-4 text-red-600" aria-label="Rejected" /> : <span className="size-4 rounded-full border-2 border-neutral-300" aria-label="Pending" />}
            <span className="w-28 text-sm font-semibold text-neutral-900">{s.role}</span>
            <span className="min-w-0 flex-1 text-sm text-neutral-600">
              {s.decision === "PENDING" ? "Pending" : `${s.decision === "APPROVE" ? "Approved" : "Rejected"} by ${s.name}`}
              {s.comment && ` — “${s.comment}”`}
              {s.signedAt && <span className="text-xs text-neutral-500"> · {formatDateTime(s.signedAt)}</span>}
            </span>
            <div className="flex gap-1 print:hidden">
              <Button size="sm" variant="outline" onClick={() => setSigning(s)}>
                Sign
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={`Remove ${s.role}`}
                onClick={() => mutate(`/api/release-readiness/releases/${release.id}/signoffs?signoffId=${s.id}&actor=${encodeURIComponent(displayName)}`, { method: "DELETE", passcode: true }, "Role removed")}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2 print:hidden"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!role.trim()) return;
          if (await mutate(`/api/release-readiness/releases/${release.id}/signoffs`, { method: "POST", body: JSON.stringify({ action: "add", role, actor: displayName }) }, "Role added")) setRole("");
        }}
      >
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Add a role, e.g. Security" aria-label="New sign-off role" className="max-w-xs" maxLength={100} />
        <Button type="submit" variant="outline" disabled={!role.trim()}>
          <Plus className="size-4" aria-hidden /> Add role
        </Button>
      </form>
      <SignDialog
        signoff={signing}
        defaultName={yourName}
        onClose={() => setSigning(null)}
        onSubmit={(v) => mutate(`/api/release-readiness/releases/${release.id}/signoffs`, { method: "POST", body: JSON.stringify({ action: "sign", id: signing!.id, ...v }) }, "Signed")}
      />
    </section>
  );
}

function SignDialog({ signoff, defaultName, onClose, onSubmit }: { signoff: Signoff | null; defaultName: string; onClose: () => void; onSubmit: (v: { name: string; decision: string; comment?: string }) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [decision, setDecision] = useState("APPROVE");
  const [comment, setComment] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  if ((signoff?.id ?? null) !== shown) {
    setShown(signoff?.id ?? null);
    setName(signoff?.name || defaultName);
    setDecision(signoff?.decision === "REJECT" ? "REJECT" : "APPROVE");
    setComment(signoff?.comment ?? "");
  }
  return (
    <Dialog open={!!signoff} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return toast.error("Enter your name to sign.");
            if (await onSubmit({ name, decision, comment: comment || undefined })) onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Sign off as {signoff?.role}</DialogTitle>
            <DialogDescription>Your name is shown with the sign-off.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="so-name">Your name</Label>
            <Input id="so-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="Sign-off decision">
            {[
              ["APPROVE", "Approve"],
              ["REJECT", "Reject"],
              ["PENDING", "Reset to pending"],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={decision === v}
                onClick={() => setDecision(v)}
                className={cn("rounded-full border px-3 py-1 text-sm", decision === v ? "border-green-600 bg-green-600 text-white" : "border-neutral-300 text-neutral-700")}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="so-comment">Comment (optional)</Label>
            <Textarea id="so-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save sign-off</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DecisionCard({ decision: d, compact }: { decision: Decision; compact?: boolean }) {
  const tone = d.decision === "NO_GO" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30";
  return (
    <div className={cn("rounded-lg border p-3", tone)} data-testid="decision-card">
      <p className="text-sm font-semibold text-neutral-900">
        {DECISION_LABELS[d.decision]} <span className="font-normal text-neutral-600">· by {d.decidedBy} · {formatDateTime(d.createdAt)}</span>
      </p>
      <p className="mt-1 text-sm whitespace-pre-wrap text-neutral-800">{d.comment}</p>
      {d.knownIssues.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-neutral-700">Known issues</p>
          <ul className="list-disc pl-5 text-sm text-neutral-800">
            {d.knownIssues.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </div>
      )}
      {!compact && (
        <Collapsible className="mt-2">
          <CollapsibleTrigger className="text-xs font-medium text-neutral-700 underline">
            Snapshot at decision: {d.snapshot.score}% ({VERDICT_LABELS[d.snapshot.verdict]}) · {d.snapshot.counts.PASS} passed, {d.snapshot.counts.FAIL} failed
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 flex flex-col gap-0.5 text-xs text-neutral-700">
              {d.snapshot.gates.map((g, i) => (
                <li key={i}>
                  [{g.status}] {g.section} — {g.title}
                  {g.isBlocker && " (blocker)"}
                  {g.detail && <span className="text-neutral-500"> · {g.detail}</span>}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function DecisionDialog({ open, onOpenChange, changing, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; changing: boolean; onSubmit: (d: { decision: DecisionType; comment: string; knownIssues: string[] }) => Promise<boolean> }) {
  const [decision, setDecision] = useState<DecisionType>("GO");
  const [comment, setComment] = useState("");
  const [issues, setIssues] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setComment("");
      setIssues("");
      setSubmitted(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitted(true);
            if (!comment.trim()) return;
            const knownIssues = issues.split("\n").map((s) => s.trim()).filter(Boolean);
            if (await onSubmit({ decision, comment, knownIssues })) onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{changing ? "Change decision" : "Record decision"}</DialogTitle>
            <DialogDescription>
              {changing ? "Changing a recorded decision needs the admin passcode and is logged. " : ""}A snapshot of the checklist is saved with the decision.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Decision">
            {(["GO", "GO_WITH_ISSUES", "NO_GO"] as DecisionType[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={decision === d}
                onClick={() => setDecision(d)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium",
                  decision === d ? (d === "NO_GO" ? "border-red-600 bg-red-600 text-white" : "border-green-600 bg-green-600 text-white") : "border-neutral-300 text-neutral-700",
                )}
              >
                {DECISION_LABELS[d]}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dec-comment">
              Comment <span className="text-red-500">*</span>
            </Label>
            <Textarea id="dec-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={5000} aria-invalid={submitted && !comment.trim()} />
            {submitted && !comment.trim() && <p className="text-xs text-red-600">A comment is required</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dec-issues">Known issues (one per line)</Label>
            <Textarea id="dec-issues" value={issues} onChange={(e) => setIssues(e.target.value)} placeholder="Safari layout glitch on the payment page" />
          </div>
          <YourNameField id="dec-your-name" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-green-600 text-white hover:bg-green-700">
              Record decision
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReleasedDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: string) => Promise<boolean> }) {
  const [date, setDate] = useState(todayIso());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as released</DialogTitle>
          <DialogDescription>Record the actual release date.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rel-date">Release date</Label>
          <DatePicker id="rel-date" value={date} onChange={setDate} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={async () => (await onSubmit(date)) && onOpenChange(false)}>Mark as released</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverrideDialog({ target, onClose, onSubmit }: { target: { gate: Gate; status: GateStatus } | null; onClose: () => void; onSubmit: (g: Gate, s: GateStatus, note: string) => Promise<boolean> }) {
  const [note, setNote] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const key = target ? `${target.gate.id}-${target.status}` : null;
  if (key !== shown) {
    setShown(key);
    setNote("");
  }
  if (!target) return null;
  const { gate, status } = target;
  const label = STATUS_OPTIONS.find((o) => o.value === status)?.label;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!note.trim()) return toast.error("Add a note explaining the override.");
            if (await onSubmit(gate, status, note)) onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Override “{gate.title}”</DialogTitle>
            <DialogDescription>
              The automatic check says {gate.override ? gate.override.status : gate.autoResult?.status}. Set it to {label} with a note — it&apos;s shown as “Overridden by &lt;your name&gt;”.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ov-note">Note</Label>
            <Textarea id="ov-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Why the automatic result doesn't apply" />
          </div>
          <YourNameField id="ov-your-name" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Override</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type GateValues = { section: string; title: string; type: GateType; isBlocker: boolean; weight: number; owner: string | null; evidenceUrl: string | null; note: string | null; config?: Record<string, number> };

function GateDialog({ target, sections, onClose, onSubmit }: { target: Gate | "new" | null; sections: string[]; onClose: () => void; onSubmit: (v: Partial<GateValues>) => Promise<boolean> }) {
  const isNew = target === "new";
  const [v, setV] = useState<GateValues>({ section: "", title: "", type: "MANUAL", isBlocker: false, weight: 1, owner: null, evidenceUrl: null, note: null });
  const [shown, setShown] = useState<string | null>(null);
  const key = target === null ? null : isNew ? "new" : target.id;
  if (key !== shown) {
    setShown(key);
    if (target && target !== "new") {
      setV({ section: target.section, title: target.title, type: target.type, isBlocker: target.isBlocker, weight: target.weight, owner: target.owner, evidenceUrl: target.evidenceUrl, note: target.note, config: target.config ?? undefined });
    } else setV({ section: sections[0] ?? "Testing", title: "", type: "MANUAL", isBlocker: false, weight: 1, owner: null, evidenceUrl: null, note: null });
  }
  const set = <K extends keyof GateValues>(k: K, value: GateValues[K]) => setV((x) => ({ ...x, [k]: value }));
  const cfgField = v.type === "NO_P1" ? ["maxAllowed", "Max open P1 allowed"] : v.type === "VALID_RATE" ? ["threshold", "Threshold (%)"] : v.type === "NO_P0_FLAGS" ? ["days", "Look back (days)"] : null;
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!v.title.trim() || !v.section.trim()) return toast.error("Title and section are required.");
            const payload: Partial<GateValues> = isNew
              ? { section: v.section, title: v.title, type: v.type, isBlocker: v.isBlocker, weight: v.weight, ...(v.config ? { config: v.config } : {}) }
              : { section: v.section, title: v.title, isBlocker: v.isBlocker, weight: v.weight, owner: v.owner || null, evidenceUrl: v.evidenceUrl || null, note: v.note || null, ...(v.config ? { config: v.config } : {}) };
            if (await onSubmit(payload)) onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>{isNew ? "Add gate" : "Edit gate"}</DialogTitle>
            <DialogDescription>Changes apply to this release only — the template stays as it is.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-title">Title</Label>
            <Input id="g-title" value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={300} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-section">Section</Label>
              <Input id="g-section" list="g-sections" value={v.section} onChange={(e) => set("section", e.target.value)} maxLength={100} />
              <datalist id="g-sections">
                {sections.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-type">Type</Label>
              <Select value={v.type} onValueChange={(t) => set("type", t as GateType)} disabled={!isNew}>
                <SelectTrigger id="g-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {(Object.keys(GATE_TYPE_LABELS) as GateType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === "MANUAL" ? "Manual" : `Auto: ${GATE_TYPE_LABELS[t]}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-2 pt-6">
              <Switch id="g-blocker" checked={v.isBlocker} onCheckedChange={(c) => set("isBlocker", c)} />
              <Label htmlFor="g-blocker">Blocker</Label>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-weight">Weight</Label>
              <Input id="g-weight" type="number" min={0} max={10} value={v.weight} onChange={(e) => set("weight", Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
            </div>
            {cfgField && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="g-config">{cfgField[1]}</Label>
                <Input id="g-config" type="number" min={0} value={v.config?.[cfgField[0]] ?? ""} onChange={(e) => set("config", { ...(v.config ?? {}), [cfgField[0]]: Number(e.target.value) || 0 })} />
              </div>
            )}
          </div>
          {!isNew && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="g-owner">Owner</Label>
                <Input id="g-owner" value={v.owner ?? ""} onChange={(e) => set("owner", e.target.value)} maxLength={100} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="g-evidence">Evidence link</Label>
                <Input id="g-evidence" value={v.evidenceUrl ?? ""} onChange={(e) => set("evidenceUrl", e.target.value)} placeholder="https://… (CI run, test report, ticket)" maxLength={2000} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="g-note">Note</Label>
                <Textarea id="g-note" value={v.note ?? ""} onChange={(e) => set("note", e.target.value)} maxLength={2000} />
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{isNew ? "Add gate" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const EVENT_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  CREATED: (d) => (d.duplicatedFrom ? `created this release (copy of ${d.duplicatedFrom})` : "created this release"),
  EDITED: (d) => `edited ${(d.fields as string[]).join(", ")}`,
  STATUS_CHANGED: (d) => `changed status from ${d.from} to ${d.to}`,
  GATE_STATUS: (d) => `set “${d.gate}” from ${d.from} to ${d.to}`,
  GATE_OVERRIDE: (d) => `overrode “${d.gate}” to ${d.to}: ${d.note}`,
  GATE_OVERRIDE_CLEARED: (d) => `cleared the override on “${d.gate}”`,
  GATE_EDITED: (d) => `edited “${d.gate}” (${(d.fields as string[]).join(", ")})`,
  GATE_ADDED: (d) => `added “${d.gate}” to ${d.section}`,
  GATE_DELETED: (d) => `deleted “${d.gate}”`,
  GATES_REORDERED: () => "reordered gates",
  AUTO_CHECK: (d) => `“${d.gate}” checked: ${d.to ?? "can't check"} — ${d.detail}`,
  SIGNOFF: (d) => `signed off as ${d.role}: ${String(d.decision).toLowerCase()}${d.comment ? ` — “${d.comment}”` : ""}`,
  SIGNOFF_ROLE_ADDED: (d) => `added sign-off role ${d.role}`,
  SIGNOFF_ROLE_REMOVED: (d) => `removed sign-off role ${d.role}`,
  DECISION: (d) => `recorded decision ${DECISION_LABELS[d.decision as DecisionType]} (score ${d.score}%)`,
  DECISION_CHANGED: (d) => `changed decision from ${DECISION_LABELS[d.from as DecisionType]} to ${DECISION_LABELS[d.decision as DecisionType]} (score ${d.score}%)`,
  RELEASED: (d) => `marked as released on ${d.releasedAt}`,
};

function ActivityLog({ events }: { events: Event[] }) {
  return (
    <section aria-labelledby="rr-activity" className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs sm:p-5 print:hidden">
      <h2 id="rr-activity" className="mb-3 text-base font-semibold text-neutral-900">
        Activity
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">No activity yet.</p>
      ) : (
        <ol className="flex flex-col gap-2 border-l border-neutral-200 pl-4" aria-label="Activity">
          {events.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-neutral-300" aria-hidden />
              <span className="font-medium text-neutral-900">{e.actor ?? "Someone"}</span> <span className="text-neutral-700">{(EVENT_TEXT[e.type] ?? (() => e.type.toLowerCase()))(e.detail)}</span>
              <span className="ml-2 text-xs text-neutral-500" title={formatDateTime(e.createdAt)}>
                {formatRelative(e.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
