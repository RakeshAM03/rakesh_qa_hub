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

export type SessionTemplateConfig = {
  name: string;
  focusAreas: FocusArea[];
  steps: number[];
  /** Custom (saved) templates may also carry these. */
  context?: string | null;
  specRef?: string | null;
};

/** Built-in templates. Mappings are a sensible default; edit freely. */
export const BUILT_IN_TEMPLATES: SessionTemplateConfig[] = [
  { name: "Full Session", focusAreas: [...FOCUS_AREAS], steps: ALL_STEP_IDS },
  { name: "API Only", focusAreas: ["Contract Testing", "Regression"], steps: [1, 2, 3, 7, 8, 9, 10] },
  { name: "UI Regression", focusAreas: ["UI / UX", "Regression"], steps: [1, 2, 4, 5, 6, 7, 8, 10] },
  { name: "Security", focusAreas: ["Security"], steps: [1, 2, 3, 6, 7, 8, 10] },
];
