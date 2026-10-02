import type { Metadata } from "next";

import { ActivityFeed } from "@/components/bug-tracker/activity-feed";

export const metadata: Metadata = { title: "Bug Tracker Activity" };

export default function BugTrackerActivityPage() {
  return <ActivityFeed />;
}
