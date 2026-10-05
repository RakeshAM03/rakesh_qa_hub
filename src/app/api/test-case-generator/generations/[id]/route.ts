import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { generationPatch } from "@/lib/tcgen/schema";

export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/test-case-generator/generations/[id]">;
const missing = () => jsonError(404, "That generation doesn't exist.");

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const generation = await db.testCaseGeneration.findUnique({ where: { id } });
  return generation ? NextResponse.json({ generation }) : missing();
}

/** Update inputs / cases (open to everyone, like other edits in the hub). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, generationPatch, { maxBytes: 4 * 1024 * 1024 });
  if ("response" in parsed) return parsed.response;
  const { testCases, ...rest } = parsed.data;
  try {
    const generation = await db.testCaseGeneration.update({ where: { id }, data: { ...rest, ...(testCases ? { testCases: testCases as object[] } : {}) } });
    return NextResponse.json({ generation });
  } catch (err) {
    if (isNotFound(err)) return missing();
    throw err;
  }
}

/** Delete (passcode). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.testCaseGeneration.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return missing();
    throw err;
  }
}
