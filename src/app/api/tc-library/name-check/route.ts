import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/tc-library/name-check?name=&excludeId= — is the name already used? (a hint, not a rule) */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  const excludeId = req.nextUrl.searchParams.get("excludeId") ?? undefined;
  if (!name) return NextResponse.json({ exists: false });
  const count = await db.testPlanEntry.count({
    where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
  });
  return NextResponse.json({ exists: count > 0 });
}
