"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipboardList, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ISSUE_STATUSES, RUN_RESULT_LABELS } from "@/config/customer-issues";
import type { Lists } from "@/lib/customer-issues/model";
import type { IssueDto } from "@/lib/customer-issues/server";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const ALL = "__all";
const STATUS_LABEL = Object.fromEntries(ISSUE_STATUSES.map((s) => [s.value, s.label]));

export function CompletenessPill({ issue }: { issue: Pick<IssueDto, "completeness" | "rcaComplete" | "needsRca"> }) {
  const { done, total } = issue.completeness;
  // Non-bug dispositions don't need an RCA: fully classified = done.
  const classified = !issue.rcaComplete && !issue.needsRca && done === total;
  const tone = issue.rcaComplete || classified ? "bg-green-100 text-green-800" : done === total ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", tone)} title={issue.completeness.missing.length ? `Missing: ${issue.completeness.missing.join(", ")}` : undefined}>
      {issue.rcaComplete ? "RCA complete" : classified ? "Classified" : `${done}/${total} fields`}
    </span>
  );
}

export function RunResultBadge({ result }: { result: string | null }) {
  if (!result) return <span className="text-neutral-500">—</span>;
  const tone: Record<string, string> = { PASS: "bg-green-100 text-green-800", FAIL: "bg-red-100 text-red-800", BLOCKED: "bg-amber-100 text-amber-800", NA: "bg-neutral-100 text-neutral-700", PENDING: "bg-neutral-100 text-neutral-700" };
  return <Badge className={cn("font-medium", tone[result])}>{RUN_RESULT_LABELS[result as keyof typeof RUN_RESULT_LABELS]}</Badge>;
}

type Props = {
  issues: IssueDto[];
  lists: Lists;
  selected: Set<string>;
  onSelect: (ids: Set<string>) => void;
  onBulkEdit: () => void;
};

/** Issue list with search, filters and the Needs RCA queue; rows link to the detail page. */
export function IssueList({ issues, lists, selected, onSelect, onBulkEdit }: Props) {
  const [q, setQ] = useState("");
  const [queue, setQueue] = useState<"all" | "needs" | "noCases">("all");
  const [disposition, setDisposition] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const needsCount = issues.filter((i) => i.needsRca).length;
  const missingCases = issues.filter((i) => lists.key(i.dispositionId) === "VALID_BUG" && i.regressionRequired && i.caseCount === 0).length;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return issues.filter(
      (i) =>
        (queue === "all" || (queue === "needs" ? i.needsRca : lists.key(i.dispositionId) === "VALID_BUG" && i.regressionRequired && i.caseCount === 0)) &&
        (disposition === ALL || (disposition === "none" ? !i.dispositionId : i.dispositionId === disposition)) &&
        (category === ALL || i.rcaCategoryId === category) &&
        (status === ALL || i.status === status) &&
        (!needle || `${i.issueKey} ${i.summary} ${i.module ?? ""} ${i.components.join(" ")}`.toLowerCase().includes(needle)),
    );
  }, [issues, q, queue, disposition, category, status, lists]);

  const allShownSelected = shown.length > 0 && shown.every((i) => selected.has(i.id));
  const toggleAll = () => onSelect(allShownSelected ? new Set([...selected].filter((id) => !shown.some((i) => i.id === id))) : new Set([...selected, ...shown.map((i) => i.id)]));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect(next);
  };

  return (
    <section aria-label="Customer issues" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Queue" className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", `All (${issues.length})`],
              ["needs", `Needs RCA (${needsCount})`],
              ["noCases", `Valid bugs without regression cases (${missingCases})`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={queue === v}
              onClick={() => setQueue(v)}
              className={cn("rounded-full border px-3 py-1 text-sm", queue === v ? "border-rose-700 bg-rose-700 text-rose-50" : "border-neutral-200 text-neutral-700 hover:bg-neutral-100")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutral-500" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search key, summary, module…" aria-label="Search issues" className="pl-8" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Disposition" all="All dispositions" value={disposition} onChange={setDisposition} options={[{ value: "none", label: "Not classified" }, ...lists.of("DISPOSITION").map((d) => ({ value: d.id, label: d.name }))]} />
        <FilterSelect label="RCA category" all="All RCA categories" value={category} onChange={setCategory} options={lists.of("RCA_CATEGORY").map((d) => ({ value: d.id, label: d.name }))} />
        <FilterSelect label="Status" all="All statuses" value={status} onChange={setStatus} options={ISSUE_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-neutral-700">{selected.size} selected</span>
            <Button size="sm" onClick={onBulkEdit} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
              Bulk edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onSelect(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {!issues.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center">
          <ClipboardList className="size-8 text-neutral-400" aria-hidden />
          <p className="font-medium text-neutral-900">No customer issues yet</p>
          <p className="max-w-md text-sm text-neutral-600">Sync them from Jira, import a CSV or Excel file, or add one with + New issue.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-card">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs font-medium tracking-wide text-neutral-600 uppercase">
              <tr>
                <th className="w-10 px-3 py-2">
                  <Checkbox checked={allShownSelected} onCheckedChange={toggleAll} aria-label="Select all shown" />
                </th>
                <th className="px-3 py-2">Issue</th>
                <th className="px-3 py-2">Product · module</th>
                <th className="px-3 py-2">Disposition</th>
                <th className="px-3 py-2">RCA category</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">RCA</th>
                <th className="px-3 py-2 text-right">Cases</th>
                <th className="px-3 py-2">Last run</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {shown.map((i) => (
                <tr key={i.id} className="align-top hover:bg-neutral-50" data-testid="issue-row">
                  <td className="px-3 py-2">
                    <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggle(i.id)} aria-label={`Select ${i.issueKey}`} />
                  </td>
                  <td className="max-w-80 px-3 py-2">
                    <Link href={`/customer-issues/${i.id}`} className="font-mono text-xs font-semibold text-rose-800 hover:underline">
                      {i.issueKey}
                    </Link>
                    {i.source === "JIRA" && <Badge className="ml-1.5 bg-blue-100 font-normal text-blue-800">Jira</Badge>}
                    {i.recurring && <Badge className="ml-1.5 bg-amber-100 font-normal text-amber-800">Recurring</Badge>}
                    <p className="line-clamp-2 text-neutral-900">{i.summary}</p>
                  </td>
                  <td className="px-3 py-2 text-neutral-700">
                    {lists.name(i.productId) ?? "—"}
                    {i.module && <span className="block text-xs text-neutral-600">{i.module}</span>}
                  </td>
                  <td className="px-3 py-2 text-neutral-800">{lists.name(i.dispositionId) ?? <span className="text-rose-700">Not classified</span>}</td>
                  <td className="px-3 py-2 text-neutral-800">
                    {lists.name(i.rcaCategoryId) ?? "—"}
                    {i.rcaSubcategoryId && <span className="block text-xs text-neutral-600">{lists.name(i.rcaSubcategoryId)}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-800">{i.severity ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-800">{STATUS_LABEL[i.status]}</td>
                  <td className="px-3 py-2">
                    <CompletenessPill issue={i} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{i.caseCount}</td>
                  <td className="px-3 py-2">
                    <RunResultBadge result={i.lastRunResult} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-700">{formatDate(i.createdDate)}</td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-neutral-600">
                    No issues match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FilterSelect({ label, all, value, onChange, options }: { label: string; all: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-48" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={ALL}>{all}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
