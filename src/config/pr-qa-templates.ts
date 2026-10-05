export const FOCUS_AREAS = [
  "Contract Testing",
  "UI / UX",
  "Security",
  "Performance",
  "Regression",
] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

export const SESSION_STEPS = [
  { id: 1, name: "Analyse the PR" },
  { id: 2, name: "Test Plan" },
  { id: 3, name: "Feature Validation" },
  { id: 4, name: "UI Validation" },
  { id: 5, name: "UX Validation" },
  { id: 6, name: "Exploratory" },
  { id: 7, name: "Report" },
  { id: 8, name: "Defect Consolidation" },
  { id: 9, name: "Automation Generation" },
  { id: 10, name: "Session Closure Checklist" },
] as const;
export const ALL_STEP_IDS = SESSION_STEPS.map((s) => s.id);

/**
 * How a template shapes step CONTENT (not just which steps run):
 * full = everything; api = backend + contract, API test cases, Category D;
 * ui = frontend + impact radius, UI/UX/exploratory, Categories A + C;
 * security = full, with the Security focus forced on and exploratory weighted to security.
 */
export type TemplateMode = "full" | "api" | "ui" | "security";

/** Login METHOD only — the prompt never carries usernames, passwords, OTPs or tokens. */
export const LOGIN_METHODS = [
  { value: "sso", label: "SSO" },
  { value: "email-password", label: "Email + password" },
  { value: "magic-link", label: "Magic link" },
  { value: "other", label: "Other" },
] as const;
export type LoginMethod = "" | (typeof LOGIN_METHODS)[number]["value"];

export const DEFAULT_SPEC_FOLDERS = "tests/regression/, tests/feature/";

export type SessionTemplateConfig = {
  name: string;
  focusAreas: FocusArea[];
  steps: number[];
  mode?: TemplateMode;
  /** Custom (saved) templates may also carry these. */
  context?: string | null;
  specRef?: string | null;
  loginUrl?: string | null;
  loginMethod?: string | null;
  specFolders?: string | null;
};

/** Built-in templates. */
export const BUILT_IN_TEMPLATES: SessionTemplateConfig[] = [
  { name: "Full Session", focusAreas: [...FOCUS_AREAS], steps: ALL_STEP_IDS, mode: "full" },
  { name: "API Only", focusAreas: ["Contract Testing", "Regression"], steps: [1, 2, 3, 7, 8, 9, 10], mode: "api" },
  { name: "UI Regression", focusAreas: ["UI / UX", "Regression"], steps: [1, 2, 4, 5, 6, 7, 9, 10], mode: "ui" },
  { name: "Security", focusAreas: ["Security"], steps: ALL_STEP_IDS, mode: "security" },
];
