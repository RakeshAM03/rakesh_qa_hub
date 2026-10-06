import { NextResponse } from "next/server";

import { caseDto } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Every regression case with its issue (the page filters; retired cases are history). */
export async function GET() {
  const cases = await db.regressionCase.findMany({
    orderBy: [{ issue: { issueKey: "asc" } }, { sortOrder: "asc" }],
    include: { issue: { select: { id: true, issueKey: true, summary: true, severity: true, rcaCategoryId: true, rcaSubcategoryId: true } } },
  });
  return NextResponse.json({
    cases: cases.map((c) => ({ ...caseDto(c), issue: c.issue })),
  });
}
