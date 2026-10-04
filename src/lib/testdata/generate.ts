/**
 * Builds a dataset from a schema. Pure apart from the Faker instance passed in, so the same
 * seed + schema + options always produce identical rows (the worker and the tests share it).
 */

import type { Faker } from "@faker-js/faker";

import { parseIsoDate } from "./dates";
import { edgeCasesFor } from "./edge-cases";
import { FIELD_TYPES, parseList, round, type GenContext } from "./field-types";
import { evaluate, parseFormula, renderTemplate, type Expr } from "./formula";
import type { Rand } from "./formats";
import type { Dataset, EdgeMeta, Field, FieldValue, GenOptions, Row } from "./types";
import { generationOrder, validateSchema } from "./validate";

export class GenerateError extends Error {}

export const EDGE_FLAG = "_isEdgeCase";
export const EDGE_TYPE = "_edgeCaseType";

const UNIQUE_ATTEMPTS = 200;

export function makeRand(f: Faker): Rand {
  return {
    int: (min, max) => f.number.int({ min: Math.ceil(min), max: Math.floor(max) }),
    pick: (items) => f.helpers.arrayElement(items as unknown[]) as never,
  };
}

/** Whether a field can produce edge cases at all. */
export const supportsEdges = (field: Field) => Boolean(FIELD_TYPES[field.type]?.edge);

export function edgeColumnsOn(o: Pick<GenOptions, "dataMode" | "edgeColumns">) {
  return o.dataMode !== "valid" && o.edgeColumns;
}

export function columnsFor(fields: Field[], o: Pick<GenOptions, "dataMode" | "edgeColumns">): string[] {
  return [...fields.map((f) => f.name), ...(edgeColumnsOn(o) ? [EDGE_FLAG, EDGE_TYPE] : [])];
}

type Plan = { field: Field; children?: Plan[]; expr?: Expr };

function plan(fields: Field[]): Plan[] {
  return generationOrder(fields).map((field) => ({
    field,
    children: field.children ? plan(field.children) : undefined,
    expr: field.type === "formula" ? parseFormula(String(field.options.expression ?? "")) : undefined,
  }));
}

export type ProgressFn = (done: number, total: number) => void;

export function generateDataset(f: Faker, fields: Field[], o: GenOptions, onProgress?: ProgressFn): Dataset {
  const errors = validateSchema(fields, o);
  if (errors.length) throw new GenerateError(errors[0].message);

  const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
  f.seed(seed);
  const ref = parseIsoDate(o.refDate) ?? new Date(Date.UTC(2026, 0, 1));
  f.setDefaultRefDate(ref);
  const r = makeRand(f);

  const plans = plan(fields);
  const uniqueSeen = new Map<string, Set<string>>();
  const roll = () => r.int(1, 100);

  function valueOf(p: Plan, scope: Record<string, FieldValue>, index: number, path: string, edges: EdgeMeta): FieldValue {
    const { field } = p;
    const def = FIELD_TYPES[field.type];
    if (field.blankPct > 0 && roll() <= field.blankPct) return null;
    if (field.type === "foreignKey") return null; // filled in after all rows exist

    const edgeOn = def.edge && (o.dataMode === "edge" || (o.dataMode === "mixed" && field.edgeCases && field.edgePct > 0 && roll() <= field.edgePct));
    if (edgeOn) {
      const edge = r.pick(edgeCasesFor(def.edge!, field.options));
      edges[path] = edge.label;
      return edge.value;
    }

    switch (field.type) {
      case "object": {
        const obj: Record<string, FieldValue> = {};
        for (const child of p.children ?? []) obj[child.field.name] = valueOf(child, obj, index, `${path}.${child.field.name}`, edges);
        return ordered(field.children ?? [], obj);
      }
      case "array": {
        const child = p.children?.[0];
        if (!child) return [];
        const n = r.int(Number(field.options.min ?? 1), Number(field.options.max ?? 3));
        return Array.from({ length: n }, (_, k) => valueOf(child, {}, index, `${path}[${k}]`, edges));
      }
      case "template":
        return renderTemplate(String(field.options.template ?? ""), scope);
      case "formula": {
        const v = evaluate(p.expr!, scope);
        const decimals = field.options.decimals;
        return typeof v === "number" && decimals !== "" && decimals !== undefined ? round(v, Number(decimals)) : v;
      }
    }
    const ctx: GenContext = { f, r, o: field.options, index, ref };
    return def.gen!(ctx);
  }

  function uniqueValue(p: Plan, scope: Record<string, FieldValue>, index: number, edges: EdgeMeta): FieldValue {
    const seen = uniqueSeen.get(p.field.id) ?? new Set<string>();
    uniqueSeen.set(p.field.id, seen);
    for (let attempt = 0; attempt < UNIQUE_ATTEMPTS; attempt++) {
      const attemptEdges: EdgeMeta = {};
      const v = valueOf(p, scope, index, p.field.name, attemptEdges);
      // Blanks and edge cases are deliberate repeats, so they don't count against uniqueness.
      if (v === null || Object.keys(attemptEdges).length) {
        Object.assign(edges, attemptEdges);
        return v;
      }
      const key = JSON.stringify(v);
      if (!seen.has(key)) {
        seen.add(key);
        return v;
      }
    }
    throw new GenerateError(
      `${p.field.name}: couldn't make value ${(index + 1).toLocaleString("en-IN")} unique — this type doesn't have enough different values for ${o.rows.toLocaleString("en-IN")} rows.`,
    );
  }

  const rows: Row[] = [];
  const edges: (EdgeMeta | null)[] = [];
  let edgeCount = 0;
  for (let i = 0; i < o.rows; i++) {
    const scope: Record<string, FieldValue> = {};
    const rowEdges: EdgeMeta = {};
    for (const p of plans) {
      scope[p.field.name] = p.field.unique ? uniqueValue(p, scope, i, rowEdges) : valueOf(p, scope, i, p.field.name, rowEdges);
    }
    rows.push(ordered(fields, scope));
    const n = Object.keys(rowEdges).length;
    edgeCount += n;
    edges.push(n ? rowEdges : null);
    if (onProgress && (i + 1) % 1000 === 0) onProgress(i + 1, o.rows);
  }

  // Foreign keys: pick from another column (or a pasted list) once every row exists.
  for (const fk of fields.filter((x) => x.type === "foreignKey")) {
    const pool: FieldValue[] =
      fk.options.source === "list"
        ? parseList(String(fk.options.list ?? ""))
        : rows.map((row) => row[String(fk.options.field)]).filter((v) => v !== null && v !== undefined);
    const seen = new Set<string>();
    for (const row of rows) {
      if (fk.blankPct > 0 && roll() <= fk.blankPct) continue;
      if (!pool.length) continue;
      let v = r.pick(pool);
      if (fk.unique) {
        let attempt = 0;
        while (seen.has(JSON.stringify(v)) && attempt++ < UNIQUE_ATTEMPTS) v = r.pick(pool);
        if (seen.has(JSON.stringify(v))) throw new GenerateError(`${fk.name}: not enough different values to keep the foreign key unique.`);
        seen.add(JSON.stringify(v));
      }
      row[fk.name] = v;
    }
  }

  if (edgeColumnsOn(o)) {
    rows.forEach((row, i) => {
      const e = edges[i];
      row[EDGE_FLAG] = Boolean(e);
      row[EDGE_TYPE] = e
        ? Object.entries(e)
            .map(([k, v]) => `${k}: ${v}`)
            .join("; ")
        : "";
    });
  }
  onProgress?.(o.rows, o.rows);
  return { columns: columnsFor(fields, o), rows, edges, edgeCount, seed };
}

/** Same keys in schema order (generation order differs when templates are involved). */
function ordered(fields: Field[], values: Record<string, FieldValue>): Row {
  const row: Row = {};
  for (const f of fields) row[f.name] = values[f.name] ?? null;
  return row;
}
