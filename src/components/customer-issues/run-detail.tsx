"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, ClipboardCopy, FileSignature, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { toastResponseError, useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { useYourName } from "@/components/shared/your-name";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RUN_RESULT_LABELS, RUN_STATUS_LABELS } from "@/config/customer-issues";
import { copyText } from "@/lib/browser";
import { casesWorkbook, downloadBytes } from "@/lib/customer-issues/excel";
import { bugFromFailedCase, runCounts, runReportMarkdown, type RunResult } from "@/lib/customer-issues/runs";
import type { RunDto } from "@/lib/customer-issues/server";
import { formatDateTime } from "@/lib/format";
import { sendHandoff } from "@/lib/handoff";
import { cn } from "@/lib/utils";

import { CiHeader } from "./ci-header";
import { STATUS_TONE, useReleases } from "./runs-page";
import { useLists } from "./use-lists";

const RESULTS: RunResult[] = ["PASS", "FAIL", "BLOCKED", "NA"];
const RESULT_TONE: Record<RunResult, string> = {
  PENDING: "",
  PASS: "border-green-700 bg-green-700 text-green-50",
  FAIL: "border-red-700 bg-red-700 text-red-50",
  BLOCKED: "border-amber-700 bg-amber-700 text-amber-50",
  NA: "border-neutral-700 bg-neutral-700 text-neutral-50",
};
const NONE = "__none";
type Result = RunDto["results"][number];

export function RunDetail({ runId }: { runId: string }) {
  const router = useRouter();
  const { lists } = useLists();
  const releases = useReleases();
  const { name: me } = useYourName();
  const [run, setRun] = useState<RunDto | null>(null);
  const [missing, setMissing] = useState(false);
  const [naFor, setNaFor] = useState<Result | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/customer-issues/runs/${runId}`, { cache: "no-store", signal: controller.signal })
      .then((r) => {
        if (r.status === 404) {
          setMissing(true);
          return null;
        }
        return r.ok ? r.json() : Promise.reject(r);
      })
      .then((j) => j && setRun(j.run))
      .catch(() => undefined);
    return () => controller.abort();
  }, [runId]);

  if (missing)
    return (
      <>
        <CiHeader title="Release run" backHref="/customer-issues/runs" backLabel="Release runs" />
        <p className="text-sm text-neutral-700">This run doesn&apos;t exist (it may have been deleted).</p>
      </>
    );
  if (!run || !lists)
    return (
      <>
        <CiHeader title="Release run" backHref="/customer-issues/runs" backLabel="Release runs" />
        <Skeleton className="h-72 w-full" />
      </>
    );

  const counts = runCounts(run.results);
  const products = run.productIds.map((p) => lists.name(p) ?? "?");

  async function setResult(r: Result, body: Record<string, unknown>) {
    const res = await fetch(`/api/customer-issues/runs/${run!.id}/results/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ executedBy: me || null, ...body }) });
    if (!res.ok) return toastResponseError(res, "Couldn't save the result.");
    const d = await res.json();
    const before = run!.status;
    setRun(d.run);
    if (d.run.status !== before) toast.info(`Run is now ${RUN_STATUS_LABELS[d.run.status as keyof typeof RUN_STATUS_LABELS]}`);
  }

  async function patchRun(body: Record<string, unknown>) {
    const res = await fetch(`/api/customer-issues/runs/${run!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return toastResponseError(res, "Couldn't save the run.");
    setRun((await res.json()).run);
    toast.success("Saved");
  }

  async function remove() {
    const res = await withPasscode((headers) => fetch(`/api/customer-issues/runs/${run!.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't delete the run.");
    toast.success("Run deleted");
    router.push("/customer-issues/runs");
  }

  async function exportExcel() {
    const bytes = await casesWorkbook(
      "Run report",
      run!.results.map((r) => ({ ...r.snapshot })),
      [
        { header: "Result", width: 12, value: (i) => RUN_RESULT_LABELS[run!.results[i].result] },
        { header: "N/A reason", width: 24, value: (i) => run!.results[i].reason ?? "" },
        { header: "Notes", width: 30, value: (i) => run!.results[i].notes ?? "" },
        { header: "Evidence", width: 30, value: (i) => run!.results[i].evidenceUrl ?? "" },
        { header: "Executed by", width: 16, value: (i) => run!.results[i].executedBy ?? "" },
        { header: "Executed at", width: 18, value: (i) => (run!.results[i].executedAt ? formatDateTime(run!.results[i].executedAt!) : "") },
      ],
    );
    downloadBytes(`Regression_Run_${run!.name.replace(/[^\w.-]+/g, "_")}.xlsx`, bytes);
  }

  const report = () => runReportMarkdown({ name: run.name, status: run.status, environment: run.environment, build: run.build, products }, run.results.map((r) => ({ ...r, snapshot: r.snapshot })));

  return (
    <>
      <CiHeader
        title={run.name}
        subtitle={[products.length ? `Products: ${products.join(", ")}` : "All products", run.environment && `Environment: ${run.environment}`, run.build && `Build: ${run.build}`].filter(Boolean).join(" · ")}
        backHref="/customer-issues/runs"
        backLabel="Release runs"
        actions={
          <>
            <Button variant="outline" onClick={() => copyText(report(), "Run report copied — paste it into Slack or email")}>
              <ClipboardCopy aria-hidden /> Copy report
            </Button>
            <Button variant="outline" onClick={exportExcel}>
              <FileSpreadsheet aria-hidden /> Export Excel
            </Button>
            <Button variant="outline" onClick={remove} aria-label="Delete run">
              <Trash2 aria-hidden />
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-card p-4">
        <Badge className={cn("text-sm font-semibold", STATUS_TONE[run.status])} data-testid="run-status">
          {RUN_STATUS_LABELS[run.status]}
        </Badge>
        <span className="text-sm text-neutral-800 tabular-nums" data-testid="run-progress">
          {counts.executed}/{counts.total} executed · {counts.pass} passed · {counts.fail} failed · {counts.blocked} blocked · {counts.na} N/A
        </span>
        <div className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-neutral-200" aria-hidden>
          <div className="h-full bg-green-600" style={{ width: `${(counts.pass / Math.max(1, counts.total)) * 100}%` }} />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="run-release-link" className="text-sm">
            Release
          </Label>
          <Select value={run.releaseId ?? NONE} onValueChange={(v) => void patchRun({ releaseId: v === NONE ? null : v })}>
            <SelectTrigger id="run-release-link" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={NONE}>Not linked</SelectItem>
              {releases.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                  {r.version ? ` ${r.version}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {run.release && (
            <Link href={`/release-readiness/${run.release.id}`} className="text-sm text-rose-800 underline underline-offset-2">
              Open
            </Link>
          )}
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-card" aria-label="Run cases">
        {run.results.map((r) => {
          const s = r.snapshot;
          const expanded = open.has(r.id);
          return (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3" data-testid="run-case">
              <div className="flex flex-wrap items-start gap-3">
                <button
                  type="button"
                  onClick={() => setOpen((o) => new Set(o.has(r.id) ? [...o].filter((x) => x !== r.id) : [...o, r.id]))}
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-neutral-500 transition-transform", expanded && "rotate-180")} aria-hidden />
                  <span className="min-w-0">
                    <span className="font-mono text-xs font-semibold text-rose-800">{s.caseId}</span> <span className="text-sm text-neutral-900">{s.title}</span>
                    <span className="block text-xs text-neutral-600">
                      {s.issueKey} · {s.product ?? "No product"}
                      {s.module ? ` · ${s.module}` : ""} · {s.priority}
                    </span>
                  </span>
                </button>
                <div role="group" aria-label={`Result for ${s.caseId}`} className="flex gap-1">
                  {RESULTS.map((res) => (
                    <button
                      key={res}
                      type="button"
                      aria-pressed={r.result === res}
                      onClick={() => (res === "NA" ? setNaFor(r) : void setResult(r, { result: r.result === res ? "PENDING" : res }))}
                      className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", r.result === res ? RESULT_TONE[res] : "border-neutral-300 text-neutral-700 hover:bg-neutral-100")}
                    >
                      {RUN_RESULT_LABELS[res]}
                    </button>
                  ))}
                </div>
              </div>
              {r.result === "NA" && r.reason && <p className="ml-6 text-xs text-neutral-700">N/A reason: {r.reason}</p>}
              {r.executedAt && (
                <p className="ml-6 text-xs text-neutral-600">
                  {RUN_RESULT_LABELS[r.result]} by {r.executedBy || "Anonymous"} · {formatDateTime(r.executedAt)}
                </p>
              )}
              {r.result === "FAIL" && (
                <div className="ml-6">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      sendHandoff("bug-formatter", { bug: bugFromFailedCase(s, r.notes, run.name), source: `Customer Issue RCA run "${run.name}"` });
                      router.push("/bug-formatter");
                    }}
                  >
                    <FileSignature aria-hidden /> Send to Bug Formatter
                  </Button>
                </div>
              )}
              {expanded && (
                <div className="ml-6 grid gap-3 text-sm lg:grid-cols-2">
                  <div>
                    <p className="font-medium text-neutral-900">Preconditions</p>
                    <p className="whitespace-pre-wrap text-neutral-700">{s.preconditions || "—"}</p>
                    <p className="mt-2 font-medium text-neutral-900">Steps</p>
                    <ol className="list-decimal pl-5 text-neutral-700">
                      {s.steps.map((st, i) => (
                        <li key={i}>{st}</li>
                      ))}
                    </ol>
                    <p className="mt-2 font-medium text-neutral-900">Test data</p>
                    <p className="whitespace-pre-wrap text-neutral-700">{s.testData || "—"}</p>
                    <p className="mt-2 font-medium text-neutral-900">Expected result</p>
                    <p className="whitespace-pre-wrap text-neutral-700">{s.expectedResult}</p>
                  </div>
                  <ResultNotes r={r} onSave={(body) => void setResult(r, body)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <NaDialog r={naFor} onClose={() => setNaFor(null)} onSave={(reason) => naFor && void setResult(naFor, { result: "NA", reason }).then(() => setNaFor(null))} />
      {passcodeDialog}
    </>
  );
}

function ResultNotes({ r, onSave }: { r: Result; onSave: (body: Record<string, unknown>) => void }) {
  const [notes, setNotes] = useState(r.notes ?? "");
  const [evidence, setEvidence] = useState(r.evidenceUrl ?? "");
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`notes-${r.id}`}>Notes</Label>
      <Textarea id={`notes-${r.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (r.notes ?? "") && onSave({ notes: notes || null })} rows={3} placeholder="What you saw (used as the actual result when sent to the Bug Formatter)" />
      <Label htmlFor={`evidence-${r.id}`}>Evidence link</Label>
      <Input id={`evidence-${r.id}`} type="url" value={evidence} onChange={(e) => setEvidence(e.target.value)} onBlur={() => evidence !== (r.evidenceUrl ?? "") && onSave({ evidenceUrl: evidence.trim() || null })} placeholder="https://… (screenshot, video, ticket)" />
    </div>
  );
}

function NaDialog({ r, onClose, onSave }: { r: Result | null; onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) {
              onSave(reason.trim());
              setReason("");
            }
          }}
          className="flex flex-col gap-3"
        >
          <DialogHeader>
            <DialogTitle>Mark {r?.snapshot.caseId} as N/A</DialogTitle>
            <DialogDescription>N/A counts as done only with a reason, e.g. the feature isn&apos;t part of this release.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="na-reason">Reason</Label>
          <Input id="na-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!reason.trim()} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
              Save N/A
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
