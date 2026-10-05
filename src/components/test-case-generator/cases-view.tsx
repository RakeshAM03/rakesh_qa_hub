"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookMarked,
  ChevronDown,
  ClipboardCopy,
  Copy,
  CopyPlus,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Gauge,
  Grid3x3,
  HelpCircle,
  Loader2,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Send,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import { Pagination } from "@/components/shared/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { coverageMatrix } from "@/lib/tcgen/coverage";
import { numberedSteps } from "@/lib/tcgen/export";
import type { QualityReport } from "@/lib/tcgen/quality";
import { blankCase, CASE_TYPES, CATEGORIES, newKey, PRIORITIES, priorityLabel, type CaseType, type Category, type GenerationResult, type Priority, type PriorityScheme, type TestCase } from "@/lib/tcgen/types";
import { cn } from "@/lib/utils";
import { CaseDrawer } from "./case-drawer";

export const PAGE_SIZE = 50;

export const PRIORITY_TONE: Record<Priority, string> = {
  P1: "bg-red-100 text-red-800",
  P2: "bg-orange-100 text-orange-800",
  P3: "bg-amber-100 text-amber-800",
  P4: "bg-neutral-100 text-neutral-700",
};
export const TYPE_TONE: Record<CaseType, string> = { Positive: "bg-green-100 text-green-800", Negative: "bg-rose-100 text-rose-800" };

/** Category pills: a few colour families so the table stays calm. */
export function categoryTone(c: Category): string {
  if (c === "Functional" || c === "Integration") return "bg-blue-100 text-blue-800";
  if (c === "Validation" || c === "Boundary Value" || c === "Data Integrity") return "bg-violet-100 text-violet-800";
  if (c === "Security" || c === "API / Security") return "bg-red-100 text-red-800";
  if (c === "API") return "bg-teal-100 text-teal-800";
  return "bg-neutral-100 text-neutral-800";
}

export type Actions = {
  excel: (cases: TestCase[]) => void;
  csv: (cases: TestCase[]) => void;
  markdown: () => void;
  gherkin: () => void;
  postman?: () => void;
  playground?: () => void;
  library: () => void;
  save: () => void;
  /** AI: rewrite weak rows. */
  improve?: () => void;
  /** No AI: copy a prompt with the weak rows. */
  copyImprove: () => void;
};

type Props = {
  result: GenerationResult;
  onCases: (cases: TestCase[]) => void;
  scheme: PriorityScheme;
  requirement: string;
  prefix: string;
  actions: Actions;
  busy: string | null;
  dirty: boolean;
  savedName: string | null;
  quality: QualityReport;
};

const ALL = "__all__";
const PRIORITY_ORDER: Record<Priority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

export function CasesView({ result, onCases, scheme, requirement, prefix, actions, busy, dirty, savedName, quality }: Props) {
  const cases = result.testCases;
  const [category, setCategory] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [weakOnly, setWeakOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"order" | "id" | "priority">("order");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "coverage">("table");
  const [insightsOpen, setInsightsOpen] = useState(true);

  const categories = useMemo(() => CATEGORIES.filter((c) => cases.some((x) => x.category === c)), [cases]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = cases.filter(
      (c) =>
        (category === ALL || c.category === category) &&
        (type === ALL || c.type === type) &&
        (priority === ALL || c.priority === priority) &&
        (!weakOnly || quality.weakKeys.has(c.key)) &&
        (!q || [c.id, c.title, c.preconditions, c.testData, c.expectedResult, ...c.steps].join(" ").toLowerCase().includes(q)),
    );
    if (sort === "id") return [...list].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    if (sort === "priority") return [...list].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    return list;
  }, [cases, category, type, priority, weakOnly, quality, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const selectedCases = cases.filter((c) => selected.has(c.key));
  const editingCase = cases.find((c) => c.key === editing) ?? null;
  const coverage = useMemo(() => (view === "coverage" ? coverageMatrix(requirement, cases) : []), [view, requirement, cases]);
  const isFiltered = category !== ALL || type !== ALL || priority !== ALL || weakOnly || query.trim() !== "";

  const update = (key: string, patch: Partial<TestCase>) => onCases(cases.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const remove = (keys: Set<string>) => {
    onCases(cases.filter((c) => !keys.has(c.key)));
    setSelected(new Set([...selected].filter((k) => !keys.has(k))));
  };
  const move = (key: string, delta: number) => {
    const i = cases.findIndex((c) => c.key === key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= cases.length) return;
    const next = [...cases];
    [next[i], next[j]] = [next[j], next[i]];
    onCases(next);
  };
  const duplicate = (c: TestCase) => {
    const i = cases.findIndex((x) => x.key === c.key);
    onCases([...cases.slice(0, i + 1), { ...c, key: newKey(), id: `${c.id}-copy`, title: `${c.title} (copy)`, steps: [...c.steps], api: c.api ? { ...c.api, headers: { ...c.api.headers }, assertions: [...c.api.assertions] } : null }, ...cases.slice(i + 1)]);
  };
  const toggleSel = (key: string) => setSelected((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])));
  const allShownSelected = shown.length > 0 && shown.every((c) => selected.has(c.key));

  const weakCount = quality.weakKeys.size;
  const scoreTone = quality.score >= 80 ? "bg-green-100 text-green-800" : quality.score >= 60 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";

  return (
    <section aria-labelledby="tcg-cases" className="flex min-w-0 flex-col gap-3 rounded-xl border border-neutral-200 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tcg-cases" className="text-base font-semibold">
          2. Generated test cases <span className="font-normal text-neutral-600">({cases.length})</span>
        </h2>
        <p className="text-sm text-neutral-700">
          {savedName ? (
            <>
              Saved as <span className="font-medium">{savedName}</span>
              {dirty && " · unsaved changes"}
            </>
          ) : (
            "Not saved yet"
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2" role="region" aria-label="Quality">
        <span className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold", scoreTone)} data-testid="quality-score">
          <Gauge className="size-4" aria-hidden /> Quality score: {quality.score}
        </span>
        <span className="text-sm text-neutral-700">
          Rows {Math.floor(quality.rowScore * 100 + 1e-9)}% · Coverage {quality.coverage === null ? "n/a (no limits or values found)" : `${Math.floor(quality.coverage * 100 + 1e-9)}%`} · {weakCount} weak {weakCount === 1 ? "row" : "rows"}
        </span>
        {weakCount > 0 && (
          <div className="ml-auto flex flex-wrap gap-2">
            {actions.improve ? (
              <Button type="button" size="sm" onClick={actions.improve} disabled={busy !== null} className="bg-blue-700 text-blue-50 hover:bg-blue-800">
                {busy === "improve" ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Improve weak cases
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={actions.copyImprove}>
              <ClipboardCopy aria-hidden /> Copy improve prompt
            </Button>
          </div>
        )}
        {quality.uncovered.length > 0 && (
          <p className="w-full text-sm text-amber-800">
            <AlertTriangle className="mr-1 inline size-4" aria-hidden />
            Not covered by any case: {quality.uncovered.slice(0, 6).join("; ")}
            {quality.uncovered.length > 6 ? ` …and ${quality.uncovered.length - 6} more` : ""}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" aria-label="Summary">
        {categories.map((c) => (
          <Badge key={c} className={cn("font-normal", categoryTone(c))}>
            {c}: {cases.filter((x) => x.category === c).length}
          </Badge>
        ))}
        <span className="mx-1 h-4 w-px bg-neutral-300" aria-hidden />
        {CASE_TYPES.map((t) => (
          <Badge key={t} className={cn("font-normal", TYPE_TONE[t])}>
            {t}: {cases.filter((x) => x.type === t).length}
          </Badge>
        ))}
        <span className="mx-1 h-4 w-px bg-neutral-300" aria-hidden />
        {PRIORITIES.map((p) => (
          <Badge key={p} className={cn("font-normal", PRIORITY_TONE[p])}>
            {priorityLabel(p, scheme)}: {cases.filter((x) => x.priority === p).length}
          </Badge>
        ))}
        <span className="mx-1 h-4 w-px bg-neutral-300" aria-hidden />
        <span className="text-sm text-neutral-700">Automation candidates: {cases.filter((c) => c.automationCandidate).length}</span>
      </div>

      {(result.summary || result.requirementRules.length > 0 || result.assumptions.length > 0 || result.questions.length > 0) && (
        <div className="rounded-lg border border-neutral-200">
          <button type="button" onClick={() => setInsightsOpen((v) => !v)} aria-expanded={insightsOpen} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium">
            <HelpCircle className="size-4 text-blue-700" aria-hidden /> Summary, rules found, assumptions &amp; questions
            <ChevronDown className={cn("ml-auto size-4 transition-transform", insightsOpen && "rotate-180")} aria-hidden />
          </button>
          {insightsOpen && (
            <div className="grid gap-3 border-t border-neutral-200 px-3 py-3 text-sm md:grid-cols-3">
              {result.summary && <p className="md:col-span-3">{result.summary}</p>}
              {result.requirementRules.length > 0 && (
                <div>
                  <p className="mb-1 font-medium">Rules found in the requirement</p>
                  <ul className="list-disc space-y-0.5 pl-5" aria-label="Rules found">
                    {result.requirementRules.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.assumptions.length > 0 && (
                <div>
                  <p className="mb-1 font-medium">Assumptions</p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {result.assumptions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.questions.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <p className="font-medium">Open questions</p>
                    <CopyButton text={result.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")} label="Copy questions" message="Questions copied" />
                  </div>
                  <ol className="list-decimal space-y-0.5 pl-5">
                    {result.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Export and save">
        <Button type="button" size="sm" variant="outline" onClick={() => actions.excel(cases)} disabled={busy !== null}>
          <FileSpreadsheet aria-hidden /> Export Excel
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => actions.csv(cases)}>
          <Table2 aria-hidden /> Export CSV
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={actions.markdown}>
          <Copy aria-hidden /> Copy Markdown
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={actions.gherkin}>
          <FileText aria-hidden /> Download Gherkin
        </Button>
        {actions.postman && (
          <Button type="button" size="sm" variant="outline" onClick={actions.postman}>
            <FileCode2 aria-hidden /> Export for Postman
          </Button>
        )}
        {actions.playground && (
          <Button type="button" size="sm" variant="outline" onClick={actions.playground} disabled={busy !== null}>
            <Send aria-hidden /> Send to API Playground
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={actions.library} disabled={busy !== null}>
          <BookMarked aria-hidden /> Save to TC Library
        </Button>
        <Button type="button" size="sm" onClick={actions.save} disabled={busy !== null} className="bg-blue-700 text-blue-50 hover:bg-blue-800">
          <Save aria-hidden /> Save generation
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" aria-hidden />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search test cases"
            aria-label="Search test cases"
            className="pl-9"
          />
        </div>
        <FilterSelect label="Category" value={category} onChange={(v) => (setCategory(v), setPage(1))} options={categories} />
        <FilterSelect label="Type" value={type} onChange={(v) => (setType(v), setPage(1))} options={CASE_TYPES} />
        <FilterSelect label="Priority" value={priority} onChange={(v) => (setPriority(v), setPage(1))} options={PRIORITIES} render={(p) => priorityLabel(p as Priority, scheme)} />
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-40" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="order">Sort: as listed</SelectItem>
            <SelectItem value="id">Sort: by ID</SelectItem>
            <SelectItem value="priority">Sort: by priority</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex h-9 items-center gap-2 rounded-md border border-neutral-200 px-3 text-sm">
          <Checkbox checked={weakOnly} onCheckedChange={(v) => (setWeakOnly(v === true), setPage(1))} />
          Weak rows only ({weakCount})
        </label>
        <Button type="button" variant="outline" onClick={() => setView(view === "table" ? "coverage" : "table")} aria-pressed={view === "coverage"}>
          <Grid3x3 aria-hidden /> Coverage view
        </Button>
      </div>

      {view === "coverage" ? (
        <CoverageTable rows={coverage} />
      ) : (
        <>
          {selectedCases.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm" role="region" aria-label="Bulk actions">
              <span className="font-medium">{selectedCases.length} selected</span>
              <Select onValueChange={(p) => onCases(cases.map((c) => (selected.has(c.key) ? { ...c, priority: p as Priority } : c)))}>
                <SelectTrigger className="h-8 w-44 bg-card" aria-label="Change priority of selected">
                  <SelectValue placeholder="Change priority…" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {priorityLabel(p, scheme)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" variant="outline" className="bg-card" onClick={() => actions.csv(selectedCases)}>
                Export selected (CSV)
              </Button>
              <Button type="button" size="sm" variant="outline" className="bg-card" onClick={() => actions.excel(selectedCases)}>
                Export selected (Excel)
              </Button>
              <Button type="button" size="sm" variant="outline" className="bg-card text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => remove(new Set(selected))}>
                <Trash2 aria-hidden /> Delete selected
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full border-collapse text-sm" aria-label="Test cases">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-700">
                <tr>
                  <th scope="col" className="w-8 px-2 py-2">
                    <Checkbox
                      checked={allShownSelected}
                      onCheckedChange={(v) => setSelected((s) => (v ? new Set([...s, ...shown.map((c) => c.key)]) : new Set([...s].filter((k) => !shown.some((c) => c.key === k)))))}
                      aria-label="Select all shown"
                    />
                  </th>
                  {["ID", "Title", "Category", "Type", "Priority", "Automation", "Preconditions", "Steps", "Test data", "Expected result"].map((h) => (
                    <th key={h} scope="col" className="px-2 py-2 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-neutral-600">
                      {isFiltered ? "No test cases match these filters." : "No test cases. Add one below."}
                    </td>
                  </tr>
                )}
                {shown.map((c) => {
                  const open = expanded.has(c.key);
                  const clamp = open ? "" : "line-clamp-3";
                  const issues = quality.issues.get(c.key);
                  return (
                    <tr key={c.key} className={cn("border-t border-neutral-100 align-top hover:bg-neutral-50", issues && "bg-amber-50/60")} data-testid="case-row" data-weak={issues ? "true" : undefined}>
                      <td className={cn("px-2 py-2", issues && "border-l-4 border-l-amber-500")}>
                        <Checkbox checked={selected.has(c.key)} onCheckedChange={() => toggleSel(c.key)} aria-label={`Select ${c.id}`} />
                      </td>
                      <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">
                        <input
                          value={c.id}
                          onChange={(e) => update(c.key, { id: e.target.value })}
                          aria-label={`ID of ${c.title || "test case"}`}
                          className="w-28 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-neutral-300 focus:border-blue-500 focus:outline-none"
                        />
                        {c.template && <Badge variant="outline" className="mt-1 block w-fit border-amber-300 text-[10px] text-amber-800">Template</Badge>}
                        {issues && (
                          <span className="mt-1 flex w-fit items-center gap-1 font-sans text-[11px] text-amber-800" title={issues.join("; ")}>
                            <AlertTriangle className="size-3" aria-hidden /> Weak
                            <span className="sr-only">: {issues.join("; ")}</span>
                          </span>
                        )}
                      </td>
                      <td className="min-w-64 px-2 py-2">
                        <textarea
                          value={c.title}
                          rows={1}
                          onChange={(e) => update(c.key, { title: e.target.value.replace(/\n/g, " ") })}
                          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                          aria-label={`Title of ${c.id}`}
                          placeholder="Verify …"
                          className="field-sizing-content w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 font-medium hover:border-neutral-300 focus:border-blue-500 focus:outline-none"
                        />
                        <div className="mt-0.5 flex items-center gap-1">
                          <button type="button" onClick={() => setEditing(c.key)} className="px-1 text-xs text-blue-800 hover:underline">
                            Edit all fields
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon" className="size-6" aria-label={`More actions for ${c.id}`}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onSelect={() => move(c.key, -1)} disabled={cases[0]?.key === c.key}>
                                <ArrowUp /> Move up
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => move(c.key, 1)} disabled={cases.at(-1)?.key === c.key}>
                                <ArrowDown /> Move down
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => duplicate(c)}>
                                <CopyPlus /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => remove(new Set([c.key]))}>
                                <Trash2 /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <Badge className={cn("font-normal whitespace-nowrap", categoryTone(c.category))}>{c.category}</Badge>
                      </td>
                      <td className="px-2 py-2">
                        <Badge className={cn("font-normal", TYPE_TONE[c.type])}>{c.type}</Badge>
                      </td>
                      <td className="px-2 py-2">
                        <Badge className={cn("font-normal whitespace-nowrap", PRIORITY_TONE[c.priority])}>{priorityLabel(c.priority, scheme)}</Badge>
                      </td>
                      <td className="px-2 py-2">
                        <Switch checked={c.automationCandidate} onCheckedChange={(v) => update(c.key, { automationCandidate: v })} aria-label={`Automation candidate ${c.id}`} />
                      </td>
                      <td className="min-w-40 max-w-52 px-2 py-2 text-xs">
                        <p className={cn("whitespace-pre-line", clamp)}>{c.preconditions}</p>
                      </td>
                      <td className="min-w-48 max-w-64 px-2 py-2 text-xs">
                        <p className={cn("whitespace-pre-line", clamp)}>{numberedSteps(c.steps)}</p>
                      </td>
                      <td className="min-w-36 max-w-48 px-2 py-2 text-xs">
                        <p className={cn("whitespace-pre-line break-words", clamp, !c.testData.trim() && "text-red-700 italic")}>{c.testData || "(empty)"}</p>
                      </td>
                      <td className="min-w-48 max-w-64 px-2 py-2 text-xs">
                        <p className={cn("whitespace-pre-line", clamp)}>{c.expectedResult}</p>
                        <button
                          type="button"
                          onClick={() => setExpanded((s) => (s.has(c.key) ? new Set([...s].filter((k) => k !== c.key)) : new Set([...s, c.key])))}
                          aria-expanded={open}
                          className="mt-0.5 text-blue-800 hover:underline"
                        >
                          {open ? "Collapse" : "Expand"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const c = blankCase(prefix, cases.length + 1);
                onCases([...cases, c]);
                setEditing(c.key);
              }}
            >
              <Plus aria-hidden /> Add test case
            </Button>
            {pages > 1 && <Pagination page={current} size={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />}
          </div>
        </>
      )}

      <CaseDrawer testCase={editingCase} scheme={scheme} issues={editingCase ? (quality.issues.get(editingCase.key) ?? []) : []} onChange={(c) => update(c.key, c)} onClose={() => setEditing(null)} />
    </section>
  );
}

function FilterSelect({ label, value, onChange, options, render = (v) => v }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[]; render?: (v: string) => string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40" aria-label={`Filter by ${label.toLowerCase()}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={ALL}>All {label === "Category" ? "categories" : label === "Type" ? "types" : "priorities"}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {render(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CoverageTable({ rows }: { rows: ReturnType<typeof coverageMatrix> }) {
  if (!rows.length) {
    return <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-600">No acceptance criteria found. Add numbered, bulleted or “AC1:” lines to the requirement to see coverage.</p>;
  }
  const uncovered = rows.filter((r) => !r.caseIds.length).length;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-neutral-700">
        {rows.length - uncovered} of {rows.length} criteria covered{uncovered ? ` · ${uncovered} with no tests` : ""}. Cases are matched by their requirement reference.
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full border-collapse text-sm" aria-label="Coverage">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-700">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Criterion
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Covered by
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ref} className={cn("border-t border-neutral-100 align-top", !r.caseIds.length && "bg-red-50")} data-uncovered={r.caseIds.length ? undefined : "true"}>
                <td className="px-3 py-2">
                  <span className="mr-2 font-mono text-xs font-semibold">{r.ref}</span>
                  {r.text}
                </td>
                <td className="px-3 py-2">{r.caseIds.length ? <span className="font-mono text-xs">{r.caseIds.join(", ")}</span> : <span className="font-medium text-red-800">No tests</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
