import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "QA Tracker" };

export default function QaTrackerPage() {
  return (
    <>
      <PageHeader
        title="QA Tracker"
        icon={ClipboardList}
        iconClassName="text-green-600"
      />
      <ComingSoon message="QA Tracker is being built." />
    </>
  );
}
