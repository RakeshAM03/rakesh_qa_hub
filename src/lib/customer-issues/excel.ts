/**
 * Excel exports for the regression pack and run reports, in the hub's Standard Test Case Format
 * style (same header colours as the Test Case Generator workbook). ExcelJS loads only on export.
 */

import { numbered } from "@/lib/tcgen/types";

const PRIORITY: Record<string, string> = { P1: "P1 - Critical", P2: "P2 - High", P3: "P3 - Medium", P4: "P4 - Low" };

export type PackRow = {
  caseId: string;
  title: string;
  category: string;
  type: string;
  priority: string;
  automated: string;
  preconditions: string;
  steps: string[];
  testData: string;
  expectedResult: string;
  issueKey: string;
  product: string | null;
  module: string | null;
};

export const PACK_COLUMNS = ["ID", "Title", "Category", "Type", "Priority", "Automation", "Preconditions", "Steps", "Test data", "Expected result", "Linked issue key", "Product", "Module"] as const;
const WIDTHS = [24, 48, 16, 11, 14, 12, 36, 48, 30, 48, 16, 18, 18];
const AUTOMATION: Record<string, string> = { NO: "Manual", PLANNED: "Planned", YES: "Automated" };

export const packRowValues = (r: PackRow) => [r.caseId, r.title, r.category, r.type, PRIORITY[r.priority] ?? r.priority, AUTOMATION[r.automated] ?? r.automated, r.preconditions, numbered(r.steps), r.testData, r.expectedResult, r.issueKey, r.product ?? "", r.module ?? ""];

type Extra = { header: string; width: number; value: (i: number) => string };

/** Workbook bytes: one sheet of cases (+ optional extra columns, e.g. run results). */
export async function casesWorkbook(sheetName: string, rows: PackRow[], extra: Extra[] = []): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = [...PACK_COLUMNS.map((h, i) => ({ header: h, width: WIDTHS[i] })), ...extra.map((e) => ({ header: e.header, width: e.width }))];
  rows.forEach((r, i) => ws.addRow([...packRowValues(r), ...extra.map((e) => e.value(i))]));
  const header = ws.getRow(1);
  header.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  header.alignment = { vertical: "middle", wrapText: true };
  ws.eachRow((row, n) => {
    row.eachCell((cell) => {
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      if (n > 1) {
        cell.font = { name: "Arial", size: 10, bold: Number(cell.col) === 1 };
        cell.alignment = { vertical: "top", wrapText: true };
      }
    });
  });
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: PACK_COLUMNS.length + extra.length } };
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Saves bytes as a file in the browser. */
export function downloadBytes(filename: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
