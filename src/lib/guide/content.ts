import "server-only";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { GUIDE_EXTRAS, GUIDE_INDEX_FILE, GUIDE_MODULES, headingId } from "./links";

/** The guide's Markdown files are the single source for docs/ on GitHub and /guide in the app. */
export const GUIDE_DIR = path.join(process.cwd(), "docs", "user-guide");
export const GUIDE_IMAGES_DIR = path.join(GUIDE_DIR, "images");

export type GuideDoc = { slug: string | null; title: string; markdown: string; headings: { id: string; text: string }[] };

function load(file: string, slug: string | null): GuideDoc {
  const markdown = readFileSync(path.join(GUIDE_DIR, file), "utf8");
  const title = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? "User Guide";
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((m) => ({ id: headingId(m[1]), text: m[1].trim() }));
  return { slug, title, markdown, headings };
}

export const guideIndex = () => load(GUIDE_INDEX_FILE, null);

/** A module or extra page by slug, or null when there's no such guide page. */
export function guideDoc(slug: string): GuideDoc | null {
  const entry = GUIDE_MODULES.find((m) => m.slug === slug) ?? GUIDE_EXTRAS.find((e) => e.slug === slug);
  return entry ? load(entry.file, slug) : null;
}

export const guideSlugs = () => [...GUIDE_MODULES.map((m) => m.slug), ...GUIDE_EXTRAS.map((e) => e.slug)];

export const guideImages = () => readdirSync(GUIDE_IMAGES_DIR).filter((f) => /^[a-z0-9-]+\.png$/.test(f));
