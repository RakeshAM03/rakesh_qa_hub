"use client";

import { useRef, useState, type DragEvent } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { bugCsvTemplate, CSV_MAX_BYTES, parseBugCsv } from "@/lib/bug-formatter/csv";
import type { BugInput } from "@/lib/bug-formatter/types";
import { downloadText } from "@/lib/browser";
import { cn } from "@/lib/utils";

export function CsvTab({ onAdd }: { onAdd: (bugs: BugInput[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please choose a .csv file.");
      return;
    }
    if (file.size > CSV_MAX_BYTES) {
      toast.error("That CSV is larger than 2 MB. Split it into smaller files.");
      return;
    }
    const { bugs, skipped, error } = parseBugCsv(await file.text());
    if (error) {
      toast.error(error);
      return;
    }
    const skippedNote = skipped ? ` ${skipped} ${skipped === 1 ? "row" : "rows"} without a Title skipped.` : "";
    if (bugs.length === 0) {
      toast.warning(`No bugs found in ${file.name}.${skippedNote}`);
      return;
    }
    onAdd(bugs);
    toast.success(`${bugs.length} ${bugs.length === 1 ? "bug" : "bugs"} added from ${file.name}.${skippedNote}`);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-neutral-500">
          Upload a CSV file with a header row. Columns are matched by name — required:{" "}
          <code>Title</code>. Optional: <code>Severity</code> <code>Steps</code> <code>Expected</code>{" "}
          <code>Actual</code> <code>Environment</code> <code>Notes</code>.
        </p>
        <button
          type="button"
          onClick={() => downloadText("bug-template.csv", bugCsvTemplate(), "text/csv")}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-orange-700 hover:text-orange-800"
        >
          <Download className="size-4" /> Template
        </button>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragging ? "border-orange-400 bg-orange-50" : "border-neutral-300 hover:border-orange-300 hover:bg-orange-50/40",
        )}
      >
        <Upload className="size-8 text-neutral-400" aria-hidden />
        <span className="text-sm font-medium text-neutral-700">Click to select a CSV file</span>
        <span className="text-xs text-neutral-500">or drag and drop</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        data-testid="csv-input"
        aria-label="CSV file"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
