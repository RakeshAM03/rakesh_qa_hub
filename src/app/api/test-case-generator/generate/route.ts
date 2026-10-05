import { NextResponse } from "next/server";

import { AiError, structuredJson } from "@/lib/ai/claude";
import { jsonError, readJson } from "@/lib/api";
import { BATCHES, buildUserPrompt, effectivePrefix, firstPhrase, mergeResults, SYSTEM_PROMPT, type Batch } from "@/lib/tcgen/prompt";
import { AI_RESULT_SCHEMA, inputSchema, MAX_INPUT_BYTES, validateResult } from "@/lib/tcgen/schema";
import type { GenerationResult, TcInput } from "@/lib/tcgen/types";

export const maxDuration = 300;

const bytes = (s: string) => Buffer.byteLength(s);

/** One call (or one batch): validated, with one retry that includes the validation error. */
async function generateOnce(input: TcInput, signal: AbortSignal, batch?: Batch, start = 1): Promise<GenerationResult> {
  const user = buildUserPrompt(input, batch, start);
  const maxTokens = batch ? 32000 : input.options.depth === "exhaustive" ? 64000 : 32000;
  const scheme = input.options.priorityScheme;
  let raw = await structuredJson<unknown>({ system: SYSTEM_PROMPT, user, schema: AI_RESULT_SCHEMA, maxTokens, signal });
  let outcome = validateResult(raw, scheme);
  if (!outcome.ok) {
    raw = await structuredJson<unknown>({
      system: SYSTEM_PROMPT,
      user: `${user}\n\nYour previous answer was rejected: ${outcome.error}. Answer again, following the format exactly.`,
      schema: AI_RESULT_SCHEMA,
      maxTokens,
      signal,
    });
    outcome = validateResult(raw, scheme);
  }
  if (!outcome.ok) throw new AiError(502, "The AI answer didn't match the test-case format, even after a retry.");
  return outcome.result;
}

/**
 * AI test-case generation (needs ANTHROPIC_API_KEY). Quick depth is one call; Standard and
 * Exhaustive run one batch per category group in parallel inside this request (so the run
 * counts once against the hourly limit), then merge, de-duplicate and renumber.
 */
export async function POST(req: Request) {
  const parsed = await readJson(req, inputSchema, { maxBytes: 256 * 1024 });
  if ("response" in parsed) return parsed.response;
  const input = parsed.data as TcInput;
  const f = input.apiForm;
  const total = bytes(input.requirement) + bytes(input.apiSpec) + bytes(f.requestBody) + bytes(f.responseSample) + bytes(f.notes) + bytes(input.context.rules) + bytes(input.context.outOfScope) + bytes(input.context.messages);
  if (total > MAX_INPUT_BYTES) return jsonError(413, "The input is over 30 KB. Shorten the requirement or API definition.");
  if (!input.requirement.trim() && !input.apiSpec.trim() && !f.endpoint.trim()) return jsonError(400, "Add a requirement or an API definition first.");
  if (!input.types.length) return jsonError(400, "Pick at least one test type.");

  try {
    if (input.options.depth === "quick") return NextResponse.json({ result: await generateOnce(input, req.signal), warnings: [] });
    const settled = await Promise.allSettled(BATCHES.map((b, i) => generateOnce(input, req.signal, b, i * 100 + 1)));
    const ok = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    const failed = BATCHES.filter((_, i) => settled[i].status === "rejected").map((b) => b.label);
    if (!ok.length) {
      const first = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
      if (first?.reason instanceof AiError) return jsonError(first.reason.status, first.reason.message);
      throw first?.reason ?? new Error("AI generation failed.");
    }
    const prefix = effectivePrefix(input, input.context.moduleName || firstPhrase(input.requirement));
    const warnings = failed.length ? [`These batches failed and are missing: ${failed.join(", ")}. Generate again or use Copy prompt for Claude.`] : [];
    return NextResponse.json({ result: mergeResults(ok, prefix), warnings });
  } catch (err) {
    if (err instanceof AiError) return jsonError(err.status, err.message === "The AI answer didn't match the test-case format, even after a retry." ? `${err.message} Try again, or use Copy prompt for Claude.` : err.message);
    throw err;
  }
}
