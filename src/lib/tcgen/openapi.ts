/**
 * Reads OpenAPI 3.x / Swagger 2.0 (JSON or YAML) and cURL commands into a simple endpoint list
 * for checklist-mode API cases. Only local `#/…` $refs are followed.
 */

import { load } from "js-yaml";

export type ParamInfo = { name: string; in: "path" | "query" | "header" | "body"; required: boolean; type: string; enum?: unknown[] };

export type Endpoint = {
  method: string;
  path: string;
  summary: string;
  /** Required / optional body properties (top level of the JSON body). */
  bodyFields: ParamInfo[];
  params: ParamInfo[];
  sampleBody: unknown;
  /** Documented status codes, e.g. ["200", "400", "404"]. */
  responses: { code: string; description: string; hasSchema: boolean }[];
  secured: boolean;
  /** Base URL or host from the spec, if any. */
  server: string;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export class SpecError extends Error {}

export function parseSpecText(text: string): Obj {
  const t = text.trim();
  if (!t) throw new SpecError("The API definition is empty.");
  let doc: unknown;
  try {
    doc = t.startsWith("{") ? JSON.parse(t) : load(t);
  } catch (e) {
    throw new SpecError(`Couldn't read the definition as JSON or YAML: ${(e as Error).message.split("\n")[0]}`);
  }
  if (!isObj(doc) || !(doc.openapi || doc.swagger)) throw new SpecError('This doesn\'t look like an OpenAPI / Swagger document (no "openapi" or "swagger" field).');
  if (!isObj(doc.paths)) throw new SpecError('The definition has no "paths".');
  return doc;
}

/** Follows local refs like #/components/schemas/User (cycle-safe). */
function resolver(doc: Obj) {
  return function resolve(v: unknown, seen = new Set<string>()): unknown {
    if (!isObj(v) || typeof v.$ref !== "string") return v;
    const ref = v.$ref;
    if (!ref.startsWith("#/") || seen.has(ref)) return {};
    seen.add(ref);
    let cur: unknown = doc;
    for (const part of ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"))) cur = isObj(cur) ? cur[part] : undefined;
    return resolve(cur, seen);
  };
}

const typeOf = (s: Obj): string => (typeof s.type === "string" ? s.type : Array.isArray(s.type) ? String(s.type[0]) : isObj(s.properties) ? "object" : "string");

/** An example value for a schema (example → default → enum → by type). */
export function sampleFor(schema: unknown, resolve: (v: unknown) => unknown, depth = 0): unknown {
  const s = resolve(schema);
  if (!isObj(s) || depth > 4) return null;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  const all = Array.isArray(s.allOf) ? s.allOf.map((x) => resolve(x)).filter(isObj) : [];
  if (all.length) return Object.assign({}, ...all.map((x) => sampleFor(x, resolve, depth + 1)).filter(isObj));
  const one = (Array.isArray(s.oneOf) ? s.oneOf : Array.isArray(s.anyOf) ? s.anyOf : [])[0];
  if (one) return sampleFor(one, resolve, depth + 1);
  switch (typeOf(s)) {
    case "object": {
      const props = isObj(s.properties) ? s.properties : {};
      return Object.fromEntries(Object.entries(props).slice(0, 30).map(([k, v]) => [k, sampleFor(v, resolve, depth + 1)]));
    }
    case "array":
      return [sampleFor(s.items, resolve, depth + 1)];
    case "integer":
      return 1;
    case "number":
      return 1.5;
    case "boolean":
      return true;
    default: {
      const f = s.format;
      if (f === "email") return "user@example.com";
      if (f === "date") return "2026-01-15";
      if (f === "date-time") return "2026-01-15T10:00:00Z";
      if (f === "uuid") return "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      if (f === "uri" || f === "url") return "https://example.com";
      return "sample";
    }
  }
}

function bodyFieldsOf(schema: unknown, resolve: (v: unknown) => unknown): ParamInfo[] {
  const s = resolve(schema);
  if (!isObj(s)) return [];
  const merged = Array.isArray(s.allOf) ? s.allOf.map((x) => resolve(x)).filter(isObj) : [s];
  const required = new Set(merged.flatMap((m) => (Array.isArray(m.required) ? m.required.map(String) : [])));
  return merged.flatMap((m) =>
    Object.entries(isObj(m.properties) ? m.properties : {}).map(([name, raw]) => {
      const p = resolve(raw);
      const o = isObj(p) ? p : {};
      return { name, in: "body" as const, required: required.has(name), type: typeOf(o), enum: Array.isArray(o.enum) ? o.enum : undefined };
    }),
  );
}

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

export function endpointsFromSpec(doc: Obj): Endpoint[] {
  const resolve = resolver(doc);
  const swagger2 = Boolean(doc.swagger);
  const server = swagger2
    ? `${Array.isArray(doc.schemes) ? doc.schemes[0] : "https"}://${doc.host ?? "api.example.com"}${doc.basePath ?? ""}`
    : Array.isArray(doc.servers) && isObj(doc.servers[0])
      ? String(doc.servers[0].url ?? "")
      : "";
  const rootSecured = Array.isArray(doc.security) && doc.security.length > 0;
  const out: Endpoint[] = [];

  for (const [path, rawItem] of Object.entries(doc.paths as Obj)) {
    const item = resolve(rawItem);
    if (!isObj(item)) continue;
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of METHODS) {
      const op = item[method];
      if (!isObj(op)) continue;
      const params: ParamInfo[] = [];
      let bodyFields: ParamInfo[] = [];
      let sampleBody: unknown = null;
      for (const raw of [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])]) {
        const p = resolve(raw);
        if (!isObj(p) || typeof p.name !== "string") continue;
        if (p.in === "body") {
          bodyFields = bodyFieldsOf(p.schema, resolve);
          sampleBody = sampleFor(p.schema, resolve);
          continue;
        }
        if (p.in === "cookie" || p.in === "formData") continue;
        const schema = isObj(resolve(p.schema)) ? (resolve(p.schema) as Obj) : p;
        params.push({ name: p.name, in: p.in as ParamInfo["in"], required: p.required === true || p.in === "path", type: typeOf(schema), enum: Array.isArray(schema.enum) ? schema.enum : undefined });
      }
      const rb = resolve(op.requestBody);
      if (isObj(rb) && isObj(rb.content)) {
        const media = (rb.content["application/json"] ?? Object.values(rb.content)[0]) as unknown;
        if (isObj(media)) {
          bodyFields = bodyFieldsOf(media.schema, resolve);
          sampleBody = media.example ?? sampleFor(media.schema, resolve);
        }
      }
      const responses = Object.entries(isObj(op.responses) ? op.responses : {}).map(([code, raw]) => {
        const r = resolve(raw);
        const ro = isObj(r) ? r : {};
        const hasSchema = swagger2 ? Boolean(ro.schema) : isObj(ro.content) && Object.values(ro.content).some((m) => isObj(m) && Boolean(m.schema));
        return { code, description: String(ro.description ?? "").trim(), hasSchema };
      });
      const secured = Array.isArray(op.security) ? op.security.length > 0 : rootSecured;
      out.push({ method: method.toUpperCase(), path, summary: String(op.summary ?? op.operationId ?? "").trim(), bodyFields, params, sampleBody, responses, secured, server });
    }
  }
  return out;
}

// ---------- cURL ----------

/** Shell-style split: quotes, escapes and line continuations. */
export function shellWords(cmd: string): string[] {
  const s = cmd.replace(/\\\r?\n/g, " ");
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < s.length) cur += s[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === "\\" && i + 1 < s.length) {
      cur += s[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (cur || has) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (quote) throw new SpecError("The cURL command has an unclosed quote.");
  if (cur || has) out.push(cur);
  return out;
}

export type CurlRequest = { method: string; url: string; headers: Record<string, string>; body: string };

export function parseCurl(cmd: string): CurlRequest {
  const words = shellWords(cmd.trim());
  if (words[0] !== "curl") throw new SpecError("A cURL command starts with curl.");
  let method = "";
  let url = "";
  let body = "";
  const headers: Record<string, string> = {};
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const next = () => words[++i] ?? "";
    if (w === "-X" || w === "--request") method = next().toUpperCase();
    else if (w === "-H" || w === "--header") {
      const h = next();
      const idx = h.indexOf(":");
      if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    } else if (["-d", "--data", "--data-raw", "--data-binary", "--data-ascii"].includes(w)) body = next();
    else if (w === "--json") {
      body = next();
      headers["Content-Type"] ??= "application/json";
    } else if (w === "-u" || w === "--user") headers.Authorization ??= `Basic ${next()}`;
    else if (w === "--url") url = next();
    else if (/^-[A-Za-z]$|^--[a-z-]+$/.test(w)) {
      // Flags with a value we don't use.
      if (["-o", "--output", "-A", "--user-agent", "-e", "--referer", "-b", "--cookie", "-m", "--max-time", "--connect-timeout"].includes(w)) i++;
    } else if (!url) url = w;
  }
  if (!url) throw new SpecError("No URL found in the cURL command.");
  return { method: method || (body ? "POST" : "GET"), url, headers, body };
}

export function endpointFromCurl(c: CurlRequest): Endpoint {
  let path = c.url;
  let server = "";
  try {
    const u = new URL(c.url);
    path = u.pathname || "/";
    server = u.origin;
  } catch {
    // relative URL
  }
  let sampleBody: unknown = null;
  let bodyFields: ParamInfo[] = [];
  if (c.body) {
    try {
      sampleBody = JSON.parse(c.body);
      if (isObj(sampleBody)) {
        bodyFields = Object.entries(sampleBody).map(([name, v]) => ({
          name,
          in: "body" as const,
          required: true,
          type: Array.isArray(v) ? "array" : v === null ? "string" : typeof v === "object" ? "object" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v,
        }));
      }
    } catch {
      sampleBody = c.body;
    }
  }
  const params: ParamInfo[] = [];
  try {
    for (const [name] of new URL(c.url).searchParams) params.push({ name, in: "query", required: false, type: "string" });
  } catch {
    // ignore
  }
  const secured = Object.keys(c.headers).some((h) => /^(authorization|x-api-key|api-key)$/i.test(h));
  return { method: c.method, path, summary: "", bodyFields, params, sampleBody, responses: [], secured, server };
}

/** Whatever was pasted in the API tab: OpenAPI/Swagger, a cURL command, or nothing usable. */
export function endpointsFromApiText(text: string): { endpoints: Endpoint[]; source: "openapi" | "curl" } {
  const t = text.trim();
  if (/^curl\s/i.test(t)) return { endpoints: [endpointFromCurl(parseCurl(t))], source: "curl" };
  return { endpoints: endpointsFromSpec(parseSpecText(t)), source: "openapi" };
}
