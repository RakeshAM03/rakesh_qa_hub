import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { completeness } from "@/lib/customer-issues/model";
import { classificationOf, issueDto, lastRunResults, loadLists, releaseDatesByVersion } from "@/lib/customer-issues/server";
import { writeBackRca } from "@/lib/customer-issues/sync";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Marks the RCA complete — only when every required field is filled and no rule is broken. */
export async function POST(req: Request, ctx: RouteContext<"/api/customer-issues/issues/[id]/rca-complete">) {
  const { id } = await ctx.params;
  const current = await db.customerIssue.findUnique({ where: { id } });
  if (!current) return jsonError(404, "That customer issue doesn't exist (it may have been deleted).");
  const lists = await loadLists();
  const comp = completeness(classificationOf(current), lists);
  if (!comp.canComplete) {
    const problems = [...comp.missing.map((m) => `${m} is missing`), ...comp.errors.map((e) => e.message)];
    return jsonError(400, `The RCA isn't complete yet: ${problems.join("; ")}.`, { missing: comp.missing, errors: comp.errors });
  }
  const issue = await db.customerIssue.update({ where: { id }, data: { rcaComplete: true, rcaCompletedAt: new Date() }, include: { _count: { select: { cases: { where: { retired: false } } } } } });
  const [last, writeBack] = await Promise.all([lastRunResults([id]), writeBackRca(id, new URL(req.url).origin)]);
  return NextResponse.json({ issue: issueDto(issue, lists, await releaseDatesByVersion(), { lastRunResult: last.get(id) ?? null }), writeBack });
}
