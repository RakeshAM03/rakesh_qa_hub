"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, Eye, FileSignature, Loader2, Save, Sparkles, Tag } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";

import { CopyButton } from "@/components/shared/copy-button";
import { useAiEnabled } from "@/components/shared/use-ai-status";
import { useChartTheme } from "@/components/shared/use-chart-theme";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { copyText } from "@/lib/browser";
import { bugFromCluster, clusterMarkdown, failureCopyPrompt, isAppFrame } from "@/lib/failure-analyzer/analyze";
import { CATEGORIES, CATEGORY_ORDER, type CategoryId } from "@/lib/failure-analyzer/rules";
import type { Analysis, Cluster } from "@/lib/failure-analyzer/types";
import { sendHandoff } from "@/lib/handoff";
import { cn } from "@/lib/utils";

export type KnownIssue = { id: string; signature: string; label: string; notes: string | null; createdAt: string };
type Explanation = { rootCause: string; category: string; categoryAgrees: boolean; fix: string };

export function useCategoryColor() {
  const t = useChartTheme();
  return (id: CategoryId) => (id === "unknown" ? t.neutral : t.series(CATEGORY_ORDER.indexOf(id)));
}

type ResultsProps = {
  analysis: Analysis;
  source: string;
  knownIssues: KnownIssue[];
  /** Set when viewing a saved analysis (no Save button). */
  savedName?: string;
  onSave?: () => void;
  onMarkKnown: (cluster: Cluster) => void;
};

export function Results({ analysis, source, knownIssues, savedName, onSave, onMarkKnown }: ResultsProps) {
  const [hideKnown, setHideKnown] = useState(false);
  const [detail, setDetail] = useState<Cluster | null>(null);
  const known = new Map(knownIssues.map((k) => [k.signature, k]));
  const knownCount = analysis.categories.flatMap((c) => c.clusters).filter((c) => known.has(c.signature)).length;

  return (
    <div className="flex flex-col gap-4">
      <Summary analysis={analysis} source={source} savedName={savedName} onSave={onSave} />
      {knownCount > 0 && (
        <div className="flex items-center gap-2">
          <Switch id="fa-hide-known" checked={hideKnown} onCheckedChange={setHideKnown} />
          <Label htmlFor="fa-hide-known" className="text-sm">
            Hide known issues ({knownCount})
          </Label>
        </div>
      )}
      {analysis.categories.map((cat) => {
        const clusters = cat.clusters.filter((c) => !hideKnown || !known.has(c.signature));
        if (!clusters.length) return null;
        return <CategorySection key={cat.category} category={cat.category} count={cat.count} clusters={clusters} known={known} onDetail={setDetail} onMarkKnown={onMarkKnown} />;
      })}
      <DetailDrawer cluster={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function Summary({ analysis, source, savedName, onSave }: { analysis: Analysis; source: string; savedName?: string; onSave?: () => void }) {
  const t = useChartTheme();
  const color = useCategoryColor();
  const data = CATEGORY_ORDER.filter((id) => analysis.categoryCounts[id] > 0).map((id) => ({ id, name: CATEGORIES[id].label, value: analysis.categoryCounts[id] }));
  return (
    <section aria-labelledby="fa-summary" className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="fa-summary" className="text-base font-semibold text-neutral-900">
            {savedName ?? "Results"}
          </h2>
          <p className="text-xs text-neutral-500">Source: {source}</p>
        </div>
        {onSave && (
          <Button size="sm" variant="outline" onClick={onSave}>
            <Save className="size-4" aria-hidden /> Save analysis
          </Button>
        )}
      </div>
      <div className="mt-4 grid gap-6 md:grid-cols-[220px_1fr] md:items-center">
        <div className="relative h-48" role="img" aria-label={`Failures by category: ${data.map((d) => `${d.name} ${d.value}`).join(", ")}`}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={data.length > 1 ? 2 : 0} stroke={t.surface} strokeWidth={2} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.id} fill={color(d.id)} />
                ))}
              </Pie>
              <Tooltip {...t.tooltip} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-neutral-900" data-testid="fa-total">
              {analysis.total}
            </span>
            <span className="text-xs text-neutral-500">failures</span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-neutral-900" data-testid="fa-verdict">
            {analysis.verdict}
          </p>
          {(analysis.passed !== undefined || analysis.skipped !== undefined) && (
            <p className="text-xs text-neutral-500">
              {analysis.passed ?? 0} passed · {analysis.skipped ?? 0} skipped
            </p>
          )}
          <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Categories">
            {data.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm text-neutral-700">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: color(d.id) }} aria-hidden />
                <span className="flex-1">{d.name}</span>
                <span className="font-semibold tabular-nums text-neutral-900">{d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function CategorySection({
  category,
  count,
  clusters,
  known,
  onDetail,
  onMarkKnown,
}: {
  category: CategoryId;
  count: number;
  clusters: Cluster[];
  known: Map<string, KnownIssue>;
  onDetail: (c: Cluster) => void;
  onMarkKnown: (c: Cluster) => void;
}) {
  const cat = CATEGORIES[category];
  const color = useCategoryColor();
  return (
    <Collapsible defaultOpen asChild>
      <section aria-label={`${cat.label} (${count})`} className="rounded-xl border border-neutral-200 bg-card shadow-xs" data-category={category}>
        <CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5">
          <span className="size-3 shrink-0 rounded-sm" style={{ background: color(category) }} aria-hidden />
          <h3 className="flex-1 text-sm font-semibold text-neutral-900">
            {cat.label} <span className="font-normal text-neutral-500">· {count}</span>
          </h3>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              cat.productBug ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-neutral-100 text-neutral-700",
            )}
          >
            {cat.owner}
          </span>
          <ChevronDown className="size-4 text-neutral-500 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="flex flex-col divide-y divide-neutral-200 border-t border-neutral-200">
            {clusters.map((c) => (
              <ClusterRow key={c.signature} cluster={c} known={known.get(c.signature)} onDetail={onDetail} onMarkKnown={onMarkKnown} />
            ))}
          </ul>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function ClusterRow({ cluster: c, known, onDetail, onMarkKnown }: { cluster: Cluster; known?: KnownIssue; onDetail: (c: Cluster) => void; onMarkKnown: (c: Cluster) => void }) {
  const [showAll, setShowAll] = useState(false);
  const [ai, setAi] = useState<Explanation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const aiEnabled = useAiEnabled();
  const router = useRouter();
  const cat = CATEGORIES[c.category];
  const tests = showAll ? c.tests : c.tests.slice(0, 5);

  async function explain() {
    setAiLoading(true);
    try {
      const res = await fetch("/api/failure-analyzer/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cluster: c }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The AI request failed.");
      setAi(data.explanation);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The AI request failed.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:px-5" data-testid="fa-cluster">
      <div className="flex flex-wrap items-start gap-2">
        <code className="min-w-0 flex-1 break-words font-mono text-xs text-neutral-800" title={c.message}>
          {c.message.length > 220 ? `${c.message.slice(0, 220)}…` : c.message}
        </code>
        {known && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
            <Tag className="size-3" aria-hidden /> Known: {known.label}
          </span>
        )}
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700">
          {c.count} {c.count === 1 ? "test" : "tests"}
        </span>
      </div>
      <p className="text-xs text-neutral-600">
        {tests.join(", ")}
        {c.tests.length > 5 && (
          <button type="button" className="ml-1 font-medium text-rose-700 hover:underline dark:text-rose-300" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show all ${c.tests.length}`}
          </button>
        )}
      </p>
      <p className="text-xs text-neutral-500">
        <span className="font-semibold text-neutral-700">Suggested fix:</span> {cat.fix}
      </p>
      {ai && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-950 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
          <p>
            <strong>Likely root cause:</strong> {ai.rootCause}
          </p>
          <p className="mt-1">
            <strong>Category:</strong> {ai.categoryAgrees ? "agrees" : `AI suggests ${CATEGORIES[ai.category as CategoryId]?.label ?? ai.category}`}
          </p>
          <p className="mt-1">
            <strong>Fix:</strong> {ai.fix}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onDetail(c)}>
          <Eye className="size-4" aria-hidden /> View details
        </Button>
        {cat.productBug && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              sendHandoff("bug-formatter", { bug: bugFromCluster(c), source: "Test Failure Analyzer" });
              router.push("/bug-formatter");
            }}
          >
            <FileSignature className="size-4" aria-hidden /> Send to Bug Formatter
          </Button>
        )}
        {!known && (
          <Button size="sm" variant="outline" onClick={() => onMarkKnown(c)}>
            <Tag className="size-4" aria-hidden /> Mark as known flaky
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => copyText(clusterMarkdown(c), "Cluster copied as Markdown")}>
          <Copy className="size-4" aria-hidden /> Copy as Markdown
        </Button>
        {aiEnabled === true && !ai && (
          <Button size="sm" variant="outline" onClick={explain} disabled={aiLoading}>
            {aiLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Explain with AI
          </Button>
        )}
        {aiEnabled === false && <CopyButton text={failureCopyPrompt(c)} label="Copy AI prompt" message="Prompt copied — paste it into Claude" />}
      </div>
    </li>
  );
}

function DetailDrawer({ cluster, onClose }: { cluster: Cluster | null; onClose: () => void }) {
  return (
    <Sheet open={!!cluster} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {cluster && (
          <>
            <SheetHeader>
              <SheetTitle>{CATEGORIES[cluster.category].label}</SheetTitle>
              <SheetDescription>
                {cluster.count} failing {cluster.count === 1 ? "test" : "tests"} · example: {cluster.sample.testName}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-6">
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Message</h3>
                <pre className="whitespace-pre-wrap break-words rounded-lg bg-neutral-100 p-3 font-mono text-xs text-neutral-800">{cluster.sample.message}</pre>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Stack trace</h3>
                <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-3 font-mono text-xs leading-5" data-testid="fa-stack">
                  {cluster.sample.stack.map((l, i) => (
                    <div key={i} className={isAppFrame(l) ? "font-semibold text-neutral-900" : "text-neutral-400"}>
                      {l}
                    </div>
                  ))}
                </pre>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Tests ({cluster.tests.length})</h3>
                <ul className="list-disc pl-5 text-sm text-neutral-700">
                  {cluster.tests.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
