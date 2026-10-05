/** Excel export: "Test Cases", "Summary" and (when present) "API" sheets. exceljs loads on demand. */

import { COLUMNS, rowValues } from "./export";
import { CATEGORIES, PRIORITIES, priorityLabel, type GenerationResult, type PriorityScheme, type TestCase } from "./types";

export async function toXlsx(title: string, r: Pick<GenerationResult, "summary" | "assumptions" | "questions">, cases: TestCase[], scheme: PriorityScheme): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rakesh QA Hub";

  const ws = wb.addWorksheet("Test Cases", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((header) => ({ header, key: header, width: header === "Title" || header === "Steps" || header === "Expected result" ? 50 : header === "ID" ? 14 : 18 }));
  ws.getRow(1).font = { bold: true };
  for (const c of cases) {
    const row = ws.addRow(rowValues(c, scheme));
    row.alignment = { wrapText: true, vertical: "top" };
  }

  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 28 }, { width: 90 }];
  sum.addRow(["Generated", title]).font = { bold: true };
  sum.addRow(["Summary", r.summary]);
  sum.addRow(["Total test cases", cases.length]);
  for (const cat of CATEGORIES) sum.addRow([cat, cases.filter((c) => c.category === cat).length]);
  for (const p of PRIORITIES) sum.addRow([`Priority ${priorityLabel(p, scheme)} (${p})`, cases.filter((c) => c.priority === p).length]);
  sum.addRow(["Automation candidates", cases.filter((c) => c.automationCandidate).length]);
  if (r.assumptions.length) sum.addRow(["Assumptions", r.assumptions.join("\n")]);
  if (r.questions.length) sum.addRow(["Open questions", r.questions.join("\n")]);
  sum.eachRow((row) => (row.alignment = { wrapText: true, vertical: "top" }));

  const api = cases.filter((c) => c.api);
  if (api.length) {
    const as = wb.addWorksheet("API", { views: [{ state: "frozen", ySplit: 1 }] });
    as.columns = [
      { header: "ID", width: 14 },
      { header: "Title", width: 40 },
      { header: "Method", width: 10 },
      { header: "Endpoint", width: 36 },
      { header: "Headers", width: 36 },
      { header: "Body", width: 40 },
      { header: "Expected status", width: 16 },
      { header: "Assertions", width: 40 },
    ];
    as.getRow(1).font = { bold: true };
    for (const c of api) {
      const a = c.api!;
      const row = as.addRow([
        c.id,
        c.title,
        a.method,
        a.endpoint,
        Object.entries(a.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n"),
        a.body === null || a.body === undefined ? "" : typeof a.body === "string" ? a.body : JSON.stringify(a.body, null, 2),
        a.expectedStatus ?? "",
        a.assertions.join("\n"),
      ]);
      row.alignment = { wrapText: true, vertical: "top" };
    }
  }
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
