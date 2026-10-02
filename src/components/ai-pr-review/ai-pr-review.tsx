"use client";

import { useState } from "react";

import { FlagsTableCard } from "./flags-table-card";
import { GenerateCard } from "./generate-card";
import { LogFlagsCard } from "./log-flags-card";

export function AiPrReview() {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  return (
    <div className="flex flex-col gap-4">
      <GenerateCard />
      <LogFlagsCard onSaved={refresh} />
      <FlagsTableCard refreshKey={refreshKey} onChanged={refresh} />
    </div>
  );
}
