import { NextResponse } from "next/server";

import { OPEN_STATUSES } from "@/lib/bug-tracker/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Issues per assignee: open (Open + In Progress) vs closed (Resolved + Closed), valid issues only. */
export async function GET() {
  const rows = await db.issue.groupBy({
    by: ["assignee", "status", "severity"],
    where: { isValid: true },
    _count: { _all: true },
  });
  const people = new Map<string, { assignee: string | null; open: number; closed: number; openP0P1: number }>();
  for (const r of rows) {
    const key = r.assignee ?? "";
    const p = people.get(key) ?? { assignee: r.assignee, open: 0, closed: 0, openP0P1: 0 };
    const n = r._count._all;
    if (OPEN_STATUSES.includes(r.status)) {
      p.open += n;
      if (r.severity === "P0" || r.severity === "P1") p.openP0P1 += n;
    } else {
      p.closed += n;
    }
    people.set(key, p);
  }
  const workload = [...people.values()]
    .map((p) => ({ ...p, total: p.open + p.closed }))
    .sort((a, b) => (a.assignee === null ? 1 : b.assignee === null ? -1 : b.open - a.open || b.total - a.total));
  return NextResponse.json({ workload });
}
