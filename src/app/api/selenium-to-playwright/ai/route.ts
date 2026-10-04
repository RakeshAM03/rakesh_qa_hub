import { NextResponse } from "next/server";
import { z } from "zod";

import { AiError, structuredJson } from "@/lib/ai/claude";
import { jsonError, readJson } from "@/lib/api";
import { cleanNotes, CONVERTER_SCHEMA, CONVERTER_SYSTEM, converterUserPrompt, MAX_AI_INPUT } from "@/lib/converter/ai-prompt";

const bodySchema = z.object({
  java: z.string().min(1).refine((s) => Buffer.byteLength(s) <= MAX_AI_INPUT, "Java code is larger than 50 KB."),
  options: z.object({
    inputType: z.enum(["auto", "test", "pageObject"]),
    framework: z.enum(["auto", "testng", "junit5", "junit4"]),
    outputStyle: z.enum(["auto", "test", "pageObject"]),
    locatorPreference: z.enum(["keep", "semantic"]),
    keepSleeps: z.boolean(),
  }),
});

/** AI conversions of large files can take a while. */
export const maxDuration = 300;

type AiAnswer = { files: { name: string; code: string }[]; notes: unknown };

/** AI conversion (only when ANTHROPIC_API_KEY is set). The client can cancel the request. */
export async function POST(req: Request) {
  const parsed = await readJson(req, bodySchema, { maxBytes: 64 * 1024 });
  if ("response" in parsed) return parsed.response;
  try {
    const answer = await structuredJson<AiAnswer>({
      system: CONVERTER_SYSTEM,
      user: converterUserPrompt(parsed.data.java, parsed.data.options),
      schema: CONVERTER_SCHEMA,
      maxTokens: 32000,
      signal: req.signal,
    });
    const files = (answer.files ?? [])
      .filter((f) => typeof f.name === "string" && typeof f.code === "string")
      .slice(0, 10)
      .map((f) => ({ name: f.name.replace(/[^\w.-]/g, "_").slice(0, 100), code: f.code }));
    if (!files.length) return jsonError(502, "The AI returned no code.");
    return NextResponse.json({ files, notes: cleanNotes(answer.notes) });
  } catch (err) {
    if (err instanceof AiError) return jsonError(err.status, err.message);
    throw err;
  }
}
