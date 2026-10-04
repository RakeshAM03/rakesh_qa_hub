"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { STATUS_LABELS, VERDICT_LABELS, type ReleaseStatus, type Verdict } from "@/lib/readiness";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ReleaseStatus, string> = {
  PLANNED: "bg-neutral-100 text-neutral-700",
  IN_TESTING: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  GO: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  GO_WITH_ISSUES: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  NO_GO: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  RELEASED: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
};

export function StatusPill({ status }: { status: ReleaseStatus }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[status])}>{STATUS_LABELS[status]}</span>;
}

const VERDICT_TONE: Record<Verdict, { ring: string; text: string }> = {
  READY: { ring: "stroke-green-600 dark:stroke-green-400", text: "text-green-700 dark:text-green-300" },
  AT_RISK: { ring: "stroke-amber-500", text: "text-amber-700 dark:text-amber-300" },
  NOT_READY: { ring: "stroke-red-600 dark:stroke-red-400", text: "text-red-700 dark:text-red-300" },
};

/** Circular progress for the readiness score (coloured by verdict). */
export function ProgressRing({ score, verdict, size = 44, stroke = 5 }: { score: number; verdict: Verdict; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`Readiness ${score}% — ${VERDICT_LABELS[verdict]}`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-neutral-200" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className={VERDICT_TONE[verdict].ring} />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums text-neutral-900">{score}%</span>
    </span>
  );
}

export function VerdictText({ verdict, className }: { verdict: Verdict; className?: string }) {
  return <span className={cn("font-semibold", VERDICT_TONE[verdict].text, className)}>{VERDICT_LABELS[verdict]}</span>;
}

/** Checkbox list in a popover, with a filter. */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  empty,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  empty: string;
}) {
  const [q, setQ] = useState("");
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const selected = options.filter((o) => value.includes(o.value));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal" aria-label={label}>
          <span className="truncate">{selected.length ? selected.map((s) => s.label).join(", ") : `None selected`}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        {options.length === 0 ? (
          <p className="p-2 text-sm text-neutral-500">{empty}</p>
        ) : (
          <>
            {options.length > 6 && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="mb-2 h-8" aria-label={`Filter ${label}`} />}
            <ul className="max-h-60 overflow-y-auto" aria-label={label}>
              {shown.map((o) => {
                const id = `ms-${label}-${o.value}`.replace(/[^\w-]/g, "_");
                return (
                  <li key={o.value} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100">
                    <Checkbox id={id} checked={value.includes(o.value)} onCheckedChange={(c) => onChange(c === true ? [...value, o.value] : value.filter((v) => v !== o.value))} />
                    <label htmlFor={id} className="flex-1 cursor-pointer truncate text-sm">
                      {o.label}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
