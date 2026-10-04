"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

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
import { useLocalStorage } from "@/hooks/use-local-storage";
import { FAKE_ID_NOTE, FIELD_TYPES } from "@/lib/testdata/field-types";
import { FORMAT_INFO } from "@/lib/testdata/export";
import { defaultOptions, PRESETS } from "@/lib/testdata/presets";
import { fieldsSchema, withDefaultOptions } from "@/lib/testdata/schema";
import { appendFields } from "@/lib/testdata/schema-ops";
import type { Field, GenOptions } from "@/lib/testdata/types";
import { validateSchema } from "@/lib/testdata/validate";
import { cn } from "@/lib/utils";
import { OptionsCard } from "./options-card";
import { MAX_COPY_BYTES, Preview } from "./preview";
import { SchemaBuilder } from "./schema-builder";
import { SchemaToolbar, type Current, type SavedSchema } from "./saved-schemas";
import { saveBytes, useGenerator } from "./use-generator";

const DRAFT_KEY = "qa-hub:test-data-generator:draft";

type Draft = { fields: Field[]; options: GenOptions; current: Current; baseName: string };

const draftSchema = z.object({
  fields: fieldsSchema,
  options: z.unknown(),
  current: z.object({ id: z.string(), name: z.string() }).nullable().catch(null),
  baseName: z.string().catch("test-data"),
});

function readDraft(raw: string | null): Draft {
  try {
    const parsed = draftSchema.safeParse(raw ? JSON.parse(raw) : null);
    if (parsed.success) return { ...parsed.data, options: withDefaultOptions(parsed.data.options) };
  } catch {
    // fall through to an empty draft
  }
  return { fields: [], options: defaultOptions(), current: null, baseName: "test-data" };
}

/** What a run depends on (format settings don't need a new run). */
const runKey = (fields: Field[], o: GenOptions) => JSON.stringify([fields, o.rows, o.locale, o.seed, o.refDate, o.dataMode, o.edgeColumns]);

const hasFakeIds = (fields: Field[]): boolean => fields.some((f) => FIELD_TYPES[f.type]?.group === "India formats" || f.type === "creditCard" || (f.children ? hasFakeIds(f.children) : false));

export function TestDataGenerator() {
  const [draftRaw, setDraftRaw] = useLocalStorage(DRAFT_KEY);
  const draft = useMemo(() => readDraft(draftRaw), [draftRaw]);
  const { fields, options, current, baseName } = draft;
  const setDraft = useCallback((patch: Partial<Draft>) => setDraftRaw(JSON.stringify({ ...readDraft(draftRaw), ...patch })), [draftRaw, setDraftRaw]);

  const [schemas, setSchemas] = useState<SavedSchema[] | null>(null);
  const [pendingPreset, setPendingPreset] = useState<{ label: string; fields: Field[] } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const gen = useGenerator();

  const reload = useCallback(
    () =>
      fetch("/api/test-data-generator/schemas")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { schemas: SavedSchema[] }) => setSchemas(d.schemas))
        .catch(() => {
          setSchemas([]);
          toast.error("Couldn't load saved schemas.");
        }),
    [],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const errors = useMemo(() => validateSchema(fields, options), [fields, options]);
  const name = current?.name ?? baseName;

  function applyPreset(label: string, presetFields: Field[], mode: "replace" | "append") {
    setDraft(mode === "replace" ? { fields: presetFields, current: null, baseName: label } : { fields: appendFields(fields, presetFields) });
    setShowErrors(false);
    toast.success(mode === "replace" ? `Loaded the ${label} preset` : `Added the ${label} fields`);
  }

  function pickPreset(label: string, presetFields: Field[]) {
    if (!fields.length) applyPreset(label, presetFields, "replace");
    else setPendingPreset({ label, fields: presetFields });
  }

  async function run() {
    if (errors.length) {
      setShowErrors(true);
      toast.error("Fix the schema errors first.");
      return;
    }
    const key = runKey(fields, options);
    const res = await gen.generate(fields, options, name);
    if (res) {
      setLastRun(key);
      toast.success(`Generated ${res.stats.rows.toLocaleString("en-IN")} rows`);
    }
  }

  async function download(format: GenOptions["format"] | "zip") {
    setBusy(format === "zip" ? "zip" : "download");
    try {
      saveBytes(await gen.file(format, options, name));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the file.");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    setBusy("copy");
    try {
      const f = await gen.file(options.format, options, name);
      if (f.bytes.byteLength > MAX_COPY_BYTES) return toast.error("That's over 5 MB — download it instead.");
      await navigator.clipboard.writeText(new TextDecoder().decode(f.bytes));
      toast.success(`Copied ${FORMAT_INFO[options.format].label}`);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    } finally {
      setBusy(null);
    }
  }

  const userPresets = (schemas ?? []).filter((s) => s.isPreset);
  const stale = gen.result !== null && lastRun !== null && lastRun !== runKey(fields, options);

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Presets" className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-teal-700" aria-hidden /> Presets
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.id} type="button" variant="outline" size="sm" className="rounded-full" onClick={() => pickPreset(p.label, p.fields())}>
              {p.label}
            </Button>
          ))}
          {userPresets.map((s) => (
            <Button
              key={s.id}
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-teal-300 text-teal-800"
              onClick={() => pickPreset(s.name, s.fields)}
              title={`Saved preset by ${s.createdBy || "Anonymous"}`}
            >
              {s.name}
            </Button>
          ))}
        </div>
      </section>

      <SchemaToolbar
        schemas={schemas}
        reload={reload}
        fields={fields}
        options={options}
        current={current}
        name={name}
        onLoad={(s) => {
          setDraft({ fields: s.fields, options: s.options, current: s.current, baseName: s.current?.name ?? baseName });
          setShowErrors(false);
        }}
        onSaved={(c) => setDraft({ current: c })}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-labelledby="tdg-schema" className="rounded-xl border border-neutral-200 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="tdg-schema" className="text-base font-semibold">
              Schema <span className="font-normal text-neutral-600">({fields.length} fields)</span>
            </h2>
            {fields.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ fields: [], current: null, baseName: "test-data" })}>
                Clear
              </Button>
            )}
          </div>
          <SchemaBuilder fields={fields} onChange={(f) => setDraft({ fields: f })} errors={errors} />
          {hasFakeIds(fields) && (
            <p className="mt-3 flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {FAKE_ID_NOTE} Card numbers are test numbers only.
            </p>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <OptionsCard
            options={options}
            onChange={(o) => setDraft({ options: o })}
            status={gen.status}
            onGenerate={run}
            onCancel={() => {
              gen.cancel();
              toast("Generation cancelled");
            }}
            disabled={!fields.length}
          />
          {(showErrors && errors.length > 0) || gen.status.kind === "error" ? (
            <div role="alert" className={cn("rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800")}>
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="size-4" aria-hidden /> {gen.status.kind === "error" ? "Generation failed" : "Fix these before generating"}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {gen.status.kind === "error" ? <li>{gen.status.message}</li> : errors.slice(0, 8).map((e) => <li key={e.message}>{e.message}</li>)}
                {gen.status.kind !== "error" && errors.length > 8 && <li>…and {errors.length - 8} more</li>}
              </ul>
            </div>
          ) : null}
          <Preview
            result={gen.result}
            fields={fields}
            format={options.format}
            busy={busy}
            stale={stale}
            onDownload={() => download(options.format)}
            onCopy={copy}
            onRegenerate={() => {
              if (options.seed !== null) toast("A fixed seed gives the same data — clear it for new values.");
              void run();
            }}
            onZip={() => download("zip")}
          />
        </div>
      </div>

      <AlertDialog open={pendingPreset !== null} onOpenChange={(o) => !o && setPendingPreset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Load the {pendingPreset?.label} preset</AlertDialogTitle>
            <AlertDialogDescription>Replace your current {fields.length} fields, or add the preset&apos;s fields after them?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (pendingPreset) applyPreset(pendingPreset.label, pendingPreset.fields, "append");
                setPendingPreset(null);
              }}
            >
              Append
            </Button>
            <AlertDialogAction
              onClick={() => {
                if (pendingPreset) applyPreset(pendingPreset.label, pendingPreset.fields, "replace");
                setPendingPreset(null);
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
