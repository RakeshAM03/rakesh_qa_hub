"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** Collapsible, read-only JSON view (values rendered as text, never HTML). */
export function JsonTree({ data }: { data: unknown }) {
  return (
    <div className="font-mono text-xs leading-5" data-testid="json-tree">
      <Node value={data} depth={0} last />
    </div>
  );
}

function Node({ name, value, depth, last }: { name?: string; value: unknown; depth: number; last: boolean }) {
  const [open, setOpen] = useState(depth < 3);
  const comma = last ? "" : ",";
  const key = name !== undefined ? <span className="text-violet-700 dark:text-violet-300">{JSON.stringify(name)}: </span> : null;
  const isObj = value !== null && typeof value === "object";
  if (!isObj) {
    return (
      <div style={{ paddingLeft: depth ? 16 : 0 }}>
        {key}
        <Scalar value={value} />
        {comma}
      </div>
    );
  }
  const entries: [string | undefined, unknown][] = Array.isArray(value) ? value.map((v) => [undefined, v]) : Object.entries(value as Record<string, unknown>);
  const [openCh, closeCh] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return (
    <div style={{ paddingLeft: depth ? 16 : 0 }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center rounded hover:bg-neutral-100">
        <ChevronRight className={cn("size-3 text-neutral-400 transition-transform", open && "rotate-90")} aria-hidden />
        {key}
        <span>{openCh}</span>
        {!open && (
          <span className="text-neutral-400">
            {" "}
            {entries.length} {Array.isArray(value) ? (entries.length === 1 ? "item" : "items") : entries.length === 1 ? "key" : "keys"} {closeCh}
            {comma}
          </span>
        )}
      </button>
      {open && (
        <>
          {entries.map(([k, v], i) => (
            <Node key={k ?? i} name={k} value={v} depth={depth + 1} last={i === entries.length - 1} />
          ))}
          <div>
            {closeCh}
            {comma}
          </div>
        </>
      )}
    </div>
  );
}

function Scalar({ value }: { value: unknown }) {
  if (typeof value === "string") return <span className="text-emerald-700 dark:text-emerald-300">{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className="text-sky-700 dark:text-sky-300">{String(value)}</span>;
  if (typeof value === "boolean") return <span className="text-amber-700 dark:text-amber-300">{String(value)}</span>;
  return <span className="text-neutral-500">null</span>;
}
