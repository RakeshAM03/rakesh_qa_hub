import type { Metadata } from "next";
import { FileSignature } from "lucide-react";

import { BugFormatter } from "@/components/bug-formatter/bug-formatter";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Bug Formatter" };

export default function BugFormatterPage() {
  return (
    <>
      <PageHeader
        title="Bug Report Formatter"
        subtitle="Paste Claude Code's findings or log bugs manually, then export as Markdown for Jira or Slack."
        icon={FileSignature}
        iconClassName="text-orange-500"
      />
      <BugFormatter />
    </>
  );
}
