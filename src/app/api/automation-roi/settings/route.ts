import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { readJson } from "@/lib/api";
import { settingsSchema } from "@/lib/automation-roi/schema";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const KEY = "roi.currency";
const DEFAULT_CURRENCY = "₹";

export async function GET() {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  return NextResponse.json({ currency: row?.value ?? DEFAULT_CURRENCY });
}

/** Change the currency symbol (global setting — passcode). */
export async function PATCH(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const parsed = await readJson(req, settingsSchema);
  if ("response" in parsed) return parsed.response;
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: parsed.data.currency }, update: { value: parsed.data.currency } });
  return NextResponse.json({ currency: parsed.data.currency });
}
