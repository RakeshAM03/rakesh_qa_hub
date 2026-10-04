import type { Metadata } from "next";
import { Database } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Test Data Generator" };

export default function TestDataGeneratorPage() {
  return (
    <>
      <PageHeader
        title="Test Data Generator"
        subtitle="Generate realistic fake data and edge cases for testing — in CSV, JSON, Excel, SQL and more."
        icon={Database}
        iconClassName="text-teal-600"
      />
      <ComingSoon />
    </>
  );
}
