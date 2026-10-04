import { NextResponse } from "next/server";

import { isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { createSchemaBody } from "@/lib/testdata/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const schemas = await db.dataSchema.findMany({ orderBy: [{ isPreset: "desc" }, { name: "asc" }] });
  return NextResponse.json({ schemas });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, createSchemaBody);
  if ("response" in parsed) return parsed.response;
  const { createdBy, ...data } = parsed.data;
  try {
    const schema = await db.dataSchema.create({ data: { ...data, createdBy: createdBy || null } });
    return NextResponse.json({ schema }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, "A schema with that name already exists.");
    throw err;
  }
}
