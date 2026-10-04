import { NextResponse } from "next/server";

import { readJson } from "@/lib/api";
import { collectionCreateSchema } from "@/lib/api-playground/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Collections with their requests' names and methods (for the sidebar). */
export async function GET() {
  const collections = await db.apiCollection.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { requests: { select: { id: true, name: true, method: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  return NextResponse.json({ collections });
}

/** Creates a collection; with `requests`, imports them too. */
export async function POST(req: Request) {
  const parsed = await readJson(req, collectionCreateSchema, { maxBytes: 10 * 1024 * 1024 });
  if ("response" in parsed) return parsed.response;
  const { name, requests = [] } = parsed.data;
  const count = await db.apiCollection.count();
  const collection = await db.apiCollection.create({
    data: { name, sortOrder: count, requests: { create: requests.map((r, i) => ({ ...r, sortOrder: i })) } },
    include: { requests: { select: { id: true, name: true, method: true } } },
  });
  return NextResponse.json({ collection }, { status: 201 });
}
