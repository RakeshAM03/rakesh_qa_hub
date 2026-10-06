import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { listItemCreateSchema } from "@/lib/customer-issues/schema";
import { listDto } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await db.listItem.findMany({ orderBy: [{ list: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json({ items: items.map(listDto) });
}

/** Adding items is open (like other modules' create); editing and deleting need the passcode. */
export async function POST(req: Request) {
  const parsed = await readJson(req, listItemCreateSchema);
  if ("response" in parsed) return parsed.response;
  const { list, name, description, parentId, defaultCatchable, defaultOwnerId } = parsed.data;
  if (list === "RCA_SUBCATEGORY") {
    const parent = parentId ? await db.listItem.findUnique({ where: { id: parentId } }) : null;
    if (!parent || parent.list !== "RCA_CATEGORY") return jsonError(400, "Pick the main category for this sub-category.");
  }
  const scope = { list, parentId: list === "RCA_SUBCATEGORY" ? parentId : null };
  const existing = await db.listItem.findMany({ where: scope, select: { name: true, sortOrder: true } });
  if (existing.some((e) => e.name.toLowerCase() === name.toLowerCase())) return jsonError(409, `"${name}" is already in this list.`);
  const item = await db.listItem.create({
    data: {
      ...scope,
      name,
      description: description?.trim() || null,
      defaultCatchable: list === "RCA_CATEGORY" ? (defaultCatchable ?? null) : null,
      defaultOwnerId: list === "RCA_CATEGORY" ? (defaultOwnerId ?? null) : null,
      sortOrder: existing.reduce((m, e) => Math.max(m, e.sortOrder + 1), 0),
    },
  });
  return NextResponse.json({ item: listDto(item) }, { status: 201 });
}
