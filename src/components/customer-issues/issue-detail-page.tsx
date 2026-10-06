"use client";

import { IssueDetail } from "./issue-detail";

/** Detail page; regression cases are added below the RCA in C4. */
export function IssueDetailPage({ id }: { id: string }) {
  return <IssueDetail id={id} />;
}
