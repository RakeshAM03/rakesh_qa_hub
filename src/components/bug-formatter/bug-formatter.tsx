"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Pencil, Upload } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CsvTab } from "./csv-tab";
import { FindingsCard } from "./findings-card";
import { clearHandoff, parseHandoff, useHandoff } from "@/lib/handoff";
import type { BugInput } from "@/lib/bug-formatter/types";
import { ManualTab, type ManualPrefill } from "./manual-tab";
import { PasteTab } from "./paste-tab";
import { useBugs } from "./use-bugs";

const triggerClass =
  "h-11 flex-1 gap-2 rounded-none border-0 border-b-2 border-transparent text-neutral-500 shadow-none data-[state=active]:border-orange-500 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 data-[state=active]:shadow-none";

type Tab = "paste" | "manual" | "csv";

export function BugFormatter() {
  const { bugs, add, replace, remove, move, clear } = useBugs();
  const [tab, setTab] = useState<Tab>("paste");
  const [editingId, setEditingId] = useState<string>();
  const editing = bugs.find((b) => b.id === editingId);

  // A bug sent from another module opens the Manual tab, pre-filled.
  const rawHandoff = useHandoff("bug-formatter");
  const handoff = useMemo(() => parseHandoff<{ bug: BugInput; source: string }>(rawHandoff), [rawHandoff]);
  const [prefill, setPrefill] = useState<ManualPrefill | null>(null);
  if (handoff && handoff.handoffId !== prefill?.id) {
    setPrefill({ id: handoff.handoffId, bug: handoff.bug, source: handoff.source });
    setTab("manual");
    setEditingId(undefined);
  }
  useEffect(() => {
    if (handoff) clearHandoff("bug-formatter");
  }, [handoff]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <section aria-label="Add bugs" className="overflow-hidden rounded-xl border border-t-4 border-neutral-200 border-t-orange-500 bg-card shadow-xs">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
          <TabsList className="h-auto w-full rounded-none border-b border-neutral-200 bg-card p-0">
            <TabsTrigger value="paste" className={triggerClass}>
              <ClipboardList /> Paste from Claude
            </TabsTrigger>
            <TabsTrigger value="manual" className={triggerClass}>
              <Pencil /> Manual
            </TabsTrigger>
            <TabsTrigger value="csv" className={triggerClass}>
              <Upload /> CSV
            </TabsTrigger>
          </TabsList>
          <TabsContent value="paste" forceMount className="p-4 data-[state=inactive]:hidden sm:p-5">
            <PasteTab onAdd={(list) => add(list, "CLAUDE")} />
          </TabsContent>
          <TabsContent value="manual" forceMount className="p-4 data-[state=inactive]:hidden sm:p-5">
            <ManualTab
              editing={editing}
              prefill={prefill}
              onAdd={(bug) => {
                add([bug], "MANUAL");
                toast.success("Added");
              }}
              onSave={(id, bug) => {
                replace(id, bug);
                setEditingId(undefined);
                toast.success("Bug updated");
              }}
              onCancelEdit={() => setEditingId(undefined)}
            />
          </TabsContent>
          <TabsContent value="csv" forceMount className="p-4 data-[state=inactive]:hidden sm:p-5">
            <CsvTab onAdd={(list) => add(list, "CSV")} />
          </TabsContent>
        </Tabs>
      </section>

      <FindingsCard
        bugs={bugs}
        editingId={editingId}
        onEdit={(id) => {
          setEditingId(id);
          setTab("manual");
        }}
        onDelete={(id) => {
          remove(id);
          if (id === editingId) setEditingId(undefined);
        }}
        onMove={move}
        onClear={() => {
          clear();
          setEditingId(undefined);
        }}
      />
    </div>
  );
}
