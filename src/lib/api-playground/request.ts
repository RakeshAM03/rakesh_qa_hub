/** Client-side request model: variables, params ↔ URL, auth, body, cURL. Pure functions. */

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type Method = (typeof METHODS)[number];

export type KV = { id: string; key: string; value: string; enabled: boolean };

export type Auth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" };

export type Body =
  | { type: "none" }
  | { type: "json"; text: string }
  | { type: "form"; fields: KV[] }
  | { type: "raw"; text: string; contentType: string };

export type AssertionType = "status" | "time" | "header" | "jsonpath" | "body";
export type Operator = "equals" | "notEquals" | "contains" | "notContains" | "lessThan" | "greaterThan" | "exists" | "notExists" | "isType";
export type Assertion = { id: string; type: AssertionType; target: string; operator: Operator; expected: string };

export type RequestDraft = {
  name: string;
  method: Method;
  url: string;
  params: KV[];
  headers: KV[];
  auth: Auth;
  body: Body;
  assertions: Assertion[];
};

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
export const emptyKv = (): KV => ({ id: newId(), key: "", value: "", enabled: true });

export const EMPTY_DRAFT: RequestDraft = {
  name: "Untitled request",
  method: "GET",
  url: "",
  params: [],
  headers: [],
  auth: { type: "none" },
  body: { type: "none" },
  assertions: [],
};

// ---------------------------------------------------------------- variables

const VAR = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** Replaces {{name}} with environment values; unknown variables are left as they are. */
export function substitute(text: string, vars: Record<string, string>) {
  return text.replace(VAR, (m, name: string) => (Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : m));
}

/** Names of {{variables}} in `text` that the environment doesn't define. */
export function unknownVariables(text: string, vars: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(VAR)) if (!Object.prototype.hasOwnProperty.call(vars, m[1])) out.add(m[1]);
  return [...out];
}

/** Every unknown variable used anywhere in the request. */
export function draftUnknownVariables(d: RequestDraft, vars: Record<string, string>) {
  const texts = [d.url, ...enabled(d.params).flatMap((p) => [p.key, p.value]), ...enabled(d.headers).flatMap((h) => [h.key, h.value]), ...authTexts(d.auth), ...bodyTexts(d.body)];
  return [...new Set(texts.flatMap((t) => unknownVariables(t, vars)))];
}

const enabled = (list: KV[]) => list.filter((x) => x.enabled && x.key.trim());
const authTexts = (a: Auth) => (a.type === "bearer" ? [a.token] : a.type === "basic" ? [a.username, a.password] : a.type === "apikey" ? [a.key, a.value] : []);
const bodyTexts = (b: Body) => (b.type === "json" || b.type === "raw" ? [b.text] : b.type === "form" ? enabled(b.fields).flatMap((f) => [f.key, f.value]) : []);

// ---------------------------------------------------------------- params ↔ URL

/** Query params from a URL string (keeps {{vars}} intact). */
export function paramsFromUrl(url: string, previous: KV[] = []): KV[] {
  const q = url.indexOf("?");
  if (q === -1) return previous.filter((p) => !p.enabled);
  const query = url.slice(q + 1).split("#")[0];
  const fromUrl = query
    .split("&")
    .filter(Boolean)
    .map((pair, i) => {
      const [k, ...v] = pair.split("=");
      const key = safeDecode(k);
      const value = safeDecode(v.join("="));
      const prev = previous.filter((p) => p.enabled)[i];
      return { id: prev?.id ?? newId(), key, value, enabled: true };
    });
  // Disabled rows aren't in the URL; keep them.
  return [...fromUrl, ...previous.filter((p) => !p.enabled)];
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/** Encodes a query component but leaves {{variables}} readable. */
const enc = (s: string) => encodeURIComponent(s).replace(/%7B%7B([\w.-]+)%7D%7D/g, "{{$1}}");

/** The URL with its query string rebuilt from the enabled params. */
export function urlWithParams(url: string, params: KV[]) {
  const [beforeHash, hash] = url.split("#");
  const base = beforeHash.split("?")[0];
  const query = params
    .filter((p) => p.enabled && p.key !== "")
    .map((p) => `${enc(p.key)}=${enc(p.value)}`)
    .join("&");
  return `${base}${query ? `?${query}` : ""}${hash !== undefined ? `#${hash}` : ""}`;
}

// ---------------------------------------------------------------- build

export type BuiltRequest = { method: Method; url: string; headers: { key: string; value: string }[]; body?: string };

const b64 = (s: string) => (typeof btoa === "function" ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, "utf8").toString("base64"));

/** Applies variables, auth and body encoding: what is actually sent. */
export function buildRequest(d: RequestDraft, vars: Record<string, string>): BuiltRequest {
  const sub = (s: string) => substitute(s, vars);
  let url = sub(d.url.trim());
  const headers = enabled(d.headers).map((h) => ({ key: sub(h.key).trim(), value: sub(h.value) }));
  const has = (name: string) => headers.some((h) => h.key.toLowerCase() === name.toLowerCase());

  if (d.auth.type === "bearer" && d.auth.token) headers.push({ key: "Authorization", value: `Bearer ${sub(d.auth.token)}` });
  if (d.auth.type === "basic") headers.push({ key: "Authorization", value: `Basic ${b64(`${sub(d.auth.username)}:${sub(d.auth.password)}`)}` });
  if (d.auth.type === "apikey" && d.auth.key) {
    if (d.auth.in === "header") headers.push({ key: sub(d.auth.key), value: sub(d.auth.value) });
    else url += `${url.includes("?") ? "&" : "?"}${encodeURIComponent(sub(d.auth.key))}=${encodeURIComponent(sub(d.auth.value))}`;
  }

  let body: string | undefined;
  if (!["GET", "HEAD"].includes(d.method)) {
    if (d.body.type === "json") {
      body = sub(d.body.text);
      if (!has("content-type")) headers.push({ key: "Content-Type", value: "application/json" });
    } else if (d.body.type === "form") {
      body = enabled(d.body.fields)
        .map((f) => `${encodeURIComponent(sub(f.key))}=${encodeURIComponent(sub(f.value))}`)
        .join("&");
      if (!has("content-type")) headers.push({ key: "Content-Type", value: "application/x-www-form-urlencoded" });
    } else if (d.body.type === "raw") {
      body = sub(d.body.text);
      if (!has("content-type") && d.body.contentType) headers.push({ key: "Content-Type", value: d.body.contentType });
    }
  }
  return { method: d.method, url, headers, body };
}

/** A copy-pasteable cURL command (POSIX shell quoting). */
export function toCurl(r: BuiltRequest) {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const parts = ["curl"];
  if (r.method === "HEAD") parts.push("--head");
  else if (r.method !== "GET" || r.body !== undefined) parts.push(`-X ${r.method}`);
  parts.push(q(r.url));
  for (const h of r.headers) parts.push(`-H ${q(`${h.key}: ${h.value}`)}`);
  if (r.body !== undefined && r.body !== "") parts.push(`--data-raw ${q(r.body)}`);
  return parts.join(" \\\n  ");
}

/** Formats JSON body text; returns null (and the error) when it isn't valid JSON. */
export function formatJson(text: string): { ok: true; text: string } | { ok: false; error: string } {
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(text), null, 2) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}
