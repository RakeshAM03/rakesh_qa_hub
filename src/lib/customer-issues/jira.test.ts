import { describe, expect, it, vi } from "vitest";

import { adfToText, createJiraClient, jiraConfig, jiraFieldsChanged, jiraOwnedFields, mapStatus, productFor, rcaComment, type JiraIssue } from "./jira";
import { HUB_OWNED_FIELDS } from "./model";

const CFG = { baseUrl: "https://example-org.atlassian.example", email: "qa-bot@example.com", token: "fake-token" };

const issue = (over: Partial<JiraIssue["fields"]> = {}, key = "DEMO-101"): JiraIssue => ({
  key,
  fields: {
    summary: "Apply form rejects 10-digit phone numbers",
    description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Steps:" }] }] },
    status: { name: "Done", statusCategory: { key: "done" } },
    created: "2026-09-01T10:00:00.000+0530",
    resolutiondate: "2026-09-04T09:00:00.000+0530",
    priority: { name: "High" },
    reporter: { displayName: "Demo Reporter" },
    assignee: { displayName: "Demo Assignee A" },
    components: [{ name: "Apply form" }],
    labels: ["customer-reported"],
    fixVersions: [{ name: "v2.4.1" }],
    versions: [{ name: "v2.4.0", releaseDate: "2026-08-20" }],
    project: { key: "DEMO" },
    ...over,
  },
});

describe("ADF → plain text", () => {
  it("keeps paragraphs, line breaks, lists, code, mentions, links and tables readable", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Steps" }] },
        { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Open the form" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Enter 9876543210" }] }] }] },
        { type: "paragraph", content: [{ type: "text", text: "Seen by " }, { type: "mention", attrs: { text: "@Demo Support" } }, { type: "hardBreak" }, { type: "inlineCard", attrs: { url: "https://example.com/x" } }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Chrome" }] }] }] },
        { type: "codeBlock", content: [{ type: "text", text: "HTTP 400" }] },
        { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Field" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Phone" }] }] }] }] },
      ],
    };
    expect(adfToText(doc)).toBe("Steps\n\n1. Open the form\n2. Enter 9876543210\n\nSeen by @Demo Support\nhttps://example.com/x\n\n- Chrome\n\nHTTP 400\n\nField | Phone");
    expect(adfToText(null)).toBe("");
    expect(adfToText("already text")).toBe("already text");
  });
});

describe("mapping", () => {
  it("maps status by category, not by name", () => {
    expect(mapStatus({ name: "Backlog", statusCategory: { key: "new" } })).toBe("OPEN");
    expect(mapStatus({ name: "In QA", statusCategory: { key: "indeterminate" } })).toBe("IN_PROGRESS");
    expect(mapStatus({ name: "Done", statusCategory: { key: "done" } })).toBe("FIXED");
    expect(mapStatus({ name: "Closed", statusCategory: { key: "done" } })).toBe("CLOSED");
    expect(mapStatus(undefined)).toBe("OPEN");
  });

  it("maps products by component first, then project key", () => {
    const mapping = [
      { kind: "project" as const, value: "demo", productId: "prod_a" },
      { kind: "component" as const, value: "billing", productId: "prod_b" },
    ];
    expect(productFor(issue(), mapping)).toBe("prod_a");
    expect(productFor(issue({ components: [{ name: "Billing" }] }), mapping)).toBe("prod_b");
    expect(productFor(issue({ project: { key: "OTHER" } }, "OTHER-1"), mapping)).toBeNull();
  });

  it("produces only Jira-owned fields — never a hub-owned one", () => {
    const owned = jiraOwnedFields(issue(), CFG.baseUrl);
    expect(owned).toEqual({
      issueKey: "DEMO-101",
      issueUrl: "https://example-org.atlassian.example/browse/DEMO-101",
      summary: "Apply form rejects 10-digit phone numbers",
      description: "Steps:",
      status: "FIXED",
      createdDate: "2026-09-01",
      resolvedDate: "2026-09-04",
      fixVersion: "v2.4.1",
      releasedInDate: "2026-08-20",
      priority: "High",
      reporter: "Demo Reporter",
      assignee: "Demo Assignee A",
      components: ["Apply form"],
      labels: ["customer-reported"],
    });
    for (const f of HUB_OWNED_FIELDS) expect(owned).not.toHaveProperty(f);
  });

  it("detects changes to Jira-owned fields only (dates compared by day)", () => {
    const owned = jiraOwnedFields(issue(), CFG.baseUrl);
    const stored = { ...owned, createdDate: new Date("2026-09-01T00:00:00Z"), resolvedDate: new Date("2026-09-04T00:00:00Z"), releasedInDate: new Date("2026-08-20T00:00:00Z"), rca: "Hub text", dispositionId: "x" };
    expect(jiraFieldsChanged(stored, owned)).toBe(false);
    expect(jiraFieldsChanged({ ...stored, summary: "Old summary" }, owned)).toBe(true);
    expect(jiraFieldsChanged({ ...stored, labels: [] }, owned)).toBe(true);
  });

  it("reads credentials only from env and requires all three", () => {
    expect(jiraConfig({ JIRA_BASE_URL: "https://x.example/", JIRA_EMAIL: "a@example.com", JIRA_API_TOKEN: "t" })).toEqual({ baseUrl: "https://x.example", email: "a@example.com", token: "t" });
    expect(jiraConfig({ JIRA_BASE_URL: "https://x.example", JIRA_EMAIL: "a@example.com" })).toBeNull();
    expect(jiraConfig({ JIRA_BASE_URL: "x.example", JIRA_EMAIL: "a", JIRA_API_TOKEN: "t" })).toBeNull();
  });

  it("formats the write-back comment", () => {
    expect(rcaComment({ category: "Code Defect", subcategory: "Logic error", stage: "QA functional testing", catchable: "Yes", cases: 3, link: "https://hub.example.com/customer-issues/abc" })).toBe(
      "RCA: Code Defect → Logic error · Caught at: QA functional testing · Catchable: Yes · Regression cases: 3 · https://hub.example.com/customer-issues/abc",
    );
  });
});

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

describe("client (mocked fetch — never a real Jira)", () => {
  it("follows nextPageToken, sends basic auth and the JQL", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      return body.nextPageToken ? json({ issues: [issue({}, "DEMO-102")], isLast: true }) : json({ issues: [issue()], nextPageToken: "p2", isLast: false });
    });
    const client = createJiraClient(CFG, { fetch: fetchMock as unknown as typeof fetch, sleep: async () => {} });
    const all = await client.searchAll("project = DEMO");
    expect(all.map((i) => i.key)).toEqual(["DEMO-101", "DEMO-102"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://example-org.atlassian.example/rest/api/3/search/jql");
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("qa-bot@example.com:fake-token").toString("base64")}`);
    expect(JSON.parse(String(init!.body))).toMatchObject({ jql: "project = DEMO", maxResults: 100 });
  });

  it("retries a 429 after Retry-After seconds, then gives up with a clear error", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const fetchMock = vi.fn(async () => (++calls === 1 ? new Response("", { status: 429, headers: { "Retry-After": "7" } }) : json({ accountId: "1", displayName: "QA Bot" })));
    const client = createJiraClient(CFG, { fetch: fetchMock as unknown as typeof fetch, sleep });
    expect((await client.myself()).displayName).toBe("QA Bot");
    expect(sleep).toHaveBeenCalledWith(7000);

    const always429 = vi.fn(async () => new Response("", { status: 429, headers: { "Retry-After": "1" } }));
    const c2 = createJiraClient(CFG, { fetch: always429 as unknown as typeof fetch, sleep: async () => {}, maxRetries: 2 });
    await expect(c2.myself()).rejects.toThrow("Jira rate limit");
    expect(always429).toHaveBeenCalledTimes(3);
  });

  it("turns 401 / 400 into readable messages without leaking credentials", async () => {
    const c401 = createJiraClient(CFG, { fetch: (async () => json({}, { status: 401 })) as unknown as typeof fetch });
    await expect(c401.myself()).rejects.toThrow("Jira rejected the credentials");
    const c400 = createJiraClient(CFG, { fetch: (async () => json({ errorMessages: ["Field 'labelz' does not exist."] }, { status: 400 })) as unknown as typeof fetch });
    const err = await c400.searchAll("labelz = x").catch((e: Error) => e);
    expect(String(err)).toContain("Field 'labelz' does not exist.");
    expect(String(err)).not.toContain("fake-token");
  });

  it("posts comments as ADF", async () => {
    const fetchMock = vi.fn(async () => json({ id: "1" }, { status: 201 }));
    await createJiraClient(CFG, { fetch: fetchMock as unknown as typeof fetch }).addComment("DEMO-101", "RCA: x\nline 2");
    const [url, init] = (fetchMock.mock.calls[0] as unknown as [string, RequestInit]);
    expect(url).toBe("https://example-org.atlassian.example/rest/api/3/issue/DEMO-101/comment");
    expect(JSON.parse(String(init.body)).body.content).toHaveLength(2);
  });
});
