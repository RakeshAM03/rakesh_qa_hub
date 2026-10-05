/** Test Case Generator types and the test-type catalogue (pure; shared by client and server). */

export type Category = "Functional" | "Non-Functional" | "API";
export type Priority = "P0" | "P1" | "P2" | "P3";
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
  type: string;
  /** Always stored as P0–P3; shown as High/Medium/Low when that scheme is chosen. */
  priority: Priority;
  preconditions: string;
  testData: string;
  steps: string[];
  expectedResult: string;
  gherkin: string | null;
  requirementRef: string;
  automationCandidate: boolean;
  api: ApiDetails | null;
  /** Generic checklist case that needs a human review. */
  template?: boolean;
};

export type GenerationResult = {
  summary: string;
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

export type InputTab = "requirement" | "api";

export type Context = {
  moduleName: string;
  appType: "Web" | "Mobile" | "API" | "Desktop";
  platforms: string;
  roles: string;
  rules: string;
  outOfScope: string;
};

export type Depth = "quick" | "standard" | "exhaustive";
export type OutputFormat = "steps" | "gherkin" | "both";
export type PriorityScheme = "p" | "hml";

export type TcOptions = {
  depth: Depth;
  format: OutputFormat;
  priorityScheme: PriorityScheme;
  includeTestData: boolean;
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

export type TestTypeDef = { id: string; label: string; category: Category };

export const TEST_TYPES: TestTypeDef[] = [
  { id: "positive", label: "Positive (happy path)", category: "Functional" },
  { id: "negative", label: "Negative", category: "Functional" },
  { id: "boundary", label: "Boundary value analysis", category: "Functional" },
  { id: "equivalence", label: "Equivalence partitioning", category: "Functional" },
  { id: "edge", label: "Edge cases", category: "Functional" },
  { id: "validation", label: "Field validation (UI)", category: "Functional" },
  { id: "roles", label: "Role / permission based", category: "Functional" },
  { id: "workflow", label: "Workflow / end-to-end", category: "Functional" },
  { id: "regression", label: "Regression impact", category: "Functional" },
  { id: "performance", label: "Performance", category: "Non-Functional" },
  { id: "security", label: "Security", category: "Non-Functional" },
  { id: "usability", label: "Usability / UX", category: "Non-Functional" },
  { id: "accessibility", label: "Accessibility (WCAG 2.2 AA)", category: "Non-Functional" },
  { id: "compatibility", label: "Compatibility", category: "Non-Functional" },
  { id: "reliability", label: "Reliability / recovery", category: "Non-Functional" },
  { id: "localisation", label: "Localisation", category: "Non-Functional" },
  { id: "status-codes", label: "Status codes", category: "API" },
  { id: "request-validation", label: "Request validation", category: "API" },
  { id: "response-schema", label: "Response schema validation", category: "API" },
  { id: "api-auth", label: "Authentication / authorisation", category: "API" },
  { id: "headers", label: "Headers", category: "API" },
  { id: "pagination", label: "Pagination, filtering, sorting", category: "API" },
  { id: "idempotency", label: "Idempotency and concurrency", category: "API" },
  { id: "rate-limit", label: "Rate limiting", category: "API" },
  { id: "error-contract", label: "Error message contract", category: "API" },
  { id: "contract", label: "Contract / backward compatibility", category: "API" },
];

export const TYPE_BY_ID = new Map(TEST_TYPES.map((t) => [t.id, t]));
export const CATEGORIES: Category[] = ["Functional", "Non-Functional", "API"];

export const TYPE_PRESETS: { id: string; label: string; types: string[] }[] = [
  { id: "smoke", label: "Smoke", types: ["positive", "negative", "workflow"] },
  { id: "functional", label: "Full functional", types: TEST_TYPES.filter((t) => t.category === "Functional").map((t) => t.id) },
  { id: "api", label: "API complete", types: TEST_TYPES.filter((t) => t.category === "API").map((t) => t.id) },
  { id: "everything", label: "Everything", types: TEST_TYPES.map((t) => t.id) },
];

export const DEPTHS: { value: Depth; label: string; target: string }[] = [
  { value: "quick", label: "Quick", target: "about 10–15" },
  { value: "standard", label: "Standard", target: "about 25–40" },
  { value: "exhaustive", label: "Exhaustive", target: "60 or more" },
];

export const PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];
export const HML: Record<Priority, string> = { P0: "High", P1: "High", P2: "Medium", P3: "Low" };

export const priorityLabel = (p: Priority, scheme: PriorityScheme) => (scheme === "hml" ? HML[p] : p);

/** "Checkout payment" → "CHK" style prefix: initials of up to 3 words, else first 3 letters. */
export function derivePrefix(moduleName: string): string {
  const words = moduleName.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  if (!words.length) return "TC";
  if (words.length === 1) return words[0].slice(0, 3);
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("");
}

export const caseId = (prefix: string, n: number) => `TC-${prefix || "TC"}-${String(n).padStart(3, "0")}`;

let keyCounter = 0;
export const newKey = () => `c${Date.now().toString(36)}${(keyCounter++).toString(36)}`;

export function blankCase(prefix: string, n: number): TestCase {
  return {
    key: newKey(),
    id: caseId(prefix, n),
    title: "",
    category: "Functional",
    type: "Positive",
    priority: "P2",
    preconditions: "",
    testData: "",
    steps: [],
    expectedResult: "",
    gherkin: null,
    requirementRef: "",
    automationCandidate: false,
    api: null,
  };
}

export function defaultInput(): TcInput {
  return {
    requirement: "",
    apiSpec: "",
    apiForm: { method: "GET", endpoint: "", requestBody: "", responseSample: "", auth: "none", notes: "" },
    context: { moduleName: "", appType: "Web", platforms: "", roles: "", rules: "", outOfScope: "" },
    types: ["positive", "negative", "boundary", "validation"],
    options: { depth: "standard", format: "steps", priorityScheme: "p", includeTestData: true, idPrefix: "" },
  };
}
