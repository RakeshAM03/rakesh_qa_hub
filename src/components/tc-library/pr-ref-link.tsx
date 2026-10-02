import { ExternalLink } from "lucide-react";

import { prReferenceHref } from "@/lib/tc-library/pr-ref";

export function PrRefLink({ value }: { value: string | null }) {
  if (!value) return null;
  const href = prReferenceHref(value);
  if (!href) return <span className="text-neutral-600">{value}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-teal-700 hover:underline"
    >
      {value}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
