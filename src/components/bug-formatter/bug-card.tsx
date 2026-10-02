"use client";

import { useState, type DragEvent, type KeyboardEvent } from "react";
import { ChevronDown, Copy, GripVertical, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { bugToMarkdown } from "@/lib/bug-formatter/export";
import type { Bug } from "@/lib/bug-formatter/types";
import { copyText } from "@/lib/browser";
import { cn } from "@/lib/utils";
import { SeverityPill } from "./severity";

type BugCardProps = {
  bug: Bug;
  index: number;
  total: number;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (from: number, to: number) => void;
};

const isHttpUrl = (v: string) => /^https?:\/\//i.test(v);

export function BugCard({ bug, index, total, editing, onEdit, onDelete, onMove }: BugCardProps) {
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const detailsId = `bug-${bug.id}-details`;

  function onHandleKey(e: KeyboardEvent) {
    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      onMove(index, index - 1);
    } else if (e.key === "ArrowDown" && index < total - 1) {
      e.preventDefault();
      onMove(index, index + 1);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const from = Number(e.dataTransfer.getData("text/x-bug-index"));
    if (!Number.isNaN(from)) onMove(from, index);
  }

  return (
    <li
      data-testid="bug-card"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "rounded-lg border bg-white transition-colors",
        editing ? "border-orange-400 ring-1 ring-orange-200" : "border-neutral-200",
        dragOver && "border-orange-400 bg-orange-50/50",
      )}
    >
      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/x-bug-index", String(index));
            e.dataTransfer.effectAllowed = "move";
          }}
          onKeyDown={onHandleKey}
          aria-label={`Reorder ${bug.title}. Use arrow keys to move.`}
          className="cursor-grab rounded p-1 text-neutral-400 hover:text-neutral-700 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <SeverityPill severity={bug.severity} />
          <span className="line-clamp-2 text-sm font-medium break-words text-neutral-900">{bug.title}</span>
          <ChevronDown className={cn("ml-auto size-4 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
        </button>
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${bug.title}`}>
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => copyText(bugToMarkdown(bug), "Bug copied as Markdown")}
          aria-label={`Copy ${bug.title}`}
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`Delete ${bug.title}`}
          className="text-neutral-500 hover:text-red-600"
        >
          <Trash2 />
        </Button>
      </div>
      {open && (
        <dl id={detailsId} className="grid gap-2 border-t border-neutral-100 px-4 py-3 text-sm">
          {bug.environmentUrl && (
            <Detail label="Environment">
              {isHttpUrl(bug.environmentUrl) ? (
                <a href={bug.environmentUrl} target="_blank" rel="noopener noreferrer" className="break-all text-orange-600 hover:underline">
                  {bug.environmentUrl}
                </a>
              ) : (
                <span className="break-all">{bug.environmentUrl}</span>
              )}
            </Detail>
          )}
          {bug.steps.length > 0 && (
            <Detail label="Steps">
              <ol className="list-decimal space-y-0.5 pl-5">
                {bug.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </Detail>
          )}
          {bug.expected && <Detail label="Expected">{bug.expected}</Detail>}
          {bug.actual && <Detail label="Actual">{bug.actual}</Detail>}
          {bug.notes && <Detail label="Notes">{bug.notes}</Detail>}
          {!bug.environmentUrl && !bug.steps.length && !bug.expected && !bug.actual && !bug.notes && (
            <p className="text-neutral-500">No details yet. Use Edit to add steps and results.</p>
          )}
        </dl>
      )}
    </li>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-neutral-800">{children}</dd>
    </div>
  );
}
