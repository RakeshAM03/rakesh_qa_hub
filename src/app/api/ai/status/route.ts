import { NextResponse } from "next/server";

import { aiEnabled } from "@/config/ai";

export const dynamic = "force-dynamic";

/** Whether AI features are available (ANTHROPIC_API_KEY set). Never exposes the key. */
export function GET() {
  return NextResponse.json({ enabled: aiEnabled() });
}
