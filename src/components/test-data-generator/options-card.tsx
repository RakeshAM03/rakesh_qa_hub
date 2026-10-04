"use client";

import { useId, useState } from "react";
import { ChevronDown, Loader2, Play, Shuffle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DIALECTS, FORMAT_INFO } from "@/lib/testdata/export";
import { LOCALES } from "@/lib/testdata/presets";
import type { DataMode, GenOptions, OutputFormat } from "@/lib/testdata/types";
import { MAX_ROWS } from "@/lib/testdata/validate";
import { cn } from "@/lib/utils";
import type { GenStatus } from "./use-generator";

const MODES: { value: DataMode; label: string; hint: string }[] = [
  { value: "valid", label: "Valid only", hint: "Realistic values only." },
  { value: "mixed", label: "Mixed", hint: "Fields with Edge cases on get edge values in a share of rows." },
  { value: "edge", label: "Edge cases only", hint: "Every field that has edge cases uses them in every row." },
];

type Props = {
  options: GenOptions;
  onChange: (o: GenOptions) => void;
  status: GenStatus;
  onGenerate: () => void;
  onCancel: () => void;
  disabled: boolean;
};

export function OptionsCard({ options: o, onChange, status, onGenerate, onCancel, disabled }: Props) {
  const id = useId();
  const [formatOpen, setFormatOpen] = useState(false);
  const set = (patch: Partial<GenOptions>) => onChange({ ...o, ...patch });
  const running = status.kind === "running";
  const pct = running && status.total ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-xl border border-neutral-200 bg-card p-4">
      <h2 id={`${id}-title`} className="mb-3 text-base font-semibold">
        Options
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-rows`}>Rows</Label>
          <Input
            id={`${id}-rows`}
            type="number"
            min={1}
            max={MAX_ROWS}
            value={o.rows}
            onChange={(e) => set({ rows: Math.max(0, Math.min(MAX_ROWS, Math.floor(Number(e.target.value) || 0))) })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-locale`}>Locale</Label>
          <Select value={o.locale} onValueChange={(locale) => set({ locale })}>
            <SelectTrigger id={`${id}-locale`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {LOCALES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-seed`}>Seed (optional)</Label>
          <div className="flex gap-1.5">
            <Input
              id={`${id}-seed`}
              type="number"
              min={0}
              value={o.seed ?? ""}
              placeholder="Random"
              onChange={(e) => set({ seed: e.target.value === "" ? null : Math.max(0, Math.min(2 ** 31 - 1, Math.floor(Number(e.target.value)))) })}
            />
            <Button type="button" variant="outline" size="icon" aria-label="Clear seed (random data)" onClick={() => set({ seed: null })} disabled={o.seed === null}>
              <Shuffle />
            </Button>
          </div>
          <p className="text-xs text-neutral-600">Same seed + schema + options = the same data.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-ref`}>Dates relative to</Label>
          <Input id={`${id}-ref`} type="date" value={o.refDate} onChange={(e) => e.target.value && set({ refDate: e.target.value })} />
          <p className="text-xs text-neutral-600">Past / future dates and ages count from this day.</p>
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-1.5 text-sm font-medium">Data mode</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Data mode">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={o.dataMode === m.value}
              onClick={() => set({ dataMode: m.value })}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                o.dataMode === m.value ? "border-teal-700 bg-teal-50 text-teal-900" : "border-neutral-200 hover:bg-neutral-50",
              )}
            >
              <span className="block font-medium">{m.label}</span>
              <span className="block text-xs text-neutral-600">{m.hint}</span>
            </button>
          ))}
        </div>
        {o.dataMode !== "valid" && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <Checkbox checked={o.edgeColumns} onCheckedChange={(c) => set({ edgeColumns: c === true })} />
            Add <code className="font-mono text-xs">_isEdgeCase</code> and <code className="font-mono text-xs">_edgeCaseType</code> columns
          </label>
        )}
      </fieldset>

      <div className="mt-4 flex flex-col gap-1.5">
        <Label htmlFor={`${id}-format`}>Output format</Label>
        <Select value={o.format} onValueChange={(format) => set({ format: format as OutputFormat })}>
          <SelectTrigger id={`${id}-format`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {(Object.keys(FORMAT_INFO) as OutputFormat[]).map((f) => (
              <SelectItem key={f} value={f}>
                {FORMAT_INFO[f].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => setFormatOpen((v) => !v)}
          aria-expanded={formatOpen}
          className="flex items-center gap-1 self-start text-sm font-medium text-teal-800 hover:underline"
        >
          <ChevronDown className={cn("size-4 transition-transform", formatOpen && "rotate-180")} aria-hidden /> {FORMAT_INFO[o.format].label} settings
        </button>
        {formatOpen && <FormatOptions o={o} set={set} />}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {running ? (
          <>
            <div className="flex items-center gap-2">
              <Button type="button" disabled className="flex-1 bg-teal-700 text-teal-50">
                <Loader2 className="animate-spin" aria-hidden /> {status.stage === "file" ? "Preparing file…" : `Generating… ${pct}%`}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>
                <X aria-hidden /> Cancel
              </Button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label="Generation progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-teal-700 transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <Button type="button" onClick={onGenerate} disabled={disabled} className="bg-teal-700 text-teal-50 hover:bg-teal-800">
            <Play aria-hidden /> Generate
          </Button>
        )}
      </div>
    </section>
  );
}

function FormatOptions({ o, set }: { o: GenOptions; set: (p: Partial<GenOptions>) => void }) {
  const id = useId();
  const box = "mt-1 grid gap-3 rounded-lg border border-neutral-200 p-3 sm:grid-cols-2";
  const check = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      {label}
    </label>
  );
  const text = (key: string, label: string, value: string, onChange: (v: string) => void, max = 64) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-${key}`} className="text-xs">
        {label}
      </Label>
      <Input id={`${id}-${key}`} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} className="h-8" />
    </div>
  );

  switch (o.format) {
    case "csv":
    case "tsv":
      return (
        <div className={box}>
          {o.format === "csv" && text("delim", "Delimiter", o.csv.delimiter, (delimiter) => set({ csv: { ...o.csv, delimiter } }), 3)}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-eol`} className="text-xs">
              Line ending
            </Label>
            <Select value={o.csv.lineEnding} onValueChange={(v) => set({ csv: { ...o.csv, lineEnding: v as "lf" | "crlf" } })}>
              <SelectTrigger id={`${id}-eol`} className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="lf">LF (Mac / Linux)</SelectItem>
                <SelectItem value="crlf">CRLF (Windows)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {check("Header row", o.csv.header, (header) => set({ csv: { ...o.csv, header } }))}
          {check("Quote every value", o.csv.quoteAll, (quoteAll) => set({ csv: { ...o.csv, quoteAll } }))}
          {check("Include BOM (for Excel)", o.csv.bom, (bom) => set({ csv: { ...o.csv, bom } }))}
        </div>
      );
    case "json":
    case "yaml":
      return (
        <div className={box}>
          {text("root", "Wrap in a root key (optional)", o.json.rootKey, (rootKey) => set({ json: { ...o.json, rootKey } }))}
          {o.format === "json" && check("Pretty-printed", o.json.pretty, (pretty) => set({ json: { ...o.json, pretty } }))}
        </div>
      );
    case "sql":
      return (
        <div className={box}>
          {text("table", "Table name", o.sql.table, (table) => set({ sql: { ...o.sql, table } }))}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-dialect`} className="text-xs">
              Dialect
            </Label>
            <Select value={o.sql.dialect} onValueChange={(v) => set({ sql: { ...o.sql, dialect: v as GenOptions["sql"]["dialect"] } })}>
              <SelectTrigger id={`${id}-dialect`} className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {DIALECTS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-batch`} className="text-xs">
              Rows per INSERT
            </Label>
            <Input
              id={`${id}-batch`}
              type="number"
              min={1}
              max={10000}
              value={o.sql.batchSize}
              onChange={(e) => set({ sql: { ...o.sql, batchSize: Math.max(1, Math.min(10000, Math.floor(Number(e.target.value) || 1))) } })}
              className="h-8"
            />
          </div>
          {check("Include CREATE TABLE", o.sql.createTable, (createTable) => set({ sql: { ...o.sql, createTable } }))}
        </div>
      );
    case "xml":
      return (
        <div className={box}>
          {text("xroot", "Root element", o.xml.root, (root) => set({ xml: { ...o.xml, root } }))}
          {text("xrow", "Row element", o.xml.row, (row) => set({ xml: { ...o.xml, row } }))}
        </div>
      );
    case "xlsx":
      return (
        <div className={box}>
          {text("sheet", "Sheet name", o.xlsx.sheet, (sheet) => set({ xlsx: { ...o.xlsx, sheet } }), 31)}
          {check("Freeze header row", o.xlsx.freezeHeader, (freezeHeader) => set({ xlsx: { ...o.xlsx, freezeHeader } }))}
          {check("Auto-fit columns", o.xlsx.autoFit, (autoFit) => set({ xlsx: { ...o.xlsx, autoFit } }))}
        </div>
      );
    default:
      return <p className="mt-1 text-sm text-neutral-600">No extra settings for JSON Lines.</p>;
  }
}
