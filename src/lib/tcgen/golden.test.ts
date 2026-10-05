/**
 * Golden format test: the workbook exported for sample requirement 1 has the same STRUCTURE as
 * tests/fixtures/tcgen/golden-resume-upload.xlsx (sheet names, column order, widths, header
 * style, freeze pane, autofilter, COUNTIF summary blocks) — wording is not compared.
 */

import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";

import { generateChecklist } from "./checklist";
import { toXlsx, xlsxFileName } from "./excel";
import { defaultInput } from "./types";

const load = async (bytes: ArrayBuffer | Buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as ArrayBuffer);
  return wb;
};

let golden: ExcelJS.Workbook;
let ours: ExcelJS.Workbook;
let moduleName: string;

beforeAll(async () => {
  golden = await load(readFileSync("tests/fixtures/tcgen/golden-resume-upload.xlsx"));
  const requirement = readFileSync("tests/fixtures/tcgen/requirements/1-file-upload.txt", "utf8");
  const { result, requirement: req } = generateChecklist({ ...defaultInput(), requirement });
  moduleName = req.moduleName;
  ours = await load((await toXlsx(req.moduleName, requirement, result, result.testCases, "standard")).buffer as ArrayBuffer);
});

/** Comparable style of a cell: font flags/size/colour, fill colour, alignment. */
const style = (c: ExcelJS.Cell) => ({
  bold: !!c.font?.bold,
  size: c.font?.size,
  color: c.font?.color?.argb ?? null,
  name: c.font?.name,
  fill: c.fill && "fgColor" in c.fill ? (c.fill.fgColor?.argb ?? null) : null,
  // Unset alignment renders as Excel's defaults (general / bottom).
  h: c.alignment?.horizontal ?? "general",
  v: c.alignment?.vertical ?? "bottom",
  wrap: !!c.alignment?.wrapText,
});

describe("Excel export matches the golden workbook's structure", () => {
  it("has the same sheets in the same order", () => {
    expect(ours.worksheets.map((w) => w.name)).toEqual(golden.worksheets.map((w) => w.name));
    expect(ours.worksheets.map((w) => w.name)).toEqual(["Test Cases", "Summary", "Assumptions & Queries"]);
  });

  it("Test Cases: same columns, order and widths", () => {
    const g = golden.getWorksheet("Test Cases")!;
    const o = ours.getWorksheet("Test Cases")!;
    expect(o.getRow(1).values).toEqual(g.getRow(1).values);
    expect(o.columns.map((c) => c.width)).toEqual(g.columns.map((c) => c.width));
  });

  it("Test Cases: same header style, body style, freeze pane and autofilter", () => {
    const g = golden.getWorksheet("Test Cases")!;
    const o = ours.getWorksheet("Test Cases")!;
    for (let col = 1; col <= 10; col++) expect(style(o.getRow(1).getCell(col))).toEqual(style(g.getRow(1).getCell(col)));
    for (const col of [1, 2, 3, 4, 6, 7, 8, 9, 10]) expect(style(o.getRow(2).getCell(col)), `body column ${col}`).toEqual(style(g.getRow(2).getCell(col)));
    // Priority fills match per level.
    const fillFor = (ws: ExcelJS.Worksheet, label: string) => {
      let found: string | null = null;
      ws.eachRow((row, r) => {
        if (r > 1 && row.getCell(5).value === label && !found) found = style(row.getCell(5)).fill;
      });
      return found;
    };
    for (const p of ["P1 - Critical", "P2 - High", "P3 - Medium"]) expect(fillFor(o, p), p).toBe(fillFor(g, p));
    const view = (ws: ExcelJS.Worksheet) => ({ state: ws.views[0].state, xSplit: (ws.views[0] as { xSplit?: number }).xSplit, ySplit: (ws.views[0] as { ySplit?: number }).ySplit, topLeftCell: (ws.views[0] as { topLeftCell?: string }).topLeftCell });
    expect(view(o)).toEqual(view(g));
    expect(o.autoFilter).toBe(`A1:J${o.rowCount}`);
    expect(String(g.autoFilter)).toMatch(/^A1:J\d+$/);
  });

  it("Summary: title, requirement line and the four COUNTIF blocks in the same layout", () => {
    const g = golden.getWorksheet("Summary")!;
    const o = ours.getWorksheet("Summary")!;
    expect(o.columns.map((c) => c.width)).toEqual(g.columns.map((c) => c.width));
    expect(o.getCell("A1").value).toBe(`${moduleName} - Test Case Summary`);
    expect(style(o.getCell("A1"))).toEqual(style(g.getCell("A1")));
    expect(String(o.getCell("A2").value)).toMatch(/^Requirement: /);
    expect(style(o.getCell("A2"))).toEqual(style(g.getCell("A2")));

    const blocks = (ws: ExcelJS.Worksheet) => {
      const out: { title: string; col: string; rows: number; style: ReturnType<typeof style>; totalFormula: boolean }[] = [];
      ws.eachRow((row, r) => {
        if (row.getCell(2).value === "Count") {
          const title = String(row.getCell(1).value);
          let n = 0;
          let col = "";
          let rr = r + 1;
          while (ws.getCell(`A${rr}`).value !== "Total") {
            const f = (ws.getCell(`B${rr}`).value as { formula?: string })?.formula ?? "";
            const m = /^COUNTIF\('Test Cases'!\$([A-Z])\$2:\$\1\$\d+,A\d+\)$/.exec(f);
            expect(m, `${title} row ${rr}: ${f}`).not.toBeNull();
            col = m![1];
            n++;
            rr++;
          }
          const total = (ws.getCell(`B${rr}`).value as { formula?: string })?.formula ?? "";
          out.push({ title, col, rows: n, style: style(row.getCell(1)), totalFormula: total === `SUM(B${r + 1}:B${rr - 1})` });
        }
      });
      return out;
    };
    const gb = blocks(g);
    const ob = blocks(o);
    expect(ob.map((b) => [b.title, b.col, b.totalFormula])).toEqual(gb.map((b) => [b.title, b.col, b.totalFormula]));
    expect(ob.map((b) => b.title)).toEqual(["Category", "Type", "Priority", "Automation"]);
    ob.forEach((b, i) => expect(b.style).toEqual(gb[i].style));
    expect(ob.every((b) => b.rows > 0)).toBe(true);
  });

  it("Assumptions & Queries: same header and widths, numbered rows", () => {
    const g = golden.getWorksheet("Assumptions & Queries")!;
    const o = ours.getWorksheet("Assumptions & Queries")!;
    expect(o.getRow(1).values).toEqual(g.getRow(1).values);
    expect(style(o.getCell("A1"))).toEqual(style(g.getCell("A1")));
    expect(o.columns.map((c) => c.width)).toEqual(g.columns.map((c) => c.width));
    expect(o.getCell("A2").value).toBe(1);
    expect(o.rowCount).toBeGreaterThan(3);
  });

  it("names the file <Module_Name>_Test_Cases.xlsx", () => {
    expect(xlsxFileName(moduleName)).toBe("Resume_Upload_Test_Cases.xlsx");
    expect(xlsxFileName("Pay an Invoice")).toBe("Pay_an_Invoice_Test_Cases.xlsx");
  });
});
