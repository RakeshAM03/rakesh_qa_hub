/** Immutable edits on a (possibly nested) field list. */

import { FIELD_TYPES, makeField, newFieldId } from "./field-types";
import type { Field } from "./types";

type Mapper = (fields: Field[]) => Field[];

/** Applies `fn` to the list that contains field `id` (top level or any children list). */
function atLevelOf(fields: Field[], id: string, fn: Mapper): Field[] {
  if (fields.some((f) => f.id === id)) return fn(fields);
  return fields.map((f) => (f.children ? { ...f, children: atLevelOf(f.children, id, fn) } : f));
}

export function updateField(fields: Field[], id: string, patch: Partial<Field> | ((f: Field) => Field)): Field[] {
  return atLevelOf(fields, id, (list) => list.map((f) => (f.id === id ? (typeof patch === "function" ? patch(f) : { ...f, ...patch }) : f)));
}

/** Changing type resets options to the new type's defaults and adds/removes children. */
export function changeType(fields: Field[], id: string, type: string): Field[] {
  return updateField(fields, id, (f) => {
    const next: Field = { ...f, type, options: { ...(FIELD_TYPES[type]?.defaults ?? {}) } };
    if (type === "object" || type === "array") next.children = f.children?.length ? f.children : type === "array" ? [makeField("item", "word")] : [];
    else delete next.children;
    if (!FIELD_TYPES[type]?.edge) next.edgeCases = false;
    return next;
  });
}

export function removeField(fields: Field[], id: string): Field[] {
  return atLevelOf(fields, id, (list) => list.filter((f) => f.id !== id));
}

/** Copy of a field (and its children) with fresh ids. */
export function cloneField(f: Field): Field {
  return { ...f, id: newFieldId(), options: { ...f.options }, children: f.children?.map(cloneField) };
}

export function uniqueName(base: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!lower.has(`${base}${i}`.toLowerCase())) return `${base}${i}`;
}

export function duplicateField(fields: Field[], id: string): Field[] {
  return atLevelOf(fields, id, (list) => {
    const i = list.findIndex((f) => f.id === id);
    const copy = cloneField(list[i]);
    copy.name = uniqueName(`${list[i].name}_copy`, list.map((f) => f.name));
    return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)];
  });
}

/** Moves field `id` to `to` (index within its own list). */
export function moveField(fields: Field[], id: string, to: number): Field[] {
  return atLevelOf(fields, id, (list) => {
    const from = list.findIndex((f) => f.id === id);
    if (from < 0 || to < 0 || to >= list.length || from === to) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });
}

/** Adds a field at the end of the top level (parentId null) or of a parent's children. */
export function addField(fields: Field[], parentId: string | null, type = "word"): Field[] {
  if (parentId === null) return [...fields, makeField(uniqueName("field", fields.map((f) => f.name)), type)];
  return updateField(fields, parentId, (p) => ({ ...p, children: [...(p.children ?? []), makeField(uniqueName("field", (p.children ?? []).map((c) => c.name)), type)] }));
}

/** Appends fields, renaming any that clash with existing names. */
export function appendFields(fields: Field[], extra: Field[]): Field[] {
  const names = fields.map((f) => f.name);
  return [
    ...fields,
    ...extra.map((f) => {
      const name = uniqueName(f.name, names);
      names.push(name);
      return { ...cloneField(f), name };
    }),
  ];
}

export const countFields = (fields: Field[]): number => fields.reduce((n, f) => n + 1 + (f.children ? countFields(f.children) : 0), 0);
