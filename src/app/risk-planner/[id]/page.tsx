import type { Metadata } from "next";

import { PlanDetail } from "@/components/risk-planner/plan-detail";

export const metadata: Metadata = { title: "Test plan" };

export default async function PlanPage({ params }: PageProps<"/risk-planner/[id]">) {
  const { id } = await params;
  return <PlanDetail id={id} />;
}
