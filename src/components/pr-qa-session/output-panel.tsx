"use client";

import { Copy, Download, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { copyText, downloadText } from "@/lib/browser";

type OutputPanelProps = {
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
};

export function OutputPanel({ value, onChange, onReset }: OutputPanelProps) {
  const lines = value ? value.split("\n").length : 0;
  return (
    <section
      aria-labelledby="generated-prompt-title"
      className="overflow-hidden rounded-xl border border-t-4 border-neutral-200 border-t-purple-600 bg-white shadow-xs"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-purple-100 bg-purple-50 px-4 py-3">
        <h2 id="generated-prompt-title" className="flex-1 text-base font-semibold text-neutral-900">
          Generated prompt
        </h2>
        <Button size="sm" onClick={() => copyText(value)} className="bg-purple-600 text-white hover:bg-purple-700">
          <Copy /> Copy
        </Button>
        <Button size="sm" variant="outline" onClick={onReset}>
          <RotateCcw /> Reset
        </Button>
        <Button size="sm" variant="outline" onClick={() => downloadText("qa-session-prompt.md", value, "text/markdown")}>
          <Download /> Download .md
        </Button>
      </header>
      <div className="p-4">
        <Textarea
          aria-label="Generated prompt"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-96 resize-y font-mono text-xs leading-relaxed"
          spellCheck={false}
        />
        <p className="mt-2 text-right text-xs text-neutral-500">
          {value.length.toLocaleString()} characters · {lines.toLocaleString()} lines
        </p>
      </div>
    </section>
  );
}
