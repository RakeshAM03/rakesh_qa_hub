/**
 * Templates and formulas that use other fields — never `eval`.
 *
 * Template: text with {{field}} placeholders, e.g. `{{firstName}}.{{lastName}}@example.com`.
 * Formula: field references, numbers, quoted strings, `+ - * / ( )`. `+` concatenates when
 * either side is a string. Anything else (identifiers, function calls, other operators) is
 * rejected when the formula is parsed.
 */

import type { FieldValue } from "./types";

export class FormulaError extends Error {}

const REF = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Field names referenced by a template or formula. */
export function references(text: string): string[] {
  return [...new Set([...text.matchAll(REF)].map((m) => m[1]))];
}

const asText = (v: FieldValue | undefined): string =>
  v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

export function renderTemplate(template: string, values: Record<string, FieldValue>): string {
  return template.replace(REF, (_, name: string) => asText(values[name]));
}

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ref"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "("; v?: undefined }
  | { t: ")"; v?: undefined };

export type Expr =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "ref"; v: string }
  | { k: "neg"; e: Expr }
  | { k: "bin"; op: "+" | "-" | "*" | "/"; l: Expr; r: Expr };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === "{" && src[i + 1] === "{") {
      const end = src.indexOf("}}", i + 2);
      if (end < 0) throw new FormulaError("A {{ is missing its closing }}.");
      const name = src.slice(i + 2, end).trim();
      if (!name) throw new FormulaError("Empty {{ }} reference.");
      out.push({ t: "ref", v: name });
      i = end + 2;
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Unexpected "${c}".`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) j++;
        s += src[j++];
      }
      if (j >= src.length) throw new FormulaError("A quoted string isn't closed.");
      out.push({ t: "str", v: s });
      i = j + 1;
    } else if (c === "+" || c === "-" || c === "*" || c === "/") {
      out.push({ t: "op", v: c });
      i++;
    } else if (c === "(" || c === ")") {
      out.push({ t: c });
      i++;
    } else {
      throw new FormulaError(`"${src.slice(i, i + 12)}" isn't allowed. Use {{field}} references, numbers, quotes and + - * / ( ).`);
    }
  }
  return out;
}

export function parseFormula(src: string): Expr {
  if (src.length > 1000) throw new FormulaError("Formula is too long (max 1000 characters).");
  const tokens = tokenize(src);
  if (!tokens.length) throw new FormulaError("Formula is empty.");
  let p = 0;
  let depth = 0;

  const peek = () => tokens[p];

  function primary(): Expr {
    const tok = tokens[p++];
    if (!tok) throw new FormulaError("Formula ends unexpectedly.");
    if (tok.t === "num") return { k: "num", v: tok.v };
    if (tok.t === "str") return { k: "str", v: tok.v };
    if (tok.t === "ref") return { k: "ref", v: tok.v };
    if (tok.t === "op" && tok.v === "-") return { k: "neg", e: primary() };
    if (tok.t === "(") {
      if (++depth > 50) throw new FormulaError("Too many nested brackets.");
      const e = additive();
      if (tokens[p++]?.t !== ")") throw new FormulaError("Missing ).");
      depth--;
      return e;
    }
    throw new FormulaError(`Unexpected ${tok.t === "op" ? tok.v : tok.t}.`);
  }

  function multiplicative(): Expr {
    let l = primary();
    for (let t = peek(); t?.t === "op" && (t.v === "*" || t.v === "/"); t = peek()) {
      p++;
      l = { k: "bin", op: t.v, l, r: primary() };
    }
    return l;
  }

  function additive(): Expr {
    let l = multiplicative();
    for (let t = peek(); t?.t === "op" && (t.v === "+" || t.v === "-"); t = peek()) {
      p++;
      l = { k: "bin", op: t.v, l, r: multiplicative() };
    }
    return l;
  }

  const e = additive();
  if (p < tokens.length) throw new FormulaError(`Unexpected ${tokens[p].t === "op" ? tokens[p].v : tokens[p].t} after the end of the formula.`);
  return e;
}

export function formulaRefs(e: Expr, out = new Set<string>()): Set<string> {
  if (e.k === "ref") out.add(e.v);
  else if (e.k === "neg") formulaRefs(e.e, out);
  else if (e.k === "bin") {
    formulaRefs(e.l, out);
    formulaRefs(e.r, out);
  }
  return out;
}

const toNumber = (v: FieldValue | undefined): number | string => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "string" && /^\s*-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v)) return Number(v);
  return asText(v);
};

/** Evaluates a parsed formula. Returns null for a division by zero or arithmetic on text. */
export function evaluate(e: Expr, values: Record<string, FieldValue>): number | string | null {
  switch (e.k) {
    case "num":
      return e.v;
    case "str":
      return e.v;
    case "ref":
      return toNumber(values[e.v]);
    case "neg": {
      const v = evaluate(e.e, values);
      return typeof v === "number" ? -v : null;
    }
    case "bin": {
      const l = evaluate(e.l, values);
      const r = evaluate(e.r, values);
      if (l === null || r === null) return null;
      if (e.op === "+" && (typeof l === "string" || typeof r === "string")) return `${l}${r}`;
      if (typeof l !== "number" || typeof r !== "number") return null;
      if (e.op === "+") return l + r;
      if (e.op === "-") return l - r;
      if (e.op === "*") return l * r;
      return r === 0 ? null : l / r;
    }
  }
}
