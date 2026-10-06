import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { jiraConfig, JiraError } from "@/lib/customer-issues/jira";
import { runSync, SyncBusyError } from "@/lib/customer-issues/sync";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron (daily): runs only with the CRON_SECRET bearer token and when scheduled sync is on. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return jsonError(401, "Unauthorized");
  const settings = await db.jiraSettings.findUnique({ where: { id: "default" } });
  if (!settings?.scheduleEnabled) return NextResponse.json({ skipped: "Scheduled sync is off." });
  if (!jiraConfig()) return NextResponse.json({ skipped: "Jira not connected." });
  try {
    const log = await runSync("schedule");
    return NextResponse.json({ log });
  } catch (e) {
    if (e instanceof SyncBusyError || e instanceof JiraError) return NextResponse.json({ skipped: e.message });
    throw e;
  }
}
