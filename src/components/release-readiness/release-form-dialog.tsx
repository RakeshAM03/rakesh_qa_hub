"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { useYourName } from "@/components/shared/your-name";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "./shared";

export type ReleaseFormValues = {
  name: string;
  version: string;
  targetDate: string | null;
  owner: string;
  description: string;
  templateId: string | null;
  linkedCiSuiteIds: string[];
  linkedFeaturePageIds: string[];
  linkedRepos: string[];
};

const EMPTY: ReleaseFormValues = { name: "", version: "", targetDate: null, owner: "", description: "", templateId: null, linkedCiSuiteIds: [], linkedFeaturePageIds: [], linkedRepos: [] };

type Options = { suites: { value: string; label: string }[]; features: { value: string; label: string }[]; repos: { value: string; label: string }[]; templates: { id: string; name: string }[] };

/** Lists from the existing modules' APIs (CI Reports, Bug Tracker, AI PR Review) and templates. */
function useLinkOptions(open: boolean) {
  const [opts, setOpts] = useState<Options | null>(null);
  useEffect(() => {
    if (!open || opts) return;
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const get = (url: string): Promise<any> => fetch(url).then((r) => (r.ok ? r.json() : {}));
    Promise.all([get("/api/ci/suites"), get("/api/bug-tracker/features"), get("/api/ai-pr-review/flags/summary"), get("/api/release-readiness/templates")]).then(([ci, bt, flags, tpl]) => {
      if (!alive) return;
      setOpts({
        suites: (ci.suites ?? []).map((s: { id: string; name: string }) => ({ value: s.id, label: s.name })),
        features: (bt.features ?? []).map((f: { id: string; name: string }) => ({ value: f.id, label: f.name })),
        repos: (flags.repos ?? []).map((r: string) => ({ value: r, label: r })),
        templates: tpl.templates ?? [],
      });
    });
    return () => {
      alive = false;
    };
  }, [open, opts]);
  return opts;
}

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Editing an existing release (no template choice). */
  initial?: Partial<ReleaseFormValues>;
  title: string;
  submitLabel: string;
  onSubmit: (values: ReleaseFormValues & { actor: string }) => Promise<void>;
};

export function ReleaseFormDialog({ open, onOpenChange, initial, title, submitLabel, onSubmit }: Props) {
  const [v, setV] = useState<ReleaseFormValues>(EMPTY);
  const [wasOpen, setWasOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const opts = useLinkOptions(open);
  const { displayName } = useYourName();
  const editing = !!initial;
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setV({ ...EMPTY, ...initial });
      setSubmitted(false);
    }
  }
  const standard = opts?.templates.find((t) => t.name === "Standard release") ?? opts?.templates[0];
  const templateId = v.templateId ?? standard?.id ?? null;
  const set = <K extends keyof ReleaseFormValues>(k: K, value: ReleaseFormValues[K]) => setV((x) => ({ ...x, [k]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!v.name.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ ...v, templateId, actor: displayName });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the release.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{editing ? "Change the release details and linked data." : "Start from a checklist template; you can add or remove gates later."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rr-name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input id="rr-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Checkout revamp" maxLength={200} aria-invalid={submitted && !v.name.trim()} />
              {submitted && !v.name.trim() && <p className="text-xs text-red-600">Required</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rr-version">Version</Label>
              <Input id="rr-version" value={v.version} onChange={(e) => set("version", e.target.value)} placeholder="v2.4.0" maxLength={50} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rr-target">Target date</Label>
              <div className="flex gap-1">
                <DatePicker id="rr-target" value={v.targetDate ?? ""} onChange={(d) => set("targetDate", d)} allowFuture className="flex-1" />
                {v.targetDate && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("targetDate", null)}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rr-owner">QA owner</Label>
              <Input id="rr-owner" value={v.owner} onChange={(e) => set("owner", e.target.value)} maxLength={100} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rr-desc">Description / scope</Label>
            <Textarea id="rr-desc" value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={5000} />
          </div>
          {!editing && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rr-template">Template</Label>
              <Select value={templateId ?? ""} onValueChange={(id) => set("templateId", id)}>
                <SelectTrigger id="rr-template" className="w-full">
                  <SelectValue placeholder={opts ? "No templates — the built-in Standard release is used" : "Loading…"} />
                </SelectTrigger>
                <SelectContent position="popper">
                  {opts?.templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <fieldset className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Linked data (optional — powers the auto gates)</legend>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">CI suites</span>
              <MultiSelect label="CI suites" options={opts?.suites ?? []} value={v.linkedCiSuiteIds} onChange={(x) => set("linkedCiSuiteIds", x)} empty="No CI suites yet — add them in CI Reports." />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Bug Tracker feature pages</span>
              <MultiSelect label="Feature pages" options={opts?.features ?? []} value={v.linkedFeaturePageIds} onChange={(x) => set("linkedFeaturePageIds", x)} empty="No feature pages yet — add them in Bug Tracker." />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">AI PR Review repos</span>
              <MultiSelect label="Repos" options={opts?.repos ?? []} value={v.linkedRepos} onChange={(x) => set("linkedRepos", x)} empty="No repos yet — they appear once flags are logged in AI PR Review." />
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-green-600 text-white hover:bg-green-700">
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
