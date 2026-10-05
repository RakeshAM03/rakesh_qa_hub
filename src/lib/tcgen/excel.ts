/**
 * Excel export in the Standard Test Case Format workbook layout (same for every requirement):
 * "Test Cases", "Summary" (live COUNTIF blocks) and "Assumptions & Queries". exceljs loads on demand.
 */

import type { Borders, Fill, Font, Worksheet } from "exceljs";

import { columnsFor, hasRefs, rowValues } from "./export";
import { CASE_TYPES, CATEGORIES, PRIORITIES, priorityLabel, type GenerationResult, type PriorityScheme, type TestCase } from "./types";

export const HEADER_BLUE = "FF1F4E78";
const GRID = "FFBFBFBF";
export const WIDTHS = [12, 38, 15, 11, 13, 12, 52, 62, 42, 66, 22];
const PRIORITY_FILL: Record<string, string> = { P1: "FFF8CBAD", P2: "FFFFE699", P3: "FFC6E0B4", P4: "FFD9D9D9" };

const font = (extra: Partial<Font> = {}): Partial<Font> => ({ name: "Arial", size: 10, ...extra });
const solid = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin: Partial<Borders> = {
  top: { style: "thin", color: { argb: GRID } },
  left: { style: "thin", color: { argb: GRID } },
  bottom: { style: "thin", color: { argb: GRID } },
  right: { style: "thin", color: { argb: GRID } },
};

/** "Resume Upload" → "Resume_Upload_Test_Cases.xlsx" */
export const xlsxFileName = (moduleName: string) => `${(moduleName.trim() || "Test Cases").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}_Test_Cases.xlsx`;

function testCasesSheet(ws: Worksheet, cases: TestCase[], scheme: PriorityScheme) {
  const withRef = hasRefs(cases);
  const cols = columnsFor(cases);
  ws.columns = cols.map((header, i) => ({ header, width: WIDTHS[i] }));
  const head = ws.getRow(1);
  head.height = 27.75;
  head.eachCell((c) => {
    c.font = font({ bold: true, color: { argb: "FFFFFFFF" } });
    c.fill = solid(HEADER_BLUE);
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = thin;
  });
  for (const tc of cases) {
    const row = ws.addRow(rowValues(tc, scheme, withRef));
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = font(col === 1 ? { bold: true } : {});
      c.alignment = { vertical: "top", wrapText: true, ...(col >= 3 && col <= 6 ? { horizontal: "center" } : {}) };
      c.border = thin;
    });
    row.getCell(5).fill = solid(PRIORITY_FILL[tc.priority]);
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1, topLeftCell: "C2", activeCell: "A1" }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, cases.length + 1), column: cols.length } };
}

function summarySheet(ws: Worksheet, moduleName: string, requirement: string, cases: TestCase[], scheme: PriorityScheme) {
  ws.columns = [{ width: 24 }, { width: 10 }];
  const last = cases.length + 1;
  ws.getCell("A1").value = `${moduleName || "Test Cases"} - Test Case Summary`;
  ws.getCell("A1").font = font({ bold: true, size: 13 });
  const req = requirement.replace(/\s+/g, " ").trim();
  ws.getCell("A2").value = `Requirement: ${req.length > 300 ? `${req.slice(0, 297)}…` : req}`;
  ws.getCell("A2").font = font({ italic: true });

  const blocks: { title: string; col: string; values: string[]; of: (c: TestCase) => string }[] = [
    { title: "Category", col: "C", values: [...CATEGORIES].sort((a, b) => a.localeCompare(b)), of: (c) => c.category },
    { title: "Type", col: "D", values: CASE_TYPES, of: (c) => c.type },
    { title: "Priority", col: "E", values: PRIORITIES.map((p) => priorityLabel(p, scheme)).filter((v, i, a) => a.indexOf(v) === i), of: (c) => priorityLabel(c.priority, scheme) },
    { title: "Automation", col: "F", values: ["Yes", "No"], of: (c) => (c.automationCandidate ? "Yes" : "No") },
  ];
  let r = 4;
  for (const b of blocks) {
    const present = b.values.filter((v) => cases.some((c) => b.of(c) === v));
    const header = ws.getRow(r);
    header.values = [b.title, "Count"];
    header.eachCell((c) => {
      c.font = font({ bold: true, size: 11, color: { argb: "FFFFFFFF" } });
      c.fill = solid(HEADER_BLUE);
    });
    const first = r + 1;
    for (const v of present) {
      r++;
      ws.getCell(`A${r}`).value = v;
      ws.getCell(`B${r}`).value = { formula: `COUNTIF('Test Cases'!$${b.col}$2:$${b.col}$${last},A${r})`, result: cases.filter((c) => b.of(c) === v).length };
      ws.getRow(r).eachCell((c) => (c.font = font({ size: 11 })));
    }
    r++;
    ws.getCell(`A${r}`).value = "Total";
    ws.getCell(`B${r}`).value = { formula: `SUM(B${first}:B${r - 1})`, result: cases.length };
    ws.getRow(r).eachCell((c) => (c.font = font({ bold: true, size: 11 })));
    r += 2;
  }
}

function assumptionsSheet(ws: Worksheet, result: Pick<GenerationResult, "assumptions" | "questions">) {
  ws.columns = [{ width: 5 }, { width: 100 }];
  const head = ws.getRow(1);
  head.values = ["#", "Assumption / Open question to confirm with PO/Dev"];
  head.eachCell((c) => {
    c.font = font({ bold: true, size: 11, color: { argb: "FFFFFFFF" } });
    c.fill = solid(HEADER_BLUE);
  });
  [...result.assumptions, ...result.questions].forEach((text, i) => {
    const row = ws.addRow([i + 1, text]);
    row.eachCell((c) => {
      c.font = font();
      c.alignment = { vertical: "top", wrapText: true };
    });
  });
}

export async function toXlsx(
  moduleName: string,
  requirement: string,
  result: Pick<GenerationResult, "assumptions" | "questions">,
  cases: TestCase[],
  scheme: PriorityScheme,
): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rakesh QA Hub";
  testCasesSheet(wb.addWorksheet("Test Cases"), cases, scheme);
  summarySheet(wb.addWorksheet("Summary"), moduleName, requirement, cases, scheme);
  assumptionsSheet(wb.addWorksheet("Assumptions & Queries"), result);
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
