"use client";

import { useMemo, useState } from "react";
import { Code2, FileCode, Lightbulb, Loader2, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { CodeEditor } from "@/components/shared/code-editor";
import { CopyButton } from "@/components/shared/copy-button";
import { useAiEnabled } from "@/components/shared/use-ai-status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { elementContext, locatorCopyPrompt } from "@/lib/locators/ai-prompt";
import { testSelector } from "@/lib/locators/match";
import { pageObjectSnippets } from "@/lib/locators/page-object";
import { candidateFromSelector, recommendation, suggestLocators, type Candidate } from "@/lib/locators/strategies";
import { buildTree, elementAt, filterTree, findByText, MAX_HTML_BYTES, parseHtml, pathOf, SAMPLE_HTML } from "@/lib/locators/tree";
import { ElementTree } from "./element-tree";
import { SuggestionCard } from "./suggestion-card";

const DRAFT_KEY = "qa-hub:locator-helper:draft";

/** html = editor text; parsed = the HTML last parsed (drives the tree); selected = element path. */
type Draft = { html: string; parsed: string; selected: string | null };
const EMPTY: Draft = { html: "", parsed: "", selected: null };

function readDraft(raw: string | null): Draft {
  try {
    const d = raw ? JSON.parse(raw) : null;
    if (d && typeof d.html === "string") {
      return {
        html: d.html,
        parsed: typeof d.parsed === "string" ? d.parsed : "",
        selected: typeof d.selected === "string" ? d.selected : null,
      };
    }
  } catch {
    // ignore a broken draft
  }
  return EMPTY;
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

const cardClass = "rounded-xl border border-t-4 border-neutral-200 border-t-cyan-500 bg-card p-4 shadow-xs sm:p-5";

export function LocatorHelper() {
  const [raw, setRaw] = useLocalStorage(DRAFT_KEY);
  const draft = useMemo(() => readDraft(raw), [raw]);
  const update = (patch: Partial<Draft>) => setRaw((prev) => JSON.stringify({ ...readDraft(prev), ...patch }));
  const { html, selected } = draft;
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [interactiveOnly, setInteractiveOnly] = useState(false);
  const [findText, setFindText] = useState("");
  const [tab, setTab] = useState<"suggest" | "test">("suggest");
  const [testInput, setTestInput] = useState("");
  const [poOpen, setPoOpen] = useState(false);
  const [ai, setAi] = useState<{ path: string; items: Candidate[] } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const aiEnabled = useAiEnabled();

  // DOMParser documents are inert: no scripts run and nothing is fetched.
  const doc = useMemo(() => (draft.parsed ? parseHtml(draft.parsed, new DOMParser()) : null), [draft.parsed]);

  function parse(source: string) {
    if (!source.trim()) {
      setError("Paste some HTML first.");
      return;
    }
    if (byteLength(source) > MAX_HTML_BYTES) {
      setError("That HTML is larger than 1 MB. Paste a smaller part of the page (e.g. the form or section you need).");
      return;
    }
    setError(null);
    setAi(null);
    update({ html: source, parsed: source, selected: null });
  }

  function select(path: string) {
    update({ selected: path });
  }

  const tree = useMemo(() => (doc ? buildTree(doc) : null), [doc]);
  const filtering = filter.trim() !== "" || interactiveOnly;
  const visibleTree = useMemo(
    () => (tree && filtering ? filterTree(tree, filter, interactiveOnly) : tree),
    [tree, filter, interactiveOnly, filtering],
  );
  const element = doc && selected ? elementAt(doc, selected) : null;
  const candidates = useMemo(() => {
    if (!element) return [];
    const base = suggestLocators(element);
    const extra = ai && ai.path === selected ? ai.items : [];
    return [...base, ...extra].sort((a, b) => b.score - a.score);
  }, [element, ai, selected]);
  const rec = element && candidates.length ? recommendation(element, candidates) : null;

  const test = useMemo(() => (doc && testInput.trim() ? testSelector(doc, testInput) : null), [doc, testInput]);
  const highlighted = useMemo(
    () => new Set(tab === "test" && test && !test.error ? test.elements.map(pathOf) : []),
    [tab, test],
  );

  function onFind() {
    if (!doc) return;
    const el = findByText(doc, findText);
    if (el) select(pathOf(el));
    else toast.error(`No element with text “${findText}”.`);
  }

  async function askAi() {
    if (!element || !selected) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/locator-helper/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: elementContext(element), best: candidates[0]?.css ?? candidates[0]?.xpath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The AI request failed.");
      const items = (data.suggestions as { kind: "css" | "xpath"; selector: string; reason: string }[])
        .map((s) => candidateFromSelector(element, s.kind, s.selector, s.reason))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .filter((c) => !candidates.some((x) => (x.css ?? x.xpath) === (c.css ?? c.xpath)));
      setAi({ path: selected, items });
      toast.success(items.length ? `${items.length} AI suggestion${items.length === 1 ? "" : "s"} added` : "No new suggestions from AI");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The AI request failed.");
    } finally {
      setAiLoading(false);
    }
  }

  const snippets = element && candidates[0] ? pageObjectSnippets(element, candidates[0]) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* Left: input + tree */}
      <div className="flex min-w-0 flex-col gap-6">
        <section aria-labelledby="lh-html" className={cardClass}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="lh-html" className="flex items-center gap-2 text-base font-semibold text-neutral-900">
              <Code2 className="size-4 text-cyan-600" aria-hidden /> HTML
            </h2>
            <button
              type="button"
              className="text-sm font-medium text-cyan-700 hover:underline"
              onClick={() => parse(SAMPLE_HTML)}
            >
              Load sample
            </button>
          </div>
          <CodeEditor
            value={html}
            onChange={(value) => update({ html: value })}
            language="html"
            ariaLabel="HTML input"
            placeholder="Paste HTML here — a single element, a form, or a full page (right-click → Inspect → Copy outerHTML)"
            minHeight="14rem"
            maxHeight="22rem"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => parse(html)} className="bg-cyan-700 text-cyan-50 hover:bg-cyan-800">
              <Wand2 className="size-4" aria-hidden /> Parse
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setError(null);
                setAi(null);
                setRaw(null);
              }}
            >
              <Trash2 className="size-4" aria-hidden /> Clear
            </Button>
          </div>
        </section>

        {doc && (
          <section aria-labelledby="lh-tree" className={cardClass}>
            <h2 id="lh-tree" className="mb-3 text-base font-semibold text-neutral-900">
              Elements
            </h2>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
                <Input
                  aria-label="Filter elements"
                  placeholder="Filter by tag, attribute or text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="lh-interactive" checked={interactiveOnly} onCheckedChange={setInteractiveOnly} />
                <Label htmlFor="lh-interactive" className="text-sm">
                  Interactive only
                </Label>
              </div>
            </div>
            <form
              className="mb-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onFind();
              }}
            >
              <Input
                aria-label="Find by text"
                placeholder="Find by text, e.g. Sign in"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
              />
              <Button type="submit" variant="outline" disabled={!findText.trim()}>
                Find
              </Button>
            </form>
            <div className="max-h-[28rem] overflow-auto rounded-lg border border-neutral-200 p-2">
              {visibleTree ? (
                <ElementTree
                  root={visibleTree}
                  selected={selected}
                  onSelect={select}
                  highlighted={highlighted}
                  expandAll={filtering}
                />
              ) : (
                <p className="p-2 text-sm text-neutral-600">No elements match the filter.</p>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Right: suggestions + tester */}
      <section aria-label="Locators" className={`${cardClass} min-w-0`}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "suggest" | "test")}>
          <TabsList className="mb-4">
            <TabsTrigger value="suggest">Suggestions</TabsTrigger>
            <TabsTrigger value="test">Test a locator</TabsTrigger>
          </TabsList>

          <TabsContent value="suggest" className="flex flex-col gap-4">
            {!doc ? (
              <EmptyHint text="Paste HTML and click Parse — or load the sample — to get started." />
            ) : !element ? (
              <EmptyHint text="Pick an element in the tree (or use Find by text) to see locator suggestions." />
            ) : (
              <>
                {rec && (
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                    <p className="text-sm font-semibold text-cyan-900">
                      Best choice: {rec.best.label}
                    </p>
                    <code className="mt-1 block break-all font-mono text-xs text-cyan-900">
                      {rec.best.playwright ?? rec.best.selenium}
                    </code>
                    {rec.tip && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-cyan-900">
                        <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {rec.tip}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPoOpen(true)}>
                    <FileCode className="size-4" aria-hidden /> Page Object snippet
                  </Button>
                  {aiEnabled === true && (
                    <Button variant="outline" size="sm" onClick={askAi} disabled={aiLoading}>
                      {aiLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                      Ask AI for alternatives
                    </Button>
                  )}
                  {aiEnabled === false && (
                    <CopyButton
                      text={locatorCopyPrompt(elementContext(element), candidates[0]?.css ?? candidates[0]?.xpath)}
                      label="Copy prompt for Claude"
                      message="Prompt copied — paste it into Claude"
                    />
                  )}
                </div>
                <ol className="flex flex-col gap-3" aria-label="Locator suggestions">
                  {candidates.map((c, i) => (
                    <li key={`${c.strategy}-${c.css ?? c.xpath}`}>
                      <SuggestionCard candidate={c} rank={i + 1} />
                    </li>
                  ))}
                </ol>
              </>
            )}
          </TabsContent>

          <TabsContent value="test" className="flex flex-col gap-3">
            <Label htmlFor="lh-test">CSS selector or XPath</Label>
            <Input
              id="lh-test"
              placeholder="e.g. form#login button  or  //button[@type='submit']"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              className="font-mono"
              disabled={!doc}
            />
            {!doc && <EmptyHint text="Parse some HTML first." />}
            {test &&
              (test.error ? (
                <p role="alert" className="text-sm text-red-700">
                  {test.error}
                </p>
              ) : (
                <p role="status" className="text-sm text-neutral-700">
                  <strong>{test.elements.length}</strong> {test.elements.length === 1 ? "element matches" : "elements match"} (
                  {test.kind === "css" ? "CSS" : "XPath"}){test.elements.length > 0 && " — highlighted in the tree"}.
                </p>
              ))}
          </TabsContent>
        </Tabs>
      </section>

      <Dialog open={poOpen} onOpenChange={setPoOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Page Object snippet</DialogTitle>
            <DialogDescription>Field declarations for the top locator ({candidates[0]?.label}).</DialogDescription>
          </DialogHeader>
          {snippets && (
            <div className="flex flex-col gap-4">
              <Snippet title="Selenium Java" code={snippets.java} />
              <Snippet title="Playwright TypeScript" code={snippets.ts} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
        <CopyButton text={code} label="Copy" message={`${title} snippet copied`} />
      </div>
      <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-3 font-mono text-xs text-neutral-800">{code}</pre>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-600">{text}</div>
  );
}
