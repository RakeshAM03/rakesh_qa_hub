import type { Metadata } from "next";
import { LayoutTemplate } from "lucide-react";

import { TemplatesManager } from "@/components/release-readiness/templates-manager";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Checklist templates" };

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Checklist templates"
        subtitle="Reusable gate lists for new releases. Editing a template doesn't change existing releases."
        icon={LayoutTemplate}
        iconClassName="text-green-600"
        backHref="/release-readiness"
        backLabel="Release Readiness"
      />
      <TemplatesManager />
    </>
  );
}
