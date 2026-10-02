import type { Metadata } from "next";

import { BugTrackerDashboard } from "@/components/bug-tracker/dashboard";

export const metadata: Metadata = { title: "Bug Tracker" };

export default function BugTrackerPage() {
  return <BugTrackerDashboard />;
}
