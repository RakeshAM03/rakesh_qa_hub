/**
 * Generates strings that match a simple regular expression.
 * Supported: literals, escapes (\d \w \s \D \W \S and escaped symbols), `.`, character
 * classes with ranges and negation, groups `( )` / `(?: )`, alternation `|`, and the
 * quantifiers `? * + {n} {n,} {n,m}`. Anchors `^ $` are ignored. Unbounded repeats stop
 * at +5. Anything else (back-references, look-arounds, flags) is rejected.
 */

type Node =
  | { kind: "chars"; set: string }
  | { kind: "seq"; items: Node[] }
  | { kind: "alt"; options: Node[] }
  | { kind: "repeat"; node: Node; min: number; max: number };

const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
const DIGIT = "0123456789";
const WORD = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";
const SPACE = " \t";
const MAX_EXTRA = 5;

export class RegexError extends Error {}

const not = (set: string) => [...PRINTABLE].filter((c) => !set.includes(c)).join("");

const ESCAPES: Record<string, string> = { d: DIGIT, w: WORD, s: SPACE, D: not(DIGIT), W: not(WORD), S: not(SPACE) };

export function parseRegex(pattern: string): Node {
  if (pattern.length > 500) throw new RegexError("Pattern is too long (max 500 characters).");
  let i = 0;

  const fail = (msg: string): never => {
    throw new RegexError(`${msg} (at position ${i + 1}).`);
  };

  function escape(): string {
    const c = pattern[i++];
    if (c === undefined) fail("Pattern ends with a backslash");
    if (ESCAPES[c]) return ESCAPES[c];
    if (/[1-9]/.test(c)) fail("Back-references aren't supported");
    if (c === "b" || c === "B") fail("Word boundaries aren't supported");
    if (c === "n") return "\n";
    if (c === "t") return "\t";
    if (/[a-zA-Z0-9]/.test(c)) fail(`\\${c} isn't supported`);
    return c;
  }

  function charClass(): Node {
    let negate = false;
    if (pattern[i] === "^") {
      negate = true;
      i++;
    }
    let set = "";
    let first = true;
    while (i < pattern.length && (pattern[i] !== "]" || first)) {
      first = false;
      let c: string;
      if (pattern[i] === "\\") {
        i++;
        const e = escape();
        if (e.length > 1) {
          set += e;
          continue;
        }
        c = e;
      } else c = pattern[i++];
      if (pattern[i] === "-" && pattern[i + 1] !== undefined && pattern[i + 1] !== "]") {
        i++;
        let end = pattern[i++];
        if (end === "\\") end = escape();
        if (end.length !== 1 || end < c) fail(`Invalid range ${c}-${end}`);
        for (let code = c.charCodeAt(0); code <= end.charCodeAt(0); code++) set += String.fromCharCode(code);
      } else set += c;
    }
    if (pattern[i] !== "]") fail("Missing ]");
    i++;
    const unique = [...new Set(set)].join("");
    const result = negate ? not(unique) : unique;
    if (!result) fail("Character class matches nothing");
    return { kind: "chars", set: result };
  }

  function atom(): Node | null {
    const c = pattern[i];
    if (c === "(") {
      i++;
      if (pattern[i] === "?") {
        if (pattern[i + 1] === ":") i += 2;
        else fail("Look-arounds and named groups aren't supported");
      }
      const inner = alternation();
      if (pattern[i] !== ")") fail("Missing )");
      i++;
      return inner;
    }
    if (c === "[") {
      i++;
      return charClass();
    }
    if (c === "\\") {
      i++;
      return { kind: "chars", set: escape() };
    }
    if (c === ".") {
      i++;
      return { kind: "chars", set: PRINTABLE };
    }
    if (c === "^" || c === "$") {
      i++;
      return { kind: "seq", items: [] };
    }
    if (c === "*" || c === "+" || c === "?" || c === "{") fail("Nothing to repeat");
    i++;
    return { kind: "chars", set: c };
  }

  function quantified(): Node | null {
    const a = atom();
    if (!a) return null;
    const c = pattern[i];
    let min: number, max: number;
    if (c === "?") [min, max] = [0, 1];
    else if (c === "*") [min, max] = [0, MAX_EXTRA];
    else if (c === "+") [min, max] = [1, 1 + MAX_EXTRA];
    else if (c === "{") {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
      if (!m) return a;
      min = Number(m[1]);
      max = m[2] === undefined ? min : m[3] === "" ? min + MAX_EXTRA : Number(m[3]);
      if (max < min) fail(`{${min},${max}} has max below min`);
      if (max > 10000) fail("Repeat count is too large (max 10000)");
      i += m[0].length - 1;
    } else return a;
    i++;
    if (pattern[i] === "?" || pattern[i] === "+") i++; // lazy / possessive: same output
    return { kind: "repeat", node: a, min, max };
  }

  function sequence(): Node {
    const items: Node[] = [];
    while (i < pattern.length && pattern[i] !== "|" && pattern[i] !== ")") {
      const q = quantified();
      if (q) items.push(q);
    }
    return { kind: "seq", items };
  }

  function alternation(): Node {
    const options = [sequence()];
    while (pattern[i] === "|") {
      i++;
      options.push(sequence());
    }
    return options.length === 1 ? options[0] : { kind: "alt", options };
  }

  const node = alternation();
  if (i < pattern.length) fail("Unmatched )");
  return node;
}

/** `int(min, max)` returns an integer in [min, max]. */
export function generateFromRegex(node: Node, int: (min: number, max: number) => number): string {
  switch (node.kind) {
    case "chars":
      return node.set[int(0, node.set.length - 1)];
    case "seq":
      return node.items.map((n) => generateFromRegex(n, int)).join("");
    case "alt":
      return generateFromRegex(node.options[int(0, node.options.length - 1)], int);
    case "repeat": {
      const n = int(node.min, node.max);
      let out = "";
      for (let k = 0; k < n; k++) out += generateFromRegex(node.node, int);
      return out;
    }
  }
}

/** Upper bound on distinct strings the pattern can produce (capped), for "unique" checks. */
export function regexVariety(node: Node, cap = 1e12): number {
  switch (node.kind) {
    case "chars":
      return node.set.length;
    case "seq":
      return node.items.reduce((acc, n) => Math.min(cap, acc * regexVariety(n, cap)), 1);
    case "alt":
      return Math.min(cap, node.options.reduce((acc, n) => acc + regexVariety(n, cap), 0));
    case "repeat": {
      const v = regexVariety(node.node, cap);
      let total = 0;
      for (let k = node.min; k <= node.max && total < cap; k++) total += Math.min(cap, v ** k);
      return Math.min(cap, total);
    }
  }
}
