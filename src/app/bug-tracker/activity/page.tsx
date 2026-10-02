import type { Metadata } from "next";
import { Activity } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Activity" };

export default function BugTrackerActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity"
        subtitle="Recent issue changes across all features"
        icon={Activity}
        iconClassName="text-neutral-700"
        backHref="/bug-tracker"
        backLabel="Bug Tracker"
      />
      <ComingSoon message="Activity is being built." />
    </>
  );
}
