import { execSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

/**
 * Prepares the throwaway E2E database: applies migrations, then empties every
 * app table so each run starts from the real "first visit" state.
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
  } finally {
    await db.$disconnect();
  }
}
