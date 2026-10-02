import { NextResponse } from "next/server";

import { isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { teamSchema } from "@/lib/bug-tracker/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Teams with their feature page counts, alphabetical. */
export async function GET() {
  const teams = await db.team.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { features: true } } },
  });
  return NextResponse.json({
    teams: teams.map((t) => ({ id: t.id, name: t.name, featureCount: t._count.features })),
  });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, teamSchema);
  if ("response" in parsed) return parsed.response;
  const { name } = parsed.data;
  const exists = await db.team.count({ where: { name: { equals: name, mode: "insensitive" } } });
  if (exists) return jsonError(409, `A team named “${name}” already exists.`);
  try {
    const team = await db.team.create({ data: { name } });
    return NextResponse.json({ team: { id: team.id, name: team.name, featureCount: 0 } }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, `A team named “${name}” already exists.`);
    throw err;
  }
}
