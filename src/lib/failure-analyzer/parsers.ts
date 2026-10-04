import { XMLParser } from "fast-xml-parser";

import type { Failure, FailureSource, ParseResult } from "./types";

export const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_FAILURES = 2000;

const ANSI = /\u001b\[[0-9;]*m/g;
/** GitHub Actions log lines start with an ISO timestamp. */
const GH_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/gm;

export const cleanText = (s: string) => s.replace(ANSI, "").replace(GH_TIMESTAMP, "").replace(/\r\n?/g, "\n");

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "#cdata",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ["suite", "test", "class", "test-method", "testsuite", "testcase", "failure", "error"].includes(name),
});

type XmlNode = Record<string, unknown>;
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Text content of an XML node (CDATA or text). */
function text(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  const n = node as XmlNode;
  return String(n["#cdata"] ?? n["#text"] ?? "");
}

const attr = (n: XmlNode, name: string) => (n[`@_${name}`] as string | undefined) ?? undefined;

function splitStack(stack: string) {
  const lines = stack.split("\n");
  const firstFrame = lines.findIndex((l) => /^\s*at\s/.test(l));
  return firstFrame === -1 ? { head: stack.trim(), frames: "" } : { head: lines.slice(0, firstFrame).join("\n").trim(), frames: lines.slice(firstFrame).join("\n") };
}

// ---------------------------------------------------------------- TestNG

export function parseTestNg(content: string): ParseResult {
  const doc = xml.parse(content) as XmlNode;
  const root = doc["testng-results"] as XmlNode | undefined;
  if (!root) throw new Error("Not a TestNG results file (no <testng-results>).");
  const failures: Failure[] = [];
  let passed = 0;
  let skipped = 0;
  for (const suite of arr(root.suite as XmlNode[])) {
    for (const test of arr(suite.test as XmlNode[])) {
      for (const cls of arr(test.class as XmlNode[])) {
        const className = attr(cls, "name");
        for (const m of arr(cls["test-method"] as XmlNode[])) {
          if (attr(m, "is-config") === "true") continue;
          const status = attr(m, "status");
          if (status === "PASS") passed++;
          else if (status === "SKIP") skipped++;
          else if (status === "FAIL") {
            const ex = (m.exception as XmlNode | undefined) ?? {};
            const exClass = attr(ex, "class") ?? "";
            const msg = text(ex.message).trim();
            const stack = text(ex["full-stacktrace"]).trim();
            failures.push({
              testName: attr(m, "name") ?? "unknown",
              className,
              suite: attr(suite, "name"),
              durationMs: Number(attr(m, "duration-ms")) || undefined,
              message: msg ? (exClass && !msg.startsWith(exClass) ? `${exClass}: ${msg}` : msg) : splitStack(stack).head || exClass,
              stackTrace: stack,
              source: "testng",
            });
          }
        }
      }
    }
  }
  return { failures, passed, skipped, sources: ["testng"], warnings: [] };
}

// ---------------------------------------------------------------- JUnit / Surefire

export function parseJUnit(content: string): ParseResult {
  const doc = xml.parse(content) as XmlNode;
  const suites: XmlNode[] = [];
  const collect = (n: XmlNode | undefined) => {
    if (!n) return;
    for (const s of arr(n.testsuite as XmlNode[])) {
      suites.push(s);
      collect(s);
    }
  };
  if (doc.testsuites) collect(doc.testsuites as XmlNode);
  else collect(doc);
  if (!suites.length) throw new Error("Not a JUnit XML report (no <testsuite>).");
  const failures: Failure[] = [];
  let passed = 0;
  let skipped = 0;
  for (const suite of suites) {
    for (const tc of arr(suite.testcase as XmlNode[])) {
      const problems = [...arr(tc.failure as XmlNode[]), ...arr(tc.error as XmlNode[])];
      if (tc.skipped !== undefined) {
        skipped++;
        continue;
      }
      if (!problems.length) {
        passed++;
        continue;
      }
      const p = problems[0];
      const body = text(p).trim();
      const type = attr(p, "type") ?? "";
      const msgAttr = attr(p, "message")?.trim() ?? "";
      const head = splitStack(body).head;
      let message = msgAttr || head || type;
      if (type && !message.includes(type)) message = `${type}: ${message}`;
      failures.push({
        testName: attr(tc, "name") ?? "unknown",
        className: attr(tc, "classname"),
        suite: attr(suite, "name"),
        durationMs: attr(tc, "time") ? Math.round(Number(attr(tc, "time")) * 1000) : undefined,
        message,
        stackTrace: body,
        source: "junit",
      });
    }
  }
  return { failures, passed, skipped, sources: ["junit"], warnings: [] };
}

// ---------------------------------------------------------------- Playwright JSON

type PwResult = { status?: string; duration?: number; error?: { message?: string; stack?: string }; errors?: { message?: string; stack?: string }[] };
type PwTest = { status?: string; projectName?: string; results?: PwResult[] };
type PwSpec = { title: string; file?: string; tests?: PwTest[] };
type PwSuite = { title?: string; file?: string; specs?: PwSpec[]; suites?: PwSuite[] };

export function parsePlaywright(content: string): ParseResult {
  let data: { suites?: PwSuite[]; stats?: { expected?: number; skipped?: number; flaky?: number } };
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error("Not valid JSON.");
  }
  if (!Array.isArray(data.suites)) throw new Error("Not a Playwright JSON report (no suites).");
  const failures: Failure[] = [];
  let passed = 0;
  let skipped = 0;
  const walk = (suite: PwSuite, path: string[]) => {
    const here = suite.title && suite.title !== suite.file ? [...path, suite.title] : path;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const last = results[results.length - 1];
        const failed = t.status ? t.status === "unexpected" : results.some((r) => r.status === "failed" || r.status === "timedOut");
        if (t.status === "skipped" || last?.status === "skipped") {
          skipped++;
          continue;
        }
        if (!failed) {
          passed++;
          continue;
        }
        const r = [...results].reverse().find((x) => x.status === "failed" || x.status === "timedOut") ?? last ?? {};
        const err = r.error ?? r.errors?.[0] ?? {};
        const message = cleanText(err.message ?? (r.status === "timedOut" ? "Test timeout exceeded" : "Test failed")).trim();
        const stack = cleanText(err.stack ?? "").trim();
        failures.push({
          testName: [...here, spec.title].filter(Boolean).join(" › ") + (t.projectName ? ` [${t.projectName}]` : ""),
          className: spec.file ?? suite.file,
          durationMs: r.duration,
          message,
          stackTrace: stack,
          source: "playwright",
        });
      }
    }
    for (const s of suite.suites ?? []) walk(s, here);
  };
  for (const s of data.suites) walk(s, []);
  return { failures, passed, skipped, sources: ["playwright"], warnings: [] };
}

// ---------------------------------------------------------------- plain text

const EXCEPTION_HEADER = /^(?:Caused by:\s*)?[\w$.]*(?:Exception|Error)(?::|$)/;
const NAME_HEADERS: RegExp[] = [
  /^FAILED:\s*(.+)$/, // TestNG console
  /^\s*[✘×]\s+(?:\d+\s+)?(.+?)(?:\s+\(\d+(?:\.\d+)?m?s\))?$/, // Playwright list reporter
  /^\s*\d+\)\s+(.+›.+)$/, // Playwright line reporter: "1) [chromium] › a.spec.ts:3:5 › title"
  /^\[ERROR\]\s+(\S+?)(?:\(([\w.$]+)\))?\s+(?:--\s+)?Time elapsed.*<<<\s*(?:FAILURE|ERROR)!/, // Surefire
];
const IGNORE = /^(?:\s*\(Session info:|Build info:|System info:|Driver info:|Capabilities \{|Session ID:|For documentation on this error)/;

/** Test name from the first "at com.x.SomeTest.method(" frame, if any. */
function testFromStack(frames: string[]) {
  for (const f of frames) {
    const m = /at\s+([\w$.]+)\.([\w$<>]+)\(/.exec(f);
    if (m && /Test|Spec|Steps|Suite/.test(m[1]) && !/^(org\.testng|org\.junit|junit|java|jdk|sun)\./.test(m[1])) {
      return { className: m[1], testName: m[2] };
    }
  }
  return null;
}

export function parsePlainText(content: string, source: FailureSource = "paste"): ParseResult {
  const lines = cleanText(content).split("\n");
  type Block = { name?: string; className?: string; head: string[]; frames: string[] };
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (const line of lines) {
    const t = line.trim();
    const named = NAME_HEADERS.map((re) => re.exec(line)).find(Boolean);
    if (named) {
      cur = { name: named[1].trim(), className: named[2], head: [], frames: [] };
      blocks.push(cur);
      continue;
    }
    if (EXCEPTION_HEADER.test(t) || /^Error:\s/.test(t)) {
      // "Caused by:" stays with its block; an exception right after a name header is that test's message.
      const continuesBlock = cur && ((/^Caused by:/.test(t) && cur.head.length) || (cur.name && !cur.head.length && !cur.frames.length));
      if (!continuesBlock) {
        cur = { head: [], frames: [] };
        blocks.push(cur);
      }
      if (/^Caused by:/.test(t) && cur!.head.length) cur!.frames.push(t);
      else cur!.head.push(t);
      continue;
    }
    if (!cur) continue;
    if (/^at\s/.test(t) || /^\.\.\.\s\d+\smore$/.test(t)) cur.frames.push(t);
    else if (t && !IGNORE.test(t) && !cur.frames.length && cur.head.length < 15) cur.head.push(t);
    else if (!t && cur.frames.length) cur = cur.name ? cur : null; // blank line after a stack ends the block
  }
  const failures: Failure[] = blocks
    .filter((b) => b.head.length || b.frames.length)
    .map((b, i) => {
      const fromStack = testFromStack(b.frames);
      return {
        testName: b.name ?? fromStack?.testName ?? `Failure ${i + 1}`,
        className: b.className ?? fromStack?.className,
        message: b.head.join("\n").trim() || "(no message)",
        stackTrace: [...b.head, ...b.frames].join("\n"),
        source,
      };
    });
  return { failures, sources: [source], warnings: [] };
}

// ---------------------------------------------------------------- dispatch

export type InputFile = { name: string; content: string };

/** Picks the parser by content (and file name as a hint). */
export function parseFile(file: InputFile): ParseResult {
  const c = file.content.trimStart();
  if (c.startsWith("{") || /\.json$/i.test(file.name)) return parsePlaywright(file.content);
  if (c.startsWith("<")) {
    if (/<testng-results/.test(c.slice(0, 2000))) return parseTestNg(file.content);
    return parseJUnit(file.content);
  }
  return parsePlainText(file.content);
}

/** Merges results from several inputs, enforcing the size and failure limits. */
export function parseInputs(inputs: InputFile[]): ParseResult {
  const total = inputs.reduce((n, f) => n + new TextEncoder().encode(f.content).length, 0);
  if (total > MAX_TOTAL_BYTES) throw new Error("Input is larger than 5 MB in total. Upload fewer or smaller reports.");
  const merged: ParseResult = { failures: [], sources: [], warnings: [] };
  for (const f of inputs) {
    let r: ParseResult;
    try {
      r = parseFile(f);
    } catch (e) {
      merged.warnings.push(`${f.name}: ${e instanceof Error ? e.message : "couldn't be read"}`);
      continue;
    }
    merged.failures.push(...r.failures);
    if (r.passed !== undefined) merged.passed = (merged.passed ?? 0) + r.passed;
    if (r.skipped !== undefined) merged.skipped = (merged.skipped ?? 0) + r.skipped;
    for (const s of r.sources) if (!merged.sources.includes(s)) merged.sources.push(s);
  }
  if (merged.failures.length > MAX_FAILURES) {
    throw new Error(`Found ${merged.failures.length} failures — the limit is ${MAX_FAILURES}. Analyze a smaller set.`);
  }
  return merged;
}
