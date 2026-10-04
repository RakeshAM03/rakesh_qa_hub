import "server-only";

/** The one Claude model used by every AI feature in the hub. */
export const AI_MODEL = "claude-sonnet-5-5";

/** AI features run only when an Anthropic key is configured. */
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
