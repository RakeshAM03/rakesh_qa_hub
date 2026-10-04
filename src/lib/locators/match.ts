import { accessibleName, isElement, labelTextOf, normalizeText, roleOf, textOf } from "./dom";

/** ORDERED_NODE_SNAPSHOT_TYPE — numeric so this works without a global XPathResult. */
const SNAPSHOT = 7;

export function queryCss(doc: Document, css: string): Element[] {
  return Array.from(doc.querySelectorAll(css));
}

export function queryXpath(doc: Document, xpath: string): Element[] {
  const result = doc.evaluate(xpath, doc, null, SNAPSHOT, null);
  const out: Element[] = [];
  for (let i = 0; i < result.snapshotLength; i++) {
    const node = result.snapshotItem(i);
    if (isElement(node)) out.push(node);
  }
  return out;
}

const all = (doc: Document) => Array.from(doc.querySelectorAll("*"));

/** Playwright's default name matching: case-insensitive substring, unless exact. */
const nameMatches = (actual: string, wanted: string, exact: boolean) =>
  exact ? actual === wanted : actual.toLowerCase().includes(wanted.toLowerCase());

/** Elements page.getByRole(role, { name }) would match. */
export function queryRole(doc: Document, role: string, name: string, exact = false) {
  return all(doc).filter((el) => roleOf(el) === role && nameMatches(accessibleName(el), name, exact));
}

/** Elements page.getByLabel(text) would match (form controls and aria-label). */
export function queryLabel(doc: Document, text: string, exact = false) {
  return all(doc).filter((el) => {
    const label = labelTextOf(el) || normalizeText(el.getAttribute("aria-label"));
    return !!label && nameMatches(label, text, exact);
  });
}

export function queryPlaceholder(doc: Document, text: string, exact = false) {
  return all(doc).filter((el) => {
    const p = el.getAttribute("placeholder");
    return p !== null && nameMatches(normalizeText(p), text, exact);
  });
}

/**
 * Elements page.getByText(text, { exact: true }) would match: the deepest
 * elements whose normalised text equals `text`.
 */
export function queryText(doc: Document, text: string) {
  const wanted = normalizeText(text);
  return all(doc).filter((el) => {
    if (["script", "style", "head", "title", "html", "body"].includes(el.tagName.toLowerCase())) return false;
    if (textOf(el) !== wanted) return false;
    return !Array.from(el.children).some((c) => textOf(c) === wanted);
  });
}

export type TestResult = { kind: "css" | "xpath"; elements: Element[]; error?: undefined } | { kind: "css" | "xpath"; elements: []; error: string };

/** For the "Test a locator" tab: CSS or XPath (auto-detected; css= / xpath= prefixes allowed). */
export function testSelector(doc: Document, input: string): TestResult {
  let sel = input.trim();
  let kind: "css" | "xpath" = /^(\/|\(|\.\/|\.\.)/.test(sel) ? "xpath" : "css";
  if (/^xpath=/i.test(sel)) {
    kind = "xpath";
    sel = sel.slice(6);
  } else if (/^css=/i.test(sel)) {
    kind = "css";
    sel = sel.slice(4);
  }
  if (!sel) return { kind, elements: [], error: "Enter a CSS selector or XPath." };
  try {
    return { kind, elements: kind === "css" ? queryCss(doc, sel) : queryXpath(doc, sel) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      kind,
      elements: [],
      error: `Invalid ${kind === "css" ? "CSS selector" : "XPath"}: ${message.slice(0, 200) || "syntax error"}`,
    };
  }
}
