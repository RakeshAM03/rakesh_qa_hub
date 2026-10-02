"use client";

import { Copy } from "lucide-react";

import { Markdown } from "@/components/shared/markdown";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { copyText } from "@/lib/browser";
import { formatDate } from "@/lib/format";
import { PrRefLink } from "./pr-ref-link";
import type { Entry } from "./types";

type ViewSheetProps = {
  open: boolean;
  entry: Entry | null;
  onOpenChange: (open: boolean) => void;
};

export function ViewSheet({ open, entry, onOpenChange }: ViewSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b border-neutral-200 pr-12">
          <SheetTitle>{entry?.name ?? "Loading…"}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {entry && (
                <>
                  <PrRefLink value={entry.prReference} />
                  <span>Saved by {entry.createdBy || "Anonymous"}</span>
                  <span>{formatDate(entry.createdAt)}</span>
                </>
              )}
            </div>
          </SheetDescription>
          {entry && (
            <Button
              size="sm"
              className="mt-2 w-fit bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => copyText(entry.output, "Output copied — paste it into Claude Code")}
            >
              <Copy /> Copy output
            </Button>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {entry ? (
            <Markdown>{entry.output}</Markdown>
          ) : (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
