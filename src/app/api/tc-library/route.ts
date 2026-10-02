import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { entryInputSchema } from "@/lib/tc-library/schema";

export const dynamic = "force-dynamic";

const PREVIEW_CHARS = 280;
const SORTS = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  name: { name: "asc" },
} satisfies Record<string, Prisma.TestPlanEntryOrderByWithRelationInput>;

/** GET /api/tc-library?q=&page=&size=&sort=newest|oldest|name */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const size = Math.min(Math.max(Number(params.get("size")) || 10, 1), 50);
  const page = Math.max(Number(params.get("page")) || 1, 1);
  const sort = SORTS[params.get("sort") as keyof typeof SORTS] ?? SORTS.newest;

  const where: Prisma.TestPlanEntryWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { prReference: { contains: q, mode: "insensitive" } },
          { output: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    db.testPlanEntry.findMany({
      where,
      orderBy: [sort, { id: "asc" }],
      skip: (page - 1) * size,
      take: size,
    }),
    db.testPlanEntry.count({ where }),
  ]);

  const entries = rows.map(({ output, ...rest }) => ({
    ...rest,
    preview: output.slice(0, PREVIEW_CHARS),
    outputLength: output.length,
  }));
  return NextResponse.json({ entries, total, page, size });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, entryInputSchema);
  if ("response" in parsed) return parsed.response;
  const { createdBy, ...data } = parsed.data;
  const entry = await db.testPlanEntry.create({
    data: { ...data, createdBy: createdBy?.trim() || null },
  });
  return NextResponse.json({ entry }, { status: 201 });
}
