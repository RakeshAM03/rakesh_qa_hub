import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { jsonError } from "@/lib/api";
import { createJiraClient, jiraConfig, JiraError } from "@/lib/customer-issues/jira";

export const dynamic = "force-dynamic";

/** Test connection (/rest/api/3/myself) — passcode. Returns only the account's display name. */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const cfg = jiraConfig();
  if (!cfg) return jsonError(503, "Jira not connected — set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN.");
  try {
    const me = await createJiraClient(cfg).myself();
    return NextResponse.json({ ok: true, account: me.displayName ?? "connected account", site: new URL(cfg.baseUrl).host });
  } catch (e) {
    return jsonError(502, e instanceof JiraError ? e.message : "Couldn't reach Jira.");
  }
}
