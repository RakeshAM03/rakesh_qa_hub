import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Dark mode works by remapping Tailwind palettes in src/app/theme-palette.css
 * (e.g. red-100 becomes a dark tint, red-800 a light one). An explicit
 * `dark:bg-red-900` would be remapped too and invert twice, so components must
 * not use dark: overrides for palette colours. shadcn/ui primitives are exempt.
 */
const PALETTE = "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|neutral";
const DARK_PALETTE = new RegExp(`dark:(?:[a-z-]+:|\\[[^\\]]+\\]:)*(?:bg|text|border|ring|stroke|fill|from|to|via)-(?:${PALETTE})-\\d+`, "g");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "ui" ? [] : files(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("theme guard", () => {
  it("components don't use dark: overrides for palette colours", () => {
    const offenders = files(join(process.cwd(), "src/components")).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(DARK_PALETTE)].map((m) => `${f.replace(process.cwd() + "/", "")}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });
});
