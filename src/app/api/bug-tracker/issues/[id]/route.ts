import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { jsonError, readJson } from "@/lib/api";
import { diffIssue } from "@/lib/bug-tracker/events";
import { issuePatchSchema } from "@/lib/bug-tracker/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const notFound = () => jsonError(404, "That issue doesn't exist (it may have been deleted).");

/** Update an issue and record what changed in the activity feed. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/bug-tracker/issues/[id]">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, issuePatchSchema);
  if ("response" in parsed) return parsed.response;
  const { actor, ...patch } = parsed.data;

  const before = await db.issue.findUnique({ where: { id } });
  if (!before) return notFound();
  const events = diffIssue(before, patch);
  const issue = await db.$transaction(async (tx) => {
    const updated = await tx.issue.update({ where: { id }, data: patch });
    if (events.length) {
      await tx.issueEvent.createMany({
        data: events.map((e) => ({
          ...e,
          featurePageId: updated.featurePageId,
          issueId: id,
          issueTitle: updated.title,
          actor,
        })),
      });
    }
    return updated;
  });
  return NextResponse.json({ issue });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/bug-tracker/issues/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const actor = new URL(req.url).searchParams.get("actor")?.slice(0, 80) || null;
  const issue = await db.issue.findUnique({ where: { id } });
  if (!issue) return notFound();
  await db.$transaction([
    db.issueEvent.create({
      data: { featurePageId: issue.featurePageId, issueId: id, issueTitle: issue.title, type: "DELETED", actor },
    }),
    db.issue.delete({ where: { id } }),
  ]);
  return new NextResponse(null, { status: 204 });
}
