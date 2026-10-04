/** Shared types for the Test Data Generator (pure, usable in the worker and on the server). */

export type FieldValue = string | number | boolean | null | FieldValue[] | { [key: string]: FieldValue };

export type OptionValue = string | number | boolean;

export type Field = {
  id: string;
  name: string;
  type: string;
  /** Type-specific options (see FIELD_TYPES[type].options). */
  options: Record<string, OptionValue>;
  /** 0–100: share of rows left empty (null). */
  blankPct: number;
  unique: boolean;
  /** Mixed mode: replace a share of values with edge cases. */
  edgeCases: boolean;
  /** 0–100, default 20. */
  edgePct: number;
  /** Child fields for "object" and "array" types. */
  children?: Field[];
};

export type DataMode = "valid" | "mixed" | "edge";

export type OutputFormat = "csv" | "tsv" | "json" | "jsonl" | "xlsx" | "sql" | "xml" | "yaml";

export type SqlDialect = "postgresql" | "mysql" | "sqlserver" | "sqlite" | "oracle";

export type GenOptions = {
  rows: number;
  locale: string;
  /** Same seed + schema + options = identical output. null = random. */
  seed: number | null;
  /** YYYY-MM-DD. Relative dates (past/future/date of birth) count from this day. */
  refDate: string;
  dataMode: DataMode;
  /** Mixed / edge modes: add `_isEdgeCase` and `_edgeCaseType` columns. */
  edgeColumns: boolean;
  format: OutputFormat;
  csv: { delimiter: string; quoteAll: boolean; header: boolean; lineEnding: "lf" | "crlf"; bom: boolean };
  json: { pretty: boolean; rootKey: string };
  sql: { table: string; dialect: SqlDialect; batchSize: number; createTable: boolean };
  xml: { root: string; row: string };
  xlsx: { sheet: string; freezeHeader: boolean; autoFit: boolean };
};

export type Row = Record<string, FieldValue>;

/** Edge-case labels per row: field name → edge-case type. */
export type EdgeMeta = Record<string, string>;

export type Dataset = {
  columns: string[];
  rows: Row[];
  /** One entry per row (null = no edge values in that row). */
  edges: (EdgeMeta | null)[];
  edgeCount: number;
  seed: number;
};
