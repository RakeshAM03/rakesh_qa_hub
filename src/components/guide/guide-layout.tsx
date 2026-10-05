import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { GUIDE_EXTRAS, GUIDE_MODULES } from "@/lib/guide/links";
import { cn } from "@/lib/utils";
import type { GuideDoc } from "@/lib/guide/content";

import { GuideMarkdown } from "./guide-markdown";

const SECTIONS = [...new Set(GUIDE_MODULES.map((m) => m.section))];

/** One guide page: breadcrumb, the rendered Markdown, and a side panel with every guide page. */
export function GuidePage({ doc }: { doc: GuideDoc }) {
  const mod = GUIDE_MODULES.find((m) => m.slug === doc.slug);
  // Title and intro first, then the small-screen "On this page" box, then the sections.
  const cut = doc.markdown.search(/^## /m);
  const [intro, body] = cut > 0 ? [doc.markdown.slice(0, cut), doc.markdown.slice(cut)] : [doc.markdown, ""];
  return (
    <div className="flex gap-10">
      <article className="min-w-0 max-w-3xl flex-1 print:max-w-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href={doc.slug ? "/guide" : "/"} className="inline-flex w-fit items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
            <ChevronLeft className="size-4" aria-hidden />
            {doc.slug ? "User Guide" : "Home"}
          </Link>
          {mod && (
            <Link href={`/${mod.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Open {mod.title} <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
        <GuideMarkdown>{intro}</GuideMarkdown>
        {mod && doc.headings.length > 0 && (
          <nav aria-label="On this page" className="mt-5 rounded-lg border border-neutral-200 bg-card px-4 py-3 text-sm xl:hidden print:hidden">
            <p className="mb-1.5 font-medium text-neutral-800">On this page</p>
            <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {doc.headings.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className="text-neutral-700 hover:text-neutral-900 hover:underline">
                    {h.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        {body && (
          <div className="mt-6">
            <GuideMarkdown>{body}</GuideMarkdown>
          </div>
        )}
      </article>

      <aside className="hidden w-60 shrink-0 xl:block print:hidden" aria-label="User guide pages">
        <div className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col gap-5 overflow-y-auto pb-6 text-sm">
          <ul className="flex flex-col gap-1">
            <GuideNavLink href="/guide" active={!doc.slug}>
              User Guide home
            </GuideNavLink>
            {GUIDE_EXTRAS.map((e) => (
              <GuideNavLink key={e.slug} href={`/guide/${e.slug}`} active={doc.slug === e.slug}>
                {e.title}
              </GuideNavLink>
            ))}
          </ul>
          {SECTIONS.map((section) => (
            <div key={section}>
              <p className="mb-1.5 px-2 text-xs font-semibold tracking-wider text-neutral-600 uppercase">{section}</p>
              <ul className="flex flex-col gap-0.5">
                {GUIDE_MODULES.filter((m) => m.section === section).map((m) => (
                  <GuideNavLink key={m.slug} href={`/guide/${m.slug}`} active={doc.slug === m.slug}>
                    {m.title}
                  </GuideNavLink>
                ))}
              </ul>
            </div>
          ))}
          {mod && doc.headings.length > 0 && (
            <nav aria-label="On this page (side)">
              <p className="mb-1.5 px-2 text-xs font-semibold tracking-wider text-neutral-600 uppercase">On this page</p>
              <ul className="flex flex-col gap-0.5">
                {doc.headings.map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} className="block rounded-md px-2 py-1 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900">
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </aside>
    </div>
  );
}

function GuideNavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn("block rounded-md px-2 py-1 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900", active && "bg-neutral-100 font-medium text-neutral-900")}
      >
        {children}
      </Link>
    </li>
  );
}
