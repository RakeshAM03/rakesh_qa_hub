import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** Tailwind classes for the icon colour, e.g. "text-orange-500". */
  iconClassName?: string;
  /** Right-side actions (buttons, search, etc.). */
  actions?: ReactNode;
  /** Breadcrumb target; defaults to Home. */
  backHref?: string;
  backLabel?: string;
};

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconClassName,
  actions,
  backHref = "/",
  backLabel = "Home",
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <ChevronLeft className="size-4" />
        {backLabel}
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
            {Icon && (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-card shadow-xs">
                <Icon className={cn("size-5", iconClassName)} aria-hidden />
              </span>
            )}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
