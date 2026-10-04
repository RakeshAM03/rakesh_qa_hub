/** Schema checks run before generating, with messages shown next to the field. */

import { FIELD_TYPES, parseList, parsePickList } from "./field-types";
import { formulaRefs, parseFormula, references } from "./formula";
import { parseIsoDate } from "./dates";
import { parseRegex } from "./regex";
import type { Field, GenOptions } from "./types";

export type SchemaError = { fieldId?: string; message: string };

export const MAX_ROWS = 100_000;
export const MAX_FIELDS = 200;

/** Fields a template/formula field depends on (same level), or [] for other types. */
export function dependencies(field: Field): string[] {
  if (field.type === "template") return references(String(field.options.template ?? ""));
  if (field.type === "formula") {
    try {
      return [...formulaRefs(parseFormula(String(field.options.expression ?? "")))];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Generation order for one level: every field after the fields it references.
 * Throws with the cycle when references loop.
 */
export function generationOrder(fields: Field[]): Field[] {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const state = new Map<string, "visiting" | "done">();
  const out: Field[] = [];
  const visit = (f: Field, path: string[]) => {
    const s = state.get(f.id);
    if (s === "done") return;
    if (s === "visiting") throw new Error(`Circular reference: ${[...path, f.name].join(" → ")}`);
    state.set(f.id, "visiting");
    for (const dep of dependencies(f)) {
      const d = byName.get(dep);
      if (d) visit(d, [...path, f.name]);
    }
    state.set(f.id, "done");
    out.push(f);
  };
  for (const f of fields) visit(f, []);
  return out;
}

const num = (v: unknown) => (v === "" || v === undefined || v === null ? undefined : Number(v));

function validateLevel(fields: Field[], rows: number, path: string, errors: SchemaError[], topLevel: boolean) {
  const seen = new Map<string, number>();
  for (const f of fields) {
    const key = f.name.trim().toLowerCase();
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const names = new Set(fields.map((f) => f.name));

  for (const f of fields) {
    const label = `${path}${f.name || "(unnamed)"}`;
    const err = (message: string) => errors.push({ fieldId: f.id, message: `${label}: ${message}` });
    const def = FIELD_TYPES[f.type];
    if (!f.name.trim()) errors.push({ fieldId: f.id, message: `${path}A field has no name.` });
    else if (f.name.length > 64) err("name is longer than 64 characters.");
    if ((seen.get(f.name.trim().toLowerCase()) ?? 0) > 1) err("name is used more than once.");
    if (!def) {
      err(`unknown type "${f.type}".`);
      continue;
    }
    if (!(f.blankPct >= 0 && f.blankPct <= 100)) err("blank % must be between 0 and 100.");
    if (!(f.edgePct >= 0 && f.edgePct <= 100)) err("edge-case % must be between 0 and 100.");
    const o = f.options;

    const min = num(o.min);
    const max = num(o.max);
    if (min !== undefined && max !== undefined && min > max) err(`min (${min}) is greater than max (${max}).`);
    for (const k of ["from", "to"]) {
      if (o[k] && !parseIsoDate(String(o[k]))) err(`"${k}" must be a date (YYYY-MM-DD).`);
    }
    const from = parseIsoDate(String(o.from ?? ""));
    const to = parseIsoDate(String(o.to ?? ""));
    if (from && to && from > to) err("the from date is after the to date.");
    if (num(o.minAge) !== undefined && num(o.maxAge) !== undefined && Number(o.minAge) > Number(o.maxAge)) err("min age is greater than max age.");

    switch (f.type) {
      case "regex":
        try {
          parseRegex(String(o.pattern ?? ""));
          if (!String(o.pattern ?? "")) err("enter a regex pattern.");
        } catch (e) {
          err(`regex: ${(e as Error).message}`);
        }
        break;
      case "pickList":
        if (!parsePickList(String(o.values ?? "")).length) err("add at least one value to pick from.");
        else if (parsePickList(String(o.values ?? "")).every((i) => i.weight === 0)) err("at least one weight must be above 0.");
        break;
      case "template":
        if (!String(o.template ?? "").trim()) err("enter a template.");
        for (const ref of references(String(o.template ?? ""))) if (!names.has(ref)) err(`{{${ref}}} isn't a field at this level.`);
        break;
      case "formula":
        try {
          const refs = formulaRefs(parseFormula(String(o.expression ?? "")));
          for (const ref of refs) if (!names.has(ref)) err(`{{${ref}}} isn't a field at this level.`);
        } catch (e) {
          err(`formula: ${(e as Error).message}`);
        }
        break;
      case "foreignKey":
        if (o.source === "list") {
          if (!parseList(String(o.list ?? "")).length) err("paste at least one value for the foreign key.");
        } else {
          const target = fields.find((x) => x.name === o.field);
          if (!topLevel) err("foreign keys only work on top-level fields.");
          else if (!o.field) err("choose the field to take values from.");
          else if (!target) err(`there's no field called "${o.field}".`);
          else if (target.id === f.id) err("a foreign key can't point at itself.");
          else if (target.type === "foreignKey") err("a foreign key can't point at another foreign key.");
        }
        break;
      case "object":
        if (!f.children?.length) err("add at least one child field.");
        else validateLevel(f.children, rows, `${label}.`, errors, false);
        break;
      case "array": {
        if (f.children?.length !== 1) err("an array needs exactly one child field (its item).");
        else validateLevel(f.children, rows, `${label}[].`, errors, false);
        const amin = num(o.min) ?? 1;
        const amax = num(o.max) ?? 3;
        if (amin < 0 || amax > 100) err("array items must be between 0 and 100.");
        break;
      }
    }

    if (f.unique && topLevel) {
      if (f.type === "object" || f.type === "array") err("objects and arrays can't be unique.");
      else {
        const variety = def.variety?.(o);
        if (variety !== undefined && variety < rows) {
          err(`only ${Math.max(0, Math.floor(variety)).toLocaleString("en-IN")} different values are possible, but ${rows.toLocaleString("en-IN")} unique rows were asked for.`);
        }
      }
    }
  }

  try {
    generationOrder(fields);
  } catch (e) {
    errors.push({ message: `${path}${(e as Error).message}` });
  }
}

export function validateSchema(fields: Field[], options: Pick<GenOptions, "rows">): SchemaError[] {
  const errors: SchemaError[] = [];
  if (!fields.length) errors.push({ message: "Add at least one field." });
  if (fields.length > MAX_FIELDS) errors.push({ message: `A schema can have at most ${MAX_FIELDS} fields.` });
  if (!(Number.isInteger(options.rows) && options.rows >= 1 && options.rows <= MAX_ROWS)) {
    errors.push({ message: `Rows must be a whole number from 1 to ${MAX_ROWS.toLocaleString("en-IN")}.` });
  }
  validateLevel(fields, options.rows, "", errors, true);
  return errors;
}
