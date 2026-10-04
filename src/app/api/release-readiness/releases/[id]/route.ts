import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { releasePatchSchema } from "@/lib/release-readiness/schema";
import { fromIsoDate, refreshAutoGates, releaseDetail, writeEvent } from "@/lib/release-readiness/server";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That release doesn't exist (it may have been deleted).");

/** GET ?refresh=1 recomputes the auto gates first (the page does this when it opens). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/release-readiness/releases/[id]">) {
  const { id } = await ctx.params;
  if (req.nextUrl.searchParams.get("refresh") === "1") await refreshAutoGates(id);
  const release = await releaseDetail(id);
  return release ? NextResponse.json({ release }) : notFound();
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/release-readiness/releases/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, releasePatchSchema);
  if ("response" in parsed) return parsed.response;
  const { actor, targetDate, releasedAt, ...fields } = parsed.data;
  const current = await db.release.findUnique({ where: { id }, select: { status: true } });
  if (!current) return notFound();
  const data: Record<string, unknown> = { ...fields };
  if (targetDate !== undefined) data.targetDate = targetDate ? fromIsoDate(targetDate) : null;
  if (releasedAt) {
    if (current.status !== "GO" && current.status !== "GO_WITH_ISSUES" && current.status !== "RELEASED") {
      return jsonError(409, "Record a Go decision before marking the release as released.");
    }
    data.releasedAt = fromIsoDate(releasedAt);
    data.status = "RELEASED";
  }
  if (fields.status && current.status !== "PLANNED" && current.status !== "IN_TESTING") {
    return jsonError(409, "The status is set by the decision once one is recorded.");
  }
  try {
    await db.release.update({ where: { id }, data });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
  const changed = Object.keys(parsed.data).filter((k) => k !== "actor");
  if (releasedAt) await writeEvent(id, "RELEASED", { releasedAt }, actor);
  else if (fields.status) await writeEvent(id, "STATUS_CHANGED", { from: current.status, to: fields.status }, actor);
  if (changed.some((k) => !["status", "releasedAt"].includes(k))) await writeEvent(id, "EDITED", { fields: changed.filter((k) => !["status", "releasedAt"].includes(k)) }, actor);
  return NextResponse.json({ release: await releaseDetail(id) });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/release-readiness/releases/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.release.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
