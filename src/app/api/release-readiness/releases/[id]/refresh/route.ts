import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJson } from "@/lib/api";
import { refreshAutoGates, releaseDetail } from "@/lib/release-readiness/server";

export const dynamic = "force-dynamic";

/** "Refresh checks": recomputes every auto gate. */
export async function POST(req: Request, ctx: RouteContext<"/api/release-readiness/releases/[id]/refresh">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, z.object({ actor: z.string().trim().max(100).optional() }));
  if ("response" in parsed) return parsed.response;
  const done = await refreshAutoGates(id, parsed.data.actor);
  if (!done) return jsonError(404, "That release doesn't exist.");
  return NextResponse.json({ release: await releaseDetail(id) });
}
