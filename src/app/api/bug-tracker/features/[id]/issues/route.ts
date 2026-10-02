import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { issueCreateSchema } from "@/lib/bug-tracker/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/bug-tracker/features/[id]/issues">) {
  const { id } = await ctx.params;
  if (!(await db.featurePage.count({ where: { id } }))) return jsonError(404, "That feature page doesn't exist.");
  const issues = await db.issue.findMany({ where: { featurePageId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ issues });
}

export async function POST(req: Request, ctx: RouteContext<"/api/bug-tracker/features/[id]/issues">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, issueCreateSchema);
  if ("response" in parsed) return parsed.response;
  const { actor, ...data } = parsed.data;
  if (!(await db.featurePage.count({ where: { id } }))) return jsonError(404, "That feature page doesn't exist.");
  const issue = await db.$transaction(async (tx) => {
    const created = await tx.issue.create({ data: { ...data, featurePageId: id } });
    await tx.issueEvent.create({
      data: {
        featurePageId: id,
        issueId: created.id,
        issueTitle: created.title,
        type: "CREATED",
        actor: actor ?? data.reporter,
      },
    });
    return created;
  });
  return NextResponse.json({ issue }, { status: 201 });
}
