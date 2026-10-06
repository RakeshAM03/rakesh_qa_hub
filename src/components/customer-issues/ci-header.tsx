"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/customer-issues", label: "Dashboard & issues", exact: true },
  { href: "/customer-issues/pack", label: "Regression pack" },
  { href: "/customer-issues/runs", label: "Release runs" },
  { href: "/customer-issues/settings", label: "Settings" },
];

/** Page header + module tabs, shared by every Customer Issue RCA page. */
export function CiHeader({ title, subtitle, actions, backHref, backLabel }: { title?: string; subtitle?: ReactNode; actions?: ReactNode; backHref?: string; backLabel?: string }) {
  const pathname = usePathname();
  return (
    <>
      <PageHeader
        title={title ?? "Customer Issue RCA"}
        subtitle={subtitle ?? "Classify escaped defects, write the RCA, and turn each one into mandatory regression tests."}
        icon={LifeBuoy}
        iconClassName="text-rose-600"
        actions={actions}
        backHref={backHref}
        backLabel={backLabel}
      />
      <nav aria-label="Customer Issue RCA" className="-mt-2 mb-6 flex gap-1 overflow-x-auto border-b border-neutral-200 print:hidden">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href || /^\/customer-issues\/(?!pack|runs|settings)[^/]+$/.test(pathname) : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap", active ? "border-rose-600 text-rose-800" : "border-transparent text-neutral-600 hover:text-neutral-900")}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
