import { NextResponse } from "next/server";

import { AiError, structuredJson } from "@/lib/ai/claude";
import { jsonError, readJson } from "@/lib/api";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/tcgen/prompt";
import { AI_RESULT_SCHEMA, inputSchema, MAX_INPUT_BYTES, validateResult } from "@/lib/tcgen/schema";

export const maxDuration = 300;

const bytes = (s: string) => Buffer.byteLength(s);

/**
 * AI test-case generation (needs ANTHROPIC_API_KEY). The answer is validated; if it doesn't
 * match, Claude gets one retry with the validation error, then the user sees a friendly error.
 */
export async function POST(req: Request) {
  const parsed = await readJson(req, inputSchema, { maxBytes: 256 * 1024 });
  if ("response" in parsed) return parsed.response;
  const input = parsed.data;
  const f = input.apiForm;
  const total = bytes(input.requirement) + bytes(input.apiSpec) + bytes(f.requestBody) + bytes(f.responseSample) + bytes(f.notes) + bytes(input.context.rules) + bytes(input.context.outOfScope);
  if (total > MAX_INPUT_BYTES) return jsonError(413, "The input is over 30 KB. Shorten the requirement or API definition.");
  if (!input.requirement.trim() && !input.apiSpec.trim() && !f.endpoint.trim()) return jsonError(400, "Add a requirement or an API definition first.");
  if (!input.types.length) return jsonError(400, "Pick at least one test type.");

  const user = buildUserPrompt(input);
  const maxTokens = input.options.depth === "exhaustive" ? 64000 : input.options.depth === "standard" ? 32000 : 16000;
  try {
    let raw = await structuredJson<unknown>({ system: SYSTEM_PROMPT, user, schema: AI_RESULT_SCHEMA, maxTokens, signal: req.signal });
    let outcome = validateResult(raw);
    if (!outcome.ok) {
      raw = await structuredJson<unknown>({
        system: SYSTEM_PROMPT,
        user: `${user}\n\nYour previous answer was rejected: ${outcome.error}. Answer again, following the format exactly.`,
        schema: AI_RESULT_SCHEMA,
        maxTokens,
        signal: req.signal,
      });
      outcome = validateResult(raw);
    }
    if (!outcome.ok) return jsonError(502, "The AI answer didn't match the test-case format, even after a retry. Try again, or use Copy prompt for Claude.");
    return NextResponse.json({ result: outcome.result });
  } catch (err) {
    if (err instanceof AiError) return jsonError(err.status, err.message);
    throw err;
  }
}
