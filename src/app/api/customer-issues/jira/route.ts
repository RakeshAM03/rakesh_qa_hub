import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { jsonError, readJson } from "@/lib/api";
import { jiraConfig } from "@/lib/customer-issues/jira";
import { jiraSettingsSchema } from "@/lib/customer-issues/schema";
import { loadLists } from "@/lib/customer-issues/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Connection status (never the credentials), settings and the last syncs. */
export async function GET() {
  const cfg = jiraConfig();
  const [settings, logs] = await Promise.all([
    db.jiraSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} }),
    db.jiraSyncLog.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
  ]);
  return NextResponse.json({
    connected: Boolean(cfg),
    site: cfg ? new URL(cfg.baseUrl).host : null,
    settings: { jql: settings.jql, productMapping: settings.productMapping, scheduleEnabled: settings.scheduleEnabled, writeBackEnabled: settings.writeBackEnabled, updatedAt: settings.updatedAt },
    logs,
  });
}

/** Save JQL, product mapping and toggles — passcode. */
export async function PATCH(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const parsed = await readJson(req, jiraSettingsSchema);
  if ("response" in parsed) return parsed.response;
  const data = parsed.data;
  if (data.productMapping) {
    const products = new Set((await loadLists()).items.filter((i) => i.list === "PRODUCT").map((i) => i.id));
    if (data.productMapping.some((m) => !products.has(m.productId))) return jsonError(400, "A mapping points at a product that doesn't exist — reload and pick it again.");
  }
  const settings = await db.jiraSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  return NextResponse.json({ settings: { jql: settings.jql, productMapping: settings.productMapping, scheduleEnabled: settings.scheduleEnabled, writeBackEnabled: settings.writeBackEnabled, updatedAt: settings.updatedAt } });
}
