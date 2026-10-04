"use client";

import { useRef, useState } from "react";
import { FileJson, Upload } from "lucide-react";
import { toast } from "sonner";

import { useYourName } from "@/components/shared/your-name";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { previewImport, type ImportPreview } from "@/lib/tc-library/import";
import { IMPORT_MAX_BYTES } from "@/lib/tc-library/schema";

type ImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (count: number) => void;
};

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const { displayName } = useYourName();

  function reset() {
    setFileName(null);
    setPreview(null);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      toast.error("Please choose a .json file.");
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      toast.error("That file is larger than 10 MB.");
      return;
    }
    setFileName(file.name);
    setPreview(previewImport(await file.text()));
  }

  async function runImport() {
    if (!preview?.valid.length) return;
    setImporting(true);
    try {
      const res = await fetch("/api/tc-library/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: preview.valid, createdBy: displayName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Import failed.");
        return;
      }
      onImported(data.imported);
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Couldn't reach the server. Try again.");
    } finally {
      setImporting(false);
    }
  }

  const count = preview?.valid.length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import JSON</DialogTitle>
          <DialogDescription>
            A single entry or an array of entries, each with <code>name</code>, <code>output</code> and an optional{" "}
            <code>prReference</code>. Files from Export all work too.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-8 text-center hover:border-teal-400 hover:bg-teal-50/40"
        >
          {fileName ? <FileJson className="size-7 text-teal-600" /> : <Upload className="size-7 text-neutral-400" />}
          <span className="text-sm font-medium text-neutral-700">{fileName ?? "Choose a .json file"}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label="JSON file"
          data-testid="tc-import-input"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {preview?.error && <p className="text-sm text-red-700">{preview.error}</p>}
        {preview && !preview.error && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium text-neutral-800" aria-live="polite">
              {count} {count === 1 ? "entry" : "entries"} ready to import
            </p>
            {preview.invalid.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">
                  {preview.invalid.length} {preview.invalid.length === 1 ? "entry" : "entries"} will be skipped:
                </p>
                <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5">
                  {preview.invalid.map((item) => (
                    <li key={item.index}>
                      #{item.index + 1}
                      {item.name ? ` “${item.name}”` : ""}: {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={runImport}
            disabled={!count || importing}
            className="bg-teal-700 text-teal-50 hover:bg-teal-800"
          >
            {importing ? "Importing…" : `Import${count ? ` ${count}` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
