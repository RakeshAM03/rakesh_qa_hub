"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AssertionResult } from "@/lib/api-playground/assertions";
import { cn } from "@/lib/utils";
import { JsonTree } from "./json-tree";

export type PlaygroundResponse = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  timeMs: number;
  sizeBytes: number;
  truncated: boolean;
  finalUrl: string;
  redirects: string[];
};

export function statusTone(status: number) {
  if (status >= 500) return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  if (status >= 400) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  if (status >= 300) return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
  return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
}

type Props = {
  state: { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; response: PlaygroundResponse };
  assertions: { results: AssertionResult[]; passed: number; total: number } | null;
};

export function ResponseViewer({ state, assertions }: Props) {
  const [search, setSearch] = useState("");
  const [raw, setRaw] = useState(false);
  const response = state.kind === "done" ? state.response : null;
  const parsed = useMemo(() => {
    if (!response) return undefined;
    try {
      return { ok: true as const, value: JSON.parse(response.body) as unknown };
    } catch {
      return { ok: false as const };
    }
  }, [response]);
  const pretty = parsed?.ok ? JSON.stringify(parsed.value, null, 2) : (response?.body ?? "");

  if (state.kind === "idle") {
    return <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500">Send a request to see the response here. (Ctrl/⌘ + Enter)</div>;
  }
  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-6 py-10 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Sending…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        {state.message}
      </div>
    );
  }
  const r = state.response;
  const matches = search ? countMatches(pretty, search) : 0;
  return (
    <section aria-label="Response" className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", statusTone(r.status))} data-testid="response-status">
          {r.status} {r.statusText}
        </span>
        <span className="text-neutral-600" data-testid="response-time">
          {r.timeMs} ms
        </span>
        <span className="text-neutral-600">{(r.sizeBytes / 1024).toFixed(1)} KB</span>
        {r.redirects.length > 0 && <span className="text-xs text-neutral-500">after {r.redirects.length} redirect{r.redirects.length === 1 ? "" : "s"}</span>}
        {assertions && assertions.total > 0 && (
          <span className={cn("ml-auto text-xs font-semibold", assertions.passed === assertions.total ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300")}>
            {assertions.passed} of {assertions.total} passed
          </span>
        )}
      </div>
      {r.truncated && <p className="mb-2 text-xs text-amber-700">The response was larger than 2 MB and has been truncated.</p>}
      <Tabs defaultValue={assertions?.total ? "assertions" : "body"}>
        <TabsList>
          <TabsTrigger value="body">Body</TabsTrigger>
          <TabsTrigger value="headers">Headers ({r.headers.length})</TabsTrigger>
          <TabsTrigger value="assertions">Assertions{assertions?.total ? ` (${assertions.passed}/${assertions.total})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="body" className="flex flex-col gap-2 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search in body" aria-label="Search in body" className="h-8 w-56 text-xs" />
            {search && <span className="text-xs text-neutral-500">{matches} match{matches === 1 ? "" : "es"}</span>}
            {parsed?.ok && (
              <button type="button" className="text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300" onClick={() => setRaw(!raw)}>
                {raw ? "Tree view" : "Raw view"}
              </button>
            )}
            <CopyButton text={r.body} label="Copy" message="Response body copied" className="ml-auto" />
          </div>
          <div className="max-h-[28rem] overflow-auto rounded-lg bg-neutral-100 p-3" data-testid="response-body">
            {parsed?.ok && !raw && !search ? (
              <JsonTree data={parsed.value} />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-neutral-800">{search ? highlight(pretty, search) : pretty || "(empty body)"}</pre>
            )}
          </div>
        </TabsContent>
        <TabsContent value="headers" className="pt-3">
          <table className="w-full text-left text-xs">
            <tbody>
              {r.headers.map(([k, v], i) => (
                <tr key={`${k}-${i}`} className="border-b border-neutral-200 last:border-0">
                  <th scope="row" className="w-1/3 py-1.5 pr-3 font-mono font-semibold text-neutral-700">
                    {k}
                  </th>
                  <td className="break-all py-1.5 font-mono text-neutral-800">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>
        <TabsContent value="assertions" className="pt-3">
          {!assertions?.total ? (
            <p className="text-sm text-neutral-500">No assertions — add them in the request&apos;s Assertions tab.</p>
          ) : (
            <ul className="flex flex-col gap-1.5" aria-label="Assertion results">
              {assertions.results.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  {a.pass ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-label="Passed" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-label="Failed" />}
                  <span className="flex-1">
                    <span className="text-neutral-900">{a.message}</span>
                    <span className="block text-xs text-neutral-500">Actual: {a.actual}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function countMatches(text: string, q: string) {
  const t = text.toLowerCase();
  const s = q.toLowerCase();
  let n = 0;
  for (let i = t.indexOf(s); i !== -1 && n < 10_000; i = t.indexOf(s, i + s.length)) n++;
  return n;
}

function highlight(text: string, q: string) {
  const parts: React.ReactNode[] = [];
  const t = text.toLowerCase();
  const s = q.toLowerCase();
  let last = 0;
  for (let i = t.indexOf(s); i !== -1 && parts.length < 2000; i = t.indexOf(s, i + s.length)) {
    parts.push(text.slice(last, i), <mark key={i}>{text.slice(i, i + s.length)}</mark>);
    last = i + s.length;
  }
  parts.push(text.slice(last));
  return parts;
}
