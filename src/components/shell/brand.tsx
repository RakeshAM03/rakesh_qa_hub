import Link from "next/link";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/** Gradient mark + name. */
export function Brand({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("flex min-w-0 items-center gap-2.5", className)} aria-label="Rakesh QA Hub home">
      <span className="ai-gradient flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
        <Sparkles className="size-4" aria-hidden />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-neutral-900">Rakesh QA Hub</span>
          <span className="block truncate text-[11px] text-neutral-500">AI-assisted QA toolkit</span>
        </span>
      )}
    </Link>
  );
}
