import { NextResponse, type NextRequest } from "next/server";

import { STANDARD_TEMPLATE_SECTIONS, type TemplateSection } from "@/config/release-templates";
import { jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { releaseCreateSchema } from "@/lib/release-readiness/schema";
import { DEFAULT_SIGNOFF_ROLES, fromIsoDate, gatesFromTemplate, releaseSummaryDto, writeEvent } from "@/lib/release-readiness/server";

export const dynamic = "force-dynamic";

const STATUSES = ["PLANNED", "IN_TESTING", "GO", "NO_GO", "GO_WITH_ISSUES", "RELEASED"] as const;

/** GET ?status=&q= — newest first, with computed readiness. */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const releases = await db.release.findMany({
    where: {
      ...(status && (STATUSES as readonly string[]).includes(status) ? { status: status as (typeof STATUSES)[number] } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { version: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { gates: true },
  });
  return NextResponse.json({ releases: releases.map(releaseSummaryDto) });
}

/** Creates a release with gates copied from a template and the default sign-off roles. */
export async function POST(req: Request) {
  const parsed = await readJson(req, releaseCreateSchema);
  if ("response" in parsed) return parsed.response;
  const { templateId, actor, targetDate, version, owner, description, ...rest } = parsed.data;
  let sections: TemplateSection[] = STANDARD_TEMPLATE_SECTIONS;
  if (templateId) {
    const t = await db.checklistTemplate.findUnique({ where: { id: templateId } });
    if (!t) return jsonError(404, "That template doesn't exist.");
    sections = t.sections as TemplateSection[];
  }
  const release = await db.release.create({
    data: {
      ...rest,
      version: version || null,
      owner: owner || null,
      description: description || null,
      targetDate: targetDate ? fromIsoDate(targetDate) : null,
      gates: { create: gatesFromTemplate(sections) },
      signoffs: { create: DEFAULT_SIGNOFF_ROLES.map((role, i) => ({ role, sortOrder: i })) },
    },
    select: { id: true },
  });
  await writeEvent(release.id, "CREATED", { name: rest.name }, actor);
  return NextResponse.json({ release }, { status: 201 });
}
