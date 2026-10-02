import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { GitHubError } from "@/lib/ci/github";
import { RcaError, rootCause } from "@/lib/ci/rca";
import { findSuite, suiteNotFound } from "@/lib/ci/suites";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET .../runs/[id]/rca — AI root cause for a failed run (cached per run). */
export async function GET(_req: Request, ctx: RouteContext<"/api/ci/suites/[suiteId]/runs/[id]/rca">) {
  const { suiteId, id } = await ctx.params;
  const runId = Number(id);
  if (!Number.isSafeInteger(runId) || runId <= 0) return jsonError(400, "Invalid run id.");
  const suite = await findSuite(suiteId);
  if (!suite) return suiteNotFound();
  try {
    return NextResponse.json(await rootCause(suite.repo, runId));
  } catch (err) {
    if (err instanceof RcaError) return jsonError(err.status, err.message);
    if (err instanceof GitHubError) return jsonError(502, err.message);
    throw err;
  }
}
