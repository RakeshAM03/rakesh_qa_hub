import { NextResponse, type NextRequest } from "next/server";

import { jsonError } from "@/lib/api";
import { failedJobLogs, GitHubError, githubConnected } from "@/lib/ci/github";
import { findSuite, suiteNotFound } from "@/lib/ci/suites";

export const dynamic = "force-dynamic";

/** GET ?suiteId=&runId= — failed job logs of a CI Reports run (needs GITHUB_TOKEN). */
export async function GET(req: NextRequest) {
  if (!githubConnected()) return NextResponse.json({ connected: false, logs: [] });
  const suiteId = req.nextUrl.searchParams.get("suiteId") ?? "";
  const runId = Number(req.nextUrl.searchParams.get("runId"));
  if (!suiteId || !Number.isInteger(runId) || runId <= 0) return jsonError(400, "suiteId and runId are required.");
  const suite = await findSuite(suiteId);
  if (!suite) return suiteNotFound();
  try {
    const logs = await failedJobLogs(suite.repo, runId, 1_500_000);
    return NextResponse.json({ connected: true, logs });
  } catch (err) {
    if (err instanceof GitHubError) return jsonError(502, err.message);
    throw err;
  }
}
