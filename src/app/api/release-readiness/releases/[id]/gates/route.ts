import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { DEFAULT_CONFIG } from "@/lib/readiness";
import { gateCreateSchema, gateReorderSchema } from "@/lib/release-readiness/schema";
import { refreshAutoGates, releaseDetail, writeEvent } from "@/lib/release-readiness/server";

export const dynamic = "force-dynamic";

/** Adds a gate to this release only (the template is unchanged). */
export async function POST(req: Request, ctx: RouteContext<"/api/release-readiness/releases/[id]/gates">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, gateCreateSchema);
  if ("response" in parsed) return parsed.response;
  const { actor, config, ...g } = parsed.data;
  const release = await db.release.findUnique({ where: { id }, select: { id: true } });
  if (!release) return jsonError(404, "That release doesn't exist.");
  const last = await db.releaseGate.aggregate({ where: { releaseId: id }, _max: { sortOrder: true } });
  await db.releaseGate.create({
    data: { ...g, releaseId: id, config: config ?? DEFAULT_CONFIG[g.type] ?? undefined, sortOrder: (last._max.sortOrder ?? -1) + 1, updatedBy: actor || null },
  });
  await writeEvent(id, "GATE_ADDED", { gate: g.title, section: g.section }, actor);
  if (g.type !== "MANUAL") await refreshAutoGates(id, actor);
  return NextResponse.json({ release: await releaseDetail(id) }, { status: 201 });
}

/** Reorders gates: { order: [gateId, …] }. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/release-readiness/releases/[id]/gates">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, gateReorderSchema);
  if ("response" in parsed) return parsed.response;
  const gates = await db.releaseGate.findMany({ where: { releaseId: id }, select: { id: true } });
  const known = new Set(gates.map((g) => g.id));
  if (parsed.data.order.some((g) => !known.has(g))) return jsonError(400, "The order contains gates from another release.");
  await db.$transaction(parsed.data.order.map((gateId, i) => db.releaseGate.update({ where: { id: gateId }, data: { sortOrder: i } })));
  await writeEvent(id, "GATES_REORDERED", {}, parsed.data.actor);
  return NextResponse.json({ release: await releaseDetail(id) });
}
