import type { Metadata } from "next";

import { QaTracker } from "@/components/qa-tracker/qa-tracker";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "QA Tracker" };

export default function QaTrackerPage() {
  return (
    <>
      <PageHeader title="QA Tracker" />
      <QaTracker />
    </>
  );
}
