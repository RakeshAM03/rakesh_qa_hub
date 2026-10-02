import type { Metadata } from "next";
import { LayoutGrid } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Bug Tracker" };

export default function BugTrackerPage() {
  return (
    <>
      <PageHeader
        title="QA Bug Tracker"
        subtitle="Track QA issues across all features"
        icon={LayoutGrid}
        iconClassName="text-neutral-700"
      />
      <ComingSoon message="Bug Tracker is being built." />
    </>
  );
}
