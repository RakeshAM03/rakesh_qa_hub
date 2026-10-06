import type { Metadata } from "next";

import { RunsPage } from "@/components/customer-issues/runs-page";

export const metadata: Metadata = { title: "Release runs — Customer Issue RCA" };

export default function CustomerIssueRunsPage() {
  return <RunsPage />;
}
