import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { requestPatchSchema } from "@/lib/api-playground/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That request doesn't exist (it may have been deleted).");

export async function GET(_req: Request, ctx: RouteContext<"/api/api-playground/requests/[id]">) {
  const { id } = await ctx.params;
  const request = await db.apiRequest.findUnique({ where: { id } });
  return request ? NextResponse.json({ request }) : notFound();
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/api-playground/requests/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, requestPatchSchema, { maxBytes: 3 * 1024 * 1024 });
  if ("response" in parsed) return parsed.response;
  try {
    const request = await db.apiRequest.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ request });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/api-playground/requests/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.apiRequest.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
