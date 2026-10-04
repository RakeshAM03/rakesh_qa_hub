import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { updateSchemaBody } from "@/lib/testdata/schema";

export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/test-data-generator/schemas/[id]">;
const missing = () => jsonError(404, "That schema doesn't exist.");

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const schema = await db.dataSchema.findUnique({ where: { id } });
  return schema ? NextResponse.json({ schema }) : missing();
}

/** Rename / replace fields and options / toggle preset. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, updateSchemaBody);
  if ("response" in parsed) return parsed.response;
  try {
    const schema = await db.dataSchema.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ schema });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, "A schema with that name already exists.");
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
    await db.dataSchema.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return missing();
    throw err;
  }
}
