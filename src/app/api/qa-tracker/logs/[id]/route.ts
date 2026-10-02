import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { logPatchSchema, toIsoDate } from "@/lib/qa-tracker/schema";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That task doesn't exist (it may have been deleted).");

export async function PATCH(req: Request, ctx: RouteContext<"/api/qa-tracker/logs/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, logPatchSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const log = await db.taskLog.update({
      where: { id },
      data: parsed.data,
      select: { id: true, date: true, description: true, status: true, hours: true },
    });
    return NextResponse.json({ log: { ...log, date: toIsoDate(log.date) } });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/qa-tracker/logs/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.taskLog.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
