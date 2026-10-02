/**
 * Default seed. The hub starts empty: CI suites, teams, feature pages and
 * resources are all created by users in the app, so there is nothing to
 * insert. This only checks the database is reachable and migrated.
 *
 * For generic demo data (local testing / E2E only), see `npm run seed:demo`.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const [suites, teams, resources] = await Promise.all([
    db.ciSuite.count(),
    db.team.count(),
    db.resource.count(),
  ]);
  console.log(
    `Database reachable. Nothing to seed (CI suites: ${suites}, teams: ${teams}, resources: ${resources}).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
