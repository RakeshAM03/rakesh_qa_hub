import type { Metadata } from "next";

import { IssuesPage } from "@/components/customer-issues/issues-page";

export const metadata: Metadata = { title: "Customer Issue RCA" };

export default function CustomerIssuesPage() {
  return <IssuesPage />;
}
