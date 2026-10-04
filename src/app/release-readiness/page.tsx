import type { Metadata } from "next";
import { Rocket } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Release Readiness" };

export default function ReleaseReadinessPage() {
  return (
    <>
      <PageHeader
        title="Release Readiness"
        subtitle="Track quality gates for each release and record the Go / No-Go decision."
        icon={Rocket}
        iconClassName="text-green-600"
      />
      <ComingSoon message="Coming soon" />
    </>
  );
}
