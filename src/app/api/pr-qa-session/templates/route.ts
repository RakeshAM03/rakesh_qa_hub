import { NextResponse } from "next/server";

import { isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { templateInputSchema } from "@/lib/pr-qa-session/schema";

export const dynamic = "force-dynamic";

const select = { id: true, name: true, focusAreas: true, steps: true, context: true, specRef: true, loginUrl: true, loginMethod: true, specFolders: true } as const;

/** Saved custom templates, oldest first (built-ins live in src/config). */
export async function GET() {
  const templates = await db.sessionTemplate.findMany({ select, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, templateInputSchema);
  if ("response" in parsed) return parsed.response;
  const { name, focusAreas, steps, context, specRef, loginUrl, loginMethod, specFolders } = parsed.data;
  try {
    const template = await db.sessionTemplate.create({
      data: {
        name,
        focusAreas,
        steps: [...new Set(steps)].sort((a, b) => a - b),
        context: context?.trim() || null,
        specRef: specRef?.trim() ? specRef : null,
        loginUrl: loginUrl || null,
        loginMethod: loginMethod || null,
        specFolders: specFolders?.trim() || null,
      },
      select,
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, `A template named “${name}” already exists.`);
    throw err;
  }
}
