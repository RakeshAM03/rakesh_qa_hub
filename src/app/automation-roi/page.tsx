import type { Metadata } from "next";
import { TrendingUp } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Automation ROI Dashboard" };

export default function AutomationRoiPage() {
  return (
    <>
      <PageHeader
        title="Automation ROI Dashboard"
        subtitle="Track how much time automation saves and how coverage is growing."
        icon={TrendingUp}
        iconClassName="text-emerald-600"
      />
      <ComingSoon message="Coming soon" />
    </>
  );
}
