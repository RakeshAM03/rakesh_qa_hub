import type { Metadata } from "next";
import { Stethoscope } from "lucide-react";

import { FailureAnalyzer } from "@/components/failure-analyzer/failure-analyzer";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Test Failure Analyzer" };

export default function FailureAnalyzerPage() {
  return (
    <>
      <PageHeader
        title="Test Failure Analyzer"
        subtitle="Paste test failures or upload a report to group them by root cause."
        icon={Stethoscope}
        iconClassName="text-rose-600"
      />
      <FailureAnalyzer />
    </>
  );
}
