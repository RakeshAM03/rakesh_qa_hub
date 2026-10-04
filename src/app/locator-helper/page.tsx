import type { Metadata } from "next";
import { Crosshair } from "lucide-react";

import { LocatorHelper } from "@/components/locator-helper/locator-helper";
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
      <LocatorHelper />
    </>
  );
}
