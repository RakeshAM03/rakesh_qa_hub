import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { fromIsoDate, isoDate, logEntrySchema, toIsoDate } from "@/lib/qa-tracker/schema";

export const dynamic = "force-dynamic";

/** How many dates (groups) one page of history covers. */
const DATES_PER_PAGE = 10;

/**
 * GET /api/qa-tracker/logs?resourceId=&q=&from=&to=&offset=
 * History grouped by date, newest first, paged by date groups.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const resourceId = p.get("resourceId");
  if (!resourceId) return jsonError(400, "resourceId is required.");
  const q = p.get("q")?.trim();
  const from = p.get("from");
  const to = p.get("to");
  const offset = Math.max(Number(p.get("offset")) || 0, 0);
  if ((from && !isoDate.safeParse(from).success) || (to && !isoDate.safeParse(to).success)) {
    return jsonError(400, "from/to must be YYYY-MM-DD dates.");
  }

  const where: Prisma.TaskLogWhereInput = {
    resourceId,
    ...(q ? { description: { contains: q, mode: "insensitive" } } : {}),
    ...(from || to
      ? { date: { ...(from ? { gte: fromIsoDate(from) } : {}), ...(to ? { lte: fromIsoDate(to) } : {}) } }
      : {}),
  };

  const dates = await db.taskLog.findMany({
    where,
    distinct: ["date"],
    select: { date: true },
    orderBy: { date: "desc" },
    skip: offset,
    take: DATES_PER_PAGE + 1,
  });
  const pageDates = dates.slice(0, DATES_PER_PAGE).map((d) => d.date);
  const logs = pageDates.length
    ? await db.taskLog.findMany({
        where: { ...where, date: { in: pageDates } },
        orderBy: [{ date: "desc" }, { createdAt: "asc" }],
        select: { id: true, date: true, description: true, status: true, hours: true },
      })
    : [];

  const groups = pageDates.map((date) => ({
    date: toIsoDate(date),
    logs: logs.filter((l) => l.date.getTime() === date.getTime()).map((l) => ({ ...l, date: toIsoDate(l.date) })),
  }));
  return NextResponse.json({
    groups,
    nextOffset: dates.length > DATES_PER_PAGE ? offset + DATES_PER_PAGE : null,
  });
}

/** POST /api/qa-tracker/logs — one entry (resource + date) with several task rows. */
export async function POST(req: Request) {
  const parsed = await readJson(req, logEntrySchema);
  if ("response" in parsed) return parsed.response;
  const { resourceId, date, tasks } = parsed.data;
  const resource = await db.resource.findUnique({ where: { id: resourceId }, select: { active: true } });
  if (!resource) return jsonError(404, "That resource doesn't exist.");
  if (!resource.active) return jsonError(409, "That resource is inactive. Reactivate it to log work.");
  const { count } = await db.taskLog.createMany({
    data: tasks.map((t) => ({ ...t, resourceId, date: fromIsoDate(date) })),
  });
  return NextResponse.json({ saved: count }, { status: 201 });
}
