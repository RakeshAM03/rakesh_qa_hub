"use client";

import { useEffect, useState } from "react";
import { BookMarked, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatDate } from "@/lib/format";

type PickerEntry = { id: string; name: string; prReference: string | null; createdAt: string };

type TcLibraryPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (entry: { id: string; name: string }) => void;
};

export function TcLibraryPicker({ open, onOpenChange, onPick }: TcLibraryPickerProps) {
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 300);
  const [entries, setEntries] = useState<PickerEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/tc-library?${new URLSearchParams({ q, size: "10" })}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        setEntries(data.entries);
        setFailed(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [open, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Load from TC Library</DialogTitle>
          <DialogDescription>
            Pick a saved Step 1 + Step 2 output. The prompt will tell Claude to skip Steps 1–2 and start from Step 3.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved test plans..."
            aria-label="Search saved test plans"
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {failed ? (
            <p className="py-6 text-center text-sm text-red-700">Couldn&apos;t load the library.</p>
          ) : entries === null ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">
              {q ? `No entries match “${q}”.` : "The TC Library is empty. Save a test plan there first."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ id: e.id, name: e.name });
                      onOpenChange(false);
                    }}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-teal-50"
                  >
                    <BookMarked className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-neutral-900">{e.name}</span>
                      <span className="block text-xs text-neutral-500">
                        {[e.prReference, formatDate(e.createdAt)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
