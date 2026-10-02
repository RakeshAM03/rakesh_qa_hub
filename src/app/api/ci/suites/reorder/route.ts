import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { jsonError, readJson } from "@/lib/api";
import { reorderSchema } from "@/lib/ci/schema";
import { db } from "@/lib/db";

/** POST /api/ci/suites/reorder { ids } — saves the given order as sortOrder 0..n. */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const parsed = await readJson(req, reorderSchema);
  if ("response" in parsed) return parsed.response;
  const { ids } = parsed.data;
  const existing = await db.ciSuite.findMany({ select: { id: true } });
  const known = new Set(existing.map((s) => s.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
    return jsonError(409, "The suite list changed. Refresh and try again.");
  }
  await db.$transaction(ids.map((id, sortOrder) => db.ciSuite.update({ where: { id }, data: { sortOrder } })));
  return NextResponse.json({ ok: true });
}
