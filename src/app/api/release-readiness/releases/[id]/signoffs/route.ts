import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { signoffSchema } from "@/lib/release-readiness/schema";
import { releaseDetail, writeEvent } from "@/lib/release-readiness/server";

export const dynamic = "force-dynamic";

/** { action: "add", role } adds a role; { action: "sign", id, name, decision, comment } signs it. */
export async function POST(req: Request, ctx: RouteContext<"/api/release-readiness/releases/[id]/signoffs">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, signoffSchema);
  if ("response" in parsed) return parsed.response;
  if (!(await db.release.count({ where: { id } }))) return jsonError(404, "That release doesn't exist.");
  const body = parsed.data;
  if (body.action === "add") {
    const count = await db.releaseSignoff.count({ where: { releaseId: id } });
    await db.releaseSignoff.create({ data: { releaseId: id, role: body.role, sortOrder: count } });
    await writeEvent(id, "SIGNOFF_ROLE_ADDED", { role: body.role }, body.actor);
  } else {
    const s = await db.releaseSignoff.findFirst({ where: { id: body.id, releaseId: id } });
    if (!s) return jsonError(404, "That sign-off doesn't exist.");
    await db.releaseSignoff.update({
      where: { id: s.id },
      data: { name: body.name, decision: body.decision, comment: body.comment || null, signedAt: body.decision === "PENDING" ? null : new Date() },
    });
    await writeEvent(id, "SIGNOFF", { role: s.role, decision: body.decision, comment: body.comment || null }, body.name);
  }
  return NextResponse.json({ release: await releaseDetail(id) });
}

/** DELETE ?signoffId= — removes a role (passcode). */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/release-readiness/releases/[id]/signoffs">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const signoffId = req.nextUrl.searchParams.get("signoffId") ?? "";
  const s = await db.releaseSignoff.findFirst({ where: { id: signoffId, releaseId: id } });
  if (!s) return jsonError(404, "That sign-off doesn't exist.");
  await db.releaseSignoff.delete({ where: { id: s.id } });
  await writeEvent(id, "SIGNOFF_ROLE_REMOVED", { role: s.role }, req.nextUrl.searchParams.get("actor"));
  return NextResponse.json({ release: await releaseDetail(id) });
}
