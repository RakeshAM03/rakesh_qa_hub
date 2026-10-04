"use client";

import { STATUS_LABELS, VERDICT_LABELS, type ReleaseStatus, type Verdict } from "@/lib/readiness";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ReleaseStatus, string> = {
  PLANNED: "bg-neutral-100 text-neutral-700",
  IN_TESTING: "bg-blue-100 text-blue-800",
  GO: "bg-green-100 text-green-800",
  GO_WITH_ISSUES: "bg-green-100 text-green-800",
  NO_GO: "bg-red-100 text-red-800",
  RELEASED: "bg-purple-100 text-purple-800",
};

export function StatusPill({ status }: { status: ReleaseStatus }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[status])}>{STATUS_LABELS[status]}</span>;
}

const VERDICT_TONE: Record<Verdict, { ring: string; text: string }> = {
  READY: { ring: "stroke-green-600", text: "text-green-700" },
  AT_RISK: { ring: "stroke-amber-500", text: "text-amber-700" },
  NOT_READY: { ring: "stroke-red-600", text: "text-red-700" },
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

export { MultiSelect } from "@/components/shared/multi-select";
