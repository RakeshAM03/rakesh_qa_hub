import { NextResponse, type NextRequest } from "next/server";

import { isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { resourceSchema } from "@/lib/qa-tracker/schema";

export const dynamic = "force-dynamic";

/** GET /api/qa-tracker/resources?all=1 — active resources (or all, for the manage dialog). */
export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "1";
  const resources = await db.resource.findMany({
    where: all ? {} : { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, active: true, _count: { select: { logs: true } } },
  });
  return NextResponse.json({ resources });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, resourceSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const resource = await db.resource.create({ data: parsed.data });
    return NextResponse.json({ resource }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, `A resource named “${parsed.data.name}” already exists.`);
    throw err;
  }
}
