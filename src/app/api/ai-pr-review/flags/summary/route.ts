import { NextResponse } from "next/server";

import { FLAG_TYPES } from "@/lib/ai-pr-review/constants";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Counts per flag type across all flags (not filtered), plus the repo list for the filter. */
export async function GET() {
  const [byType, repos, total] = await Promise.all([
    db.flag.groupBy({ by: ["flagType"], _count: { _all: true } }),
    db.flag.findMany({ distinct: ["repo"], select: { repo: true }, orderBy: { repo: "asc" } }),
    db.flag.count(),
  ]);
  const counts = Object.fromEntries(FLAG_TYPES.map((t) => [t, 0])) as Record<(typeof FLAG_TYPES)[number], number>;
  for (const row of byType) counts[row.flagType] = row._count._all;
  return NextResponse.json({ total, counts, repos: repos.map((r) => r.repo) });
}
