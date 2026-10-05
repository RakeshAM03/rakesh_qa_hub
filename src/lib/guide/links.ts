/**
 * User guide: which Markdown file backs which /guide page, and how links inside the files
 * (written for GitHub, e.g. `./ci.md#faq`, `images/ci.png`) map to in-app URLs.
 * No file access here, so it can run anywhere (including the browser and unit tests).
 */

import { navGroups, navItems, isActivePath } from "@/config/nav";

export type GuideModule = { slug: string; file: string; title: string; section: string };

/** The 16 module guides, in sidebar order. Slug = module route without the leading slash. */
export const GUIDE_MODULES: GuideModule[] = navGroups.flatMap((g) =>
  g.items.map((i) => ({ slug: i.href.slice(1), file: `${i.href.slice(1)}.md`, title: i.title, section: g.title })),
);

/** Extra pages that aren't modules. */
export const GUIDE_EXTRAS = [{ slug: "overview", file: "OVERVIEW.md", title: "Overview (one page)" }] as const;

export const GUIDE_INDEX_FILE = "README.md";

/** The section every module guide's walkthrough lives under (anchor of "## How to use it"). */
export const HOW_TO_USE_ANCHOR = "how-to-use-it";

/** GitHub-style heading anchor: "How to use it" → "how-to-use-it". */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

/** Guide page for a file name ("ci.md" → "/guide/ci", "README.md" → "/guide"), or null. */
export function guidePathForFile(file: string): string | null {
  const name = file.replace(/^\.\//, "");
  if (name === GUIDE_INDEX_FILE) return "/guide";
  const extra = GUIDE_EXTRAS.find((e) => e.file === name);
  if (extra) return `/guide/${extra.slug}`;
  const mod = GUIDE_MODULES.find((m) => m.file === name);
  return mod ? `/guide/${mod.slug}` : null;
}

/** Rewrites a link written in a guide file to its in-app URL; external links and anchors are kept. */
export function guideHref(href: string): string {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(href)) return href;
  const [path, hash] = href.split("#");
  const page = guidePathForFile(path);
  if (!page) return href;
  return hash ? `${page}#${hash}` : page;
}

/** Image path in a guide file ("images/ci.png") → URL served by /guide/images/[file]. */
export function guideImageSrc(src: string): string {
  const m = /^(?:\.\/)?images\/([a-z0-9-]+\.png)$/.exec(src);
  return m ? `/guide/images/${m[1]}` : src;
}

/** The module guide for the current page (e.g. "/release-readiness/abc" → release-readiness). */
export function guideForPath(pathname: string): GuideModule | null {
  const item = navItems.find((i) => isActivePath(pathname, i.href));
  return item ? (GUIDE_MODULES.find((m) => m.slug === item.href.slice(1)) ?? null) : null;
}
