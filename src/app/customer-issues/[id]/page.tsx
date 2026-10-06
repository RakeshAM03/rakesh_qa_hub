import type { Metadata } from "next";

import { IssueDetailPage } from "@/components/customer-issues/issue-detail-page";

export const metadata: Metadata = { title: "Customer issue" };

export default async function CustomerIssueDetailPage({ params }: PageProps<"/customer-issues/[id]">) {
  const { id } = await params;
  return <IssueDetailPage id={id} />;
}
