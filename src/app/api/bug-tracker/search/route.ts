import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/bug-tracker/search?q= — issue titles and feature names across all teams. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
  if (!q) return NextResponse.json({ features: [], issues: [] });
  const contains = { contains: q, mode: "insensitive" as const };
  const [features, issues] = await Promise.all([
    db.featurePage.findMany({
      where: { name: contains },
      take: 6,
      orderBy: { name: "asc" },
      select: { id: true, name: true, team: { select: { name: true } } },
    }),
    db.issue.findMany({
      where: { title: contains },
      take: 8,
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, severity: true, status: true, featurePage: { select: { id: true, name: true } } },
    }),
  ]);
  return NextResponse.json({ features, issues });
}
