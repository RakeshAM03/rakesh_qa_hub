"use client";

import { useId, useState } from "react";
import { Archive, Copy, Download, RefreshCw, Table2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cellText, FORMAT_INFO } from "@/lib/testdata/export";
import { EDGE_FLAG, EDGE_TYPE } from "@/lib/testdata/generate";
import { typeLabel } from "@/lib/testdata/field-types";
import type { Field, OutputFormat } from "@/lib/testdata/types";
import { cn } from "@/lib/utils";
import type { GeneratedResult } from "./use-generator";

/** Above this the clipboard copy is turned off (download instead). */
export const MAX_COPY_BYTES = 5 * 1024 * 1024;

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Props = {
  result: GeneratedResult | null;
  fields: Field[];
  format: OutputFormat;
  busy: string | null;
  onDownload: () => void;
  onCopy: () => void;
  onRegenerate: () => void;
  onZip: () => void;
  stale: boolean;
};

export function Preview({ result, fields, format, busy, onDownload, onCopy, onRegenerate, onZip, stale }: Props) {
  const id = useId();
  const [tab, setTab] = useState("table");
  const typeOf = new Map(fields.map((f) => [f.name, f.type]));

  if (!result) {
    return (
      <section aria-labelledby={`${id}-title`} className="rounded-xl border border-dashed border-neutral-300 bg-card p-8 text-center">
        <Table2 className="mx-auto size-8 text-neutral-500" aria-hidden />
        <h2 id={`${id}-title`} className="mt-2 text-base font-semibold">
          No data yet
        </h2>
        <p className="mt-1 text-sm text-neutral-600">Build a schema (or pick a preset), then press Generate. The first 100 rows show up here.</p>
      </section>
    );
  }

  const s = result.stats;
  const textFormat = FORMAT_INFO[format].text;
  const sameFormat = format === result.options.format;
  const copyDisabled = !textFormat || (sameFormat && s.bytes > MAX_COPY_BYTES) || busy !== null;
  const copyHint = !textFormat ? "Excel files can't be copied — download instead." : sameFormat && s.bytes > MAX_COPY_BYTES ? "Over 5 MB — download instead." : undefined;

  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-3 rounded-xl border border-neutral-200 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-base font-semibold">
          Preview
        </h2>
        <p className="text-sm text-neutral-700" data-testid="stats">
          {s.rows.toLocaleString("en-IN")} rows · {s.fields} fields · {formatBytes(s.bytes)} · {s.edgeCount.toLocaleString("en-IN")} edge-case values · generated in{" "}
          {(s.ms / 1000).toFixed(1)} s · seed {s.seed}
        </p>
      </div>
      {stale && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">The schema or data options changed since this run — press Regenerate to update the data.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onDownload} disabled={busy !== null} className="bg-teal-700 text-teal-50 hover:bg-teal-800">
          <Download aria-hidden /> {busy === "download" ? "Preparing…" : `Download ${FORMAT_INFO[format].label}`}
        </Button>
        <Button type="button" variant="outline" onClick={onCopy} disabled={copyDisabled} title={copyHint}>
          <Copy aria-hidden /> Copy
        </Button>
        <Button type="button" variant="outline" onClick={onRegenerate} disabled={busy !== null}>
          <RefreshCw aria-hidden /> Regenerate
        </Button>
        <Button type="button" variant="outline" onClick={onZip} disabled={busy !== null}>
          <Archive aria-hidden /> {busy === "zip" ? "Zipping…" : "Download all formats (.zip)"}
        </Button>
      </div>
      {copyHint && <p className="-mt-1 text-xs text-neutral-600">{copyHint}</p>}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>
        <TabsContent value="table">
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-neutral-200">
            <table className="w-full border-collapse text-xs" aria-label="Generated data preview">
              <thead className="sticky top-0 z-10 bg-neutral-50">
                <tr>
                  <th scope="col" className="border-b border-neutral-200 px-2 py-1.5 text-right font-medium text-neutral-600">
                    #
                  </th>
                  {result.columns.map((c) => (
                    <th key={c} scope="col" className="border-b border-neutral-200 px-2 py-1.5 text-left font-medium whitespace-nowrap">
                      <span className="font-mono">{c}</span>
                      {typeOf.get(c) && (
                        <Badge variant="outline" className="ml-1.5 border-teal-200 px-1.5 py-0 text-[10px] font-normal text-teal-800">
                          {typeLabel(typeOf.get(c)!)}
                        </Badge>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row, i) => {
                  const edges = result.previewEdges[i];
                  return (
                    <tr key={i} className={cn("border-b border-neutral-100 last:border-0", edges && "bg-amber-50")} data-edge={edges ? "true" : undefined}>
                      <td className="px-2 py-1 text-right text-neutral-600 tabular-nums">{i + 1}</td>
                      {result.columns.map((c) => {
                        const edge = edges && Object.entries(edges).find(([k]) => k === c || k.startsWith(`${c}.`) || k.startsWith(`${c}[`));
                        const v = row[c];
                        const text = cellText(v);
                        return (
                          <td
                            key={c}
                            title={edge ? `Edge case: ${edge[1]}` : undefined}
                            className={cn(
                              "max-w-64 truncate px-2 py-1 font-mono whitespace-nowrap",
                              edge && "bg-amber-100 text-amber-900",
                              v === null && "text-neutral-600 italic",
                              (c === EDGE_FLAG || c === EDGE_TYPE) && "text-neutral-700",
                            )}
                          >
                            {v === null ? "null" : text === "" ? <span className="text-neutral-700 italic">(empty)</span> : visible(text)}
                            {edge && <span className="sr-only"> (edge case: {edge[1]})</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {s.rows > result.preview.length && <p className="mt-1.5 text-xs text-neutral-600">Showing the first {result.preview.length} of {s.rows.toLocaleString("en-IN")} rows.</p>}
        </TabsContent>
        <TabsContent value="raw">
          {result.rawFormat !== result.options.format && <p className="mb-1.5 text-xs text-neutral-600">Excel is a binary format, so this shows the same rows as CSV.</p>}
          <pre className="max-h-[32rem] overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs whitespace-pre" aria-label="Raw output (first 200 lines)">
            {result.raw}
          </pre>
          <p className="mt-1.5 text-xs text-neutral-600">First 200 lines of the {FORMAT_INFO[result.rawFormat].label} output.</p>
        </TabsContent>
      </Tabs>
    </section>
  );
}

/** Makes invisible characters visible in the preview (the exported data is unchanged). */
function visible(s: string) {
  return s.replace(/\n/g, "⏎").replace(/\t/g, "⇥").replace(/\u0000/g, "␀").replace(/[​‍]/g, "·");
}
