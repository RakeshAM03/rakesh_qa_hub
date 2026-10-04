import { NextResponse } from "next/server";

import { isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { projectSchema } from "@/lib/automation-roi/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await db.automationProject.findMany({ orderBy: { name: "asc" }, include: { snapshots: { orderBy: { date: "asc" } } } });
  return NextResponse.json({ projects });
}

/** Adds a project and records its first coverage snapshot (today). */
export async function POST(req: Request) {
  const parsed = await readJson(req, projectSchema);
  if ("response" in parsed) return parsed.response;
  const d = parsed.data;
  if (d.ciSuiteId && !(await db.ciSuite.count({ where: { id: d.ciSuiteId } }))) return jsonError(400, "That CI suite doesn't exist.");
  try {
    const project = await db.automationProject.create({
      data: {
        ...d,
        ciSuiteId: d.ciSuiteId || null,
        snapshots: { create: { date: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`), totalTests: d.totalTests, automatedTests: d.automatedTests } },
      },
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, `A project named “${d.name}” already exists.`);
    throw err;
  }
}
