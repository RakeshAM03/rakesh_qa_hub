import type { Metadata } from "next";
import { ListChecks } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { TestCaseGenerator } from "@/components/test-case-generator/test-case-generator";

export const metadata: Metadata = { title: "Test Case Generator" };

export default function TestCaseGeneratorPage() {
  return (
    <>
      <PageHeader
        title="Test Case Generator"
        subtitle="Turn requirements into functional, non-functional and API test cases."
        icon={ListChecks}
        iconClassName="text-blue-600"
      />
      <TestCaseGenerator />
    </>
  );
}
