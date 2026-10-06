import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { JiraError } from "@/lib/customer-issues/jira";
import { runSync, SyncBusyError } from "@/lib/customer-issues/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Sync now (rate-limited to 5 per hour per IP). */
export async function POST() {
  try {
    const log = await runSync("manual");
    return NextResponse.json({ log });
  } catch (e) {
    if (e instanceof SyncBusyError) return jsonError(409, e.message);
    if (e instanceof JiraError) return jsonError(400, e.message);
    throw e;
  }
}
