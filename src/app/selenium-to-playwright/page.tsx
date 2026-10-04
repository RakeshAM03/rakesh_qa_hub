import type { Metadata } from "next";
import { ArrowRightLeft } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Selenium → Playwright Converter" };

export default function SeleniumToPlaywrightPage() {
  return (
    <>
      <PageHeader
        title="Selenium → Playwright Converter"
        subtitle="Paste Selenium Java code and get Playwright TypeScript, with a checklist of anything that needs review."
        icon={ArrowRightLeft}
        iconClassName="text-violet-600"
      />
      <ComingSoon message="Coming soon" />
    </>
  );
}
