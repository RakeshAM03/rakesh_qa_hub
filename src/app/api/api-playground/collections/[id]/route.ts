import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { collectionPatchSchema } from "@/lib/api-playground/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That collection doesn't exist (it may have been deleted).");

/** Full collection with every request (for export / duplicate). */
export async function GET(_req: Request, ctx: RouteContext<"/api/api-playground/collections/[id]">) {
  const { id } = await ctx.params;
  const collection = await db.apiCollection.findUnique({ where: { id }, include: { requests: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } });
  return collection ? NextResponse.json({ collection }) : notFound();
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/api-playground/collections/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, collectionPatchSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const collection = await db.apiCollection.update({ where: { id }, data: parsed.data, select: { id: true, name: true } });
    return NextResponse.json({ collection });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/api-playground/collections/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.apiCollection.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
