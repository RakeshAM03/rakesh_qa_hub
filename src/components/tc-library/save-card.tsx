"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BookMarked, Info, X } from "lucide-react";
import { toast } from "sonner";

import { YourNameField, useYourName } from "@/components/shared/your-name";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { isPrReference } from "@/lib/tc-library/pr-ref";
import { OUTPUT_MAX_BYTES } from "@/lib/tc-library/schema";
import type { Entry } from "./types";

type SaveCardProps = {
  /** Entry being edited; omitted when creating. */
  entry?: Entry;
  onSaved: (entry: Entry, created: boolean) => void;
  onClose: () => void;
};

const labelClass = "text-xs font-semibold uppercase tracking-wider text-neutral-500";

export function SaveCard({ entry, onSaved, onClose }: SaveCardProps) {
  const initial = { name: entry?.name ?? "", prReference: entry?.prReference ?? "", output: entry?.output ?? "" };
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({ name: false, output: false });
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [nameTaken, setNameTaken] = useState(false);
  const { displayName } = useYourName();

  const dirty =
    form.name !== initial.name || form.prReference !== initial.prReference || form.output !== initial.output;
  const outputTooBig = new TextEncoder().encode(form.output).length > OUTPUT_MAX_BYTES;
  const refInvalid = form.prReference.trim() !== "" && !isPrReference(form.prReference);
  const canSave = form.name.trim() !== "" && form.output.trim() !== "" && !outputTooBig && !refInvalid;

  // Duplicate names are allowed, but hint when one exists.
  const debouncedName = useDebouncedValue(form.name.trim(), 400);
  useEffect(() => {
    if (!debouncedName) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ name: debouncedName, ...(entry ? { excludeId: entry.id } : {}) });
    fetch(`/api/tc-library/name-check?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { exists: boolean }) => setNameTaken(data.exists))
      .catch(() => {});
    return () => controller.abort();
  }, [debouncedName, entry]);

  // Warn before leaving the page with unsaved text.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function requestClose() {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch(entry ? `/api/tc-library/${entry.id}` : "/api/tc-library", {
        method: entry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...(entry ? {} : { createdBy: displayName }) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't save the entry.");
        return;
      }
      onSaved(data.entry, !entry);
    } catch {
      toast.error("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const nameMissing = (submitted || touched.name) && !form.name.trim();
  const outputMissing = (submitted || touched.output) && !form.output.trim();

  return (
    <section
      aria-labelledby="save-card-title"
      className="mb-6 rounded-xl border border-t-4 border-neutral-200 border-t-teal-600 bg-card shadow-xs"
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="save-card-title" className="text-base font-semibold text-neutral-900">
              {entry ? "Edit Test Plan" : "Save Test Plan"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              After Claude completes Step 2, copy its Step 1 analysis + Step 2 approved test plan from the Claude Code
              session and paste it below.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={requestClose} aria-label="Close">
            <X />
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tc-name" className={labelClass}>
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="tc-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              placeholder="e.g. Checkout Flow — Oct 2026"
              maxLength={200}
              aria-invalid={nameMissing}
              aria-describedby="tc-name-hint"
            />
            <div id="tc-name-hint">
              {nameMissing && <p className="text-xs text-red-600">Required</p>}
              {!nameMissing && nameTaken && form.name.trim() && (
                <p className="flex items-center gap-1 text-xs text-amber-700">
                  <Info className="size-3.5" /> An entry with this name already exists. You can still save.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tc-pr" className={labelClass}>
              PR Reference <span className="font-normal normal-case tracking-normal">(optional)</span>
            </Label>
            <Input
              id="tc-pr"
              value={form.prReference}
              onChange={(e) => set("prReference", e.target.value)}
              placeholder="e.g. my-repo #42"
              aria-invalid={refInvalid}
              aria-describedby={refInvalid ? "tc-pr-error" : undefined}
            />
            {refInvalid && (
              <p id="tc-pr-error" className="text-xs text-red-600">
                Use <code>repo #number</code> or a GitHub pull request URL.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tc-output" className={labelClass}>
            Step 1 + Step 2 Output <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="tc-output"
            value={form.output}
            onChange={(e) => set("output", e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, output: true }))}
            placeholder="Paste Claude's Step 1 analysis and Step 2 approved test plan here..."
            className="min-h-64 resize-y font-mono text-xs"
            aria-invalid={outputMissing || outputTooBig}
            aria-describedby="tc-output-hint"
          />
          <div id="tc-output-hint">
            {outputMissing && <p className="text-xs text-red-600">Required</p>}
            {outputTooBig && <p className="text-xs text-red-600">The output is larger than 1 MB. Trim it before saving.</p>}
          </div>
        </div>

        {!entry && <YourNameField id="tc-your-name" />}

        <div className="flex justify-end gap-2">
          {entry && (
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={!canSave || saving}
            className="bg-teal-700 text-teal-50 hover:bg-teal-800"
          >
            <BookMarked /> {saving ? "Saving…" : entry ? "Save changes" : "Save to Library"}
          </Button>
        </div>
      </form>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>The text you entered in this card will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose} className="bg-red-600 text-white hover:bg-red-700">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
