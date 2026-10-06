import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { runStatus } from "@/lib/customer-issues/runs";
import { resultPatchSchema } from "@/lib/customer-issues/schema";
import { runDto } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Records one case result (N/A needs a reason) and recomputes the run status. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/customer-issues/runs/[id]/results/[resultId]">) {
  const { id, resultId } = await ctx.params;
  const parsed = await readJson(req, resultPatchSchema);
  if ("response" in parsed) return parsed.response;
  const current = await db.regressionRunResult.findUnique({ where: { id: resultId } });
  if (!current || current.runId !== id) return jsonError(404, "That result doesn't exist.");
  const data = parsed.data;
  const result = data.result ?? current.result;
  if (result === "NA" && !(data.reason ?? current.reason)?.trim()) return jsonError(400, "N/A needs a reason.");
  await db.regressionRunResult.update({
    where: { id: resultId },
    data: {
      ...data,
      ...(data.result && data.result !== current.result ? { executedAt: data.result === "PENDING" ? null : new Date() } : {}),
      ...(data.result && data.result !== "NA" ? { reason: data.reason ?? null } : {}),
    },
  });
  const all = await db.regressionRunResult.findMany({ where: { runId: id }, select: { result: true, reason: true } });
  await db.regressionRun.update({ where: { id }, data: { status: runStatus(all) } });
  return NextResponse.json({ run: await runDto(id) });
}
