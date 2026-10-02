import Link from "next/link";
import { LayoutGrid, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Feature } from "./types";
import { ValidPill } from "./valid-pill";

const th = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500";

type FeatureTableProps = {
  features: Feature[] | null;
  teamName: string | null;
  onNewFeature: () => void;
};

export function FeatureTable({ features, teamName, onNewFeature }: FeatureTableProps) {
  if (features !== null && features.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
        <LayoutGrid className="size-10 text-neutral-300" aria-hidden />
        <p className="max-w-sm text-neutral-600">
          {teamName
            ? `${teamName} has no feature pages yet.`
            : "No feature pages yet — click New Feature Page to add one."}
        </p>
        <Button onClick={onNewFeature}>
          <Plus /> New Feature Page
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="border-b border-neutral-200">
          <tr>
            <th className={th}>Feature</th>
            <th className={`${th} text-right`}>Total issues</th>
            <th className={`${th} text-right`}>Valid issues</th>
            <th className={`${th} text-right`}>% Valid</th>
          </tr>
        </thead>
        <tbody>
          {features === null
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td colSpan={4} className="px-4 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            : features.map((f) => (
                <tr key={f.id} data-testid="feature-row" className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/bug-tracker/${f.id}`} className="font-medium text-neutral-900 hover:underline">
                      {f.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.totalIssues}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.validIssues}</td>
                  <td className="px-4 py-3 text-right">
                    <ValidPill percent={f.percentValid} />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
