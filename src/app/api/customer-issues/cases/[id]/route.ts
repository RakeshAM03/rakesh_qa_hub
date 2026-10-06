import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { casePatchSchema } from "@/lib/customer-issues/schema";
import { caseDto } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That regression case doesn't exist (it may have been deleted).");

export async function PATCH(req: Request, ctx: RouteContext<"/api/customer-issues/cases/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, casePatchSchema);
  if ("response" in parsed) return parsed.response;
  const data = { ...parsed.data };
  if (data.automated && data.automated !== "YES" && data.automationRef === undefined) data.automationRef = null;
  try {
    return NextResponse.json({ case: caseDto(await db.regressionCase.update({ where: { id }, data })) });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

/** Delete — passcode. Prefer retiring (keeps history); past runs keep their snapshots either way. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/customer-issues/cases/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.regressionCase.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
