import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { runPatchSchema } from "@/lib/customer-issues/schema";
import { runDto } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That run doesn't exist (it may have been deleted).");

export async function GET(_req: Request, ctx: RouteContext<"/api/customer-issues/runs/[id]">) {
  const { id } = await ctx.params;
  const run = await runDto(id);
  return run ? NextResponse.json({ run }) : notFound();
}

/** Rename, environment / build, link to a Release Readiness release. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/customer-issues/runs/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, runPatchSchema);
  if ("response" in parsed) return parsed.response;
  if (parsed.data.releaseId && !(await db.release.findUnique({ where: { id: parsed.data.releaseId }, select: { id: true } }))) return jsonError(400, "That release doesn't exist.");
  try {
    await db.regressionRun.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ run: await runDto(id) });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/customer-issues/runs/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.regressionRun.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
