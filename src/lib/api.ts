import { NextResponse } from "next/server";
import { z } from "zod";

export function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json({ error, ...(details ? { details } : {}) }, { status });
}

/** Max request body we accept (bytes); TC Library output is the largest field at 1 MB. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Reads and validates a JSON body. Returns the data, or a 4xx response to send back.
 */
export async function readJson<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return { response: jsonError(413, "Request is too large.") };
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { response: jsonError(400, "Request body must be valid JSON.") };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return {
      response: jsonError(400, `${where}${issue?.message ?? "Invalid request."}`, z.flattenError(result.error)),
    };
  }
  return { data: result.data };
}

/** True for Prisma's unique-constraint error. */
export function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

/** True for Prisma's "record not found" error. */
export function isNotFound(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2025";
}
