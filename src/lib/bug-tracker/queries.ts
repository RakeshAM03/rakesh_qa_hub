import { db } from "@/lib/db";
import { percentValid } from "./stats";

/** Total and valid issue counts per feature page, computed from Issue rows. */
export async function issueCounts(featureIds?: string[]) {
  const where = featureIds ? { featurePageId: { in: featureIds } } : {};
  const [totals, valids] = await Promise.all([
    db.issue.groupBy({ by: ["featurePageId"], where, _count: { _all: true } }),
    db.issue.groupBy({ by: ["featurePageId"], where: { ...where, isValid: true }, _count: { _all: true } }),
  ]);
  const map = new Map<string, { total: number; valid: number }>();
  for (const t of totals) map.set(t.featurePageId, { total: t._count._all, valid: 0 });
  for (const v of valids) map.get(v.featurePageId)!.valid = v._count._all;
  return (id: string) => {
    const c = map.get(id) ?? { total: 0, valid: 0 };
    return { totalIssues: c.total, validIssues: c.valid, percentValid: percentValid(c.valid, c.total) };
  };
}

/** Case-insensitive duplicate check for feature names. */
export async function featureNameTaken(name: string, excludeId?: string) {
  const count = await db.featurePage.count({
    where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
  });
  return count > 0;
}
