import { NextResponse } from "next/server";
import { z } from "zod";

import { AiError, structuredJson } from "@/lib/ai/claude";
import { jsonError, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { FAILURE_AI_SCHEMA, FAILURE_AI_SYSTEM, failureAiUser } from "@/lib/failure-analyzer/analyze";
import { clusterSchema } from "@/lib/failure-analyzer/schema";

const bodySchema = z.object({ cluster: clusterSchema });

type Explanation = { rootCause: string; category: string; categoryAgrees: boolean; fix: string };

/** AI explanation for one cluster, cached by its signature. */
export async function POST(req: Request) {
  const parsed = await readJson(req, bodySchema, { maxBytes: 512 * 1024 });
  if ("response" in parsed) return parsed.response;
  const { cluster } = parsed.data;
  const cached = await db.aiExplanationCache.findUnique({ where: { signature: cluster.signature } });
  if (cached) return NextResponse.json({ explanation: cached.explanation, cached: true });
  try {
    const explanation = await structuredJson<Explanation>({
      system: FAILURE_AI_SYSTEM,
      user: failureAiUser(cluster),
      schema: FAILURE_AI_SCHEMA,
      maxTokens: 4000,
      signal: req.signal,
    });
    const clean = {
      rootCause: String(explanation.rootCause).slice(0, 2000),
      category: String(explanation.category),
      categoryAgrees: Boolean(explanation.categoryAgrees),
      fix: String(explanation.fix).slice(0, 2000),
    };
    await db.aiExplanationCache.upsert({ where: { signature: cluster.signature }, create: { signature: cluster.signature, explanation: clean }, update: {} });
    return NextResponse.json({ explanation: clean, cached: false });
  } catch (err) {
    if (err instanceof AiError) return jsonError(err.status, err.message);
    throw err;
  }
}
