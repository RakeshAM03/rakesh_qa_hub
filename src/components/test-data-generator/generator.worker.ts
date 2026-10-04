/// <reference lib="webworker" />
/**
 * Generates datasets off the main thread and keeps the last one so exports don't need to
 * regenerate. Messages: generate → progress* + generated | error; export / zip → file | error.
 */

import { strToU8, zipSync } from "fflate";

import { toXlsx } from "@/lib/testdata/excel";
import { exportText, fileName, FORMAT_INFO } from "@/lib/testdata/export";
import { edgeColumnsOn, generateDataset } from "@/lib/testdata/generate";
import { loadFaker } from "@/lib/testdata/locales";
import type { Dataset, EdgeMeta, Field, GenOptions, OutputFormat, Row } from "@/lib/testdata/types";

export type WorkerRequest =
  | { type: "generate"; id: number; fields: Field[]; options: GenOptions; schemaName: string }
  | { type: "export"; id: number; format: OutputFormat; options: GenOptions; schemaName: string }
  | { type: "zip"; id: number; options: GenOptions; schemaName: string };

export type GenerateStats = { rows: number; fields: number; bytes: number; edgeCount: number; ms: number; seed: number };

export type WorkerResponse =
  | { type: "progress"; id: number; done: number; total: number; stage: "rows" | "file" }
  | {
      type: "generated";
      id: number;
      columns: string[];
      preview: Row[];
      previewEdges: (EdgeMeta | null)[];
      raw: string;
      rawFormat: OutputFormat;
      stats: GenerateStats;
    }
  | { type: "file"; id: number; name: string; mime: string; bytes: Uint8Array }
  | { type: "error"; id: number; message: string };

const PREVIEW_ROWS = 100;
const RAW_LINES = 200;

let last: { ds: Dataset; fields: Field[]; options: GenOptions; schemaName: string; files: Map<OutputFormat, Uint8Array> } | null = null;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
const encoder = new TextEncoder();

async function build(format: OutputFormat): Promise<Uint8Array> {
  if (!last) throw new Error("Generate some data first.");
  const cached = last.files.get(format);
  if (cached) return cached;
  const { ds, fields, options } = last;
  const bytes = format === "xlsx" ? await toXlsx(ds, options.xlsx) : encoder.encode(exportText(format, ds, fields, options, edgeColumnsOn(options)));
  last.files.set(format, bytes);
  return bytes;
}

/** Applies the current format settings (and name) to the last dataset; drops stale files. */
function applyFormatSettings(options: GenOptions, schemaName: string) {
  if (!last) throw new Error("Generate some data first.");
  const pick = (o: GenOptions) => JSON.stringify([o.csv, o.json, o.sql, o.xml, o.xlsx]);
  if (pick(options) !== pick(last.options)) {
    last.options = { ...last.options, csv: options.csv, json: options.json, sql: options.sql, xml: options.xml, xlsx: options.xlsx };
    last.files.clear();
  }
  last.schemaName = schemaName;
}

/** First lines of the chosen format, from a small slice so it's quick for big datasets. */
function rawPreview(format: OutputFormat): { raw: string; rawFormat: OutputFormat } {
  const { ds, fields, options } = last!;
  const slice: Dataset = { ...ds, rows: ds.rows.slice(0, RAW_LINES), edges: ds.edges.slice(0, RAW_LINES) };
  const shown = format === "xlsx" ? "csv" : format;
  const text = exportText(shown, slice, fields, options, edgeColumnsOn(options));
  return { raw: text.split("\n").slice(0, RAW_LINES).join("\n"), rawFormat: shown };
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "generate") {
      const started = performance.now();
      const faker = await loadFaker(msg.options.locale);
      const ds = generateDataset(faker, msg.fields, msg.options, (done, total) => post({ type: "progress", id: msg.id, done, total, stage: "rows" }));
      last = { ds, fields: msg.fields, options: msg.options, schemaName: msg.schemaName, files: new Map() };
      post({ type: "progress", id: msg.id, done: ds.rows.length, total: ds.rows.length, stage: "file" });
      const bytes = await build(msg.options.format);
      post({
        type: "generated",
        id: msg.id,
        columns: ds.columns,
        preview: ds.rows.slice(0, PREVIEW_ROWS),
        previewEdges: ds.edges.slice(0, PREVIEW_ROWS),
        ...rawPreview(msg.options.format),
        stats: { rows: ds.rows.length, fields: msg.fields.length, bytes: bytes.byteLength, edgeCount: ds.edgeCount, ms: performance.now() - started, seed: ds.seed },
      });
    } else if (msg.type === "export") {
      applyFormatSettings(msg.options, msg.schemaName);
      const bytes = await build(msg.format);
      const copy = bytes.slice();
      post(
        { type: "file", id: msg.id, name: fileName(last!.schemaName, last!.ds.rows.length, msg.format), mime: FORMAT_INFO[msg.format].mime, bytes: copy },
        [copy.buffer],
      );
    } else if (msg.type === "zip") {
      applyFormatSettings(msg.options, msg.schemaName);
      if (!last) throw new Error("Generate some data first.");
      const entries: Record<string, Uint8Array> = {};
      for (const format of Object.keys(FORMAT_INFO) as OutputFormat[]) {
        entries[fileName(last.schemaName, last.ds.rows.length, format)] = await build(format);
      }
      entries["README.txt"] = strToU8("Generated by Rakesh QA Hub — Test Data Generator. All values are fake test data.\n");
      const zip = zipSync(entries, { level: 6 });
      const base = fileName(last.schemaName, last.ds.rows.length, "csv").replace(/\.csv$/, "");
      post({ type: "file", id: msg.id, name: `${base}-all-formats.zip`, mime: "application/zip", bytes: zip }, [zip.buffer]);
    }
  } catch (err) {
    post({ type: "error", id: msg.id, message: err instanceof Error ? err.message : "Something went wrong while generating." });
  }
};
