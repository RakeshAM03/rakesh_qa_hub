"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Info } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { useAiEnabled } from "@/components/shared/use-ai-status";
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
import { Button } from "@/components/ui/button";
import { navItems } from "@/config/nav";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { copyText, downloadText } from "@/lib/browser";
import { generateChecklist } from "@/lib/tcgen/checklist";
import { hasApiCases, toCsv, toFeatureFile, toMarkdownTable, toPlaygroundRequests, toPostman, toTcLibraryMarkdown } from "@/lib/tcgen/export";
import { parseAnswer } from "@/lib/tcgen/extract";
import { buildCopyPrompt, effectivePrefix } from "@/lib/tcgen/prompt";
import { inputSchema } from "@/lib/tcgen/schema";
import { defaultInput, type GenerationResult, type Mode, type TcInput, type TestCase } from "@/lib/tcgen/types";
import { CasesView, type Actions } from "./cases-view";
import { ClaudePanel } from "./claude-panel";
import { errorText, HistoryDrawer, NameDialog } from "./history";
import { InputCard } from "./input-card";

const DRAFT_KEY = "qa-hub:test-case-generator:draft";
const PLAYGROUND = navItems.some((i) => i.href === "/api-playground");

function readDraft(raw: string | null): TcInput {
  try {
    const parsed = inputSchema.safeParse(raw ? JSON.parse(raw) : null);
    if (parsed.success) return parsed.data as TcInput;
  } catch {
    // fall through
  }
  return defaultInput();
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "test-cases";
const today = () => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date());

function saveBytes(name: string, bytes: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Saved = { id: string; name: string } | null;

export function TestCaseGenerator() {
  const [draftRaw, setDraftRaw] = useLocalStorage(DRAFT_KEY);
  const input = useMemo(() => readDraft(draftRaw), [draftRaw]);
  const setInput = useCallback((i: TcInput) => setDraftRaw(JSON.stringify(i)), [setDraftRaw]);
  const aiEnabled = useAiEnabled();
  const { displayName } = useYourName();

  const [tab, setTab] = useState<"requirement" | "api" | "upload">("requirement");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [saved, setSaved] = useState<Saved>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [baseCases, setBaseCases] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"save" | "library" | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const aiAbort = useRef<AbortController | null>(null);

  const prefix = effectivePrefix(input);
  const moduleName = input.context.moduleName.trim();
  const snapshot = result ? JSON.stringify([result.testCases, input]) : null;
  /** Unsaved anything (warns before leaving the page). */
  const dirty = result !== null && snapshot !== savedSnapshot;
  /** Cases edited since they were generated / opened / saved (asks before replacing). */
  const edited = result !== null && JSON.stringify(result.testCases) !== baseCases;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function load(next: GenerationResult, m: Mode) {
    setResult(next);
    setMode(m);
    setSaved(null);
    setSavedSnapshot(null);
    setBaseCases(JSON.stringify(next.testCases));
  }

  /** Runs `fn` now, or after confirming when unsaved test cases would be replaced. */
  function guard(fn: () => void) {
    if (edited) setPending(() => fn);
    else fn();
  }

  function runChecklist() {
    const out = generateChecklist(input);
    setWarnings(out.warnings);
    if (!out.result.testCases.length) return toast.error("No template cases for this selection.");
    guard(() => {
      load(out.result, "CHECKLIST");
      toast.success(`Generated ${out.result.testCases.length} checklist cases`);
    });
  }

  async function runAi() {
    const ctrl = new AbortController();
    aiAbort.current = ctrl;
    setBusy("ai");
    try {
      const res = await fetch("/api/test-case-generator/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: ctrl.signal });
      if (!res.ok) return toast.error(await errorText(res, "AI generation failed."));
      const { result: r } = (await res.json()) as { result: GenerationResult };
      guard(() => {
        setWarnings([]);
        load(r, "AI");
        toast.success(`Generated ${r.testCases.length} test cases`);
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("AI generation failed.");
    } finally {
      setBusy(null);
      aiAbort.current = null;
    }
  }

  function importAnswer(answer: string): string | null {
    const r = parseAnswer(answer);
    if (!r.ok) return r.error;
    guard(() => {
      setWarnings(r.source === "markdown" ? ["Imported from a Markdown table — summary, assumptions, questions and API details aren't included."] : []);
      load(r.result, "IMPORTED");
      toast.success(`Imported ${r.result.testCases.length} test cases`);
      setPrompt(null);
    });
    return null;
  }

  const setCases = (testCases: TestCase[]) => result && setResult({ ...result, testCases });
  const base = slug(moduleName || "test-cases");

  const actions: Actions | null = result
    ? {
        excel: async (cases) => {
          setBusy("excel");
          try {
            const { toXlsx } = await import("@/lib/tcgen/excel");
            saveBytes(`${base}-test-cases.xlsx`, await toXlsx(moduleName || "Test cases", result, cases, input.options.priorityScheme), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          } catch {
            toast.error("Couldn't build the Excel file.");
          } finally {
            setBusy(null);
          }
        },
        csv: (cases) => downloadText(`${base}-test-cases.csv`, toCsv(cases, input.options.priorityScheme), "text/csv"),
        markdown: () => void copyText(toMarkdownTable(result.testCases, input.options.priorityScheme), "Markdown table copied"),
        gherkin: () => downloadText(`${base}.feature`, toFeatureFile(result.testCases, moduleName), "text/plain"),
        postman: hasApiCases(result.testCases) ? () => downloadText(`${base}.postman_collection.json`, toPostman(result.testCases, moduleName || "Generated API tests"), "application/json") : undefined,
        playground:
          PLAYGROUND && hasApiCases(result.testCases)
            ? async () => {
                setBusy("playground");
                try {
                  const res = await fetch("/api/api-playground/collections", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: `${moduleName || "Generated"} test cases (${today()})`.slice(0, 200), requests: toPlaygroundRequests(result.testCases) }),
                  });
                  if (!res.ok) return toast.error(await errorText(res, "Couldn't create the collection."));
                  const { collection } = (await res.json()) as { collection: { requests: unknown[] } };
                  toast.success(`Created an API Playground collection with ${collection.requests.length} requests. Set {{baseUrl}} in an environment to run them.`);
                } finally {
                  setBusy(null);
                }
              }
            : undefined,
        library: () => setDialog("library"),
        save: () => setDialog("save"),
      }
    : null;

  async function saveGeneration(name: string): Promise<string | null> {
    if (!result || !mode) return "Nothing to save.";
    const body = {
      name,
      requirement: input.requirement,
      apiInput: input.apiSpec.trim() || input.apiForm.endpoint.trim() ? JSON.stringify({ spec: input.apiSpec, form: input.apiForm }) : null,
      context: input.context,
      options: input.options,
      selectedTypes: input.types,
      mode,
      summary: result.summary || null,
      assumptions: result.assumptions,
      questions: result.questions,
      testCases: result.testCases,
    };
    const update = saved && saved.name === name;
    const res = await fetch(update ? `/api/test-case-generator/generations/${saved!.id}` : "/api/test-case-generator/generations", {
      method: update ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update ? body : { ...body, createdBy: displayName }),
    });
    if (!res.ok) return errorText(res, "Couldn't save.");
    const { generation } = (await res.json()) as { generation: { id: string; name: string } };
    setSaved({ id: generation.id, name: generation.name });
    setSavedSnapshot(snapshot);
    setBaseCases(JSON.stringify(result.testCases));
    toast.success(update ? "Generation updated" : "Generation saved");
    return null;
  }

  async function saveToLibrary(name: string, prReference: string): Promise<string | null> {
    if (!result) return "Nothing to save.";
    const res = await fetch("/api/tc-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, prReference: prReference || null, output: toTcLibraryMarkdown(name, result, result.testCases, input.options.priorityScheme), createdBy: displayName }),
    });
    if (!res.ok) return errorText(res, "Couldn't save to TC Library.");
    toast.success(`Saved “${name}” to TC Library`);
    return null;
  }

  async function openGeneration(id: string) {
    const res = await fetch(`/api/test-case-generator/generations/${id}`);
    if (!res.ok) return void toast.error(await errorText(res, "Couldn't open it."));
    const { generation: g } = await res.json();
    let api = { spec: "", form: defaultInput().apiForm };
    try {
      if (g.apiInput) api = { ...api, ...z.object({ spec: z.string(), form: z.any() }).parse(JSON.parse(g.apiInput)) };
    } catch {
      api.spec = g.apiInput ?? "";
    }
    guard(() => applyGeneration(g, api));
  }

  function applyGeneration(g: { id: string; name: string; requirement: string; context: unknown; selectedTypes: string[]; options: unknown; summary: string | null; assumptions: string[]; questions: string[]; testCases: TestCase[]; mode: Mode }, api: { spec: string; form: unknown }) {
    const nextInput = readDraft(JSON.stringify({ requirement: g.requirement, apiSpec: api.spec, apiForm: api.form, context: g.context, types: g.selectedTypes, options: g.options }));
    setInput(nextInput);
    const r: GenerationResult = { summary: g.summary ?? "", assumptions: g.assumptions, questions: g.questions, testCases: g.testCases };
    setResult(r);
    setMode(g.mode);
    setSaved({ id: g.id, name: g.name });
    setSavedSnapshot(JSON.stringify([r.testCases, nextInput]));
    setBaseCases(JSON.stringify(r.testCases));
    setWarnings([]);
    setHistoryOpen(false);
    toast.success(`Opened “${g.name}”`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
          <History aria-hidden /> History
        </Button>
      </div>

      <InputCard
        input={input}
        onChange={setInput}
        tab={tab}
        onTab={setTab}
        aiEnabled={aiEnabled}
        aiBusy={busy === "ai"}
        onAi={runAi}
        onCancelAi={() => aiAbort.current?.abort()}
        onCopyPrompt={() => {
          const p = buildCopyPrompt(input);
          setPrompt(p);
          void copyText(p, "Prompt copied — paste it into Claude");
        }}
        onChecklist={runChecklist}
      />

      {prompt && <ClaudePanel prompt={prompt} onImport={importAnswer} onClose={() => setPrompt(null)} />}

      {warnings.length > 0 && (
        <div role="status" className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {result && actions ? (
        <CasesView result={result} onCases={setCases} scheme={input.options.priorityScheme} requirement={input.requirement} prefix={prefix} actions={actions} busy={busy} dirty={dirty} savedName={saved?.name ?? null} />
      ) : (
        <section className="rounded-xl border border-dashed border-neutral-300 bg-card p-8 text-center">
          <h2 className="text-base font-semibold">No test cases yet</h2>
          <p className="mt-1 text-sm text-neutral-600">Paste a requirement or an API definition, pick test types, then generate — with AI, a prompt for Claude, or the built-in checklist.</p>
        </section>
      )}

      <NameDialog
        open={dialog === "save"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Save generation"
        description={`Saves the inputs and test cases to History, as ${displayName}. Keep the same name to update it.`}
        initial={saved?.name ?? `${moduleName || "Test cases"} — ${today()}`}
        submitLabel="Save"
        onSubmit={(name) => saveGeneration(name)}
      />
      <NameDialog
        open={dialog === "library"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Save to TC Library"
        description="Creates a TC Library entry with these test cases as Markdown, so they can be reused in PR QA Sessions."
        initial={`${moduleName || "Test cases"} — ${today()}`}
        submitLabel="Save to TC Library"
        second={{ label: "PR reference (optional)", placeholder: "owner/repo #123 or a pull request URL" }}
        onSubmit={saveToLibrary}
      />
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the current test cases?</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved edits. Replacing them can&apos;t be undone — save the generation first if you want to keep them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const fn = pending;
                setPending(null);
                fn?.();
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onOpen={openGeneration}
        currentId={saved?.id ?? null}
        onDeleted={(id) => {
          if (saved?.id === id) {
            setSaved(null);
            setSavedSnapshot(null);
          }
        }}
      />
    </div>
  );
}
