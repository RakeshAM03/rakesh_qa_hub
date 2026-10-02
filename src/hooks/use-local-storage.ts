"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "qa-hub:local-storage";

/** Latest value per key, so the UI keeps working when storage is blocked or full. */
const memory = new Map<string, string | null>();

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  memory.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable or full — the in-memory value still drives the UI
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  // Another tab changed storage: drop our cached copy and re-read.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null) memory.clear();
    else memory.delete(e.key);
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

type Next = string | null | ((prev: string | null) => string | null);

/**
 * A string value kept in localStorage and shared by every component using the
 * same key. Renders `null` on the server. The setter also accepts an updater
 * function, which always receives the latest stored value.
 */
export function useLocalStorage(key: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );

  const setValue = useCallback(
    (next: Next) => write(key, typeof next === "function" ? next(read(key)) : next),
    [key],
  );

  return [value, setValue] as const;
}
