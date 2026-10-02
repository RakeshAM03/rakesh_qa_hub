import { validTone } from "@/lib/bug-tracker/stats";
import { cn } from "@/lib/utils";

const TONES = {
  green: "bg-green-100 text-green-800 border-green-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  red: "bg-rose-100 text-rose-700 border-rose-200",
  none: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

/** % VALID pill: green ≥ 95, amber 85–94, red/pink below 85, grey "—" with no issues. */
export function ValidPill({ percent }: { percent: number | null }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-12 items-center justify-center rounded-full border px-2 text-xs font-semibold tabular-nums",
        TONES[validTone(percent)],
      )}
      aria-label={percent === null ? "No issues yet" : `${percent}% valid`}
    >
      {percent === null ? "—" : `${percent}%`}
    </span>
  );
}
