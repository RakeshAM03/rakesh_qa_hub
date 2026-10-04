import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { planCreateSchema } from "@/lib/risk-planner/schema";
import { fromIsoDate, planRow } from "@/lib/risk-planner/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const plans = await db.riskPlan.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { areas: true, release: { select: { name: true } } } });
  return NextResponse.json({ plans: plans.map(planRow) });
}

/** Creates a plan: blank, a copy of another plan's areas, or one area per Bug Tracker feature page. */
export async function POST(req: Request) {
  const parsed = await readJson(req, planCreateSchema);
  if ("response" in parsed) return parsed.response;
  const { start, startDate, endDate, releaseId, notes, testers, ...rest } = parsed.data;
  if (releaseId && !(await db.release.count({ where: { id: releaseId } }))) return jsonError(400, "That release doesn't exist.");

  let areas: { name: string; featurePageId?: string | null; changeSize?: "NONE" | "SMALL" | "MEDIUM" | "LARGE" | "NEW_FEATURE"; complexity?: number; defectHistory?: number; dependencies?: number; businessImpact?: number; usageFrequency?: number; sortOrder: number }[] = [];
  let settings: object = {};
  if (start.from === "duplicate") {
    const src = await db.riskPlan.findUnique({ where: { id: start.planId }, include: { areas: { orderBy: { sortOrder: "asc" } } } });
    if (!src) return jsonError(404, "The plan to copy doesn't exist.");
    settings = (src.settings as object) ?? {};
    areas = src.areas.map((a, i) => ({
      name: a.name,
      featurePageId: a.featurePageId,
      changeSize: a.changeSize,
      complexity: a.complexity,
      defectHistory: a.defectHistory,
      dependencies: a.dependencies,
      businessImpact: a.businessImpact,
      usageFrequency: a.usageFrequency,
      sortOrder: i,
    }));
  } else if (start.from === "features") {
    const features = await db.featurePage.findMany({ where: { id: { in: start.featurePageIds } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    areas = features.map((f, i) => ({ name: f.name, featurePageId: f.id, sortOrder: i }));
  }
  const plan = await db.riskPlan.create({
    data: {
      ...rest,
      notes: notes || null,
      testers: testers ?? null,
      releaseId: releaseId || null,
      startDate: startDate ? fromIsoDate(startDate) : null,
      endDate: endDate ? fromIsoDate(endDate) : null,
      settings,
      areas: { create: areas },
    },
    select: { id: true },
  });
  return NextResponse.json({ plan }, { status: 201 });
}
