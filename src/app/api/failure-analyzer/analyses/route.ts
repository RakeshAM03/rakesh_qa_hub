import { NextResponse } from "next/server";

import { readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { analysisSchema } from "@/lib/failure-analyzer/schema";

export const dynamic = "force-dynamic";

/** History: newest first, summary fields only (for the list and the trend chart). */
export async function GET() {
  const analyses = await db.failureAnalysis.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, name: true, source: true, totalFailures: true, passed: true, skipped: true, categoryCounts: true, createdBy: true, createdAt: true },
  });
  return NextResponse.json({ analyses });
}

/** Saves the summary and clusters (not the raw logs). */
export async function POST(req: Request) {
  const parsed = await readJson(req, analysisSchema, { maxBytes: 4 * 1024 * 1024 });
  if ("response" in parsed) return parsed.response;
  const { name, passed, skipped, createdBy, ...rest } = parsed.data;
  const analysis = await db.failureAnalysis.create({
    data: {
      ...rest,
      name: name || `Analysis ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
      passed: passed ?? null,
      skipped: skipped ?? null,
      createdBy: createdBy || null,
    },
    select: { id: true, name: true },
  });
  return NextResponse.json({ analysis }, { status: 201 });
}
