"use client";

import { useEffect } from "react";

import { ACCENT_STORAGE_KEY, DEFAULT_ACCENT, isAccent, type AccentId } from "@/config/themes";
import { useLocalStorage } from "@/hooks/use-local-storage";

/** The visitor's colour theme, kept in localStorage and mirrored to <html data-accent>. */
export function useAccent() {
  const [stored, setStored] = useLocalStorage(ACCENT_STORAGE_KEY);
  const accent: AccentId = isAccent(stored) ? stored : DEFAULT_ACCENT;

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  return { accent, setAccent: (id: AccentId) => setStored(id) };
}
