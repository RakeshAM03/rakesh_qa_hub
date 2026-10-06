import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/lib/api";
import { applyCategory, RCA_FIELDS } from "@/lib/customer-issues/model";
import { bulkEditSchema } from "@/lib/customer-issues/schema";
import { badReference, classificationOf, loadLists } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Bulk edit: disposition, category (with its catchable / owner defaults unless given), product, catchable, owner team. */
export async function POST(req: Request) {
  const parsed = await readJson(req, bulkEditSchema);
  if ("response" in parsed) return parsed.response;
  const { ids, set } = parsed.data;
  const fields = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined));
  if (!Object.keys(fields).length) return jsonError(400, "Pick at least one field to change.");
  const lists = await loadLists();
  const bad = badReference(fields, lists);
  if (bad) return jsonError(400, bad);
  const issues = await db.customerIssue.findMany({ where: { id: { in: ids } } });
  await db.$transaction(
    issues.map((i) => {
      let next = { ...classificationOf(i) };
      if ("rcaCategoryId" in fields) next = applyCategory(next, (fields.rcaCategoryId as string | null) ?? null, lists);
      next = { ...next, ...fields };
      if ("dispositionId" in fields && !("regressionRequired" in fields)) next.regressionRequired = lists.key(next.dispositionId) === "VALID_BUG";
      const before = classificationOf(i) as Record<string, unknown>;
      const changed = RCA_FIELDS.some((f) => (next as Record<string, unknown>)[f] !== before[f]);
      return db.customerIssue.update({ where: { id: i.id }, data: { ...next, ...(changed && i.rcaComplete ? { rcaComplete: false, rcaCompletedAt: null } : {}) } });
    }),
  );
  return NextResponse.json({ updated: issues.length });
}
