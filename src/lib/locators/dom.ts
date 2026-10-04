/**
 * Small DOM helpers that work on any Document (browser DOMParser or jsdom).
 * Elements are checked by nodeType, never `instanceof`, so documents from
 * another realm work too.
 */

export const TEST_ATTRS = ["data-testid", "data-test-id", "data-test", "data-qa", "data-cy"] as const;

export const isElement = (n: Node | null | undefined): n is Element => !!n && n.nodeType === 1;

export const tagOf = (el: Element) => el.tagName.toLowerCase();

export function normalizeText(s: string | null | undefined) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Visible-ish text: textContent minus <script>/<style>, whitespace normalised. */
export function textOf(el: Element): string {
  if (!el.querySelector("script, style, template")) return normalizeText(el.textContent);
  let out = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) out += n.textContent ?? "";
    else if (isElement(n) && !["script", "style", "template"].includes(tagOf(n))) out += ` ${textOf(n)} `;
  });
  return normalizeText(out);
}

const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea", "option", "summary", "label"]);

export function isInteractive(el: Element) {
  return INTERACTIVE_TAGS.has(tagOf(el)) || el.hasAttribute("role") || el.hasAttribute("onclick") || el.hasAttribute("contenteditable");
}

export function testAttrOf(el: Element): { name: string; value: string } | null {
  for (const name of TEST_ATTRS) {
    const value = el.getAttribute(name);
    if (value && value.trim()) return { name, value };
  }
  return null;
}

/** ARIA role: explicit role attribute, else the implicit role of common elements. */
export function roleOf(el: Element): string | null {
  const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0];
  if (explicit) return explicit;
  const tag = tagOf(el);
  switch (tag) {
    case "a":
    case "area":
      return el.hasAttribute("href") ? "link" : null;
    case "button":
      return "button";
    case "select":
      return el.hasAttribute("multiple") || Number(el.getAttribute("size") ?? 0) > 1 ? "listbox" : "combobox";
    case "textarea":
      return "textbox";
    case "option":
      return "option";
    case "img":
      return el.getAttribute("alt") === "" ? "presentation" : "img";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "nav":
      return "navigation";
    case "ul":
    case "ol":
      return "list";
    case "li":
      return "listitem";
    case "table":
      return "table";
    case "dialog":
      return "dialog";
    case "input": {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "number") return "spinbutton";
      if (type === "search") return "searchbox";
      if (["text", "email", "tel", "url", "password", ""].includes(type)) return type === "password" ? null : "textbox";
      return null;
    }
    default:
      return null;
  }
}

const FORM_CONTROLS = new Set(["input", "select", "textarea"]);
export const isFormControl = (el: Element) => FORM_CONTROLS.has(tagOf(el));

/** The <label> for a form control: label[for=id], or a wrapping label. */
export function labelElementOf(el: Element): Element | null {
  if (!isFormControl(el)) return null;
  const id = el.getAttribute("id");
  if (id) {
    for (const label of Array.from(el.ownerDocument.querySelectorAll("label[for]"))) {
      if (label.getAttribute("for") === id) return label;
    }
  }
  return el.closest("label");
}

export function labelTextOf(el: Element): string {
  const label = labelElementOf(el);
  return label ? textOf(label) : "";
}

/** A simplified accessible-name computation (aria-labelledby, aria-label, label, content, alt, title). */
export function accessibleName(el: Element): string {
  const doc = el.ownerDocument;
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((e): e is HTMLElement => isElement(e))
      .map((e) => textOf(e))
      .join(" ");
    if (normalizeText(text)) return normalizeText(text);
  }
  const aria = normalizeText(el.getAttribute("aria-label"));
  if (aria) return aria;
  const tag = tagOf(el);
  if (tag === "input") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (["submit", "button", "reset"].includes(type)) {
      return normalizeText(el.getAttribute("value")) || (type === "submit" ? "Submit" : type === "reset" ? "Reset" : "");
    }
    if (type === "image") return normalizeText(el.getAttribute("alt"));
  }
  if (isFormControl(el)) {
    const label = labelTextOf(el);
    if (label) return label;
    return normalizeText(el.getAttribute("title")) || normalizeText(el.getAttribute("placeholder"));
  }
  if (tag === "img") return normalizeText(el.getAttribute("alt"));
  const text = textOf(el) || imgAltText(el);
  return text || normalizeText(el.getAttribute("title"));
}

function imgAltText(el: Element) {
  return normalizeText(
    Array.from(el.querySelectorAll("img[alt]"))
      .map((i) => i.getAttribute("alt"))
      .join(" "),
  );
}

/** Element's position among same-tag siblings (1-based) and whether it has same-tag siblings. */
export function sameTagIndex(el: Element): { index: number; ambiguous: boolean } {
  const parent = el.parentElement;
  if (!parent) return { index: 1, ambiguous: false };
  const same = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  return { index: same.indexOf(el) + 1, ambiguous: same.length > 1 };
}
