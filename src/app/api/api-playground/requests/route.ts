import { NextResponse, type NextRequest } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { requestCreateSchema } from "@/lib/api-playground/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET ?collectionId= — saved requests (all fields). */
export async function GET(req: NextRequest) {
  const collectionId = req.nextUrl.searchParams.get("collectionId") ?? undefined;
  const requests = await db.apiRequest.findMany({ where: collectionId ? { collectionId } : {}, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 500 });
  return NextResponse.json({ requests });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, requestCreateSchema, { maxBytes: 3 * 1024 * 1024 });
  if ("response" in parsed) return parsed.response;
  const collection = await db.apiCollection.findUnique({ where: { id: parsed.data.collectionId }, select: { id: true } });
  if (!collection) return jsonError(404, "That collection doesn't exist.");
  const count = await db.apiRequest.count({ where: { collectionId: collection.id } });
  const request = await db.apiRequest.create({ data: { ...parsed.data, sortOrder: count } });
  return NextResponse.json({ request }, { status: 201 });
}
