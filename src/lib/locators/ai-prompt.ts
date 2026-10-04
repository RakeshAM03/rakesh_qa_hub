import { tagOf } from "./dom";

export const MAX_AI_CONTEXT = 8 * 1024;

/** Start tag of an element (attributes only, no children). */
function startTag(el: Element) {
  const attrs = Array.from(el.attributes)
    .map((a) => ` ${a.name}="${a.value.replace(/"/g, "&quot;")}"`)
    .join("");
  return `<${tagOf(el)}${attrs}>`;
}

/**
 * The element's outerHTML wrapped in its ancestors' start tags, trimmed to
 * 8 KB. This is all that's sent to the AI — never the whole page.
 */
export function elementContext(el: Element) {
  const ancestors: string[] = [];
  for (let p = el.parentElement; p && tagOf(p) !== "html"; p = p.parentElement) ancestors.unshift(startTag(p));
  let outer = el.outerHTML;
  const budget = MAX_AI_CONTEXT - 200;
  if (outer.length > budget / 2) outer = `${outer.slice(0, budget / 2)}<!-- …trimmed -->`;
  let chain = ancestors.join("\n");
  while (chain.length + outer.length > budget && ancestors.length > 1) {
    ancestors.shift();
    chain = `<!-- …outer ancestors trimmed -->\n${ancestors.join("\n")}`;
  }
  return `${chain}\n<!-- TARGET ELEMENT -->\n${outer}`.slice(0, MAX_AI_CONTEXT);
}

export const LOCATOR_SYSTEM = [
  "You are a test-automation expert who writes robust UI locators for Selenium and Playwright.",
  "Given an HTML element and its ancestors, suggest up to 5 alternative locators that uniquely select the TARGET ELEMENT.",
  "Prefer test attributes, stable ids, ARIA attributes and short scoped selectors. Avoid auto-generated ids/classes,",
  "positional indexes and long text. Each suggestion is a plain CSS selector or an XPath 1.0 expression.",
].join(" ");

export const LOCATOR_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["css", "xpath"] },
          selector: { type: "string" },
          reason: { type: "string", description: "One short sentence: why this is robust." },
        },
        required: ["kind", "selector", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

export function locatorUserPrompt(context: string, best?: string) {
  return [
    best ? `The rule-based engine's best locator so far: ${best}` : "",
    "HTML (ancestors' start tags, then the target element):",
    "```html",
    context,
    "```",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The same request as text, for "Copy prompt for Claude" when no API key is set. */
export function locatorCopyPrompt(context: string, best?: string) {
  return [
    LOCATOR_SYSTEM,
    "",
    locatorUserPrompt(context, best),
    "",
    "For each suggestion give: the CSS or XPath selector, the Selenium Java `By` and the Playwright TypeScript locator, and one line on why it's robust.",
  ].join("\n");
}
