import { NextResponse, type NextRequest } from "next/server";

import { jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { computeAnalytics } from "@/lib/qa-tracker/analytics";
import { fromIsoDate, isoDate } from "@/lib/qa-tracker/schema";

export const dynamic = "force-dynamic";

const MAX_DAYS = 366;

/** GET /api/qa-tracker/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!isoDate.safeParse(from).success || !isoDate.safeParse(to).success) {
    return jsonError(400, "from and to must be YYYY-MM-DD dates.");
  }
  const start = fromIsoDate(from);
  const end = fromIsoDate(to);
  if (end < start || (end.getTime() - start.getTime()) / 86_400_000 > MAX_DAYS) {
    return jsonError(400, `Pick a range of 1–${MAX_DAYS} days.`);
  }
  const [logs, resources] = await Promise.all([
    db.taskLog.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, hours: true, status: true, resourceId: true },
    }),
    db.resource.findMany({ select: { id: true, name: true } }),
  ]);
  return NextResponse.json(computeAnalytics(logs, resources, start, end));
}
