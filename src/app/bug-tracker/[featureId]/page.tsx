import type { Metadata } from "next";

import { FeatureDetail } from "@/components/bug-tracker/feature-detail";

export const metadata: Metadata = { title: "Feature issues" };

export default async function FeatureIssuesPage(props: PageProps<"/bug-tracker/[featureId]">) {
  const { featureId } = await props.params;
  const { issue } = await props.searchParams;
  return <FeatureDetail featureId={featureId} highlightId={typeof issue === "string" ? issue : undefined} />;
}
