import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/tc-library/export — every entry as a JSON file that Import accepts. */
export async function GET() {
  const rows = await db.testPlanEntry.findMany({ orderBy: { createdAt: "asc" } });
  const entries = rows.map(({ name, prReference, output, createdBy, createdAt }) => ({
    name,
    prReference,
    output,
    createdBy,
    createdAt,
  }));
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(entries, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tc-library-${date}.json"`,
    },
  });
}
