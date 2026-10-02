import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, Sparkles, Workflow } from "lucide-react";

import { navItems } from "@/config/nav";
import { cn } from "@/lib/utils";

const HIGHLIGHTS = [
  { icon: Bot, text: "Claude-ready prompts" },
  { icon: Workflow, text: "GitHub Actions in one place" },
  { icon: CheckCircle2, text: "Playwright-tested" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-card/70 px-6 py-10 shadow-sm backdrop-blur-sm sm:px-10 sm:py-14">
        <div
          aria-hidden
          className="ai-gradient pointer-events-none absolute -top-24 -right-24 size-72 rounded-full opacity-25 blur-3xl"
        />
        <div
          aria-hidden
          className="ai-gradient pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full opacity-15 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <span className="ai-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
            <Sparkles className="size-3.5" aria-hidden /> AI-assisted QA toolkit
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
            <span className="ai-gradient-text">Rakesh QA Hub</span>
          </h1>
          <p className="mt-4 text-base text-neutral-600 sm:text-lg">
            One place for everyday QA work — track bugs and time, follow CI runs, and turn PRs into
            Claude-powered test sessions, reviews and clean bug reports.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-neutral-600" aria-label="Highlights">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="inline-flex items-center gap-1.5">
                <Icon className="size-4 text-[color-mix(in_oklab,var(--accent-1)_75%,var(--foreground))]" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/pr-qa-session"
              className="ai-gradient inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium text-white shadow-md transition hover:opacity-90"
            >
              <Sparkles className="size-4" aria-hidden /> Start a PR QA session
            </Link>
            <Link
              href="/bug-tracker"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-300 bg-card px-5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100"
            >
              Open Bug Tracker <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="modules-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="modules-title" className="text-lg font-semibold text-neutral-900">
              Modules
            </h2>
            <p className="text-sm text-neutral-500">Pick a module to get started.</p>
          </div>
          <span className="hidden items-center gap-1.5 text-xs text-neutral-500 sm:inline-flex">
            <span className="ai-gradient size-2 rounded-full" aria-hidden /> AI-powered
          </span>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Modules">
          {navItems.map(({ title, href, icon: Icon, description, tone, ai }) => (
            <li key={href}>
              <Link
                href={href}
                className="glow-card group flex h-full flex-col gap-3 rounded-xl border border-neutral-200 bg-card/80 p-5 shadow-xs backdrop-blur-sm transition hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3">
                  <span className={cn("flex size-10 items-center justify-center rounded-lg", tone)}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="flex-1 text-base font-semibold text-neutral-900">{title}</h3>
                  {ai && (
                    <span className="ai-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                      <Sparkles className="size-3" aria-hidden /> AI
                    </span>
                  )}
                </div>
                <p className="flex-1 text-sm text-neutral-500">{description}</p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-neutral-700 group-hover:text-neutral-900">
                  Open <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
