"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FLAG_SEVERITIES,
  FLAG_TYPE_LABELS,
  FLAG_TYPES,
  type FlagSeverity,
  type FlagTypeKey,
} from "@/lib/ai-pr-review/constants";
import { formatLocation, parseLocation } from "@/lib/ai-pr-review/location";
import { flagInputSchema, type FlagInput } from "@/lib/ai-pr-review/schema";
import { cn } from "@/lib/utils";

export type FlagFormValues = {
  repo: string;
  flagType: FlagTypeKey | "";
  location: string;
  detail: string;
  severity: FlagSeverity | "";
  suggestedFix: string;
};

export const EMPTY_FLAG_FORM: FlagFormValues = {
  repo: "",
  flagType: "",
  location: "",
  detail: "",
  severity: "P1",
  suggestedFix: "",
};

export function flagToForm(f: {
  repo: string;
  flagType: FlagTypeKey | null;
  prNumber: number | null;
  filePath: string | null;
  line: number | null;
  detail: string;
  severity: FlagSeverity | null;
  suggestedFix: string | null;
}): FlagFormValues {
  return {
    repo: f.repo,
    flagType: f.flagType ?? "",
    location: formatLocation(f),
    detail: f.detail,
    severity: f.severity ?? "",
    suggestedFix: f.suggestedFix ?? "",
  };
}

/** Validates the form; returns the API input or field errors. */
export function formToInput(values: FlagFormValues) {
  const result = flagInputSchema.safeParse({
    repo: values.repo,
    flagType: values.flagType || undefined,
    ...parseLocation(values.location),
    detail: values.detail,
    severity: values.severity || undefined,
    suggestedFix: values.suggestedFix,
  });
  if (result.success) return { input: result.data as FlagInput, errors: {} };
  const errors: Partial<Record<keyof FlagFormValues, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as string;
    const field = (["prNumber", "filePath", "line"].includes(key) ? "location" : key) as keyof FlagFormValues;
    errors[field] ??= issue.message;
  }
  return { input: null, errors };
}

const labelClass = "text-xs font-semibold uppercase tracking-wider text-neutral-500";

type FlagFormProps = {
  idPrefix: string;
  initial?: FlagFormValues;
  /** Called with valid input; return true to reset the form. */
  onSubmit: (input: FlagInput) => Promise<boolean> | boolean;
  footer: (state: { submitting: boolean }) => ReactNode;
};

/** Repo, Flag Type, Location, Detail, Severity, Suggested Fix — used for manual entry and editing. */
export function FlagForm({ idPrefix, initial = EMPTY_FLAG_FORM, onSubmit, footer }: FlagFormProps) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FlagFormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof FlagFormValues>(key: K, value: FlagFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const id = (name: string) => `${idPrefix}-${name}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { input, errors } = formToInput(values);
    setErrors(errors);
    if (!input) return;
    setSubmitting(true);
    const reset = await onSubmit(input);
    setSubmitting(false);
    if (reset) setValues({ ...EMPTY_FLAG_FORM, repo: values.repo, severity: values.severity });
  }

  const err = (key: keyof FlagFormValues) =>
    errors[key] ? (
      <p id={id(`${key}-error`)} className="text-xs text-red-700">
        {errors[key]}
      </p>
    ) : null;
  const a11y = (key: keyof FlagFormValues) => ({
    "aria-invalid": !!errors[key],
    "aria-describedby": errors[key] ? id(`${key}-error`) : undefined,
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("repo")} className={labelClass}>
            Repo <span className="text-red-700">*</span>
          </Label>
          <Input id={id("repo")} value={values.repo} onChange={(e) => set("repo", e.target.value)} placeholder="owner/name" {...a11y("repo")} />
          {err("repo")}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("type")} className={labelClass}>
            Flag Type <span className="text-red-700">*</span>
          </Label>
          <Select value={values.flagType} onValueChange={(v) => set("flagType", v as FlagTypeKey)}>
            <SelectTrigger id={id("type")} className="w-full" {...a11y("flagType")}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {FLAG_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {FLAG_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err("flagType")}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("location")} className={labelClass}>
            Location
          </Label>
          <Input
            id={id("location")}
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="#123 > src/app/page.tsx:42"
            className="font-mono text-xs"
            {...a11y("location")}
          />
          {err("location")}
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className={cn(labelClass, "mb-1.5")}>
            Severity <span className="text-red-700">*</span>
          </legend>
          <div className="flex gap-2" role="radiogroup" aria-label="Severity">
            {FLAG_SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={values.severity === s}
                onClick={() => set("severity", s)}
                className={cn(
                  "h-9 rounded-full border px-4 text-sm font-medium",
                  values.severity === s
                    ? "border-purple-600 bg-purple-600 text-white"
                    : "border-neutral-300 text-neutral-600 hover:border-purple-300",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          {err("severity")}
        </fieldset>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("detail")} className={labelClass}>
          Detail <span className="text-red-700">*</span>
        </Label>
        <Textarea
          id={id("detail")}
          value={values.detail}
          onChange={(e) => set("detail", e.target.value)}
          placeholder="What is wrong and the concrete scenario where it fails"
          className="min-h-20"
          {...a11y("detail")}
        />
        {err("detail")}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("fix")} className={labelClass}>
          Suggested Fix
        </Label>
        <Textarea
          id={id("fix")}
          value={values.suggestedFix}
          onChange={(e) => set("suggestedFix", e.target.value)}
          placeholder="The specific change to make"
          className="min-h-16"
        />
      </div>
      {footer({ submitting })}
    </form>
  );
}
