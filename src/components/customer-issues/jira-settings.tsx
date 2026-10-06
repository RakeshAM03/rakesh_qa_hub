"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Plug, Plus, RefreshCw, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";

import { toastResponseError, useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ProductMapping } from "@/lib/customer-issues/jira";
import type { Lists } from "@/lib/customer-issues/model";
import { formatDateTime } from "@/lib/format";

export type SyncLog = { id: string; trigger: string; startedAt: string; finishedAt: string | null; added: number; updated: number; unchanged: number; errors: { key?: string; message: string }[] | null };
export type JiraState = {
  connected: boolean;
  site: string | null;
  settings: { jql: string; productMapping: ProductMapping; scheduleEnabled: boolean; writeBackEnabled: boolean };
  logs: SyncLog[];
};

/** Loads /api/customer-issues/jira; `reload()` after a sync or save. */
export function useJira() {
  const [state, setState] = useState<JiraState | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/customer-issues/jira", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setState)
      .catch(() => undefined);
    return () => controller.abort();
  }, [version]);
  return { jira: state, reload: () => setVersion((v) => v + 1) };
}

/** Sync now: one manual sync (rate-limited); returns the log for a toast. */
export async function syncNow(): Promise<SyncLog | null> {
  const res = await fetch("/api/customer-issues/jira/sync", { method: "POST" });
  if (!res.ok) {
    await toastResponseError(res, "The sync failed.");
    return null;
  }
  const { log } = (await res.json()) as { log: SyncLog };
  const msg = `Jira sync: ${log.added} added · ${log.updated} updated · ${log.unchanged} unchanged`;
  if (log.errors?.length) toast.warning(`${msg} · ${log.errors.length} error${log.errors.length === 1 ? "" : "s"}: ${log.errors[0].message}`);
  else toast.success(msg);
  return log;
}

export function JiraSettings({ lists }: { lists: Lists }) {
  const { jira, reload } = useJira();
  const { withPasscode, passcodeDialog } = useAdminPasscode();
  const [jql, setJql] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ProductMapping | null>(null);
  const [syncing, setSyncing] = useState(false);

  if (!jira) return <Skeleton className="h-64 w-full" />;
  const currentJql = jql ?? jira.settings.jql;
  const currentMapping = mapping ?? jira.settings.productMapping;
  const products = lists.of("PRODUCT");
  const dirty = jql !== null || mapping !== null;

  async function save(body: Record<string, unknown>, done = "Jira settings saved") {
    const res = await withPasscode((headers) => fetch("/api/customer-issues/jira", { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    if (!res) return false;
    if (!res.ok) {
      await toastResponseError(res, "Couldn't save the Jira settings.");
      return false;
    }
    toast.success(done);
    reload();
    return true;
  }

  async function test() {
    const res = await withPasscode((headers) => fetch("/api/customer-issues/jira/test", { method: "POST", headers }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't reach Jira.");
    const d = await res.json();
    toast.success(`Connected to ${d.site} as ${d.account}`);
  }

  return (
    <div className="flex flex-col gap-6">
      {jira.connected ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          <Plug className="size-4" aria-hidden /> Jira connected: <span className="font-medium">{jira.site}</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={test}>
            <CheckCircle2 aria-hidden /> Test connection
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Unplug className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Jira not connected — use CSV import or add issues manually.</p>
            <p className="mt-1">
              To connect, the hub owner sets <code>JIRA_BASE_URL</code>, <code>JIRA_EMAIL</code> and <code>JIRA_API_TOKEN</code> as server environment variables. They are never shown in the browser. Everything else in this module works without Jira.
            </p>
          </div>
        </div>
      )}

      <section aria-label="Sync query" className="flex flex-col gap-2">
        <Label htmlFor="jira-jql">Sync query (JQL)</Label>
        <Textarea id="jira-jql" value={currentJql} onChange={(e) => setJql(e.target.value)} rows={3} className="font-mono text-sm" placeholder="project = DEMO AND type = Bug AND labels = customer-reported ORDER BY created DESC" />
        <p className="text-xs text-neutral-600">Issues matching this query are added or refreshed on each sync. Jira fields (summary, status, dates…) refresh every time; your classification, RCA, prevention, comments and regression cases are never overwritten.</p>
      </section>

      <section aria-label="Product mapping" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-neutral-900">Product mapping</h3>
        <p className="text-xs text-neutral-600">Map Jira project keys or components to products. A component mapping wins over a project mapping. The product is set when an issue first arrives (or while it&apos;s still empty).</p>
        {!products.length && <p className="text-sm text-amber-800">Add products in the Lists tab first.</p>}
        {currentMapping.map((m, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Select value={m.kind} onValueChange={(v) => setMapping(currentMapping.map((x, j) => (j === i ? { ...x, kind: v as "project" | "component" } : x)))}>
              <SelectTrigger className="w-36" aria-label={`Mapping ${i + 1} type`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="project">Project key</SelectItem>
                <SelectItem value="component">Component</SelectItem>
              </SelectContent>
            </Select>
            <Input value={m.value} onChange={(e) => setMapping(currentMapping.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="w-48" aria-label={`Mapping ${i + 1} value`} placeholder={m.kind === "project" ? "DEMO" : "Billing"} />
            <span className="text-sm text-neutral-600">→</span>
            <Select value={m.productId} onValueChange={(v) => setMapping(currentMapping.map((x, j) => (j === i ? { ...x, productId: v } : x)))}>
              <SelectTrigger className="w-52" aria-label={`Mapping ${i + 1} product`}>
                <SelectValue placeholder="Product" />
              </SelectTrigger>
              <SelectContent position="popper">
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon-sm" variant="ghost" onClick={() => setMapping(currentMapping.filter((_, j) => j !== i))} aria-label={`Remove mapping ${i + 1}`}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="w-fit" disabled={!products.length} onClick={() => setMapping([...currentMapping, { kind: "project", value: "", productId: products[0]?.id ?? "" }])}>
          <Plus aria-hidden /> Add mapping
        </Button>
      </section>

      {dirty && (
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              const body: Record<string, unknown> = {};
              if (jql !== null) body.jql = jql;
              if (mapping !== null) body.productMapping = mapping.filter((m) => m.value.trim() && m.productId);
              if (await save(body)) {
                setJql(null);
                setMapping(null);
              }
            }}
            className="bg-rose-700 text-rose-50 hover:bg-rose-800"
          >
            Save query and mapping
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setJql(null);
              setMapping(null);
            }}
          >
            Discard
          </Button>
        </div>
      )}

      <section aria-label="Sync options" className="flex flex-col gap-3">
        <label className="flex items-start gap-3 text-sm text-neutral-800">
          <Switch checked={jira.settings.scheduleEnabled} onCheckedChange={(v) => void save({ scheduleEnabled: v }, v ? "Scheduled sync on" : "Scheduled sync off")} aria-label="Scheduled sync" />
          <span>
            <span className="font-medium">Scheduled sync</span> — once a day (06:00 IST) through a Vercel cron job. Needs <code>CRON_SECRET</code> on the server.
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-neutral-800">
          <Switch checked={jira.settings.writeBackEnabled} onCheckedChange={(v) => void save({ writeBackEnabled: v }, v ? "Write-back on" : "Write-back off")} aria-label="Write RCA back to Jira" />
          <span>
            <span className="font-medium">Write the RCA back to Jira</span> — when an RCA is completed, post a comment with the category, stage, catchable and number of regression cases. Off by default; turn it on only if your Jira admin approves.
          </span>
        </label>
      </section>

      <section aria-label="Sync log" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-900">Sync log</h3>
          <Button
            size="sm"
            disabled={!jira.connected || syncing || !jira.settings.jql.trim()}
            onClick={async () => {
              setSyncing(true);
              await syncNow();
              setSyncing(false);
              reload();
            }}
            className="bg-rose-700 text-rose-50 hover:bg-rose-800"
          >
            <RefreshCw className={syncing ? "animate-spin" : undefined} aria-hidden /> Sync now
          </Button>
        </div>
        {jira.logs.length ? (
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-700">
                <tr>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Trigger</th>
                  <th className="px-3 py-2 text-right">Added</th>
                  <th className="px-3 py-2 text-right">Updated</th>
                  <th className="px-3 py-2 text-right">Unchanged</th>
                  <th className="px-3 py-2">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {jira.logs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(l.startedAt)}</td>
                    <td className="px-3 py-2">{l.finishedAt ? (l.trigger === "schedule" ? "Scheduled" : "Manual") : "Running…"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.added}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.updated}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.unchanged}</td>
                    <td className="px-3 py-2 text-xs text-red-700">{l.errors?.length ? l.errors.map((e) => `${e.key ? `${e.key}: ` : ""}${e.message}`).join("; ") : <span className="text-neutral-500">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">No syncs yet.</p>
        )}
      </section>
      {passcodeDialog}
    </div>
  );
}
