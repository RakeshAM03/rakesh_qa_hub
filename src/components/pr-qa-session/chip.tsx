import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ChipProps = {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
};

/** Purple toggle pill: outlined when off, filled when on. */
export function Chip({ pressed, onClick, children, className }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
        pressed
          ? "border-purple-700 bg-purple-700 text-purple-50 hover:bg-purple-800"
          : "border-purple-200 bg-card text-purple-700 hover:border-purple-400 hover:bg-purple-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
