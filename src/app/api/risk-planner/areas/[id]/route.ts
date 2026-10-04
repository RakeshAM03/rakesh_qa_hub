import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { areaPatchSchema } from "@/lib/risk-planner/schema";
import { areaInput } from "@/lib/risk-planner/server";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That area doesn't exist (it may have been deleted).");

/** Inline edits (auto-saved from the table). Deferring needs a reason. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/risk-planner/areas/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, areaPatchSchema);
  if ("response" in parsed) return parsed.response;
  const data = parsed.data;
  if (data.deferred === true) {
    const current = await db.riskArea.findUnique({ where: { id }, select: { deferReason: true } });
    if (!current) return notFound();
    if (!(data.deferReason ?? current.deferReason ?? "").trim()) return jsonError(400, "A reason is required to defer an area.");
  }
  try {
    const area = await db.riskArea.update({ where: { id }, data });
    return NextResponse.json({ area: areaInput(area) });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/risk-planner/areas/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.riskArea.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
