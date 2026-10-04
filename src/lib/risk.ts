/**
 * Risk-Based Test Planner: likelihood, impact, score, level, depth, hour
 * allocation, suggestions and exports. Pure functions.
 */

export type ChangeSize = "NONE" | "SMALL" | "MEDIUM" | "LARGE" | "NEW_FEATURE";
export type Level = "Critical" | "High" | "Medium" | "Low";
export const LEVELS: Level[] = ["Critical", "High", "Medium", "Low"];

export type AreaInput = {
  id: string;
  name: string;
  featurePageId?: string | null;
  changeSize: ChangeSize;
  complexity: number;
  defectHistory: number;
  dependencies: number;
  businessImpact: number;
  usageFrequency: number;
  depthOverride?: string | null;
  hoursOverride?: number | null;
  deferred?: boolean;
  deferReason?: string | null;
  sortOrder?: number;
};

export type Settings = {
  changeSizeScores: Record<ChangeSize, number>;
  likelihoodWeights: { changeSize: number; complexity: number; defectHistory: number; dependencies: number };
  impactWeights: { businessImpact: number; usageFrequency: number };
  thresholds: { critical: number; high: number; medium: number };
  depth: Record<Level, string>;
  minHours: number;
  roundTo: number;
};

export const DEFAULT_SETTINGS: Settings = {
  changeSizeScores: { NONE: 1, SMALL: 2, MEDIUM: 3, LARGE: 4, NEW_FEATURE: 5 },
  likelihoodWeights: { changeSize: 30, complexity: 25, defectHistory: 30, dependencies: 15 },
  impactWeights: { businessImpact: 70, usageFrequency: 30 },
  thresholds: { critical: 16, high: 10, medium: 5 },
  depth: {
    Critical: "Full: functional, negative, edge, integration, regression, exploratory",
    High: "Thorough: functional, negative, key edge cases, regression",
    Medium: "Standard: happy path, main negatives, smoke regression",
    Low: "Light: smoke / sanity only",
  },
  minHours: 0.5,
  roundTo: 0.5,
};

/** Plan settings over the defaults (missing or malformed keys fall back). */
export function mergeSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
  const d = DEFAULT_SETTINGS;
  return {
    changeSizeScores: Object.fromEntries(Object.entries(d.changeSizeScores).map(([k, v]) => [k, num(s.changeSizeScores?.[k as ChangeSize], v)])) as Settings["changeSizeScores"],
    likelihoodWeights: {
      changeSize: num(s.likelihoodWeights?.changeSize, d.likelihoodWeights.changeSize),
      complexity: num(s.likelihoodWeights?.complexity, d.likelihoodWeights.complexity),
      defectHistory: num(s.likelihoodWeights?.defectHistory, d.likelihoodWeights.defectHistory),
      dependencies: num(s.likelihoodWeights?.dependencies, d.likelihoodWeights.dependencies),
    },
    impactWeights: {
      businessImpact: num(s.impactWeights?.businessImpact, d.impactWeights.businessImpact),
      usageFrequency: num(s.impactWeights?.usageFrequency, d.impactWeights.usageFrequency),
    },
    thresholds: {
      critical: num(s.thresholds?.critical, d.thresholds.critical),
      high: num(s.thresholds?.high, d.thresholds.high),
      medium: num(s.thresholds?.medium, d.thresholds.medium),
    },
    depth: {
      Critical: typeof s.depth?.Critical === "string" && s.depth.Critical ? s.depth.Critical : d.depth.Critical,
      High: typeof s.depth?.High === "string" && s.depth.High ? s.depth.High : d.depth.High,
      Medium: typeof s.depth?.Medium === "string" && s.depth.Medium ? s.depth.Medium : d.depth.Medium,
      Low: typeof s.depth?.Low === "string" && s.depth.Low ? s.depth.Low : d.depth.Low,
    },
    minHours: num(s.minHours, d.minHours),
    roundTo: num(s.roundTo, d.roundTo) || d.roundTo,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp15 = (n: number) => Math.min(5, Math.max(1, n));

function weighted(pairs: [number, number][]) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  if (!total) return 1;
  return pairs.reduce((s, [v, w]) => s + v * w, 0) / total;
}

/** Likelihood 1–5: change size 30%, complexity 25%, defect history 30%, dependencies 15%. */
export function likelihood(a: AreaInput, s: Settings = DEFAULT_SETTINGS) {
  const w = s.likelihoodWeights;
  return round1(
    clamp15(
      weighted([
        [s.changeSizeScores[a.changeSize] ?? 3, w.changeSize],
        [a.complexity, w.complexity],
        [a.defectHistory, w.defectHistory],
        [a.dependencies, w.dependencies],
      ]),
    ),
  );
}

/** Impact 1–5: business impact 70%, usage frequency 30%. */
export function impact(a: AreaInput, s: Settings = DEFAULT_SETTINGS) {
  const w = s.impactWeights;
  return round1(clamp15(weighted([[a.businessImpact, w.businessImpact], [a.usageFrequency, w.usageFrequency]])));
}

/** Score = likelihood × impact (1–25). */
export const riskScore = (a: AreaInput, s: Settings = DEFAULT_SETTINGS) => round1(likelihood(a, s) * impact(a, s));

export function riskLevel(score: number, s: Settings = DEFAULT_SETTINGS): Level {
  if (score >= s.thresholds.critical) return "Critical";
  if (score >= s.thresholds.high) return "High";
  if (score >= s.thresholds.medium) return "Medium";
  return "Low";
}

const roundToStep = (n: number, step: number) => Math.round(n / step) * step;

/**
 * Splits available hours across non-deferred areas in proportion to risk score.
 * Overrides are kept as-is and the rest is redistributed; every other area gets
 * at least the minimum; results are rounded to the step (0.5 h) using largest
 * remainders so the total matches what was available.
 */
export function allocateHours(areas: AreaInput[], available: number, s: Settings = DEFAULT_SETTINGS): Map<string, number> {
  const out = new Map<string, number>();
  const active = areas.filter((a) => !a.deferred);
  const step = s.roundTo;
  let remaining = Math.max(0, available);
  const pool: { id: string; score: number }[] = [];
  for (const a of active) {
    if (a.hoursOverride !== null && a.hoursOverride !== undefined) {
      out.set(a.id, a.hoursOverride);
      remaining -= a.hoursOverride;
    } else pool.push({ id: a.id, score: riskScore(a, s) });
  }
  remaining = Math.max(0, remaining);
  if (!pool.length) return out;

  // Proportional shares with a floor: areas below the minimum get the minimum, then re-share the rest.
  const share = new Map<string, number>();
  let open = [...pool];
  let budget = remaining;
  for (;;) {
    const total = open.reduce((n, p) => n + p.score, 0);
    const low = open.filter((p) => (total ? (budget * p.score) / total : budget / open.length) < s.minHours);
    if (!low.length) {
      for (const p of open) share.set(p.id, total ? (budget * p.score) / total : budget / open.length);
      break;
    }
    for (const p of low) {
      share.set(p.id, s.minHours);
      budget -= s.minHours;
    }
    open = open.filter((p) => !low.includes(p));
    if (!open.length || budget <= 0) {
      for (const p of open) share.set(p.id, s.minHours);
      break;
    }
  }

  // Round to the step with largest remainders, keeping the pool's total when it fits.
  const target = Math.max(roundToStep(remaining, step), pool.length * s.minHours);
  const units = pool.map((p) => ({ id: p.id, exact: share.get(p.id)! / step }));
  const floors = units.map((u) => ({ ...u, n: Math.max(Math.floor(u.exact + 1e-9), Math.ceil(s.minHours / step - 1e-9)) }));
  let left = Math.round(target / step) - floors.reduce((n, u) => n + u.n, 0);
  for (const u of [...floors].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))) {
    if (left <= 0) break;
    u.n++;
    left--;
  }
  for (const u of floors) out.set(u.id, round1(u.n * step));
  return out;
}

export type ComputedArea = AreaInput & {
  likelihood: number;
  impact: number;
  score: number;
  level: Level;
  depth: string;
  hours: number;
  testTypes: string[];
};

const TEST_TYPES: Record<Level, string[]> = {
  Critical: ["functional", "negative", "edge", "integration", "regression", "exploratory"],
  High: ["functional", "negative", "edge", "regression"],
  Medium: ["happy path", "negative", "smoke"],
  Low: ["smoke"],
};

/** Every area with its computed values (deferred areas get 0 hours). */
export function computeAreas(areas: AreaInput[], available: number, s: Settings = DEFAULT_SETTINGS): ComputedArea[] {
  const hours = allocateHours(areas, available, s);
  return areas.map((a) => {
    const l = likelihood(a, s);
    const i = impact(a, s);
    const score = round1(l * i);
    const level = riskLevel(score, s);
    return { ...a, likelihood: l, impact: i, score, level, depth: a.depthOverride || s.depth[level], hours: a.deferred ? 0 : (hours.get(a.id) ?? 0), testTypes: TEST_TYPES[level] };
  });
}

/** Prioritised plan: Critical first, then by score; deferred areas listed separately. */
export function prioritise(areas: ComputedArea[]) {
  const sorted = [...areas].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || b.score - a.score || a.name.localeCompare(b.name));
  return { active: sorted.filter((a) => !a.deferred), deferred: sorted.filter((a) => a.deferred) };
}

/** Matrix cell (1–5 each) for an area. */
export const matrixCell = (a: { likelihood: number; impact: number }) => ({ x: clamp15(Math.round(a.impact)), y: clamp15(Math.round(a.likelihood)) });

// ---------------------------------------------------------------- suggestions

export type IssueLite = { severity: "P0" | "P1" | "P2" | "P3"; isValid: boolean; createdAt: string | Date };

/** Defect history (1–5) from a feature page's issues in the last 90 days; P0/P1 count double. */
export function suggestDefectHistory(issues: IssueLite[], now = Date.now()): { value: number; reason: string } {
  const since = now - 90 * 86_400_000;
  const recent = issues.filter((i) => new Date(i.createdAt).getTime() >= since);
  const valid = recent.filter((i) => i.isValid);
  const severe = valid.filter((i) => i.severity === "P0" || i.severity === "P1").length;
  const weighted = valid.length + severe;
  const value = weighted === 0 ? 1 : weighted <= 3 ? 2 : weighted <= 8 ? 3 : weighted <= 15 ? 4 : 5;
  const validPct = recent.length ? Math.round((valid.length / recent.length) * 100) : null;
  const reason =
    `${recent.length} issue${recent.length === 1 ? "" : "s"} in the last 90 days` +
    (validPct !== null ? ` (${validPct}% valid${severe ? `, ${severe} P0/P1 counted twice` : ""})` : "") +
    ` → weighted ${weighted}`;
  return { value, reason };
}

/** +1 complexity when the plan's linked repos had P0/P1 review flags in the last 30 days. */
export function suggestComplexityBump(current: number, flagCount: number): { value: number; reason: string } | null {
  if (!flagCount) return null;
  return { value: Math.min(5, current + 1), reason: `${flagCount} P0/P1 AI PR Review flag${flagCount === 1 ? "" : "s"} in the last 30 days on the plan's repos` };
}

// ---------------------------------------------------------------- help text

export const FACTOR_HELP: Record<"complexity" | "defectHistory" | "dependencies" | "businessImpact" | "usageFrequency", { label: string; levels: [string, string, string, string, string] }> = {
  complexity: { label: "Complexity", levels: ["Trivial change", "Simple logic", "Moderate logic or several screens", "Complex rules or state", "Very complex, many paths"] },
  defectHistory: { label: "Defect history", levels: ["No recent bugs", "A few minor bugs", "Regular bugs", "Frequent bugs", "Bug hotspot"] },
  dependencies: { label: "Dependencies / integrations", levels: ["Self-contained", "One internal dependency", "Several internal dependencies", "External APIs or services", "Many external integrations"] },
  businessImpact: { label: "Business impact", levels: ["Cosmetic", "Minor inconvenience", "Feature degraded, workaround exists", "Key flow broken for some users", "Revenue loss, data loss or legal risk"] },
  usageFrequency: { label: "Usage frequency", levels: ["Rarely used", "Used by a few users", "Used regularly", "Used by most users", "Used by nearly everyone, constantly"] },
};

export const CHANGE_SIZE_LABELS: Record<ChangeSize, string> = { NONE: "None", SMALL: "Small", MEDIUM: "Medium", LARGE: "Large", NEW_FEATURE: "New feature" };

// ---------------------------------------------------------------- PR QA Session hand-off

/** Focus areas for PR QA Session from an area's strongest risk factors [inferred mapping]. */
export function focusAreasFor(a: ComputedArea): string[] {
  const out = new Set<string>();
  if (a.dependencies >= 4) out.add("Contract Testing");
  if (a.changeSize === "LARGE" || a.changeSize === "NEW_FEATURE" || a.complexity >= 4) out.add("UI / UX");
  if (a.businessImpact >= 5) out.add("Security");
  if (a.usageFrequency >= 4) out.add("Performance");
  if (a.defectHistory >= 4 || a.level === "Critical" || a.level === "High") out.add("Regression");
  if (!out.size) out.add("Regression");
  return [...out];
}

export function prQaContext(a: ComputedArea) {
  const factors = (
    [
      ["complexity", a.complexity],
      ["defect history", a.defectHistory],
      ["dependencies", a.dependencies],
      ["business impact", a.businessImpact],
      ["usage frequency", a.usageFrequency],
    ] as [string, number][]
  )
    .filter(([, v]) => v >= 4)
    .map(([k, v]) => `${k} ${v}/5`);
  const focus = a.level === "Critical" || a.level === "High" ? "negative and edge cases" : a.level === "Medium" ? "the happy path and main negatives" : "a quick smoke check";
  return [
    `Risk level: ${a.level} (score ${a.score}, likelihood ${a.likelihood}, impact ${a.impact}). Focus: ${focus} for ${a.name}.`,
    factors.length ? `Top risk factors: ${factors.join(", ")}.` : "",
    `Suggested depth: ${a.depth}. Time box: ${a.hours} h.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------- exports

const fmtH = (n: number) => `${n} h`;

export function planMarkdown(plan: { name: string; availableHours: number }, areas: ComputedArea[]) {
  const { active, deferred } = prioritise(areas);
  const allocated = active.reduce((n, a) => n + a.hours, 0);
  const lines = [
    `### Test plan — ${plan.name}`,
    `Allocated ${fmtH(round1(allocated))} of ${fmtH(plan.availableHours)} available.`,
    "",
    "| # | Area | Risk | Score | Depth | Hours |",
    "|---|---|---|---|---|---|",
    ...active.map((a, i) => `| ${i + 1} | ${a.name.replace(/\|/g, "\\|")} | ${a.level} | ${a.score} | ${a.depth.replace(/\|/g, "\\|")} | ${a.hours} |`),
  ];
  if (deferred.length) {
    lines.push("", "**Accepted risks (deferred):**", ...deferred.map((a) => `- ${a.name} (${a.level}, score ${a.score}) — ${a.deferReason || "no reason given"}`));
  }
  return lines.join("\n");
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
};

export function planCsv(areas: ComputedArea[]) {
  const { active, deferred } = prioritise(areas);
  const header = ["Rank", "Area", "Change size", "Complexity", "Defect history", "Dependencies", "Business impact", "Usage frequency", "Likelihood", "Impact", "Score", "Level", "Test depth", "Hours", "Deferred", "Defer reason"];
  const rows = [...active, ...deferred].map((a, i) => [
    a.deferred ? "" : i + 1,
    a.name,
    CHANGE_SIZE_LABELS[a.changeSize],
    a.complexity,
    a.defectHistory,
    a.dependencies,
    a.businessImpact,
    a.usageFrequency,
    a.likelihood,
    a.impact,
    a.score,
    a.level,
    a.depth,
    a.hours,
    a.deferred ? "yes" : "no",
    a.deferReason ?? "",
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
