import { describe, expect, it } from "vitest";

import { aadhaar, cardBrandOf, gstin, gstinCheckChar, ifsc, inMobile, isLuhnValid, isVerhoeffValid, pan, pincode, SANDBOX_CARDS, testCardNumber, verhoeffCheckDigit, type Rand } from "./formats";
import { evaluate, formulaRefs, FormulaError, parseFormula, references, renderTemplate } from "./formula";
import { generateFromRegex, parseRegex, RegexError, regexVariety } from "./regex";

/** Deterministic Rand for format helpers. */
function rand(seed = 1): Rand {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
  return { int: (min, max) => min + Math.floor(next() * (max - min + 1)), pick: (items) => items[Math.floor(next() * items.length)] };
}

describe("formula evaluator", () => {
  const calc = (src: string, values: Record<string, never | number | string | null> = {}) => evaluate(parseFormula(src), values);

  it("does arithmetic with precedence and brackets", () => {
    expect(calc("2 + 3 * 4")).toBe(14);
    expect(calc("(2 + 3) * 4")).toBe(20);
    expect(calc("10 / 4 - 1")).toBe(1.5);
    expect(calc("-3 + 5")).toBe(2);
  });

  it("uses field references and numeric strings", () => {
    expect(calc("{{quantity}} * {{unitPrice}}", { quantity: 3, unitPrice: "2.50" })).toBe(7.5);
    expect(formulaRefs(parseFormula("{{a}} + {{ b }} * {{a}}"))).toEqual(new Set(["a", "b"]));
  });

  it("concatenates when either side of + is text", () => {
    expect(calc("{{first}} + ' ' + {{last}}", { first: "Asha", last: "Rao" })).toBe("Asha Rao");
    expect(calc('"ID-" + 42')).toBe("ID-42");
  });

  it("returns null for division by zero and arithmetic on text", () => {
    expect(calc("1 / 0")).toBeNull();
    expect(calc("{{name}} * 2", { name: "abc" })).toBeNull();
  });

  it.each([
    "alert(1)",
    "constructor",
    "{{a}} ** 2",
    "process.exit()",
    "1; 2",
    "{{a}} % 2",
    "[1,2]",
    "`x`",
    "{{a}} == 1",
    "this",
    "Math.max(1, 2)",
  ])("rejects unsafe or unsupported input: %s", (src) => {
    expect(() => parseFormula(src)).toThrow(FormulaError);
  });

  it("rejects unbalanced brackets, dangling operators and unclosed strings", () => {
    expect(() => parseFormula("(1 + 2")).toThrow("Missing )");
    expect(() => parseFormula("1 +")).toThrow(FormulaError);
    expect(() => parseFormula("'abc")).toThrow("isn't closed");
    expect(() => parseFormula("{{a")).toThrow("closing }}");
    expect(() => parseFormula("")).toThrow("empty");
  });

  it("renders templates and lists their references", () => {
    expect(renderTemplate("{{firstName}}.{{lastName}}@example.com", { firstName: "Asha", lastName: "Rao" })).toBe("Asha.Rao@example.com");
    expect(renderTemplate("{{missing}}-{{n}}", { n: null })).toBe("-");
    expect(references("{{a}} and {{ b }} and {{a}}")).toEqual(["a", "b"]);
  });
});

describe("regex generator", () => {
  const r = rand(7);
  const gen = (p: string) => generateFromRegex(parseRegex(p), r.int);

  it.each(["[A-Z]{3}-\\d{4}", "ORD-\\d{6}", "(foo|bar)_[a-f0-9]{2,4}", "\\w+@example\\.com", "[^0-9]{5}", "a?b*c+", "(?:ab){2}", "^[A-Z][a-z]{2,5}$"])(
    "generates strings matching %s",
    (p) => {
      const re = new RegExp(`^(?:${p.replace(/^\^|\$$/g, "")})$`);
      for (let i = 0; i < 50; i++) expect(gen(p)).toMatch(re);
    },
  );

  it.each([
    ["(a", "Missing )"],
    ["a)", "Unmatched )"],
    ["[abc", "Missing ]"],
    ["(a)\\1", "Back-references"],
    ["(?=a)", "Look-arounds"],
    ["*a", "Nothing to repeat"],
    ["a{3,1}", "max below min"],
    ["[z-a]", "Invalid range"],
  ])("rejects %s", (p, msg) => {
    expect(() => parseRegex(p)).toThrow(RegexError);
    expect(() => parseRegex(p)).toThrow(msg);
  });

  it("counts how many distinct strings a pattern allows", () => {
    expect(regexVariety(parseRegex("[ab]{2}"))).toBe(4);
    expect(regexVariety(parseRegex("x|y|z"))).toBe(3);
    expect(regexVariety(parseRegex("\\d{3}"))).toBe(1000);
  });
});

describe("format-only identifiers", () => {
  const r = rand(3);

  it("sandbox card numbers are Luhn-valid and match their brand", () => {
    for (const [brand, numbers] of Object.entries(SANDBOX_CARDS)) {
      for (const n of numbers) {
        expect(isLuhnValid(n)).toBe(true);
        expect(cardBrandOf(n)).toBe(brand);
      }
    }
  });

  it("random Luhn numbers are valid, use sandbox prefixes and the right length", () => {
    for (let i = 0; i < 50; i++) {
      const n = testCardNumber(r, "any", "luhn");
      expect(isLuhnValid(n)).toBe(true);
      expect(n).toMatch(/^(411111|424242|555555|222300|378282|601111)/);
      expect(n.length).toBe(n.startsWith("37") ? 15 : 16);
    }
    expect(SANDBOX_CARDS.visa).toContain(testCardNumber(r, "visa", "sandbox"));
  });

  it("Aadhaar-format numbers are masked by default and always fail the check digit", () => {
    expect(aadhaar(r, true)).toMatch(/^XXXX XXXX \d{4}$/);
    for (let i = 0; i < 200; i++) {
      const full = aadhaar(r, false);
      expect(full).toMatch(/^[2-9]\d{3} \d{4} \d{4}$/);
      expect(isVerhoeffValid(full.replace(/ /g, ""))).toBe(false);
    }
  });

  it("Verhoeff helper agrees with a known valid number", () => {
    expect(verhoeffCheckDigit("236")).toBe(3);
    expect(isVerhoeffValid("2363")).toBe(true);
  });

  it("India formats follow their patterns", () => {
    for (let i = 0; i < 50; i++) {
      expect(inMobile(r)).toMatch(/^\+91[6-9]\d{9}$/);
      expect(pan(r)).toMatch(/^[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]$/);
      expect(ifsc(r)).toMatch(/^[A-Z]{4}0[A-Z0-9]{6}$/);
      expect(pincode(r)).toMatch(/^[1-8]\d{5}$/);
      const g = gstin(r);
      expect(g).toMatch(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9]Z[0-9A-Z]$/);
      expect(gstinCheckChar(g.slice(0, 14))).toBe(g[14]);
    }
  });

  it("GSTIN check character matches a published sample", () => {
    expect(gstinCheckChar("27AAPFU0939F1Z")).toBe("V");
  });
});
