import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { importSchema } from "@/lib/customer-issues/schema";
import { badReference, loadLists, toDate } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** CSV / Excel import (parsed and mapped in the browser): skips keys that already exist. */
export async function POST(req: Request) {
  const parsed = await readJson(req, importSchema);
  if ("response" in parsed) return parsed.response;
  const lists = await loadLists();
  const rows = parsed.data.rows.map((r) => ({ ...r, issueKey: r.issueKey.toUpperCase() }));
  for (const [n, r] of rows.entries()) {
    const bad = badReference(r, lists);
    if (bad) return jsonError(400, `Row ${n + 1} (${r.issueKey}): ${bad}`);
  }
  const existing = new Set((await db.customerIssue.findMany({ where: { issueKey: { in: rows.map((r) => r.issueKey) } }, select: { issueKey: true } })).map((e) => e.issueKey));
  const seen = new Set<string>();
  const fresh = rows.filter((r) => {
    if (existing.has(r.issueKey) || seen.has(r.issueKey)) return false;
    seen.add(r.issueKey);
    return true;
  });
  const skipped = rows.filter((r) => !fresh.includes(r)).map((r) => r.issueKey);
  if (fresh.length) {
    await db.customerIssue.createMany({
      data: fresh.map(({ createdDate, resolvedDate, source, ...r }) => ({ ...r, source: source ?? "CSV", createdDate: toDate(createdDate)!, resolvedDate: toDate(resolvedDate) ?? null })),
      skipDuplicates: true,
    });
  }
  return NextResponse.json({ added: fresh.length, skipped });
}
