import type { Metadata } from "next";
import { Send } from "lucide-react";

import { ApiPlayground } from "@/components/api-playground/api-playground";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "API Test Playground" };

export default function ApiPlaygroundPage() {
  return (
    <>
      <PageHeader
        title="API Test Playground"
        subtitle="Build and send HTTP requests, assert on the response, and save them for later."
        icon={Send}
        iconClassName="text-indigo-600"
      />
      <ApiPlayground />
    </>
  );
}
