"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, Lightbulb } from "lucide-react";

import { cn } from "@/lib/utils";

const STEPS = [
  "Paste the PR URL(s) and the test environment URL.",
  "Pick a template, focus areas and steps, then click Build Prompt.",
  "Review and edit the generated prompt, then copy it.",
  "Paste it into Claude Code in your terminal; Claude analyses the PR, tests it with Playwright and reports findings.",
];

export function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-purple-100 bg-card shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="how-it-works"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-neutral-800"
      >
        <BookOpen className="size-4 text-purple-600" aria-hidden />
        <span className="flex-1">How this works — 4-step workflow from PR to findings</span>
        <ChevronDown className={cn("size-4 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ol id="how-it-works" className="grid gap-3 border-t border-purple-50 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((text, i) => (
            <li key={i} className="flex gap-3 rounded-lg bg-purple-50/60 p-3 text-sm text-neutral-700">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-semibold text-white">
                {i + 1}
              </span>
              {text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function BeforeYouStart() {
  return (
    <aside className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
      <div>
        <p className="font-medium">Before you start</p>
        <p className="mt-1">
          This prompt runs inside <strong>Claude Code</strong> (the CLI), not Claude.ai. Two things must be set up:
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>
            <code>gh</code> CLI authenticated — run <code>gh auth login</code> in your terminal.
          </li>
          <li>
            <strong>Playwright MCP</strong> connected — add it under MCP Servers in Claude Code settings.
          </li>
        </ul>
      </div>
    </aside>
  );
}
