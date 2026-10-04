import type { Metadata } from "next";
import { Crosshair } from "lucide-react";

import { ComingSoon } from "@/components/shell/coming-soon";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Locator Helper" };

export default function LocatorHelperPage() {
  return (
    <>
      <PageHeader
        title="Locator Helper"
        subtitle="Paste HTML, pick an element, and get stable locators for Selenium and Playwright."
        icon={Crosshair}
        iconClassName="text-cyan-600"
      />
      <ComingSoon message="Coming soon" />
    </>
  );
}
