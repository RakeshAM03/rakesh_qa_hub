import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { projectPatchSchema } from "@/lib/automation-roi/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That project doesn't exist (it may have been deleted).");

/** Edit (passcode). */
export async function PATCH(req: Request, ctx: RouteContext<"/api/automation-roi/projects/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const parsed = await readJson(req, projectPatchSchema);
  if ("response" in parsed) return parsed.response;
  const current = await db.automationProject.findUnique({ where: { id } });
  if (!current) return notFound();
  const next = { ...current, ...parsed.data };
  if (next.automatedTests > next.totalTests) return jsonError(400, "automatedTests: Automated test cases can't exceed the total");
  if (parsed.data.ciSuiteId && !(await db.ciSuite.count({ where: { id: parsed.data.ciSuiteId } }))) return jsonError(400, "That CI suite doesn't exist.");
  try {
    const project = await db.automationProject.update({ where: { id }, data: { ...parsed.data, ...(parsed.data.ciSuiteId === "" ? { ciSuiteId: null } : {}) } });
    return NextResponse.json({ project });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, "Another project already has that name.");
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/automation-roi/projects/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.automationProject.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
