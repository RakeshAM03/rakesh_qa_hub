import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Copies a plan with its areas and settings. */
export async function POST(_req: Request, ctx: RouteContext<"/api/risk-planner/plans/[id]/duplicate">) {
  const { id } = await ctx.params;
  const src = await db.riskPlan.findUnique({ where: { id }, include: { areas: true } });
  if (!src) return jsonError(404, "That plan doesn't exist.");
  const plan = await db.riskPlan.create({
    data: {
      name: `${src.name} (copy)`,
      startDate: src.startDate,
      endDate: src.endDate,
      availableHours: src.availableHours,
      testers: src.testers,
      notes: src.notes,
      releaseId: src.releaseId,
      settings: src.settings ?? {},
      areas: {
        create: src.areas.map((a) => ({
          name: a.name,
          featurePageId: a.featurePageId,
          changeSize: a.changeSize,
          complexity: a.complexity,
          defectHistory: a.defectHistory,
          dependencies: a.dependencies,
          businessImpact: a.businessImpact,
          usageFrequency: a.usageFrequency,
          depthOverride: a.depthOverride,
          hoursOverride: a.hoursOverride,
          deferred: a.deferred,
          deferReason: a.deferReason,
          sortOrder: a.sortOrder,
        })),
      },
    },
    select: { id: true },
  });
  return NextResponse.json({ plan }, { status: 201 });
}
