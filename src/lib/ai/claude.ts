import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { AI_MODEL, aiEnabled } from "@/config/ai";

export class AiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type JsonSchema = Record<string, unknown>;

/**
 * One structured-output call to Claude. Returns the parsed JSON object.
 * Throws AiError with an HTTP status suitable for the route's response.
 */
export async function structuredJson<T>({
  system,
  user,
  schema,
  maxTokens = 16000,
  signal,
}: {
  system: string;
  user: string;
  schema: JsonSchema;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<T> {
  if (!aiEnabled()) throw new AiError(503, "AI is off (ANTHROPIC_API_KEY is not set).");
  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.create(
      {
        model: AI_MODEL,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: "medium", format: { type: "json_schema", schema } },
      },
      { signal },
    );
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) throw new AiError(499, "Cancelled.");
    if (err instanceof Anthropic.RateLimitError) throw new AiError(429, "The AI service is busy. Try again in a minute.");
    if (err instanceof Anthropic.AuthenticationError) throw new AiError(503, "The AI key is invalid.");
    if (err instanceof Anthropic.APIError) throw new AiError(502, `The AI service returned an error (${err.status ?? "network"}).`);
    throw err;
  }
  if (response.stop_reason === "refusal") throw new AiError(422, "The model declined this request.");
  if (response.stop_reason === "max_tokens") throw new AiError(502, "The AI answer was too long. Try a smaller input.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new AiError(502, "The model returned no answer.");
  try {
    return JSON.parse(text.text) as T;
  } catch {
    throw new AiError(502, "The model's answer couldn't be read.");
  }
}
