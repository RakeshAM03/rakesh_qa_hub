"use client";

import { useState } from "react";
import { Copy, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildReviewPrompt } from "@/lib/ai-pr-review/prompt";
import { copyText } from "@/lib/browser";
import { isGithubPrUrl, splitList } from "@/lib/github";
import { CollapsibleCard } from "./collapsible-card";

export function GenerateCard() {
  const [text, setText] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const urls = splitList(text);
  const valid = urls.filter(isGithubPrUrl);
  const invalid = urls.filter((u) => !isGithubPrUrl(u));

  return (
    <CollapsibleCard id="generate" title="Generate code review prompt" icon={<Sparkles className="size-4 text-purple-600" />}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-neutral-500">
          Paste one or more PR URLs to generate a focused code review prompt. Run it in Claude, then paste the output
          into &lsquo;Log flags from session&rsquo; below.
        </p>
        <Label htmlFor="review-pr-urls" className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          PR URLs
        </Label>
        <Textarea
          id="review-pr-urls"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://github.com/org/repo/pull/123, https://github.com/org/repo/pull/456"
          className="min-h-20 resize-y font-mono text-xs"
          aria-describedby={invalid.length ? "review-pr-urls-error" : undefined}
          aria-invalid={invalid.length > 0}
        />
        {invalid.length > 0 && (
          <p id="review-pr-urls-error" className="text-xs text-red-700">
            Not a GitHub pull request URL: {invalid.join(", ")}
          </p>
        )}
        <Button
          onClick={() => setPrompt(buildReviewPrompt([...new Set(valid)]))}
          disabled={valid.length === 0 || invalid.length > 0}
          className="w-fit bg-purple-700 text-purple-50 hover:bg-purple-800"
        >
          <Wand2 /> Generate
        </Button>
        {prompt !== null && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Generated prompt</span>
              <Button size="sm" variant="outline" onClick={() => copyText(prompt)}>
                <Copy /> Copy
              </Button>
            </div>
            <Textarea
              aria-label="Generated review prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-72 resize-y bg-neutral-50 font-mono text-xs"
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
