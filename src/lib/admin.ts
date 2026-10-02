import { createHash, timingSafeEqual } from "node:crypto";

import { jsonError } from "@/lib/api";

export const ADMIN_HEADER = "x-admin-passcode";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Checks the admin passcode header. Returns a response to send back when the
 * request isn't allowed, or null when it is.
 */
export function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) {
    return jsonError(503, "Admin actions are disabled: ADMIN_PASSCODE isn't configured.");
  }
  const given = req.headers.get(ADMIN_HEADER) ?? "";
  // Compare fixed-length digests so the check takes the same time for any input.
  if (!given || !timingSafeEqual(digest(given), digest(expected))) {
    return jsonError(401, "Wrong or missing admin passcode.");
  }
  return null;
}
