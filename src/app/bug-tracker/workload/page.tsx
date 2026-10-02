import type { Metadata } from "next";
import { Users } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Workload" };

export default function BugTrackerWorkloadPage() {
  return (
    <>
      <PageHeader
        title="Workload"
        subtitle="Open and closed issues per assignee"
        icon={Users}
        iconClassName="text-neutral-700"
        backHref="/bug-tracker"
        backLabel="Bug Tracker"
      />
      <ComingSoon message="Workload is being built." />
    </>
  );
}
