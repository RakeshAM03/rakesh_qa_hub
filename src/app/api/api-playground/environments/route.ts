import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { environmentSchema } from "@/lib/api-playground/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const duplicate = () => jsonError(409, "An environment with that name already exists.");

export async function GET() {
  const environments = await db.apiEnvironment.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ environments });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, environmentSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const environment = await db.apiEnvironment.create({ data: parsed.data });
    return NextResponse.json({ environment }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return duplicate();
    throw err;
  }
}

/** PATCH ?id= — rename / replace variables. */
export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError(400, "Missing id.");
  const parsed = await readJson(req, environmentSchema.partial());
  if ("response" in parsed) return parsed.response;
  try {
    const environment = await db.apiEnvironment.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ environment });
  } catch (err) {
    if (isUniqueViolation(err)) return duplicate();
    if (isNotFound(err)) return jsonError(404, "That environment doesn't exist.");
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
    await db.apiEnvironment.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return jsonError(404, "That environment doesn't exist.");
    throw err;
  }
}
