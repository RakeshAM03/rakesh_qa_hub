import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { navItems } from "@/config/nav";

export default function HomePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Rakesh QA Hub</h1>
        <p className="mt-2 text-neutral-500">
          One place for everyday QA work. Pick a module to get started.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Modules">
        {navItems.map(({ title, href, icon: Icon, description }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition hover:border-neutral-300 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
              </div>
              <p className="flex-1 text-sm text-neutral-500">{description}</p>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-neutral-700 group-hover:text-neutral-900">
                Open <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
