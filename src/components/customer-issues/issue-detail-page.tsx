"use client";

import { CasesPanel } from "./cases-panel";
import { IssueDetail } from "./issue-detail";

/** Detail page: classification + RCA, then the issue's regression cases. */
export function IssueDetailPage({ id }: { id: string }) {
  return <IssueDetail id={id}>{(issue, lists) => <CasesPanel issue={issue} lists={lists} onChanged={() => undefined} />}</IssueDetail>;
}
