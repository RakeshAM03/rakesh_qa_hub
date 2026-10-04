"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FileText, LayoutGrid, Search } from "lucide-react";

import { SeverityPill } from "@/components/bug-formatter/severity";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { IssueSeverity } from "@/lib/bug-tracker/schema";

type Results = {
  features: { id: string; name: string; team: { name: string } | null }[];
  issues: { id: string; title: string; severity: IssueSeverity; featurePage: { id: string; name: string } }[];
};

/** "Search issues..." — issue titles and features across all teams, as you type. */
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 250);
  const [results, setResults] = useState<Results | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q) return;
    const controller = new AbortController();
    fetch(`/api/bug-tracker/search?${new URLSearchParams({ q })}`, { signal: controller.signal })
      .then((res) => res.json())
      .then(setResults)
      .catch(() => {});
    return () => controller.abort();
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const shown = q && results;
  const empty = shown && results.features.length === 0 && results.issues.length === 0;

  return (
    <div ref={wrapRef} className="relative w-full sm:w-72" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
      <Input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search issues..."
        aria-label="Search issues and features"
        aria-expanded={open && !!shown}
        aria-controls="bug-search-results"
        role="combobox"
        className="bg-card pl-9"
      />
      {open && shown && (
        <div
          id="bug-search-results"
          className="absolute right-0 z-30 mt-1 max-h-96 w-full min-w-80 overflow-y-auto rounded-lg border border-neutral-200 bg-card p-1 shadow-lg"
        >
          {empty && <p className="px-3 py-4 text-center text-sm text-neutral-500">Nothing matches “{q}”.</p>}
          {results.features.length > 0 && (
            <ResultGroup label="Features">
              {results.features.map((f) => (
                <Link
                  key={f.id}
                  href={`/bug-tracker/${f.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-neutral-100"
                >
                  <LayoutGrid className="size-4 shrink-0 text-neutral-400" />
                  <span className="truncate font-medium">{f.name}</span>
                  {f.team && <span className="ml-auto shrink-0 text-xs text-neutral-500">{f.team.name}</span>}
                </Link>
              ))}
            </ResultGroup>
          )}
          {results.issues.length > 0 && (
            <ResultGroup label="Issues">
              {results.issues.map((i) => (
                <Link
                  key={i.id}
                  href={`/bug-tracker/${i.featurePage.id}?issue=${i.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2 rounded-md px-3 py-2 text-sm hover:bg-neutral-100"
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-neutral-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{i.title}</span>
                    <span className="block truncate text-xs text-neutral-500">{i.featurePage.name}</span>
                  </span>
                  <SeverityPill severity={i.severity} />
                </Link>
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
      {children}
    </div>
  );
}
