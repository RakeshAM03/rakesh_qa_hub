import { detectFramework, detectInputType } from "./detect";
import { braceDelta, codeIndexes, decodeJavaString, findClose, isJavaString, javaStringsToTs, methodTitle, parenDelta, replaceCalls, splitArgs, splitStatements, tsLit } from "./java";
import {
  byToPlaywright,
  convertAssertion,
  convertExpression,
  finishStatement,
  insertAwaits,
  STATEMENT_RULES,
  tsType,
  type RuleContext,
} from "./rules";
import { DEFAULT_OPTIONS, type ConvertOptions, type ConvertResult, type OutputFile, type ReviewNote, type Severity } from "./types";

export const MAX_INPUT_BYTES = 50 * 1024;

type SrcLine = { text: string; line: number };
type Annotation = { name: string; args: string; line: number };
type Member =
  | { kind: "field"; annotations: Annotation[]; text: string; line: number }
  | { kind: "method"; annotations: Annotation[]; header: string; line: number; body: SrcLine[] }
  | { kind: "comment"; text: string; line: number }
  | { kind: "other"; text: string; line: number };
type ClassInfo = { name: string; extendsName?: string; line: number; members: Member[] };
type Out = { text: string; src?: number };

// ---------------------------------------------------------------- parsing

/** Leading annotations of a statement: "@Test(groups = \"a\") public void x()" → [[Test], rest]. */
function takeAnnotations(text: string, line: number): [Annotation[], string] {
  const anns: Annotation[] = [];
  let t = text.trim();
  while (t.startsWith("@")) {
    const m = /^@([\w.]+)/.exec(t);
    if (!m) break;
    let args = "";
    let rest = t.slice(m[0].length);
    if (rest.trimStart().startsWith("(")) {
      const open = t.indexOf("(", m[0].length);
      const close = findClose(t, open);
      if (close === -1) break;
      args = t.slice(open + 1, close);
      rest = t.slice(close + 1);
    }
    anns.push({ name: m[1].split(".").pop()!, args, line });
    t = rest.trim();
  }
  return [anns, t];
}

function parseMembers(body: SrcLine[]): Member[] {
  const members: Member[] = [];
  let pending: Annotation[] = [];
  let i = 0;
  while (i < body.length) {
    const { text, line } = body[i];
    const t = text.trim();
    if (!t) {
      i++;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) {
      members.push({ kind: "comment", text: t, line });
      i++;
      continue;
    }
    // Accumulate a whole annotation (it may span lines).
    if (t.startsWith("@")) {
      let combined = t;
      let j = i;
      while (parenDelta(combined) > 0 && j + 1 < body.length) combined += ` ${body[++j].text.trim()}`;
      const [anns, rest] = takeAnnotations(combined, line);
      pending.push(...anns);
      if (!rest) {
        i = j + 1;
        continue;
      }
      // Declaration on the same line as its annotation(s).
      body[j] = { text: rest, line: body[j].line };
      i = j;
      continue;
    }
    // A member: collect until ';' (field) or a balanced { … } block (method / ctor / inner class).
    let j = i;
    let combined = t;
    const startsBlock = () => {
      const brace = combined.indexOf("{");
      const semi = combined.indexOf(";");
      const eq = combined.indexOf("=");
      const paren = combined.indexOf("(");
      if (brace === -1) return false;
      if (semi !== -1 && semi < brace) return false;
      if (eq !== -1 && (paren === -1 || eq < paren) && !/\bclass\b/.test(combined)) return false;
      return true;
    };
    while (!startsBlock() && !(parenDelta(combined) === 0 && /;\s*(\/\/.*)?$/.test(combined)) && j + 1 < body.length) {
      combined += `\n${body[++j].text}`;
    }
    if (!startsBlock()) {
      members.push({ kind: "field", annotations: pending, text: combined.replace(/\s*\n\s*/g, " ").trim(), line });
      pending = [];
      i = j + 1;
      continue;
    }
    // Method / constructor / inner class: find the end of the block.
    const blockLines: SrcLine[] = body.slice(i, j + 1).map((l, k) => (k === 0 ? { text: t, line: l.line } : l));
    let depth = blockLines.reduce((d, l) => d + braceDelta(l.text), 0);
    while (depth > 0 && j + 1 < body.length) {
      j++;
      blockLines.push(body[j]);
      depth += braceDelta(body[j].text);
    }
    const joined = blockLines.map((l) => l.text).join("\n");
    const headerEnd = joined.indexOf("{");
    const header = joined.slice(0, headerEnd).replace(/\s+/g, " ").trim();
    if (/\b(class|interface|enum)\s+\w+/.test(header)) {
      members.push({ kind: "other", text: header, line });
    } else {
      members.push({ kind: "method", annotations: pending, header, line, body: blockBody(blockLines) });
    }
    pending = [];
    i = j + 1;
  }
  return members;
}

/** Lines between a block's opening { and its closing }. */
function blockBody(block: SrcLine[]): SrcLine[] {
  const out: SrcLine[] = [];
  let openSeen = false;
  let depth = 0;
  for (const { text, line } of block) {
    if (!openSeen) {
      const idx = text.indexOf("{");
      if (idx === -1) continue;
      openSeen = true;
      depth = braceDelta(text);
      const after = text.slice(idx + 1);
      if (depth === 0) {
        // single-line block: { … }
        const inner = after.slice(0, after.lastIndexOf("}"));
        if (inner.trim()) out.push({ text: inner, line });
        return out;
      }
      if (after.trim()) out.push({ text: after, line });
      continue;
    }
    const next = depth + braceDelta(text);
    if (next <= 0) {
      const before = text.slice(0, text.lastIndexOf("}"));
      if (before.trim()) out.push({ text: before, line });
      break;
    }
    depth = next;
    out.push({ text, line });
  }
  return out;
}

function parseSource(src: string): { classes: ClassInfo[]; loose: SrcLine[] } {
  const lines = src.replace(/\r\n?/g, "\n").split("\n").map((text, i) => ({ text, line: i + 1 }));
  const classes: ClassInfo[] = [];
  const loose: SrcLine[] = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].text.trim();
    if (/^(package|import)\s/.test(t)) {
      i++;
      continue;
    }
    const m = /^(?:(?:public|private|protected|abstract|final|static)\s+)*class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+([\w.]+)(?:<[^>]*>)?)?/.exec(t);
    if (m) {
      const block: SrcLine[] = [];
      let depth = 0;
      let opened = false;
      let j = i;
      for (; j < lines.length; j++) {
        block.push(lines[j]);
        depth += braceDelta(lines[j].text);
        if (lines[j].text.includes("{")) opened = true;
        if (opened && depth <= 0) break;
      }
      classes.push({ name: m[1], extendsName: m[2], line: lines[i].line, members: parseMembers(blockBody(block)) });
      i = j + 1;
      continue;
    }
    if (t.startsWith("@") && classes.length === 0 && /^@\w+(\(.*\))?$/.test(t) && lines.slice(i + 1).some((l) => /\bclass\s+\w+/.test(l.text))) {
      i++; // class-level annotation (e.g. @Listeners)
      continue;
    }
    loose.push(lines[i]);
    i++;
  }
  return { classes, loose };
}

// ---------------------------------------------------------------- conversion state

class Converter {
  notes: ReviewNote[] = [];
  private noteKeys = new Set<string>();
  removedKinds = new Map<string, number>();
  converted = 0;
  todos = 0;
  currentLine: number | null = null;
  framework: "testng" | "junit5" | "junit4";
  pageClasses = new Set<string>();

  constructor(
    readonly opts: ConvertOptions,
    src: string,
  ) {
    this.framework = opts.framework === "auto" ? detectFramework(src) : opts.framework;
  }

  note(severity: Severity, message: string, key?: string, line: number | null = this.currentLine) {
    if (key) {
      if (this.noteKeys.has(key)) return;
      this.noteKeys.add(key);
      line = key.startsWith("line:") ? line : null;
    }
    this.notes.push({ severity, line, message: line && !key ? `Line ${line}: ${message}` : message });
  }

  ctx(page: RuleContext["page"], locators: Iterable<string> = []): RuleContext {
    return {
      page,
      semantic: this.opts.locatorPreference === "semantic",
      keepSleeps: this.opts.keepSleeps,
      framework: this.framework,
      locators: new Set(locators),
      actionsVars: new Set(),
      jsVars: new Set(),
      waitVars: new Set(),
      softVars: new Set(),
      pageClasses: this.pageClasses,
      poVars: new Set(),
      ownMethods: new Set(),
      note: (sev, msg, key) => this.note(sev, msg, key),
      removed: (kind) => this.removedKinds.set(kind, (this.removedKinds.get(kind) ?? 0) + 1),
    };
  }

  todo(original: string, line: number, indent: string): Out {
    this.todos++;
    const short = original.trim().replace(/\s+/g, " ");
    this.note("attention", `couldn't convert \`${short.length > 70 ? `${short.slice(0, 70)}…` : short}\` automatically — rewrite it by hand.`, undefined, line);
    return { text: `${indent}// TODO(convert): ${short}`, src: line };
  }

  /** Converts a method body (statements, comments, control flow) into indented TS lines. */
  convertBody(body: SrcLine[], ctx: RuleContext, indent: string, qualify?: (s: string) => string): Out[] {
    const out: Out[] = [];
    const statements: SrcLine[] = [];
    let buf = "";
    let bufLine = 0;
    for (const { text, line } of body) {
      const t = text.trim();
      if (!buf && (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || !t)) {
        statements.push({ text: t, line });
        continue;
      }
      if (!buf) bufLine = line;
      buf = buf ? `${buf} ${t}` : t;
      const done = parenDelta(buf) <= 0 && (/[;{}]\s*$/.test(buf) || /\)\s*$/.test(buf) && /^(if|for|while|else)\b/.test(buf));
      if (done) {
        for (const part of splitStatements(buf)) statements.push({ text: part, line: bufLine });
        buf = "";
      }
    }
    if (buf) statements.push({ text: buf, line: bufLine });

    const reassigned = new Set<string>();
    for (const s of statements) {
      const m = /^([\w$]+)\s*(?:[+\-*/]?=(?!=)|\+\+|--)/.exec(s.text);
      if (m) reassigned.add(m[1]);
    }

    let depth = 0;
    let lastBlank = true;
    /** Depths whose closing "}" belongs to a removed block opener (e.g. if (driver != null) {). */
    const droppedClosers: number[] = [];
    for (const { text, line } of statements) {
      this.currentLine = line;
      if (!text) {
        if (!lastBlank) out.push({ text: "" });
        lastBlank = true;
        continue;
      }
      lastBlank = false;
      if (text.startsWith("//") || text.startsWith("/*") || text.startsWith("*")) {
        out.push({ text: `${indent}${"  ".repeat(depth)}${text.startsWith("*") ? ` ${text}` : text}`, src: line });
        continue;
      }
      if (text === "}" && droppedClosers.length && droppedClosers[droppedClosers.length - 1] === depth) {
        droppedClosers.pop();
        continue;
      }
      if (text.startsWith("}")) depth = Math.max(0, depth - 1);
      const pad = indent + "  ".repeat(depth);
      const opensBlock = braceDelta(text) > 0;
      depth = Math.max(0, depth + braceDelta(text) + (text.startsWith("}") ? 1 : 0));

      const stmt = (qualify ? qualify(text) : text).replace(/^final\s+/, "");
      let res: ReturnType<(typeof STATEMENT_RULES)[number]["convert"]> | null = null;
      for (const r of STATEMENT_RULES) {
        const m = r.pattern.exec(stmt);
        if (!m) continue;
        const attempt = r.convert(stmt, m, ctx);
        if (attempt.skip) continue;
        res = attempt;
        break;
      }
      if (res) {
        if (!res.todo && !res.lines.length && opensBlock && !text.startsWith("}")) {
          depth--;
          droppedClosers.push(depth);
          continue;
        }
        if (res.todo) out.push(this.todo(text, line, pad));
        else {
          if (res.lines.length) this.converted++;
          for (const l of res.lines) out.push({ text: pad + javaStringsToTs(l), src: line });
        }
        continue;
      }
      let ts = convertExpression(stmt, ctx);
      ts = convertAssertion(ts, ctx) ?? ts;
      ts = finishStatement(ts, ctx, reassigned);
      ts = insertAwaits(ts, ctx);
      if (/\bWebElement\b|\bBy\.\w|ExpectedConditions|\bKeys\.|JavascriptExecutor|switchTo\(\)|\bWebDriver\b|getWindowHandle|\bnew\s+Actions\b|\bFluentWait\b/.test(ts)) {
        out.push(this.todo(text, line, pad));
        continue;
      }
      this.converted++;
      out.push({ text: pad + ts, src: line });
    }
    this.currentLine = null;
    while (out.length && out[out.length - 1].text === "") out.pop();
    while (out.length && out[0].text === "") out.shift();
    return out;
  }
}

// ---------------------------------------------------------------- helpers

const METHOD_RE =
  /^(?:(public|private|protected)\s+)?((?:static|final|synchronized|abstract)\s+)*(?:<[^>]+>\s+)?([\w<>[\],.? ]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w.,\s]+)?$/;
const CTOR_RE = /^(?:(?:public|private|protected)\s+)?(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w.,\s]+)?$/;

function tsParams(params: string): { names: string[]; text: string } {
  const list = splitArgs(params)
    .filter(Boolean)
    .map((p) => {
      const m = /^(?:final\s+)?(?:@\w+\s+)*([\w<>[\],.? ]+?)\s+(\w+)$/.exec(p.trim());
      return m ? { name: m[2], type: tsType(m[1]) } : { name: p.trim(), type: "unknown" };
    });
  return { names: list.map((p) => p.name), text: list.map((p) => `${p.name}: ${p.type}`).join(", ") };
}

const annArg = (args: string, key: string): string | undefined => {
  const parts = splitArgs(args);
  for (const p of parts) {
    const m = new RegExp(`^${key}\\s*=\\s*(.+)$`, "s").exec(p);
    if (m) return m[1].trim();
  }
  return undefined;
};

/** "{\"a\", \"b\"}" or "\"a\"" → ["a", "b"]. */
const stringList = (v: string | undefined): string[] => {
  if (!v) return [];
  const t = v.trim().replace(/^\{|\}$/g, "");
  return splitArgs(t).filter(isJavaString).map((s) => decodeJavaString(s));
};

/** @FindBy(id = "x") / @FindBy(how = How.ID, using = "x") → Playwright call (no receiver). */
function findByToPlaywright(args: string, semantic: boolean): string | null {
  const how = annArg(args, "how");
  const using = annArg(args, "using");
  if (how && using) {
    const map: Record<string, string> = {
      ID: "id",
      NAME: "name",
      CLASS_NAME: "className",
      CSS: "cssSelector",
      XPATH: "xpath",
      LINK_TEXT: "linkText",
      PARTIAL_LINK_TEXT: "partialLinkText",
      TAG_NAME: "tagName",
      ID_OR_NAME: "id",
    };
    const key = /How\.(\w+)/.exec(how)?.[1] ?? "";
    return map[key] ? byToPlaywright(map[key], using, semantic) : null;
  }
  const map: Record<string, string> = {
    id: "id",
    name: "name",
    className: "className",
    css: "cssSelector",
    xpath: "xpath",
    linkText: "linkText",
    partialLinkText: "partialLinkText",
    tagName: "tagName",
  };
  for (const [k, how2] of Object.entries(map)) {
    const v = annArg(args, k);
    if (v) return byToPlaywright(how2, v, semantic);
  }
  return null;
}

/** Replaces bare references to fields with this.x (instance) or Class.x (static), skipping locals/params. */
function qualifier(instance: Set<string>, statics: Set<string>, className: string, skip: Set<string>) {
  return (stmt: string) => {
    let s = stmt;
    for (const names of [instance, statics]) {
      for (const name of names) {
        if (skip.has(name)) continue;
        const prefix = names === instance ? "this." : `${className}.`;
        for (const { index } of codeIndexes(s, new RegExp(`(?<![\\w$.])${name}\\b(?!\\s*\\()`)).reverse()) {
          // skip declarations like "String name =" (a local shadowing the field)
          if (/\b[A-Z]\w*(<[^>]*>)?\s+$/.test(s.slice(0, index))) continue;
          s = s.slice(0, index) + prefix + s.slice(index);
        }
      }
    }
    return s;
  };
}

/** Locals declared in a body (so field qualification skips them). */
function localNames(body: SrcLine[]): Set<string> {
  const names = new Set<string>();
  for (const { text } of body) {
    for (const m of text.matchAll(/\b(?:[A-Z]\w*(?:<[^>]*>)?|int|long|double|boolean|var|char|float)\s+(\w+)\s*[=;:]/g)) names.add(m[1]);
  }
  return names;
}

// ---------------------------------------------------------------- page objects

function convertPageObject(cls: ClassInfo, conv: Converter): Out[] {
  const ctx = conv.ctx("this.page");
  const out: Out[] = [];
  const locatorFields: { name: string; init: string; line: number }[] = [];
  const otherFields: Out[] = [];
  const instance = new Set<string>();
  const statics = new Set<string>();
  const semantic = conv.opts.locatorPreference === "semantic";

  for (const m of cls.members) {
    if (m.kind !== "field") continue;
    conv.currentLine = m.line;
    const findBy = m.annotations.find((a) => a.name === "FindBy");
    const decl = /^(?:(?:public|private|protected|static|final|transient)\s+)*([\w<>[\],.? ]+?)\s+(\w+)\s*(?:=\s*(.+?))?\s*;$/.exec(m.text);
    if (!decl) {
      otherFields.push(conv.todo(m.text, m.line, "  "));
      continue;
    }
    const [, type, name, init] = decl;
    const isStatic = /\bstatic\b/.test(m.text);
    if (findBy) {
      const call = findByToPlaywright(findBy.args, semantic);
      if (!call) {
        otherFields.push(conv.todo(`@FindBy(${findBy.args}) ${m.text}`, m.line, "  "));
        continue;
      }
      locatorFields.push({ name, init: `page.${call}`, line: m.line });
      ctx.locators.add(`this.${name}`);
      instance.add(name);
      conv.converted++;
      continue;
    }
    if (m.annotations.some((a) => a.name === "FindBys" || a.name === "FindAll")) {
      otherFields.push(conv.todo(m.text, m.line, "  "));
      continue;
    }
    if (/^(WebDriver|WebDriverWait|Actions|JavascriptExecutor|FluentWait<\w+>|Wait<\w+>)$/.test(type)) {
      conv.removedKinds.set("driver fields", (conv.removedKinds.get("driver fields") ?? 0) + 1);
      continue;
    }
    if (type === "By" && init) {
      const byM = /^By\.(\w+)\((.*)\)$/.exec(init.trim());
      const call = byM ? byToPlaywright(byM[1], byM[2], semantic) : null;
      if (call) {
        locatorFields.push({ name, init: `page.${call}`, line: m.line });
        ctx.locators.add(`this.${name}`);
        instance.add(name);
        conv.converted++;
        continue;
      }
    }
    (isStatic ? statics : instance).add(name);
    const value = init ? javaStringsToTs(convertExpression(init, ctx)) : undefined;
    const ro = /\bfinal\b/.test(m.text) ? "readonly " : "";
    otherFields.push({
      text: `  ${isStatic ? "static " : ""}${ro}${name}${value ? ` = ${value}` : `: ${tsType(type)} | undefined`};`,
      src: m.line,
    });
    conv.converted++;
  }

  const usesExpect = cls.members.some((m) => m.kind === "method" && m.body.some((l) => /\bassert\w*\(|ExpectedConditions/.test(l.text)));
  out.push({ text: `import { ${usesExpect ? "expect, " : ""}type Locator, type Page } from '@playwright/test';` });
  if (cls.extendsName && !conv.pageClasses.has(cls.extendsName)) {
    out.push({ text: `import { ${cls.extendsName} } from './${cls.extendsName}.page';` });
    conv.note("info", `\`${cls.name}\` extends \`${cls.extendsName}\` — convert that class too (its constructor should take a Playwright \`Page\`).`, `extends-${cls.extendsName}`);
  }
  out.push({ text: "" });
  out.push({ text: `export class ${cls.name}${cls.extendsName ? ` extends ${cls.extendsName}` : ""} {`, src: cls.line });
  if (!cls.extendsName) out.push({ text: "  readonly page: Page;" });
  for (const f of locatorFields) out.push({ text: `  readonly ${f.name}: Locator;`, src: f.line });
  out.push(...otherFields);
  out.push({ text: "" });

  for (const m of cls.members) if (m.kind === "method") {
    const sig = METHOD_RE.exec(m.header);
    if (sig) ctx.ownMethods.add(sig[4]);
  }
  const qualify = qualifier(instance, statics, cls.name, new Set());
  const ctors = cls.members.filter((m): m is Extract<Member, { kind: "method" }> => m.kind === "method" && CTOR_RE.test(m.header) && CTOR_RE.exec(m.header)![1] === cls.name);
  out.push({ text: "  constructor(page: Page) {", src: ctors[0]?.line });
  out.push({ text: cls.extendsName ? "    super(page);" : "    this.page = page;" });
  for (const f of locatorFields) out.push({ text: `    this.${f.name} = ${f.init};`, src: f.line });
  for (const c of ctors) out.push(...conv.convertBody(c.body, ctx, "    ", qualify));
  out.push({ text: "  }" });

  for (const m of cls.members) {
    if (m.kind === "comment") {
      out.push({ text: `  ${m.text.startsWith("*") ? ` ${m.text}` : m.text}`, src: m.line });
      continue;
    }
    if (m.kind === "other") {
      conv.currentLine = m.line;
      out.push(conv.todo(m.text, m.line, "  "));
      continue;
    }
    if (m.kind !== "method" || ctors.includes(m)) continue;
    const sig = METHOD_RE.exec(m.header);
    if (!sig) {
      conv.currentLine = m.line;
      out.push(conv.todo(m.header, m.line, "  "));
      continue;
    }
    const [, vis, mods = "", ret, name, params] = sig;
    const p = tsParams(params);
    const skip = new Set([...p.names, ...localNames(m.body)]);
    const q = qualifier(instance, statics, cls.name, skip);
    const methodCtx = { ...ctx, locators: new Set([...ctx.locators, ...p.names.filter((n, i) => /Locator/.test(tsParams(params).text.split(", ")[i] ?? ""))]) };
    const retType = tsType(ret);
    out.push({ text: "" });
    out.push({
      text: `  ${vis === "private" ? "private " : ""}${/static/.test(mods) ? "static " : ""}async ${name}(${p.text}): Promise<${retType}> {`,
      src: m.line,
    });
    out.push(...conv.convertBody(m.body, methodCtx, "    ", q));
    out.push({ text: "  }" });
  }
  out.push({ text: "}" });
  return out;
}

// ---------------------------------------------------------------- test classes

const HOOKS: Record<string, { fn: string; fixture: "page" | "browser" }> = {
  BeforeMethod: { fn: "test.beforeEach", fixture: "page" },
  BeforeEach: { fn: "test.beforeEach", fixture: "page" },
  Before: { fn: "test.beforeEach", fixture: "page" },
  AfterMethod: { fn: "test.afterEach", fixture: "page" },
  AfterEach: { fn: "test.afterEach", fixture: "page" },
  After: { fn: "test.afterEach", fixture: "page" },
  BeforeClass: { fn: "test.beforeAll", fixture: "browser" },
  BeforeAll: { fn: "test.beforeAll", fixture: "browser" },
  BeforeSuite: { fn: "test.beforeAll", fixture: "browser" },
  BeforeTest: { fn: "test.beforeAll", fixture: "browser" },
  AfterClass: { fn: "test.afterAll", fixture: "browser" },
  AfterAll: { fn: "test.afterAll", fixture: "browser" },
  AfterSuite: { fn: "test.afterAll", fixture: "browser" },
  AfterTest: { fn: "test.afterAll", fixture: "browser" },
};

/** Java data array (new Object[][] { {..}, {..} }) → TS nested array literal. */
function javaArrayToTs(expr: string): string {
  let s = expr.trim().replace(/^new\s+\w+(\[\])+\s*/, "");
  s = s.replace(/new\s+\w+(\[\])+\s*/g, "");
  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && s[i - 1] !== "\\") inStr = !inStr;
    if (!inStr && ch === "{") out += "[";
    else if (!inStr && ch === "}") out += "]";
    else out += ch;
  }
  return javaStringsToTs(out);
}

function convertTestClass(cls: ClassInfo, conv: Converter): Out[] {
  const ctx = conv.ctx("page");
  const header: Out[] = [];
  const body: Out[] = [];
  const usedPages = new Set<string>();
  const fieldNames = new Set<string>();
  const dataProviders = new Map<string, string>();
  const helpers = new Set<string>();

  // Data providers and helper method names first.
  for (const m of cls.members) {
    if (m.kind !== "method") continue;
    const dp = m.annotations.find((a) => a.name === "DataProvider");
    const sig = METHOD_RE.exec(m.header);
    if (dp && sig) {
      const name = stringList(annArg(dp.args, "name"))[0] ?? sig[4];
      const ret = m.body.map((l) => l.text).join("\n");
      const r = /return\s+([\s\S]+?);\s*$/.exec(ret.trim());
      if (r) dataProviders.set(name, javaArrayToTs(r[1]));
      continue;
    }
    const isHelper = sig && !m.annotations.some((a) => HOOKS[a.name] || /^(Test|ParameterizedTest|RepeatedTest)$/.test(a.name));
    if (isHelper) helpers.add(sig[4]);
  }

  const addHelperCalls = (s: string) =>
    [...helpers].reduce(
      (acc, h) =>
        replaceCalls(acc, new RegExp(`(?<![\\w$.])${h}`), (_m, args) => `await ${h}(${["page", ...args.filter(Boolean)].join(", ")})`),
      s,
    );

  // Fields
  for (const m of cls.members) {
    if (m.kind !== "field") continue;
    conv.currentLine = m.line;
    const decl = /^(?:(?:public|private|protected|static|final|transient)\s+)*([\w<>[\],.? ]+?)\s+(\w+)\s*(?:=\s*(.+?))?\s*;$/.exec(m.text);
    if (!decl) {
      body.push(conv.todo(m.text, m.line, "  "));
      continue;
    }
    const [, type, name, init] = decl;
    if (/^(WebDriver|WebDriverWait|Actions|JavascriptExecutor|RemoteWebDriver|ChromeDriver|FirefoxDriver)$/.test(type)) {
      conv.removedKinds.set("driver setup", (conv.removedKinds.get("driver setup") ?? 0) + 1);
      conv.note("info", "Driver setup/teardown removed — Playwright fixtures handle it. Configure browsers, viewport and timeouts in `playwright.config.ts`.", "driver setup");
      continue;
    }
    if (type === "SoftAssert") {
      ctx.softVars.add(name);
      continue;
    }
    fieldNames.add(name);
    if (/^[A-Z]/.test(type) && !/^(String|Integer|Long|Double|Boolean|List|Map|Object)\b/.test(type)) {
      usedPages.add(type);
      ctx.poVars.add(name);
    }
    const isConst = /\bstatic\b/.test(m.text) && /\bfinal\b/.test(m.text);
    const value = init ? javaStringsToTs(convertExpression(init, ctx)) : undefined;
    body.push({ text: `  ${isConst ? "const" : "let"} ${name}${value ? ` = ${value}` : `: ${tsType(type)}`};`, src: m.line });
    conv.converted++;
  }
  for (const [name, data] of dataProviders) body.push({ text: `  const ${name} = ${data};` });
  if (body.length) body.push({ text: "" });

  const emitFn = (open: string, line: number, lines: Out[], close = "  });") => {
    body.push({ text: open, src: line }, ...lines, { text: close }, { text: "" });
  };

  for (const m of cls.members) {
    if (m.kind === "comment") {
      body.push({ text: `  ${m.text.startsWith("*") ? ` ${m.text}` : m.text}`, src: m.line });
      continue;
    }
    if (m.kind === "other") {
      conv.currentLine = m.line;
      body.push(conv.todo(m.text, m.line, "  "));
      continue;
    }
    if (m.kind !== "method") continue;
    if (m.annotations.some((a) => a.name === "DataProvider")) continue;
    const sig = METHOD_RE.exec(m.header);
    if (!sig) {
      conv.currentLine = m.line;
      body.push(conv.todo(m.header, m.line, "  "));
      continue;
    }
    const [, , , ret, name, params] = sig;
    const qualified = (s: string) => addHelperCalls(s);
    for (const l of m.body) for (const nm of l.text.matchAll(/\bnew\s+(\w+)\(/g)) if (conv.pageClasses.has(nm[1]) || /Page$/.test(nm[1])) usedPages.add(nm[1]);

    const hook = m.annotations.map((a) => HOOKS[a.name]).find(Boolean);
    if (hook) {
      const lines = conv.convertBody(m.body, ctx, "    ", qualified);
      if (!lines.some((l) => l.text.trim() && !l.text.trim().startsWith("//"))) {
        conv.note("info", `\`${name}()\` only set up or quit the driver — removed (fixtures handle it).`, `hook-${name}`);
        continue;
      }
      if (hook.fixture === "browser" && lines.some((l) => /\bpage\b/.test(l.text))) {
        conv.note("warning", `\`${name}()\` runs once before/after all tests — it now opens its own page. Consider \`test.beforeEach\` instead.`, undefined, m.line);
        emitFn(`  ${hook.fn}(async ({ browser }) => {`, m.line, [{ text: "    const page = await browser.newPage();" }, ...lines]);
      } else emitFn(`  ${hook.fn}(async ({ ${hook.fixture} }) => {`, m.line, lines);
      continue;
    }

    const testAnn = m.annotations.find((a) => /^(Test|ParameterizedTest|RepeatedTest)$/.test(a.name));
    if (!testAnn) {
      // helper method
      const p = tsParams(params);
      const helperCtx = { ...ctx, locators: new Set(ctx.locators) };
      emitFn(
        `  async function ${name}(${["page: Page", p.text].filter(Boolean).join(", ")}): Promise<${tsType(ret)}> {`,
        m.line,
        conv.convertBody(m.body, helperCtx, "    ", qualified),
        "  }",
      );
      continue;
    }

    const display = m.annotations.find((a) => a.name === "DisplayName");
    const description = stringList(annArg(testAnn.args, "description"))[0];
    let title = display ? stringList(display.args)[0] : description ?? methodTitle(name);
    const tags = [
      ...stringList(annArg(testAnn.args, "groups")),
      ...m.annotations.filter((a) => a.name === "Tag").flatMap((a) => stringList(a.args)),
    ];
    if (tags.length) title += ` ${tags.map((t) => `@${t}`).join(" ")}`;
    const skipped =
      annArg(testAnn.args, "enabled") === "false" || m.annotations.some((a) => a.name === "Disabled" || a.name === "Ignore");
    const fn = skipped ? "test.skip" : "test";
    const timeout = annArg(testAnn.args, "timeOut") ?? annArg(testAnn.args, "timeout");
    const lines = conv.convertBody(m.body, ctx, "    ", qualified);
    if (timeout) lines.unshift({ text: `    test.setTimeout(${timeout});` });
    if (annArg(testAnn.args, "expectedExceptions") || annArg(testAnn.args, "expected")) {
      conv.note("warning", `\`${name}\` expects an exception — wrap the failing step in \`await expect(async () => …).rejects.toThrow()\`.`, undefined, m.line);
    }

    // Data-driven tests
    const p = tsParams(params);
    const providerName = stringList(annArg(testAnn.args, "dataProvider"))[0];
    const valueSource = m.annotations.find((a) => a.name === "ValueSource");
    const csvSource = m.annotations.find((a) => a.name === "CsvSource");
    let data: string | null = null;
    if (providerName) {
      data = dataProviders.has(providerName) ? providerName : null;
      if (!data) conv.note("attention", `Data provider "${providerName}" wasn't found in the input — define it as an array.`, undefined, m.line);
    } else if (valueSource) {
      const raw = /=\s*\{([\s\S]*)\}/.exec(valueSource.args)?.[1] ?? valueSource.args;
      data = `[${splitArgs(raw).map((v) => javaStringsToTs(v)).join(", ")}]`;
    } else if (csvSource) {
      const rows = stringList(csvSource.args.replace(/^value\s*=\s*/, ""));
      data = `[${rows.map((r) => `[${r.split(",").map((c) => tsLit(c.trim())).join(", ")}]`).join(", ")}]`;
    } else if (m.annotations.some((a) => a.name === "MethodSource")) {
      conv.note("attention", "`@MethodSource` isn't converted — build the data array by hand.", undefined, m.line);
    }
    if (p.names.length && (data || providerName)) {
      const binding = p.names.length === 1 && valueSource ? p.names[0] : `[${p.names.join(", ")}]`;
      conv.note("warning", `Data-driven test \`${name}\` converted to a loop — check the titles are unique.`, undefined, m.line);
      body.push({ text: `  for (const ${binding} of ${data ?? providerName}) {`, src: m.line });
      body.push({ text: `    ${fn}(\`${title.replace(/`/g, "\\`")} \${${p.names[0]}}\`, async ({ page }) => {`, src: m.line });
      body.push(...lines.map((l) => (l.text ? { ...l, text: `  ${l.text}` } : l)));
      body.push({ text: "    });" }, { text: "  }" }, { text: "" });
      continue;
    }
    emitFn(`  ${fn}(${tsLit(title)}, async ({ page }) => {`, m.line, lines);
  }
  while (body.length && body[body.length - 1].text === "") body.pop();

  if (cls.extendsName) {
    conv.note("info", `\`${cls.name}\` extends \`${cls.extendsName}\` — move its shared setup into \`test.beforeEach\` or a custom fixture.`, `extends-${cls.extendsName}`);
  }
  const needsPage = helpers.size > 0;
  header.push({ text: `import { test, expect${needsPage ? ", type Page" : ""} } from '@playwright/test';` });
  for (const p of [...usedPages].sort()) header.push({ text: `import { ${p} } from './${p}.page';` });
  header.push({ text: "" });
  header.push({ text: `test.describe(${tsLit(methodTitle(cls.name.replace(/Tests?$/, "")) || cls.name)}, () => {`, src: cls.line });
  return [...header, ...body, { text: "});" }];
}

// ---------------------------------------------------------------- entry point

export function convertJava(src: string, options: Partial<ConvertOptions> = {}): ConvertResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const conv = new Converter(opts, src);
  const { classes, loose } = parseSource(src);
  const detectedType = detectInputType(src);
  const files: { file: OutputFile; lines: Out[] }[] = [];

  const isTest = (c: ClassInfo) => c.members.some((m) => m.kind === "method" && m.annotations.some((a) => /^(Test|ParameterizedTest|RepeatedTest)$/.test(a.name)));
  for (const c of classes) if (!isTest(c)) conv.pageClasses.add(c.name);

  // Page objects first so tests can import them.
  const ordered = [...classes].sort((a, b) => Number(isTest(a)) - Number(isTest(b)));
  for (const c of ordered) {
    const forced = opts.inputType === "auto" ? null : opts.inputType;
    const kind = forced ?? (isTest(c) ? "test" : "pageObject");
    const lines = kind === "test" ? convertTestClass(c, conv) : convertPageObject(c, conv);
    files.push({ file: { name: `${c.name}.${kind === "test" ? "spec" : "page"}.ts`, kind: kind === "test" ? "test" : "pageObject", code: "" }, lines });
  }

  const looseCode = loose.filter((l) => l.text.trim());
  if (!classes.length && looseCode.length) {
    const asPo = opts.outputStyle === "pageObject" || opts.inputType === "pageObject";
    const ctx = conv.ctx(asPo ? "this.page" : "page");
    const body = conv.convertBody(loose, ctx, asPo ? "" : "  ");
    const lines: Out[] = asPo
      ? body
      : [{ text: "import { test, expect } from '@playwright/test';" }, { text: "" }, { text: "test('converted test', async ({ page }) => {" }, ...body, { text: "});" }];
    files.push({ file: { name: asPo ? "converted.page.ts" : "converted.spec.ts", kind: asPo ? "pageObject" : "test", code: "" }, lines });
  } else if (classes.length && looseCode.some((l) => !/^[@}]/.test(l.text.trim()) && !l.text.trim().startsWith("//"))) {
    conv.note("info", "Code outside the class was ignored.", "outside-class");
  }

  // Assemble code; map source lines to output lines for notes.
  const all: Out[] = [];
  files.forEach(({ file, lines }, i) => {
    file.code = `${lines.map((l) => l.text).join("\n")}\n`;
    if (files.length > 1) all.push({ text: `// ===== ${file.name} =====` });
    all.push(...lines);
    if (i < files.length - 1) all.push({ text: "" });
  });
  const firstOut = new Map<number, number>();
  all.forEach((l, i) => {
    if (l.src && !firstOut.has(l.src)) firstOut.set(l.src, i + 1);
  });
  const notes = conv.notes.map((n) => ({ ...n, outLine: n.line ? (firstOut.get(n.line) ?? null) : null }));
  const order = { attention: 0, warning: 1, info: 2 } as const;
  notes.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || order[a.severity] - order[b.severity]);
  const removedKinds = [...conv.removedKinds.keys()];
  const removedCount = [...conv.removedKinds.values()].reduce((a, b) => a + b, 0);

  return {
    code: files.length ? `${all.map((l) => l.text).join("\n")}\n` : "",
    files: files.map((f) => f.file),
    notes,
    stats: {
      converted: conv.converted,
      review: notes.filter((n) => n.severity !== "info").length,
      removed: removedCount,
      removedKinds,
    },
    detected: { inputType: detectedType, framework: conv.framework },
  };
}

export { isJavaString };
