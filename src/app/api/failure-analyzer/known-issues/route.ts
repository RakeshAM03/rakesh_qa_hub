import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { knownIssueSchema } from "@/lib/failure-analyzer/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const issues = await db.knownIssue.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ issues });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, knownIssueSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const issue = await db.knownIssue.create({ data: { ...parsed.data, notes: parsed.data.notes || null } });
    return NextResponse.json({ issue }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, "This failure is already marked as a known issue.");
    throw err;
  }
}

/** DELETE /api/failure-analyzer/known-issues?id= (passcode). */
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError(400, "Missing id.");
  try {
    await db.knownIssue.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return jsonError(404, "That known issue doesn't exist.");
    throw err;
  }
}
