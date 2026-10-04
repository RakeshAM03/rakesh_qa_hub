import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That analysis doesn't exist (it may have been deleted).");

export async function GET(_req: Request, ctx: RouteContext<"/api/failure-analyzer/analyses/[id]">) {
  const { id } = await ctx.params;
  const analysis = await db.failureAnalysis.findUnique({ where: { id } });
  return analysis ? NextResponse.json({ analysis }) : notFound();
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/failure-analyzer/analyses/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.failureAnalysis.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
