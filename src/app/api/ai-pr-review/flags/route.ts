import { NextResponse, type NextRequest } from "next/server";
import type { Flag, Prisma } from "@prisma/client";

import { FLAG_SEVERITIES, FLAG_TYPES } from "@/lib/ai-pr-review/constants";
import { withFileUrl } from "@/lib/ai-pr-review/links";
import { saveFlagsSchema } from "@/lib/ai-pr-review/schema";
import { readJson } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [10, 25, 50];

/** GET /api/ai-pr-review/flags?q=&severity=&repo=&type=&page=&size= */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = p.get("q")?.trim();
  const severity = p.get("severity");
  const repo = p.get("repo");
  const type = p.get("type");
  const size = PAGE_SIZES.includes(Number(p.get("size"))) ? Number(p.get("size")) : 25;
  const page = Math.max(Number(p.get("page")) || 1, 1);

  const where: Prisma.FlagWhereInput = {
    ...(severity && (FLAG_SEVERITIES as readonly string[]).includes(severity)
      ? { severity: severity as Flag["severity"] }
      : {}),
    ...(type && (FLAG_TYPES as readonly string[]).includes(type) ? { flagType: type as Flag["flagType"] } : {}),
    ...(repo ? { repo } : {}),
    ...(q
      ? {
          OR: [
            { detail: { contains: q, mode: "insensitive" } },
            { filePath: { contains: q, mode: "insensitive" } },
            { repo: { contains: q, mode: "insensitive" } },
            { suggestedFix: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [flags, total] = await Promise.all([
    db.flag.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * size,
      take: size,
    }),
    db.flag.count({ where }),
  ]);
  return NextResponse.json({ flags: flags.map(withFileUrl), total, page, size });
}

/** POST /api/ai-pr-review/flags — save one or many flags. */
export async function POST(req: Request) {
  const parsed = await readJson(req, saveFlagsSchema);
  if ("response" in parsed) return parsed.response;
  const { flags, loggedBy, source } = parsed.data;
  const { count } = await db.flag.createMany({
    data: flags.map((f) => ({ ...f, loggedBy: loggedBy?.trim() || null, source })),
  });
  return NextResponse.json({ saved: count }, { status: 201 });
}
