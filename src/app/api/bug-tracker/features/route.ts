import { NextResponse } from "next/server";

import { isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { featureNameTaken, issueCounts } from "@/lib/bug-tracker/queries";
import { featureSchema } from "@/lib/bug-tracker/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** All feature pages with computed issue counts (the dashboard filters by team client-side). */
export async function GET() {
  const features = await db.featurePage.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, teamId: true, createdAt: true },
  });
  const counts = await issueCounts();
  return NextResponse.json({ features: features.map((f) => ({ ...f, ...counts(f.id) })) });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, featureSchema);
  if ("response" in parsed) return parsed.response;
  const { name, teamId } = parsed.data;
  if (await featureNameTaken(name)) return jsonError(409, `A feature page named “${name}” already exists.`);
  if (teamId && !(await db.team.count({ where: { id: teamId } }))) return jsonError(400, "That team doesn't exist.");
  try {
    const feature = await db.featurePage.create({ data: { name, teamId }, select: { id: true, name: true, teamId: true, createdAt: true } });
    return NextResponse.json(
      { feature: { ...feature, totalIssues: 0, validIssues: 0, percentValid: null } },
      { status: 201 },
    );
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, `A feature page named “${name}” already exists.`);
    throw err;
  }
}
