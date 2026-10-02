"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "qa-hub:local-storage";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * A string value kept in localStorage and shared by every component using the
 * same key. Renders `null` on the server and when storage is unavailable.
 */
export function useLocalStorage(key: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );

  const setValue = useCallback(
    (next: string | null) => {
      try {
        if (next === null) localStorage.removeItem(key);
        else localStorage.setItem(key, next);
      } catch {
        // storage unavailable — nothing to persist
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, setValue] as const;
}
