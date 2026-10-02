import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { resourcePatchSchema } from "@/lib/qa-tracker/schema";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That resource doesn't exist (it may have been deleted).");

export async function PATCH(req: Request, ctx: RouteContext<"/api/qa-tracker/resources/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, resourcePatchSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const resource = await db.resource.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ resource });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    if (isUniqueViolation(err)) return jsonError(409, `A resource named “${parsed.data.name}” already exists.`);
    throw err;
  }
}

/** Deletes the resource and all of its logs. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/qa-tracker/resources/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.resource.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
