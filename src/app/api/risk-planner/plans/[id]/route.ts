import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { planPatchSchema } from "@/lib/risk-planner/schema";
import { fromIsoDate, planDto } from "@/lib/risk-planner/server";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That plan doesn't exist (it may have been deleted).");
const include = { areas: true, release: { select: { id: true, name: true, linkedRepos: true } } } as const;

export async function GET(_req: Request, ctx: RouteContext<"/api/risk-planner/plans/[id]">) {
  const { id } = await ctx.params;
  const plan = await db.riskPlan.findUnique({ where: { id }, include });
  return plan ? NextResponse.json({ plan: planDto(plan) }) : notFound();
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/risk-planner/plans/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, planPatchSchema);
  if ("response" in parsed) return parsed.response;
  const { startDate, endDate, settings, releaseId, ...rest } = parsed.data;
  if (releaseId && !(await db.release.count({ where: { id: releaseId } }))) return jsonError(400, "That release doesn't exist.");
  const data: Record<string, unknown> = { ...rest };
  if (startDate !== undefined) data.startDate = startDate ? fromIsoDate(startDate) : null;
  if (endDate !== undefined) data.endDate = endDate ? fromIsoDate(endDate) : null;
  if (releaseId !== undefined) data.releaseId = releaseId || null;
  if (settings !== undefined) data.settings = settings;
  try {
    const plan = await db.riskPlan.update({ where: { id }, data, include });
    return NextResponse.json({ plan: planDto(plan) });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/risk-planner/plans/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.riskPlan.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
