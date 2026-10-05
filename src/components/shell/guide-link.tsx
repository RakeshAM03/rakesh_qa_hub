"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";

import { guideForPath, HOW_TO_USE_ANCHOR } from "@/lib/guide/links";

/** "How to use" link in a module's page header → that module's guide, at the walkthrough. */
export function GuideLink() {
  const guide = guideForPath(usePathname());
  if (!guide) return null;
  return (
    <Link
      href={`/guide/${guide.slug}#${HOW_TO_USE_ANCHOR}`}
      className="inline-flex w-fit items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900 print:hidden"
      aria-label={`How to use ${guide.title} (user guide)`}
    >
      <CircleHelp className="size-4" aria-hidden />
      How to use
    </Link>
  );
}
