"use client";

import { useEffect, useState } from "react";

let cached: Promise<boolean> | null = null;

function fetchStatus() {
  cached ??= fetch("/api/ai/status")
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((d: { enabled?: boolean }) => d.enabled === true)
    .catch(() => false);
  return cached;
}

/**
 * Whether AI features are on (ANTHROPIC_API_KEY set on the server).
 * `null` while loading — render neither the AI button nor the copy-prompt
 * fallback until it's known.
 */
export function useAiEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetchStatus().then((v) => alive && setEnabled(v));
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}
