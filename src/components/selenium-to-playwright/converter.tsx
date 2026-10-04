"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  Download,
  History,
  Info,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { strToU8, zipSync } from "fflate";
import { toast } from "sonner";

import { CodeEditor } from "@/components/shared/code-editor";
import { CopyButton } from "@/components/shared/copy-button";
import { useAiEnabled } from "@/components/shared/use-ai-status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { downloadText } from "@/lib/browser";
import { converterCopyPrompt, MAX_AI_INPUT } from "@/lib/converter/ai-prompt";
import { convertJava, MAX_INPUT_BYTES } from "@/lib/converter/convert";
import { SAMPLE_JAVA } from "@/lib/converter/sample";
import { DEFAULT_OPTIONS, type ConvertOptions, type OutputFile, type ReviewNote, type Severity } from "@/lib/converter/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Mode = "rules" | "ai" | "prompt";
type Output = {
  code: string;
  files: OutputFile[];
  notes: ReviewNote[];
  statsLine: string;
  mode: Mode;
};
type HistoryEntry = { id: string; date: string; input: string; options: ConvertOptions; output: Output };

const HISTORY_KEY = "qa-hub:converter:history";
const MAX_HISTORY = 10;

function readHistory(raw: string | null): HistoryEntry[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((e) => e && typeof e.input === "string" && e.output && typeof e.output.code === "string") : [];
  } catch {
    return [];
  }
}

const SEVERITY: Record<Severity, { icon: typeof Info; label: string; className: string }> = {
  attention: { icon: AlertOctagon, label: "Needs attention", className: "text-red-600 dark:text-red-400" },
  warning: { icon: AlertTriangle, label: "Warning", className: "text-amber-600 dark:text-amber-400" },
  info: { icon: Info, label: "Info", className: "text-sky-600 dark:text-sky-400" },
};

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** "42 lines converted · 3 need review · 2 removed (sleeps, driver setup)" */
function statsText(s: { converted: number; review: number; removed: number; removedKinds: string[] }) {
  const parts = [`${s.converted} ${s.converted === 1 ? "line" : "lines"} converted`, `${s.review} need${s.review === 1 ? "s" : ""} review`];
  if (s.removed) parts.push(`${s.removed} removed (${s.removedKinds.join(", ")})`);
  return parts.join(" · ");
}

/** First class name in the Java input, for history labels. */
const firstClass = (java: string) => /\bclass\s+(\w+)/.exec(java)?.[1] ?? "Snippet";

export function Converter() {
  const [java, setJava] = useState("");
  const [options, setOptions] = useState<ConvertOptions>(DEFAULT_OPTIONS);
  const [mode, setMode] = useState<Mode>("rules");
  const [output, setOutput] = useState<Output | null>(null);
  const [tsCode, setTsCode] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState<{ java: number | null; ts: number | null }>({ java: null, ts: null });
  const abortRef = useRef<AbortController | null>(null);
  const aiEnabled = useAiEnabled();
  const [rawHistory, setRawHistory] = useLocalStorage(HISTORY_KEY);
  const history = useMemo(() => readHistory(rawHistory), [rawHistory]);
  const effectiveMode: Mode = mode === "ai" && aiEnabled !== true ? "rules" : mode;

  const set = <K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));

  function remember(out: Output) {
    const entry: HistoryEntry = { id: crypto.randomUUID(), date: new Date().toISOString(), input: java, options, output: out };
    setRawHistory((prev) => JSON.stringify([entry, ...readHistory(prev)].slice(0, MAX_HISTORY)));
  }

  function show(out: Output) {
    setOutput(out);
    setTsCode(out.code);
    setHighlight({ java: null, ts: null });
  }

  async function convert() {
    setError(null);
    setPrompt(null);
    if (!java.trim()) {
      setError("Paste some Selenium Java code first.");
      return;
    }
    if (byteLength(java) > MAX_INPUT_BYTES) {
      setError("That code is larger than 50 KB. Convert one class at a time.");
      return;
    }
    if (effectiveMode === "prompt") {
      setPrompt(converterCopyPrompt(java, options));
      return;
    }
    if (effectiveMode === "rules") {
      const r = convertJava(java, options);
      const out: Output = { code: r.code, files: r.files, notes: r.notes, statsLine: statsText(r.stats), mode: "rules" };
      show(out);
      remember(out);
      return;
    }
    // AI
    if (byteLength(java) > MAX_AI_INPUT) {
      setError("AI conversion accepts up to 50 KB.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch("/api/selenium-to-playwright/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ java, options }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The AI conversion failed.");
      const files: OutputFile[] = data.files.map((f: { name: string; code: string }) => ({
        name: f.name,
        kind: f.name.includes(".page.") ? "pageObject" : "test",
        code: f.code,
      }));
      const code = files.length === 1 ? files[0].code : files.map((f) => `// ===== ${f.name} =====\n${f.code}`).join("\n");
      const notes: ReviewNote[] = data.notes;
      const review = notes.filter((n) => n.severity !== "info").length;
      const out: Output = { code, files, notes, statsLine: `AI conversion · ${review} need${review === 1 ? "s" : ""} review`, mode: "ai" };
      show(out);
      remember(out);
    } catch (e) {
      if ((e as Error).name === "AbortError") toast("Conversion cancelled");
      else toast.error(e instanceof Error ? e.message : "The AI conversion failed.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function download() {
    if (!output) return;
    const files = output.files.length ? output.files : [{ name: "converted.spec.ts", kind: "test" as const, code: tsCode }];
    // Use the edited text when there's a single file.
    if (files.length === 1) {
      downloadText(files[0].name, tsCode, "text/typescript");
      return;
    }
    const zip = zipSync(Object.fromEntries(files.map((f) => [f.name, strToU8(f.code)])));
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "playwright-conversion.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const downloadLabel = output && output.files.length > 1 ? "Download .zip" : `Download ${output?.files[0]?.name ?? ".ts"}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Options bar */}
      <section aria-label="Options" className="rounded-xl border border-t-4 border-neutral-200 border-t-violet-500 bg-card p-4 shadow-xs sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <OptionSelect
            label="Input type"
            value={options.inputType}
            onChange={(v) => set("inputType", v as ConvertOptions["inputType"])}
            items={[
              ["auto", "Auto-detect"],
              ["test", "Test class"],
              ["pageObject", "Page Object"],
            ]}
          />
          <OptionSelect
            label="Test framework"
            value={options.framework}
            onChange={(v) => set("framework", v as ConvertOptions["framework"])}
            items={[
              ["auto", "Auto-detect"],
              ["testng", "TestNG"],
              ["junit5", "JUnit 5"],
              ["junit4", "JUnit 4"],
            ]}
          />
          <OptionSelect
            label="Output style"
            value={options.outputStyle}
            onChange={(v) => set("outputStyle", v as ConvertOptions["outputStyle"])}
            items={[
              ["auto", "Match input"],
              ["test", "Playwright Test"],
              ["pageObject", "Page Object class"],
            ]}
          />
          <OptionSelect
            label="Locators"
            value={options.locatorPreference}
            onChange={(v) => set("locatorPreference", v as ConvertOptions["locatorPreference"])}
            items={[
              ["keep", "Keep original selectors"],
              ["semantic", "Prefer getByRole / getByTestId"],
            ]}
          />
          <OptionSelect
            label="Mode"
            value={effectiveMode}
            onChange={(v) => setMode(v as Mode)}
            items={[
              ["rules", "Rule-based"],
              ...(aiEnabled ? ([["ai", "AI"]] as [string, string][]) : []),
              ["prompt", "Build prompt for Claude"],
            ]}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={convert} disabled={loading} className="bg-violet-600 text-white hover:bg-violet-700">
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRightLeft className="size-4" aria-hidden />}
            Convert
          </Button>
          {loading && (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>
              <X className="size-4" aria-hidden /> Cancel
            </Button>
          )}
          <Button variant="outline" onClick={() => setJava(SAMPLE_JAVA)}>
            Load sample
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setJava("");
              setOutput(null);
              setTsCode("");
              setPrompt(null);
              setError(null);
            }}
          >
            <Trash2 className="size-4" aria-hidden /> Clear
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <History className="size-4" aria-hidden /> History
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Last {MAX_HISTORY} conversions (this browser)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {history.length === 0 ? (
                <p className="px-2 py-3 text-sm text-neutral-500">No conversions yet.</p>
              ) : (
                history.map((h) => (
                  <DropdownMenuItem
                    key={h.id}
                    onSelect={() => {
                      setJava(h.input);
                      setOptions({ ...DEFAULT_OPTIONS, ...h.options });
                      show(h.output);
                    }}
                  >
                    <span className="flex-1 truncate">{firstClass(h.input)}</span>
                    <span className="text-xs text-neutral-500">{formatDateTime(h.date)}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-2">
            <Checkbox id="keep-sleeps" checked={options.keepSleeps} onCheckedChange={(c) => set("keepSleeps", c === true)} />
            <Label htmlFor="keep-sleeps" className="text-sm">
              Keep sleeps (as waitForTimeout)
            </Label>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}
      </section>

      {/* Editors */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="java-title" className="min-w-0">
          <h2 id="java-title" className="mb-2 text-sm font-semibold text-neutral-800">
            Selenium Java
          </h2>
          <CodeEditor
            value={java}
            onChange={setJava}
            language="java"
            ariaLabel="Selenium Java code"
            placeholder="Paste a TestNG/JUnit test class or a Page Object…"
            highlightLine={highlight.java}
            minHeight="26rem"
            maxHeight="40rem"
          />
        </section>
        <section aria-labelledby="ts-title" className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 id="ts-title" className="text-sm font-semibold text-neutral-800">
              Playwright TypeScript
            </h2>
            {output && (
              <div className="flex gap-2">
                <CopyButton text={tsCode} label="Copy" message="TypeScript copied" />
                <Button size="sm" variant="outline" onClick={download}>
                  <Download className="size-4" aria-hidden /> {downloadLabel}
                </Button>
              </div>
            )}
          </div>
          {prompt !== null ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-neutral-600">Paste this prompt into Claude to convert the code there:</p>
              <CodeEditor value={prompt} language="text" ariaLabel="Prompt for Claude" readOnly minHeight="22rem" maxHeight="40rem" />
              <CopyButton text={prompt} label="Copy prompt" message="Prompt copied — paste it into Claude" className="self-start" />
            </div>
          ) : (
            <CodeEditor
              value={tsCode}
              onChange={setTsCode}
              language="typescript"
              ariaLabel="Playwright TypeScript code"
              placeholder="Converted code appears here."
              highlightLine={highlight.ts}
              minHeight="26rem"
              maxHeight="40rem"
            />
          )}
          {output && prompt === null && (
            <p className="mt-2 text-xs text-neutral-500" data-testid="convert-stats">
              {output.statsLine}
            </p>
          )}
        </section>
      </div>

      {/* Review notes */}
      {output && prompt === null && (
        <section aria-labelledby="review-title" className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs sm:p-5">
          <h2 id="review-title" className="mb-3 text-base font-semibold text-neutral-900">
            Review notes {output.notes.length > 0 && <span className="text-neutral-500">({output.notes.length})</span>}
          </h2>
          {output.notes.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing flagged — still give the output a quick read before running it.</p>
          ) : (
            <ul className="flex flex-col gap-1" aria-label="Review notes">
              {output.notes.map((n, i) => {
                const sev = SEVERITY[n.severity];
                const Icon = sev.icon;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={!n.line}
                      onClick={() => setHighlight({ java: n.line, ts: n.outLine ?? null })}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-100 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <Icon className={cn("mt-0.5 size-4 shrink-0", sev.className)} aria-label={sev.label} />
                      <span className="text-neutral-800">{n.message}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <SetupChecklist />
    </div>
  );
}

function OptionSelect({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: [string, string][];
}) {
  const id = `opt-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {items.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SetupChecklist() {
  return (
    <Collapsible className="rounded-xl border border-neutral-200 bg-card shadow-xs">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-neutral-900 sm:px-5">
        Setup checklist
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 text-sm text-neutral-700 sm:px-5">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>
            Create a Playwright project: <code className="rounded bg-neutral-100 px-1">npm init playwright@latest</code>
          </li>
          <li>
            Put specs in <code className="rounded bg-neutral-100 px-1">tests/</code> (e.g. <code className="rounded bg-neutral-100 px-1">tests/LoginTest.spec.ts</code>) and page objects
            next to them or in <code className="rounded bg-neutral-100 px-1">pages/</code> — fix the import paths to match.
          </li>
          <li>
            Run them: <code className="rounded bg-neutral-100 px-1">npx playwright test</code> (add <code className="rounded bg-neutral-100 px-1">--ui</code> to watch).
          </li>
          <li>
            Set your app URL once in <code className="rounded bg-neutral-100 px-1">playwright.config.ts</code> and use relative paths in{" "}
            <code className="rounded bg-neutral-100 px-1">page.goto(&apos;/login&apos;)</code>:
            <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-100 p-3 font-mono text-xs">{`export default defineConfig({
  use: { baseURL: 'https://staging.example.com' },
});`}</pre>
          </li>
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
