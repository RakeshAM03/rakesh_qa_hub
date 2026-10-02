"use client";

import { useEffect, useState } from "react";
import { BookMarked, Copy, Download, Eye, FileDown, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Pagination } from "@/components/shared/pagination";
import { toastResponseError, useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { PageHeader } from "@/components/shell/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { copyText, downloadText } from "@/lib/browser";
import { formatDate } from "@/lib/format";
import { ImportDialog } from "./import-dialog";
import { PrRefLink } from "./pr-ref-link";
import { SaveCard } from "./save-card";
import { fetchEntry, type Entry, type EntrySummary, type SortKey } from "./types";
import { ViewSheet } from "./view-sheet";

const PAGE_SIZE = 10;

type CardState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; entry: Entry };

export function TcLibrary() {
  const [query, setQuery] = useState("");
  const q = useDebouncedValue(query.trim(), 300);
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<{ entries: EntrySummary[]; total: number } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [card, setCard] = useState<CardState>({ mode: "closed" });
  const [importOpen, setImportOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<Entry | null>(null);
  const [toDelete, setToDelete] = useState<EntrySummary | null>(null);
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  // Search or sort changes go back to page 1.
  const [lastFilter, setLastFilter] = useState({ q, sort });
  if (lastFilter.q !== q || lastFilter.sort !== sort) {
    setLastFilter({ q, sort });
    setPage(1);
  }

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q, sort, page: String(page), size: String(PAGE_SIZE) });
    fetch(`/api/tc-library?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => {
        setData({ entries: json.entries, total: json.total });
        setLoadError(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setLoadError(true);
      });
    return () => controller.abort();
  }, [q, sort, page, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  async function withEntry(id: string, fn: (entry: Entry) => void | Promise<unknown>) {
    try {
      await fn(await fetchEntry(id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load that entry.");
    }
  }

  function view(summary: EntrySummary) {
    setViewing(null);
    setViewOpen(true);
    void withEntry(summary.id, setViewing);
  }

  function edit(summary: EntrySummary) {
    void withEntry(summary.id, (entry) => {
      setCard({ mode: "edit", entry });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function exportOne(summary: EntrySummary) {
    void withEntry(summary.id, (e) => {
      const json = JSON.stringify(
        [{ name: e.name, prReference: e.prReference, output: e.output, createdBy: e.createdBy, createdAt: e.createdAt }],
        null,
        2,
      );
      const slug = e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "entry";
      downloadText(`tc-${slug}.json`, json, "application/json");
    });
  }

  async function confirmDelete() {
    const entry = toDelete;
    setToDelete(null);
    if (!entry) return;
    const res = await withPasscode((headers) => fetch(`/api/tc-library/${entry.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't delete the entry.");
    toast.success(`Deleted “${entry.name}”`);
    if (data?.entries.length === 1 && page > 1) setPage(page - 1);
    else refresh();
  }

  const libraryEmpty = data !== null && data.total === 0 && !q;

  return (
    <>
      <PageHeader
        title="TC Library"
        subtitle="Save Step 1 + Step 2 outputs from Claude sessions and reload them in future sessions."
        icon={BookMarked}
        iconClassName="text-teal-600"
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload /> Import JSON
            </Button>
            <Button
              onClick={() => setCard({ mode: "create" })}
              disabled={card.mode !== "closed"}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              <Plus /> New Entry
            </Button>
          </>
        }
      />

      {card.mode !== "closed" && (
        <SaveCard
          key={card.mode === "edit" ? card.entry.id : "new"}
          entry={card.mode === "edit" ? card.entry : undefined}
          onClose={() => setCard({ mode: "closed" })}
          onSaved={(entry, created) => {
            setCard({ mode: "closed" });
            toast.success(created ? `Saved “${entry.name}” to the library` : "Entry updated");
            if (created) {
              setQuery("");
              setSort("newest");
              setPage(1);
            }
            refresh();
          }}
        />
      )}

      <section aria-label="Library" className="flex flex-col gap-4">
        {!libraryEmpty && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, PR reference or content..."
                aria-label="Search the library"
                className="bg-card pl-9"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-full bg-card sm:w-44" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" asChild className="bg-card">
              <a href="/api/tc-library/export" download>
                <FileDown /> Export all
              </a>
            </Button>
          </div>
        )}

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Couldn&apos;t load the library.{" "}
            <button type="button" className="font-medium underline" onClick={refresh}>
              Try again
            </button>
          </div>
        )}

        {data === null && !loadError ? (
          <ul className="flex flex-col gap-3" aria-label="Loading entries">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="rounded-xl border border-neutral-200 bg-card p-4">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="mt-2 h-4 w-1/4" />
                <Skeleton className="mt-3 h-10 w-full" />
              </li>
            ))}
          </ul>
        ) : libraryEmpty ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-card px-6 py-16 text-center">
            <BookMarked className="size-10 text-teal-200" aria-hidden />
            <p className="max-w-sm text-neutral-600">
              No saved test plans yet. Click New Entry after Claude completes Step 2.
            </p>
            <Button
              onClick={() => setCard({ mode: "create" })}
              disabled={card.mode !== "closed"}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              <Plus /> New Entry
            </Button>
          </div>
        ) : data && data.entries.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 bg-card p-6 text-center text-sm text-neutral-500">
            No entries match “{q}”.
          </p>
        ) : (
          data && (
            <>
              <ul className="flex flex-col gap-3" aria-label="Saved test plans">
                {data.entries.map((entry) => (
                  <li
                    key={entry.id}
                    data-testid="tc-entry"
                    className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold break-words text-neutral-900">{entry.name}</h3>
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
                          <PrRefLink value={entry.prReference} />
                          <span>Saved by {entry.createdBy || "Anonymous"}</span>
                          <span>{formatDate(entry.createdAt)}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Button variant="ghost" size="sm" onClick={() => view(entry)}>
                          <Eye /> View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => withEntry(entry.id, (e) => copyText(e.output, "Output copied"))}
                        >
                          <Copy /> Copy
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => edit(entry)} aria-label={`Edit ${entry.name}`}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => exportOne(entry)}
                          aria-label={`Export ${entry.name} as JSON`}
                        >
                          <Download />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setToDelete(entry)}
                          aria-label={`Delete ${entry.name}`}
                          className="text-neutral-500 hover:text-red-600"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-3 font-mono text-xs whitespace-pre-wrap text-neutral-600">
                      {entry.preview}
                      {entry.outputLength > entry.preview.length && "…"}
                    </p>
                  </li>
                ))}
              </ul>
              <Pagination
                page={page}
                size={PAGE_SIZE}
                total={data.total}
                onPageChange={setPage}
                activeClassName="bg-teal-600 text-white hover:bg-teal-700"
              />
            </>
          )
        )}
      </section>

      <ViewSheet open={viewOpen} entry={viewing} onOpenChange={setViewOpen} />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(count) => {
          toast.success(`Imported ${count} ${count === 1 ? "entry" : "entries"}`);
          setPage(1);
          refresh();
        }}
      />
      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toDelete?.name}” will be removed from the library for everyone. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {passcodeDialog}
    </>
  );
}
