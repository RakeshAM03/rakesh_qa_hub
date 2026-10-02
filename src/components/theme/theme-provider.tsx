"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemes } from "next-themes";

import { useAccent } from "./use-accent";

function AccentSync() {
  useAccent();
  return null;
}

/** Light / dark / system mode (next-themes) plus the colour theme. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="qa-hub:mode">
      <AccentSync />
      {children}
    </NextThemes>
  );
}
