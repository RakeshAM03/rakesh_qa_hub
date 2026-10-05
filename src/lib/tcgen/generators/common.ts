/** Shared pieces for checklist generators: context, standard preconditions, steps and expected-result helpers. */

import type { Requirement } from "../requirement";
import { caseId, newKey, numbered, type ApiDetails, type CaseType, type Category, type Priority, type TcInput, type TestCase } from "../types";

/** A case before IDs and standard preconditions are added. */
export type Draft = {
  title: string;
  category: Category;
  type: CaseType;
  priority: Priority;
  automation: boolean;
  /** Which standard precondition block to start from. */
  base?: "app" | "auth" | "api";
  /** Replaces the 4th standard precondition (starting record state). */
  state?: string;
  /** Extra, case-specific preconditions. */
  pre?: string[];
  steps: string[];
  data: string[];
  expected: string[];
  /** Test-type ids this case belongs to (used to filter by the selected types). */
  tags: string[];
  /** Covers an extracted value or limit — kept when trimming to the depth target. */
  essential?: boolean;
  api?: ApiDetails | null;
  ref?: string;
  template?: boolean;
};

export type Ctx = {
  req: Requirement;
  input: TcInput;
  env: string;
  role: string;
  deniedRole: string;
  /** Quoted screen name, e.g. "'Profile' page" or "'<Resume Upload page>'". */
  screen: string;
  /** Quoted area where the result shows, e.g. "'<Resume Upload section>'". */
  area: string;
  /** Steps that open the screen (navigation path or a placeholder). */
  open: string[];
  button: (keywords: string[], fallback: string) => string;
  msg: (keywords: string[], fallback: string) => string;
  assume: (text: string) => void;
  assumptions: string[];
};

const q = (s: string) => `'${s}'`;

export function makeCtx(req: Requirement, input: TcInput): Ctx {
  const c = input.context;
  const assumptions: string[] = [];
  const assume = (t: string) => {
    if (!assumptions.includes(t)) assumptions.push(t);
  };
  const env = c.environment.trim() || "QA environment";
  const contextRoles = c.roles.split(",").map((r) => r.trim()).filter(Boolean);
  const roles = contextRoles.length ? contextRoles : req.roles;
  const role = roles[0] ? `${roles[0]} (a role with permission to use ${req.moduleName})` : `a user with permission to use ${req.moduleName}`;
  const deniedRole = roles.find((r, i) => i > 0 && /view|guest|read/i.test(r)) ?? (roles[1] && !/admin/i.test(roles[1]) ? roles[1] : "Viewer (read-only role)");
  if (!contextRoles.length && !req.roles.length && !req.features.api && !(req.features.auth && !req.features.form)) assume(`The user role is assumed to be any role with permission to use ${req.moduleName}; a read-only role is assumed for permission tests.`);

  const nav = c.navigation.trim();
  const last = nav ? nav.split(/>|›|\//).map((s) => s.trim()).filter(Boolean).pop() ?? req.moduleName : "";
  const screen = nav ? `${q(last)} page` : q(`<${req.moduleName} page>`);
  const area = nav ? `${q(last)} section` : q(`<${req.moduleName} section>`);
  if (!nav && !req.features.api) assume(`Navigation path and UI element names were not provided; neutral placeholders such as '<${req.moduleName} page>' and '<Submit button>' are used — replace them with the real names.`);
  const open = req.features.api ? [] : nav ? [`Navigate to ${nav}.`] : [`Open the ${screen}.`];

  const elements = c.elements.split(/,|\n/).map((e) => e.trim()).filter(Boolean);
  const button = (keywords: string[], fallback: string) => {
    const hit = elements.find((e) => keywords.some((k) => e.toLowerCase().includes(k)));
    return q(hit ?? `<${fallback}>`);
  };
  const messages = c.messages.split(/\n/).map((m) => m.trim()).filter(Boolean);
  let indicative = false;
  const msg = (keywords: string[], fallback: string) => {
    const hit = messages.find((m) => keywords.some((k) => m.toLowerCase().includes(k)));
    if (hit) return q(hit.replace(/^['"]|['"]$/g, ""));
    if (!indicative) {
      indicative = true;
      assume("Validation and success messages in the test cases are indicative; match them to the real UI copy.");
    }
    return q(fallback);
  };
  return { req, input, env, role, deniedRole, screen, area, open, button, msg, assume, assumptions };
}

function basePreconditions(ctx: Ctx, d: Draft): string[] {
  const { req } = ctx;
  if (d.base === "api") {
    return [
      `The API is reachable in the ${ctx.env} and the base URL is configured in the API client.`,
      `A valid ${req.tokenRole ? `${req.tokenRole} ` : ""}access token is available.`,
      "An API client (e.g. Postman or a REST client) is set up.",
      d.state ?? `No ${req.entity} with the test data exists yet.`,
      "Required test data is prepared and available.",
    ];
  }
  if (d.base === "auth") {
    return [
      `The application is up and accessible in the ${ctx.env}.`,
      "A registered, active test account exists (see test data).",
      `User is logged out and the ${ctx.screen} is open.`,
      d.state ?? "The account has no failed login attempts recorded.",
      "Required test data is prepared and available.",
    ];
  }
  return [
    `The application is up and accessible in the ${ctx.env}.`,
    `User is logged in as ${ctx.role}.`,
    `The ${ctx.screen} is open.`,
    d.state ?? `No existing ${req.entity} conflicts with the test data.`,
    "Required test data is prepared and available.",
  ];
}

/** Final checks every UI case ends with. */
export const verifySteps = (ctx: Ctx, what = "the on-screen message") => [`Observe ${what} and the ${ctx.area}.`, `Refresh the page and re-check the ${ctx.area}.`];

export function finalize(ctx: Ctx, drafts: Draft[], prefix: string, includeTestData: boolean): TestCase[] {
  return drafts.map((d, i) => ({
    key: newKey(),
    id: caseId(prefix, i + 1),
    title: d.title,
    category: d.category,
    type: d.type,
    priority: d.priority,
    automationCandidate: d.automation,
    preconditions: numbered([...basePreconditions(ctx, d), ...(d.pre ?? [])]),
    steps: d.steps,
    testData: includeTestData ? d.data.join("\n") : "",
    expectedResult: numbered(d.expected),
    gherkin: null,
    requirementRef: d.ref ?? "",
    api: d.api ?? null,
    ...(d.template ? { template: true } : {}),
  }));
}

/** Expected lines for a rejected input. */
export function rejected(ctx: Ctx, message: string, extra: string[] = [], serverToo = true): string[] {
  return [
    "The action is NOT completed and nothing is saved.",
    `A clear validation message is displayed: ${message}.`,
    `The ${ctx.area} remains unchanged (no partial, empty or broken entry).`,
    "After a page refresh, no new or changed data is present.",
    ...extra,
    "The user can correct the input and retry immediately (the form is not stuck or disabled).",
    ...(serverToo ? ["Validation happens on the client before submit and is also enforced by the server."] : []),
  ];
}

/** Expected lines for a successful action. */
export function succeeded(ctx: Ctx, immediate: string, message: string, persisted: string, extra: string[] = []): string[] {
  return [immediate, `A success message is displayed: ${message}.`, persisted, ...extra, "No error, duplicate entry or console error occurs."];
}

export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** "a" / "an" for a word ("an Email", "a Phone"). */
export const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** "1 year", "2 years". */
export const plural = (n: number, unit: string) => (Math.abs(n) === 1 ? `${n} ${unit.replace(/s$/, "")}` : `${n} ${unit}`);
