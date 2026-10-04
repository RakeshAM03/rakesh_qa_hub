"use client";

import { useState, type FormEvent } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CI_COLOR_STYLES } from "@/lib/ci/colors";
import { CI_COLORS, suiteSchema, type CiColor } from "@/lib/ci/schema";
import { cn } from "@/lib/utils";
import type { Suite } from "./types";

type InputRow = { key: string; label: string; type: "text" | "choice"; options: string; default: string };
type Values = { name: string; repo: string; workflowFile: string; color: CiColor; inputs: InputRow[] };

const fromSuite = (s?: Suite | null): Values =>
  s
    ? {
        name: s.name,
        repo: s.repo,
        workflowFile: s.workflowFile,
        color: (CI_COLORS as readonly string[]).includes(s.color) ? (s.color as CiColor) : "blue",
        inputs: s.dispatchInputs.map((i) => ({ ...i, options: i.options.join(", ") })),
      }
    : { name: "", repo: "", workflowFile: "", color: "blue", inputs: [] };

export type SuitePayload = {
  name: string;
  repo: string;
  workflowFile: string;
  color: CiColor;
  dispatchInputs: { key: string; label: string; type: "text" | "choice"; options: string[]; default: string }[];
};

type SuiteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suite?: Suite | null;
  githubConnected: boolean;
  /** Resolves to an error message, or null when saved. */
  onSubmit: (payload: SuitePayload) => Promise<string | null>;
};

export function SuiteDialog({ open, onOpenChange, suite, githubConnected, onSubmit }: SuiteDialogProps) {
  const [values, setValues] = useState(() => fromSuite(suite));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(fromSuite(suite));
      setErrors({});
      setFormError(null);
    }
  }

  const set = <K extends keyof Values>(k: K, v: Values[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const setInput = (i: number, patch: Partial<InputRow>) =>
    setValues((s) => ({ ...s, inputs: s.inputs.map((row, j) => (j === i ? { ...row, ...patch } : row)) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload: SuitePayload = {
      name: values.name,
      repo: values.repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, ""),
      workflowFile: values.workflowFile.trim().replace(/^\.github\/workflows\//, ""),
      color: values.color,
      dispatchInputs: values.inputs.map((i) => ({
        key: i.key,
        label: i.label,
        type: i.type,
        options: i.type === "choice" ? i.options.split(",").map((o) => o.trim()).filter(Boolean) : [],
        default: i.default,
      })),
    };
    const result = suiteSchema.safeParse(payload);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] === "dispatchInputs" ? `inputs.${String(issue.path[1] ?? "")}` : String(issue.path[0]);
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    const message = await onSubmit(payload);
    setSaving(false);
    if (message) setFormError(message);
    else onOpenChange(false);
  }

  const field = (key: "name" | "repo" | "workflowFile", label: string, placeholder: string, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`suite-${key}`}>
        {label} <span className="text-red-700">*</span>
      </Label>
      <Input
        id={`suite-${key}`}
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `suite-${key}-error` : undefined}
        className={key === "name" ? undefined : "font-mono text-sm"}
      />
      {errors[key] ? (
        <p id={`suite-${key}-error`} className="text-xs text-red-700">
          {errors[key]}
        </p>
      ) : (
        hint && <p className="text-xs text-neutral-500">{hint}</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{suite ? "Edit suite" : "Add suite"}</DialogTitle>
            <DialogDescription>
              A GitHub Actions workflow to show and run here.{" "}
              {githubConnected
                ? "The repo and workflow are checked on GitHub when you save."
                : "GitHub isn't connected yet, so the repo and workflow can't be checked now."}
            </DialogDescription>
          </DialogHeader>

          {field("name", "Display name", "e.g. Checkout Regression")}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("repo", "GitHub repo", "owner/name")}
            {field("workflowFile", "Workflow file", "regression.yml", "File name in .github/workflows/")}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Colour</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
              {CI_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={values.color === c}
                  aria-label={CI_COLOR_STYLES[c].label}
                  title={CI_COLOR_STYLES[c].label}
                  onClick={() => set("color", c)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full ring-offset-2",
                    CI_COLOR_STYLES[c].swatch,
                    values.color === c && "ring-2 ring-neutral-900",
                  )}
                >
                  {values.color === c && <Check className="size-4 text-white" />}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              Dispatch inputs <span className="font-normal text-neutral-500">(optional)</span>
            </legend>
            <p className="-mt-1 text-xs text-neutral-500">
              Inputs your workflow&apos;s <code>workflow_dispatch</code> accepts. They&apos;re shown before each run.
            </p>
            {errors["inputs."] && <p className="text-xs text-red-700">{errors["inputs."]}</p>}
            {values.inputs.map((row, i) => (
              <div key={i} data-testid="dispatch-input-row" className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_7rem_auto]">
                  <Input value={row.key} onChange={(e) => setInput(i, { key: e.target.value })} placeholder="key, e.g. environment" aria-label={`Input ${i + 1} key`} className="font-mono text-sm" />
                  <Input value={row.label} onChange={(e) => setInput(i, { label: e.target.value })} placeholder="Label" aria-label={`Input ${i + 1} label`} />
                  <Select value={row.type} onValueChange={(v) => setInput(i, { type: v as InputRow["type"] })}>
                    <SelectTrigger aria-label={`Input ${i + 1} type`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="choice">Choice</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove input ${i + 1}`}
                    onClick={() => setValues((s) => ({ ...s, inputs: s.inputs.filter((_, j) => j !== i) }))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {row.type === "choice" && (
                    <Input value={row.options} onChange={(e) => setInput(i, { options: e.target.value })} placeholder="Options, comma-separated: qa, staging" aria-label={`Input ${i + 1} options`} />
                  )}
                  <Input value={row.default} onChange={(e) => setInput(i, { default: e.target.value })} placeholder="Default (optional)" aria-label={`Input ${i + 1} default`} />
                </div>
                {errors[`inputs.${i}`] && <p className="text-xs text-red-700">{errors[`inputs.${i}`]}</p>}
              </div>
            ))}
            {values.inputs.length < 10 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  setValues((s) => ({ ...s, inputs: [...s.inputs, { key: "", label: "", type: "text", options: "", default: "" }] }))
                }
              >
                <Plus /> Add input
              </Button>
            )}
          </fieldset>

          {formError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : suite ? "Save changes" : "Add suite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
