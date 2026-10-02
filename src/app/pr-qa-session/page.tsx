import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";

import { PrQaSession } from "@/components/pr-qa-session/pr-qa-session";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "PR QA Session" };

export default function PrQaSessionPage() {
  return (
    <>
      <PageHeader
        title="PR QA Session"
        subtitle="Paste PR URLs, build the full QA session prompt, edit if needed, then copy into Claude."
        icon={FlaskConical}
        iconClassName="text-purple-600"
      />
      <PrQaSession />
    </>
  );
}
