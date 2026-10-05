import { readFileSync } from "node:fs";
import path from "node:path";

import { GUIDE_IMAGES_DIR, guideImages } from "@/lib/guide/content";

/** Screenshots from docs/user-guide/images, generated at build time (no copies in public/). */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return guideImages().map((file) => ({ file }));
}

export async function GET(_req: Request, ctx: RouteContext<"/guide/images/[file]">) {
  const { file } = await ctx.params;
  if (!guideImages().includes(file)) return new Response("Not found", { status: 404 });
  return new Response(readFileSync(path.join(GUIDE_IMAGES_DIR, file)), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
