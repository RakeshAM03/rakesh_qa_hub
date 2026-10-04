"use client";

import { useRef } from "react";
import { ChevronDown, Copy, Download, FolderPlus, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CollectionSummary = { id: string; name: string; requests: { id: string; name: string; method: string }[] };

export const METHOD_TONE: Record<string, string> = {
  GET: "text-green-700 dark:text-green-300",
  POST: "text-amber-700 dark:text-amber-300",
  PUT: "text-blue-700 dark:text-blue-300",
  PATCH: "text-purple-700 dark:text-purple-300",
  DELETE: "text-red-700 dark:text-red-300",
  HEAD: "text-neutral-600",
  OPTIONS: "text-neutral-600",
};

type Props = {
  collections: CollectionSummary[] | null;
  activeId?: string;
  dirty: boolean;
  onOpen: (requestId: string) => void;
  onNewCollection: () => void;
  onImport: (file: File) => void;
  onCollectionAction: (action: "rename" | "duplicate" | "export" | "delete", c: CollectionSummary) => void;
  onRequestAction: (action: "rename" | "duplicate" | "delete", r: { id: string; name: string }, collectionId: string) => void;
};

export function CollectionsSidebar({ collections, activeId, dirty, onOpen, onNewCollection, onImport, onCollectionAction, onRequestAction }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <>
      {/* Small screens: a dropdown */}
      <div className="lg:hidden">
        <Select value={activeId ?? ""} onValueChange={onOpen}>
          <SelectTrigger className="w-full" aria-label="Saved requests">
            <SelectValue placeholder={collections?.length ? "Open a saved request" : "No collections yet"} />
          </SelectTrigger>
          <SelectContent position="popper">
            {collections?.map((c) => (
              <SelectGroup key={c.id}>
                <SelectLabel>{c.name}</SelectLabel>
                {c.requests.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.method} {r.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={onNewCollection}>
            <FolderPlus className="size-4" aria-hidden /> New Collection
          </Button>
        </div>
      </div>

      {/* Large screens: the sidebar */}
      <aside aria-label="Collections" className="hidden rounded-xl border border-neutral-200 bg-card p-3 shadow-xs lg:block">
        <div className="mb-2 flex items-center gap-1">
          <h2 className="flex-1 px-1 text-sm font-semibold text-neutral-900">Collections</h2>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Import collection" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" />
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            data-testid="ap-import-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
        </div>
        <Button size="sm" className="mb-3 w-full bg-indigo-600 text-white hover:bg-indigo-700" onClick={onNewCollection}>
          <FolderPlus className="size-4" aria-hidden /> New Collection
        </Button>
        {collections === null ? (
          <p className="px-1 text-xs text-neutral-500">Loading…</p>
        ) : collections.length === 0 ? (
          <p className="px-1 text-sm text-neutral-500">No collections yet — create one to save requests.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {collections.map((c) => (
              <Collapsible key={c.id} defaultOpen asChild>
                <li>
                  <div className="group flex items-center">
                    <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-100">
                      <ChevronDown className="size-3.5 shrink-0 transition-transform [[data-state=closed]>&]:-rotate-90" aria-hidden />
                      <span className="truncate">{c.name}</span>
                      <span className="text-xs text-neutral-400">{c.requests.length}</span>
                    </CollapsibleTrigger>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-7" aria-label={`Actions for ${c.name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onCollectionAction("rename", c)}>
                          <Pencil /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onCollectionAction("duplicate", c)}>
                          <Copy /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onCollectionAction("export", c)}>
                          <Download /> Export JSON
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => onCollectionAction("delete", c)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CollapsibleContent>
                    {c.requests.length === 0 ? (
                      <p className="py-1 pl-6 text-xs text-neutral-500">No saved requests.</p>
                    ) : (
                      <ul className="ml-3 border-l border-neutral-200 pl-2" aria-label={`${c.name} requests`}>
                        {c.requests.map((r) => (
                          <li key={r.id} className="group flex items-center">
                            <button
                              type="button"
                              onClick={() => onOpen(r.id)}
                              aria-current={activeId === r.id ? "true" : undefined}
                              className={cn(
                                "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-neutral-100",
                                activeId === r.id && "bg-indigo-50 dark:bg-indigo-950/40",
                              )}
                            >
                              <span className={cn("w-12 shrink-0 font-mono text-[10px] font-bold", METHOD_TONE[r.method])}>{r.method}</span>
                              <span className="truncate text-neutral-800">{r.name}</span>
                              {activeId === r.id && dirty && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Unsaved changes" />}
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="size-7 opacity-60 group-hover:opacity-100" aria-label={`Actions for ${r.name}`}>
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => onRequestAction("rename", r, c.id)}>
                                  <Pencil /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onRequestAction("duplicate", r, c.id)}>
                                  <Copy /> Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => onRequestAction("delete", r, c.id)}>
                                  <Trash2 /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CollapsibleContent>
                </li>
              </Collapsible>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}
