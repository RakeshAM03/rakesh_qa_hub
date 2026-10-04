"use client";

import { useState } from "react";
import { CircleAlert, Copy, Download, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { bugsToJira, bugsToMarkdown, bugsToSlack } from "@/lib/bug-formatter/export";
import { severityCounts } from "@/lib/bug-formatter/list";
import { SEVERITIES, type Bug } from "@/lib/bug-formatter/types";
import { copyText, downloadText } from "@/lib/browser";
import { BugCard } from "./bug-card";
import { SeverityPill } from "./severity";

type FindingsCardProps = {
  bugs: Bug[];
  editingId?: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onClear: () => void;
};

export function FindingsCard({ bugs, editingId, onEdit, onDelete, onMove, onClear }: FindingsCardProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const counts = severityCounts(bugs);

  return (
    <section aria-labelledby="findings-title" className="flex flex-col rounded-xl border border-neutral-200 bg-card shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
        <h2 id="findings-title" className="text-base font-semibold text-neutral-900">
          Findings{bugs.length > 0 && ` (${bugs.length})`}
        </h2>
        {bugs.length > 0 && (
          <div className="flex gap-1.5" aria-label="Count by severity">
            {SEVERITIES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 text-xs text-neutral-600">
                <SeverityPill severity={s} />
                {counts[s]}
              </span>
            ))}
          </div>
        )}
      </header>

      {bugs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <CircleAlert className="size-10 text-neutral-300" aria-hidden />
          <p className="font-medium text-neutral-700">No bugs logged yet</p>
          <p className="text-sm text-neutral-500">
            Paste Claude&apos;s findings, add a bug manually, or upload a CSV to add your first bug.
          </p>
        </div>
      ) : (
        <>
          <ol className="flex flex-col gap-2 p-3" aria-label="Findings list">
            {bugs.map((bug, i) => (
              <BugCard
                key={bug.id}
                bug={bug}
                index={i}
                total={bugs.length}
                editing={bug.id === editingId}
                onEdit={() => onEdit(bug.id)}
                onDelete={() => {
                  onDelete(bug.id);
                  toast.success("Bug deleted");
                }}
                onMove={onMove}
              />
            ))}
          </ol>
          <footer className="flex flex-wrap gap-2 border-t border-neutral-100 p-3">
            <Button variant="outline" size="sm" onClick={() => copyText(bugsToJira(bugs), "Copied for Jira")}>
              <Copy /> Copy for Jira
            </Button>
            <Button variant="outline" size="sm" onClick={() => copyText(bugsToSlack(bugs), "Copied for Slack")}>
              <MessageSquare /> Copy for Slack
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadText("bug-report.md", bugsToMarkdown(bugs) + "\n", "text/markdown")}
            >
              <Download /> Download .md
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmClear(true)}
              className="ml-auto text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <Trash2 /> Clear all
            </Button>
          </footer>
        </>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all findings?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all {bugs.length} bugs from this browser. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onClear();
                toast.success("All findings cleared");
              }}
              className="bg-red-700 text-red-50 hover:bg-red-800"
            >
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
