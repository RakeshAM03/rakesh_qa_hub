"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FileUp, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { IssueDto } from "@/lib/customer-issues/server";

import { CiHeader } from "./ci-header";
import { BulkEditDialog, NewIssueDialog } from "./issue-dialogs";
import { ImportDialog } from "./import-dialog";
import { syncNow, useJira } from "./jira-settings";
import { IssueList } from "./issue-list";
import { useLists } from "./use-lists";

const ALL = "__all";

/** /customer-issues — product filter, (dashboard), issue list with Needs RCA queue. */
export function IssuesPage() {
  const router = useRouter();
  const { lists, error: listsError } = useLists();
  const [issues, setIssues] = useState<IssueDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [version, setVersion] = useState(0);
  const [product, setProduct] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"new" | "import" | "bulk" | null>(null);
  const { jira, reload: reloadJira } = useJira();
  const [syncing, setSyncing] = useState(false);
  const lastSync = jira?.logs.find((l) => l.finishedAt);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/customer-issues/issues", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => {
        setIssues(json.issues);
        setLoadError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [version]);
  const reload = () => setVersion((v) => v + 1);

  const filtered = useMemo(() => (issues ?? []).filter((i) => product === ALL || (product === "none" ? !i.productId : i.productId === product)), [issues, product]);

  return (
    <>
      <CiHeader
        actions={
          <>
            {jira?.connected && (
              <Button
                variant="outline"
                disabled={syncing || !jira.settings.jql.trim()}
                title={jira.settings.jql.trim() ? (lastSync ? `Last sync ${new Date(lastSync.startedAt).toLocaleString()}` : "Not synced yet") : "Set a JQL query in Settings → Jira"}
                onClick={async () => {
                  setSyncing(true);
                  await syncNow();
                  setSyncing(false);
                  reload();
                  reloadJira();
                }}
              >
                <RefreshCw className={syncing ? "animate-spin" : undefined} aria-hidden /> Sync now
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialog("import")} disabled={!lists}>
              <FileUp aria-hidden /> Import
            </Button>
            <Button onClick={() => setDialog("new")} disabled={!lists} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
              <Plus aria-hidden /> New issue
            </Button>
          </>
        }
      />
      {loadError || listsError ? (
        <p className="text-sm text-red-700">Couldn&apos;t load customer issues. Refresh to try again.</p>
      ) : !issues || !lists ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-neutral-800">Product</span>
            <Select value={product} onValueChange={setProduct}>
              <SelectTrigger className="w-56" aria-label="Product filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL}>All products</SelectItem>
                {lists.of("PRODUCT").map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
                <SelectItem value="none">No product set</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <IssueList issues={filtered} lists={lists} selected={selected} onSelect={setSelected} onBulkEdit={() => setDialog("bulk")} />
          <NewIssueDialog open={dialog === "new"} onOpenChange={(o) => setDialog(o ? "new" : null)} lists={lists} onCreated={(id) => router.push(`/customer-issues/${id}`)} />
          <ImportDialog open={dialog === "import"} onOpenChange={(o) => setDialog(o ? "import" : null)} lists={lists} onImported={reload} />
          <BulkEditDialog
            open={dialog === "bulk"}
            onOpenChange={(o) => setDialog(o ? "bulk" : null)}
            lists={lists}
            ids={[...selected]}
            onDone={() => {
              setSelected(new Set());
              reload();
            }}
          />
        </div>
      )}
    </>
  );
}
