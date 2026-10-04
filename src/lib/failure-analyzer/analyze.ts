import { CATEGORIES, CATEGORY_ORDER, RULES, type CategoryId } from "./rules";
import type { Analysis, CategorySummary, Cluster, Failure } from "./types";

/** First matching rule's category (matched on the message and the stack's first line). */
export function classify(f: Pick<Failure, "message" | "stackTrace">): CategoryId {
  const haystack = `${f.message}\n${f.stackTrace.split("\n")[0] ?? ""}`;
  for (const rule of RULES) if (rule.patterns.some((p) => p.test(haystack))) return rule.category;
  return "unknown";
}

/** First line of a message, minus driver noise. */
export function firstLine(message: string) {
  return (message.split("\n").find((l) => l.trim()) ?? "").trim();
}

/**
 * Normalises a message for clustering: strips timestamps, memory addresses,
 * ids, URLs, quoted values and numbers.
 */
export function normalizeMessage(message: string) {
  return firstLine(message)
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?/g, "<ts>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<addr>")
    .replace(/@[0-9a-f]{5,}\b/gi, "@<addr>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`/g, '"<v>"')
    .replace(/\{[^{}]*\}/g, "{<v>}")
    .replace(/\b[0-9a-f]{12,}\b/gi, "<id>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

const FRAMEWORK_FRAME =
  /^at\s+(?:java\.|javax\.|jdk\.|sun\.|com\.sun\.|kotlin\.|org\.openqa\.|org\.testng\.|org\.junit\.|junit\.|org\.apache\.|io\.restassured\.|io\.cucumber\.|org\.gradle\.|org\.springframework\.|net\.bytebuddy\.|org\.hamcrest\.|org\.assertj\.|com\.google\.|groovy\.|org\.codehaus\.|process\.|processTicksAndRejections|new Promise|Generator\.next|async Promise\.all)|node_modules|node:internal|<anonymous>\)$/;

/** True for a stack line from the app/test code rather than a framework or the JVM. */
export const isAppFrame = (line: string) => /^\s*at\s/.test(line) && !FRAMEWORK_FRAME.test(line.trim());

/** Top application frame without line/column numbers. */
export function topAppFrame(stack: string): string {
  const frame = stack.split("\n").find(isAppFrame);
  if (!frame) return "";
  return frame
    .trim()
    .replace(/^at\s+/, "")
    .replace(/[^\s()]*[\\/]([^\\/\s()]+?)(?::\d+)+(?=\)|$)/, "$1") // JS: /path/to/file.ts:12:5 → file.ts
    .replace(/(\([^()]*?)(?::\d+)+\)$/, "$1)"); // Java: (LoginTest.java:42) → (LoginTest.java)
}

/** Small stable hash (FNV-1a, hex). */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const signatureOf = (category: CategoryId, normalized: string, frame: string) => `${category}-${hash(`${category}|${normalized}|${frame}`)}`;

const testLabel = (f: Failure) => (f.className && !f.testName.includes(f.className) && f.source !== "playwright" ? `${f.className.split(".").pop()}.${f.testName}` : f.testName);

/** Groups failures by category, then by normalised message + top app frame. */
export function analyze(failures: Failure[], counts: { passed?: number; skipped?: number } = {}): Analysis {
  const clusters = new Map<string, Cluster>();
  for (const f of failures) {
    const category = classify(f);
    const normalized = normalizeMessage(f.message);
    const frame = topAppFrame(f.stackTrace);
    const signature = signatureOf(category, normalized, frame);
    const existing = clusters.get(signature);
    const label = testLabel(f);
    if (existing) {
      existing.count++;
      if (!existing.tests.includes(label)) existing.tests.push(label);
      continue;
    }
    clusters.set(signature, {
      signature,
      category,
      message: firstLine(f.message).slice(0, 500),
      normalized,
      frame,
      tests: [label],
      count: 1,
      sample: { testName: label, message: f.message.slice(0, 4000), stack: f.stackTrace.split("\n").slice(0, 40) },
    });
  }
  const byCategory = new Map<CategoryId, Cluster[]>();
  for (const c of clusters.values()) byCategory.set(c.category, [...(byCategory.get(c.category) ?? []), c]);
  const categories: CategorySummary[] = [...byCategory.entries()]
    .map(([category, list]) => ({
      category,
      count: list.reduce((n, c) => n + c.count, 0),
      clusters: list.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
  const categoryCounts = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, byCategory.get(id)?.reduce((n, c) => n + c.count, 0) ?? 0])) as Record<CategoryId, number>;
  return { total: failures.length, passed: counts.passed, skipped: counts.skipped, categories, categoryCounts, verdict: verdict(failures.length, categoryCounts, categories) };
}

/** "68% of failures look like automation issues; 2 clusters look like product bugs." */
export function verdict(total: number, counts: Record<CategoryId, number>, categories: CategorySummary[]) {
  if (!total) return "No failures found — nothing to analyze.";
  const automation = counts.locator + counts.timing + counts.data;
  const pct = Math.round((automation / total) * 100);
  const productClusters = categories.filter((c) => CATEGORIES[c.category].productBug).reduce((n, c) => n + c.clusters.length, 0);
  const env = counts.environment;
  const parts = [`${pct}% of failures look like automation issues`];
  parts.push(productClusters ? `${productClusters} cluster${productClusters === 1 ? "" : "s"} look${productClusters === 1 ? "s" : ""} like product bugs` : "none look like product bugs");
  if (env) parts.push(`${env} ${env === 1 ? "is an environment problem" : "are environment problems"}`);
  return `${parts.join("; ")}.`;
}

// ---------------------------------------------------------------- outputs

export function clusterMarkdown(c: Cluster) {
  const cat = CATEGORIES[c.category];
  const tests = c.tests.slice(0, 20).map((t) => `- ${t}`);
  if (c.tests.length > 20) tests.push(`- …and ${c.tests.length - 20} more`);
  return [
    `### ${cat.label} — ${c.count} failure${c.count === 1 ? "" : "s"}`,
    "",
    `**Message:** \`${c.message.replace(/`/g, "'")}\``,
    c.frame ? `**Top frame:** \`${c.frame}\`` : "",
    `**Likely owner:** ${cat.owner}`,
    "",
    "**Affected tests:**",
    ...tests,
    "",
    `**Suggested fix:** ${cat.fix}`,
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

/** A Bug Formatter bug from a product-bug cluster. */
export function bugFromCluster(c: Cluster) {
  const title = c.message.replace(/^[\w$.]*(?:Exception|Error):\s*/, "").slice(0, 120) || CATEGORIES[c.category].label;
  const frames = c.sample.stack.filter(isAppFrame).slice(0, 5);
  return {
    title,
    severity: "P2" as const,
    steps: [`Run the automated test: ${c.tests[0]}`, "(add the manual steps to reproduce)"],
    expected: "",
    actual: c.message,
    // Bug Formatter's notes field is a single line.
    notes: [
      `Found by Test Failure Analyzer — ${CATEGORIES[c.category].label}, ${c.count} failing test${c.count === 1 ? "" : "s"}.`,
      c.tests.length > 1 ? `Affected tests: ${c.tests.slice(0, 10).join(", ")}${c.tests.length > 10 ? ", …" : ""}.` : "",
      frames.length ? `Top frames: ${frames.map((f) => f.trim().replace(/^at\s+/, "")).join(" ← ")}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export const MAX_AI_FAILURE = 8 * 1024;

/** The representative failure trimmed for AI: message + top 30 stack lines, max 8 KB. */
export function aiPayload(c: Cluster) {
  const stack = c.sample.stack.slice(0, 30).join("\n");
  return `${c.sample.message.slice(0, 3000)}\n\n${stack}`.slice(0, MAX_AI_FAILURE);
}

export const FAILURE_AI_SYSTEM =
  "You are a senior test-automation engineer. Given one automated test failure (message and stack trace), explain the most likely root cause, " +
  "say whether it's an automation/script issue, test data, environment, or a real product bug, and give one concrete fix. Be brief and specific.";

export const FAILURE_AI_SCHEMA = {
  type: "object",
  properties: {
    rootCause: { type: "string", description: "One or two sentences." },
    category: { type: "string", enum: ["locator", "timing", "assertion", "data", "environment", "api", "unknown"] },
    categoryAgrees: { type: "boolean", description: "Whether the rule-based category given is right." },
    fix: { type: "string", description: "A concrete next step or code change." },
  },
  required: ["rootCause", "category", "categoryAgrees", "fix"],
  additionalProperties: false,
} as const;

export function failureAiUser(c: Cluster) {
  return `Rule-based category: ${CATEGORIES[c.category].label}\nAffected tests: ${c.count}\n\nFailure:\n\`\`\`\n${aiPayload(c)}\n\`\`\``;
}

/** "Copy AI prompt" text when no API key is configured. */
export function failureCopyPrompt(c: Cluster) {
  return `${FAILURE_AI_SYSTEM}\n\n${failureAiUser(c)}\n\nAnswer with: likely root cause, whether the category is right (and the correct one if not), and the fix.`;
}

/** Rebuilds an Analysis from saved clusters (History → open). */
export function analysisFromClusters(clusters: Cluster[], counts: { total: number; passed?: number | null; skipped?: number | null }): Analysis {
  const byCategory = new Map<CategoryId, Cluster[]>();
  for (const c of clusters) byCategory.set(c.category, [...(byCategory.get(c.category) ?? []), c]);
  const categories: CategorySummary[] = [...byCategory.entries()]
    .map(([category, list]) => ({ category, count: list.reduce((n, c) => n + c.count, 0), clusters: list.sort((a, b) => b.count - a.count) }))
    .sort((a, b) => b.count - a.count || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
  const categoryCounts = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, byCategory.get(id)?.reduce((n, c) => n + c.count, 0) ?? 0])) as Record<CategoryId, number>;
  return {
    total: counts.total,
    passed: counts.passed ?? undefined,
    skipped: counts.skipped ?? undefined,
    categories,
    categoryCounts,
    verdict: verdict(counts.total, categoryCounts, categories),
  };
}
