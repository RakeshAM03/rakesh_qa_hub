import "server-only";

import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";

import { BlockedError, guardedLookup, isBlockedAddress, validateTarget } from "./ssrf";

export const TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;

/** Hop-by-hop and connection-level headers we never forward. */
const STRIPPED = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
  "expect",
]);

export type OutboundRequest = {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  body?: string;
};

export type OutboundResponse = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  timeMs: number;
  sizeBytes: number;
  truncated: boolean;
  finalUrl: string;
  redirects: string[];
};

export class SendError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

type Deps = { isBlocked?: (address: string) => boolean; lookup?: LookupFunction; timeoutMs?: number };

/** Forwardable headers from the user's list (hop-by-hop stripped, last value wins). */
export function cleanHeaders(list: { key: string; value: string }[]) {
  const out: Record<string, string> = {};
  for (const { key, value } of list) {
    const k = key.trim();
    if (!k || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k) || STRIPPED.has(k.toLowerCase())) continue;
    out[k] = value.replace(/[\r\n]/g, " ");
  }
  return out;
}

/**
 * Sends one request with SSRF protection: validated URL, guarded DNS lookup
 * (checked address = connected address), manual redirects re-validated per hop,
 * 15 s overall timeout, 2 MB response cap (after decompression). Nothing about
 * the request or response is logged.
 */
export async function sendOutbound(req: OutboundRequest, deps: Deps = {}): Promise<OutboundResponse> {
  const isBlocked = deps.isBlocked ?? isBlockedAddress;
  const lookup = deps.lookup ?? guardedLookup(isBlocked);
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  if (req.body && Buffer.byteLength(req.body) > MAX_REQUEST_BODY_BYTES) throw new SendError("Request body is larger than 1 MB.", 413);

  const started = performance.now();
  const deadline = started + timeoutMs;
  const redirects: string[] = [];
  let method = req.method.toUpperCase();
  let body = req.body;
  let current = req.url;
  const headers = cleanHeaders(req.headers);

  for (let hop = 0; ; hop++) {
    let url: URL;
    try {
      url = validateTarget(current);
      // IP literals skip DNS, so check them here too (validateTarget already did, with the default policy).
      const literal = url.hostname.replace(/^\[|\]$/g, "");
      if (/^[\d.]+$|:/.test(literal) && isBlocked(literal)) throw new BlockedError("Requests to private, loopback or internal addresses are blocked.");
    } catch (e) {
      if (e instanceof BlockedError) throw new SendError(hop ? `Redirect blocked: ${e.message}` : e.message, 400);
      throw e;
    }
    const res = await once(url, method, headers, body, lookup, deadline - performance.now());
    const location = res.headers.find(([k]) => k === "location")?.[1];
    if ([301, 302, 303, 307, 308].includes(res.status) && location) {
      if (hop >= MAX_REDIRECTS) throw new SendError(`Too many redirects (more than ${MAX_REDIRECTS}).`);
      redirects.push(url.toString());
      current = new URL(location, url).toString();
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
        method = "GET";
        body = undefined;
      }
      // Don't carry credentials to another origin.
      if (new URL(current).origin !== url.origin) {
        for (const k of Object.keys(headers)) if (/^(authorization|cookie)$/i.test(k)) delete headers[k];
      }
      continue;
    }
    return { ...res, timeMs: Math.round(performance.now() - started), finalUrl: url.toString(), redirects };
  }
}

function once(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  lookup: LookupFunction,
  remainingMs: number,
): Promise<Omit<OutboundResponse, "timeMs" | "finalUrl" | "redirects">> {
  if (remainingMs <= 0) return Promise.reject(new SendError("The request timed out after 15 seconds.", 504));
  const payload = body !== undefined && !["GET", "HEAD"].includes(method) ? body : undefined;
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (e: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    };
    const request = lib.request(
      url,
      {
        method,
        headers: { ...headers, "accept-encoding": "gzip, deflate, br", ...(payload !== undefined ? { "content-length": Buffer.byteLength(payload) } : {}) },
        lookup,
        agent: false,
      },
      (res) => {
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip());
        else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
        else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const buf = Buffer.concat(chunks);
          const headerList: [string, string][] = [];
          for (let i = 0; i < res.rawHeaders.length; i += 2) headerList.push([res.rawHeaders[i].toLowerCase(), res.rawHeaders[i + 1]]);
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            headers: headerList,
            body: buf.toString("utf8"),
            sizeBytes: size,
            truncated,
          });
        };
        stream.on("data", (chunk: Buffer) => {
          if (truncated) return;
          const room = MAX_RESPONSE_BYTES - size;
          if (chunk.length > room) {
            chunks.push(chunk.subarray(0, room));
            size += room;
            truncated = true;
            done();
            request.destroy();
            return;
          }
          chunks.push(chunk);
          size += chunk.length;
        });
        stream.on("end", done);
        stream.on("error", (e: Error) => (truncated ? done() : fail(new SendError(`Couldn't read the response: ${e.message}`))));
      },
    );
    const timer = setTimeout(() => {
      fail(new SendError("The request timed out after 15 seconds.", 504));
      request.destroy();
    }, remainingMs);
    request.on("error", (e: NodeJS.ErrnoException) => {
      if (e instanceof BlockedError) return fail(new SendError(e.message, 400));
      const reason = e.code === "ENOTFOUND" ? `Couldn't resolve ${url.hostname}` : e.code === "ECONNREFUSED" ? "Connection refused" : e.message;
      fail(new SendError(reason));
    });
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}
