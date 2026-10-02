import { NextResponse } from "next/server";

import { withFileUrl } from "@/lib/ai-pr-review/links";
import { flagPatchSchema } from "@/lib/ai-pr-review/schema";
import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That flag doesn't exist (it may have been deleted).");

export async function PATCH(req: Request, ctx: RouteContext<"/api/ai-pr-review/flags/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, flagPatchSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const flag = await db.flag.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ flag: withFileUrl(flag) });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/ai-pr-review/flags/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.flag.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
