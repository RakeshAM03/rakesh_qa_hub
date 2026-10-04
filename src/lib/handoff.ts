"use client";

import { useSyncExternalStore } from "react";

/**
 * One-shot hand-off between modules ("Send to Bug Formatter", "Send to PR QA
 * Session"). The payload goes into sessionStorage — never the URL, so stack
 * traces and context don't end up in history, logs or referrers — and the
 * target page reads it once, then clears it.
 */
export type HandoffTarget = "bug-formatter" | "pr-qa-session";

const key = (target: HandoffTarget) => `qa-hub:handoff:${target}`;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(target: HandoffTarget): string | null {
  try {
    return sessionStorage.getItem(key(target));
  } catch {
    return null;
  }
}

/** Stores a payload for `target`; navigate there afterwards. */
export function sendHandoff(target: HandoffTarget, payload: object) {
  try {
    sessionStorage.setItem(key(target), JSON.stringify({ ...payload, handoffId: crypto.randomUUID() }));
  } catch {
    // storage blocked — the target page simply opens empty
  }
  emit();
}

export function clearHandoff(target: HandoffTarget) {
  try {
    sessionStorage.removeItem(key(target));
  } catch {
    // ignore
  }
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The pending payload for `target` (raw JSON string), or null. Null on the server. */
export function useHandoff(target: HandoffTarget): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(target),
    () => null,
  );
}

/** Parses a hand-off payload; returns null when missing or malformed. */
export function parseHandoff<T>(raw: string | null): (T & { handoffId: string }) | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && typeof v.handoffId === "string" ? v : null;
  } catch {
    return null;
  }
}
