import { NextResponse, type NextRequest } from "next/server";

import { jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { suggestComplexityBump, suggestDefectHistory } from "@/lib/risk";

export const dynamic = "force-dynamic";

/**
 * GET ?planId= — suggested values per area from hub data:
 * defect history from the linked Bug Tracker feature page (last 90 days), and a
 * complexity bump when the plan's linked release repos had P0/P1 AI PR Review
 * flags in the last 30 days.
 */
export async function GET(req: NextRequest) {
  const planId = req.nextUrl.searchParams.get("planId");
  if (!planId) return jsonError(400, "planId is required.");
  const plan = await db.riskPlan.findUnique({ where: { id: planId }, include: { areas: true, release: { select: { linkedRepos: true } } } });
  if (!plan) return jsonError(404, "That plan doesn't exist.");

  const since90 = new Date(Date.now() - 90 * 86_400_000);
  const featureIds = [...new Set(plan.areas.map((a) => a.featurePageId).filter((x): x is string => !!x))];
  const issues = featureIds.length
    ? await db.issue.findMany({ where: { featurePageId: { in: featureIds }, createdAt: { gte: since90 } }, select: { featurePageId: true, severity: true, isValid: true, createdAt: true } })
    : [];
  const repos = plan.release?.linkedRepos ?? [];
  const flagCount = repos.length
    ? await db.flag.count({ where: { repo: { in: repos }, severity: { in: ["P0", "P1"] }, date: { gte: new Date(Date.now() - 30 * 86_400_000) } } })
    : 0;

  const suggestions: Record<string, { defectHistory?: { value: number; reason: string }; complexity?: { value: number; reason: string } }> = {};
  for (const a of plan.areas) {
    const s: (typeof suggestions)[string] = {};
    if (a.featurePageId) s.defectHistory = suggestDefectHistory(issues.filter((i) => i.featurePageId === a.featurePageId));
    const bump = suggestComplexityBump(a.complexity, flagCount);
    if (bump) s.complexity = bump;
    if (s.defectHistory || s.complexity) suggestions[a.id] = s;
  }
  return NextResponse.json({ suggestions, flagCount, linkedRepos: repos });
}
