import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { AI_MODEL, aiEnabled } from "@/config/ai";
import { db } from "@/lib/db";
import { failedJobLogs } from "./github";

/** AI root cause runs only when an Anthropic key is configured. */
export const rcaEnabled = aiEnabled;

const DAILY_LIMIT = Number(process.env.RCA_DAILY_LIMIT ?? 50);
let budget = { day: "", used: 0 };

const RCA_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One line, at most ~120 characters: the most likely root cause." },
    detail: {
      type: "string",
      description: "Short markdown: the failing step, the key error lines, the likely cause and a suggested next step.",
    },
  },
  required: ["summary", "detail"],
  additionalProperties: false,
} as const;

export class RcaError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Cached root cause for a run, or null. */
export function cachedRca(cacheKey: string) {
  return db.rootCauseCache.findUnique({ where: { runId: cacheKey }, select: { summary: true, detail: true } });
}

/**
 * Root cause for a failed run: cached per run, otherwise the failed jobs' log
 * tails are sent to Claude once and the answer is stored.
 */
export async function rootCause(repo: string, runId: number) {
  const cacheKey = `${repo}#${runId}`;
  const cached = await cachedRca(cacheKey);
  if (cached) return { ...cached, cached: true };
  if (!rcaEnabled()) throw new RcaError(503, "AI root cause is off (ANTHROPIC_API_KEY is not set).");

  const today = new Date().toISOString().slice(0, 10);
  if (budget.day !== today) budget = { day: today, used: 0 };
  if (budget.used >= DAILY_LIMIT) throw new RcaError(429, "The daily limit for AI root-cause analyses is reached. Try again tomorrow.");

  const logs = await failedJobLogs(repo, runId);
  if (logs.length === 0) throw new RcaError(422, "No failed jobs with logs were found for this run.");
  budget.used++;

  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "You analyse CI test failures for a QA team. Read the failed job logs and identify the most likely root cause. " +
      "Distinguish product bugs, test/flaky issues and infrastructure problems. Be concrete and brief.",
    messages: [
      {
        role: "user",
        content: logs.map((l) => `## Failed job: ${l.name}\n\n\`\`\`\n${l.log}\n\`\`\``).join("\n\n"),
      },
    ],
    output_config: { format: { type: "json_schema", schema: RCA_SCHEMA } },
  });

  if (response.stop_reason === "refusal") throw new RcaError(422, "The model declined to analyse these logs.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new RcaError(502, "The model returned no analysis.");
  let parsed: { summary: string; detail: string };
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new RcaError(502, "The model's answer couldn't be read.");
  }

  const saved = await db.rootCauseCache.upsert({
    where: { runId: cacheKey },
    create: { runId: cacheKey, summary: parsed.summary.slice(0, 500), detail: parsed.detail.slice(0, 20_000) },
    update: {},
    select: { summary: true, detail: true },
  });
  return { ...saved, cached: false };
}
