/** Excel (.xlsx) export via exceljs, loaded only when someone exports. */

import { cellText } from "./export";
import type { Dataset, FieldValue, GenOptions } from "./types";

/** Excel's limit per cell. */
const MAX_CELL = 32_767;

/** Sheet names: max 31 chars, none of : \ / ? * [ ] */
export function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet1";
}

function cellValue(v: FieldValue): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = cellText(v);
  return s.length > MAX_CELL ? s.slice(0, MAX_CELL) : s;
}

export async function toXlsx(ds: Pick<Dataset, "columns" | "rows">, o: GenOptions["xlsx"]): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rakesh QA Hub";
  const ws = wb.addWorksheet(sheetName(o.sheet), o.freezeHeader ? { views: [{ state: "frozen", ySplit: 1 }] } : undefined);
  ws.columns = ds.columns.map((c) => ({ header: c, key: c }));
  ws.getRow(1).font = { bold: true };
  for (const row of ds.rows) ws.addRow(ds.columns.map((c) => cellValue(row[c])));
  if (o.autoFit) {
    const sample = ds.rows.slice(0, 500);
    ds.columns.forEach((c, i) => {
      const longest = sample.reduce((m, r) => Math.max(m, cellText(r[c]).length), c.length);
      ws.getColumn(i + 1).width = Math.min(60, Math.max(8, longest + 2));
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
