"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

/** Sidebar footer link to the user guide; icon only (with a tooltip) when the sidebar is collapsed. */
export function HelpLink({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const active = isActivePath(usePathname(), "/guide");
  const link = (
    <Link
      href="/guide"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? "Help — user guide" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900",
        active && "bg-neutral-100 text-neutral-900",
        compact && "size-9 justify-center px-0",
      )}
    >
      <LifeBuoy className="size-4 shrink-0" aria-hidden />
      {!compact && "Help"}
    </Link>
  );
  if (!compact) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">Help — user guide</TooltipContent>
    </Tooltip>
  );
}
