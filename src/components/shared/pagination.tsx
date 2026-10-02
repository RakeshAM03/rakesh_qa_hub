"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pageItems, rangeLabel, totalPagesFor } from "@/lib/pagination";
import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  size: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Tailwind classes for the active page button. */
  activeClassName?: string;
  /** Show numbered page buttons (otherwise only first/prev/next/last). */
  showNumbers?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function Pagination({
  page,
  size,
  total,
  onPageChange,
  activeClassName = "bg-primary text-primary-foreground hover:bg-primary/90",
  showNumbers = true,
  className,
  children,
}: PaginationProps) {
  const pages = totalPagesFor(total, size);
  const empty = total === 0;
  const go = (p: number) => onPageChange(Math.min(Math.max(1, p), pages));

  return (
    <nav aria-label="Pagination" className={cn("flex flex-wrap items-center justify-between gap-3 text-sm", className)}>
      <div className="flex flex-wrap items-center gap-3 text-neutral-500">
        {children}
        <span aria-live="polite">Showing {rangeLabel(page, size, total)}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="First page" disabled={empty || page <= 1} onClick={() => go(1)}>
          <ChevronsLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={empty || page <= 1} onClick={() => go(page - 1)}>
          <ChevronLeft />
        </Button>
        {showNumbers &&
          !empty &&
          pageItems(page, pages).map((item) =>
            typeof item === "number" ? (
              <Button
                key={item}
                variant="ghost"
                size="icon-sm"
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                className={cn("min-w-7 px-1.5", item === page && activeClassName)}
                onClick={() => go(item)}
              >
                {item}
              </Button>
            ) : (
              <span key={item} className="px-1 text-neutral-400" aria-hidden>
                …
              </span>
            ),
          )}
        <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={empty || page >= pages} onClick={() => go(page + 1)}>
          <ChevronRight />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Last page" disabled={empty || page >= pages} onClick={() => go(pages)}>
          <ChevronsRight />
        </Button>
      </div>
    </nav>
  );
}
