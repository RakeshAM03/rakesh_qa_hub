import { NextResponse } from "next/server";

import { readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { IMPORT_MAX_BYTES, importRequestSchema } from "@/lib/tc-library/schema";

/** POST /api/tc-library/import — bulk create from validated JSON entries. */
export async function POST(req: Request) {
  const parsed = await readJson(req, importRequestSchema, { maxBytes: IMPORT_MAX_BYTES });
  if ("response" in parsed) return parsed.response;
  const createdBy = parsed.data.createdBy?.trim() || null;
  const { count } = await db.testPlanEntry.createMany({
    data: parsed.data.entries.map((e) => ({ ...e, createdBy })),
  });
  return NextResponse.json({ imported: count }, { status: 201 });
}
