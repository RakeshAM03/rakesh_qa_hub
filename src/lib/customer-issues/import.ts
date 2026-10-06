/**
 * CSV / Excel import: header auto-matching, value matching against the lists, the old "Type" →
 * RCA category mapping step, and row validation. Pure — the page parses files and calls these.
 */

import { SEVERITIES, type CatchableValue, type ListKind } from "@/config/customer-issues";

import type { IssueStatus, Lists } from "./model";

export type ImportTarget =
  | "issueKey"
  | "issueUrl"
  | "summary"
  | "description"
  | "status"
  | "product"
  | "module"
  | "createdDate"
  | "resolvedDate"
  | "releasedIn"
  | "fixVersion"
  | "severity"
  | "disposition"
  | "category"
  | "subcategory"
  | "caughtAt"
  | "catchable"
  | "whyEscaped"
  | "detectedBy"
  | "scope"
  | "impact"
  | "ownerTeam"
  | "linkedIssueKey"
  | "recurring"
  | "rca"
  | "prevention"
  | "comments"
  | "qaOwner";

export const TARGET_LABELS: Record<ImportTarget, string> = {
  issueKey: "Issue key",
  issueUrl: "Issue URL",
  summary: "Summary",
  description: "Description",
  status: "Status",
  product: "Product",
  module: "Module / feature",
  createdDate: "Created date",
  resolvedDate: "Resolved date",
  releasedIn: "Released in (version)",
  fixVersion: "Fix version",
  severity: "Severity",
  disposition: "Disposition",
  category: "RCA category (or old Type)",
  subcategory: "RCA sub-category",
  caughtAt: "Should have been caught at",
  catchable: "Catchable?",
  whyEscaped: "Why it escaped",
  detectedBy: "Detected by",
  scope: "Scope",
  impact: "Customer impact",
  ownerTeam: "Owner team",
  linkedIssueKey: "Linked issue key",
  recurring: "Recurring?",
  rca: "RCA",
  prevention: "Prevention action",
  comments: "Comments",
  qaOwner: "QA owner",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Common header spellings → target (compared after normalising case and punctuation). */
const ALIASES: Record<ImportTarget, string[]> = {
  issueKey: ["issue key", "key", "issue", "ticket", "ticket id", "issue id", "jira", "jira key", "id"],
  issueUrl: ["issue url", "url", "link", "jira link", "ticket url"],
  summary: ["summary", "title", "issue summary", "subject"],
  description: ["description", "details", "issue description"],
  status: ["status", "state"],
  product: ["product", "application", "app"],
  module: ["module", "feature", "module feature", "component", "area"],
  createdDate: ["created date", "created", "reported", "reported date", "reported on", "date", "created on"],
  resolvedDate: ["resolved date", "resolved", "resolution date", "closed date", "fixed date"],
  releasedIn: ["released in", "found in version", "affects version", "affected version", "version"],
  fixVersion: ["fix version", "fix versions", "fixed in", "fixed in version"],
  severity: ["severity", "priority"],
  disposition: ["disposition", "resolution type", "outcome"],
  category: ["rca category", "category", "type", "rca type", "root cause type", "root cause category"],
  subcategory: ["sub category", "subcategory", "rca sub category", "rca subcategory"],
  caughtAt: ["should have been caught at", "caught at", "stage", "should be caught at"],
  catchable: ["catchable", "catchable by qa", "qa catchable", "could qa catch"],
  whyEscaped: ["why it escaped", "why escaped", "escape reason", "reason escaped"],
  detectedBy: ["detected by", "found by", "reported by type"],
  scope: ["scope", "client scope"],
  impact: ["customer impact", "impact"],
  ownerTeam: ["owner team", "owner", "team"],
  linkedIssueKey: ["linked issue key", "linked issue", "duplicate of", "related issue"],
  recurring: ["recurring", "recurring issue", "repeat"],
  rca: ["rca", "root cause", "root cause analysis", "root cause and fix"],
  prevention: ["prevention", "prevention action", "preventive action", "action"],
  comments: ["comments", "comment", "notes", "remarks"],
  qaOwner: ["qa owner", "tester", "qa"],
};

/** header → target (or "" to ignore); each target is used once, first header wins. */
export function autoMap(headers: string[]): Record<string, ImportTarget | ""> {
  const used = new Set<ImportTarget>();
  const out: Record<string, ImportTarget | ""> = {};
  for (const h of headers) {
    const n = norm(h);
    const target = (Object.keys(ALIASES) as ImportTarget[]).find((t) => !used.has(t) && ALIASES[t].includes(n));
    out[h] = target ?? "";
    if (target) used.add(target);
  }
  return out;
}

/** Keyword hints for mapping old free-text "Type" values to the new main categories. */
const CATEGORY_HINTS: [RegExp, string][] = [
  [/\bqa\b.*\bskip|skipp|hotfix|descop|time pressure/i, "QA Skip"],
  [/\bqa\b|test(ing)? miss|missed|test case/i, "QA Miss"],
  [/sync|merge|branch|wrong build|release pack|feature flag/i, "Code Sync / Release"],
  [/config|setting|data|migration/i, "Config / Data"],
  [/infra|deploy|server|cache|cdn|dns|outage|down/i, "Infra / Deployment"],
  [/integration|third|3rd|partner|webhook|external|vendor/i, "Integration / Third-party"],
  [/requirement|spec|\bba\b|\bpo\b|change request/i, "Requirement Gap"],
  [/design|ux|usab|accessib/i, "Design / UX"],
  [/secur|xss|inject|permission|leak/i, "Security"],
  [/code|logic|dev|bug|defect|null|regression/i, "Code Defect"],
];

/** Best RCA main category for an old "Type" value (exact name first, then keywords; else Others). */
export function suggestCategory(value: string, lists: Lists): string | null {
  const cats = lists.of("RCA_CATEGORY");
  const exact = cats.find((c) => norm(c.name) === norm(value));
  if (exact) return exact.id;
  const hint = CATEGORY_HINTS.find(([re]) => re.test(value))?.[1];
  return (hint && cats.find((c) => c.name === hint)?.id) ?? cats.find((c) => c.key === "OTHERS")?.id ?? null;
}

/** Distinct non-empty values of a column (for the category mapping step). */
export function distinctValues(rows: Record<string, unknown>[], header: string): string[] {
  return [...new Set(rows.map((r) => cellText(r[header])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export const cellText = (v: unknown): string => (v === null || v === undefined ? "" : v instanceof Date ? isoOf(v) : String(v).trim());

const isoOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** YYYY-MM-DD from ISO, DD/MM/YYYY, DD-MM-YYYY, "5 Oct 2026", "05-Oct-26" or an Excel date; null if unreadable. */
export function parseDate(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoOf(v);
  const s = cellText(v);
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const valid = (y: number, mo: number, d: number) => {
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? isoOf(date) : null;
  };
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{2}|\d{4})$/.exec(s);
  if (m && MONTHS.includes(m[2].toLowerCase())) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  return null;
}

export function parseCatchable(v: string): CatchableValue | null | undefined {
  const n = norm(v);
  if (!n) return null;
  if (["yes", "y", "true", "catchable"].includes(n)) return "YES";
  if (["no", "n", "false", "not catchable"].includes(n)) return "NO";
  if (["partially", "partial", "part"].includes(n)) return "PARTIAL";
  return undefined;
}

export function parseStatus(v: string): IssueStatus | undefined {
  const n = norm(v);
  if (!n) return "OPEN";
  if (/^(open|new|to do|todo|reopened|backlog)$/.test(n)) return "OPEN";
  if (/progress|review|testing|qa/.test(n)) return "IN_PROGRESS";
  if (/^(fixed|resolved|done)$/.test(n)) return "FIXED";
  if (/closed|won t|wont|rejected/.test(n)) return "CLOSED";
  return undefined;
}

export function parseSeverity(v: string): (typeof SEVERITIES)[number] | null | undefined {
  const n = norm(v);
  if (!n) return null;
  const idx = [/^(p1|p0|critical|highest|blocker|s1|sev1)\b/, /^(p2|high|major|s2|sev2)\b/, /^(p3|medium|normal|s3|sev3)\b/, /^(p4|low|lowest|minor|trivial|s4|sev4)\b/].findIndex((re) => re.test(n));
  return idx >= 0 ? SEVERITIES[idx] : undefined;
}

const LIST_OF: Partial<Record<ImportTarget, ListKind>> = {
  product: "PRODUCT",
  disposition: "DISPOSITION",
  caughtAt: "CAUGHT_AT",
  whyEscaped: "WHY_ESCAPED",
  detectedBy: "DETECTED_BY",
  scope: "SCOPE",
  impact: "IMPACT",
  ownerTeam: "OWNER_TEAM",
};

/** List item id by name (case- and punctuation-insensitive), or undefined. */
export function matchItem(lists: Lists, list: ListKind, value: string, parentId?: string | null) {
  const n = norm(value);
  return lists.items.find((i) => i.list === list && norm(i.name) === n && (parentId === undefined || i.parentId === parentId))?.id;
}

export type ImportRow = Record<string, unknown> & { issueKey: string; summary: string; createdDate: string };
export type RowError = { row: number; message: string };

/**
 * Builds API rows. `categoryMap` maps each distinct value of the category column to a category id
 * (or "" to leave it empty). Rows with errors are left out and reported; unmatched list values are
 * warnings (the field stays empty) so one odd value doesn't block the import.
 */
export function buildRows(
  rows: Record<string, unknown>[],
  mapping: Record<string, ImportTarget | "">,
  categoryMap: Record<string, string>,
  lists: Lists,
  defaults: { qaOwner?: string | null; today: string },
): { rows: ImportRow[]; errors: RowError[]; warnings: RowError[] } {
  const col = Object.fromEntries(Object.entries(mapping).filter(([, t]) => t).map(([h, t]) => [t, h])) as Partial<Record<ImportTarget, string>>;
  const get = (r: Record<string, unknown>, t: ImportTarget) => (col[t] ? r[col[t]!] : undefined);
  const out: ImportRow[] = [];
  const errors: RowError[] = [];
  const warnings: RowError[] = [];
  rows.forEach((r, i) => {
    const row = i + 2; // header is row 1
    const key = cellText(get(r, "issueKey")).toUpperCase();
    const summary = cellText(get(r, "summary"));
    if (!key && !summary) return; // blank line
    const problems: string[] = [];
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) problems.push(key ? `"${key}" isn't an issue key like DEMO-101` : "issue key is missing");
    if (!summary) problems.push("summary is missing");
    const rawCreated = get(r, "createdDate");
    const created = rawCreated === undefined || cellText(rawCreated) === "" ? defaults.today : parseDate(rawCreated);
    if (!created) problems.push(`created date "${cellText(rawCreated)}" isn't a date`);
    if (problems.length) {
      errors.push({ row, message: problems.join("; ") });
      return;
    }
    const data: ImportRow = { issueKey: key, summary: summary.slice(0, 500), createdDate: created! };
    const warn = (m: string) => warnings.push({ row, message: m });
    const text = (t: ImportTarget, max: number) => {
      const v = cellText(get(r, t));
      if (v) data[t] = v.slice(0, max);
    };
    text("description", 100_000);
    text("module", 200);
    text("releasedIn", 100);
    text("fixVersion", 100);
    text("rca", 50_000);
    text("prevention", 50_000);
    text("comments", 50_000);
    const url = cellText(get(r, "issueUrl"));
    if (url) {
      if (/^https?:\/\//i.test(url)) data.issueUrl = url;
      else warn(`issue URL "${url}" ignored (not an http link)`);
    }
    const linked = cellText(get(r, "linkedIssueKey")).toUpperCase();
    if (linked) data.linkedIssueKey = linked;
    data.qaOwner = cellText(get(r, "qaOwner")) || defaults.qaOwner || null;
    const resolved = get(r, "resolvedDate");
    if (cellText(resolved)) {
      const d = parseDate(resolved);
      if (d) data.resolvedDate = d;
      else warn(`resolved date "${cellText(resolved)}" ignored`);
    }
    const status = cellText(get(r, "status"));
    const st = parseStatus(status);
    if (st) data.status = st;
    else warn(`status "${status}" not recognised — set to Open`);
    const sev = cellText(get(r, "severity"));
    const sv = parseSeverity(sev);
    if (sv !== undefined) data.severity = sv;
    else warn(`severity "${sev}" not recognised`);
    const cat = cellText(get(r, "catchable"));
    const cv = parseCatchable(cat);
    if (cv !== undefined) data.catchable = cv;
    else warn(`catchable "${cat}" not recognised (use Yes / No / Partially)`);
    const rec = norm(cellText(get(r, "recurring")));
    if (rec) data.recurring = ["yes", "y", "true", "1"].includes(rec);
    for (const [target, list] of Object.entries(LIST_OF) as [ImportTarget, ListKind][]) {
      const v = cellText(get(r, target));
      if (!v) continue;
      const id = matchItem(lists, list, v);
      if (id) data[`${target}Id`] = id;
      else warn(`${TARGET_LABELS[target].toLowerCase()} "${v}" isn't in the list — left empty`);
    }
    const catValue = cellText(get(r, "category"));
    if (catValue) {
      const catId = categoryMap[catValue] ?? null;
      if (catId) {
        data.rcaCategoryId = catId;
        const subValue = cellText(get(r, "subcategory"));
        if (subValue) {
          const subId = matchItem(lists, "RCA_SUBCATEGORY", subValue, catId);
          if (subId) data.rcaSubcategoryId = subId;
          else warn(`sub-category "${subValue}" isn't under ${lists.name(catId)} — left empty`);
        }
      }
    }
    const disp = lists.key(data.dispositionId as string | undefined);
    data.regressionRequired = disp ? disp === "VALID_BUG" : true;
    out.push(data);
  });
  return { rows: out, errors, warnings };
}

/** Header row of the downloadable CSV template. */
export const TEMPLATE_HEADERS = ["Issue key", "Summary", "Description", "Status", "Product", "Module", "Created date", "Resolved date", "Released in", "Fix version", "Severity", "Disposition", "RCA category", "Sub-category", "Should have been caught at", "Catchable?", "Why it escaped", "Detected by", "Scope", "Customer impact", "Owner team", "Linked issue key", "Recurring", "RCA", "Prevention action", "Comments"];

export const TEMPLATE_EXAMPLE = ["DEMO-201", "Sample: export button does nothing", "Clicking Export shows no file.", "Fixed", "", "Reports", "2026-09-15", "2026-09-18", "v1.4.0", "v1.4.1", "P2 - High", "Valid Bug", "Code Defect", "Error handling missing", "QA functional testing", "Yes", "Missing test case", "Customer", "Single client", "Major", "Dev", "", "No", "Export failed silently when the list was empty.", "Add an empty-state test to the regression pack.", ""];
