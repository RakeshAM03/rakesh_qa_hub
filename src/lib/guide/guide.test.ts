import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { navItems } from "@/config/nav";

import { GUIDE_EXTRAS, GUIDE_INDEX_FILE, GUIDE_MODULES, guideForPath, guideHref, guideImageSrc, headingId, HOW_TO_USE_ANCHOR } from "./links";

const DIR = path.join(process.cwd(), "docs", "user-guide");
const read = (file: string) => readFileSync(path.join(DIR, file), "utf8");
const allFiles = [GUIDE_INDEX_FILE, ...GUIDE_EXTRAS.map((e) => e.file), ...GUIDE_MODULES.map((m) => m.file)];
/** Markdown without fenced code blocks (code samples aren't links or prose). */
const prose = (md: string) => md.replace(/^```[\s\S]*?^```/gm, "");

const SECTIONS = [
  "Purpose",
  "The problem it solves",
  "Who should use it and when",
  "Key features",
  "How to use it",
  "Worked example",
  "Understanding the output",
  "Tips and best practices",
  "Limitations and things to know",
  "Works well with",
  "FAQ",
];

describe("user guide files", () => {
  it("has one guide per sidebar module (16), named after its route", () => {
    expect(GUIDE_MODULES).toHaveLength(16);
    expect(GUIDE_MODULES.map((m) => `/${m.slug}`)).toEqual(navItems.map((i) => i.href));
    const onDisk = readdirSync(DIR).filter((f) => f.endsWith(".md"));
    expect(onDisk.sort()).toEqual([...allFiles].sort());
  });

  it.each(GUIDE_MODULES.map((m) => [m.file]))("%s has exactly the 11 sections, in order", (file) => {
    const headings = [...prose(read(file)).matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    expect(headings).toEqual(SECTIONS);
    expect(prose(read(file)).match(/^# /gm)).toHaveLength(1);
  });

  it.each(GUIDE_MODULES.map((m) => [m.file, m.slug]))("%s embeds its screenshot under How to use it and reads in 5–8 minutes", (file, slug) => {
    const md = prose(read(file));
    const howTo = md.split("## How to use it")[1].split("\n## ")[0];
    expect(howTo).toContain(`](images/${slug}.png)`);
    const words = md.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(900);
    expect(words).toBeLessThanOrEqual(1800);
  });

  it.each(allFiles.map((f) => [f]))("every relative link and image in %s points to a real file and heading", (file) => {
    const md = prose(read(file));
    for (const [, target] of md.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (/^(?:https?:|mailto:)/.test(target)) continue;
      const [rel, hash] = target.split("#");
      const resolved = rel ? path.join(DIR, rel) : path.join(DIR, file);
      expect(existsSync(resolved), `${file} → ${target}`).toBe(true);
      if (hash) {
        const ids = [...prose(readFileSync(resolved, "utf8")).matchAll(/^#{1,3} (.+)$/gm)].map((m) => headingId(m[1]));
        expect(ids, `${file} → ${target}`).toContain(hash);
      }
    }
  });

  it("every screenshot is used, and no file outside images/ is referenced", () => {
    const used = new Set(allFiles.flatMap((f) => [...read(f).matchAll(/\]\(images\/([a-z0-9-]+\.png)\)/g)].map((m) => m[1])));
    expect(readdirSync(path.join(DIR, "images")).sort()).toEqual([...used].sort());
  });
});

describe("guide links", () => {
  it("maps guide file links to in-app pages", () => {
    expect(guideHref("ci.md")).toBe("/guide/ci");
    expect(guideHref("./tc-library.md#faq")).toBe("/guide/tc-library#faq");
    expect(guideHref("README.md")).toBe("/guide");
    expect(guideHref("OVERVIEW.md")).toBe("/guide/overview");
    expect(guideHref("https://example.com/x.md")).toBe("https://example.com/x.md");
    expect(guideHref("#how-to-use-it")).toBe("#how-to-use-it");
    expect(guideImageSrc("images/ci.png")).toBe("/guide/images/ci.png");
  });

  it("finds the module guide for any page of a module, and builds GitHub-style anchors", () => {
    expect(guideForPath("/release-readiness/abc123")?.slug).toBe("release-readiness");
    expect(guideForPath("/bug-tracker/workload")?.slug).toBe("bug-tracker");
    expect(guideForPath("/")).toBeNull();
    expect(guideForPath("/guide/ci")).toBeNull();
    expect(headingId("How to use it")).toBe(HOW_TO_USE_ANCHOR);
    expect(headingId("c) Moving to Playwright")).toBe("c-moving-to-playwright");
  });
});
