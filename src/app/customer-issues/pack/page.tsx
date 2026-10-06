import type { Metadata } from "next";

import { PackPage } from "@/components/customer-issues/pack-page";

export const metadata: Metadata = { title: "Regression pack — Customer Issue RCA" };

export default function CustomerIssuePackPage() {
  return <PackPage />;
}
