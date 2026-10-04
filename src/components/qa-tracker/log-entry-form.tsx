"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, ClipboardPen, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayIso } from "@/lib/dates";
import { TASK_STATUS_LABELS, TASK_STATUSES, taskSchema, type TaskStatus } from "@/lib/qa-tracker/schema";
import { cn } from "@/lib/utils";
import type { Resource } from "./status";

type Row = { key: number; description: string; status: TaskStatus; hours: string };
type RowErrors = { description?: string; hours?: string };

const newRow = (key: number): Row => ({ key, description: "", status: "NOT_STARTED", hours: "0" });
const labelClass = "text-xs font-semibold uppercase tracking-wider text-neutral-500";

type LogEntryFormProps = {
  resources: Resource[];
  onLogged: (resourceId: string) => void;
  onManageResources: () => void;
};

export function LogEntryForm({ resources, onLogged, onManageResources }: LogEntryFormProps) {
  const [open, setOpen] = useState(true);
  const [resourceId, setResourceId] = useState("");
  const [date, setDate] = useState(todayIso);
  const [rows, setRows] = useState<Row[]>([newRow(0)]);
  const [nextKey, setNextKey] = useState(1);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Forget a resource that was deactivated or deleted.
  if (resourceId && !resources.some((r) => r.id === resourceId)) setResourceId("");

  const rowErrors: RowErrors[] = rows.map((r) => {
    const result = taskSchema.safeParse({
      description: r.description,
      status: r.status,
      hours: r.hours.trim() === "" ? undefined : Number(r.hours),
    });
    if (result.success) return {};
    const errors: RowErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof RowErrors;
      errors[key] ??= issue.message;
    }
    return errors;
  });
  const resourceMissing = !resourceId;
  const hasErrors = resourceMissing || rowErrors.some((e) => e.description || e.hours);

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (hasErrors) return;
    setSaving(true);
    try {
      const res = await fetch("/api/qa-tracker/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId,
          date,
          tasks: rows.map((r) => ({ description: r.description, status: r.status, hours: Number(r.hours) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't save the entry.");
        return;
      }
      const name = resources.find((r) => r.id === resourceId)?.name ?? "";
      toast.success(`Logged ${data.saved} ${data.saved === 1 ? "task" : "tasks"} for ${name}`);
      setRows([newRow(nextKey)]);
      setNextKey((k) => k + 1);
      setAttempted(false);
      onLogged(resourceId);
    } catch {
      toast.error("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="log-entry-title" className="rounded-xl border border-neutral-200 bg-card">
      <h3 id="log-entry-title">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="log-entry-body"
          className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold text-neutral-900"
        >
          <ClipboardPen className="size-4 text-green-600" aria-hidden />
          <span className="flex-1">Log Entry</span>
          <ChevronDown className={cn("size-4 text-neutral-500 transition-transform", open && "rotate-180")} />
        </button>
      </h3>
      <div id="log-entry-body" hidden={!open} className="border-t border-neutral-100 p-4">
        {resources.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Users className="size-8 text-green-200" aria-hidden />
            <p className="text-sm text-neutral-600">Add a resource to start logging.</p>
            <Button onClick={onManageResources} className="bg-green-600 text-white hover:bg-green-700">
              <Plus /> Add a resource
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="log-resource" className={labelClass}>
                  Resource <span className="text-red-500">*</span>
                </Label>
                <Select value={resourceId} onValueChange={setResourceId}>
                  <SelectTrigger
                    id="log-resource"
                    className="w-full"
                    aria-invalid={attempted && resourceMissing}
                    aria-describedby={attempted && resourceMissing ? "log-resource-error" : undefined}
                  >
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {attempted && resourceMissing && (
                  <p id="log-resource-error" className="text-xs text-red-600">
                    Required
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="log-date" className={labelClass}>
                  Date
                </Label>
                <DatePicker id="log-date" value={date} onChange={setDate} className="w-full" />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="hidden gap-3 md:grid md:grid-cols-[1fr_11rem_9rem_2.25rem]">
                <span className={labelClass}>Task description</span>
                <span className={labelClass}>Status</span>
                <span className={labelClass}>Time spent (hrs)</span>
              </div>
              {rows.map((row, i) => {
                const errors = attempted ? rowErrors[i] : {};
                const id = (f: string) => `task-${row.key}-${f}`;
                return (
                  <div key={row.key} data-testid="task-row" className="grid gap-2 md:grid-cols-[1fr_11rem_9rem_2.25rem] md:gap-3">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={id("desc")} className={cn(labelClass, "md:sr-only")}>
                        Task description {rows.length > 1 && i + 1}
                      </Label>
                      <Input
                        id={id("desc")}
                        value={row.description}
                        onChange={(e) => setRow(row.key, { description: e.target.value })}
                        placeholder="What did you work on?"
                        maxLength={1000}
                        aria-invalid={!!errors.description}
                        aria-describedby={errors.description ? id("desc-error") : undefined}
                      />
                      {errors.description && (
                        <p id={id("desc-error")} className="text-xs text-red-600">
                          {errors.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={id("status")} className={cn(labelClass, "md:sr-only")}>
                        Status {rows.length > 1 && i + 1}
                      </Label>
                      <Select value={row.status} onValueChange={(v) => setRow(row.key, { status: v as TaskStatus })}>
                        <SelectTrigger id={id("status")} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {TASK_STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={id("hours")} className={cn(labelClass, "md:sr-only")}>
                        Time spent (hrs) {rows.length > 1 && i + 1}
                      </Label>
                      <div className="relative">
                        <Input
                          id={id("hours")}
                          type="number"
                          inputMode="decimal"
                          min={0.25}
                          max={24}
                          step={0.25}
                          value={row.hours}
                          onChange={(e) => setRow(row.key, { hours: e.target.value })}
                          className="pr-10"
                          aria-invalid={!!errors.hours}
                          aria-describedby={errors.hours ? id("hours-error") : undefined}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-neutral-500">
                          hrs
                        </span>
                      </div>
                      {errors.hours && (
                        <p id={id("hours-error")} className="text-xs text-red-600">
                          {errors.hours}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={rows.length === 1}
                      onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                      aria-label={`Remove task ${i + 1}`}
                      className="text-neutral-500 hover:text-red-600 md:mt-0.5"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setRows((list) => [...list, newRow(nextKey)]);
                  setNextKey((k) => k + 1);
                }}
                className="inline-flex w-fit items-center gap-1 text-sm font-medium text-green-700 hover:underline"
              >
                <Plus className="size-4" /> Add task
              </button>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Log Entry"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
