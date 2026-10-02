"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SeverityPill } from "@/components/bug-formatter/severity";
import { toastResponseError, useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { useYourName } from "@/components/shared/your-name";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ISSUE_STATUS_LABELS, ISSUE_STATUSES, type IssueStatus } from "@/lib/bug-tracker/schema";
import { percentValid } from "@/lib/bug-tracker/stats";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IssueDialog, type Issue } from "./issue-dialog";
import { BugTrackerTopBar } from "./top-bar";
import { ValidPill } from "./valid-pill";

type FeatureInfo = { id: string; name: string; team: { id: string; name: string } | null };

const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500";
export const issueCode = (id: string) => `#${id.slice(-6).toUpperCase()}`;

export function FeatureDetail({ featureId, highlightId }: { featureId: string; highlightId?: string }) {
  const router = useRouter();
  const [feature, setFeature] = useState<FeatureInfo | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; issue: Issue | null }>({ open: false, issue: null });
  const [toDelete, setToDelete] = useState<Issue | null>(null);
  const [deleteFeature, setDeleteFeature] = useState(false);
  const { withPasscode, passcodeDialog } = useAdminPasscode();
  const { displayName } = useYourName();
  const highlightRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch(`/api/bug-tracker/features/${featureId}`), fetch(`/api/bug-tracker/features/${featureId}/issues`)])
      .then(async ([f, i]) => {
        if (cancelled) return;
        if (f.status === 404) return setNotFound(true);
        if (!f.ok || !i.ok) throw new Error();
        setFeature((await f.json()).feature);
        setIssues((await i.json()).issues);
      })
      .catch(() => !cancelled && toast.error("Couldn't load this feature page."));
    return () => {
      cancelled = true;
    };
  }, [featureId]);

  useEffect(() => {
    if (issues && highlightId) highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [issues, highlightId]);

  async function save(values: Omit<Issue, "id" | "createdAt">, existing: Issue | null): Promise<string | null> {
    const res = await fetch(existing ? `/api/bug-tracker/issues/${existing.id}` : `/api/bug-tracker/features/${featureId}/issues`, {
      method: existing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, actor: displayName }),
    }).catch(() => null);
    if (!res) return "Couldn't reach the server. Try again.";
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error ?? "Couldn't save the issue.";
    setIssues((list) =>
      existing ? (list ?? []).map((i) => (i.id === existing.id ? data.issue : i)) : [data.issue, ...(list ?? [])],
    );
    toast.success(existing ? "Issue updated" : "Issue added");
    return null;
  }

  async function quickUpdate(issue: Issue, patch: Partial<Pick<Issue, "status" | "isValid">>) {
    const previous = issues;
    setIssues((list) => list?.map((i) => (i.id === issue.id ? { ...i, ...patch } : i)) ?? null);
    const res = await fetch(`/api/bug-tracker/issues/${issue.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, actor: displayName }),
    }).catch(() => null);
    if (!res?.ok) {
      setIssues(previous);
      if (res) await toastResponseError(res, "Couldn't update the issue.");
      else toast.error("Couldn't reach the server.");
    }
  }

  async function confirmDeleteIssue() {
    const issue = toDelete;
    setToDelete(null);
    if (!issue) return;
    const res = await withPasscode((headers) =>
      fetch(`/api/bug-tracker/issues/${issue.id}?${new URLSearchParams({ actor: displayName })}`, { method: "DELETE", headers }),
    );
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't delete the issue.");
    setIssues((list) => list?.filter((i) => i.id !== issue.id) ?? null);
    toast.success("Issue deleted");
  }

  async function confirmDeleteFeature() {
    setDeleteFeature(false);
    const res = await withPasscode((headers) => fetch(`/api/bug-tracker/features/${featureId}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't delete the feature page.");
    toast.success(`Deleted “${feature?.name}”`);
    router.push("/bug-tracker");
  }

  if (notFound) {
    return (
      <>
        <BugTrackerTopBar backHref="/bug-tracker" backLabel="Bug Tracker" />
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center text-neutral-600">
          This feature page doesn&apos;t exist. It may have been deleted.
        </div>
      </>
    );
  }

  const total = issues?.length ?? 0;
  const valid = issues?.filter((i) => i.isValid).length ?? 0;

  return (
    <>
      <BugTrackerTopBar backHref="/bug-tracker" backLabel="Bug Tracker" />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {feature ? (
            <>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight break-words text-neutral-900 sm:text-3xl">
                <LayoutGrid className="size-6 shrink-0 text-neutral-500" aria-hidden />
                {feature.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                <Badge variant="secondary">{feature.team?.name ?? "No team"}</Badge>
                <span>
                  {total} {total === 1 ? "issue" : "issues"} · {valid} valid
                </span>
                <ValidPill percent={percentValid(valid, total)} />
                <span className="inline-flex items-center gap-1 text-xs" title="Linking a Google Sheet is coming soon">
                  <FileSpreadsheet className="size-3.5" /> Google Sheet: coming soon
                </span>
              </div>
            </>
          ) : (
            <Skeleton className="h-9 w-64" />
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => setDeleteFeature(true)} disabled={!feature} className="text-red-600 hover:bg-red-50 hover:text-red-700">
            <Trash2 /> Delete page
          </Button>
          <Button onClick={() => setDialog({ open: true, issue: null })} disabled={!feature}>
            <Plus /> New Issue
          </Button>
        </div>
      </div>

      {issues !== null && issues.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
          <p className="text-neutral-600">No issues logged for this feature yet.</p>
          <Button onClick={() => setDialog({ open: true, issue: null })}>
            <Plus /> Add the first issue
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-neutral-200">
              <tr>
                <th className={th}>ID</th>
                <th className={th}>Title</th>
                <th className={th}>Severity</th>
                <th className={th}>Status</th>
                <th className={th}>Valid</th>
                <th className={th}>Reporter</th>
                <th className={th}>Assignee</th>
                <th className={th}>Created</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {issues === null
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td colSpan={9} className="px-3 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                : issues.map((issue) => (
                    <tr
                      key={issue.id}
                      ref={issue.id === highlightId ? highlightRef : undefined}
                      data-testid="issue-row"
                      className={cn(
                        "border-t border-neutral-100 align-top",
                        issue.id === highlightId && "bg-amber-50",
                        !issue.isValid && "text-neutral-500",
                      )}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-neutral-500">{issueCode(issue.id)}</td>
                      <td className="max-w-80 px-3 py-2.5">
                        <span className={cn("font-medium break-words", issue.isValid ? "text-neutral-900" : "line-through decoration-neutral-300")}>
                          {issue.title}
                        </span>
                        {issue.description && <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{issue.description}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <SeverityPill severity={issue.severity} />
                      </td>
                      <td className="px-3 py-1.5">
                        <Select value={issue.status} onValueChange={(v) => quickUpdate(issue, { status: v as IssueStatus })}>
                          <SelectTrigger size="sm" className="w-32" aria-label={`Status of ${issue.title}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ISSUE_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {ISSUE_STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                          <Switch
                            checked={issue.isValid}
                            onCheckedChange={(v) => quickUpdate(issue, { isValid: v })}
                            aria-label={`${issue.title} is valid`}
                          />
                          {issue.isValid ? "Valid" : "Invalid"}
                        </label>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600">{issue.reporter ?? "—"}</td>
                      <td className="px-3 py-2.5 text-neutral-600">{issue.assignee ?? "Unassigned"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-neutral-600">{formatDate(issue.createdAt)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${issue.title}`} onClick={() => setDialog({ open: true, issue })}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${issue.title}`}
                          onClick={() => setToDelete(issue)}
                          className="text-neutral-400 hover:text-red-600"
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      <IssueDialog
        open={dialog.open}
        issue={dialog.issue}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSubmit={(values) => save(values, dialog.issue)}
      />
      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this issue?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toDelete?.title}” will be removed and the counts updated. To keep it but not count it, mark it invalid instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteIssue} className="bg-red-600 text-white hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteFeature} onOpenChange={setDeleteFeature}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{feature?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The feature page, its {total} issues and their activity will be removed for everyone. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFeature} className="bg-red-600 text-white hover:bg-red-700">
              Delete page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {passcodeDialog}
    </>
  );
}
