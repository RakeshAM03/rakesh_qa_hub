import { NextResponse } from "next/server";

import { isUniqueViolation, jsonError, readJson } from "@/lib/api";
import { issueCreateSchema } from "@/lib/customer-issues/schema";
import { badReference, issueDto, lastRunResults, loadLists, releaseDatesByVersion, toDate } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** All issues (the page filters client-side; volumes are small). `?product=<id>` narrows it. */
export async function GET(req: Request) {
  const product = new URL(req.url).searchParams.get("product");
  const [lists, releaseDates, issues] = await Promise.all([
    loadLists(),
    releaseDatesByVersion(),
    db.customerIssue.findMany({ where: product ? { productId: product } : undefined, orderBy: [{ createdDate: "desc" }, { issueKey: "desc" }], include: { _count: { select: { cases: { where: { retired: false } } } } } }),
  ]);
  const last = await lastRunResults(issues.map((i) => i.id));
  return NextResponse.json({ issues: issues.map((i) => issueDto(i, lists, releaseDates, { lastRunResult: last.get(i.id) ?? null })) });
}

export async function POST(req: Request) {
  const parsed = await readJson(req, issueCreateSchema);
  if ("response" in parsed) return parsed.response;
  const { issueKey, createdDate, resolvedDate, ...rest } = parsed.data;
  const lists = await loadLists();
  const bad = badReference(rest, lists);
  if (bad) return jsonError(400, bad);
  try {
    const issue = await db.customerIssue.create({
      data: { ...rest, issueKey: issueKey.toUpperCase(), source: "MANUAL", createdDate: toDate(createdDate)!, resolvedDate: toDate(resolvedDate) ?? null },
      include: { _count: { select: { cases: true } } },
    });
    return NextResponse.json({ issue: issueDto(issue, lists, await releaseDatesByVersion()) }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, `${issueKey.toUpperCase()} already exists.`);
    throw err;
  }
}
