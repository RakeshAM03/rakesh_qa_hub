/** Quote helpers for generated selectors and code. */

export type Quote = "'" | '"';

const other = (q: Quote): Quote => (q === "'" ? '"' : "'");

/** A Java string literal: "…". */
export function javaString(s: string) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

/** A TypeScript single-quoted string literal: '…'. */
export function tsString(s: string) {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
}

/** A quoted CSS attribute value, preferring quote `q`. */
export function cssValue(value: string, q: Quote = "'") {
  return `${q}${value.replace(/\\/g, "\\\\").replace(new RegExp(q, "g"), `\\${q}`)}${q}`;
}

/**
 * An XPath string literal, preferring quote `q`. XPath 1.0 has no escapes, so a
 * value containing both quote kinds becomes concat('…', "'", '…').
 */
export function xpathLiteral(value: string, q: Quote = "'") {
  if (!value.includes(q)) return `${q}${value}${q}`;
  const o = other(q);
  if (!value.includes(o)) return `${o}${value}${o}`;
  const parts = value.split("'").map((p) => `'${p}'`);
  return `concat(${parts.join(`, "'", `)})`;
}

/** True for a value usable as a bare CSS identifier (#id, .class). */
export function isCssIdent(s: string) {
  return /^-?[A-Za-z_][\w-]*$/.test(s);
}
