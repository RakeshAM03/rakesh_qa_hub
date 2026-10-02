import { FLAG_TYPE_LABELS, type FlagSeverity, type FlagTypeKey } from "@/lib/ai-pr-review/constants";
import { cn } from "@/lib/utils";

export function FlagSeverityPill({ severity }: { severity: FlagSeverity }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-xs font-semibold",
        severity === "P0" ? "border-red-200 bg-red-100 text-red-700" : "border-amber-200 bg-amber-100 text-amber-700",
      )}
    >
      {severity}
    </span>
  );
}

export const flagTypeLabel = (t: FlagTypeKey) => FLAG_TYPE_LABELS[t];
