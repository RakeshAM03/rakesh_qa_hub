import type { Metadata } from "next";
import { BookMarked } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "TC Library" };

export default function TcLibraryPage() {
  return (
    <>
      <PageHeader
        title="TC Library"
        subtitle="Save Step 1 + Step 2 outputs from Claude sessions and reload them in future sessions."
        icon={BookMarked}
        iconClassName="text-teal-600"
      />
      <ComingSoon message="TC Library is being built." />
    </>
  );
}
