/**
 * Generic demo data for local testing and E2E only.
 *
 *   ALLOW_DEMO_SEED=1 npm run seed:demo            # insert (skips if already present)
 *   ALLOW_DEMO_SEED=1 npm run seed:demo -- --reset # remove demo rows only
 *
 * Never run automatically, and refuses to run on a production deployment.
 * Every row is clearly generic ("Demo Team", "Sample Feature", "Demo Resource 1",
 * "Demo Suite", repo "demo-repo") so it can be found and removed again.
 */
import {
  FlagSource,
  FlagType,
  IssueEventType,
  IssueStatus,
  PrismaClient,
  Severity,
  TaskStatus,
} from "@prisma/client";

const db = new PrismaClient();

const TEAMS = ["Demo Team", "Demo Team 2"];
const RESOURCES = ["Demo Resource 1", "Demo Resource 2", "Demo Resource 3"];
const SUITE = "Demo Suite";
const FLAG_REPOS = ["demo-repo", "demo-api"];
const TC_PREFIX = "Sample Test Plan";
/** name → [team index | null, issue count, invalid count] */
const FEATURES: Array<[string, number | null, number, number]> = [
  ["Sample Feature", 0, 20, 0], // 100% valid → green
  ["Sample Feature 2", 0, 12, 1], // 92% → amber
  ["Sample : Feature 3", 0, 8, 3], // 63% → red
  ["Sample Feature (no team)", null, 0, 0], // no issues → "—"
];

/** Small deterministic PRNG so the demo data is the same on every run. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);
const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

function guard() {
  if (process.env.ALLOW_DEMO_SEED !== "1") {
    console.error(
      "Refusing to run: set ALLOW_DEMO_SEED=1 to confirm this database is for local testing or E2E.",
    );
    process.exit(1);
  }
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    console.error("Refusing to run demo seed in a production environment.");
    process.exit(1);
  }
}

async function reset() {
  await db.featurePage.deleteMany({
    where: { name: { in: FEATURES.map(([name]) => name) } },
  });
  await db.team.deleteMany({ where: { name: { in: TEAMS } } });
  await db.resource.deleteMany({ where: { name: { in: RESOURCES } } });
  await db.flag.deleteMany({ where: { repo: { in: FLAG_REPOS } } });
  await db.testPlanEntry.deleteMany({ where: { name: { startsWith: TC_PREFIX } } });
  await db.ciSuite.deleteMany({ where: { name: SUITE } });
  console.log("Demo data removed.");
}

async function seedBugTracker() {
  const teams = await Promise.all(
    TEAMS.map((name) => db.team.create({ data: { name } })),
  );
  const people = ["Demo Reporter", "Demo Assignee A", "Demo Assignee B", null];

  for (const [name, teamIndex, total, invalid] of FEATURES) {
    const feature = await db.featurePage.create({
      data: { name, teamId: teamIndex === null ? null : teams[teamIndex].id },
    });
    for (let i = 0; i < total; i++) {
      const isValid = i >= invalid;
      const status = pick(Object.values(IssueStatus));
      const createdAt = daysAgo(Math.floor(rand() * 14));
      const issue = await db.issue.create({
        data: {
          featurePageId: feature.id,
          title: `Sample issue ${i + 1} in ${name}`,
          description: "Generic demo issue for local testing.",
          severity: pick(Object.values(Severity)),
          status,
          isValid,
          reporter: "Demo Reporter",
          assignee: pick(people),
          createdAt,
        },
      });
      const base = { featurePageId: feature.id, issueId: issue.id, issueTitle: issue.title };
      await db.issueEvent.create({
        data: { ...base, type: IssueEventType.CREATED, actor: "Demo Reporter", createdAt },
      });
      if (status !== IssueStatus.OPEN) {
        await db.issueEvent.create({
          data: {
            ...base,
            type: IssueEventType.STATUS_CHANGED,
            field: "status",
            fromValue: IssueStatus.OPEN,
            toValue: status,
            actor: issue.assignee ?? "Demo Reporter",
          },
        });
      }
      if (!isValid) {
        await db.issueEvent.create({
          data: { ...base, type: IssueEventType.MARKED_INVALID, actor: "Demo Reporter" },
        });
      }
    }
  }
}

async function seedQaTracker() {
  const tasks = [
    "Sample Product : Module : Regression run",
    "Sample Product : Checkout : Exploratory testing",
    "Sample Product : Search : Test case review",
    "Bug verification",
    "Test plan for sample feature",
  ];
  for (const [index, name] of RESOURCES.entries()) {
    const resource = await db.resource.create({
      data: { name, email: `demo${index + 1}@example.com` },
    });
    for (let day = 0; day < 14; day++) {
      const date = daysAgo(day);
      if ([0, 6].includes(date.getUTCDay())) continue; // weekdays only
      const count = 1 + Math.floor(rand() * 3);
      for (let t = 0; t < count; t++) {
        await db.taskLog.create({
          data: {
            resourceId: resource.id,
            date,
            description: pick(tasks),
            status: day > 2 ? TaskStatus.COMPLETED : pick(Object.values(TaskStatus)),
            hours: pick([0.5, 0.75, 1, 1.5, 2, 3]),
          },
        });
      }
    }
  }
}

async function seedFlags() {
  const files = ["src/app/page.tsx", "src/lib/api.ts", "src/services/orders.ts", "src/utils/date.ts"];
  const details: Record<FlagType, string> = {
    LOGIC_ERROR: "Sample: condition is inverted, so the empty case takes the wrong branch.",
    REGRESSION_RISK: "Sample: shared helper signature changed; existing callers still pass the old shape.",
    SECURITY: "Sample: user input is concatenated into a query string without encoding.",
    MISSING_ERROR_HANDLING: "Sample: the fetch call has no catch, so a network error leaves the spinner forever.",
    REQUIREMENT_FIDELITY: "Sample: the PR says the field is optional, but the form requires it.",
  };
  for (let i = 0; i < 30; i++) {
    const flagType = pick(Object.values(FlagType));
    await db.flag.create({
      data: {
        date: daysAgo(Math.floor(rand() * 30)),
        repo: pick(FLAG_REPOS),
        prNumber: 1 + Math.floor(rand() * 99),
        filePath: pick(files),
        line: 1 + Math.floor(rand() * 200),
        flagType,
        detail: details[flagType],
        severity: rand() < 0.3 ? Severity.P0 : Severity.P1,
        suggestedFix: "Sample: add the missing check and a unit test for it.",
        loggedBy: "Demo Reviewer",
        source: rand() < 0.7 ? FlagSource.CLAUDE_OUTPUT : FlagSource.MANUAL,
      },
    });
  }
}

async function seedTcLibrary() {
  for (let i = 1; i <= 2; i++) {
    await db.testPlanEntry.create({
      data: {
        name: `${TC_PREFIX} ${i}`,
        prReference: `demo-repo #${40 + i}`,
        output: `## Step 1 — PR Analysis\n\nSample analysis ${i}: the PR changes a demo form.\n\n## Step 2 — Test Plan\n\n| # | Scenario | Priority |\n|---|---|---|\n| 1 | Submit valid form | P1 |\n| 2 | Submit empty form | P2 |\n`,
        createdBy: "Demo Reviewer",
      },
    });
  }
}

async function seedCi() {
  await db.ciSuite.create({
    data: {
      name: SUITE,
      repo: "demo-owner/demo-repo",
      workflowFile: "regression.yml",
      color: "blue",
      dispatchInputs: [
        { key: "environment", label: "Environment", type: "choice", options: ["qa", "staging"], default: "qa" },
      ],
      sortOrder: 0,
    },
  });
}

async function main() {
  guard();
  if (process.argv.includes("--reset")) return reset();

  if (await db.team.findUnique({ where: { name: TEAMS[0] } })) {
    console.log("Demo data already present. Use --reset to remove it first.");
    return;
  }
  await seedBugTracker();
  await seedQaTracker();
  await seedFlags();
  await seedTcLibrary();
  await seedCi();
  console.log("Demo data inserted.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
