"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

import { toastResponseError, useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AUTOMATION_LABELS, SEVERITIES } from "@/config/customer-issues";
import { casesWorkbook, downloadBytes } from "@/lib/customer-issues/excel";
import type { CaseDto } from "@/lib/customer-issues/server";

import { CiHeader } from "./ci-header";
import { useLists } from "./use-lists";

type PackCase = CaseDto & { issue: { id: string; issueKey: string; summary: string; severity: string | null; rcaCategoryId: string | null } };
const ALL = "__all";

export function PackPage() {
  const { lists } = useLists();
  const [cases, setCases] = useState<PackCase[] | null>(null);
  const [version, setVersion] = useState(0);
  const [f, setF] = useState({ product: ALL, module: ALL, category: ALL, severity: ALL, automated: ALL });
  const [showRetired, setShowRetired] = useState(false);
  const [retiring, setRetiring] = useState<PackCase | null>(null);
  const [reason, setReason] = useState("");
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/customer-issues/pack", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => setCases(j.cases))
      .catch(() => undefined);
    return () => controller.abort();
  }, [version]);

  const pack = useMemo(() => (cases ?? []).filter((c) => c.mandatory && !c.retired), [cases]);
  const shown = useMemo(
    () =>
      (showRetired ? (cases ?? []).filter((c) => c.retired) : pack).filter(
        (c) =>
          (f.product === ALL || (f.product === "none" ? !c.productId : c.productId === f.product)) &&
          (f.module === ALL || (c.module ?? "") === f.module) &&
          (f.category === ALL || c.issue.rcaCategoryId === f.category) &&
          (f.severity === ALL || c.issue.severity === f.severity) &&
          (f.automated === ALL || c.automated === f.automated),
      ),
    [cases, pack, f, showRetired],
  );
  const modules = [...new Set((cases ?? []).map((c) => c.module ?? "").filter(Boolean))].sort();
  const automated = shown.filter((c) => c.automated === "YES").length;
  const byGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of shown) {
      const k = `${lists?.name(c.productId) ?? "No product"} · ${c.module || "No module"}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [shown, lists]);

  async function exportExcel() {
    if (!lists) return;
    const bytes = await casesWorkbook(
      "Regression pack",
      shown.map((c) => ({ ...c, issueKey: c.issue.issueKey, product: lists.name(c.productId) })),
    );
    downloadBytes(`Customer_Issue_Regression_Pack.xlsx`, bytes);
  }

  async function retire(c: PackCase, retired: boolean, why?: string) {
    const res = await withPasscode((headers) => fetch(`/api/customer-issues/cases/${c.id}/retire`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ retired, reason: why }) }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't update the case.");
    toast.success(retired ? `${c.caseId} retired` : `${c.caseId} is back in the pack`);
    setRetiring(null);
    setReason("");
    setVersion((v) => v + 1);
  }

  const sel = (key: keyof typeof f, label: string, options: { value: string; label: string }[], all: string) => (
    <Select value={f[key]} onValueChange={(v) => setF({ ...f, [key]: v })}>
      <SelectTrigger className="w-48" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={ALL}>{all}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <CiHeader
        title="Mandatory regression pack"
        subtitle="Every mandatory regression case from every customer issue — run them before each release."
        actions={
          <Button variant="outline" onClick={exportExcel} disabled={!shown.length}>
            <FileSpreadsheet aria-hidden /> Export Excel
          </Button>
        }
      />
      {!cases || !lists ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="grid gap-3 sm:grid-cols-3" aria-label="Pack counts">
            <Tile label={showRetired ? "Retired cases" : "Mandatory cases"} value={shown.length} />
            <Tile label="Automated" value={automated} />
            <Tile label="Manual (incl. planned)" value={shown.length - automated} />
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            {sel("product", "Product", [...lists.of("PRODUCT").map((p) => ({ value: p.id, label: p.name })), { value: "none", label: "No product" }], "All products")}
            {sel("module", "Module", modules.map((m) => ({ value: m, label: m })), "All modules")}
            {sel("category", "RCA category", lists.of("RCA_CATEGORY").map((c) => ({ value: c.id, label: c.name })), "All RCA categories")}
            {sel("severity", "Severity", SEVERITIES.map((s) => ({ value: s, label: s })), "All severities")}
            {sel("automated", "Automated", Object.entries(AUTOMATION_LABELS).map(([v, l]) => ({ value: v, label: `Automated: ${l}` })), "Any automation")}
            <label className="ml-auto flex items-center gap-2 text-sm text-neutral-800">
              <Switch checked={showRetired} onCheckedChange={setShowRetired} aria-label="Show retired cases" /> Show retired
            </label>
          </div>
          {byGroup.length > 0 && (
            <p className="text-xs text-neutral-700">
              {byGroup.slice(0, 8).map(([k, n]) => `${k}: ${n}`).join(" · ")}
              {byGroup.length > 8 ? " · …" : ""}
            </p>
          )}
          {!shown.length ? (
            <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-700">
              {showRetired ? "No retired cases." : pack.length ? "No cases match these filters." : "The pack is empty. Open a Valid Bug issue and generate its regression cases."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-card">
              <table className="w-full min-w-[900px] text-left text-sm" aria-label="Regression pack">
                <thead className="border-b border-neutral-200 text-xs font-medium tracking-wide text-neutral-600 uppercase">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Linked issue</th>
                    <th className="px-3 py-2">Product · module</th>
                    <th className="px-3 py-2">RCA category</th>
                    <th className="px-3 py-2">Severity</th>
                    <th className="px-3 py-2">Automated</th>
                    <th className="px-3 py-2">{showRetired ? "Reason" : ""}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {shown.map((c) => (
                    <tr key={c.id} className="align-top" data-testid="pack-row">
                      <td className="px-3 py-2 font-mono text-xs font-semibold whitespace-nowrap text-rose-800">{c.caseId}</td>
                      <td className="max-w-96 px-3 py-2 text-neutral-900">{c.title}</td>
                      <td className="px-3 py-2">
                        <Link href={`/customer-issues/${c.issue.id}`} className="font-mono text-xs text-rose-800 hover:underline">
                          {c.issue.issueKey}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-neutral-700">
                        {lists.name(c.productId) ?? "—"}
                        {c.module && <span className="block text-xs text-neutral-600">{c.module}</span>}
                      </td>
                      <td className="px-3 py-2 text-neutral-700">{lists.name(c.issue.rcaCategoryId) ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-neutral-700">{c.issue.severity ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge className={c.automated === "YES" ? "bg-green-100 font-normal text-green-800" : "bg-neutral-100 font-normal text-neutral-700"}>{AUTOMATION_LABELS[c.automated]}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {c.retired ? (
                          <span className="flex items-center justify-end gap-2 text-xs text-neutral-700">
                            {c.retiredReason}
                            <Button size="sm" variant="ghost" onClick={() => void retire(c, false)}>
                              <ArchiveRestore aria-hidden /> Bring back
                            </Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setRetiring(c)} aria-label={`Retire ${c.caseId}`}>
                            <Archive aria-hidden /> Retire
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <Dialog open={!!retiring} onOpenChange={(o) => !o && setRetiring(null)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (retiring && reason.trim()) void retire(retiring, true, reason.trim());
            }}
            className="flex flex-col gap-3"
          >
            <DialogHeader>
              <DialogTitle>Retire {retiring?.caseId}</DialogTitle>
              <DialogDescription>For a feature that was removed. The case leaves the pack but stays in the history. Needs the admin passcode.</DialogDescription>
            </DialogHeader>
            <Label htmlFor="pack-retire-reason">Reason</Label>
            <Input id="pack-retire-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Feature removed in v3.0" autoFocus />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRetiring(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!reason.trim()} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
                Retire case
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {passcodeDialog}
    </>
  );
}

export function Tile({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <li className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs">
      <p className="text-xs font-medium tracking-wide text-neutral-600 uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone ?? "text-neutral-900"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-neutral-600">{hint}</p>}
    </li>
  );
}
