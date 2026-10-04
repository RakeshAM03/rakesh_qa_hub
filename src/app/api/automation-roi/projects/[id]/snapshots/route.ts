import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { snapshotSchema } from "@/lib/automation-roi/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * "Log a snapshot": records today's automated/total counts (one per day — a
 * second snapshot today replaces the first). New counts also update the project.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/automation-roi/projects/[id]/snapshots">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, snapshotSchema);
  if ("response" in parsed) return parsed.response;
  const project = await db.automationProject.findUnique({ where: { id } });
  if (!project) return jsonError(404, "That project doesn't exist.");
  const totalTests = parsed.data.totalTests ?? project.totalTests;
  const automatedTests = parsed.data.automatedTests ?? project.automatedTests;
  if (automatedTests > totalTests) return jsonError(400, "Automated test cases can't exceed the total.");
  const date = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const snapshot = await db.$transaction(async (tx) => {
    await tx.coverageSnapshot.deleteMany({ where: { projectId: id, date } });
    if (totalTests !== project.totalTests || automatedTests !== project.automatedTests) {
      await tx.automationProject.update({ where: { id }, data: { totalTests, automatedTests } });
    }
    return tx.coverageSnapshot.create({ data: { projectId: id, date, totalTests, automatedTests } });
  });
  return NextResponse.json({ snapshot }, { status: 201 });
}
