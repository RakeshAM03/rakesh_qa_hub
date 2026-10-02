import type { DispatchInput } from "@/lib/ci/schema";

export type Suite = {
  id: string;
  name: string;
  repo: string;
  workflowFile: string;
  color: string;
  dispatchInputs: DispatchInput[];
  sortOrder: number;
};

export type Run = {
  id: number;
  number: number;
  url: string;
  status: string;
  conclusion: string | null;
  event: string;
  branch: string | null;
  startedAt: string;
  durationSec: number | null;
  actor: { login: string; avatarUrl: string } | null;
  jobs: { passed: number; total: number; list: { id: number; name: string; status: string; conclusion: string | null; url: string }[] };
  reportUrl: string;
  rcaSummary: string | null;
};

/** "12m 34s", "1h 02m", "45s" */
export function formatDuration(sec: number | null) {
  if (sec === null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
