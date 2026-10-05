import { NextResponse } from "next/server";

import { readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { generationBody } from "@/lib/tcgen/schema";

export const dynamic = "force-dynamic";

/** History list (newest first) with counts; full generations come from /[id]. */
export async function GET() {
  const rows = await db.testCaseGeneration.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, name: true, mode: true, testCases: true, createdBy: true, createdAt: true, updatedAt: true },
  });
  const generations = rows.map(({ testCases, ...g }) => {
    const cases = Array.isArray(testCases) ? (testCases as { category?: string }[]) : [];
    return {
      ...g,
      counts: {
        total: cases.length,
        functional: cases.filter((c) => c.category === "Functional").length,
        nonFunctional: cases.filter((c) => c.category === "Non-Functional").length,
        api: cases.filter((c) => c.category === "API").length,
      },
    };
  });
  return NextResponse.json({ generations });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, generationBody, { maxBytes: 4 * 1024 * 1024 });
  if ("response" in parsed) return parsed.response;
  const { createdBy, testCases, ...data } = parsed.data;
  const generation = await db.testCaseGeneration.create({ data: { ...data, testCases: testCases as object[], createdBy: createdBy || null } });
  return NextResponse.json({ generation }, { status: 201 });
}
