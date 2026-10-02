import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, readJson } from "@/lib/api";
import { suitePatchSchema } from "@/lib/ci/schema";
import { findSuite, suiteNotFound, toSuiteDto, verifyOnGitHub } from "@/lib/ci/suites";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: RouteContext<"/api/ci/suites/[suiteId]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { suiteId } = await ctx.params;
  const parsed = await readJson(req, suitePatchSchema);
  if ("response" in parsed) return parsed.response;
  const existing = await findSuite(suiteId);
  if (!existing) return suiteNotFound();
  const { repo, workflowFile } = parsed.data;
  if (repo !== existing.repo || workflowFile !== existing.workflowFile) {
    const invalid = await verifyOnGitHub(repo, workflowFile);
    if (invalid) return invalid;
  }
  const suite = await db.ciSuite.update({ where: { id: suiteId }, data: parsed.data });
  return NextResponse.json({ suite: toSuiteDto(suite) });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/ci/suites/[suiteId]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { suiteId } = await ctx.params;
  try {
    await db.ciSuite.delete({ where: { id: suiteId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return suiteNotFound();
    throw err;
  }
}
