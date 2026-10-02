import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "AI PR Review" };

export default function AiPrReviewPage() {
  return (
    <>
      <PageHeader
        title="AI PR Review"
        subtitle="Generate a focused code review prompt from a PR, or log AI review flags from a PR QA session."
        icon={ShieldCheck}
        iconClassName="text-purple-600"
      />
      <ComingSoon message="AI PR Review is being built." />
    </>
  );
}
