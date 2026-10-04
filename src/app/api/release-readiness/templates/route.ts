import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { templateSchema } from "@/lib/release-readiness/schema";

export const dynamic = "force-dynamic";

const duplicate = () => jsonError(409, "A template with that name already exists.");

export async function GET() {
  const templates = await db.checklistTemplate.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, templateSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const template = await db.checklistTemplate.create({ data: parsed.data });
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return duplicate();
    throw err;
  }
}

/** PATCH ?id= */
export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError(400, "Missing id.");
  const parsed = await readJson(req, templateSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const template = await db.checklistTemplate.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ template });
  } catch (err) {
    if (isUniqueViolation(err)) return duplicate();
    if (isNotFound(err)) return jsonError(404, "That template doesn't exist.");
    throw err;
  }
}

/** DELETE ?id= (passcode). */
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError(400, "Missing id.");
  try {
    await db.checklistTemplate.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return jsonError(404, "That template doesn't exist.");
    throw err;
  }
}
