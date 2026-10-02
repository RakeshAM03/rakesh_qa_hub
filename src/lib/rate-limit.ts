/**
 * In-memory sliding-window rate limiter. Each server instance keeps its own
 * counts, which is enough to slow down bots on a small public app.
 */
export type Rule = { name: string; limit: number; windowMs: number };

export const RULES = {
  /** Every POST/PATCH to the API. */
  write: { name: "write", limit: 30, windowMs: 10 * 60_000 },
  /** Triggering CI workflows (burns GitHub Actions minutes). */
  dispatch: { name: "dispatch", limit: 5, windowMs: 60 * 60_000 },
  /** AI root-cause analyses (each costs an API call). */
  rca: { name: "rca", limit: 10, windowMs: 60 * 60_000 },
} satisfies Record<string, Rule>;

export function createLimiter(now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  let lastSweep = now();

  function sweep(t: number) {
    if (t - lastSweep < 60_000) return;
    lastSweep = t;
    const longest = Math.max(...Object.values(RULES).map((r) => r.windowMs));
    for (const [key, times] of hits) {
      if (!times.length || t - times[times.length - 1] > longest) hits.delete(key);
    }
  }

  /** Records a hit; returns null when allowed, or the seconds to wait. */
  return function check(rule: Rule, client: string): number | null {
    const t = now();
    sweep(t);
    const key = `${rule.name}:${client}`;
    const recent = (hits.get(key) ?? []).filter((at) => t - at < rule.windowMs);
    if (recent.length >= rule.limit) {
      hits.set(key, recent);
      return Math.max(1, Math.ceil((recent[0] + rule.windowMs - t) / 1000));
    }
    recent.push(t);
    hits.set(key, recent);
    return null;
  };
}

/** Which rules apply to a request. */
export function rulesFor(method: string, pathname: string): Rule[] {
  if (!pathname.startsWith("/api/")) return [];
  const rules: Rule[] = [];
  if (method === "POST" || method === "PATCH") rules.push(RULES.write);
  if (method === "POST" && /^\/api\/ci\/suites\/[^/]+\/dispatch\/?$/.test(pathname)) rules.push(RULES.dispatch);
  if (method === "GET" && /^\/api\/ci\/suites\/[^/]+\/runs\/[^/]+\/rca\/?$/.test(pathname)) rules.push(RULES.rca);
  return rules;
}

/** Client IP from proxy headers (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

export function waitText(seconds: number) {
  if (seconds < 90) return `${seconds} seconds`;
  return `${Math.ceil(seconds / 60)} minutes`;
}
