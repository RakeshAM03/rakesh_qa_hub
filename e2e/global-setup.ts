import { execSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

import { DEFAULT_LISTS } from "../src/config/customer-issues";
import { STANDARD_TEMPLATE_NAME, STANDARD_TEMPLATE_SECTIONS } from "../src/config/release-templates";

/**
 * Prepares the throwaway E2E database: applies migrations, then empties every
 * app table so each run starts from the real "first visit" state (plus the
 * built-in "Standard release" template, which production gets from a migration).
 * Refuses to touch anything that isn't a local/CI database.
 */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://rakesham@localhost:5432/qa_hub_test";
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "postgres"].includes(host)) {
    throw new Error(`Refusing to empty a non-local database (${host}). E2E runs need a throwaway local Postgres.`);
  }
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });

  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length) {
      const list = tables.map((t) => `"public"."${t.tablename.replace(/"/g, '""')}"`).join(", ");
      await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
    // The built-in checklist template is inserted by a migration on real databases.
    await db.checklistTemplate.create({
      data: { id: "builtin_standard_release", name: STANDARD_TEMPLATE_NAME, sections: STANDARD_TEMPLATE_SECTIONS },
    });
    // Customer Issue RCA: default lists and the Jira settings row (also from a migration in production).
    await db.listItem.createMany({ data: DEFAULT_LISTS });
    await db.jiraSettings.create({ data: { id: "default" } });
  } finally {
    await db.$disconnect();
  }
}
