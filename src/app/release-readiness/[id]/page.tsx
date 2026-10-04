import type { Metadata } from "next";

import { ReleaseDetail } from "@/components/release-readiness/release-detail";

export const metadata: Metadata = { title: "Release" };

export default async function ReleasePage({ params }: PageProps<"/release-readiness/[id]">) {
  const { id } = await params;
  return <ReleaseDetail id={id} />;
}
