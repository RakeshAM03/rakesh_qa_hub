import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { caseIdFor, nextCaseNumber } from "@/lib/customer-issues/cases";
import { caseCreateSchema } from "@/lib/customer-issues/schema";
import { caseDto } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/customer-issues/issues/[id]/cases">) {
  const { id } = await ctx.params;
  const cases = await db.regressionCase.findMany({ where: { issueId: id }, orderBy: [{ retired: "asc" }, { sortOrder: "asc" }, { caseId: "asc" }] });
  return NextResponse.json({ cases: cases.map(caseDto) });
}

/** Adds cases (generated or written by hand) with the next TC_CI_<key>_<NN> IDs; mandatory by default. */
export async function POST(req: Request, ctx: RouteContext<"/api/customer-issues/issues/[id]/cases">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, caseCreateSchema);
  if ("response" in parsed) return parsed.response;
  const issue = await db.customerIssue.findUnique({ where: { id }, include: { cases: { select: { caseId: true, sortOrder: true } } } });
  if (!issue) return jsonError(404, "That customer issue doesn't exist (it may have been deleted).");
  let n = nextCaseNumber(issue.issueKey, issue.cases.map((c) => c.caseId));
  let order = issue.cases.reduce((m, c) => Math.max(m, c.sortOrder + 1), 0);
  if (n + parsed.data.cases.length > 100) return jsonError(400, "An issue can have up to 99 regression cases.");
  const created = await db.$transaction(
    parsed.data.cases.map((c) => db.regressionCase.create({ data: { ...c, issueId: id, caseId: caseIdFor(issue.issueKey, n++), productId: issue.productId, module: issue.module, sortOrder: order++ } })),
  );
  return NextResponse.json({ cases: created.map(caseDto) }, { status: 201 });
}
