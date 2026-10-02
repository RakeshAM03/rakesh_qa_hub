import type { Metadata } from "next";
import { GitBranch } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "CI Reports" };

export default function CiReportsPage() {
  return (
    <>
      <PageHeader
        title="CI Reports"
        icon={GitBranch}
        iconClassName="text-neutral-700"
      />
      <ComingSoon message="CI Reports is being built." />
    </>
  );
}
