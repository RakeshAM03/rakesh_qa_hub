// A tiny fake Jira Cloud for E2E: never a real Jira. Serves /myself, paginated /search/jql
// (one 429 with Retry-After first), and comments, using fake fixture issues.
// Test control: POST /__mock/reset, POST /__mock/issues (JSON array), GET /__mock/comments.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.MOCK_JIRA_PORT ?? 3999);
const AUTH = `Basic ${Buffer.from("qa-bot@example.com:fake-jira-token").toString("base64")}`;
const fixture = () => JSON.parse(readFileSync(new URL("../tests/fixtures/customer-issues/jira-issues.json", import.meta.url), "utf8"));
let state = { issues: fixture(), comments: [], throttleNext: true };

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const read = (req) => new Promise((resolve) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => resolve(data ? JSON.parse(data) : {}));
});

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/" && req.method === "GET") return send(res, 200, { ok: true });
  if (url.pathname === "/__mock/reset") {
    state = { issues: fixture(), comments: [], throttleNext: true };
    return send(res, 200, { ok: true });
  }
  if (url.pathname === "/__mock/issues" && req.method === "POST") {
    state.issues = await read(req);
    return send(res, 200, { ok: true });
  }
  if (url.pathname === "/__mock/comments") return send(res, 200, state.comments);
  if (req.headers.authorization !== AUTH) return send(res, 401, { errorMessages: ["Unauthorized"] });
  if (url.pathname === "/rest/api/3/myself") return send(res, 200, { accountId: "demo-account", displayName: "Demo QA Bot" });
  if (url.pathname === "/rest/api/3/search/jql" && req.method === "POST") {
    if (state.throttleNext) {
      state.throttleNext = false;
      return send(res, 429, { errorMessages: ["Rate limited"] }, { "Retry-After": "1" });
    }
    const body = await read(req);
    if (/labelz/.test(body.jql ?? "")) return send(res, 400, { errorMessages: ["Field 'labelz' does not exist."] });
    const start = body.nextPageToken ? Number(body.nextPageToken) : 0;
    const page = state.issues.slice(start, start + 1); // one per page, to exercise pagination
    const next = start + 1 < state.issues.length ? String(start + 1) : undefined;
    return send(res, 200, { issues: page, ...(next ? { nextPageToken: next, isLast: false } : { isLast: true }) });
  }
  const comment = /^\/rest\/api\/3\/issue\/([^/]+)\/comment$/.exec(url.pathname);
  if (comment && req.method === "POST") {
    const body = await read(req);
    const text = (body.body?.content ?? []).map((p) => (p.content ?? []).map((t) => t.text).join("")).join("\n");
    state.comments.push({ key: decodeURIComponent(comment[1]), text });
    return send(res, 201, { id: String(state.comments.length) });
  }
  send(res, 404, { errorMessages: ["Not found"] });
}).listen(PORT, "127.0.0.1", () => console.log(`mock Jira on http://127.0.0.1:${PORT}`));
