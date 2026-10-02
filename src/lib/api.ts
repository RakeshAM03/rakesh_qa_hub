import { NextResponse } from "next/server";
import { z } from "zod";

export function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json({ error, ...(details ? { details } : {}) }, { status });
}

/** Default max request body (bytes); TC Library output is the largest single field at 1 MB. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Reads and validates a JSON body. Returns the data, or a 4xx response to send back.
 */
export async function readJson<T extends z.ZodType>(
  req: Request,
  schema: T,
  { maxBytes = MAX_BODY_BYTES }: { maxBytes?: number } = {},
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  const tooLarge = () => ({
    response: jsonError(413, `Request is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`),
  });
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return tooLarge();
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { response: jsonError(400, "Couldn't read the request body.") };
  }
  if (Buffer.byteLength(text) > maxBytes) return tooLarge();
  let body: unknown;
  try {
    body = JSON.parse(text);
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
