import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { writeEvent } from "@/lib/release-readiness/server";

export const dynamic = "force-dynamic";

/** Copies a release's details, gates (statuses reset) and sign-off roles. */
export async function POST(req: Request, ctx: RouteContext<"/api/release-readiness/releases/[id]/duplicate">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, z.object({ actor: z.string().trim().max(100).optional() }));
  if ("response" in parsed) return parsed.response;
  const src = await db.release.findUnique({ where: { id }, include: { gates: true, signoffs: true } });
  if (!src) return jsonError(404, "That release doesn't exist.");
  const copy = await db.release.create({
    data: {
      name: `${src.name} (copy)`,
      version: src.version,
      targetDate: src.targetDate,
      owner: src.owner,
      description: src.description,
      linkedCiSuiteIds: src.linkedCiSuiteIds,
      linkedFeaturePageIds: src.linkedFeaturePageIds,
      linkedRepos: src.linkedRepos,
      gates: {
        create: src.gates.map((g) => ({ section: g.section, title: g.title, type: g.type, config: g.config ?? undefined, isBlocker: g.isBlocker, weight: g.weight, owner: g.owner, sortOrder: g.sortOrder })),
      },
      signoffs: { create: src.signoffs.map((s) => ({ role: s.role, sortOrder: s.sortOrder })) },
    },
    select: { id: true },
  });
  await writeEvent(copy.id, "CREATED", { name: `${src.name} (copy)`, duplicatedFrom: src.name }, parsed.data.actor);
  return NextResponse.json({ release: copy }, { status: 201 });
}
