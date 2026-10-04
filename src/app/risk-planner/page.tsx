import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";

import { PlansList } from "@/components/risk-planner/plans-list";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Risk-Based Test Planner" };

export default function RiskPlannerPage() {
  return (
    <>
      <PageHeader
        title="Risk-Based Test Planner"
        subtitle="Score features by risk and get a prioritised test plan for your sprint or release."
        icon={ShieldAlert}
        iconClassName="text-amber-600"
      />
      <PlansList />
    </>
  );
}
