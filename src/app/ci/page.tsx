import type { Metadata } from "next";

import { CiReports } from "@/components/ci/ci-reports";

export const metadata: Metadata = { title: "CI Reports" };

export default function CiReportsPage() {
  return <CiReports />;
}
