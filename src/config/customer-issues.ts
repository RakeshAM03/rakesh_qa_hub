/**
 * Customer Issue RCA — default classification lists (generic process content, no names of any
 * customer, company or product). Inserted once by the `customer_issues` migration and re-inserted
 * by the E2E global setup; everything stays editable in Settings → Lists. IDs are stable so the
 * migration and tests agree. Products are user-managed and not seeded.
 */

export type ListKind =
  | "PRODUCT"
  | "DISPOSITION"
  | "RCA_CATEGORY"
  | "RCA_SUBCATEGORY"
  | "CAUGHT_AT"
  | "WHY_ESCAPED"
  | "DETECTED_BY"
  | "SCOPE"
  | "IMPACT"
  | "OWNER_TEAM";

export type CatchableValue = "YES" | "NO" | "PARTIAL";

export type DefaultListItem = {
  id: string;
  list: ListKind;
  key?: string;
  name: string;
  description?: string;
  parentId?: string;
  defaultCatchable?: CatchableValue;
  defaultOwnerId?: string;
  sortOrder: number;
};

/** Internal keys the logic relies on (names stay editable). */
export const KEYS = {
  VALID_BUG: "VALID_BUG",
  DUPLICATE: "DUPLICATE",
  KNOWN_ISSUE: "KNOWN_ISSUE",
  NOT_A_BUG: "NOT_A_BUG",
  CANT_REPRODUCE: "CANT_REPRODUCE",
  USER_ERROR: "USER_ERROR",
  OTHERS: "OTHERS",
  CUSTOMER: "CUSTOMER",
} as const;

export const LIST_LABELS: Record<ListKind, string> = {
  PRODUCT: "Products",
  DISPOSITION: "Dispositions",
  RCA_CATEGORY: "RCA categories",
  RCA_SUBCATEGORY: "RCA sub-categories",
  CAUGHT_AT: "Should have been caught at",
  WHY_ESCAPED: "Why it escaped",
  DETECTED_BY: "Detected by",
  SCOPE: "Scope",
  IMPACT: "Customer impact",
  OWNER_TEAM: "Owner teams",
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const OWNERS = ["QA", "Dev", "DevOps", "PO / BA", "Design", "Support", "QA + PM", "Dev + DevOps", "Dev + Support", "Dev + QA", "Design + QA"];
const ownerId = (name: string) => `ci_owner_${slug(name)}`;

const DISPOSITIONS: [key: string, name: string, description: string][] = [
  [KEYS.VALID_BUG, "Valid Bug", "Real defect — RCA required."],
  [KEYS.DUPLICATE, "Duplicate", "Same as another issue — link the issue key."],
  [KEYS.KNOWN_ISSUE, "Known Issue", "Already reported or accepted — link the issue key."],
  [KEYS.NOT_A_BUG, "Not a Bug / Works as Designed", "Expected behaviour — add a note."],
  [KEYS.CANT_REPRODUCE, "Can't Reproduce", "Could not be confirmed — add a note."],
  [KEYS.USER_ERROR, "User Error / Training", "Customer misuse; may need a docs or UX change — add a note."],
];

const CATEGORIES: [name: string, definition: string, catchable: CatchableValue | undefined, owner: string | undefined, subs: string[], key?: string][] = [
  ["QA Miss", "A test existed or was in scope, but QA didn't catch it.", "YES", "QA", ["Test case missing", "Test case existed but not executed", "Edge case not covered", "Wrong/insufficient test data", "Negative scenario missed", "Cross-browser/device not tested", "Regression not run on impacted area"]],
  ["QA Skip", "Testing was knowingly skipped or reduced.", "YES", "QA + PM", ["Time pressure", "Hotfix without full QA", "Descoped by decision", "Environment/build not available for testing"]],
  ["Code Defect", "Logic bug in new or changed code.", "YES", "Dev", ["Logic error", "Missing null/validation check", "Error handling missing", "Performance/timeout in code", "Concurrency/race condition", "Backward-compatibility break"]],
  ["Code Sync / Release", "Merge, branch or release packaging problem.", "PARTIAL", "Dev + DevOps", ["Fix missing from release branch", "Merge conflict overwrote a change", "Wrong build deployed", "Feature flag misconfigured"]],
  ["Config / Data", "Configuration or data caused the issue.", "PARTIAL", "Dev + Support", ["Shared config affected another client", "Client-specific setting wrong", "Data migration issue", "Bad/duplicate data in production", "Default values changed"]],
  ["Infra / Deployment", "Servers, deployment, caching, networking.", "NO", "DevOps", ["Static asset/cache issue", "Server/DB down or slow", "CDN/DNS", "Scaling/load", "Deployment script failure", "Third-party outage"]],
  ["Integration / Third-party", "External system behaviour.", "PARTIAL", "Dev + QA", ["Partner API behaviour changed", "Partner returned unexpected/empty data", "Auth/token expiry", "Rate limit from partner", "Webhook/sync failure"]],
  ["Requirement Gap", "Requirement missing or unclear; built as specified but wrong for the customer.", "NO", "PO / BA", ["Requirement missing", "Ambiguous acceptance criteria", "Client-specific need not captured", "Change request not communicated"]],
  ["Design / UX", "Design or usability problem.", "PARTIAL", "Design + QA", ["Confusing flow", "Missing validation message", "Accessibility issue"]],
  ["Security", "Security weakness.", "YES", "Dev + QA", ["Access/permission leak", "Data exposure", "Injection/XSS"]],
  ["Others", "Only when nothing else fits — a comment explaining why is required.", undefined, undefined, [], KEYS.OTHERS],
];

const CAUGHT_AT: [string, string][] = [
  ["Requirement review", "e.g. ambiguous acceptance criteria"],
  ["Design review", "e.g. missing validation in the design"],
  ["Code review / unit tests", "e.g. missing null-check"],
  ["QA functional testing", "e.g. edge case not tested"],
  ["Regression testing", "e.g. impacted area not re-tested"],
  ["UAT", "e.g. client-specific flow"],
  ["Deployment / release checklist", "e.g. wrong build, cache not cleared"],
  ["Monitoring / alerting", "e.g. production errors not alerted"],
  ["Not catchable before release", "e.g. genuine third-party outage"],
];

const simple = (list: ListKind, prefix: string, names: string[], keys: Record<string, string> = {}): DefaultListItem[] =>
  names.map((name, i) => ({ id: `ci_${prefix}_${slug(name)}`, list, name, sortOrder: i, ...(keys[name] ? { key: keys[name] } : {}) }));

export const DEFAULT_LISTS: DefaultListItem[] = [
  ...OWNERS.map((name, i): DefaultListItem => ({ id: ownerId(name), list: "OWNER_TEAM", name, sortOrder: i })),
  ...DISPOSITIONS.map(([key, name, description], i): DefaultListItem => ({ id: `ci_disp_${key.toLowerCase()}`, list: "DISPOSITION", key, name, description, sortOrder: i })),
  ...CATEGORIES.flatMap(([name, description, catchable, owner, subs, key], i): DefaultListItem[] => {
    const id = `ci_cat_${slug(name)}`;
    return [
      { id, list: "RCA_CATEGORY", name, description, sortOrder: i, ...(key ? { key } : {}), ...(catchable ? { defaultCatchable: catchable } : {}), ...(owner ? { defaultOwnerId: ownerId(owner) } : {}) },
      ...subs.map((sub, j): DefaultListItem => ({ id: `${id}__${slug(sub)}`, list: "RCA_SUBCATEGORY", name: sub, parentId: id, sortOrder: j })),
    ];
  }),
  ...CAUGHT_AT.map(([name, description], i): DefaultListItem => ({ id: `ci_stage_${slug(name)}`, list: "CAUGHT_AT", name, description, sortOrder: i })),
  ...simple("WHY_ESCAPED", "why", ["Missing test case", "Missing test data", "Environment gap", "Not in scope", "Time pressure", "Not reproducible pre-release", "Other"]),
  ...simple("DETECTED_BY", "detected", ["Customer", "Support", "Monitoring", "Internal team"], { Customer: KEYS.CUSTOMER }),
  ...simple("SCOPE", "scope", ["Single client", "Multiple clients", "All clients"]),
  ...simple("IMPACT", "impact", ["Blocker", "Major", "Minor", "Cosmetic"]),
];

export const SEVERITIES = ["P1 - Critical", "P2 - High", "P3 - Medium", "P4 - Low"] as const;
export const ISSUE_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "FIXED", label: "Fixed" },
  { value: "CLOSED", label: "Closed" },
] as const;
export const CATCHABLE_LABELS: Record<CatchableValue, string> = { YES: "Yes", NO: "No", PARTIAL: "Partially" };
export const PREVENTION_LABELS = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", DONE: "Done" } as const;
export const AUTOMATION_LABELS = { NO: "No", PLANNED: "Planned", YES: "Yes" } as const;
export const RUN_RESULT_LABELS = { PENDING: "Pending", PASS: "Pass", FAIL: "Fail", BLOCKED: "Blocked", NA: "N/A" } as const;
export const RUN_STATUS_LABELS = { IN_PROGRESS: "In progress", BLOCKED: "Blocked", COMPLETE: "Complete" } as const;

/** The gate added to the Standard release template and offered in the gate editor. */
export const REGRESSION_GATE = { title: "Customer issue regression pack passed", type: "CUSTOMER_REGRESSION", isBlocker: true, weight: 1 } as const;
