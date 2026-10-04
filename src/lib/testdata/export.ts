/** Text exporters for generated datasets. Values are written as-is (edge cases included). */

import { dump } from "js-yaml";

import { FIELD_TYPES, type SqlKind } from "./field-types";
import { EDGE_FLAG, EDGE_TYPE } from "./generate";
import type { Dataset, Field, FieldValue, GenOptions, OutputFormat, Row, SqlDialect } from "./types";

export const FORMAT_INFO: Record<OutputFormat, { label: string; ext: string; mime: string; text: boolean }> = {
  csv: { label: "CSV", ext: "csv", mime: "text/csv;charset=utf-8", text: true },
  tsv: { label: "TSV", ext: "tsv", mime: "text/tab-separated-values;charset=utf-8", text: true },
  json: { label: "JSON (array)", ext: "json", mime: "application/json", text: true },
  jsonl: { label: "JSON Lines", ext: "jsonl", mime: "application/x-ndjson", text: true },
  xlsx: { label: "Excel", ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", text: false },
  sql: { label: "SQL INSERT", ext: "sql", mime: "application/sql", text: true },
  xml: { label: "XML", ext: "xml", mime: "application/xml", text: true },
  yaml: { label: "YAML", ext: "yaml", mime: "application/yaml", text: true },
};

export const TEXT_FORMATS = (Object.keys(FORMAT_INFO) as OutputFormat[]).filter((f) => FORMAT_INFO[f].text);

/** Flat cell text: nested values become JSON, null becomes empty. */
export function cellText(v: FieldValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// ---------- CSV / TSV ----------

export function toDelimited(ds: Pick<Dataset, "columns" | "rows">, o: GenOptions["csv"], delimiter = o.delimiter || ","): string {
  const eol = o.lineEnding === "crlf" ? "\r\n" : "\n";
  const needsQuote = (s: string) => s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r") || /^\s|\s$/.test(s);
  const cell = (v: FieldValue) => {
    const s = cellText(v);
    return o.quoteAll || needsQuote(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  if (o.header) lines.push(ds.columns.map((c) => cell(c)).join(delimiter));
  for (const row of ds.rows) lines.push(ds.columns.map((c) => cell(row[c])).join(delimiter));
  return (o.bom ? "﻿" : "") + lines.join(eol) + eol;
}

// ---------- JSON / JSON Lines / YAML ----------

export function toJson(ds: Pick<Dataset, "rows">, o: GenOptions["json"]): string {
  const data = o.rootKey.trim() ? { [o.rootKey.trim()]: ds.rows } : ds.rows;
  return JSON.stringify(data, null, o.pretty ? 2 : undefined) + "\n";
}

export const toJsonLines = (ds: Pick<Dataset, "rows">) => ds.rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

export function toYaml(ds: Pick<Dataset, "rows">, o: GenOptions["json"]): string {
  const data = o.rootKey.trim() ? { [o.rootKey.trim()]: ds.rows } : ds.rows;
  return dump(data, { lineWidth: -1, noRefs: true });
}

// ---------- XML ----------

/** Characters XML 1.0 can't contain at all (null byte etc.) become U+FFFD. */
const XML_INVALID = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;

export const escapeXml = (s: string) =>
  s.replace(XML_INVALID, "�").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** A valid XML element name for a field name. */
export function xmlName(name: string): string {
  let n = name.replace(/[^A-Za-z0-9_.-]/g, "_");
  if (!/^[A-Za-z_]/.test(n) || /^xml/i.test(n)) n = `_${n}`;
  return n || "_";
}

function xmlValue(tag: string, v: FieldValue, indent: string): string {
  const name = xmlName(tag);
  if (v === null || v === undefined) return `${indent}<${name}/>`;
  if (Array.isArray(v)) {
    if (!v.length) return `${indent}<${name}/>`;
    return `${indent}<${name}>\n${v.map((item) => xmlValue("item", item, `${indent}  `)).join("\n")}\n${indent}</${name}>`;
  }
  if (typeof v === "object") {
    const entries = Object.entries(v);
    if (!entries.length) return `${indent}<${name}/>`;
    return `${indent}<${name}>\n${entries.map(([k, x]) => xmlValue(k, x, `${indent}  `)).join("\n")}\n${indent}</${name}>`;
  }
  return `${indent}<${name}>${escapeXml(String(v))}</${name}>`;
}

export function toXml(ds: Pick<Dataset, "columns" | "rows">, o: GenOptions["xml"]): string {
  const root = xmlName(o.root || "rows");
  const rowTag = xmlName(o.row || "row");
  const body = ds.rows.map((row) => `  <${rowTag}>\n${ds.columns.map((c) => xmlValue(c, row[c], "    ")).join("\n")}\n  </${rowTag}>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}>\n${body.join("\n")}${body.length ? "\n" : ""}</${root}>\n`;
}

// ---------- SQL ----------

export const DIALECTS: { value: SqlDialect; label: string }[] = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "sqlserver", label: "SQL Server" },
  { value: "sqlite", label: "SQLite" },
  { value: "oracle", label: "Oracle" },
];

export function quoteIdent(name: string, d: SqlDialect): string {
  if (d === "mysql") return `\`${name.replace(/`/g, "``")}\``;
  if (d === "sqlserver") return `[${name.replace(/]/g, "]]")}]`;
  return `"${name.replace(/"/g, '""')}"`;
}

/** String literal: '' doubling everywhere; MySQL also escapes backslashes; SQL Server uses N'…'. */
export function quoteString(s: string, d: SqlDialect): string {
  let body = s.replace(/'/g, "''");
  if (d === "mysql") body = body.replace(/\\/g, "\\\\").replace(/\u0000/g, "\\0");
  else body = body.replace(/\u0000/g, "");
  return d === "sqlserver" ? `N'${body}'` : `'${body}'`;
}

export function sqlLiteral(v: FieldValue, d: SqlDialect): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return d === "postgresql" || d === "mysql" ? (v ? "TRUE" : "FALSE") : v ? "1" : "0";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "object") return quoteString(JSON.stringify(v), d);
  return quoteString(v, d);
}

const SQL_TYPES: Record<SqlKind, Record<SqlDialect, string>> = {
  int: { postgresql: "INTEGER", mysql: "INT", sqlserver: "INT", sqlite: "INTEGER", oracle: "NUMBER(10)" },
  bigint: { postgresql: "BIGINT", mysql: "BIGINT", sqlserver: "BIGINT", sqlite: "INTEGER", oracle: "NUMBER(19)" },
  decimal: { postgresql: "NUMERIC(18,6)", mysql: "DECIMAL(18,6)", sqlserver: "DECIMAL(18,6)", sqlite: "REAL", oracle: "NUMBER(18,6)" },
  bool: { postgresql: "BOOLEAN", mysql: "BOOLEAN", sqlserver: "BIT", sqlite: "INTEGER", oracle: "NUMBER(1)" },
  date: { postgresql: "DATE", mysql: "DATE", sqlserver: "DATE", sqlite: "TEXT", oracle: "DATE" },
  datetime: { postgresql: "TIMESTAMPTZ", mysql: "DATETIME", sqlserver: "DATETIME2", sqlite: "TEXT", oracle: "TIMESTAMP WITH TIME ZONE" },
  time: { postgresql: "TIME", mysql: "TIME", sqlserver: "TIME", sqlite: "TEXT", oracle: "VARCHAR2(16)" },
  text: { postgresql: "VARCHAR(255)", mysql: "VARCHAR(255)", sqlserver: "NVARCHAR(255)", sqlite: "TEXT", oracle: "VARCHAR2(255)" },
  longtext: { postgresql: "TEXT", mysql: "TEXT", sqlserver: "NVARCHAR(MAX)", sqlite: "TEXT", oracle: "CLOB" },
  uuid: { postgresql: "UUID", mysql: "CHAR(36)", sqlserver: "UNIQUEIDENTIFIER", sqlite: "TEXT", oracle: "VARCHAR2(36)" },
  json: { postgresql: "JSONB", mysql: "JSON", sqlserver: "NVARCHAR(MAX)", sqlite: "TEXT", oracle: "CLOB" },
};

/**
 * Column type for a field. Columns holding edge cases, text amounts, or dates in a non-ISO
 * format fall back to text so every INSERT still runs.
 */
export function inferSqlKind(field: Field, ds: Pick<Dataset, "rows" | "edges">): SqlKind {
  const def = FIELD_TYPES[field.type];
  let kind: SqlKind = def?.sql ?? "text";
  const hasEdges = ds.edges.some((e) => e && Object.keys(e).some((k) => k === field.name || k.startsWith(`${field.name}.`) || k.startsWith(`${field.name}[`)));
  const values = ds.rows.map((r) => r[field.name]).filter((v) => v !== null && v !== undefined);
  const longest = values.reduce<number>((m, v) => Math.max(m, cellText(v).length), 0);
  if (hasEdges && kind !== "json") kind = longest > 255 ? "longtext" : "text";
  if ((kind === "int" || kind === "bigint" || kind === "decimal") && values.some((v) => typeof v !== "number")) kind = "text";
  if (kind === "int" && values.some((v) => typeof v === "number" && (!Number.isInteger(v) || Math.abs(v) > 2 ** 31 - 1))) kind = "decimal";
  if (kind === "date" && values.some((v) => typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v))) kind = "text";
  if (kind === "datetime" && values.some((v) => typeof v !== "string" || Number.isNaN(Date.parse(v)) || !/^\d{4}-/.test(v))) kind = "text";
  if (kind === "uuid" && values.some((v) => typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v))) kind = "text";
  if (kind === "text" && longest > 255) kind = "longtext";
  return kind;
}

export function toSql(ds: Dataset, fields: Field[], o: GenOptions["sql"], edgeColumns: boolean): string {
  const d = o.dialect;
  const table = quoteIdent(o.table.trim() || "test_data", d);
  const cols = ds.columns;
  const out: string[] = [];
  if (o.createTable) {
    const defs = fields.map((f) => `  ${quoteIdent(f.name, d)} ${SQL_TYPES[inferSqlKind(f, ds)][d]}`);
    if (edgeColumns) {
      defs.push(`  ${quoteIdent(EDGE_FLAG, d)} ${SQL_TYPES.bool[d]}`);
      defs.push(`  ${quoteIdent(EDGE_TYPE, d)} ${SQL_TYPES.longtext[d]}`);
    }
    out.push(`CREATE TABLE ${table} (\n${defs.join(",\n")}\n);\n`);
  }
  const colList = cols.map((c) => quoteIdent(c, d)).join(", ");
  const tuple = (row: Row) => `(${cols.map((c) => sqlLiteral(row[c], d)).join(", ")})`;
  // SQL Server allows at most 1000 rows per VALUES list.
  const batch = Math.max(1, Math.min(d === "sqlserver" ? 1000 : 10_000, Math.floor(o.batchSize) || 1));
  for (let i = 0; i < ds.rows.length; i += batch) {
    const chunk = ds.rows.slice(i, i + batch);
    if (d === "oracle") {
      // Multi-row VALUES needs Oracle 23c; INSERT ALL works on every version.
      out.push(`INSERT ALL\n${chunk.map((r) => `  INTO ${table} (${colList}) VALUES ${tuple(r)}`).join("\n")}\nSELECT 1 FROM DUAL;`);
    } else {
      out.push(`INSERT INTO ${table} (${colList}) VALUES\n${chunk.map((r) => `  ${tuple(r)}`).join(",\n")};`);
    }
  }
  return out.join("\n") + "\n";
}

// ---------- Dispatch ----------

export function exportText(format: Exclude<OutputFormat, "xlsx">, ds: Dataset, fields: Field[], o: GenOptions, edgeColumns: boolean): string {
  switch (format) {
    case "csv":
      return toDelimited(ds, o.csv);
    case "tsv":
      return toDelimited(ds, o.csv, "\t");
    case "json":
      return toJson(ds, o.json);
    case "jsonl":
      return toJsonLines(ds);
    case "yaml":
      return toYaml(ds, o.json);
    case "xml":
      return toXml(ds, o.xml);
    case "sql":
      return toSql(ds, fields, o.sql, edgeColumns);
  }
}

/** `<schema-name>-<rows>-rows.<ext>` */
export function fileName(schemaName: string, rows: number, format: OutputFormat): string {
  const base =
    schemaName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "test-data";
  return `${base}-${rows}-rows.${FORMAT_INFO[format].ext}`;
}
