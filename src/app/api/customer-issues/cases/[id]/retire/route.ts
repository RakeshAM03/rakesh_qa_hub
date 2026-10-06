import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { caseRetireSchema } from "@/lib/customer-issues/schema";
import { caseDto } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Retire (reason + passcode) when the feature is gone, or bring a retired case back. */
export async function POST(req: Request, ctx: RouteContext<"/api/customer-issues/cases/[id]/retire">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const parsed = await readJson(req, caseRetireSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const c = await db.regressionCase.update({ where: { id }, data: { retired: parsed.data.retired, retiredReason: parsed.data.retired ? parsed.data.reason : null } });
    return NextResponse.json({ case: caseDto(c) });
  } catch (err) {
    if (isNotFound(err)) return jsonError(404, "That regression case doesn't exist (it may have been deleted).");
    throw err;
  }
}
