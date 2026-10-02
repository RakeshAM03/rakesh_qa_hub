import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE = 30;

/** GET /api/bug-tracker/activity?before=<event id> — newest first, cursor paginated. */
export async function GET(req: NextRequest) {
  const before = req.nextUrl.searchParams.get("before");
  const events = await db.issueEvent.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      field: true,
      fromValue: true,
      toValue: true,
      actor: true,
      issueId: true,
      issueTitle: true,
      createdAt: true,
      featurePage: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({
    events: events.slice(0, PAGE),
    nextCursor: events.length > PAGE ? events[PAGE - 1].id : null,
  });
}
