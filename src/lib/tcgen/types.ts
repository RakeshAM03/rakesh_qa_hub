/** Test Case Generator types and catalogues (pure; shared by client and server). */

/** The Standard Test Case Format categories. */
export const CATEGORIES = [
  "Functional",
  "Validation",
  "Boundary Value",
  "Security",
  "UI",
  "Usability",
  "Accessibility",
  "Reliability",
  "Performance",
  "Compatibility",
  "Localisation",
  "API",
  "API / Security",
  "Integration",
  "Data Integrity",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type CaseType = "Positive" | "Negative";
export const CASE_TYPES: CaseType[] = ["Positive", "Negative"];

/** Stored level: P1 = critical … P4 = low. How it's shown depends on the priority scheme. */
export type Priority = "P1" | "P2" | "P3" | "P4";
export const PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];

export type Mode = "AI" | "IMPORTED" | "CHECKLIST";

export type ApiDetails = {
  method: string;
  endpoint: string;
  headers: Record<string, string>;
  body: unknown;
  expectedStatus: number | null;
  assertions: string[];
};

export type TestCase = {
  /** Stable row key for the UI (not exported). */
  key: string;
  id: string;
  title: string;
  category: Category;
  type: CaseType;
  priority: Priority;
  automationCandidate: boolean;
  /** Numbered lines ("1. …\n2. …"). */
  preconditions: string;
  steps: string[];
  /** "Key: value" lines. */
  testData: string;
  /** Numbered lines. */
  expectedResult: string;
  gherkin: string | null;
  requirementRef: string;
  api: ApiDetails | null;
  /** Generic checklist case (no generator covered this test type) that needs a human review. */
  template?: boolean;
};

export type GenerationResult = {
  summary: string;
  /** Rules, values and limits found in the requirement. */
  requirementRules: string[];
  assumptions: string[];
  questions: string[];
  testCases: TestCase[];
};

export type ApiForm = {
  method: string;
  endpoint: string;
  requestBody: string;
  responseSample: string;
  auth: "none" | "bearer" | "basic" | "apikey" | "oauth2";
  notes: string;
};

export type Context = {
  moduleName: string;
  appType: "Web" | "Mobile" | "API" | "Desktop";
  platforms: string;
  roles: string;
  rules: string;
  outOfScope: string;
  /** e.g. "App > Settings > Profile" */
  navigation: string;
  /** Buttons, fields, sections (comma-separated). */
  elements: string;
  /** e.g. "QA environment" */
  environment: string;
  /** Success / error copy (one per line). */
  messages: string;
};

export type Depth = "quick" | "standard" | "exhaustive";
export type OutputFormat = "steps" | "gherkin" | "both";
/** standard = "P1 - Critical … P4 - Low"; p0 = P0–P3; hml = High / Medium / Low. */
export type PriorityScheme = "standard" | "p0" | "hml";

export type TcOptions = {
  depth: Depth;
  format: OutputFormat;
  priorityScheme: PriorityScheme;
  includeTestData: boolean;
  /** Module abbreviation used in IDs (TC_<ABBR>_001); empty = derived from the module name. */
  idPrefix: string;
};

/** Everything the prompt builder and checklist need. */
export type TcInput = {
  requirement: string;
  /** Raw OpenAPI / Swagger / cURL text, if pasted. */
  apiSpec: string;
  apiForm: ApiForm;
  context: Context;
  types: string[];
  options: TcOptions;
};

export type TestTypeDef = { id: string; label: string; group: "Functional" | "Non-Functional" | "API" };

export const TEST_TYPES: TestTypeDef[] = [
  { id: "positive", label: "Positive (happy path)", group: "Functional" },
  { id: "negative", label: "Negative", group: "Functional" },
  { id: "boundary", label: "Boundary value analysis", group: "Functional" },
  { id: "equivalence", label: "Equivalence partitioning", group: "Functional" },
  { id: "edge", label: "Edge cases", group: "Functional" },
  { id: "validation", label: "Field validation (UI)", group: "Functional" },
  { id: "roles", label: "Role / permission based", group: "Functional" },
  { id: "workflow", label: "Workflow / end-to-end", group: "Functional" },
  { id: "regression", label: "Regression impact", group: "Functional" },
  { id: "performance", label: "Performance", group: "Non-Functional" },
  { id: "security", label: "Security", group: "Non-Functional" },
  { id: "usability", label: "Usability / UX", group: "Non-Functional" },
  { id: "accessibility", label: "Accessibility (WCAG 2.2 AA)", group: "Non-Functional" },
  { id: "compatibility", label: "Compatibility", group: "Non-Functional" },
  { id: "reliability", label: "Reliability / recovery", group: "Non-Functional" },
  { id: "localisation", label: "Localisation", group: "Non-Functional" },
  { id: "status-codes", label: "Status codes", group: "API" },
  { id: "request-validation", label: "Request validation", group: "API" },
  { id: "response-schema", label: "Response schema validation", group: "API" },
  { id: "api-auth", label: "Authentication / authorisation", group: "API" },
  { id: "headers", label: "Headers", group: "API" },
  { id: "pagination", label: "Pagination, filtering, sorting", group: "API" },
  { id: "idempotency", label: "Idempotency and concurrency", group: "API" },
  { id: "rate-limit", label: "Rate limiting", group: "API" },
  { id: "error-contract", label: "Error message contract", group: "API" },
  { id: "contract", label: "Contract / backward compatibility", group: "API" },
];

export const TYPE_BY_ID = new Map(TEST_TYPES.map((t) => [t.id, t]));
export const TYPE_GROUPS = ["Functional", "Non-Functional", "API"] as const;
export const ALL_TYPES = TEST_TYPES.map((t) => t.id);

export const TYPE_PRESETS: { id: string; label: string; types: string[] }[] = [
  { id: "smoke", label: "Smoke", types: ["positive", "negative", "workflow"] },
  { id: "functional", label: "Full functional", types: TEST_TYPES.filter((t) => t.group === "Functional").map((t) => t.id) },
  { id: "api", label: "API complete", types: TEST_TYPES.filter((t) => t.group === "API").map((t) => t.id) },
  { id: "everything", label: "Everything", types: ALL_TYPES },
];

export const DEPTHS: { value: Depth; label: string; target: string; min: number; max: number }[] = [
  { value: "quick", label: "Quick", target: "12–18", min: 12, max: 18 },
  { value: "standard", label: "Standard", target: "30–45", min: 30, max: 45 },
  { value: "exhaustive", label: "Exhaustive", target: "60–90", min: 60, max: 90 },
];

const LEVEL: Record<Priority, string> = { P1: "Critical", P2: "High", P3: "Medium", P4: "Low" };

export function priorityLabel(p: Priority, scheme: PriorityScheme): string {
  if (scheme === "p0") return `P${Number(p[1]) - 1}`;
  if (scheme === "hml") return p === "P1" || p === "P2" ? "High" : p === "P3" ? "Medium" : "Low";
  return `${p} - ${LEVEL[p]}`;
}

/** All labels for a scheme, in order (for the prompt and filters). */
export const priorityLabels = (scheme: PriorityScheme) => PRIORITIES.map((p) => priorityLabel(p, scheme));

const STOP = new Set(["a", "an", "the", "of", "for", "to", "and", "or", "with", "by", "in", "on", "at", "from", "via", "your", "my"]);

/** "Resume Upload" → RU, "Payment" → PAY, "Pay an invoice" → PI. */
export function derivePrefix(moduleName: string): string {
  const words = (moduleName.toUpperCase().match(/[A-Z0-9]+/g) ?? []).filter((w) => !STOP.has(w.toLowerCase()));
  if (!words.length) return "TC";
  if (words.length === 1) return words[0].slice(0, 3);
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("");
}

export const caseId = (prefix: string, n: number) => `TC_${prefix || "TC"}_${String(n).padStart(3, "0")}`;

let keyCounter = 0;
export const newKey = () => `c${Date.now().toString(36)}${(keyCounter++).toString(36)}`;

export function blankCase(prefix: string, n: number): TestCase {
  return {
    key: newKey(),
    id: caseId(prefix, n),
    title: "Verify ",
    category: "Functional",
    type: "Positive",
    priority: "P3",
    automationCandidate: false,
    preconditions: "",
    steps: [],
    testData: "",
    expectedResult: "",
    gherkin: null,
    requirementRef: "",
    api: null,
  };
}

export const emptyContext = (): Context => ({
  moduleName: "",
  appType: "Web",
  platforms: "",
  roles: "",
  rules: "",
  outOfScope: "",
  navigation: "",
  elements: "",
  environment: "",
  messages: "",
});

export function defaultInput(): TcInput {
  return {
    requirement: "",
    apiSpec: "",
    apiForm: { method: "GET", endpoint: "", requestBody: "", responseSample: "", auth: "none", notes: "" },
    context: emptyContext(),
    types: [...ALL_TYPES],
    options: { depth: "standard", format: "steps", priorityScheme: "standard", includeTestData: true, idPrefix: "" },
  };
}

/** Numbered lines: ["a", "b"] → "1. a\n2. b". */
export const numbered = (lines: string[]) => lines.map((l, i) => `${i + 1}. ${l}`).join("\n");

/** Lines of a numbered / multi-line text field. */
export const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
