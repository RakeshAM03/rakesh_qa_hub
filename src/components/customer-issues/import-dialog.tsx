"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, FileUp } from "lucide-react";
import { toast } from "sonner";

import { toastResponseError } from "@/components/shared/use-admin-passcode";
import { useYourName } from "@/components/shared/your-name";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadText } from "@/lib/browser";
import { autoMap, buildRows, cellText, distinctValues, suggestCategory, TARGET_LABELS, TEMPLATE_EXAMPLE, TEMPLATE_HEADERS, type ImportTarget } from "@/lib/customer-issues/import";
import type { Lists } from "@/lib/customer-issues/model";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;
const IGNORE = "__ignore";
const NONE = "__none";

type Sheet = { name: string; headers: string[]; rows: Record<string, unknown>[] };

async function readFile(file: File): Promise<Sheet> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("The workbook has no sheets.");
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => (headers[col - 1] = cellText(cell.text)));
    const rows: Record<string, unknown>[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const r: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (!h) return;
        const v = row.getCell(i + 1).value;
        r[h] = v instanceof Date ? v : v && typeof v === "object" ? row.getCell(i + 1).text : v;
      });
      rows.push(r);
    });
    return { name: file.name, headers: headers.filter(Boolean), rows };
  }
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy" });
  return { name: file.name, headers: (parsed.meta.fields ?? []).filter(Boolean), rows: parsed.data };
}

/** Import CSV / Excel: map columns, map old "Type" values to categories, preview, import. */
export function ImportDialog({ open, onOpenChange, lists, onImported }: { open: boolean; onOpenChange: (o: boolean) => void; lists: Lists; onImported: () => void }) {
  const { name } = useYourName();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, ImportTarget | "">>({});
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSheet(null);
    setMapping({});
    setCategoryMap({});
    setError(null);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) return setError("That file is larger than 5 MB.");
    if (!/\.(csv|xlsx)$/i.test(file.name)) return setError("Choose a .csv or .xlsx file.");
    try {
      const s = await readFile(file);
      if (!s.headers.length) return setError("No header row found.");
      if (s.rows.length > MAX_ROWS) return setError(`That file has ${s.rows.length} rows — the limit is ${MAX_ROWS}. Split it into smaller files.`);
      const m = autoMap(s.headers);
      setSheet(s);
      setMapping(m);
      const catHeader = Object.entries(m).find(([, t]) => t === "category")?.[0];
      setCategoryMap(catHeader ? Object.fromEntries(distinctValues(s.rows, catHeader).map((v) => [v, suggestCategory(v, lists) ?? ""])) : {});
    } catch {
      setError("Couldn't read that file. Check it's a valid CSV or Excel (.xlsx) file.");
    }
  }

  const catHeader = Object.entries(mapping).find(([, t]) => t === "category")?.[0];
  const result = useMemo(() => (sheet ? buildRows(sheet.rows, mapping, categoryMap, lists, { qaOwner: name || null, today: new Date().toISOString().slice(0, 10) }) : null), [sheet, mapping, categoryMap, lists, name]);
  const used = new Set(Object.values(mapping).filter(Boolean));
  const missingRequired = (["issueKey", "summary"] as ImportTarget[]).filter((t) => !used.has(t));

  function setColumn(header: string, target: string) {
    const next = { ...mapping };
    if (target !== IGNORE) for (const [h, t] of Object.entries(next)) if (t === target) next[h] = "";
    next[header] = target === IGNORE ? "" : (target as ImportTarget);
    setMapping(next);
    const newCat = Object.entries(next).find(([, t]) => t === "category")?.[0];
    if (sheet && newCat !== catHeader) setCategoryMap(newCat ? Object.fromEntries(distinctValues(sheet.rows, newCat).map((v) => [v, suggestCategory(v, lists) ?? ""])) : {});
  }

  async function submit() {
    if (!result?.rows.length) return;
    setBusy(true);
    const res = await fetch("/api/customer-issues/issues/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: result.rows }) });
    setBusy(false);
    if (!res.ok) return toastResponseError(res, "Couldn't import the issues.");
    const d = await res.json();
    toast.success(`${d.added} issue${d.added === 1 ? "" : "s"} imported${d.skipped.length ? ` · ${d.skipped.length} skipped (already exist): ${d.skipped.slice(0, 5).join(", ")}${d.skipped.length > 5 ? "…" : ""}` : ""}`);
    onOpenChange(false);
    reset();
    onImported();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import customer issues</DialogTitle>
          <DialogDescription>CSV or Excel (.xlsx), up to {MAX_ROWS.toLocaleString()} rows / 5 MB. Columns are matched automatically — check them, map old &ldquo;Type&rdquo; values to RCA categories, then import. Issue keys that already exist are skipped.</DialogDescription>
        </DialogHeader>

        {!sheet ? (
          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 px-6 py-10 text-center hover:bg-neutral-50">
              <FileUp className="size-7 text-neutral-500" aria-hidden />
              <span className="font-medium text-neutral-900">Choose a CSV or Excel file</span>
              <input type="file" accept=".csv,.xlsx" className="sr-only" aria-label="Issue file" data-testid="ci-import-file" onChange={(e) => void pick(e.target.files?.[0])} />
            </label>
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => downloadText("customer-issues-template.csv", Papa.unparse([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]), "text/csv")}
            >
              <Download aria-hidden /> Download template
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <section aria-label="Column mapping">
              <h3 className="mb-2 text-sm font-semibold text-neutral-900">
                1. Columns in {sheet.name} ({sheet.rows.length} rows)
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {sheet.headers.map((h) => (
                  <div key={h} className="flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 truncate text-neutral-800" title={h}>
                      {h}
                    </span>
                    <Select value={mapping[h] || IGNORE} onValueChange={(v) => setColumn(h, v)}>
                      <SelectTrigger className="w-full" aria-label={`Map column ${h}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value={IGNORE}>Ignore</SelectItem>
                        {(Object.keys(TARGET_LABELS) as ImportTarget[]).map((t) => (
                          <SelectItem key={t} value={t}>
                            {TARGET_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {missingRequired.length > 0 && <p className="mt-2 text-sm text-red-700">Map a column to {missingRequired.map((t) => TARGET_LABELS[t]).join(" and ")}.</p>}
            </section>

            {catHeader && Object.keys(categoryMap).length > 0 && (
              <section aria-label="Category mapping">
                <h3 className="mb-1 text-sm font-semibold text-neutral-900">2. Map &ldquo;{catHeader}&rdquo; values to RCA categories</h3>
                <p className="mb-2 text-xs text-neutral-600">Suggestions are pre-selected — confirm or change each one.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.keys(categoryMap).map((v) => (
                    <div key={v} className="flex items-center gap-2 text-sm">
                      <span className="w-40 shrink-0 truncate font-medium text-neutral-800" title={v}>
                        {v}
                      </span>
                      <Select value={categoryMap[v] || NONE} onValueChange={(c) => setCategoryMap({ ...categoryMap, [v]: c === NONE ? "" : c })}>
                        <SelectTrigger className="w-full" aria-label={`Category for ${v}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          <SelectItem value={NONE}>Leave empty</SelectItem>
                          {lists.of("RCA_CATEGORY").map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {result && !missingRequired.length && (
              <section aria-label="Import preview" className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-neutral-900">{catHeader ? "3" : "2"}. Preview</h3>
                <p className="text-sm text-neutral-800" data-testid="ci-import-summary">
                  {result.rows.length} ready to import · {result.errors.length} with errors (skipped) · {result.warnings.length} warning{result.warnings.length === 1 ? "" : "s"}
                </p>
                {[...result.errors.map((e) => ({ ...e, kind: "Error" })), ...result.warnings.map((w) => ({ ...w, kind: "Warning" }))].slice(0, 12).map((p, i) => (
                  <p key={i} className={p.kind === "Error" ? "text-xs text-red-700" : "text-xs text-amber-800"}>
                    {p.kind} — row {p.row}: {p.message}
                  </p>
                ))}
                <div className="overflow-x-auto rounded-lg border border-neutral-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 text-neutral-700">
                      <tr>
                        <th className="px-2 py-1">Key</th>
                        <th className="px-2 py-1">Summary</th>
                        <th className="px-2 py-1">Created</th>
                        <th className="px-2 py-1">Disposition</th>
                        <th className="px-2 py-1">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 8).map((r) => (
                        <tr key={r.issueKey} className="border-t border-neutral-200">
                          <td className="px-2 py-1 font-mono">{r.issueKey}</td>
                          <td className="max-w-72 truncate px-2 py-1">{r.summary}</td>
                          <td className="px-2 py-1">{r.createdDate}</td>
                          <td className="px-2 py-1">{lists.name(r.dispositionId as string) ?? "—"}</td>
                          <td className="px-2 py-1">{lists.name(r.rcaCategoryId as string) ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <DialogFooter>
          {sheet && (
            <Button variant="outline" onClick={reset}>
              Choose another file
            </Button>
          )}
          <Button onClick={submit} disabled={busy || !result?.rows.length || missingRequired.length > 0} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
            Import {result?.rows.length ?? 0} issue{result?.rows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
