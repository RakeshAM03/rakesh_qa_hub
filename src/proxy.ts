import { NextResponse, type NextRequest } from "next/server";

import { clientIp, createLimiter, rulesFor, waitText } from "@/lib/rate-limit";

const check = createLimiter();

/** Rate-limits API writes, CI dispatches and AI root-cause calls per IP. */
export function proxy(request: NextRequest) {
  // Escape hatch for local/CI end-to-end test runs only — never set this in production.
  if (process.env.RATE_LIMIT_DISABLED === "1") return NextResponse.next();
  const ip = clientIp(request.headers);
  for (const rule of rulesFor(request.method, request.nextUrl.pathname)) {
    const wait = check(rule, ip);
    if (wait !== null) {
      return NextResponse.json(
        { error: `You're doing that too often. Please wait ${waitText(wait)} and try again.` },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
