"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import type { Badge, Candidate } from "@/lib/locators/strategies";
import { cn } from "@/lib/utils";

const BADGE: Record<Badge, string> = {
  Robust: "bg-green-100 text-green-800",
  OK: "bg-amber-100 text-amber-800",
  Fragile: "bg-red-100 text-red-800",
};

type TabId = "selenium" | "playwright" | "css" | "xpath";
const TABS: { id: TabId; label: string }[] = [
  { id: "selenium", label: "Selenium Java" },
  { id: "playwright", label: "Playwright TS" },
  { id: "css", label: "CSS" },
  { id: "xpath", label: "XPath" },
];

export function ScoreBadge({ badge, score }: { badge: Badge; score: number }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", BADGE[badge])}>
      {score} · {badge}
    </span>
  );
}

export function SuggestionCard({ candidate, rank }: { candidate: Candidate; rank: number }) {
  const [tab, setTab] = useState<TabId>(candidate.playwright ? "playwright" : "selenium");
  const code: Record<TabId, string | undefined> = {
    selenium: candidate.selenium,
    playwright: candidate.playwright,
    css: candidate.css,
    xpath: candidate.xpath,
  };
  const current = code[tab];
  const unique = candidate.matches === 1;

  return (
    <article
      aria-label={`${candidate.label} locator`}
      data-strategy={candidate.strategy}
      className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-neutral-600">#{rank}</span>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
          {candidate.strategy === "ai" && <Sparkles className="size-3.5 text-violet-500" aria-hidden />}
          {candidate.label}
        </h3>
        <ScoreBadge badge={candidate.badge} score={candidate.score} />
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1 text-xs",
            unique ? "text-green-700" : "text-amber-700",
          )}
        >
          {unique ? <CheckCircle2 className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
          {unique ? "Unique" : `Matches ${candidate.matches} elements`}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-600">{candidate.reason}</p>

      <div role="tablist" aria-label="Locator format" className="mt-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            disabled={!code[t.id]}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent",
              tab === t.id && "bg-cyan-50 text-cyan-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-2 flex items-start gap-2 rounded-lg bg-neutral-100 p-2.5">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-neutral-800" data-testid="locator-code">
          {current ?? "—"}
        </code>
        {current && <CopyButton text={current} variant="ghost" message="Locator copied" />}
      </div>
    </article>
  );
}
