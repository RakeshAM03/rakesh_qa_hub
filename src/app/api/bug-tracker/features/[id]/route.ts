import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { featureNameTaken, issueCounts } from "@/lib/bug-tracker/queries";
import { featurePatchSchema } from "@/lib/bug-tracker/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That feature page doesn't exist (it may have been deleted).");

export async function GET(_req: Request, ctx: RouteContext<"/api/bug-tracker/features/[id]">) {
  const { id } = await ctx.params;
  const feature = await db.featurePage.findUnique({
    where: { id },
    select: { id: true, name: true, teamId: true, sheetUrl: true, createdAt: true, team: { select: { id: true, name: true } } },
  });
  if (!feature) return notFound();
  const counts = await issueCounts([id]);
  return NextResponse.json({ feature: { ...feature, ...counts(id) } });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/bug-tracker/features/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, featurePatchSchema);
  if ("response" in parsed) return parsed.response;
  const { name, teamId } = parsed.data;
  if (name && (await featureNameTaken(name, id))) return jsonError(409, `A feature page named “${name}” already exists.`);
  if (teamId && !(await db.team.count({ where: { id: teamId } }))) return jsonError(400, "That team doesn't exist.");
  try {
    const feature = await db.featurePage.update({ where: { id }, data: parsed.data, select: { id: true, name: true, teamId: true } });
    return NextResponse.json({ feature });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    if (isUniqueViolation(err)) return jsonError(409, `A feature page named “${name}” already exists.`);
    throw err;
  }
}

/** Deletes the feature page with all its issues and activity. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/bug-tracker/features/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.featurePage.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
