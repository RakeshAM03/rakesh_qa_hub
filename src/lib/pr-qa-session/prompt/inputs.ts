/** PR QA Session inputs, and the context derived from them that every prompt section reads. */

import { FOCUS_AREAS, LOGIN_METHODS, SESSION_STEPS, type FocusArea, type LoginMethod, type TemplateMode } from "@/config/pr-qa-templates";
import { parsePrUrl, type PrRef } from "@/lib/github";

export type SessionInputs = {
  frontendPr: string;
  backendPr: string;
  additionalPrs: string[];
  testEnvUrl: string;
  /** Login page URL only. Credentials are never accepted (see sanitizeLoginUrl). */
  loginUrl: string;
  loginMethod: LoginMethod;
  /** Comma-separated folders with existing specs (impact radius). */
  specFolders: string;
  context: string;
  focusAreas: FocusArea[];
  /** Selected step ids (1–10). */
  steps: number[];
  /** Style reference: a sample spec or POM for Step 9. */
  specRef: string;
  mode: TemplateMode;
  /** 1 = start at Step 1; >1 adds a resume block. */
  resumeFrom: number;
  /** Approved Step 1 + Step 2 output loaded from the TC Library. */
  approvedPlan?: { name: string; output: string } | null;
};

export const NOT_PROVIDED = "<not provided>";

export type PrInfo = {
  /** "Frontend PR", "Backend PR", "Additional PR 1" … */
  label: string;
  url: string;
  ref: PrRef | null;
  /** `gh pr diff <num> --repo <owner/repo>`, or null for an unparseable URL. */
  diffCmd: string | null;
  /** owner/repo, or <not provided>. */
  repo: string;
};

export function prInfo(label: string, url: string): PrInfo | null {
  const u = url.trim();
  if (!u) return null;
  const ref = parsePrUrl(u);
  return { label, url: u, ref, diffCmd: ref ? diffCommand(ref) : null, repo: ref ? `${ref.owner}/${ref.repo}` : NOT_PROVIDED };
}

export const diffCommand = (ref: PrRef) => `gh pr diff ${ref.number} --repo ${ref.owner}/${ref.repo}`;

const SENSITIVE_PARAM = /^(pass(word)?|pwd|token|access_token|id_token|auth|otp|code|secret|key|api_key|apikey|session|sid|jwt|username|user|email|login)$/i;

/**
 * Keeps only a login PAGE URL: drops any user:password@ part and query / hash parameters that
 * could carry credentials or tokens. Returns null for anything that isn't an http(s) URL.
 */
export function sanitizeLoginUrl(value: string): { url: string; removed: boolean } | null {
  const v = value.trim();
  if (!v) return { url: "", removed: false };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  let removed = Boolean(u.username || u.password);
  u.username = "";
  u.password = "";
  for (const k of [...u.searchParams.keys()]) {
    if (SENSITIVE_PARAM.test(k)) {
      u.searchParams.delete(k);
      removed = true;
    }
  }
  if (u.hash && /(token|password|otp|code)=/i.test(u.hash)) {
    u.hash = "";
    removed = true;
  }
  return { url: u.toString(), removed };
}

export type RiskLevel = "Critical" | "High" | "Medium" | "Low";

/** "Risk: Critical", "risk level - high", "high-risk", "critical risk" → the level. */
export function riskLevel(context: string): RiskLevel | null {
  const m = /\brisk(?:\s*level)?\s*[:=–-]?\s*(critical|high|medium|low)\b/i.exec(context) ?? /\b(critical|high|medium|low)[\s-]risk\b/i.exec(context);
  return m ? ((m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as RiskLevel) : null;
}

export const loginMethodLabel = (m: LoginMethod) => LOGIN_METHODS.find((x) => x.value === m)?.label ?? "";

export type SessionContext = {
  inputs: SessionInputs;
  fe: PrInfo | null;
  be: PrInfo | null;
  extras: PrInfo[];
  both: boolean;
  feOnly: boolean;
  beOnly: boolean;
  focus: Set<FocusArea>;
  risk: RiskLevel | null;
  env: string;
  loginUrl: string;
  loginMethod: string;
  folders: string[];
  mode: TemplateMode;
  /** Steps that will be written out (selected; Steps 1–2 forced when an approved plan is loaded). */
  steps: Set<number>;
  resumeFrom: number;
  approved: { name: string; output: string } | null;
  stepName: (id: number) => string;
};

export function sessionContext(i: SessionInputs): SessionContext {
  const fe = prInfo("Frontend PR", i.frontendPr);
  const be = prInfo("Backend PR", i.backendPr);
  const extras = i.additionalPrs.map((u, n) => prInfo(`Additional PR ${n + 1}`, u)).filter((p): p is PrInfo => p !== null);
  const focus = new Set<FocusArea>(i.focusAreas.filter((f) => (FOCUS_AREAS as readonly string[]).includes(f)));
  if (i.mode === "security") focus.add("Security");
  const approved = i.approvedPlan?.output.trim() ? i.approvedPlan : null;
  const steps = new Set(i.steps.filter((s) => s >= 1 && s <= 10));
  if (approved) {
    steps.add(1);
    steps.add(2);
  }
  const login = sanitizeLoginUrl(i.loginUrl);
  return {
    inputs: i,
    fe,
    be,
    extras,
    both: Boolean(fe && be),
    feOnly: Boolean(fe && !be),
    beOnly: Boolean(be && !fe),
    focus,
    risk: riskLevel(i.context),
    env: i.testEnvUrl.trim() || NOT_PROVIDED,
    loginUrl: login?.url || NOT_PROVIDED,
    loginMethod: loginMethodLabel(i.loginMethod) || NOT_PROVIDED,
    folders: (i.specFolders.trim() ? i.specFolders : "tests/regression/, tests/feature/").split(/[,\n]/).map((f) => f.trim()).filter(Boolean),
    mode: i.mode,
    steps,
    resumeFrom: approved ? 3 : Math.min(10, Math.max(1, Math.floor(i.resumeFrom) || 1)),
    approved,
    stepName: (id) => SESSION_STEPS.find((s) => s.id === id)?.name ?? `Step ${id}`,
  };
}
