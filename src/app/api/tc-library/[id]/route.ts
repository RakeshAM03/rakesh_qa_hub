import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { entryPatchSchema } from "@/lib/tc-library/schema";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That entry doesn't exist (it may have been deleted).");

export async function GET(_req: Request, ctx: RouteContext<"/api/tc-library/[id]">) {
  const { id } = await ctx.params;
  const entry = await db.testPlanEntry.findUnique({ where: { id } });
  return entry ? NextResponse.json({ entry }) : notFound();
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/tc-library/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, entryPatchSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const entry = await db.testPlanEntry.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ entry });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/tc-library/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.testPlanEntry.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
