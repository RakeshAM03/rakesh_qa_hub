/** zod schemas for saved schemas (API) and schema JSON import/export. */

import { z } from "zod";

import { defaultOptions, LOCALE_IDS } from "./presets";
import type { Field, GenOptions } from "./types";
import { MAX_FIELDS, MAX_ROWS } from "./validate";

const optionValue = z.union([z.string().max(10_000), z.number(), z.boolean()]);

export const fieldSchema: z.ZodType<Field> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(64),
    name: z.string().max(64),
    type: z.string().min(1).max(40),
    options: z.record(z.string().max(40), optionValue),
    blankPct: z.number().min(0).max(100),
    unique: z.boolean(),
    edgeCases: z.boolean(),
    edgePct: z.number().min(0).max(100),
    children: z.array(fieldSchema).max(MAX_FIELDS).optional(),
  }),
);

export const fieldsSchema = z.array(fieldSchema).max(MAX_FIELDS);

export const optionsSchema = z.object({
  rows: z.number().int().min(1).max(MAX_ROWS),
  locale: z.string().refine((v) => LOCALE_IDS.includes(v), "Unknown locale."),
  seed: z.number().int().min(0).max(2 ** 31 - 1).nullable(),
  refDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataMode: z.enum(["valid", "mixed", "edge"]),
  edgeColumns: z.boolean(),
  format: z.enum(["csv", "tsv", "json", "jsonl", "xlsx", "sql", "xml", "yaml"]),
  csv: z.object({
    delimiter: z.string().min(1).max(3),
    quoteAll: z.boolean(),
    header: z.boolean(),
    lineEnding: z.enum(["lf", "crlf"]),
    bom: z.boolean(),
  }),
  json: z.object({ pretty: z.boolean(), rootKey: z.string().max(64) }),
  sql: z.object({
    table: z.string().max(64),
    dialect: z.enum(["postgresql", "mysql", "sqlserver", "sqlite", "oracle"]),
    batchSize: z.number().int().min(1).max(10_000),
    createTable: z.boolean(),
  }),
  xml: z.object({ root: z.string().max(64), row: z.string().max(64) }),
  xlsx: z.object({ sheet: z.string().max(64), freezeHeader: z.boolean(), autoFit: z.boolean() }),
}) satisfies z.ZodType<GenOptions>;

/** Fills options missing from an older or hand-written schema with defaults. */
export function withDefaultOptions(partial: unknown): GenOptions {
  const d = defaultOptions();
  const p = (typeof partial === "object" && partial !== null ? partial : {}) as Partial<GenOptions>;
  const merged = {
    ...d,
    ...p,
    csv: { ...d.csv, ...p.csv },
    json: { ...d.json, ...p.json },
    sql: { ...d.sql, ...p.sql },
    xml: { ...d.xml, ...p.xml },
    xlsx: { ...d.xlsx, ...p.xlsx },
  };
  const parsed = optionsSchema.safeParse(merged);
  return parsed.success ? parsed.data : d;
}

const name = z.string().trim().min(1, "Give the schema a name.").max(100);

export const createSchemaBody = z.object({
  name,
  fields: fieldsSchema,
  options: optionsSchema,
  isPreset: z.boolean().default(false),
  createdBy: z.string().trim().max(100).optional(),
});

export const updateSchemaBody = z.object({
  name: name.optional(),
  fields: fieldsSchema.optional(),
  options: optionsSchema.optional(),
  isPreset: z.boolean().optional(),
});

/** Shareable file: { name, fields, options }. Options may be partial. */
export const schemaFile = z.object({
  name: z.string().trim().max(100).optional(),
  fields: fieldsSchema,
  options: z.unknown().optional(),
});

export const SCHEMA_FILE_VERSION = 1;
