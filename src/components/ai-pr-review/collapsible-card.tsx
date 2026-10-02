"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type CollapsibleCardProps = {
  id: string;
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** Card with a lavender header that collapses its body. */
export function CollapsibleCard({ id, title, icon, defaultOpen = true, children }: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section aria-labelledby={`${id}-title`} className="overflow-hidden rounded-xl border border-neutral-200 bg-card shadow-xs">
      <h2 id={`${id}-title`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          className="flex w-full items-center gap-2 bg-purple-50 px-4 py-3 text-left text-base font-semibold text-neutral-900"
        >
          {icon}
          <span className="flex-1">{title}</span>
          <ChevronDown className={cn("size-4 text-neutral-500 transition-transform", open && "rotate-180")} />
        </button>
      </h2>
      <div id={`${id}-body`} hidden={!open} className="border-t border-purple-100 p-4 sm:p-5">
        {children}
      </div>
    </section>
  );
}
