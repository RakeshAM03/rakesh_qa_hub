import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { readJson } from "@/lib/api";
import { githubConnected } from "@/lib/ci/github";
import { rcaEnabled } from "@/lib/ci/rca";
import { suiteSchema } from "@/lib/ci/schema";
import { toSuiteDto, verifyOnGitHub } from "@/lib/ci/suites";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Saved suites in display order, plus which integrations are configured. */
export async function GET() {
  const suites = await db.ciSuite.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({
    suites: suites.map(toSuiteDto),
    githubConnected: githubConnected(),
    aiEnabled: rcaEnabled(),
  });
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const parsed = await readJson(req, suiteSchema);
  if ("response" in parsed) return parsed.response;
  const { name, repo, workflowFile, color, dispatchInputs } = parsed.data;
  const invalid = await verifyOnGitHub(repo, workflowFile);
  if (invalid) return invalid;
  const last = await db.ciSuite.aggregate({ _max: { sortOrder: true } });
  const suite = await db.ciSuite.create({
    data: { name, repo, workflowFile, color, dispatchInputs, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
  return NextResponse.json({ suite: toSuiteDto(suite) }, { status: 201 });
}
