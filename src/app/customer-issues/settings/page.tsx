import type { Metadata } from "next";

import { CiSettings } from "@/components/customer-issues/settings";

export const metadata: Metadata = { title: "Customer Issue RCA — Settings" };

export default function CustomerIssueSettingsPage() {
  return <CiSettings />;
}
