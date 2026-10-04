import { NextResponse, type NextRequest } from "next/server";

import { jsonError } from "@/lib/api";
import { GitHubError, githubConnected, listRunsSince } from "@/lib/ci/github";
import { db } from "@/lib/db";
import { previousPeriod, summarize, type CiData, type Period } from "@/lib/roi";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET ?from=&to= — KPIs, chart series and table rows for the period. */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!ISO.test(from) || !ISO.test(to) || from > to) return jsonError(400, "Use ?from=YYYY-MM-DD&to=YYYY-MM-DD with from ≤ to.");
  const period: Period = { from, to };
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 3 * 366) return jsonError(400, "Pick a period of three years or less.");

  const projects = await db.automationProject.findMany({ orderBy: { name: "asc" }, include: { snapshots: { orderBy: { date: "asc" } } } });
  const connected = githubConnected();
  const suiteIds = [...new Set(projects.map((p) => p.ciSuiteId).filter((x): x is string => !!x))];
  const suites = suiteIds.length ? await db.ciSuite.findMany({ where: { id: { in: suiteIds } } }) : [];

  // CI runs since the start of the previous period (for the ↑/↓ comparison); null = use estimates.
  const since = previousPeriod(period).from;
  const runsBySuite = new Map<string, CiData>();
  const ciErrors: Record<string, string> = {};
  if (connected) {
    await Promise.all(
      suites.map(async (s) => {
        try {
          runsBySuite.set(s.id, { runs: await listRunsSince(s.repo, s.workflowFile, since, 1000) });
        } catch (e) {
          ciErrors[s.id] = e instanceof GitHubError ? e.message : "GitHub request failed";
        }
      }),
    );
  }
  const ciById = new Map<string, CiData>(projects.map((p) => [p.id, (p.ciSuiteId && runsBySuite.get(p.ciSuiteId)) || null]));
  const snapshots = projects.flatMap((p) => p.snapshots.map((s) => ({ projectId: p.id, date: s.date.toISOString().slice(0, 10), totalTests: s.totalTests, automatedTests: s.automatedTests })));
  const summary = summarize(projects, period, ciById, snapshots);

  return NextResponse.json({
    period,
    githubConnected: connected,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      ciSuiteId: p.ciSuiteId,
      ciSuiteName: suites.find((s) => s.id === p.ciSuiteId)?.name ?? null,
      ciError: p.ciSuiteId ? (ciErrors[p.ciSuiteId] ?? (p.ciSuiteId && !connected ? "GitHub isn't connected" : null)) : null,
      totalTests: p.totalTests,
      automatedTests: p.automatedTests,
      manualMinutesPerTest: p.manualMinutesPerTest,
      automatedSecondsPerTest: p.automatedSecondsPerTest,
      runsPerMonth: p.runsPerMonth,
      buildHours: p.buildHours,
      maintenanceHoursPerMonth: p.maintenanceHoursPerMonth,
      hourlyCost: p.hourlyCost,
      snapshots: p.snapshots.length,
    })),
    ...summary,
  });
}
