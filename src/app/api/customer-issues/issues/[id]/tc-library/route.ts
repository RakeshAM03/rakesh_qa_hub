import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJson } from "@/lib/api";
import { tcLibraryMarkdown } from "@/lib/customer-issues/cases";
import { loadLists } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Save to TC Library: one entry per issue — created the first time, updated afterwards. */
export async function POST(req: Request, ctx: RouteContext<"/api/customer-issues/issues/[id]/tc-library">) {
  const { id } = await ctx.params;
  const parsed = await readJson(req, z.object({ actor: z.string().trim().max(100).optional() }));
  if ("response" in parsed) return parsed.response;
  const issue = await db.customerIssue.findUnique({ where: { id }, include: { cases: { where: { retired: false }, orderBy: [{ sortOrder: "asc" }, { caseId: "asc" }] } } });
  if (!issue) return jsonError(404, "That customer issue doesn't exist (it may have been deleted).");
  if (!issue.cases.length) return jsonError(400, "Add regression cases first.");
  const lists = await loadLists();
  const output = tcLibraryMarkdown(issue, issue.cases, lists);
  const name = `Customer issue ${issue.issueKey} — regression cases`;
  const existing = issue.tcLibraryEntryId ? await db.testPlanEntry.findUnique({ where: { id: issue.tcLibraryEntryId } }) : null;
  const entry = existing
    ? await db.testPlanEntry.update({ where: { id: existing.id }, data: { name, output, prReference: issue.issueKey } })
    : await db.testPlanEntry.create({ data: { name, output, prReference: issue.issueKey, createdBy: parsed.data.actor || null } });
  if (!existing) await db.customerIssue.update({ where: { id }, data: { tcLibraryEntryId: entry.id } });
  return NextResponse.json({ entryId: entry.id, updated: Boolean(existing) });
}
