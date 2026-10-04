import { NextResponse } from "next/server";
import { z } from "zod";

import { AiError, structuredJson } from "@/lib/ai/claude";
import { jsonError, readJson } from "@/lib/api";
import { LOCATOR_SCHEMA, LOCATOR_SYSTEM, MAX_AI_CONTEXT, locatorUserPrompt } from "@/lib/locators/ai-prompt";

const bodySchema = z.object({
  context: z.string().min(1).max(MAX_AI_CONTEXT + 512),
  best: z.string().max(1000).optional(),
});

type AiAnswer = { suggestions: { kind: "css" | "xpath"; selector: string; reason: string }[] };

/** Extra locator ideas for one element. Results are scored and checked in the browser. */
export async function POST(req: Request) {
  const parsed = await readJson(req, bodySchema, { maxBytes: 32 * 1024 });
  if ("response" in parsed) return parsed.response;
  try {
    const answer = await structuredJson<AiAnswer>({
      system: LOCATOR_SYSTEM,
      user: locatorUserPrompt(parsed.data.context, parsed.data.best),
      schema: LOCATOR_SCHEMA,
      maxTokens: 4000,
      signal: req.signal,
    });
    const suggestions = (answer.suggestions ?? [])
      .filter((s) => (s.kind === "css" || s.kind === "xpath") && typeof s.selector === "string" && s.selector.length <= 500)
      .slice(0, 5)
      .map((s) => ({ kind: s.kind, selector: s.selector, reason: String(s.reason ?? "").slice(0, 200) }));
    return NextResponse.json({ suggestions });
  } catch (err) {
    if (err instanceof AiError) return jsonError(err.status, err.message);
    throw err;
  }
}
