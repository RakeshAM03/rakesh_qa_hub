import type { Metadata } from "next";

import { RunDetail } from "@/components/customer-issues/run-detail";

export const metadata: Metadata = { title: "Release run — Customer Issue RCA" };

export default async function CustomerIssueRunPage({ params }: PageProps<"/customer-issues/runs/[runId]">) {
  const { runId } = await params;
  return <RunDetail runId={runId} />;
}
