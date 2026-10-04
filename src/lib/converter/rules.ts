/**
 * Selenium Java → Playwright TypeScript rules. Each rule has a pattern, a
 * replacement and a confidence level; anything not covered becomes a
 * `// TODO(convert)` line with a review note.
 */
import {
  argToTs,
  chainStart,
  codeIndexes,
  decodeJavaString,
  findClose,
  isJavaString,
  javaStringsToTs,
  replaceCalls,
  splitArgs,
  tsLit,
} from "./java";
import type { Severity } from "./types";

export type Confidence = "high" | "medium" | "low";

export type RuleContext = {
  /** Receiver for page-level calls: "page" in tests, "this.page" in page objects. */
  page: "page" | "this.page";
  semantic: boolean;
  keepSleeps: boolean;
  framework: "testng" | "junit5" | "junit4";
  /** Names (or this.x expressions) known to hold Playwright locators. */
  locators: Set<string>;
  actionsVars: Set<string>;
  jsVars: Set<string>;
  waitVars: Set<string>;
  softVars: Set<string>;
  /** Page object class names in the input (new X(driver) → new X(page)). */
  pageClasses: Set<string>;
  /** Variables holding page objects — every method call on them is awaited. */
  poVars: Set<string>;
  /** This page object's own methods (this.x() is awaited). */
  ownMethods: Set<string>;
  note: (severity: Severity, message: string, dedupeKey?: string) => void;
  removed: (kind: string) => void;
};

// ---------------------------------------------------------------- locators

const cssIdent = (s: string) => /^-?[A-Za-z_][\w-]*$/.test(s);

/** Template literal for a non-literal argument: `prefix${expr}suffix`. */
const tpl = (prefix: string, expr: string, suffix = "") => `\`${prefix}\${${expr}}${suffix}\``;

/** By.<how>(arg) → the Playwright locator call without receiver, e.g. "locator('#x')". */
export function byToPlaywright(how: string, rawArg: string, semantic = false): string | null {
  const literal = isJavaString(rawArg);
  const v = literal ? decodeJavaString(rawArg.trim()) : rawArg.trim();
  const str = (s: string) => tsLit(s);
  switch (how) {
    case "id":
      return literal ? `locator(${str(cssIdent(v) ? `#${v}` : `[id="${v}"]`)})` : `locator(${tpl("#", v)})`;
    case "name":
      return literal ? `locator(${str(`[name="${v}"]`)})` : `locator(${tpl('[name="', v, '"]')})`;
    case "className":
      return literal ? `locator(${str(`.${v.trim().split(/\s+/).join(".")}`)})` : `locator(${tpl(".", v)})`;
    case "tagName":
      return literal ? `locator(${str(v)})` : `locator(${v})`;
    case "linkText":
      return `getByRole('link', { name: ${literal ? str(v) : v}, exact: true })`;
    case "partialLinkText":
      return `getByRole('link', { name: ${literal ? str(v) : v} })`;
    case "cssSelector": {
      if (!literal) return `locator(${v})`;
      if (semantic) {
        const s = semanticFromCss(v);
        if (s) return s;
      }
      return `locator(${str(v)})`;
    }
    case "xpath": {
      if (!literal) return `locator(${tpl("xpath=", v)})`;
      if (semantic) {
        const s = semanticFromXpath(v);
        if (s) return s;
      }
      return `locator(${str(`xpath=${v}`)})`;
    }
    default:
      return null;
  }
}

function semanticFromCss(css: string): string | null {
  let m = /^\[data-test-?id\s*=\s*['"]?([^'"\]]+)['"]?\]$/.exec(css);
  if (m) return `getByTestId(${tsLit(m[1])})`;
  m = /^(?:input|textarea)?\[placeholder\s*=\s*['"]([^'"]+)['"]\]$/.exec(css);
  if (m) return `getByPlaceholder(${tsLit(m[1])})`;
  m = /^(?:\w+)?\[aria-label\s*=\s*['"]([^'"]+)['"]\]$/.exec(css);
  if (m) return `getByLabel(${tsLit(m[1])})`;
  return null;
}

function semanticFromXpath(xp: string): string | null {
  const text = String.raw`(?:text\(\)|normalize-space\(\)|normalize-space\(text\(\)\)|\.)\s*=\s*['"]([^'"]+)['"]`;
  let m = new RegExp(`^//(button|a)\\[${text}\\]$`).exec(xp);
  if (m) return `getByRole(${tsLit(m[1] === "a" ? "link" : "button")}, { name: ${tsLit(m[2])} })`;
  m = new RegExp(`^//(?:\\*|\\w+)\\[${text}\\]$`).exec(xp);
  if (m) return `getByText(${tsLit(m[1])}, { exact: true })`;
  m = /^\/\/(?:\*|\w+)\[contains\((?:text\(\)|\.)\s*,\s*['"]([^'"]+)['"]\)\]$/.exec(xp);
  if (m) return `getByText(${tsLit(m[1])})`;
  m = /^\/\/(?:input|textarea)\[@placeholder\s*=\s*['"]([^'"]+)['"]\]$/.exec(xp);
  if (m) return `getByPlaceholder(${tsLit(m[1])})`;
  return null;
}

/** "By.id(\"x\")" (whole expression) → [how, arg] or null. */
function parseBy(expr: string): [string, string] | null {
  const m = /^By\.(\w+)\(/.exec(expr.trim());
  if (!m) return null;
  const e = expr.trim();
  const close = findClose(e, m[0].length - 1);
  if (close !== e.length - 1) return null;
  return [m[1], e.slice(m[0].length, close)];
}

/** A locator expression for a Java `By` argument (By.x(...) or a known By/locator variable). */
function locatorFor(receiver: string, byArg: string, ctx: RuleContext): string | null {
  const by = parseBy(byArg);
  if (by) {
    const call = byToPlaywright(by[0], by[1], ctx.semantic);
    return call ? `${receiver}.${call}` : null;
  }
  const name = byArg.trim();
  if (/^[\w$]+$/.test(name)) {
    if (ctx.locators.has(`this.${name}`)) return `this.${name}`;
    if (ctx.locators.has(name)) return name;
  }
  if (/^this\.[\w$]+$/.test(name) && ctx.locators.has(name)) return name;
  return null;
}

// ---------------------------------------------------------------- expressions

const KEYS: Record<string, string> = {
  ENTER: "Enter",
  RETURN: "Enter",
  TAB: "Tab",
  ESCAPE: "Escape",
  BACK_SPACE: "Backspace",
  DELETE: "Delete",
  SPACE: "Space",
  ARROW_DOWN: "ArrowDown",
  ARROW_UP: "ArrowUp",
  ARROW_LEFT: "ArrowLeft",
  ARROW_RIGHT: "ArrowRight",
  DOWN: "ArrowDown",
  UP: "ArrowUp",
  LEFT: "ArrowLeft",
  RIGHT: "ArrowRight",
  HOME: "Home",
  END: "End",
  PAGE_DOWN: "PageDown",
  PAGE_UP: "PageUp",
  CONTROL: "Control",
  SHIFT: "Shift",
  ALT: "Alt",
  COMMAND: "Meta",
  META: "Meta",
  F5: "F5",
};

function keyName(arg: string): string | null {
  const m = /^Keys\.(\w+)$/.exec(arg.trim());
  return m ? (KEYS[m[1]] ?? m[1]) : null;
}

/** Root identifier of a chain: "this.x.y()" → "this.x"; "page.locator()" → "page"; "el.click" → "el". */
function chainRoot(chain: string) {
  const m = /^(this\.[\w$]+|[\w$]+)/.exec(chain.trim());
  return m ? m[1] : "";
}

export function isLocatorChain(chain: string, ctx: RuleContext) {
  const c = chain.trim();
  const root = chainRoot(c);
  if (ctx.locators.has(root)) return true;
  return /^(this\.)?page\.(locator|getBy\w+|frameLocator)\(/.test(c);
}

/** Expression-level rewrites (Selenium API → Playwright, Java → TS idioms). */
export function convertExpression(input: string, ctx: RuleContext): string {
  let s = input;
  const page = ctx.page;

  // Casts and Java keywords
  s = s.replace(/\(\s*(?:String|int|long|double|float|Integer|Long|Double|WebElement|JavascriptExecutor|TakesScreenshot)\s*\)\s*/g, "");

  // findElement(s)
  for (const method of ["findElements", "findElement"]) {
    const hits = codeIndexes(s, new RegExp(`\\.${method}\\(`)).reverse();
    for (const { index } of hits) {
      const start = chainStart(s, index);
      const receiver = s.slice(start, index);
      const open = index + method.length + 1;
      const close = findClose(s, open);
      if (close === -1) continue;
      const arg = s.slice(open + 1, close);
      const recv = /^(this\.)?driver$/.test(receiver) ? page : receiver;
      const loc = locatorFor(recv, arg, ctx);
      if (!loc) continue;
      s = s.slice(0, start) + loc + s.slice(close + 1);
    }
  }

  // Remaining By.x(...) → page-level locators
  s = replaceCalls(s, /\bBy\.(id|name|className|tagName|linkText|partialLinkText|cssSelector|xpath)/, (m, _args, raw) => {
    const call = byToPlaywright(m[1], raw, ctx.semantic);
    return call ? `${page}.${call}` : null;
  });

  // new Select(el).x(...) → el.x(...)
  s = replaceCalls(s, /\bnew\s+Select/, (_m, args) => (args.length === 1 ? `(${args[0]})` : null)).replace(
    /\((this\.[\w$]+|[\w$]+)\)\.(selectBy|deselect|getOptions|getFirstSelectedOption)/g,
    "$1.$2",
  );

  // Element methods
  s = replaceCalls(s, /\.sendKeys/, (_m, args) => {
    if (args.length === 1) {
      const key = keyName(args[0]);
      if (key) return `.press(${tsLit(key)})`;
      const chord = /^Keys\.chord\((.*)\)$/.exec(args[0].trim());
      if (chord) {
        const parts = splitArgs(chord[1]).map((a) => keyName(a) ?? (isJavaString(a) ? decodeJavaString(a) : a));
        return `.press(${tsLit(parts.join("+"))})`;
      }
      return `.fill(${args[0]})`;
    }
    return null;
  });
  s = s
    .replace(/\.getText\(\)/g, ".innerText()")
    .replace(/\.getAttribute\(\s*"value"\s*\)/g, ".inputValue()")
    .replace(/\.isDisplayed\(\)/g, ".isVisible()")
    .replace(/\.isSelected\(\)/g, ".isChecked()")
    .replace(/\.getTagName\(\)/g, ".evaluate((el) => el.tagName.toLowerCase())")
    .replace(/\.getFirstSelectedOption\(\)/g, ".locator('option:checked')")
    .replace(/\.getOptions\(\)/g, ".locator('option')")
    .replace(/\.deselectAll\(\)/g, ".selectOption([])");
  s = replaceCalls(s, /\.selectByVisibleText/, (_m, a) => (a.length === 1 ? `.selectOption({ label: ${a[0]} })` : null));
  s = replaceCalls(s, /\.selectByValue/, (_m, a) => (a.length === 1 ? `.selectOption(${a[0]})` : null));
  s = replaceCalls(s, /\.selectByIndex/, (_m, a) => (a.length === 1 ? `.selectOption({ index: ${a[0]} })` : null));
  s = replaceCalls(s, /\.getCssValue/, (_m, a) =>
    a.length === 1 ? `.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), ${a[0]})` : null,
  );
  s = s.replace(/\.submit\(\)/g, () => {
    ctx.note("warning", "`.submit()` converted to pressing Enter — check the form submits the same way.");
    return ".press('Enter')";
  });

  // Driver / navigation
  const drv = String.raw`(?:this\.)?driver`;
  s = replaceCalls(s, new RegExp(`\\b${drv}\\.get`), (_m, a) => (a.length === 1 ? `${page}.goto(${a[0]})` : null));
  s = replaceCalls(s, new RegExp(`\\b${drv}\\.navigate\\(\\)\\.to`), (_m, a) => (a.length === 1 ? `${page}.goto(${a[0]})` : null));
  s = s
    .replace(new RegExp(`\\b${drv}\\.navigate\\(\\)\\.back\\(\\)`, "g"), `${page}.goBack()`)
    .replace(new RegExp(`\\b${drv}\\.navigate\\(\\)\\.forward\\(\\)`, "g"), `${page}.goForward()`)
    .replace(new RegExp(`\\b${drv}\\.navigate\\(\\)\\.refresh\\(\\)`, "g"), `${page}.reload()`)
    .replace(new RegExp(`\\b${drv}\\.getTitle\\(\\)`, "g"), `${page}.title()`)
    .replace(new RegExp(`\\b${drv}\\.getCurrentUrl\\(\\)`, "g"), `${page}.url()`)
    .replace(new RegExp(`\\b${drv}\\.getPageSource\\(\\)`, "g"), `${page}.content()`)
    .replace(new RegExp(`\\b${drv}\\.manage\\(\\)\\.deleteAllCookies\\(\\)`, "g"), `${page}.context().clearCookies()`);

  // Page objects: new X(driver) / PageFactory.initElements(driver, X.class)
  s = s.replace(/\bPageFactory\.initElements\(\s*(?:this\.)?driver\s*,\s*(\w+)\.class\s*\)/g, `new $1(${page})`);
  s = s.replace(/\bnew\s+(\w+)\(\s*(?:this\.)?driver\s*\)/g, `new $1(${page})`);

  // Java → TS idioms
  s = s.replace(/\bSystem\.out\.println\(/g, "console.log(").replace(/\bSystem\.err\.println\(/g, "console.error(");
  s = s.replace(/\bInteger\.parseInt\(/g, "Number(").replace(/\bDouble\.parseDouble\(/g, "Number(").replace(/\bString\.valueOf\(/g, "String(");
  s = s.replace(/\bnew\s+(?:ArrayList|LinkedList)<[^>]*>\(\)/g, "[]").replace(/\bnew\s+HashMap<[^>]*>\(\)/g, "new Map()");
  s = s.replace(/\.length\(\)/g, ".length").replace(/\.contains\(/g, ".includes(");
  s = replaceCalls(s, /\bString\.format/, (_m, args) => {
    if (!args.length || !isJavaString(args[0])) return null;
    let i = 1;
    const body = decodeJavaString(args[0]).replace(/%[sdf]/g, () => `\${${args[i++] ?? ""}}`).replace(/`/g, "\\`");
    return `\`${body}\``;
  });
  // a.equals(b) → a === b ; a.equalsIgnoreCase(b)
  for (const [method, fmt] of [
    ["equalsIgnoreCase", (a: string, b: string) => `${a}.toLowerCase() === ${b}.toLowerCase()`],
    ["equals", (a: string, b: string) => `${a} === ${b}`],
  ] as const) {
    const hits = codeIndexes(s, new RegExp(`\\.${method}\\(`)).reverse();
    for (const { index } of hits) {
      const start = chainStart(s, index);
      const open = index + method.length + 1;
      const close = findClose(s, open);
      if (close === -1 || start === index) continue;
      s = s.slice(0, start) + fmt(s.slice(start, index), s.slice(open + 1, close)) + s.slice(close + 1);
    }
  }
  s = s.replace(/(\w+(?:\.\w+)*)\.isEmpty\(\)/g, "$1.length === 0");

  // size()/get(i): locators → count()/nth(i); Java lists → length/[i]
  for (const { index } of codeIndexes(s, /\.size\(\)/).reverse()) {
    const start = chainStart(s, index);
    const chain = s.slice(start, index);
    s = s.slice(0, index) + (isLocatorChain(chain, ctx) ? ".count()" : ".length") + s.slice(index + 7);
  }
  for (const { index } of codeIndexes(s, /\.get\(/).reverse()) {
    const start = chainStart(s, index);
    const chain = s.slice(start, index);
    const close = findClose(s, index + 4);
    if (close === -1) continue;
    const arg = s.slice(index + 5, close);
    s = s.slice(0, index) + (isLocatorChain(chain, ctx) ? `.nth(${arg})` : `[${arg}]`) + s.slice(close + 1);
  }
  s = replaceCalls(s, /\.add/, (_m, a) => (a.length === 1 ? `.push(${a[0]})` : null));

  // Any other bare driver reference → page
  s = s.replace(/\b(?:this\.)?driver\b(?!\s*=)/g, page);
  return s;
}

// ---------------------------------------------------------------- awaits

/** Playwright methods that return promises. */
export const ASYNC_METHODS = new Set([
  "click",
  "dblclick",
  "fill",
  "press",
  "pressSequentially",
  "type",
  "clear",
  "check",
  "uncheck",
  "hover",
  "focus",
  "blur",
  "tap",
  "dragTo",
  "selectOption",
  "setInputFiles",
  "textContent",
  "innerText",
  "innerHTML",
  "inputValue",
  "getAttribute",
  "isVisible",
  "isHidden",
  "isEnabled",
  "isDisabled",
  "isChecked",
  "isEditable",
  "count",
  "all",
  "allTextContents",
  "allInnerTexts",
  "waitFor",
  "evaluate",
  "screenshot",
  "scrollIntoViewIfNeeded",
  "goto",
  "goBack",
  "goForward",
  "reload",
  "title",
  "content",
  "waitForTimeout",
  "waitForURL",
  "waitForLoadState",
  "clearCookies",
  "newPage",
  "close",
  "setViewportSize",
]);

const WEB_FIRST = /\.(not\.)?(toBeVisible|toBeHidden|toBeEnabled|toBeDisabled|toBeChecked|toBeAttached|toBeEditable|toBeFocused|toBeEmpty|toHaveText|toContainText|toHaveValue|toHaveAttribute|toHaveCount|toHaveClass|toHaveTitle|toHaveURL|toHaveCSS)\(/;

/** Inserts `await` before async Playwright calls on page/locator chains. */
export function insertAwaits(input: string, ctx: RuleContext): string {
  let s = input;
  const hits = codeIndexes(s, /\.([A-Za-z]+)\(/);
  for (const { index, match } of hits.reverse()) {
    const start = chainStart(s, index);
    const chain = s.slice(start, index);
    const root = chainRoot(chain);
    const poCall = (ctx.poVars.has(root) && chain === root) || (chain === "this" && ctx.ownMethods.has(match[1]));
    if (!poCall) {
      if (!ASYNC_METHODS.has(match[1])) continue;
      const pageLike = root === "page" || root === "this.page" || root === "context" || chain.startsWith("this.page");
      if (!pageLike && !ctx.locators.has(root)) continue;
    }
    if (/\bawait\s*$/.test(s.slice(0, start))) continue;
    const close = findClose(s, index + match[1].length + 1);
    const after = close === -1 ? "" : s[close + 1] ?? "";
    if (after === "." || after === "[") {
      s = `${s.slice(0, start)}(await ${s.slice(start, close + 1)})${s.slice(close + 1)}`;
    } else {
      s = `${s.slice(0, start)}await ${s.slice(start)}`;
    }
  }
  // Web-first assertions
  if (/^\s*expect(\.soft)?\(/.test(s) && WEB_FIRST.test(s) && !/^\s*await\b/.test(s)) s = s.replace(/^(\s*)/, "$1await ");
  return s;
}

// ---------------------------------------------------------------- assertions

type AssertParts = { kind: string; actual: string; expected?: string; message?: string };

/** Splits assert args by framework argument order. */
function assertParts(kind: string, args: string[], fw: RuleContext["framework"]): AssertParts | null {
  const two = ["assertEquals", "assertNotEquals", "assertSame", "assertNotSame"].includes(kind);
  if (two) {
    if (args.length < 2) return null;
    if (fw === "testng") return { kind, actual: args[0], expected: args[1], message: args[2] };
    if (fw === "junit4") {
      return args.length >= 3
        ? { kind, message: args[0], expected: args[1], actual: args[2] }
        : { kind, expected: args[0], actual: args[1] };
    }
    return { kind, expected: args[0], actual: args[1], message: args[2] };
  }
  if (!args.length) return null;
  if (fw === "junit4" && args.length >= 2) return { kind, message: args[0], actual: args[1] };
  return { kind, actual: args[0], message: args[1] };
}

const unwrap = (s: string) => {
  const t = s.trim();
  if (t.startsWith("(") && findClose(t, 0) === t.length - 1) return unwrap(t.slice(1, -1));
  return t.replace(/^await\s+/, "");
};

/** Splits "chain.method(args)" into [chain, method, args] when it ends with a call. */
function splitTailCall(expr: string): [string, string, string] | null {
  const e = unwrap(expr);
  if (!e.endsWith(")")) return null;
  let depth = 0;
  let open = -1;
  for (let i = e.length - 1; i >= 0; i--) {
    if (e[i] === ")") depth++;
    else if (e[i] === "(") {
      depth--;
      if (depth === 0) {
        open = i;
        break;
      }
    }
  }
  if (open <= 0) return null;
  const m = /\.([A-Za-z]+)$/.exec(e.slice(0, open));
  if (!m) return null;
  return [e.slice(0, open - m[0].length), m[1], e.slice(open + 1, -1)];
}

/** Assert.assertX(...) / assertX(...) / soft.assertX(...) → expect(...). Returns null if not an assertion. */
export function convertAssertion(stmt: string, ctx: RuleContext): string | null {
  const m = /^(?:(?:Assert|Assertions)\.|([\w$]+)\.)?(assert(?:Equals|NotEquals|True|False|Null|NotNull|Same|NotSame))\(/.exec(stmt.trim());
  if (!m) return null;
  const soft = !!m[1] && ctx.softVars.has(m[1]);
  if (m[1] && !soft) return null;
  const body = stmt.trim();
  const open = m[0].length - 1;
  const close = findClose(body, open);
  if (close === -1) return null;
  const parts = assertParts(m[2], splitArgs(body.slice(open + 1, close)), ctx.framework);
  if (!parts) return null;
  const ex = soft ? "expect.soft" : "expect";
  const withMsg = (v: string) => (parts.message ? `${ex}(${v}, ${parts.message})` : `${ex}(${v})`);
  const tail = splitTailCall(parts.actual);
  const pageRef = ctx.page;

  switch (parts.kind) {
    case "assertEquals":
    case "assertSame": {
      const exp = parts.expected!;
      if (tail) {
        const [chain, method, args] = tail;
        if (isLocatorChain(chain, ctx)) {
          if (method === "textContent" || method === "innerText") return `${withMsg(chain)}.toHaveText(${exp});`;
          if (method === "inputValue") return `${withMsg(chain)}.toHaveValue(${exp});`;
          if (method === "getAttribute") return `${withMsg(chain)}.toHaveAttribute(${args}, ${exp});`;
          if (method === "count") return `${withMsg(chain)}.toHaveCount(${exp});`;
        }
        if (chain === pageRef && method === "title") return `${withMsg(pageRef)}.toHaveTitle(${exp});`;
        if (chain === pageRef && method === "url") return `${withMsg(pageRef)}.toHaveURL(${exp});`;
      }
      return `${withMsg(parts.actual)}.toBe(${exp});`;
    }
    case "assertNotEquals":
    case "assertNotSame":
      return `${withMsg(parts.actual)}.not.toBe(${parts.expected});`;
    case "assertTrue":
    case "assertFalse": {
      const positive = parts.kind === "assertTrue";
      if (tail) {
        const [chain, method, args] = tail;
        if (isLocatorChain(chain, ctx)) {
          if (method === "isVisible") return `${withMsg(chain)}.${positive ? "toBeVisible" : "toBeHidden"}();`;
          if (method === "isEnabled") return `${withMsg(chain)}.${positive ? "toBeEnabled" : "toBeDisabled"}();`;
          if (method === "isChecked") return `${withMsg(chain)}.${positive ? "" : "not."}toBeChecked();`;
        }
        if (method === "includes") {
          const inner = splitTailCall(chain);
          if (inner && isLocatorChain(inner[0], ctx) && (inner[1] === "textContent" || inner[1] === "innerText")) {
            return `${withMsg(inner[0])}.${positive ? "" : "not."}toContainText(${args});`;
          }
          return `${withMsg(chain)}.${positive ? "" : "not."}toContain(${args});`;
        }
      }
      return `${withMsg(parts.actual)}.${positive ? "toBeTruthy" : "toBeFalsy"}();`;
    }
    case "assertNull":
      return `${withMsg(parts.actual)}.toBeNull();`;
    case "assertNotNull":
      return `${withMsg(parts.actual)}.not.toBeNull();`;
  }
  return null;
}

// ---------------------------------------------------------------- statements

export type StatementResult = {
  /** Output lines (TS); empty = removed. */
  lines: string[];
  /** Set when the statement couldn't be converted. */
  todo?: boolean;
  /** The rule doesn't apply after all (e.g. receiver isn't an Actions object) — try the next one. */
  skip?: boolean;
};

type StatementRule = {
  id: string;
  description: string;
  pattern: RegExp;
  confidence: Confidence;
  convert: (stmt: string, m: RegExpExecArray, ctx: RuleContext) => StatementResult;
};

const removed = (ctx: RuleContext, kind: string, severity: Severity, message: string): StatementResult => {
  ctx.removed(kind);
  ctx.note(severity, message, kind);
  return { lines: [] };
};

const DRIVER_SETUP =
  /^(?:WebDriverManager\.|System\.setProperty\(\s*"webdriver|(?:(?:public|private|protected|static|final)\s+)*(?:WebDriver\s+)?(?:this\.)?driver\s*=\s*new\s+\w+|(?:ChromeOptions|FirefoxOptions|EdgeOptions|SafariOptions|DesiredCapabilities)\s+\w+\s*=|\w*[oO]ptions\.(?:addArguments|setHeadless|setCapability|addExtensions|setExperimentalOption|setBinary)|caps\.setCapability|(?:this\.)?driver\.manage\(\)\.(?:window|timeouts)\(\)|(?:this\.)?driver\.(?:quit|close)\(\)|if\s*\(\s*(?:this\.)?driver\s*!=\s*null\s*\))/;

/** ExpectedConditions.<cond>(args) → a Playwright statement (or null to just drop the wait). */
function waitCondition(cond: string, args: string[], ctx: RuleContext): { line: string | null; locator?: string } | undefined {
  const loc = (a: string) => locatorFor(ctx.page, a, ctx) ?? (convertExpression(a, ctx) || null);
  switch (cond) {
    case "visibilityOfElementLocated":
    case "visibilityOf": {
      const l = loc(args[0]);
      return l ? { line: `await expect(${l}).toBeVisible();`, locator: l } : undefined;
    }
    case "invisibilityOfElementLocated":
    case "invisibilityOf": {
      const l = loc(args[0]);
      return l ? { line: `await expect(${l}).toBeHidden();`, locator: l } : undefined;
    }
    case "presenceOfElementLocated": {
      const l = loc(args[0]);
      return l ? { line: `await expect(${l}).toBeAttached();`, locator: l } : undefined;
    }
    case "elementToBeClickable": {
      const l = loc(args[0]);
      ctx.note("warning", "`elementToBeClickable` wait removed — Playwright actions wait for elements to be actionable.");
      return l ? { line: null, locator: l } : { line: null };
    }
    case "textToBePresentInElementLocated":
    case "textToBePresentInElement": {
      const l = loc(args[0]);
      return l ? { line: `await expect(${l}).toContainText(${argToTs(args[1] ?? "''")});`, locator: l } : undefined;
    }
    case "titleIs":
      return { line: `await expect(${ctx.page}).toHaveTitle(${argToTs(args[0])});` };
    case "titleContains":
      return { line: `await expect(${ctx.page}).toHaveTitle(${regexFrom(args[0])});` };
    case "urlToBe":
      return { line: `await expect(${ctx.page}).toHaveURL(${argToTs(args[0])});` };
    case "urlContains":
      return { line: `await expect(${ctx.page}).toHaveURL(${regexFrom(args[0])});` };
    case "alertIsPresent":
      ctx.note("attention", "`alertIsPresent` wait: register `page.once('dialog', …)` before the action that opens the dialog.");
      return { line: null };
    default:
      return undefined;
  }
}

/** A /regex/ for a literal (escaped), or new RegExp(expr) for a variable. */
function regexFrom(arg: string) {
  if (!isJavaString(arg)) return `new RegExp(${arg.trim()})`;
  const v = decodeJavaString(arg.trim()).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return `/${v}/`;
}

export const STATEMENT_RULES: StatementRule[] = [
  {
    id: "driver-setup",
    description: "Driver setup/teardown, options, window size and timeouts",
    pattern: DRIVER_SETUP,
    confidence: "high",
    convert: (_s, _m, ctx) =>
      removed(ctx, "driver setup", "info", "Driver setup/teardown removed — Playwright fixtures handle it. Configure browsers, viewport and timeouts in `playwright.config.ts`."),
  },
  {
    id: "sleep",
    description: "Thread.sleep(n)",
    pattern: /^Thread\.sleep\(\s*([^)]+)\)\s*;?$/,
    confidence: "high",
    convert: (_s, m, ctx) => {
      if (ctx.keepSleeps) {
        ctx.note("warning", "`Thread.sleep` kept as `page.waitForTimeout` — prefer auto-waiting or `expect`.");
        return { lines: [`await ${ctx.page}.waitForTimeout(${m[1].trim()});`] };
      }
      ctx.removed("sleeps");
      ctx.note("warning", `\`Thread.sleep(${m[1].trim()})\` removed — Playwright waits automatically; use \`expect\` for specific conditions.`);
      return { lines: [] };
    },
  },
  {
    id: "wait-object",
    description: "new WebDriverWait / FluentWait",
    pattern: /^(?:(?:private|public|protected|final)\s+)*(?:WebDriverWait|FluentWait<\w+>|Wait<\w+>)\s+(\w+)\s*=/,
    confidence: "high",
    convert: (_s, m, ctx) => {
      ctx.waitVars.add(m[1]);
      return removed(ctx, "explicit waits", "info", "Explicit wait objects removed — Playwright actions and `expect` assertions auto-wait.");
    },
  },
  {
    id: "actions-object",
    description: "new Actions(driver)",
    pattern: /^(?:final\s+)?Actions\s+(\w+)\s*=\s*new\s+Actions\(/,
    confidence: "high",
    convert: (_s, m, ctx) => {
      ctx.actionsVars.add(m[1]);
      ctx.removed("actions setup");
      return { lines: [] };
    },
  },
  {
    id: "js-executor",
    description: "JavascriptExecutor js = (JavascriptExecutor) driver",
    pattern: /^(?:final\s+)?JavascriptExecutor\s+(\w+)\s*=/,
    confidence: "high",
    convert: (_s, m, ctx) => {
      ctx.jsVars.add(m[1]);
      ctx.removed("JS executor setup");
      return { lines: [] };
    },
  },
  {
    id: "soft-assert",
    description: "SoftAssert sa = new SoftAssert() / sa.assertAll()",
    pattern: /^(?:(?:final\s+)?SoftAssert\s+(\w+)\s*=\s*new\s+SoftAssert\(\)|(\w+)\.assertAll\(\))\s*;?$/,
    confidence: "high",
    convert: (_s, m, ctx) => {
      if (m[1]) ctx.softVars.add(m[1]);
      ctx.note("info", "SoftAssert converted to `expect.soft` — failures are reported at the end of the test.", "soft");
      return { lines: [] };
    },
  },
  {
    id: "page-factory",
    description: "PageFactory.initElements(driver, this) / this.driver = driver",
    pattern: /^(?:PageFactory\.initElements\(\s*(?:this\.)?driver\s*,\s*this\s*\)|this\.driver\s*=\s*driver|super\(\s*driver\s*\))\s*;?$/,
    confidence: "high",
    convert: () => ({ lines: [] }),
  },
  {
    id: "wait-until",
    description: "wait.until(ExpectedConditions.x(...))",
    pattern: /^(?:(?:final\s+)?(?:WebElement|var)\s+(\w+)\s*=\s*)?(?:(\w+)|new\s+WebDriverWait\(.*?\))\.until\(\s*ExpectedConditions\.(\w+)\((.*)\)\s*\)\s*;?$/,
    confidence: "medium",
    convert: (_s, m, ctx) => {
      const r = waitCondition(m[3], splitArgs(m[4]), ctx);
      if (r === undefined) return { lines: [], todo: true };
      const lines: string[] = [];
      if (m[1] && r.locator) {
        ctx.locators.add(m[1]);
        lines.push(`const ${m[1]} = ${r.locator};`);
        if (r.line) lines.push(r.line.replace(r.locator, m[1]));
      } else if (r.line) lines.push(r.line);
      return { lines };
    },
  },
  {
    id: "alert",
    description: "driver.switchTo().alert().accept() / dismiss() / sendKeys()",
    pattern: /^(?:(?:\w+\s+)?\w+\s*=\s*)?(?:this\.)?driver\.switchTo\(\)\.alert\(\)\.(accept|dismiss|sendKeys|getText)\((.*)\)\s*;?$/,
    confidence: "low",
    convert: (_s, m, ctx) => {
      ctx.note("attention", "Alert handling must be registered before the action that opens the dialog — move this line above that click.");
      if (m[1] === "accept") return { lines: [`${ctx.page}.once('dialog', (dialog) => dialog.accept());`] };
      if (m[1] === "dismiss") return { lines: [`${ctx.page}.once('dialog', (dialog) => dialog.dismiss());`] };
      if (m[1] === "sendKeys") return { lines: [`${ctx.page}.once('dialog', (dialog) => dialog.accept(${argToTs(m[2])}));`] };
      return { lines: [`// The dialog text is available as dialog.message() inside the page.once('dialog', …) handler.`] };
    },
  },
  {
    id: "frame",
    description: "driver.switchTo().frame(...) / defaultContent()",
    pattern: /^(?:this\.)?driver\.switchTo\(\)\.(frame|defaultContent|parentFrame)\((.*)\)\s*;?$/,
    confidence: "low",
    convert: (_s, m, ctx) => {
      if (m[1] !== "frame") {
        ctx.removed("frame switches");
        ctx.note("info", "Frame switching back removed — locate elements on `page` again after a frame.", "frame-back");
        return { lines: [] };
      }
      ctx.note("warning", "Frame switch converted to `frameLocator` — use `frame.locator(…)` for elements inside the frame.");
      const arg = m[2].trim();
      let sel: string;
      if (isJavaString(arg)) {
        const v = decodeJavaString(arg);
        sel = tsLit(`iframe[name="${v}"], iframe#${v}`);
      } else if (/^\d+$/.test(arg)) sel = tsLit(`iframe >> nth=${arg}`);
      else {
        const loc = locatorFor(ctx.page, arg, ctx) ?? convertExpression(arg, ctx);
        return { lines: [`const frame = ${loc}.contentFrame();`] };
      }
      return { lines: [`const frame = ${ctx.page}.frameLocator(${sel});`] };
    },
  },
  {
    id: "windows",
    description: "Window/tab handles",
    pattern: /(?:getWindowHandles?\(\)|switchTo\(\)\.(?:window|newWindow)\()/,
    confidence: "low",
    convert: (_s, _m, ctx) => {
      ctx.note("attention", "Window/tab handling needs a rewrite: `const popup = await context.waitForEvent('page')` (or `page.waitForEvent('popup')`) around the click that opens it.");
      return { lines: [], todo: true };
    },
  },
  {
    id: "execute-script",
    description: "JavascriptExecutor.executeScript(...)",
    pattern: /^(?:(?:\w+\s+)?(\w+)\s*=\s*)?(?:\(\s*\(\s*JavascriptExecutor\s*\)\s*(?:this\.)?driver\s*\)|(\w+))\.executeScript\((.*)\)\s*;?$/,
    confidence: "low",
    convert: (_s, m, ctx) => {
      if (m[2] && !ctx.jsVars.has(m[2])) return { lines: [], skip: true };
      const args = splitArgs(m[3]);
      const script = isJavaString(args[0] ?? "") ? decodeJavaString(args[0]).trim() : null;
      ctx.note("attention", "`executeScript` converted to `page.evaluate` — check the script and its arguments.");
      if (script === null) return { lines: [], todo: true };
      const rest = args.slice(1).map((a) => convertExpression(a, ctx));
      const assign = m[1] ? `const ${m[1]} = ` : "";
      // Single element argument: run the script on that element.
      if (rest.length === 1 && /arguments\[0\]/.test(script) && isLocatorChain(rest[0], ctx)) {
        const body = script.replace(/arguments\[0\]/g, "el").replace(/^return\s+/, "").replace(/;$/, "");
        return { lines: [`${assign}await ${rest[0]}.evaluate((el) => ${body});`] };
      }
      const body = script.replace(/;$/, "");
      if (!rest.length) return { lines: [`${assign}await ${ctx.page}.evaluate(() => { ${body}; });`] };
      return {
        lines: [`${assign}await ${ctx.page}.evaluate((args) => { ${body.replace(/arguments\[/g, "args[")}; }, [${rest.join(", ")}]);`],
      };
    },
  },
  {
    id: "screenshot",
    description: "TakesScreenshot / FileUtils.copyFile",
    pattern: /(?:getScreenshotAs\(|FileUtils\.copyFile\()/,
    confidence: "medium",
    convert: (s, _m, ctx) => {
      if (/FileUtils\.copyFile/.test(s)) {
        const path = /new\s+File\(\s*("(?:[^"\\]|\\.)*")\s*\)/.exec(s);
        ctx.removed("screenshot file copy");
        return path ? { lines: [`// screenshot saved to ${decodeJavaString(path[1])} — set this path in page.screenshot({ path })`] } : { lines: [] };
      }
      ctx.note("info", "Screenshot converted to `page.screenshot` — set the path you want.", "screenshot");
      return { lines: [`await ${ctx.page}.screenshot({ path: 'screenshot.png' });`] };
    },
  },
  {
    id: "actions-chain",
    description: "Actions hover / double-click / right-click / drag",
    pattern: /^(?:(\w+)|new\s+Actions\(\s*(?:this\.)?driver\s*\))\.(moveToElement|doubleClick|contextClick|dragAndDrop|click|sendKeys|keyDown|keyUp|clickAndHold|release|scrollToElement)\(/,
    confidence: "medium",
    convert: (s, m, ctx) => {
      if (m[1] && !ctx.actionsVars.has(m[1])) return { lines: [], skip: true };
      const lines: string[] = [];
      let rest = s.trim().replace(/;$/, "");
      if (m[1]) rest = rest.slice(m[1].length);
      else {
        const close = findClose(rest, rest.indexOf("("));
        rest = rest.slice(close + 1);
      }
      let current: string | null = null;
      const el = (a: string) => locatorFor(ctx.page, a, ctx) ?? convertExpression(a, ctx);
      // Walk the top-level chain only: .a(…).b(…).perform()
      const calls: { name: string; args: string[] }[] = [];
      for (let p = 0; p < rest.length; ) {
        const mm = /^\s*\.(\w+)\(/.exec(rest.slice(p));
        if (!mm) break;
        const open = p + mm[0].length - 1;
        const close = findClose(rest, open);
        if (close === -1) break;
        calls.push({ name: mm[1], args: splitArgs(rest.slice(open + 1, close)).filter(Boolean) });
        p = close + 1;
      }
      for (const { name: callName, args } of calls) {
        switch (callName) {
          case "moveToElement":
          case "scrollToElement":
            current = el(args[0]);
            lines.push(`await ${current}.${callName === "moveToElement" ? "hover" : "scrollIntoViewIfNeeded"}();`);
            break;
          case "click":
            if (args[0]) current = el(args[0]);
            lines.push(current ? `await ${current}.click();` : `await ${ctx.page}.mouse.down(); await ${ctx.page}.mouse.up();`);
            break;
          case "doubleClick":
            if (args[0]) current = el(args[0]);
            lines.push(`await ${current}.dblclick();`);
            break;
          case "contextClick":
            if (args[0]) current = el(args[0]);
            lines.push(`await ${current}.click({ button: 'right' });`);
            break;
          case "dragAndDrop":
            lines.push(`await ${el(args[0])}.dragTo(${el(args[1])});`);
            break;
          case "sendKeys": {
            const k = keyName(args[args.length - 1] ?? "");
            lines.push(k ? `await ${ctx.page}.keyboard.press(${tsLit(k)});` : `await ${ctx.page}.keyboard.type(${argToTs(args[0] ?? "''")});`);
            break;
          }
          case "keyDown":
          case "keyUp":
            lines.push(`await ${ctx.page}.keyboard.${callName === "keyDown" ? "down" : "up"}(${tsLit(keyName(args[0] ?? "") ?? "Shift")});`);
            break;
          case "clickAndHold":
          case "release":
            ctx.note("warning", "clickAndHold/release converted to mouse down/up — check the target position.");
            if (args[0]) lines.push(`await ${el(args[0])}.hover();`);
            lines.push(`await ${ctx.page}.mouse.${callName === "clickAndHold" ? "down" : "up"}();`);
            break;
          case "perform":
          case "build":
          case "pause":
            break;
          default:
            return { lines: [], todo: true };
        }
      }
      return { lines };
    },
  },
];

/** Final Java → TS cleanup on a converted statement: strings, declarations, loops. */
export function finishStatement(stmt: string, ctx: RuleContext, reassigned: Set<string>): string {
  let s = stmt;
  // for-each over locators / lists
  s = s.replace(/^for\s*\(\s*(?:final\s+)?WebElement\s+(\w+)\s*:\s*(.+?)\s*\)\s*\{$/, (_m, v: string, list: string) => {
    ctx.locators.add(v);
    return `for (const ${v} of await ${list}.all()) {`;
  });
  s = s.replace(/^for\s*\(\s*(?:final\s+)?[\w<>[\]]+\s+(\w+)\s*:\s*(.+?)\s*\)\s*\{$/, "for (const $1 of $2) {");
  s = s.replace(/^for\s*\(\s*(?:int|long)\s+/, "for (let ");
  s = s.replace(/^\}\s*catch\s*\(\s*(?:final\s+)?[\w.|\s]+\s+(\w+)\s*\)\s*\{$/, "} catch ($1) {");
  s = s.replace(/\bthrow\s+new\s+\w*(?:Exception|Error)\(/g, "throw new Error(");
  // declarations: Type name = value;
  const decl = /^(?:final\s+)?((?:WebElement|List<WebElement>|String|int|long|double|float|boolean|char|Integer|Long|Double|Boolean|var|Object|List<[\w<>]+>|Map<[\w<>, ]+>|Select|[A-Z]\w*(?:Page|Component|Section)\w*))(\[\])?\s+(\w+)\s*=\s*(.+);$/.exec(s);
  if (decl) {
    const [, type, , name, value] = decl;
    if (type === "WebElement" || type === "List<WebElement>" || type === "Select" || isLocatorChain(value, ctx)) ctx.locators.add(name);
    const created = /^new\s+(\w+)\(/.exec(value.trim())?.[1];
    if (ctx.pageClasses.has(type) || /Page$/.test(type) || (created && (ctx.pageClasses.has(created) || /Page$/.test(created)))) ctx.poVars.add(name);
    const kw = reassigned.has(name) ? "let" : "const";
    const annot = type.startsWith("List<") && type !== "List<WebElement>" && value.trim() === "[]" ? `: ${tsType(type)}` : "";
    s = `${kw} ${name}${annot} = ${value};`;
  } else {
    // Type name; (declaration without value)
    const bare = /^(?:final\s+)?([\w<>[\]]+)\s+(\w+)\s*;$/.exec(s);
    if (bare && !["return", "throw", "new", "await"].includes(bare[1])) s = `let ${bare[2]}: ${tsType(bare[1])};`;
  }
  return javaStringsToTs(s);
}

/** Java type → TS type. */
export function tsType(java: string): string {
  const t = java.replace(/\s+/g, "");
  if (/^(String|char|Character)$/.test(t)) return "string";
  if (/^(int|long|double|float|short|byte|Integer|Long|Double|Float|Short|Byte|Number)$/.test(t)) return "number";
  if (/^(boolean|Boolean)$/.test(t)) return "boolean";
  if (t === "void") return "void";
  if (t === "WebElement" || t === "List<WebElement>" || t === "By") return "Locator";
  if (t === "Object") return "unknown";
  const list = /^(?:List|ArrayList|Set|Collection)<(.+)>$/.exec(t);
  if (list) return `${tsType(list[1])}[]`;
  if (/\[\]$/.test(t)) return `${tsType(t.slice(0, -2))}[]`;
  if (/^Map<|^HashMap</.test(t)) return "Record<string, unknown>";
  return t;
}

