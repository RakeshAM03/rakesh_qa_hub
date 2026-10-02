import type { Severity } from "@/lib/bug-formatter/types";
import { cn } from "@/lib/utils";

export const SEVERITY_STYLES: Record<Severity, string> = {
  P0: "bg-red-100 text-red-700 border-red-200",
  P1: "bg-orange-100 text-orange-700 border-orange-200",
  P2: "bg-amber-100 text-amber-700 border-amber-200",
  P3: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

export function SeverityPill({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-xs font-semibold",
        SEVERITY_STYLES[severity],
        className,
      )}
    >
      {severity}
    </span>
  );
}
