import ExcelJS from "exceljs";
import { faker as enIN } from "@faker-js/faker/locale/en_IN";
import { load } from "js-yaml";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

import { toXlsx, sheetName } from "./excel";
import { escapeXml, exportText, fileName, inferSqlKind, quoteIdent, quoteString, sqlLiteral, toDelimited, toJson, toJsonLines, toSql, toXml, toYaml, xmlName } from "./export";
import { makeField } from "./field-types";
import { generateDataset } from "./generate";
import { defaultOptions } from "./presets";
import { javaTestNgSnippet, playwrightSnippet } from "./snippets";
import type { Dataset, Field, GenOptions } from "./types";

const o = defaultOptions();
const ds = (rows: Dataset["rows"], columns = Object.keys(rows[0] ?? {})): Dataset => ({ columns, rows, edges: rows.map(() => null), edgeCount: 0, seed: 1 });
const field = (name: string, type: string, options: Field["options"] = {}) => {
  const f = makeField(name, type);
  return { ...f, options: { ...f.options, ...options } };
};

const tricky = ds([
  { id: 1, name: 'He said "hi", then left', note: "line1\nline2", nested: { a: [1, 2] }, empty: null, flag: true },
  { id: 2, name: "  padded  ", note: "plain", nested: null, empty: "", flag: false },
]);

describe("CSV / TSV", () => {
  it("quotes only what needs quoting and doubles quotes", () => {
    const csv = toDelimited(tricky, o.csv);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,name,note,nested,empty,flag");
    expect(csv).toContain('"He said ""hi"", then left"');
    expect(csv).toContain('"line1\nline2"');
    expect(csv).toContain('"{""a"":[1,2]}"');
    expect(csv).toContain('"  padded  "');
    expect(csv).toContain('"{""a"":[1,2]}",,true\n');
    expect(csv).toContain('2,"  padded  ",plain,,,false\n');
  });

  it("supports quote-all, no header, CRLF, BOM and a custom delimiter", () => {
    const csv = toDelimited(ds([{ a: "x", b: 1 }]), { delimiter: ";", quoteAll: true, header: false, lineEnding: "crlf", bom: true });
    expect(csv).toBe('﻿"x";"1"\r\n');
  });

  it("TSV uses tabs and quotes values containing tabs", () => {
    const tsv = exportText("tsv", ds([{ a: "x\ty", b: 2 }]), [], o, false);
    expect(tsv).toBe('a\tb\n"x\ty"\t2\n');
  });
});

describe("JSON, JSON Lines and YAML", () => {
  it("JSON can be minified and wrapped in a root key", () => {
    expect(JSON.parse(toJson(tricky, { pretty: true, rootKey: "" }))).toEqual(tricky.rows);
    expect(toJson(ds([{ a: 1 }]), { pretty: false, rootKey: "users" })).toBe('{"users":[{"a":1}]}\n');
  });

  it("JSON Lines writes one object per line", () => {
    const lines = toJsonLines(tricky).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).nested).toEqual({ a: [1, 2] });
  });

  it("YAML round-trips, keeping look-alike strings as strings", () => {
    const rows = [{ a: "true", b: "007", c: null, d: "line\nx", e: "key: value" }];
    expect(load(toYaml(ds(rows), { pretty: true, rootKey: "" }))).toEqual(rows);
  });
});

describe("XML", () => {
  it("escapes special characters and replaces characters XML can't hold", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
    expect(escapeXml("null\u0000byte")).toBe("null�byte");
  });

  it("makes valid element names", () => {
    expect(xmlName("first name")).toBe("first_name");
    expect(xmlName("1st")).toBe("_1st");
    expect(xmlName("xmlThing")).toBe("_xmlThing");
  });

  it("writes rows, nested objects, arrays and empty values that parse back", () => {
    const xml = toXml(ds([{ id: 1, "user name": "<b>A&B</b>", tags: ["x", "y"], addr: { city: "Pune" }, gone: null }]), { root: "users", row: "user" });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<users>')).toBe(true);
    expect(xml).toContain("<user_name>&lt;b&gt;A&amp;B&lt;/b&gt;</user_name>");
    expect(xml).toContain("<gone/>");
    const parsed = new XMLParser().parse(xml);
    expect(parsed.users.user.tags.item).toEqual(["x", "y"]);
    expect(parsed.users.user.addr.city).toBe("Pune");
  });
});

describe("SQL", () => {
  it("quotes identifiers per dialect", () => {
    expect(quoteIdent('we"ird', "postgresql")).toBe('"we""ird"');
    expect(quoteIdent("a`b", "mysql")).toBe("`a``b`");
    expect(quoteIdent("a]b", "sqlserver")).toBe("[a]]b]");
  });

  it("quotes strings per dialect", () => {
    expect(quoteString("O'Brien", "postgresql")).toBe("'O''Brien'");
    expect(quoteString("back\\slash'", "mysql")).toBe("'back\\\\slash'''");
    expect(quoteString("नमस्ते", "sqlserver")).toBe("N'नमस्ते'");
    expect(quoteString("null\u0000byte", "sqlite")).toBe("'nullbyte'");
    expect(quoteString("' OR '1'='1", "oracle")).toBe("''' OR ''1''=''1'");
  });

  it("writes booleans, numbers, nulls and JSON per dialect", () => {
    expect(sqlLiteral(true, "postgresql")).toBe("TRUE");
    expect(sqlLiteral(true, "sqlserver")).toBe("1");
    expect(sqlLiteral(false, "oracle")).toBe("0");
    expect(sqlLiteral(null, "mysql")).toBe("NULL");
    expect(sqlLiteral(1.5, "sqlite")).toBe("1.5");
    expect(sqlLiteral({ a: "it's" }, "postgresql")).toBe(`'{"a":"it''s"}'`);
  });

  it("batches INSERTs and adds CREATE TABLE with inferred types", () => {
    const fields = [field("id", "sequence"), field("name", "fullName"), field("price", "price"), field("active", "boolean"), field("joined", "date")];
    const data = generateDataset(enIN, fields, { ...o, rows: 5, seed: 7, refDate: "2026-06-15" });
    const sql = toSql(data, fields, { table: "users", dialect: "postgresql", batchSize: 2, createTable: true }, false);
    expect(sql).toContain('CREATE TABLE "users" (\n  "id" BIGINT,\n  "name" VARCHAR(255),\n  "price" NUMERIC(18,6),\n  "active" BOOLEAN,\n  "joined" DATE\n);');
    expect(sql.match(/INSERT INTO "users"/g)).toHaveLength(3);
  });

  it("uses INSERT ALL for Oracle and caps SQL Server batches at 1000", () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ n: i }));
    const fields = [field("n", "integer")];
    expect(toSql(ds(rows.slice(0, 2)), fields, { table: "t", dialect: "oracle", batchSize: 10, createTable: false }, false)).toBe(
      'INSERT ALL\n  INTO "t" ("n") VALUES (0)\n  INTO "t" ("n") VALUES (1)\nSELECT 1 FROM DUAL;\n',
    );
    const ms = toSql(ds(rows), fields, { table: "t", dialect: "sqlserver", batchSize: 5000, createTable: false }, false);
    expect(ms.match(/INSERT INTO/g)).toHaveLength(2);
  });

  it("falls back to text for columns with edge cases or non-ISO dates", () => {
    const fields = [field("n", "integer"), field("d", "date", { format: "DD/MM/YYYY" })];
    const data = ds([{ n: "abc", d: "01/02/2024" }]);
    data.edges = [{ n: "text" }];
    expect(inferSqlKind(fields[0], data)).toBe("text");
    expect(inferSqlKind(fields[1], data)).toBe("text");
  });
});

describe("Excel", () => {
  it("writes a header row, typed cells, frozen header and a clean sheet name", async () => {
    const bytes = await toXlsx(tricky, { sheet: "My: data/2024?", freezeHeader: true, autoFit: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe(sheetName("My: data/2024?"));
    expect(ws.getRow(1).values).toEqual([undefined, "id", "name", "note", "nested", "empty", "flag"]);
    expect(ws.getCell("A2").value).toBe(1);
    expect(ws.getCell("F2").value).toBe(true);
    expect(ws.getCell("D2").value).toBe('{"a":[1,2]}');
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.rowCount).toBe(3);
  });
});

describe("file names and snippets", () => {
  it("names files <schema>-<rows>-rows.<ext>", () => {
    expect(fileName("My Users!", 50, "csv")).toBe("my-users-50-rows.csv");
    expect(fileName("", 10, "xlsx")).toBe("test-data-10-rows.xlsx");
  });

  it("snippets point at the generated file and its columns", () => {
    const java = javaTestNgSnippet("users-50-rows.csv", ["id", "email"]);
    expect(java).toContain("src/test/resources/users-50-rows.csv");
    expect(java).toContain("@DataProvider");
    expect(java).toContain('header.indexOf("email")');
    const pw = playwrightSnippet("users-50-rows.json", ["id", "first name"]);
    expect(pw).toContain('import rows from "./data/users-50-rows.json"');
    expect(pw).toContain('"first name": string;');
  });
});

export type { GenOptions };
