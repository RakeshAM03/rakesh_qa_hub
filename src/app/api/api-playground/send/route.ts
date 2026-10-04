import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { sendSchema } from "@/lib/api-playground/schema";
import { MAX_REQUEST_BODY_BYTES, SendError, sendOutbound } from "@/lib/api-playground/send";

export const dynamic = "force-dynamic";

/**
 * Proxies one request for the API Playground (so CORS doesn't block it).
 * SSRF-protected (see src/lib/api-playground/ssrf.ts), rate-limited in the proxy,
 * and never logs request headers or bodies. The visitor's own cookies are never
 * forwarded — only the headers built in the playground are sent.
 */
export async function POST(req: Request) {
  const parsed = await readJson(req, sendSchema, { maxBytes: MAX_REQUEST_BODY_BYTES + 256 * 1024 });
  if ("response" in parsed) return parsed.response;
  try {
    const response = await sendOutbound(parsed.data);
    return NextResponse.json({ response });
  } catch (err) {
    if (err instanceof SendError) return jsonError(err.status, err.message);
    return jsonError(502, "The request failed.");
  }
}
