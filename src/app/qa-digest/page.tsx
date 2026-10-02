import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "QA Digest" };

export default function QaDigestPage() {
  return (
    <>
      <PageHeader
        title="QA Digest"
        icon={CalendarDays}
        iconClassName="text-neutral-700"
      />
      <ComingSoon message="Coming soon" />
    </>
  );
}
