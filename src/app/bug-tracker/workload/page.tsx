import type { Metadata } from "next";

import { WorkloadView } from "@/components/bug-tracker/workload-view";

export const metadata: Metadata = { title: "Bug Tracker Workload" };

export default function BugTrackerWorkloadPage() {
  return <WorkloadView />;
}
