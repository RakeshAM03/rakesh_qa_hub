"use client";

import { useState, type FormEvent } from "react";

import { useYourName } from "@/components/shared/your-name";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ISSUE_SEVERITIES,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUSES,
  type IssueSeverity,
  type IssueStatus,
} from "@/lib/bug-tracker/schema";

export type Issue = {
  id: string;
  title: string;
  description: string | null;
  severity: IssueSeverity;
  status: IssueStatus;
  isValid: boolean;
  reporter: string | null;
  assignee: string | null;
  createdAt: string;
};

type IssueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Issue to edit; omitted when creating. */
  issue?: Issue | null;
  /** Saves; resolves to an error message or null. */
  onSubmit: (values: Omit<Issue, "id" | "createdAt">) => Promise<string | null>;
};

export function IssueDialog({ open, onOpenChange, issue, onSubmit }: IssueDialogProps) {
  const { name } = useYourName();
  const blank = { title: "", description: "", severity: "P2" as IssueSeverity, status: "OPEN" as IssueStatus, isValid: true, reporter: name, assignee: "" };
  const fromIssue = (i: Issue) => ({ ...i, description: i.description ?? "", reporter: i.reporter ?? "", assignee: i.assignee ?? "" });
  const [values, setValues] = useState(issue ? fromIssue(issue) : blank);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reload the form each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(issue ? fromIssue(issue) : blank);
      setError(null);
    }
  }

  const set = <K extends keyof typeof values>(k: K, v: (typeof values)[K]) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!values.title.trim()) return setError("Title is required");
    setSaving(true);
    const message = await onSubmit({
      title: values.title,
      description: values.description || null,
      severity: values.severity,
      status: values.status,
      isValid: values.isValid,
      reporter: values.reporter || null,
      assignee: values.assignee || null,
    });
    setSaving(false);
    if (message) setError(message);
    else onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{issue ? "Edit issue" : "New issue"}</DialogTitle>
            <DialogDescription>Issues marked invalid don&apos;t count towards Valid issues.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="issue-title"
              value={values.title}
              onChange={(e) => {
                set("title", e.target.value);
                setError(null);
              }}
              placeholder="Short description of the issue"
              maxLength={300}
              aria-invalid={!!error}
              aria-describedby={error ? "issue-title-error" : undefined}
              autoFocus
            />
            {error && <p id="issue-title-error" className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-description">Description</Label>
            <Textarea id="issue-description" value={values.description} onChange={(e) => set("description", e.target.value)} className="min-h-20" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-severity">Severity</Label>
              <Select value={values.severity} onValueChange={(v) => set("severity", v as IssueSeverity)}>
                <SelectTrigger id="issue-severity" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ISSUE_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-status">Status</Label>
              <Select value={values.status} onValueChange={(v) => set("status", v as IssueStatus)}>
                <SelectTrigger id="issue-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ISSUE_STATUSES.map((s) => <SelectItem key={s} value={s}>{ISSUE_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-reporter">Reporter</Label>
              <Input id="issue-reporter" value={values.reporter} onChange={(e) => set("reporter", e.target.value)} maxLength={80} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue-assignee">Assignee</Label>
              <Input id="issue-assignee" value={values.assignee} onChange={(e) => set("assignee", e.target.value)} maxLength={80} placeholder="Unassigned" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={values.isValid} onCheckedChange={(v) => set("isValid", v)} aria-label="Valid issue" />
            {values.isValid ? "Valid issue" : "Invalid (duplicate, not a bug, works as designed…)"}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : issue ? "Save changes" : "Add issue"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
