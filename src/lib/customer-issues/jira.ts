/**
 * Jira Cloud REST API v3: a small client (injectable fetch / sleep for tests) and pure mappers.
 * Credentials come only from server environment variables and are never logged or returned.
 */

import type { IssueStatus } from "./model";

export type JiraConfig = { baseUrl: string; email: string; token: string };

/** Jira connection from env (server only), or null when not configured. */
export function jiraConfig(env: Record<string, string | undefined> = process.env): JiraConfig | null {
  const baseUrl = env.JIRA_BASE_URL?.trim().replace(/\/+$/, "");
  const email = env.JIRA_EMAIL?.trim();
  const token = env.JIRA_API_TOKEN?.trim();
  if (!baseUrl || !email || !token || !/^https?:\/\//i.test(baseUrl)) return null;
  return { baseUrl, email, token };
}

export class JiraError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;
type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const SYNC_FIELDS = ["summary", "description", "status", "created", "updated", "resolutiondate", "priority", "reporter", "assignee", "components", "labels", "fixVersions", "versions", "project"];

export function createJiraClient(cfg: JiraConfig, opts: { fetch?: Fetch; sleep?: Sleep; maxRetries?: number; timeoutMs?: number } = {}) {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? realSleep;
  const maxRetries = opts.maxRetries ?? 3;
  const auth = `Basic ${Buffer.from(`${cfg.email}:${cfg.token}`).toString("base64")}`;

  async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(`${cfg.baseUrl}${path}`, {
          method: init.method ?? "GET",
          headers: { Authorization: auth, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
          body: init.body ? JSON.stringify(init.body) : undefined,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
          cache: "no-store",
        });
      } catch (e) {
        throw new JiraError(e instanceof Error && e.name === "TimeoutError" ? "Jira didn't answer in time." : "Couldn't reach Jira — check JIRA_BASE_URL.");
      }
      if (res.status === 429 && attempt < maxRetries) {
        // Retry-After is seconds (or an HTTP date); cap the wait so a sync can't hang.
        const header = res.headers.get("Retry-After");
        const secs = header && /^\d+$/.test(header) ? Number(header) : header ? Math.max(0, (Date.parse(header) - Date.now()) / 1000) : 2 ** attempt;
        await sleep(Math.min(30, Math.max(1, secs)) * 1000);
        continue;
      }
      if (!res.ok) {
        let detail = "";
        try {
          const j = await res.json();
          detail = [...(j.errorMessages ?? []), ...Object.values(j.errors ?? {})].join(" ");
        } catch {
          /* no body */
        }
        const reason =
          res.status === 401 ? "Jira rejected the credentials (check JIRA_EMAIL / JIRA_API_TOKEN)." : res.status === 403 ? "The Jira account can't access this." : res.status === 400 ? `Jira couldn't run the query${detail ? `: ${detail}` : "."}` : res.status === 429 ? "Jira rate limit — try again later." : `Jira returned ${res.status}${detail ? `: ${detail}` : ""}.`;
        throw new JiraError(reason, res.status);
      }
      return (res.status === 204 ? null : await res.json()) as T;
    }
  }

  return {
    myself: () => request<{ accountId: string; displayName?: string; emailAddress?: string }>("/rest/api/3/myself"),
    /** Every issue for the JQL, following nextPageToken (capped at `max`). */
    async searchAll(jql: string, max = 2000): Promise<JiraIssue[]> {
      const out: JiraIssue[] = [];
      let nextPageToken: string | undefined;
      do {
        const page = await request<{ issues: JiraIssue[]; nextPageToken?: string; isLast?: boolean }>("/rest/api/3/search/jql", {
          method: "POST",
          body: { jql, fields: SYNC_FIELDS, maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) },
        });
        out.push(...(page.issues ?? []));
        nextPageToken = page.isLast === false || (page.nextPageToken && page.isLast !== true) ? page.nextPageToken : undefined;
      } while (nextPageToken && out.length < max);
      return out.slice(0, max);
    },
    addComment: (key: string, text: string) => request(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, { method: "POST", body: { body: textToAdf(text) } }),
  };
}

// ---------------------------------------------------------------- mapping

type AdfNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: AdfNode[] };

export type JiraIssue = {
  key: string;
  fields: {
    summary?: string;
    description?: AdfNode | string | null;
    status?: { name?: string; statusCategory?: { key?: string } };
    created?: string;
    resolutiondate?: string | null;
    priority?: { name?: string } | null;
    reporter?: { displayName?: string } | null;
    assignee?: { displayName?: string } | null;
    components?: { name: string }[];
    labels?: string[];
    fixVersions?: { name: string; releaseDate?: string }[];
    versions?: { name: string; releaseDate?: string }[];
    project?: { key?: string };
  };
};

const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock", "rule", "panel", "mediaSingle", "table", "tableRow"]);

/** Atlassian Document Format → readable plain text (lists as "- " / "1. ", tables as " | "). */
export function adfToText(doc: AdfNode | string | null | undefined): string {
  if (!doc) return "";
  if (typeof doc === "string") return doc;
  const walk = (n: AdfNode, listPrefix?: string): string => {
    const kids = (n.content ?? []).map((c) => walk(c)).join("");
    switch (n.type) {
      case "text":
        return n.text ?? "";
      case "hardBreak":
        return "\n";
      case "mention":
      case "emoji":
        return String(n.attrs?.text ?? n.attrs?.shortName ?? "");
      case "inlineCard":
      case "blockCard":
        return String(n.attrs?.url ?? "");
      case "rule":
        return "\n---\n";
      case "bulletList":
        return (n.content ?? []).map((li) => `- ${walk(li).trim().replace(/\n/g, "\n  ")}`).join("\n") + "\n\n";
      case "orderedList":
        return (n.content ?? []).map((li, i) => `${i + 1}. ${walk(li).trim().replace(/\n/g, "\n   ")}`).join("\n") + "\n\n";
      case "listItem":
        return (n.content ?? []).map((c) => walk(c, listPrefix).trim()).join("\n");
      case "tableRow":
        return (n.content ?? []).map((c) => walk(c).trim()).join(" | ") + "\n";
      case "tableCell":
      case "tableHeader":
        return kids;
      default:
        return BLOCKS.has(n.type ?? "") ? `${kids.trim()}\n\n` : kids;
    }
  };
  return walk(doc as AdfNode)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text → minimal ADF (paragraph per line) for comments. */
export function textToAdf(text: string): AdfNode {
  return { type: "doc", attrs: { version: 1 } as Record<string, unknown>, content: text.split("\n").map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] })) } as AdfNode;
}

/** Jira status → hub status, by status category (names differ per Jira). */
export function mapStatus(status: JiraIssue["fields"]["status"]): IssueStatus {
  const cat = status?.statusCategory?.key;
  if (cat === "done") return /closed/i.test(status?.name ?? "") ? "CLOSED" : "FIXED";
  if (cat === "indeterminate") return "IN_PROGRESS";
  return "OPEN";
}

export type ProductMapping = { kind: "project" | "component"; value: string; productId: string }[];

/** Product for an issue: a component mapping wins over a project mapping. */
export function productFor(issue: JiraIssue, mapping: ProductMapping): string | null {
  const comps = (issue.fields.components ?? []).map((c) => c.name.toLowerCase());
  const byComp = mapping.find((m) => m.kind === "component" && comps.includes(m.value.toLowerCase()));
  if (byComp) return byComp.productId;
  const project = (issue.fields.project?.key ?? issue.key.split("-")[0]).toUpperCase();
  return mapping.find((m) => m.kind === "project" && m.value.toUpperCase() === project)?.productId ?? null;
}

const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

/** The Jira-owned fields of an issue (refreshed on every sync). */
export function jiraOwnedFields(issue: JiraIssue, baseUrl: string) {
  const f = issue.fields;
  const affected = (f.versions ?? []).filter((v) => v.releaseDate).sort((a, b) => a.releaseDate!.localeCompare(b.releaseDate!));
  return {
    issueKey: issue.key.toUpperCase(),
    issueUrl: `${baseUrl}/browse/${issue.key}`,
    summary: (f.summary ?? issue.key).slice(0, 500),
    description: adfToText(f.description).slice(0, 100_000) || null,
    status: mapStatus(f.status),
    createdDate: day(f.created) ?? new Date().toISOString().slice(0, 10),
    resolvedDate: day(f.resolutiondate),
    fixVersion: (f.fixVersions ?? []).map((v) => v.name).join(", ") || null,
    /** Release date of the earliest Affects Version — the release that introduced the bug. */
    releasedInDate: affected[0]?.releaseDate ?? null,
    priority: f.priority?.name ?? null,
    reporter: f.reporter?.displayName ?? null,
    assignee: f.assignee?.displayName ?? null,
    components: (f.components ?? []).map((c) => c.name),
    labels: f.labels ?? [],
  };
}

export type JiraOwned = ReturnType<typeof jiraOwnedFields>;

/** True when any Jira-owned field differs from what's stored (dates compared as YYYY-MM-DD). */
export function jiraFieldsChanged(stored: Record<string, unknown>, next: JiraOwned): boolean {
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : Array.isArray(v) ? JSON.stringify(v) : (v ?? null));
  return (Object.keys(next) as (keyof JiraOwned)[]).some((k) => norm(stored[k]) !== norm(next[k]));
}

/** The comment posted back to Jira when an RCA is completed (write-back on). */
export function rcaComment(v: { category: string | null; subcategory: string | null; stage: string | null; catchable: string | null; cases: number; link: string }) {
  return `RCA: ${v.category ?? "—"} → ${v.subcategory ?? "—"} · Caught at: ${v.stage ?? "—"} · Catchable: ${v.catchable ?? "—"} · Regression cases: ${v.cases} · ${v.link}`;
}
