"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, GitBranch, Loader2, Search, Upload, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { parseInputs, parsePlainText, MAX_TOTAL_BYTES, MAX_FAILURES } from "@/lib/failure-analyzer/parsers";
import { SAMPLE_LOG } from "@/lib/failure-analyzer/sample";
import type { ParseResult } from "@/lib/failure-analyzer/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Suite = { id: string; name: string };
type Run = { id: number; number: number; conclusion: string | null; startedAt: string; branch: string | null };

const triggerClass =
  "h-11 flex-1 gap-2 rounded-none border-0 border-b-2 border-transparent text-neutral-500 shadow-none data-[state=active]:border-rose-500 data-[state=active]:bg-rose-50 data-[state=active]:text-rose-700 data-[state=active]:shadow-none dark:data-[state=active]:bg-rose-950/40 dark:data-[state=active]:text-rose-200";

export function InputCard({ onParsed }: { onParsed: (result: ParseResult, source: string) => void }) {
  const [tab, setTab] = useState("paste");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function finish(result: ParseResult, source: string) {
    for (const w of result.warnings) toast.warning(w);
    if (!result.failures.length) {
      setError(
        result.passed || result.skipped
          ? `No failures found (${result.passed ?? 0} passed, ${result.skipped ?? 0} skipped).`
          : "No failures found. Paste stack traces or upload a TestNG, JUnit or Playwright report.",
      );
      return;
    }
    setError(null);
    onParsed(result, source);
  }

  async function analyze() {
    setError(null);
    try {
      if (tab === "paste") {
        if (!text.trim()) return setError("Paste some failure output first.");
        finish(parseInputs([{ name: "pasted.txt", content: text }]), "Pasted logs");
      } else if (tab === "upload") {
        if (!files.length) return setError("Choose one or more report files first.");
        const total = files.reduce((n, f) => n + f.size, 0);
        if (total > MAX_TOTAL_BYTES) return setError("Files are larger than 5 MB in total.");
        setBusy(true);
        const inputs = await Promise.all(files.map(async (f) => ({ name: f.name, content: await f.text() })));
        finish(parseInputs(inputs), files.length === 1 ? files[0].name : `${files.length} files`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the input.");
    } finally {
      setBusy(false);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const accepted = Array.from(list).filter((f) => /\.(xml|json|txt|log)$/i.test(f.name));
    if (accepted.length < list.length) toast.warning("Only .xml, .json, .txt and .log files are supported.");
    setFiles((prev) => [...prev, ...accepted.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
  }

  return (
    <section aria-label="Failures input" className="overflow-hidden rounded-xl border border-t-4 border-neutral-200 border-t-rose-500 bg-card shadow-xs">
      <Tabs value={tab} onValueChange={(v) => setTab(v)} className="gap-0">
        <TabsList className="h-auto w-full rounded-none border-b border-neutral-200 bg-card p-0">
          <TabsTrigger value="paste" className={triggerClass}>
            <ClipboardPaste /> Paste logs
          </TabsTrigger>
          <TabsTrigger value="upload" className={triggerClass}>
            <Upload /> Upload report
          </TabsTrigger>
          <TabsTrigger value="ci" className={triggerClass}>
            <GitBranch /> From CI
          </TabsTrigger>
        </TabsList>
        <TabsContent value="paste" className="flex flex-col gap-2 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <Label htmlFor="fa-paste">Stack traces or console output</Label>
            <button type="button" className="text-sm font-medium text-rose-700 hover:underline dark:text-rose-300" onClick={() => setText(SAMPLE_LOG)}>
              Load sample
            </button>
          </div>
          <Textarea
            id="fa-paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste one or more stack traces, TestNG/Maven console output, or Playwright list-reporter output…"
            className="min-h-56 font-mono text-xs"
          />
        </TabsContent>
        <TabsContent value="upload" className="flex flex-col gap-3 p-4 sm:p-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-600",
              dragging && "border-rose-400 bg-rose-50 dark:bg-rose-950/30",
            )}
          >
            <Upload className="size-6 text-neutral-400" aria-hidden />
            <p>
              Drop TestNG <code>testng-results.xml</code>, JUnit/Surefire <code>TEST-*.xml</code>, Playwright <code>results.json</code>, or
              .txt/.log files here
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              Choose files
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".xml,.json,.txt,.log"
              className="sr-only"
              data-testid="fa-file-input"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {files.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm" aria-label="Selected files">
              {files.map((f) => (
                <li key={`${f.name}-${f.size}`} className="flex items-center justify-between rounded-md bg-neutral-100 px-3 py-1.5">
                  <span className="truncate">
                    {f.name} <span className="text-neutral-500">({Math.ceil(f.size / 1024)} KB)</span>
                  </span>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((x) => x !== f))}>
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="ci" className="p-4 sm:p-5">
          <FromCi onParsed={finish} active={tab === "ci"} />
        </TabsContent>
      </Tabs>
      {tab !== "ci" && (
        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 px-4 py-3 sm:px-5">
          <Button onClick={analyze} disabled={busy} className="bg-rose-600 text-white hover:bg-rose-700">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />} Analyze
          </Button>
          <span className="text-xs text-neutral-500">
            Up to {MAX_TOTAL_BYTES / 1024 / 1024} MB and {MAX_FAILURES.toLocaleString()} failures. Parsed in your browser.
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="px-4 pb-4 text-sm text-red-600 sm:px-5">
          {error}
        </p>
      )}
    </section>
  );
}

function FromCi({ onParsed, active }: { onParsed: (r: ParseResult, source: string) => void; active: boolean }) {
  const [state, setState] = useState<{ loading: boolean; connected: boolean; suites: Suite[] } | null>(null);
  const [suiteId, setSuiteId] = useState("");
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [runId, setRunId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!active || state) return;
    let alive = true;
    fetch("/api/ci/suites")
      .then((r) => r.json())
      .then((d: { suites: Suite[]; githubConnected: boolean }) => alive && setState({ loading: false, connected: d.githubConnected, suites: d.suites }))
      .catch(() => alive && setState({ loading: false, connected: false, suites: [] }));
    return () => {
      alive = false;
    };
  }, [active, state]);

  useEffect(() => {
    if (!suiteId) return;
    let alive = true;
    fetch(`/api/ci/suites/${suiteId}/runs`)
      .then((r) => r.json())
      .then((d: { runs: Run[] }) => alive && setRuns(d.runs.filter((r) => r.conclusion === "failure")))
      .catch(() => alive && setRuns([]));
    return () => {
      alive = false;
    };
  }, [suiteId]);

  async function load() {
    setBusy(true);
    try {
      const res = await fetch(`/api/failure-analyzer/ci-run?${new URLSearchParams({ suiteId, runId })}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load the run's logs.");
      const logs = data.logs as { name: string; log: string }[];
      if (!logs.length) throw new Error("This run has no failed jobs with logs.");
      const merged: ParseResult = { failures: [], sources: ["ci"], warnings: [] };
      for (const l of logs) merged.failures.push(...parsePlainText(l.log, "ci").failures.map((f) => ({ ...f, suite: l.name })));
      const run = runs?.find((r) => String(r.id) === runId);
      onParsed(merged, `CI run #${run?.number ?? runId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load the run's logs.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <p className="text-sm text-neutral-500">Loading CI suites…</p>;
  if (!state.connected) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-600">
        Connect GitHub in <Link href="/ci" className="font-medium underline">CI Reports</Link> to use this (set <code>GITHUB_TOKEN</code>). You can still paste logs
        or upload reports.
      </p>
    );
  }
  if (!state.suites.length) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-600">
        No CI suites yet — add one in <Link href="/ci" className="font-medium underline">CI Reports</Link> first.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="fa-suite">CI suite</Label>
        <Select
          value={suiteId}
          onValueChange={(v) => {
            setSuiteId(v);
            setRuns(null);
            setRunId("");
          }}
        >
          <SelectTrigger id="fa-suite" className="w-full">
            <SelectValue placeholder="Pick a suite" />
          </SelectTrigger>
          <SelectContent position="popper">
            {state.suites.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="fa-run">Failed run</Label>
        <Select value={runId} onValueChange={setRunId} disabled={!runs?.length}>
          <SelectTrigger id="fa-run" className="w-full">
            <SelectValue placeholder={!suiteId ? "Pick a suite first" : runs === null ? "Loading…" : runs.length ? "Pick a run" : "No failed runs"} />
          </SelectTrigger>
          <SelectContent position="popper">
            {runs?.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                #{r.number} · {r.branch ?? "—"} · {formatDateTime(r.startedAt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={load} disabled={!runId || busy} className="bg-rose-600 text-white hover:bg-rose-700">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />} Load &amp; analyze
      </Button>
    </div>
  );
}
