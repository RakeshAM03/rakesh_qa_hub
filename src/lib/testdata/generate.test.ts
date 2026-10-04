import { faker as enIN } from "@faker-js/faker/locale/en_IN";
import { describe, expect, it } from "vitest";

import { FIELD_TYPE_LIST, makeField, STRUCTURAL } from "./field-types";
import { EDGE_FLAG, EDGE_TYPE, generateDataset, GenerateError } from "./generate";
import { defaultOptions, PRESETS } from "./presets";
import type { Field, GenOptions } from "./types";
import { generationOrder, validateSchema } from "./validate";

const opts = (o: Partial<GenOptions> = {}): GenOptions => ({ ...defaultOptions(), refDate: "2026-06-15", seed: 1234, ...o });
const field = (name: string, type: string, options: Field["options"] = {}, extra: Partial<Field> = {}) => {
  const f = makeField(name, type, extra);
  return { ...f, options: { ...f.options, ...options } };
};
const gen = (fields: Field[], o: Partial<GenOptions> = {}) => generateDataset(enIN, fields, opts(o));
const column = (fields: Field[], name: string, o: Partial<GenOptions> = {}) => gen(fields, o).rows.map((r) => r[name]);

describe("field types", () => {
  const simple = FIELD_TYPE_LIST.filter((d) => !STRUCTURAL.has(d.id) && d.id !== "customText" && d.id !== "constant");

  it.each(simple.map((d) => d.id))("%s produces values with its default options", (type) => {
    const values = column([field("v", type)], "v", { rows: 20 });
    expect(values).toHaveLength(20);
    for (const v of values) expect(v === null || v === undefined || v === "").toBe(false);
  });

  it("integer and decimal respect min, max and decimals", () => {
    const ints = column([field("n", "integer", { min: 5, max: 9 })], "n", { rows: 200 }) as number[];
    expect(ints.every((n) => Number.isInteger(n) && n >= 5 && n <= 9)).toBe(true);
    expect(new Set(ints).size).toBe(5);
    const decs = column([field("d", "decimal", { min: 1, max: 2, decimals: 3 })], "d", { rows: 100 }) as number[];
    expect(decs.every((d) => d >= 1 && d <= 2 && (String(d).split(".")[1] ?? "").length <= 3)).toBe(true);
  });

  it("email uses the chosen domain (example.com by default)", () => {
    expect((column([field("e", "email")], "e") as string[]).every((e) => e.endsWith("@example.com"))).toBe(true);
    expect((column([field("e", "email", { domain: "test.local" })], "e") as string[]).every((e) => e.endsWith("@test.local"))).toBe(true);
  });

  it("password honours length and character classes", () => {
    const pw = column([field("p", "password", { length: 20, symbols: false })], "p", { rows: 50 }) as string[];
    for (const p of pw) {
      expect(p).toHaveLength(20);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).not.toMatch(/[!@#$%^&*\-_=+?]/);
    }
  });

  it("dates stay inside their range and format", () => {
    const d = column([field("d", "date", { from: "2024-01-01", to: "2024-12-31", format: "DD/MM/YYYY" })], "d", { rows: 100 }) as string[];
    for (const v of d) expect(v).toMatch(/^\d{2}\/\d{2}\/2024$/);
    const dob = column([field("b", "dateOfBirth", { minAge: 30, maxAge: 40 })], "b", { rows: 100 }) as string[];
    for (const v of dob) {
      const age = 2026 - Number(v.slice(0, 4));
      expect(age).toBeGreaterThanOrEqual(29);
      expect(age).toBeLessThanOrEqual(41);
    }
    const future = column([field("f", "futureDate")], "f", { rows: 50 }) as string[];
    expect(future.every((v) => v > "2026-06-15")).toBe(true);
    const past = column([field("p", "pastDate")], "p", { rows: 50 }) as string[];
    expect(past.every((v) => v < "2026-06-15")).toBe(true);
  });

  it("sequence counts from start by step; boolean true % is respected", () => {
    expect(column([field("s", "sequence", { start: 100, step: 5 })], "s", { rows: 4 })).toEqual([100, 105, 110, 115]);
    expect(column([field("b", "boolean", { truePct: 100 })], "b", { rows: 30 }).every((v) => v === true)).toBe(true);
    expect(column([field("b", "boolean", { truePct: 0 })], "b", { rows: 30 }).every((v) => v === false)).toBe(true);
  });

  it("pick list follows weights and keeps numeric values numeric", () => {
    const v = column([field("s", "pickList", { values: "active:90, banned:10" })], "s", { rows: 2000 });
    const active = v.filter((x) => x === "active").length / v.length;
    expect(active).toBeGreaterThan(0.85);
    expect(active).toBeLessThan(0.95);
    expect(column([field("n", "pickList", { values: "1, 2, 3" })], "n", { rows: 20 }).every((x) => typeof x === "number")).toBe(true);
  });

  it("constant and custom text return their value; regex matches its pattern", () => {
    expect(column([field("c", "constant", { value: "42", as: "number" })], "c", { rows: 3 })).toEqual([42, 42, 42]);
    expect(column([field("t", "customText", { text: "hello" })], "t", { rows: 2 })).toEqual(["hello", "hello"]);
    expect((column([field("r", "regex", { pattern: "[A-Z]{3}-\\d{4}" })], "r") as string[]).every((s) => /^[A-Z]{3}-\d{4}$/.test(s))).toBe(true);
  });

  it("blank % leaves that share of values empty", () => {
    const v = column([field("x", "word", {}, { blankPct: 30 })], "x", { rows: 3000 });
    const blank = v.filter((x) => x === null).length / v.length;
    expect(blank).toBeGreaterThan(0.26);
    expect(blank).toBeLessThan(0.34);
  });

  it("templates and formulas use other fields, whatever their order", () => {
    const fields = [
      field("total", "formula", { expression: "{{quantity}} * {{unitPrice}}", decimals: 2 }),
      field("email", "template", { template: "{{first}}.{{last}}@example.com" }),
      field("quantity", "integer", { min: 1, max: 5 }),
      field("unitPrice", "decimal", { min: 1, max: 10, decimals: 2 }),
      field("first", "constant", { value: "asha" }),
      field("last", "constant", { value: "rao" }),
    ];
    const ds = gen(fields, { rows: 20 });
    expect(ds.columns).toEqual(["total", "email", "quantity", "unitPrice", "first", "last"]);
    for (const r of ds.rows) {
      expect(r.total).toBeCloseTo((r.quantity as number) * (r.unitPrice as number), 2);
      expect(r.email).toBe("asha.rao@example.com");
    }
  });

  it("builds nested objects and arrays", () => {
    const obj = field("address", "object");
    obj.children = [field("city", "city"), field("pin", "pincode")];
    const arr = field("tags", "array", { min: 2, max: 2 });
    arr.children = [field("tag", "word")];
    const ds = gen([obj, arr], { rows: 5 });
    for (const r of ds.rows) {
      expect(Object.keys(r.address as object)).toEqual(["city", "pin"]);
      expect(r.tags).toHaveLength(2);
    }
  });

  it("foreign keys take values from another field or a pasted list", () => {
    const ds = gen([field("id", "sequence"), field("parentId", "foreignKey", { source: "field", field: "id" })], { rows: 50 });
    const ids = new Set(ds.rows.map((r) => r.id));
    expect(ds.rows.every((r) => ids.has(r.parentId))).toBe(true);
    const listed = column([field("c", "foreignKey", { source: "list", list: "A, B" })], "c", { rows: 30 });
    expect(listed.every((v) => v === "A" || v === "B")).toBe(true);
  });

  it("every built-in preset generates", () => {
    for (const p of PRESETS) {
      const ds = gen(p.fields(), { rows: 25 });
      expect(ds.rows).toHaveLength(25);
    }
  });
});

describe("edge cases and data modes", () => {
  it("mixed mode replaces about edge % of a toggled field and labels each one", () => {
    const fields = [field("email", "email", {}, { edgeCases: true, edgePct: 20 }), field("name", "fullName")];
    const ds = gen(fields, { rows: 2000, dataMode: "mixed" });
    const share = ds.edges.filter((e) => e?.email).length / 2000;
    expect(share).toBeGreaterThan(0.16);
    expect(share).toBeLessThan(0.24);
    expect(ds.edges.some((e) => e?.name)).toBe(false);
    const edgeRow = ds.rows.find((r) => r[EDGE_FLAG] === true)!;
    expect(String(edgeRow[EDGE_TYPE])).toMatch(/^email: /);
    expect(ds.rows.find((r) => r[EDGE_FLAG] === false)![EDGE_TYPE]).toBe("");
    expect(ds.edgeCount).toBe(ds.edges.filter(Boolean).length);
  });

  it("valid mode never inserts edge cases or the edge columns", () => {
    const ds = gen([field("email", "email", {}, { edgeCases: true, edgePct: 100 })], { rows: 50 });
    expect(ds.edgeCount).toBe(0);
    expect(ds.columns).toEqual(["email"]);
  });

  it("edge-only mode uses edge values for every field that has them", () => {
    const ds = gen([field("n", "integer", { min: 1, max: 10 }), field("c", "constant", { value: "x" })], { rows: 40, dataMode: "edge" });
    expect(ds.edges.every((e) => e?.n)).toBe(true);
    expect(ds.rows.every((r) => r.c === "x")).toBe(true);
    const labels = new Set(ds.edges.map((e) => e!.n));
    expect([...labels].some((l) => l === "max + 1" || l === "min - 1" || l === "zero" || l === "2^31")).toBe(true);
  });

  it("edge columns can be switched off", () => {
    const ds = gen([field("e", "email", {}, { edgeCases: true })], { rows: 5, dataMode: "mixed", edgeColumns: false });
    expect(ds.columns).toEqual(["e"]);
  });

  it("the invalid-password type is always invalid", () => {
    const v = column([field("p", "invalidPassword")], "p", { rows: 100 }) as string[];
    expect(v.every((p) => p.length < 8 || p.length > 128 || !/\d/.test(p) || !/[^A-Za-z0-9\s]/.test(p) || /^\s+$/.test(p))).toBe(true);
  });
});

describe("uniqueness and seeds", () => {
  it("unique fields never repeat", () => {
    const v = column([field("n", "integer", { min: 1, max: 600 }, { unique: true })], "n", { rows: 500 });
    expect(new Set(v).size).toBe(500);
  });

  it("an impossible unique request is a validation error", () => {
    expect(() => gen([field("b", "boolean", {}, { unique: true })], { rows: 3 })).toThrow(GenerateError);
    expect(validateSchema([field("n", "integer", { min: 1, max: 10 }, { unique: true })], { rows: 11 })[0].message).toMatch(/only 10 different values/);
  });

  it("the same seed, schema and options give identical output", () => {
    const fields = PRESETS.find((p) => p.id === "user")!.fields();
    const a = gen(fields, { rows: 50, seed: 99, dataMode: "mixed" });
    const b = gen(fields, { rows: 50, seed: 99, dataMode: "mixed" });
    expect(a.rows).toEqual(b.rows);
    expect(gen(fields, { rows: 50, seed: 100 }).rows).not.toEqual(a.rows);
  });

  it("a random run reports the seed it used so it can be repeated", () => {
    const fields = [field("w", "word"), field("n", "integer")];
    const first = gen(fields, { rows: 10, seed: null });
    expect(gen(fields, { rows: 10, seed: first.seed }).rows).toEqual(first.rows);
  });
});

describe("schema validation", () => {
  const messages = (fields: Field[], rows = 10) => validateSchema(fields, { rows }).map((e) => e.message);

  it("flags missing and duplicate names", () => {
    expect(messages([field("", "word")])).toContain("A field has no name.");
    expect(messages([field("a", "word"), field("A", "word")]).filter((m) => m.includes("used more than once"))).toHaveLength(2);
  });

  it("flags min > max, bad dates and empty pick lists", () => {
    expect(messages([field("n", "integer", { min: 10, max: 1 })])[0]).toMatch(/min \(10\) is greater than max \(1\)/);
    expect(messages([field("d", "date", { from: "2025-02-30" })])[0]).toMatch(/must be a date/);
    expect(messages([field("d", "date", { from: "2025-05-01", to: "2025-01-01" })])[0]).toMatch(/from date is after/);
    expect(messages([field("p", "pickList", { values: " , " })])[0]).toMatch(/at least one value/);
  });

  it("flags unknown references and circular templates", () => {
    expect(messages([field("t", "template", { template: "{{nope}}" })])[0]).toMatch(/\{\{nope\}\} isn't a field/);
    const msgs = messages([field("a", "template", { template: "{{b}}" }), field("b", "template", { template: "{{a}}" })]);
    expect(msgs.some((m) => m.startsWith("Circular reference: a → b → a"))).toBe(true);
    expect(() => generationOrder([field("a", "formula", { expression: "{{a}} + 1" })])).toThrow(/Circular/);
  });

  it("flags bad regex, formulas, foreign keys and empty objects", () => {
    expect(messages([field("r", "regex", { pattern: "(a" })])[0]).toMatch(/regex: Missing \)/);
    expect(messages([field("f", "formula", { expression: "alert(1)" })])[0]).toMatch(/formula:/);
    expect(messages([field("k", "foreignKey", { source: "field", field: "k" })])[0]).toMatch(/can't point at itself/);
    expect(messages([field("o", "object")])[0]).toMatch(/at least one child/);
  });

  it("flags row counts outside 1–100,000", () => {
    expect(validateSchema([field("w", "word")], { rows: 0 })[0].message).toMatch(/Rows must be/);
    expect(validateSchema([field("w", "word")], { rows: 100_001 })[0].message).toMatch(/Rows must be/);
    expect(validateSchema([], { rows: 5 })[0].message).toBe("Add at least one field.");
  });
});
