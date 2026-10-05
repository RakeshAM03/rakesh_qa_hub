import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuidePage } from "@/components/guide/guide-layout";
import { guideDoc, guideSlugs } from "@/lib/guide/content";

/** One static page per Markdown file in docs/user-guide; any other slug is a 404 (no file read). */
export function generateStaticParams() {
  return guideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/guide/[slug]">): Promise<Metadata> {
  const doc = guideDoc((await params).slug);
  return { title: doc ? `${doc.title} — User Guide` : "User Guide" };
}

export default async function GuideModulePage({ params }: PageProps<"/guide/[slug]">) {
  const doc = guideDoc((await params).slug);
  if (!doc) notFound();
  return <GuidePage doc={doc} />;
}
