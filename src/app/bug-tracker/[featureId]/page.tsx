import type { Metadata } from "next";
import { LayoutGrid } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Feature issues" };

export default async function FeatureIssuesPage(props: PageProps<"/bug-tracker/[featureId]">) {
  const { featureId } = await props.params;
  return (
    <>
      <PageHeader
        title="Feature issues"
        subtitle={`Feature ${featureId}`}
        icon={LayoutGrid}
        iconClassName="text-neutral-700"
        backHref="/bug-tracker"
        backLabel="Bug Tracker"
      />
      <ComingSoon message="The feature issue list is being built." />
    </>
  );
}
