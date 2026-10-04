/** Minimal, string-aware helpers for scanning Java source (no full parser). */

/** A Java double-quoted string literal. */
export const JAVA_STRING = String.raw`"(?:[^"\\\n]|\\.)*"`;

/** Decodes a Java string literal ("…") to its value. */
export function decodeJavaString(lit: string): string {
  return lit
    .slice(1, -1)
    .replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c: string) => {
      if (c[0] === "u") return String.fromCharCode(parseInt(c.slice(1), 16));
      return ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", "0": "\0" } as Record<string, string>)[c] ?? c;
    });
}

export const isJavaString = (s: string) => new RegExp(`^${JAVA_STRING}$`).test(s.trim());

/** Walks `src`, calling `onChar` for characters outside strings/char literals/comments. */
function scan(src: string, onCode: (ch: string, i: number) => boolean | void) {
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      i++;
      while (i < src.length && src[i] !== q) i += src[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (onCode(ch, i) === true) return;
    i++;
  }
}

/** Net { minus } count, ignoring braces in strings and comments. */
export function braceDelta(line: string) {
  let d = 0;
  scan(line, (ch) => {
    if (ch === "{") d++;
    else if (ch === "}") d--;
  });
  return d;
}

/** Net ( minus ) count, ignoring strings and comments. */
export function parenDelta(line: string) {
  let d = 0;
  scan(line, (ch) => {
    if (ch === "(") d++;
    else if (ch === ")") d--;
  });
  return d;
}

/** Index of the bracket closing the one at `open` ((, [ or {), or -1. */
export function findClose(src: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const o = src[open];
  const c = pairs[o];
  let depth = 0;
  let found = -1;
  scan(src.slice(open), (ch, i) => {
    if (ch === o) depth++;
    else if (ch === c) {
      depth--;
      if (depth === 0) {
        found = open + i;
        return true;
      }
    }
  });
  return found;
}

/** Splits an argument list on top-level commas. */
export function splitArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let last = 0;
  scan(args, (ch, i) => {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      out.push(args.slice(last, i).trim());
      last = i + 1;
    }
  });
  const tail = args.slice(last).trim();
  if (tail || out.length) out.push(tail);
  return out;
}

/** Positions of `needle` that are outside strings and comments. */
export function codeIndexes(src: string, needle: RegExp): { index: number; match: RegExpExecArray }[] {
  const allowed = new Set<number>();
  scan(src, (_, i) => {
    allowed.add(i);
  });
  const re = new RegExp(needle.source, needle.flags.includes("g") ? needle.flags : `${needle.flags}g`);
  const out: { index: number; match: RegExpExecArray }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (allowed.has(m.index)) out.push({ index: m.index, match: m });
    if (m[0] === "") re.lastIndex++;
  }
  return out;
}

/**
 * Replaces every call `<prefix>(…)` (prefix matched by `re`, which must end
 * right before "(") with `fn(match, args)`. Arguments are balanced and
 * string-aware. Rewrites from the right so indexes stay valid.
 */
export function replaceCalls(
  src: string,
  re: RegExp,
  fn: (m: RegExpExecArray, args: string[], rawArgs: string) => string | null,
): string {
  const hits = codeIndexes(src, re).filter(({ index, match }) => src[index + match[0].length] === "(");
  let out = src;
  for (const { index, match } of hits.reverse()) {
    const open = index + match[0].length;
    const close = findClose(out, open);
    if (close === -1) continue;
    const raw = out.slice(open + 1, close);
    const replacement = fn(match, splitArgs(raw), raw);
    if (replacement === null) continue;
    out = out.slice(0, index) + replacement + out.slice(close + 1);
  }
  return out;
}

/**
 * Start index of the member-access chain ending at `end` (exclusive), e.g. for
 * `expect(this.form.locator('#a').first()` + `.click` it returns the index of `this`.
 */
export function chainStart(src: string, end: number): number {
  let i = end;
  while (i > 0) {
    const ch = src[i - 1];
    if (/[\w$]/.test(ch)) {
      i--;
      continue;
    }
    if (ch === "." && i - 1 > 0) {
      i--;
      continue;
    }
    if (ch === ")" || ch === "]") {
      // walk back to the matching opener
      const opener = ch === ")" ? "(" : "[";
      let depth = 0;
      let j = i - 1;
      for (; j >= 0; j--) {
        if (src[j] === ch) depth++;
        else if (src[j] === opener) {
          depth--;
          if (depth === 0) break;
        }
      }
      if (j < 0) break;
      // a call: include the callee name before "(" ; a bare group "(…)" stops unless preceded by an identifier
      if (j > 0 && /[\w$\]]/.test(src[j - 1])) {
        i = j;
        continue;
      }
      i = j;
      break;
    }
    break;
  }
  return i;
}

/** Converts remaining Java "…" string literals to TS '…' (skips existing '…' and `…`). */
export function javaStringsToTs(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'" || ch === "`") {
      const start = i;
      i++;
      while (i < src.length && src[i] !== ch) i += src[i] === "\\" ? 2 : 1;
      i++;
      out += src.slice(start, i);
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      out += src.slice(i);
      break;
    }
    if (ch === '"') {
      const start = i;
      i++;
      while (i < src.length && src[i] !== '"') i += src[i] === "\\" ? 2 : 1;
      i++;
      out += tsLit(decodeJavaString(src.slice(start, i)));
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** A TS single-quoted literal. */
export function tsLit(value: string) {
  const q = value.includes("'") && !value.includes('"') ? '"' : "'";
  const escaped = value.replace(/\\/g, "\\\\").replace(new RegExp(q, "g"), `\\${q}`).replace(/\n/g, "\\n").replace(/\t/g, "\\t");
  return `${q}${escaped}${q}`;
}

/** Java expression → TS literal when it's a string literal, else the expression unchanged. */
export function argToTs(arg: string) {
  return isJavaString(arg) ? tsLit(decodeJavaString(arg.trim())) : arg.trim();
}

/** "verifyLoginWithValidUser" → "verify login with valid user". */
export function methodTitle(name: string) {
  return name
    .replace(/^test_?/i, (m) => (name.length > m.length ? "" : m))
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Splits a line holding several statements ("a(); b();", "if (x) { y(); }")
 * at top-level ";", "{" and "}". Array-initializer braces ("= {…}") and
 * semicolons inside parentheses (for loops) are not split points.
 */
export function splitStatements(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let paren = 0;
  const braces: ("block" | "init")[] = [];
  const inInit = () => braces.includes("init");
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
      cur += line.slice(i, j + 1);
      i = j;
      continue;
    }
    if (ch === "/" && line[i + 1] === "/") {
      cur += line.slice(i);
      break;
    }
    cur += ch;
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "{") {
      const prev = cur.slice(0, -1).trimEnd().slice(-1);
      const kind = inInit() || "=],({".includes(prev) || /\breturn$/.test(cur.slice(0, -1).trimEnd()) || /\]\s*$/.test(cur.slice(0, -1)) ? "init" : "block";
      braces.push(kind);
      if (kind === "block" && paren === 0) {
        out.push(cur.trim());
        cur = "";
      }
    } else if (ch === "}") {
      const kind = braces.pop();
      if (kind === "block" && paren === 0) {
        const before = cur.slice(0, -1).trim();
        if (before) out.push(before);
        // keep "} else {", "} catch (…) {", "});" together with the brace
        cur = "}";
        const rest = line.slice(i + 1);
        if (!/^\s*(else|catch|finally|while|\)|;)/.test(rest)) {
          out.push(cur);
          cur = "";
        }
      }
    } else if (ch === ";" && paren === 0 && !inInit()) {
      out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
