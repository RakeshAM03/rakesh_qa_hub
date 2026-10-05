import { NextResponse } from "next/server";
import { z } from "zod";

import { AiError, structuredJson } from "@/lib/ai/claude";
import { jsonError, readJson } from "@/lib/api";
import { buildImprovePrompt, SYSTEM_PROMPT } from "@/lib/tcgen/prompt";
import { AI_RESULT_SCHEMA, inputSchema, normalizeCases, validateResult } from "@/lib/tcgen/schema";
import type { TcInput } from "@/lib/tcgen/types";

export const maxDuration = 300;

const body = z.object({ input: inputSchema, cases: z.array(z.unknown()).min(1).max(60) });

/** "Improve weak cases": rewrites only the given rows (same IDs). Counts as one AI generation. */
export async function POST(req: Request) {
  const parsed = await readJson(req, body, { maxBytes: 512 * 1024 });
  if ("response" in parsed) return parsed.response;
  const input = parsed.data.input as TcInput;
  const weak = normalizeCases(parsed.data.cases, input.options.priorityScheme);
  if (!weak.length) return jsonError(400, "No valid cases to improve.");
  try {
    const raw = await structuredJson<unknown>({ system: SYSTEM_PROMPT, user: buildImprovePrompt(input, weak), schema: AI_RESULT_SCHEMA, maxTokens: 32000, signal: req.signal });
    const outcome = validateResult(raw, input.options.priorityScheme);
    if (!outcome.ok) return jsonError(502, "The AI answer didn't match the test-case format. Try again, or use Copy improve prompt.");
    return NextResponse.json({ cases: outcome.result.testCases });
  } catch (err) {
    if (err instanceof AiError) return jsonError(err.status, err.message);
    throw err;
  }
}
