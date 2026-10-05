"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, Lightbulb } from "lucide-react";

import { cn } from "@/lib/utils";

const FLOW: { steps: string; text: string; stop?: string }[] = [
  { steps: "Step 1", text: "Claude reads every changed file (not the PR description): frontend and backend diffs, contract mismatches, impact radius and an AI code-quality review." },
  { steps: "Step 2", text: "A prioritised test plan with test data, out-of-scope reasons and coverage rules.", stop: "STOP — you reply “Approved” or “Approved with changes:” before any browser work." },
  { steps: "Steps 3–6", text: "Feature, UI, UX and exploratory testing in a live browser through Playwright MCP, with screenshots, console and network checks." },
  { steps: "Step 7", text: "A findings report traced to the code change behind each bug.", stop: "STOP — Claude waits for your team's findings." },
  { steps: "Steps 8–10", text: "Defects consolidated, Playwright specs generated (feature, defect, regression guard, API contract), then a closure checklist with a Go / No-Go call." },
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
        <span className="flex-1">How this works — a 10-step session with two approval gates</span>
        <ChevronDown className={cn("size-4 text-neutral-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id="how-it-works" className="flex flex-col gap-3 border-t border-purple-50 px-4 py-4 text-sm text-neutral-700">
          <p>Fill in the PR URL(s), test environment and login method, pick a template and focus areas, then Build Prompt. Copy the prompt into Claude Code in your terminal.</p>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FLOW.map((f) => (
              <li key={f.steps} className="flex flex-col gap-1.5 rounded-lg bg-purple-50/60 p-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-800">{f.steps}</span>
                <span>{f.text}</span>
                {f.stop && <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">{f.stop}</span>}
              </li>
            ))}
          </ol>
          <p className="text-xs text-neutral-600">Credentials never go into the prompt: Claude reads them from environment variables or asks you at run time.</p>
        </div>
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
