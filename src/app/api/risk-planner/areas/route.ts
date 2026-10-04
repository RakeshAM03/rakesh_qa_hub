import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { areaCreateSchema } from "@/lib/risk-planner/schema";
import { areaInput } from "@/lib/risk-planner/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await readJson(req, areaCreateSchema);
  if ("response" in parsed) return parsed.response;
  const { planId, ...data } = parsed.data;
  if (!(await db.riskPlan.count({ where: { id: planId } }))) return jsonError(404, "That plan doesn't exist.");
  const last = await db.riskArea.aggregate({ where: { planId }, _max: { sortOrder: true } });
  const area = await db.riskArea.create({ data: { ...data, planId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
  return NextResponse.json({ area: areaInput(area) }, { status: 201 });
}
