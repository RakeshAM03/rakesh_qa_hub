import type { Assertion, Operator } from "./request";

// ---------------------------------------------------------------- JSONPath (subset)

/**
 * Evaluates a small JSONPath subset: $, .key, ['key'], [0], [-1], [*], .*
 * Returns every match (wildcards can match several values).
 */
export function jsonPath(data: unknown, path: string): { ok: true; values: unknown[] } | { ok: false; error: string } {
  const p = path.trim();
  if (!p.startsWith("$")) return { ok: false, error: "JSON paths start with $, e.g. $.data[0].id" };
  const tokens: (string | number | "*")[] = [];
  const re = /\.\s*([A-Za-z_$][\w$-]*)|\.\*|\[\s*(-?\d+)\s*\]|\[\s*\*\s*\]|\[\s*'((?:[^'\\]|\\.)*)'\s*\]|\[\s*"((?:[^"\\]|\\.)*)"\s*\]/y;
  re.lastIndex = 1;
  while (re.lastIndex < p.length) {
    const m = re.exec(p);
    if (!m) return { ok: false, error: `Can't read the path near "${p.slice(re.lastIndex)}"` };
    if (m[1] !== undefined) tokens.push(m[1]);
    else if (m[2] !== undefined) tokens.push(Number(m[2]));
    else if (m[3] !== undefined) tokens.push(m[3].replace(/\\(.)/g, "$1"));
    else if (m[4] !== undefined) tokens.push(m[4].replace(/\\(.)/g, "$1"));
    else tokens.push("*");
  }
  let current: unknown[] = [data];
  for (const t of tokens) {
    const next: unknown[] = [];
    for (const v of current) {
      if (t === "*") {
        if (Array.isArray(v)) next.push(...v);
        else if (v && typeof v === "object") next.push(...Object.values(v));
      } else if (typeof t === "number") {
        if (Array.isArray(v)) {
          const i = t < 0 ? v.length + t : t;
          if (i >= 0 && i < v.length) next.push(v[i]);
        }
      } else if (v && typeof v === "object" && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, t)) {
        next.push((v as Record<string, unknown>)[t]);
      }
    }
    current = next;
  }
  return { ok: true, values: current };
}

// ---------------------------------------------------------------- assertions

export type ResponseLike = { status: number; timeMs: number; headers: [string, string][]; body: string };
export type AssertionResult = { id: string; pass: boolean; actual: string; message: string };

export const OPERATORS: Record<Operator, string> = {
  equals: "equals",
  notEquals: "not equals",
  contains: "contains",
  notContains: "does not contain",
  lessThan: "less than",
  greaterThan: "greater than",
  exists: "exists",
  notExists: "does not exist",
  isType: "is type",
};

export const TYPE_OPERATORS: Record<Assertion["type"], Operator[]> = {
  status: ["equals", "notEquals", "lessThan", "greaterThan"],
  time: ["lessThan", "greaterThan"],
  header: ["equals", "contains", "notContains", "exists", "notExists"],
  jsonpath: ["exists", "notExists", "equals", "notEquals", "contains", "isType", "lessThan", "greaterThan"],
  body: ["contains", "notContains", "equals"],
};

export const NO_EXPECTED: Operator[] = ["exists", "notExists"];

const typeOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const show = (v: unknown) => (v === undefined ? "(missing)" : typeof v === "string" ? v : JSON.stringify(v));

/** Compares as numbers when both look numeric, else as JSON/text. */
function equalsLoose(actual: unknown, expected: string) {
  if (typeof actual === "number" || typeof actual === "boolean" || actual === null) return String(actual) === expected.trim();
  if (typeof actual === "string") return actual === expected;
  try {
    return JSON.stringify(actual) === JSON.stringify(JSON.parse(expected));
  } catch {
    return false;
  }
}

function compare(op: Operator, actual: unknown, expected: string, present: boolean): boolean {
  switch (op) {
    case "exists":
      return present;
    case "notExists":
      return !present;
    case "equals":
      return present && equalsLoose(actual, expected);
    case "notEquals":
      return !present || !equalsLoose(actual, expected);
    case "contains":
      return present && (Array.isArray(actual) ? actual.some((x) => equalsLoose(x, expected) || show(x).includes(expected)) : show(actual).includes(expected));
    case "notContains":
      return !present || !show(actual).includes(expected);
    case "lessThan":
      return present && Number(actual) < Number(expected);
    case "greaterThan":
      return present && Number(actual) > Number(expected);
    case "isType":
      return present && typeOf(actual) === expected.trim().toLowerCase();
  }
}

/** Runs one assertion against a response. */
export function runAssertion(a: Assertion, res: ResponseLike): AssertionResult {
  const label = `${labelFor(a)} ${OPERATORS[a.operator]}${NO_EXPECTED.includes(a.operator) ? "" : ` ${a.expected}`}`;
  let actual: unknown;
  let present = true;
  if (a.type === "status") actual = res.status;
  else if (a.type === "time") actual = res.timeMs;
  else if (a.type === "body") actual = res.body;
  else if (a.type === "header") {
    const h = res.headers.filter(([k]) => k.toLowerCase() === a.target.trim().toLowerCase());
    present = h.length > 0;
    actual = present ? h.map(([, v]) => v).join(", ") : undefined;
  } else {
    let data: unknown;
    try {
      data = JSON.parse(res.body);
    } catch {
      return { id: a.id, pass: false, actual: "(body isn't JSON)", message: label };
    }
    const r = jsonPath(data, a.target);
    if (!r.ok) return { id: a.id, pass: false, actual: r.error, message: label };
    present = r.values.length > 0;
    actual = r.values.length === 1 ? r.values[0] : r.values.length ? r.values : undefined;
  }
  const pass = compare(a.operator, actual, a.expected, present);
  const shown = a.type === "body" && typeof actual === "string" && actual.length > 120 ? `${actual.slice(0, 120)}…` : show(actual);
  return { id: a.id, pass, actual: a.type === "time" ? `${shown} ms` : shown, message: label };
}

function labelFor(a: Assertion) {
  if (a.type === "status") return "Status code";
  if (a.type === "time") return "Response time (ms)";
  if (a.type === "body") return "Body";
  if (a.type === "header") return `Header ${a.target}`;
  return a.target || "$";
}

export function runAssertions(list: Assertion[], res: ResponseLike) {
  const results = list.map((a) => runAssertion(a, res));
  return { results, passed: results.filter((r) => r.pass).length, total: results.length };
}
