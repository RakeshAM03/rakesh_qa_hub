"use client";

import { useId, useState } from "react";
import { Import, X } from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  prompt: string;
  onImport: (answer: string) => string | null;
  onClose: () => void;
};

/** "Copy prompt for Claude" → paste Claude's answer back → Import. */
export function ClaudePanel({ prompt, onImport, onClose }: Props) {
  const id = useId();
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id={`${id}-title`} className="text-base font-semibold">
            Prompt for Claude
          </h2>
          <p className="text-sm text-neutral-700">Copy it into Claude, then paste the answer below and press Import.</p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Close prompt panel" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${id}-prompt`}>Prompt</Label>
          <CopyButton text={prompt} label="Copy prompt" message="Prompt copied" />
        </div>
        <Textarea id={`${id}-prompt`} value={prompt} readOnly rows={8} className="bg-card font-mono text-xs" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-answer`}>Paste Claude&apos;s answer</Label>
        <Textarea
          id={`${id}-answer`}
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            setError(null);
          }}
          rows={8}
          placeholder="Paste the JSON answer here (Markdown fences and text around it are fine). A Markdown table also works."
          className="bg-card font-mono text-xs"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        {error && (
          <p id={`${id}-err`} role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <Button type="button" className="self-start bg-blue-700 text-blue-50 hover:bg-blue-800" onClick={() => setError(onImport(answer))} disabled={!answer.trim()}>
        <Import aria-hidden /> Import
      </Button>
    </section>
  );
}
