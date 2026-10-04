import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { gatePatchSchema } from "@/lib/release-readiness/schema";
import { releaseDetail, writeEvent } from "@/lib/release-readiness/server";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That gate doesn't exist (it may have been deleted).");

/** Updates status, details or the override of one gate; every change is logged. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/release-readiness/gates/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, gatePatchSchema);
  if ("response" in parsed) return parsed.response;
  const { actor, override, config, ...fields } = parsed.data;
  const gate = await db.releaseGate.findUnique({ where: { id } });
  if (!gate) return notFound();
  const who = actor?.trim() || "Anonymous";
  const data: Record<string, unknown> = { ...fields, updatedBy: who };
  if (config !== undefined) data.config = config ?? Prisma.DbNull;
  if (override !== undefined) data.override = override ? { ...override, by: who, at: new Date().toISOString() } : Prisma.DbNull;
  try {
    await db.releaseGate.update({ where: { id }, data: data as never });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
  if (fields.status && fields.status !== gate.status) await writeEvent(gate.releaseId, "GATE_STATUS", { gate: gate.title, from: gate.status, to: fields.status }, who);
  if (override) await writeEvent(gate.releaseId, "GATE_OVERRIDE", { gate: gate.title, to: override.status, note: override.note }, who);
  if (override === null && gate.override) await writeEvent(gate.releaseId, "GATE_OVERRIDE_CLEARED", { gate: gate.title }, who);
  const other = Object.keys(fields).filter((k) => k !== "status");
  if (other.length || config !== undefined) await writeEvent(gate.releaseId, "GATE_EDITED", { gate: gate.title, fields: [...other, ...(config !== undefined ? ["config"] : [])] }, who);
  return NextResponse.json({ release: await releaseDetail(gate.releaseId) });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/release-readiness/gates/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const actor = z.string().max(100).safeParse(new URL(req.url).searchParams.get("actor") ?? "").data;
  const gate = await db.releaseGate.findUnique({ where: { id } });
  if (!gate) return notFound();
  await db.releaseGate.delete({ where: { id } });
  await writeEvent(gate.releaseId, "GATE_DELETED", { gate: gate.title }, actor);
  return NextResponse.json({ release: await releaseDetail(gate.releaseId) });
}
