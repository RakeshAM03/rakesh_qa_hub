"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Circle, ExternalLink, Save, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { Markdown } from "@/components/shared/markdown";
import { toastResponseError, useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CATCHABLE_LABELS, ISSUE_STATUSES, KEYS, PREVENTION_LABELS, SEVERITIES, type CatchableValue } from "@/config/customer-issues";
import { applyCategory, applyDisposition, completeness, rcaChecklist, Lists, type Classification } from "@/lib/customer-issues/model";
import type { IssueDto } from "@/lib/customer-issues/server";
import { formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CiHeader } from "./ci-header";
import { ListSelect } from "./issue-dialogs";
import { CompletenessPill, RunResultBadge } from "./issue-list";
import { useLists } from "./use-lists";

const NONE = "__none";
const CLASSIFICATION_KEYS: (keyof Classification)[] = ["productId", "module", "releasedIn", "severity", "dispositionId", "dispositionNote", "linkedIssueKey", "rcaCategoryId", "rcaSubcategoryId", "caughtAtId", "catchable", "whyEscapedId", "detectedById", "scopeId", "impactId", "recurring", "ownerTeamId", "rca", "prevention", "preventionStatus", "qaOwner", "comments", "regressionRequired"];
const TRACKER_KEYS = ["summary", "description", "status", "createdDate", "resolvedDate", "fixVersion", "issueUrl"] as const;
type Draft = Classification & Pick<IssueDto, (typeof TRACKER_KEYS)[number]>;

const draftOf = (i: IssueDto): Draft => Object.fromEntries([...CLASSIFICATION_KEYS, ...TRACKER_KEYS].map((k) => [k, i[k as keyof IssueDto]])) as Draft;

export function IssueDetail({ id, children }: { id: string; children?: (issue: IssueDto, lists: Lists, reload: () => void) => ReactNode }) {
  const router = useRouter();
  const { lists } = useLists();
  const [issue, setIssue] = useState<IssueDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [missing, setMissing] = useState(false);
  const [version, setVersion] = useState(0);
  const [modules, setModules] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/customer-issues/issues/${id}`, { cache: "no-store", signal: controller.signal })
      .then((res) => {
        if (res.status === 404) {
          setMissing(true);
          return null;
        }
        return res.ok ? res.json() : Promise.reject(res);
      })
      .then((json) => {
        if (!json) return;
        setIssue(json.issue);
        setDraft(draftOf(json.issue));
      })
      .catch(() => {
        if (!controller.signal.aborted) toast.error("Couldn't load the issue.");
      });
    fetch("/api/customer-issues/issues", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => json && setModules([...new Set<string>((json.issues as IssueDto[]).map((i) => i.module ?? "").filter(Boolean))].sort()))
      .catch(() => undefined);
    return () => controller.abort();
  }, [id, version]);
  const reload = () => setVersion((v) => v + 1);

  const changed = useMemo(() => {
    if (!issue || !draft) return {};
    const base = draftOf(issue) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(draft).filter(([k, v]) => (v ?? null) !== (base[k] ?? null)));
  }, [issue, draft]);
  const dirty = Object.keys(changed).length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (missing)
    return (
      <>
        <CiHeader title="Customer issue" backHref="/customer-issues" backLabel="Customer issues" />
        <p className="text-sm text-neutral-700">This issue doesn&apos;t exist (it may have been deleted).</p>
      </>
    );
  if (!issue || !draft || !lists)
    return (
      <>
        <CiHeader title="Customer issue" backHref="/customer-issues" backLabel="Customer issues" />
        <Skeleton className="h-96 w-full" />
      </>
    );

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d!, ...patch }));
  const comp = completeness(draft, lists);
  const errorFor = (f: keyof Classification) => comp.errors.find((e) => e.field === f)?.message;
  const disp = lists.key(draft.dispositionId);
  const isValidBug = disp === KEYS.VALID_BUG;
  const jira = issue.source === "JIRA";

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/customer-issues/issues/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changed) });
    setSaving(false);
    if (!res.ok) return toastResponseError(res, "Couldn't save the changes.");
    const d = await res.json();
    setIssue(d.issue);
    setDraft(draftOf(d.issue));
    toast.success(d.rcaReopened ? "Saved — the RCA was re-opened because an RCA field changed" : "Saved");
  }

  async function markComplete() {
    const res = await fetch(`/api/customer-issues/issues/${id}/rca-complete`, { method: "POST" });
    if (!res.ok) return toastResponseError(res, "Couldn't complete the RCA.");
    const d = await res.json();
    setIssue(d.issue);
    setDraft(draftOf(d.issue));
    toast.success("RCA marked complete");
  }

  async function remove() {
    const res = await withPasscode((headers) => fetch(`/api/customer-issues/issues/${id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't delete the issue.");
    toast.success(`${issue!.issueKey} deleted`);
    router.push("/customer-issues");
  }

  const val = (v: string | null | undefined) => v ?? NONE;
  const fromVal = (v: string) => (v === NONE ? null : v);

  return (
    <>
      <CiHeader
        title={issue.issueKey}
        subtitle={issue.summary}
        backHref="/customer-issues"
        backLabel="Customer issues"
        actions={
          <>
            {issue.issueUrl && (
              <Button variant="outline" asChild>
                <a href={issue.issueUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden /> {jira ? "Open in Jira" : "Open issue"}
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={remove} aria-label="Delete issue">
              <Trash2 aria-hidden />
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {jira ? <Badge className="bg-blue-100 font-normal text-blue-800">Synced from Jira{issue.lastSyncedAt ? ` · ${formatRelative(issue.lastSyncedAt)}` : ""}</Badge> : <Badge className="bg-neutral-100 font-normal text-neutral-700">{issue.source === "CSV" ? "Imported" : "Added manually"}</Badge>}
        <CompletenessPill issue={{ ...issue, completeness: comp, rcaComplete: issue.rcaComplete && !dirty }} />
        {issue.needsRca && <Badge className="bg-rose-100 font-normal text-rose-800">Needs RCA</Badge>}
        <span className="text-neutral-700">Days to resolve: {issue.daysToResolve ?? "—"}</span>
        <span className="text-neutral-700">· Days to detect: {issue.daysToDetect ?? "—"}</span>
        <span className="flex items-center gap-1 text-neutral-700">
          · Last run: <RunResultBadge result={issue.lastRunResult} />
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Classification">
            <div className="grid gap-3 sm:grid-cols-2">
              <ListSelect id="f-disposition" label="Disposition" list="DISPOSITION" lists={lists} value={val(draft.dispositionId)} onChange={(v) => setDraft(applyDisposition(draft, fromVal(v), lists) as Draft)} />
              {(disp === KEYS.DUPLICATE || disp === KEYS.KNOWN_ISSUE || draft.recurring) && (
                <Field id="f-linked" label={disp === KEYS.DUPLICATE ? "Duplicate of (issue key)" : disp === KEYS.KNOWN_ISSUE ? "Known issue key" : "Previous issue key"} error={errorFor("linkedIssueKey")}>
                  <Input id="f-linked" value={draft.linkedIssueKey ?? ""} onChange={(e) => set({ linkedIssueKey: e.target.value.toUpperCase() || null })} placeholder="DEMO-101" />
                </Field>
              )}
              {disp && disp !== KEYS.VALID_BUG && disp !== KEYS.DUPLICATE && disp !== KEYS.KNOWN_ISSUE && (
                <Field id="f-note" label="Note" className="sm:col-span-2">
                  <Textarea id="f-note" value={draft.dispositionNote ?? ""} onChange={(e) => set({ dispositionNote: e.target.value || null })} rows={2} />
                </Field>
              )}
            </div>
            {lists.get(draft.dispositionId)?.description && <p className="mt-1 text-xs text-neutral-600">{lists.get(draft.dispositionId)!.description}</p>}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <ListSelect id="f-category" label={`RCA category${isValidBug ? " *" : ""}`} list="RCA_CATEGORY" lists={lists} value={val(draft.rcaCategoryId)} onChange={(v) => setDraft(applyCategory(draft, fromVal(v), lists) as Draft)} />
                {lists.get(draft.rcaCategoryId)?.description && <p className="mt-1 text-xs text-neutral-600">{lists.get(draft.rcaCategoryId)!.description}</p>}
              </div>
              <ListSelect
                id="f-subcategory"
                label={`Sub-category${isValidBug && lists.subcategories(draft.rcaCategoryId).length ? " *" : ""}`}
                list="RCA_SUBCATEGORY"
                lists={lists}
                parentId={draft.rcaCategoryId}
                value={val(draft.rcaSubcategoryId)}
                onChange={(v) => set({ rcaSubcategoryId: fromVal(v) })}
                disabled={!draft.rcaCategoryId || !lists.subcategories(draft.rcaCategoryId, draft.rcaSubcategoryId).length}
              />
              <ListSelect id="f-caught" label={`Should have been caught at${isValidBug ? " *" : ""}`} list="CAUGHT_AT" lists={lists} value={val(draft.caughtAtId)} onChange={(v) => set({ caughtAtId: fromVal(v) })} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-catchable">Catchable by QA?{isValidBug ? " *" : ""}</Label>
                <Select value={val(draft.catchable)} onValueChange={(v) => set({ catchable: fromVal(v) as CatchableValue | null })}>
                  <SelectTrigger id="f-catchable" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value={NONE}>—</SelectItem>
                    {(Object.keys(CATCHABLE_LABELS) as CatchableValue[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATCHABLE_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(draft.catchable === "YES" || draft.catchable === "PARTIAL") && (
                <div>
                  <ListSelect id="f-why" label="Why it escaped *" list="WHY_ESCAPED" lists={lists} value={val(draft.whyEscapedId)} onChange={(v) => set({ whyEscapedId: fromVal(v) })} />
                  {errorFor("whyEscapedId") && <p className="mt-1 text-xs text-red-700">{errorFor("whyEscapedId")}</p>}
                </div>
              )}
              <ListSelect id="f-detected" label={`Detected by${isValidBug ? " *" : ""}`} list="DETECTED_BY" lists={lists} value={val(draft.detectedById)} onChange={(v) => set({ detectedById: fromVal(v) })} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-severity">Severity{isValidBug ? " *" : ""}</Label>
                <Select value={val(draft.severity)} onValueChange={(v) => set({ severity: fromVal(v) })}>
                  <SelectTrigger id="f-severity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value={NONE}>—</SelectItem>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ListSelect id="f-impact" label="Customer impact" list="IMPACT" lists={lists} value={val(draft.impactId)} onChange={(v) => set({ impactId: fromVal(v) })} />
              <ListSelect id="f-scope" label="Scope" list="SCOPE" lists={lists} value={val(draft.scopeId)} onChange={(v) => set({ scopeId: fromVal(v) })} />
              <ListSelect id="f-owner" label="Owner team" list="OWNER_TEAM" lists={lists} value={val(draft.ownerTeamId)} onChange={(v) => set({ ownerTeamId: fromVal(v) })} />
            </div>
            <div className="mt-4 flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm text-neutral-800">
                <Switch checked={draft.recurring} onCheckedChange={(v) => set({ recurring: v })} aria-label="Recurring issue" /> Recurring?
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-800">
                <Switch checked={draft.regressionRequired} onCheckedChange={(v) => set({ regressionRequired: v })} aria-label="Regression required" /> Regression required
              </label>
            </div>
          </Card>

          <Card title="RCA & prevention">
            <MarkdownField id="f-rca" label={`RCA — root cause and fix${isValidBug ? " *" : ""}`} value={draft.rca ?? ""} onChange={(v) => set({ rca: v || null })} />
            <MarkdownField id="f-prevention" label="Prevention action — what changes so it can't recur" value={draft.prevention ?? ""} onChange={(v) => set({ prevention: v || null })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-prev-status">Prevention status</Label>
                <Select value={draft.preventionStatus} onValueChange={(v) => set({ preventionStatus: v as Draft["preventionStatus"] })}>
                  <SelectTrigger id="f-prev-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.entries(PREVENTION_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field id="f-qa-owner" label="QA owner">
                <Input id="f-qa-owner" value={draft.qaOwner ?? ""} onChange={(e) => set({ qaOwner: e.target.value || null })} />
              </Field>
            </div>
            <MarkdownField id="f-comments" label={lists.key(draft.rcaCategoryId) === KEYS.OTHERS ? "Comments * (why no category fits)" : "Comments"} value={draft.comments ?? ""} onChange={(v) => set({ comments: v || null })} error={errorFor("comments")} />
          </Card>

          {children?.(issue, lists, reload)}
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="RCA completeness">
            <p className="text-sm text-neutral-800">
              {comp.done}/{comp.total} fields{issue.rcaComplete && !dirty ? " · complete" : ""}
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm" aria-label="RCA checklist">
              {rcaChecklist(draft, lists).map((i) => (
                <li key={i.label} className={cn("flex items-center gap-1.5", i.done ? "text-neutral-700" : "text-rose-800")}>
                  {i.done ? <CheckCircle2 className="size-4 text-green-700" aria-hidden /> : <Circle className="size-4" aria-hidden />}
                  {i.label}
                  <span className="sr-only">{i.done ? "(done)" : "(missing)"}</span>
                </li>
              ))}
            </ul>
            {comp.errors.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-xs text-red-700">
                {comp.errors.map((e) => (
                  <li key={e.field} className="flex gap-1">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> {e.message}
                  </li>
                ))}
              </ul>
            )}
            <Button className="mt-3 w-full bg-rose-700 text-rose-50 hover:bg-rose-800" disabled={!comp.canComplete || dirty || (issue.rcaComplete && !dirty)} onClick={markComplete}>
              <CheckCircle2 aria-hidden /> {issue.rcaComplete && !dirty ? "RCA complete" : "Mark RCA complete"}
            </Button>
            {dirty && <p className="mt-1 text-xs text-neutral-600">Save your changes first.</p>}
          </Card>

          <Card title="Details">
            <div className="flex flex-col gap-3">
              <Field id="f-summary" label="Summary">
                <Input id="f-summary" value={draft.summary} onChange={(e) => set({ summary: e.target.value })} disabled={jira} />
              </Field>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-status">Status</Label>
                <Select value={draft.status} onValueChange={(v) => set({ status: v as Draft["status"] })} disabled={jira}>
                  <SelectTrigger id="f-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {ISSUE_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ListSelect id="f-product" label="Product" list="PRODUCT" lists={lists} value={val(draft.productId)} onChange={(v) => set({ productId: fromVal(v) })} />
              <Field id="f-module" label="Module / feature">
                <Input id="f-module" list="ci-modules" value={draft.module ?? ""} onChange={(e) => set({ module: e.target.value || null })} />
                <datalist id="ci-modules">
                  {modules.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Field>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-created">Created date</Label>
                <DatePicker id="f-created" value={draft.createdDate} onChange={(v) => set({ createdDate: v })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-resolved">Resolved date</Label>
                <DatePicker id="f-resolved" value={draft.resolvedDate ?? ""} onChange={(v) => set({ resolvedDate: v || null })} />
              </div>
              <Field id="f-released" label="Released in (version)">
                <Input id="f-released" value={draft.releasedIn ?? ""} onChange={(e) => set({ releasedIn: e.target.value || null })} placeholder="v2.4.0" />
              </Field>
              <Field id="f-fix" label="Fix version">
                <Input id="f-fix" value={draft.fixVersion ?? ""} onChange={(e) => set({ fixVersion: e.target.value || null })} disabled={jira} />
              </Field>
              {!jira && (
                <Field id="f-url" label="Issue URL">
                  <Input id="f-url" type="url" value={draft.issueUrl ?? ""} onChange={(e) => set({ issueUrl: e.target.value || null })} />
                </Field>
              )}
              {jira && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-neutral-700">
                  <dt>Priority</dt>
                  <dd>{issue.priority ?? "—"}</dd>
                  <dt>Reporter</dt>
                  <dd>{issue.reporter ?? "—"}</dd>
                  <dt>Assignee</dt>
                  <dd>{issue.assignee ?? "—"}</dd>
                  <dt>Components</dt>
                  <dd>{issue.components.join(", ") || "—"}</dd>
                  <dt>Labels</dt>
                  <dd>{issue.labels.join(", ") || "—"}</dd>
                  <dt>Fix version released</dt>
                  <dd>{issue.releasedInDate ? formatDate(issue.releasedInDate) : "—"}</dd>
                </dl>
              )}
              {jira && <p className="text-xs text-neutral-600">Summary, status, description and dates come from Jira and refresh on every sync.</p>}
            </div>
          </Card>

          <Card title="Description">
            {jira ? (
              issue.description ? (
                <p className="text-sm whitespace-pre-wrap text-neutral-800">{issue.description}</p>
              ) : (
                <p className="text-sm text-neutral-600">No description.</p>
              )
            ) : (
              <Textarea aria-label="Description" value={draft.description ?? ""} onChange={(e) => set({ description: e.target.value || null })} rows={6} />
            )}
          </Card>
        </aside>
      </div>

      {dirty && (
        <div className="sticky bottom-4 z-10 mt-6 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-card px-4 py-3 shadow-lg print:hidden">
          <span className="text-sm text-neutral-800">
            {Object.keys(changed).length} unsaved change{Object.keys(changed).length === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft(draftOf(issue))}>
              Discard
            </Button>
            <Button onClick={save} disabled={saving} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
              <Save aria-hidden /> Save changes
            </Button>
          </div>
        </div>
      )}
      {passcodeDialog}
    </>
  );
}

export function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("rounded-xl border border-neutral-200 bg-card p-4 shadow-xs", className)}>
      <h2 className="mb-3 text-base font-semibold text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({ id, label, children, error, className }: { id: string; label: string; children: ReactNode; error?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

function MarkdownField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <button type="button" onClick={() => setPreview((p) => !p)} className="text-xs text-rose-800 hover:underline" aria-pressed={preview}>
          {preview ? "Edit" : "Preview"}
        </button>
      </div>
      {preview ? <div className="min-h-20 rounded-md border border-neutral-200 p-3">{value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-neutral-600">Nothing yet.</p>}</div> : <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={5} placeholder="Markdown supported" />}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
