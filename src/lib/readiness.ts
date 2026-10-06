/**
 * Release Readiness: score, verdict, auto-gate rules, snapshot and summary.
 * Pure functions — no database or network access.
 */

export type GateStatus = "PENDING" | "PASS" | "FAIL" | "NA";
export type GateType = "MANUAL" | "CI_GREEN" | "NO_P0" | "NO_P1" | "VALID_RATE" | "NO_P0_FLAGS" | "CUSTOMER_REGRESSION";
export type ReleaseStatus = "PLANNED" | "IN_TESTING" | "GO" | "NO_GO" | "GO_WITH_ISSUES" | "RELEASED";
export type DecisionType = "GO" | "NO_GO" | "GO_WITH_ISSUES";

/** Result of an auto check; status null = "can't check" (gate stays manual). */
export type AutoResult = { status: "PASS" | "FAIL" | null; detail: string; checkedAt?: string };
export type Override = { status: GateStatus; note: string; by: string; at: string };

export type GateLike = {
  id: string;
  section: string;
  title: string;
  type: GateType;
  status: GateStatus;
  isBlocker: boolean;
  weight: number;
  override?: Override | null;
  autoResult?: AutoResult | null;
  config?: Record<string, number> | null;
};

export const GATE_TYPE_LABELS: Record<GateType, string> = {
  MANUAL: "Manual",
  CI_GREEN: "CI suite green",
  NO_P0: "No open P0 bugs",
  NO_P1: "No open P1 bugs",
  VALID_RATE: "Valid-bug rate",
  NO_P0_FLAGS: "No unresolved P0 review flags",
  CUSTOMER_REGRESSION: "Customer issue regression pack passed",
};

export const STATUS_LABELS: Record<ReleaseStatus, string> = {
  PLANNED: "Planned",
  IN_TESTING: "In testing",
  GO: "Go",
  NO_GO: "No-Go",
  GO_WITH_ISSUES: "Go with known issues",
  RELEASED: "Released",
};

export const DECISION_LABELS: Record<DecisionType, string> = { GO: "Go", NO_GO: "No-Go", GO_WITH_ISSUES: "Go with known issues" };

export const DEFAULT_CONFIG: Partial<Record<GateType, Record<string, number>>> = {
  NO_P1: { maxAllowed: 0 },
  VALID_RATE: { threshold: 80 },
  NO_P0_FLAGS: { days: 14 },
};

/** The status that counts: an override, else a successful auto check, else the manual value. */
export function effectiveStatus(g: GateLike): GateStatus {
  if (g.override) return g.override.status;
  if (g.type !== "MANUAL" && g.autoResult?.status) return g.autoResult.status;
  return g.status;
}

/** Blockers count three times their weight [inferred from "default 1, blockers count as 3"]. */
export const effectiveWeight = (g: GateLike) => Math.max(0, g.weight) * (g.isBlocker ? 3 : 1);

export type Verdict = "READY" | "AT_RISK" | "NOT_READY";
export const VERDICT_LABELS: Record<Verdict, string> = { READY: "Ready to go", AT_RISK: "At risk", NOT_READY: "Not ready" };

export type Score = {
  score: number;
  counts: Record<GateStatus, number>;
  total: number;
  blockers: GateLike[];
  pendingBlockers: GateLike[];
  verdict: Verdict;
};

/**
 * Score = weighted share of passed gates among applicable ones (N/A excluded).
 * Verdict: Not ready if any blocker failed or score < 70; At risk if score < 90
 * or a blocker is pending; otherwise Ready to go.
 */
export function scoreRelease(gates: GateLike[]): Score {
  const counts: Record<GateStatus, number> = { PENDING: 0, PASS: 0, FAIL: 0, NA: 0 };
  let applicable = 0;
  let passed = 0;
  const blockers: GateLike[] = [];
  const pendingBlockers: GateLike[] = [];
  for (const g of gates) {
    const s = effectiveStatus(g);
    counts[s]++;
    if (s === "NA") continue;
    const w = effectiveWeight(g);
    applicable += w;
    if (s === "PASS") passed += w;
    if (g.isBlocker && s === "FAIL") blockers.push(g);
    if (g.isBlocker && s === "PENDING") pendingBlockers.push(g);
  }
  const score = applicable ? Math.round((passed / applicable) * 100) : 0;
  const verdict: Verdict = blockers.length || score < 70 ? "NOT_READY" : score < 90 || pendingBlockers.length ? "AT_RISK" : "READY";
  return { score, counts, total: gates.length, blockers, pendingBlockers, verdict };
}

// ---------------------------------------------------------------- auto-gate rules

export type IssueLite = { severity: "P0" | "P1" | "P2" | "P3"; status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"; isValid: boolean };
export type FlagLite = { severity: "P0" | "P1" | "P2" | "P3"; date: string | Date; repo: string };
export type SuiteRun = { suiteName: string; conclusion: string | null } | { suiteName: string; error: string };

const isOpen = (i: IssueLite) => i.status === "OPEN" || i.status === "IN_PROGRESS";
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Latest completed run of every linked suite concluded "success". */
export function ruleCiGreen(opts: { connected: boolean; linked: number; runs: SuiteRun[] }): AutoResult {
  if (!opts.linked) return { status: null, detail: "Can't check — link a CI suite to this release" };
  if (!opts.connected) return { status: null, detail: "Can't check — connect GitHub (GITHUB_TOKEN)" };
  const errors = opts.runs.filter((r): r is { suiteName: string; error: string } => "error" in r);
  if (errors.length) return { status: null, detail: `Can't check — ${errors.map((e) => `${e.suiteName}: ${e.error}`).join("; ")}` };
  const ok = opts.runs as { suiteName: string; conclusion: string | null }[];
  const none = ok.filter((r) => r.conclusion === null);
  if (none.length) return { status: null, detail: `Can't check — no completed runs for ${none.map((r) => r.suiteName).join(", ")}` };
  const failed = ok.filter((r) => r.conclusion !== "success");
  return failed.length
    ? { status: "FAIL", detail: `Latest run not green: ${failed.map((r) => `${r.suiteName} (${r.conclusion})`).join(", ")}` }
    : { status: "PASS", detail: `Latest run green for ${plural(ok.length, "suite")}` };
}

/** Open valid issues of `severity` in linked feature pages ≤ maxAllowed. */
export function ruleOpenBugs(severity: "P0" | "P1", issues: IssueLite[], linked: number, maxAllowed = 0): AutoResult {
  if (!linked) return { status: null, detail: "Can't check — link Bug Tracker feature pages to this release" };
  const open = issues.filter((i) => i.isValid && isOpen(i) && i.severity === severity).length;
  const detail = `${plural(open, `open ${severity} issue`)}${maxAllowed ? ` (max ${maxAllowed})` : ""}`;
  return { status: open <= maxAllowed ? "PASS" : "FAIL", detail };
}

/** % valid issues in linked feature pages ≥ threshold. */
export function ruleValidRate(issues: IssueLite[], linked: number, threshold = 80): AutoResult {
  if (!linked) return { status: null, detail: "Can't check — link Bug Tracker feature pages to this release" };
  if (!issues.length) return { status: null, detail: "Can't check — no issues logged yet" };
  const pct = Math.round((issues.filter((i) => i.isValid).length / issues.length) * 100);
  return { status: pct >= threshold ? "PASS" : "FAIL", detail: `${pct}% valid (threshold ${threshold}%)` };
}

/** No P0 AI PR Review flags logged in the last `days` days for linked repos. */
export function ruleNoP0Flags(flags: FlagLite[], linkedRepos: string[], days = 14, now = Date.now()): AutoResult {
  if (!linkedRepos.length) return { status: null, detail: "Can't check — link AI PR Review repos to this release" };
  const since = now - days * 86_400_000;
  const repos = new Set(linkedRepos.map((r) => r.toLowerCase()));
  const hits = flags.filter((f) => f.severity === "P0" && repos.has(f.repo.toLowerCase()) && new Date(f.date).getTime() >= since).length;
  return { status: hits ? "FAIL" : "PASS", detail: `${plural(hits, "P0 flag")} in the last ${days} days` };
}

export type AutoData = {
  issues: IssueLite[];
  linkedFeatures: number;
  flags: FlagLite[];
  linkedRepos: string[];
  ci: { connected: boolean; linked: number; runs: SuiteRun[] };
  /** Latest Customer Issue regression run linked to this release (null when none). */
  regressionRun?: RegressionRunLite | null;
  now?: number;
};

export type RegressionRunLite = { id: string; name: string; status: "IN_PROGRESS" | "BLOCKED" | "COMPLETE"; total: number; executed: number; failed: number; blocked: number };

/** Passes only when the linked regression run is Complete with 0 Fail / 0 Blocked. */
export function ruleCustomerRegression(run: RegressionRunLite | null | undefined): AutoResult {
  if (!run) return { status: null, detail: "Can't check — link a customer-issue regression run to this release" };
  const detail = `${run.executed}/${run.total} executed, ${run.failed} failed${run.blocked ? `, ${run.blocked} blocked` : ""} (${run.name})`;
  if (run.failed || run.blocked || run.status === "BLOCKED") return { status: "FAIL", detail };
  return run.status === "COMPLETE" ? { status: "PASS", detail } : { status: "FAIL", detail: `${detail} — not complete yet` };
}

/** Auto result for one gate (null for manual gates). */
export function autoResultFor(g: Pick<GateLike, "type" | "config">, data: AutoData): AutoResult | null {
  const cfg = { ...DEFAULT_CONFIG[g.type], ...(g.config ?? {}) };
  switch (g.type) {
    case "CI_GREEN":
      return ruleCiGreen(data.ci);
    case "NO_P0":
      return ruleOpenBugs("P0", data.issues, data.linkedFeatures);
    case "NO_P1":
      return ruleOpenBugs("P1", data.issues, data.linkedFeatures, cfg.maxAllowed ?? 0);
    case "VALID_RATE":
      return ruleValidRate(data.issues, data.linkedFeatures, cfg.threshold ?? 80);
    case "NO_P0_FLAGS":
      return ruleNoP0Flags(data.flags, data.linkedRepos, cfg.days ?? 14, data.now);
    case "CUSTOMER_REGRESSION":
      return ruleCustomerRegression(data.regressionRun);
    default:
      return null;
  }
}

// ---------------------------------------------------------------- snapshot & summary

export type SignoffLike = { role: string; name?: string | null; decision: "PENDING" | "APPROVE" | "REJECT"; comment?: string | null; signedAt?: string | Date | null };

export type Snapshot = {
  score: number;
  verdict: Verdict;
  counts: Record<GateStatus, number>;
  gates: { section: string; title: string; type: GateType; status: GateStatus; isBlocker: boolean; weight: number; detail?: string; note?: string | null }[];
  signoffs: SignoffLike[];
};

/** Frozen copy of the checklist at decision time. */
export function buildSnapshot(gates: (GateLike & { note?: string | null })[], signoffs: SignoffLike[]): Snapshot {
  const s = scoreRelease(gates);
  return {
    score: s.score,
    verdict: s.verdict,
    counts: s.counts,
    gates: gates.map((g) => ({
      section: g.section,
      title: g.title,
      type: g.type,
      status: effectiveStatus(g),
      isBlocker: g.isBlocker,
      weight: g.weight,
      detail: g.override ? `Overridden by ${g.override.by}: ${g.override.note}` : (g.autoResult?.detail ?? undefined),
      note: g.note ?? null,
    })),
    signoffs: signoffs.map((x) => ({ role: x.role, name: x.name ?? null, decision: x.decision, comment: x.comment ?? null, signedAt: x.signedAt ?? null })),
  };
}

const SIGN_ICON = { APPROVE: "✅", REJECT: "❌", PENDING: "⏳" } as const;

/** Copyable summary (Markdown; Slack uses *bold*). */
export function releaseSummary(
  r: { name: string; version?: string | null; status: ReleaseStatus },
  gates: GateLike[],
  signoffs: SignoffLike[],
  decision: { decision: DecisionType; knownIssues: string[]; comment?: string } | null,
  format: "markdown" | "slack" = "markdown",
) {
  const s = scoreRelease(gates);
  const b = (t: string) => (format === "slack" ? `*${t}*` : `**${t}**`);
  const title = `${r.version ? `Release ${r.version} — ` : "Release "}${r.name}`;
  const decisionLine = decision
    ? `Decision: ${b(DECISION_LABELS[decision.decision].toUpperCase())} (score ${s.score}%)`
    : `Status: ${b(STATUS_LABELS[r.status])} · readiness ${s.score}% (${VERDICT_LABELS[s.verdict]})`;
  const failedNonBlockers = s.counts.FAIL - s.blockers.length;
  const parts = [`✅ ${s.counts.PASS} passed`];
  if (s.counts.FAIL) parts.push(`❌ ${s.counts.FAIL} failed${s.blockers.length ? ` (${plural(s.blockers.length, "blocker")})` : failedNonBlockers ? " (non-blocker)" : ""}`);
  if (s.counts.PENDING) parts.push(`⏳ ${s.counts.PENDING} pending`);
  if (s.counts.NA) parts.push(`➖ ${s.counts.NA} N/A`);
  const lines = [format === "slack" ? b(title) : `### ${title}`, decisionLine, parts.join(" · ")];
  if (s.blockers.length) lines.push(`Blockers: ${s.blockers.map((g) => g.title).join("; ")}`);
  if (decision?.knownIssues.length) lines.push(`Known issues: ${decision.knownIssues.join("; ")}`);
  if (signoffs.length) lines.push(`Sign-offs: ${signoffs.map((x) => `${x.role} ${SIGN_ICON[x.decision]}`).join(", ")}`);
  return lines.join("\n");
}

/** "in 3 days" / "today" / "2 days overdue" for a YYYY-MM-DD target date. */
export function targetDateText(target: string, today: string) {
  const days = Math.round((Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return "today";
  if (days > 0) return `in ${plural(days, "day")}`;
  return `${plural(-days, "day")} overdue`;
}

export const isDecided = (s: ReleaseStatus) => s === "GO" || s === "NO_GO" || s === "GO_WITH_ISSUES" || s === "RELEASED";
