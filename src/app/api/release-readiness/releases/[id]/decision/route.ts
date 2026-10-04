import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { buildSnapshot, type Snapshot } from "@/lib/readiness";
import { decisionSchema } from "@/lib/release-readiness/schema";
import { gateLike, releaseDetail, signoffDto, writeEvent } from "@/lib/release-readiness/server";

export const dynamic = "force-dynamic";

/**
 * Records the Go / No-Go decision and freezes a snapshot of the checklist.
 * Changing an existing decision needs the admin passcode and is logged.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/release-readiness/releases/[id]/decision">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, decisionSchema);
  if ("response" in parsed) return parsed.response;
  const release = await db.release.findUnique({ where: { id }, include: { gates: true, signoffs: { orderBy: { sortOrder: "asc" } }, decisions: { take: 1, orderBy: { createdAt: "desc" } } } });
  if (!release) return jsonError(404, "That release doesn't exist.");
  const previous = release.decisions[0];
  if (previous) {
    const denied = requireAdmin(req);
    if (denied) return denied;
  }
  const { decision, comment, knownIssues, actor } = parsed.data;
  const snapshot: Snapshot = buildSnapshot(
    release.gates.map((g) => ({ ...gateLike(g), note: g.note })),
    release.signoffs.map(signoffDto),
  );
  await db.$transaction(async (tx) => {
    await tx.releaseDecision.create({ data: { releaseId: id, decision, comment, knownIssues, snapshot, decidedBy: actor?.trim() || "Anonymous" } });
    await tx.release.update({ where: { id }, data: { status: decision } });
    await writeEvent(id, previous ? "DECISION_CHANGED" : "DECISION", { decision, from: previous?.decision ?? null, comment, score: snapshot.score }, actor, tx);
  });
  return NextResponse.json({ release: await releaseDetail(id) }, { status: 201 });
}
