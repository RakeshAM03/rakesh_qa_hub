import { NextResponse, type NextRequest } from "next/server";

import { jsonError } from "@/lib/api";
import { GitHubError, githubConnected, listRuns } from "@/lib/ci/github";
import { findSuite, suiteNotFound } from "@/lib/ci/suites";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const PER_PAGE = 10;

/** GET /api/ci/suites/[suiteId]/runs?page= — workflow runs with job summaries and cached root causes. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/ci/suites/[suiteId]/runs">) {
  const { suiteId } = await ctx.params;
  const suite = await findSuite(suiteId);
  if (!suite) return suiteNotFound();
  if (!githubConnected()) return NextResponse.json({ connected: false, runs: [], total: 0, page: 1, perPage: PER_PAGE });

  const page = Math.min(Math.max(Number(req.nextUrl.searchParams.get("page")) || 1, 1), 100);
  try {
    const { runs, total } = await listRuns(suite.repo, suite.workflowFile, page, PER_PAGE);
    const cached = await db.rootCauseCache.findMany({
      where: { runId: { in: runs.map((r) => `${suite.repo}#${r.id}`) } },
      select: { runId: true, summary: true },
    });
    const byRun = new Map(cached.map((c) => [c.runId, c.summary]));
    return NextResponse.json({
      connected: true,
      runs: runs.map((r) => ({ ...r, rcaSummary: byRun.get(`${suite.repo}#${r.id}`) ?? null })),
      total: Math.min(total, PER_PAGE * 100),
      page,
      perPage: PER_PAGE,
    });
  } catch (err) {
    if (err instanceof GitHubError) return jsonError(502, err.message);
    throw err;
  }
}
