import { isElement, isInteractive, normalizeText, tagOf, testAttrOf, textOf } from "./dom";

export const MAX_HTML_BYTES = 1024 * 1024;

export type TreeNode = {
  /** Child-index path from <html>, e.g. "1.0.2" — stable for the same HTML. */
  path: string;
  tag: string;
  id?: string;
  name?: string;
  testAttr?: string;
  text?: string;
  interactive: boolean;
  children: TreeNode[];
};

const SKIP = new Set(["script", "style", "template", "noscript", "head", "meta", "link"]);

/** Own text (direct text nodes) or, failing that, the element's text — first 30 chars. */
function shortText(el: Element) {
  let own = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) own += n.textContent ?? "";
  });
  const t = normalizeText(own) || (el.children.length === 0 ? textOf(el) : "");
  return t.length > 30 ? `${t.slice(0, 30)}…` : t;
}

/** Inert parse: DOMParser documents never run scripts or load resources. */
export function parseHtml(html: string, parser: DOMParser) {
  return parser.parseFromString(html, "text/html");
}

export function buildTree(doc: Document): TreeNode | null {
  const root = doc.documentElement;
  if (!root) return null;
  const walk = (el: Element, path: string): TreeNode => {
    const test = testAttrOf(el);
    const children: TreeNode[] = [];
    Array.from(el.children).forEach((c, i) => {
      if (!SKIP.has(tagOf(c))) children.push(walk(c, `${path}.${i}`));
    });
    return {
      path,
      tag: tagOf(el),
      id: el.getAttribute("id") ?? undefined,
      name: el.getAttribute("name") ?? undefined,
      testAttr: test ? `${test.name}="${test.value}"` : undefined,
      text: shortText(el) || undefined,
      interactive: isInteractive(el),
      children,
    };
  };
  return walk(root, "0");
}

export function pathOf(el: Element): string {
  const parts: number[] = [];
  for (let n: Element | null = el; n && n.parentElement; n = n.parentElement) {
    parts.unshift(Array.from(n.parentElement.children).indexOf(n));
  }
  return ["0", ...parts].join(".");
}

export function elementAt(doc: Document, path: string): Element | null {
  const [first, ...rest] = path.split(".");
  if (first !== "0") return null;
  let el: Element | null = doc.documentElement;
  for (const p of rest) {
    const next: Element | undefined = el?.children[Number(p)];
    if (!isElement(next)) return null;
    el = next;
  }
  return el;
}

/** Does a node match the filter text (tag, attribute or text, case-insensitive)? */
export function nodeMatches(node: TreeNode, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [node.tag, node.id, node.name, node.testAttr, node.text].some((v) => v?.toLowerCase().includes(q));
}

/**
 * Filters the tree, keeping matching nodes and the ancestors needed to reach
 * them. `interactiveOnly` keeps only interactive matches.
 */
export function filterTree(node: TreeNode, query: string, interactiveOnly: boolean): TreeNode | null {
  const children = node.children.map((c) => filterTree(c, query, interactiveOnly)).filter((c): c is TreeNode => !!c);
  const self = nodeMatches(node, query) && (!interactiveOnly || node.interactive);
  if (self || children.length) return { ...node, children };
  return null;
}

/** "Find by text": the best element whose visible text matches — exact first, interactive first, deepest. */
export function findByText(doc: Document, query: string): Element | null {
  const q = normalizeText(query).toLowerCase();
  if (!q) return null;
  const body = doc.body ?? doc.documentElement;
  const els = Array.from(body.querySelectorAll("*")).filter((el) => !SKIP.has(tagOf(el)));
  const textMatch = (el: Element) => {
    const t = textOf(el).toLowerCase();
    const attr = (el.getAttribute("value") ?? el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? "").toLowerCase();
    if (t === q || attr === q) return 2;
    if (t.includes(q) || attr.includes(q)) return 1;
    return 0;
  };
  let best: { el: Element; rank: number } | null = null;
  for (const el of els) {
    const m = textMatch(el);
    if (!m) continue;
    // Prefer the deepest: skip if a child matches equally well.
    if (Array.from(el.children).some((c) => textMatch(c) >= m)) continue;
    const rank = m * 10 + (isInteractive(el) ? 5 : 0);
    if (!best || rank > best.rank) best = { el, rank };
  }
  return best?.el ?? null;
}

export const SAMPLE_HTML = `<form id="login" class="login-form" action="/login" method="post">
  <h2>Sign in to your account</h2>
  <div class="field">
    <label for="email">Email</label>
    <input id="email" name="email" type="email" placeholder="you@example.com" autocomplete="username">
  </div>
  <div class="field">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" placeholder="Password">
  </div>
  <label class="remember"><input type="checkbox" name="remember"> Remember me</label>
  <a href="/forgot-password" class="link-muted">Forgot password?</a>
  <button type="submit" class="btn btn-primary" data-testid="login-btn">Sign in</button>
  <button type="button" class="btn btn_x7f3a" id="ember1042">Cancel</button>
</form>`;
