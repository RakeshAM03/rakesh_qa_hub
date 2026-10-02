import type { Metadata } from "next";

import { TcLibrary } from "@/components/tc-library/tc-library";

export const metadata: Metadata = { title: "TC Library" };

export default function TcLibraryPage() {
  return <TcLibrary />;
}
