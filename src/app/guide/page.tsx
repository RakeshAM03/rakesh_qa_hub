import type { Metadata } from "next";

import { GuidePage } from "@/components/guide/guide-layout";
import { guideIndex } from "@/lib/guide/content";

export const metadata: Metadata = { title: "User Guide", description: "How to use every module of Rakesh QA Hub." };

export default function GuideIndexPage() {
  return <GuidePage doc={guideIndex()} />;
}
