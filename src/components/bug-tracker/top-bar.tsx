import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { GuideLink } from "@/components/shell/guide-link";

import { GlobalSearch } from "./global-search";

/** Breadcrumb on the left, global issue search on the right (all Bug Tracker pages). */
export function BugTrackerTopBar({ backHref = "/", backLabel = "Home" }: { backHref?: string; backLabel?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
        <ChevronLeft className="size-4" />
        {backLabel}
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <GuideLink />
        <GlobalSearch />
      </div>
    </div>
  );
}
