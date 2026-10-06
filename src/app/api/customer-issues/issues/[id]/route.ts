import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { isNotFound, jsonError, readJson } from "@/lib/api";
import { RCA_FIELDS } from "@/lib/customer-issues/model";
import { issuePatchSchema } from "@/lib/customer-issues/schema";
import { badReference, classificationOf, issueDto, lastRunResults, loadLists, releaseDatesByVersion, toDate } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That customer issue doesn't exist (it may have been deleted).");

export async function GET(_req: Request, ctx: RouteContext<"/api/customer-issues/issues/[id]">) {
  const { id } = await ctx.params;
  const issue = await db.customerIssue.findUnique({ where: { id }, include: { _count: { select: { cases: { where: { retired: false } } } } } });
  if (!issue) return notFound();
  const [lists, releaseDates, last] = await Promise.all([loadLists(), releaseDatesByVersion(), lastRunResults([id])]);
  return NextResponse.json({ issue: issueDto(issue, lists, releaseDates, { lastRunResult: last.get(id) ?? null }) });
}

/**
 * Saves classification / tracker fields. Partial work is allowed (rule problems show inline and
 * block only "Mark RCA complete"); changing an RCA field clears a completed RCA.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/customer-issues/issues/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, issuePatchSchema);
  if ("response" in parsed) return parsed.response;
  const { createdDate, resolvedDate, ...rest } = parsed.data;
  const data = Object.fromEntries(Object.entries(rest).filter(([k]) => k !== "actor")) as Omit<typeof rest, "actor">;
  const current = await db.customerIssue.findUnique({ where: { id } });
  if (!current) return notFound();
  const lists = await loadLists();
  const bad = badReference(data, lists);
  if (bad) return jsonError(400, bad);
  const before = classificationOf(current) as Record<string, unknown>;
  const rcaChanged = RCA_FIELDS.some((f) => f in data && (data as Record<string, unknown>)[f] !== undefined && (data as Record<string, unknown>)[f] !== before[f]);
  try {
    const issue = await db.customerIssue.update({
      where: { id },
      data: {
        ...data,
        ...(createdDate ? { createdDate: toDate(createdDate)! } : {}),
        ...(resolvedDate !== undefined ? { resolvedDate: toDate(resolvedDate) } : {}),
        ...(rcaChanged && current.rcaComplete ? { rcaComplete: false, rcaCompletedAt: null } : {}),
      },
      include: { _count: { select: { cases: { where: { retired: false } } } } },
    });
    const last = await lastRunResults([id]);
    return NextResponse.json({ issue: issueDto(issue, lists, await releaseDatesByVersion(), { lastRunResult: last.get(id) ?? null }), rcaReopened: rcaChanged && current.rcaComplete });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}

/** Delete — passcode. Its regression cases go too; past runs keep their snapshots. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/customer-issues/issues/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await db.customerIssue.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) return notFound();
    throw err;
  }
}
