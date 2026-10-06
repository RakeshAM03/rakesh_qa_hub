"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, BookMarked, ChevronDown, ClipboardCopy, ListChecks, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAiEnabled } from "@/components/shared/use-ai-status";
import { toastResponseError, useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { useYourName } from "@/components/shared/your-name";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AUTOMATION_LABELS, KEYS } from "@/config/customer-issues";
import { copyText } from "@/lib/browser";
import { checklistCases, fromTestCase, tcInputFor, type CaseInput } from "@/lib/customer-issues/cases";
import type { Lists } from "@/lib/customer-issues/model";
import type { CaseDto, IssueDto } from "@/lib/customer-issues/server";
import { parseAnswer } from "@/lib/tcgen/extract";
import { buildCopyPrompt } from "@/lib/tcgen/prompt";
import { CATEGORIES } from "@/lib/tcgen/types";
import { cn } from "@/lib/utils";

import { Card } from "./issue-detail";

const PRIORITY_LABEL: Record<string, string> = { P1: "P1 - Critical", P2: "P2 - High", P3: "P3 - Medium", P4: "P4 - Low" };
const linesOf = (s: string) =>
  s
    .split(/\n/)
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);

export function CasesPanel({ issue, lists, onChanged }: { issue: IssueDto; lists: Lists; onChanged: () => void }) {
  const [cases, setCases] = useState<CaseDto[] | null>(null);
  const [version, setVersion] = useState(0);
  const [preview, setPreview] = useState<{ source: string; cases: CaseInput[] } | null>(null);
  const [claudeOpen, setClaudeOpen] = useState(false);
  const [editing, setEditing] = useState<CaseDto | "new" | null>(null);
  const [retiring, setRetiring] = useState<CaseDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [inLibrary, setInLibrary] = useState(Boolean(issue.tcLibraryEntryId));
  const ai = useAiEnabled();
  const { name } = useYourName();
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/customer-issues/issues/${issue.id}/cases`, { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => setCases(j.cases))
      .catch(() => undefined);
    return () => controller.abort();
  }, [issue.id, version]);
  // Only the cases reload — reloading the issue would discard unsaved classification edits.
  const reload = () => {
    setVersion((v) => v + 1);
    onChanged();
  };

  const isValidBug = lists.key(issue.dispositionId) === KEYS.VALID_BUG;
  if (!isValidBug || !issue.regressionRequired) {
    return (
      <Card title="Regression test cases">
        <p className="text-sm text-neutral-700">
          {!isValidBug ? "Regression cases are written for issues with disposition Valid Bug." : "Regression required is off for this issue — turn it on above to add cases."}
          {cases && cases.length > 0 && ` This issue still has ${cases.length} case${cases.length === 1 ? "" : "s"} from before.`}
        </p>
      </Card>
    );
  }

  const forCases = { ...issue };
  const active = (cases ?? []).filter((c) => !c.retired);
  const retired = (cases ?? []).filter((c) => c.retired);

  async function addCases(list: CaseInput[]) {
    setBusy(true);
    const res = await fetch(`/api/customer-issues/issues/${issue.id}/cases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cases: list }) });
    setBusy(false);
    if (!res.ok) return toastResponseError(res, "Couldn't add the cases.");
    toast.success(`${list.length} case${list.length === 1 ? "" : "s"} added`);
    setPreview(null);
    reload();
  }

  async function generateAi() {
    setBusy(true);
    const res = await fetch("/api/test-case-generator/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tcInputFor(forCases, lists)) });
    setBusy(false);
    if (!res.ok) return toastResponseError(res, "The AI generation failed.");
    const { result } = await res.json();
    setPreview({ source: "AI", cases: result.testCases.map(fromTestCase) });
  }

  async function patch(c: CaseDto, body: Partial<CaseDto>) {
    const res = await fetch(`/api/customer-issues/cases/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return toastResponseError(res, "Couldn't save the case.");
    const d = await res.json();
    setCases((prev) => prev?.map((x) => (x.id === c.id ? d.case : x)) ?? prev);
  }

  async function remove(c: CaseDto) {
    const res = await withPasscode((headers) => fetch(`/api/customer-issues/cases/${c.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't delete the case.");
    toast.success(`${c.caseId} deleted`);
    reload();
  }

  async function retire(c: CaseDto, retiredFlag: boolean, reason?: string) {
    const res = await withPasscode((headers) => fetch(`/api/customer-issues/cases/${c.id}/retire`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ retired: retiredFlag, reason }) }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't update the case.");
    toast.success(retiredFlag ? `${c.caseId} retired` : `${c.caseId} is active again`);
    setRetiring(null);
    reload();
  }

  async function saveToLibrary() {
    const res = await fetch(`/api/customer-issues/issues/${issue.id}/tc-library`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actor: name || undefined }) });
    if (!res.ok) return toastResponseError(res, "Couldn't save to the TC Library.");
    const d = await res.json();
    toast.success(d.updated ? "TC Library entry updated" : "Saved to the TC Library");
    setInLibrary(true);
  }

  return (
    <Card title="Regression test cases">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-neutral-700">
          {active.length} active · {active.filter((c) => c.mandatory).length} mandatory before release{retired.length ? ` · ${retired.length} retired` : ""}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={busy} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
              <Sparkles aria-hidden /> Generate test cases <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setPreview({ source: "Checklist", cases: checklistCases(forCases, lists) })}>
              <ListChecks aria-hidden /> Checklist (no AI)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setClaudeOpen(true)}>
              <ClipboardCopy aria-hidden /> Copy prompt for Claude…
            </DropdownMenuItem>
            {ai && (
              <DropdownMenuItem onSelect={() => void generateAi()}>
                <Sparkles aria-hidden /> Generate with AI
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus aria-hidden /> Add case
        </Button>
        <Button size="sm" variant="outline" onClick={saveToLibrary} disabled={!active.length}>
          <BookMarked aria-hidden /> {inLibrary ? "Update TC Library" : "Save to TC Library"}
        </Button>
      </div>

      {!cases ? null : !active.length ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-700">No regression cases yet. Generate them from the issue (summary, description, RCA, sub-category and prevention) or add one by hand.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200" aria-label="Regression cases">
          {active.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 px-3 py-2.5" data-testid="regression-case">
              <div className="flex flex-wrap items-start gap-2">
                <span className="font-mono text-xs font-semibold text-rose-800">{c.caseId}</span>
                <span className="min-w-0 flex-1 text-sm text-neutral-900">{c.title}</span>
                <Badge className="bg-neutral-100 font-normal text-neutral-700">{c.category}</Badge>
                <Badge className="bg-neutral-100 font-normal text-neutral-700">{c.type}</Badge>
                <Badge className={cn("font-normal", c.priority === "P1" ? "bg-red-100 text-red-800" : c.priority === "P2" ? "bg-orange-100 text-orange-800" : "bg-neutral-100 text-neutral-700")}>{PRIORITY_LABEL[c.priority] ?? c.priority}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2 text-neutral-800">
                  <Switch checked={c.mandatory} onCheckedChange={(v) => void patch(c, { mandatory: v })} aria-label={`${c.caseId} mandatory before release`} /> Mandatory before release
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-800">Automated?</span>
                  <Select value={c.automated} onValueChange={(v) => void patch(c, { automated: v as CaseDto["automated"] })}>
                    <SelectTrigger className="h-8 w-28" aria-label={`${c.caseId} automated`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {Object.entries(AUTOMATION_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {c.automated === "YES" && <AutomationRef c={c} onSave={(ref) => void patch(c, { automationRef: ref })} />}
                </div>
                <div className="ml-auto flex">
                  <Button size="icon-sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.caseId}`}>
                    <Pencil aria-hidden />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setRetiring(c)} aria-label={`Retire ${c.caseId}`}>
                    <Archive aria-hidden />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => void remove(c)} aria-label={`Delete ${c.caseId}`}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {retired.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-neutral-700">Retired cases ({retired.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {retired.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-neutral-700">
                <span className="font-mono text-xs">{c.caseId}</span>
                <span className="line-through">{c.title}</span>
                <span className="text-xs">— {c.retiredReason}</span>
                <Button size="sm" variant="ghost" onClick={() => void retire(c, false)}>
                  <ArchiveRestore aria-hidden /> Bring back
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <PreviewDialog preview={preview} onClose={() => setPreview(null)} onAdd={addCases} busy={busy} />
      <ClaudeDialog open={claudeOpen} onOpenChange={setClaudeOpen} prompt={claudeOpen ? buildCopyPrompt(tcInputFor(forCases, lists)) : ""} onCases={(list) => setPreview({ source: "Claude", cases: list })} />
      {editing && <CaseDialog initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} issueId={issue.id} />}
      <RetireDialog c={retiring} onClose={() => setRetiring(null)} onRetire={(reason) => retiring && void retire(retiring, true, reason)} />
      {passcodeDialog}
    </Card>
  );
}

function AutomationRef({ c, onSave }: { c: CaseDto; onSave: (ref: string | null) => void }) {
  const [ref, setRef] = useState(c.automationRef ?? "");
  return <Input value={ref} onChange={(e) => setRef(e.target.value)} onBlur={() => ref !== (c.automationRef ?? "") && onSave(ref.trim() || null)} placeholder="spec / test name" className="h-8 w-56" aria-label={`${c.caseId} automation reference`} />;
}

function PreviewDialog({ preview, onClose, onAdd, busy }: { preview: { source: string; cases: CaseInput[] } | null; onClose: () => void; onAdd: (c: CaseInput[]) => void; busy: boolean }) {
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());
  const list = preview?.cases ?? [];
  const chosen = list.filter((_, i) => !unchecked.has(i));
  return (
    <Dialog
      open={!!preview}
      onOpenChange={(o) => {
        if (!o) {
          setUnchecked(new Set());
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Generated regression cases ({preview?.source})</DialogTitle>
          <DialogDescription>Untick any case you don&apos;t want. Added cases get IDs like TC_CI_DEMO-101_01 and are mandatory before release by default.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200" aria-label="Generated cases">
          {list.map((c, i) => (
            <li key={i} className="flex gap-3 px-3 py-2">
              <Checkbox
                checked={!unchecked.has(i)}
                onCheckedChange={() => {
                  const next = new Set(unchecked);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  setUnchecked(next);
                }}
                aria-label={`Include ${c.title}`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900">{c.title}</p>
                <p className="text-xs text-neutral-600">
                  {c.category} · {c.type} · {PRIORITY_LABEL[c.priority] ?? c.priority} · {c.steps.length} steps
                </p>
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!chosen.length || busy}
            onClick={() => {
              onAdd(chosen);
              setUnchecked(new Set());
            }}
            className="bg-rose-700 text-rose-50 hover:bg-rose-800"
          >
            Add {chosen.length} case{chosen.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClaudeDialog({ open, onOpenChange, prompt, onCases }: { open: boolean; onOpenChange: (o: boolean) => void; prompt: string; onCases: (c: CaseInput[]) => void }) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Prompt for Claude</DialogTitle>
          <DialogDescription>Copy the prompt into Claude, then paste its answer below and press Import.</DialogDescription>
        </DialogHeader>
        <Textarea readOnly value={prompt} rows={8} aria-label="Prompt" className="font-mono text-xs" />
        <Button variant="outline" className="w-fit" onClick={() => copyText(prompt, "Prompt copied — paste it into Claude")}>
          <ClipboardCopy aria-hidden /> Copy prompt
        </Button>
        <Label htmlFor="ci-claude-answer">Paste Claude&apos;s answer</Label>
        <Textarea id="ci-claude-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} placeholder="JSON answer (Markdown table also works)" />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <DialogFooter>
          <Button
            onClick={() => {
              const r = parseAnswer(answer);
              if (!r.ok) return setError(r.error);
              setError(null);
              setAnswer("");
              onOpenChange(false);
              onCases(r.result.testCases.map(fromTestCase));
            }}
            disabled={!answer.trim()}
            className="bg-rose-700 text-rose-50 hover:bg-rose-800"
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CaseDialog({ initial, onClose, onSaved, issueId }: { initial: CaseDto | null; onClose: () => void; onSaved: () => void; issueId: string }) {
  const [f, setF] = useState({
    title: initial?.title ?? "Verify ",
    category: initial?.category ?? "Functional",
    type: initial?.type ?? "Positive",
    priority: initial?.priority ?? "P2",
    preconditions: initial?.preconditions ?? "",
    steps: (initial?.steps ?? []).join("\n"),
    testData: initial?.testData ?? "",
    expectedResult: initial?.expectedResult ?? "",
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.title.trim() || f.title.trim() === "Verify") return toast.error("Give the case a title.");
    setBusy(true);
    const body = { ...f, steps: linesOf(f.steps) };
    const res = initial
      ? await fetch(`/api/customer-issues/cases/${initial.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch(`/api/customer-issues/issues/${issueId}/cases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cases: [body] }) });
    setBusy(false);
    if (!res.ok) return toastResponseError(res, "Couldn't save the case.");
    toast.success(initial ? "Case saved" : "Case added");
    onClose();
    onSaved();
  }
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{initial ? `Edit ${initial.caseId}` : "Add a regression case"}</DialogTitle>
            <DialogDescription>Standard Test Case Format — a &ldquo;Verify…&rdquo; title, numbered steps and expected results.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cd-title">Title</Label>
            <Input id="cd-title" value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={500} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cd-category">Category</Label>
              <Select value={f.category} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger id="cd-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cd-type">Type</Label>
              <Select value={f.type} onValueChange={(v) => set({ type: v })}>
                <SelectTrigger id="cd-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="Positive">Positive</SelectItem>
                  <SelectItem value="Negative">Negative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cd-priority">Priority</Label>
              <Select value={f.priority} onValueChange={(v) => set({ priority: v })}>
                <SelectTrigger id="cd-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(
            [
              ["preconditions", "Preconditions (one per line)", 3],
              ["steps", "Steps (one per line)", 5],
              ["testData", "Test data", 2],
              ["expectedResult", "Expected result (one per line)", 4],
            ] as const
          ).map(([k, label, rows]) => (
            <div key={k} className="flex flex-col gap-1.5">
              <Label htmlFor={`cd-${k}`}>{label}</Label>
              <Textarea id={`cd-${k}`} value={f[k]} onChange={(e) => set({ [k]: e.target.value })} rows={rows} />
            </div>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
              {initial ? "Save case" : "Add case"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RetireDialog({ c, onClose, onRetire }: { c: CaseDto | null; onClose: () => void; onRetire: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={!!c} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) onRetire(reason.trim());
          }}
          className="flex flex-col gap-3"
        >
          <DialogHeader>
            <DialogTitle>Retire {c?.caseId}</DialogTitle>
            <DialogDescription>Retired cases leave the mandatory pack but stay in the history. Needs the admin passcode.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="retire-reason">Reason</Label>
          <Input id="retire-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Feature removed in v3.0" autoFocus />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!reason.trim()} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
              Retire case
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
