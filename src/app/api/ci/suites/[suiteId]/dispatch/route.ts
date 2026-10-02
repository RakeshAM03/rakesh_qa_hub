import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { jsonError, readJson } from "@/lib/api";
import { dispatchWorkflow, GitHubError, githubConnected } from "@/lib/ci/github";
import { dispatchSchema, readDispatchInputs } from "@/lib/ci/schema";
import { findSuite, suiteNotFound } from "@/lib/ci/suites";

/** POST /api/ci/suites/[suiteId]/dispatch { ref?, inputs } — triggers workflow_dispatch. */
export async function POST(req: Request, ctx: RouteContext<"/api/ci/suites/[suiteId]/dispatch">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { suiteId } = await ctx.params;
  const parsed = await readJson(req, dispatchSchema);
  if ("response" in parsed) return parsed.response;
  const suite = await findSuite(suiteId);
  if (!suite) return suiteNotFound();
  if (!githubConnected()) return jsonError(503, "Connect GitHub (set GITHUB_TOKEN) to run workflows.");

  // Only send inputs the suite defines; choice inputs must use one of their options.
  const defined = readDispatchInputs(suite.dispatchInputs);
  const inputs: Record<string, string> = {};
  for (const def of defined) {
    const value = parsed.data.inputs[def.key] ?? def.default;
    if (!value) continue;
    if (def.type === "choice" && !def.options.includes(value)) {
      return jsonError(400, `“${value}” isn't a valid option for ${def.label || def.key}.`);
    }
    inputs[def.key] = value;
  }
  try {
    const { ref } = await dispatchWorkflow(suite.repo, suite.workflowFile, parsed.data.ref, inputs);
    return NextResponse.json({ ok: true, ref }, { status: 202 });
  } catch (err) {
    if (err instanceof GitHubError) {
      return jsonError(
        502,
        err.status === 422
          ? "GitHub rejected the run: the workflow needs a `workflow_dispatch:` trigger, and the branch and inputs must exist."
          : err.message,
      );
    }
    throw err;
  }
}
