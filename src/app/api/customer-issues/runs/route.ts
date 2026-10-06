import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { packForRun, runCounts, type CaseSnapshot } from "@/lib/customer-issues/runs";
import { runCreateSchema } from "@/lib/customer-issues/schema";
import { loadLists } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await db.regressionRun.findMany({ orderBy: { createdAt: "desc" }, include: { results: { select: { result: true, reason: true } } } });
  const releases = await db.release.findMany({ where: { id: { in: runs.map((r) => r.releaseId).filter((x): x is string => !!x) } }, select: { id: true, name: true, version: true } });
  const byId = new Map(releases.map((r) => [r.id, r]));
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      name: r.name,
      productIds: r.productIds,
      environment: r.environment,
      build: r.build,
      release: r.releaseId ? (byId.get(r.releaseId) ?? null) : null,
      status: r.status,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      counts: runCounts(r.results),
    })),
  });
}

/** New release run: snapshots the mandatory pack for the chosen products (none chosen = all). */
export async function POST(req: Request) {
  const parsed = await readJson(req, runCreateSchema);
  if ("response" in parsed) return parsed.response;
  const { productIds, releaseId, ...rest } = parsed.data;
  if (releaseId && !(await db.release.findUnique({ where: { id: releaseId }, select: { id: true } }))) return jsonError(400, "That release doesn't exist — reload and pick it again.");
  const lists = await loadLists();
  if (productIds.some((p) => lists.get(p)?.list !== "PRODUCT")) return jsonError(400, "Unknown product — reload and pick again.");
  const all = await db.regressionCase.findMany({ where: { mandatory: true, retired: false }, include: { issue: { select: { id: true, issueKey: true, summary: true } } }, orderBy: [{ issue: { issueKey: "asc" } }, { sortOrder: "asc" }] });
  const cases = packForRun(all, productIds);
  if (!cases.length) return jsonError(400, productIds.length ? "No mandatory regression cases for these products yet." : "The mandatory regression pack is empty — add cases to customer issues first.");
  const run = await db.regressionRun.create({
    data: {
      ...rest,
      productIds,
      releaseId: releaseId ?? null,
      results: {
        create: cases.map((c, i) => ({
          regressionCaseId: c.id,
          sortOrder: i,
          caseSnapshot: {
            caseId: c.caseId,
            title: c.title,
            category: c.category,
            type: c.type,
            priority: c.priority,
            preconditions: c.preconditions,
            steps: c.steps,
            testData: c.testData,
            expectedResult: c.expectedResult,
            automated: c.automated,
            issueId: c.issue.id,
            issueKey: c.issue.issueKey,
            issueSummary: c.issue.summary,
            product: lists.name(c.productId),
            module: c.module,
          } satisfies CaseSnapshot,
        })),
      },
    },
  });
  return NextResponse.json({ id: run.id, cases: cases.length }, { status: 201 });
}
