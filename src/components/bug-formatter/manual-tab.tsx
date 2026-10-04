"use client";

import { useState, type FormEvent } from "react";
import { Info, Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SEVERITIES, type Bug, type BugInput, type Severity } from "@/lib/bug-formatter/types";
import { cn } from "@/lib/utils";

type Form = {
  title: string;
  severity: Severity;
  environmentUrl: string;
  steps: string;
  expected: string;
  actual: string;
  notes: string;
};

const EMPTY: Form = {
  title: "",
  severity: "P1",
  environmentUrl: "",
  steps: "",
  expected: "",
  actual: "",
  notes: "",
};

function fromBug(bug: Bug): Form {
  return {
    title: bug.title,
    severity: bug.severity,
    environmentUrl: bug.environmentUrl ?? "",
    steps: bug.steps.join("\n"),
    expected: bug.expected ?? "",
    actual: bug.actual ?? "",
    notes: bug.notes ?? "",
  };
}

function toInput(form: Form): BugInput {
  const opt = (v: string) => v.trim() || undefined;
  return {
    title: form.title.trim(),
    severity: form.severity,
    environmentUrl: opt(form.environmentUrl),
    steps: form.steps
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    expected: opt(form.expected),
    actual: opt(form.actual),
    notes: opt(form.notes),
  };
}

const labelClass = "text-xs font-semibold uppercase tracking-wider text-neutral-500";

/** A bug sent from another module (e.g. Test Failure Analyzer) to review before adding. */
export type ManualPrefill = { id: string; bug: BugInput; source: string };

type ManualTabProps = {
  /** When set, the form edits this bug instead of adding a new one. */
  editing?: Bug;
  prefill?: ManualPrefill | null;
  onAdd: (bug: BugInput) => void;
  onSave: (id: string, bug: BugInput) => void;
  onCancelEdit: () => void;
};

export function ManualTab({ editing, prefill, onAdd, onSave, onCancelEdit }: ManualTabProps) {
  const [form, setForm] = useState<Form>(() => (editing ? fromBug(editing) : EMPTY));
  const [submitted, setSubmitted] = useState(false);
  // Load the bug when a different one is picked for editing.
  const [editingId, setEditingId] = useState(editing?.id);
  if (editing?.id !== editingId) {
    setEditingId(editing?.id);
    setForm(editing ? fromBug(editing) : EMPTY);
    setSubmitted(false);
  }
  // Fill the form once per bug sent from another module.
  const [prefillId, setPrefillId] = useState<string | null>(null);
  const [prefillSource, setPrefillSource] = useState<string | null>(null);
  if (prefill && prefill.id !== prefillId && !editing) {
    setPrefillId(prefill.id);
    setPrefillSource(prefill.source);
    setForm(fromBug({ ...prefill.bug, id: "", source: "MANUAL", createdAt: "" }));
    setSubmitted(false);
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const titleMissing = submitted && !form.title.trim();

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!form.title.trim()) return;
    if (editing) {
      onSave(editing.id, toInput(form));
    } else {
      onAdd(toInput(form));
      setPrefillSource(null);
      // Keep severity and environment for the next bug.
      setForm({ ...EMPTY, severity: form.severity, environmentUrl: form.environmentUrl });
    }
    setSubmitted(false);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {prefillSource && !editing && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Pre-filled from {prefillSource} — review the details, then click Add Bug.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bf-title" className={labelClass}>
          Title <span className="text-red-700">*</span>
        </Label>
        <Input
          id="bf-title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Short description of the bug"
          aria-invalid={titleMissing}
          aria-describedby={titleMissing ? "bf-title-error" : undefined}
        />
        {titleMissing && (
          <p id="bf-title-error" className="text-xs text-red-700">
            Required
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className={cn(labelClass, "mb-1.5")}>Severity</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Severity">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={form.severity === s}
              onClick={() => set("severity", s)}
              className={cn(
                "h-8 rounded-full border px-4 text-sm font-medium transition-colors",
                form.severity === s
                  ? "border-orange-700 bg-orange-700 text-orange-50"
                  : "border-neutral-300 text-neutral-600 hover:border-orange-300",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>

      <Field id="bf-env" label="Environment URL">
        <Input id="bf-env" value={form.environmentUrl} onChange={(e) => set("environmentUrl", e.target.value)} placeholder="https://..." />
      </Field>
      <Field id="bf-steps" label="Steps to reproduce">
        <Textarea
          id="bf-steps"
          value={form.steps}
          onChange={(e) => set("steps", e.target.value)}
          placeholder={"Go to...\nClick on...\nObserve..."}
          className="min-h-24"
        />
      </Field>
      <Field id="bf-expected" label="Expected result">
        <Input id="bf-expected" value={form.expected} onChange={(e) => set("expected", e.target.value)} placeholder="What should have happened" />
      </Field>
      <Field id="bf-actual" label="Actual result">
        <Input id="bf-actual" value={form.actual} onChange={(e) => set("actual", e.target.value)} placeholder="What actually happened" />
      </Field>
      <Field id="bf-notes" label="Notes (optional)">
        <Input id="bf-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Suspected root cause or extra context" />
      </Field>

      {editing ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancelEdit}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 bg-orange-700 text-orange-50 hover:bg-orange-800">
            <Save /> Save changes
          </Button>
        </div>
      ) : (
        <Button type="submit" className="w-full bg-orange-700 text-orange-50 hover:bg-orange-800">
          <Plus /> Add Bug
        </Button>
      )}
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      {children}
    </div>
  );
}
