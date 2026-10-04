"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { EdgeMeta, Field, GenOptions, OutputFormat, Row } from "@/lib/testdata/types";
import type { GenerateStats, WorkerRequest, WorkerResponse } from "./generator.worker";

export type GeneratedResult = {
  columns: string[];
  preview: Row[];
  previewEdges: (EdgeMeta | null)[];
  raw: string;
  rawFormat: OutputFormat;
  stats: GenerateStats;
  /** The options used, so exports and the stats line match what's shown. */
  options: GenOptions;
};

export type GenStatus =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number; stage: "rows" | "file" }
  | { kind: "error"; message: string };

export type FileOut = { name: string; mime: string; bytes: Uint8Array };

/** A request without its id (Omit over each member of the union). */
type Outgoing = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "id"> : never) : never;

/** Runs generation in a Web Worker. Cancel terminates the worker; a fresh one starts next time. */
export function useGenerator() {
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(1);
  const pending = useRef(new Map<number, { resolve: (v: WorkerResponse) => void; reject: (e: Error) => void }>());
  const [status, setStatus] = useState<GenStatus>({ kind: "idle" });
  const [result, setResult] = useState<GeneratedResult | null>(null);

  const getWorker = useCallback(() => {
    if (worker.current) return worker.current;
    const w = new Worker(new URL("./generator.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setStatus({ kind: "running", done: msg.done, total: msg.total, stage: msg.stage });
        return;
      }
      const p = pending.current.get(msg.id);
      if (!p) return;
      pending.current.delete(msg.id);
      if (msg.type === "error") p.reject(new Error(msg.message));
      else p.resolve(msg);
    };
    w.onerror = (e) => {
      for (const p of pending.current.values()) p.reject(new Error(e.message || "The generator stopped unexpectedly."));
      pending.current.clear();
    };
    worker.current = w;
    return w;
  }, []);

  useEffect(() => () => worker.current?.terminate(), []);

  const request = useCallback(
    (msg: Outgoing) =>
      new Promise<WorkerResponse>((resolve, reject) => {
        const id = nextId.current++;
        pending.current.set(id, { resolve, reject });
        getWorker().postMessage({ ...msg, id } as WorkerRequest);
      }),
    [getWorker],
  );

  const generate = useCallback(
    async (fields: Field[], options: GenOptions, schemaName: string) => {
      setStatus({ kind: "running", done: 0, total: options.rows, stage: "rows" });
      try {
        const res = await request({ type: "generate", fields, options, schemaName });
        if (res.type !== "generated") return null;
        const next: GeneratedResult = { columns: res.columns, preview: res.preview, previewEdges: res.previewEdges, raw: res.raw, rawFormat: res.rawFormat, stats: res.stats, options };
        setResult(next);
        setStatus({ kind: "idle" });
        return next;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed.";
        if (message !== "Cancelled") setStatus({ kind: "error", message });
        return null;
      }
    },
    [request],
  );

  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    for (const p of pending.current.values()) p.reject(new Error("Cancelled"));
    pending.current.clear();
    setResult(null); // the worker held the data, so exports need a new run
    setStatus({ kind: "idle" });
  }, []);

  const file = useCallback(
    async (format: OutputFormat | "zip", options: GenOptions, schemaName: string): Promise<FileOut> => {
      const res = await request(format === "zip" ? { type: "zip", options, schemaName } : { type: "export", format, options, schemaName });
      if (res.type !== "file") throw new Error("Couldn't build the file.");
      return { name: res.name, mime: res.mime, bytes: res.bytes };
    },
    [request],
  );

  return { status, result, generate, cancel, file, clearError: () => setStatus({ kind: "idle" }) };
}

export function saveBytes({ name, mime, bytes }: FileOut) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
