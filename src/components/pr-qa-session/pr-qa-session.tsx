"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, FlaskConical, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ALL_STEP_IDS,
  BUILT_IN_TEMPLATES,
  DEFAULT_SPEC_FOLDERS,
  FOCUS_AREAS,
  LOGIN_METHODS,
  SESSION_STEPS,
  type LoginMethod,
  type SessionTemplateConfig,
} from "@/config/pr-qa-templates";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { isGithubPrUrl, parsePrUrl } from "@/lib/github";
import { clearHandoff, parseHandoff, useHandoff } from "@/lib/handoff";
import { buildPrompt, diffCommand, sanitizeLoginUrl, type SessionInputs } from "@/lib/pr-qa-session/prompt";
import { cn } from "@/lib/utils";
import { Chip } from "./chip";
import { BeforeYouStart, HowItWorks } from "./info-panels";
import { OutputPanel } from "./output-panel";
import { SaveTemplateDialog } from "./save-template-dialog";
import { TcLibraryPicker } from "./tc-library-picker";

const DRAFT_KEY = "qa-hub:pr-qa-session:draft";

type TcRef = { id: string; name: string };
type Draft = Omit<SessionInputs, "approvedPlan"> & { template: string | null; tcEntry: TcRef | null };

const DEFAULT_DRAFT: Draft = {
  frontendPr: "",
  backendPr: "",
  additionalPrs: [],
  testEnvUrl: "",
  context: "",
  focusAreas: [],
  steps: ALL_STEP_IDS,
  specRef: "",
  loginUrl: "",
  loginMethod: "",
  specFolders: DEFAULT_SPEC_FOLDERS,
  mode: "full",
  resumeFrom: 1,
  template: null,
  tcEntry: null,
};

const draftSchema = z.object({
  frontendPr: z.string(),
  backendPr: z.string(),
  additionalPrs: z.array(z.string()),
  testEnvUrl: z.string(),
  context: z.string(),
  focusAreas: z.array(z.enum(FOCUS_AREAS)),
  steps: z.array(z.number()),
  specRef: z.string(),
  // Older drafts don't have these; the login URL is re-sanitised on read.
  loginUrl: z.string().catch("").transform((v) => sanitizeLoginUrl(v)?.url ?? ""),
  loginMethod: z.enum(["", ...LOGIN_METHODS.map((m) => m.value)] as [LoginMethod, ...LoginMethod[]]).catch(""),
  specFolders: z.string().catch(DEFAULT_SPEC_FOLDERS),
  mode: z.enum(["full", "api", "ui", "security"]).catch("full"),
  resumeFrom: z.number().int().min(1).max(10).catch(1),
  template: z.string().nullable(),
  tcEntry: z.object({ id: z.string(), name: z.string() }).nullable().catch(null),
});

function parseDraft(raw: string | null): Draft {
  if (!raw) return DEFAULT_DRAFT;
  try {
    const result = draftSchema.safeParse({ tcEntry: null, ...JSON.parse(raw) });
    return result.success ? result.data : DEFAULT_DRAFT;
  } catch {
    return DEFAULT_DRAFT;
  }
}

const labelClass = "text-xs font-semibold uppercase tracking-wider text-neutral-500";
const PR_PLACEHOLDER = "https://github.com/example-org/frontend/pull/123";
const PR_ERROR = "Enter a GitHub pull request URL, e.g. https://github.com/example-org/frontend/pull/123";

export function PrQaSession() {
  const [raw, setRaw] = useLocalStorage(DRAFT_KEY);
  const draft = useMemo(() => parseDraft(raw), [raw]);
  const update = (patch: Partial<Draft>) =>
    setRaw((prev) => JSON.stringify({ ...parseDraft(prev), ...patch }));

  // Context and focus areas sent from another module (e.g. Risk-Based Test Planner).
  const rawHandoff = useHandoff("pr-qa-session");
  useEffect(() => {
    const h = parseHandoff<{ context: string; focusAreas: string[]; source: string }>(rawHandoff);
    if (!h) return;
    const focusAreas = (FOCUS_AREAS as readonly string[]).filter((f) => h.focusAreas.includes(f)) as Draft["focusAreas"];
    setRaw((prev) => JSON.stringify({ ...parseDraft(prev), context: h.context, focusAreas, template: null }));
    clearHandoff("pr-qa-session");
    toast.success(`Context and focus areas pre-filled from ${h.source}`);
  }, [rawHandoff, setRaw]);

  const [customTemplates, setCustomTemplates] = useState<SessionTemplateConfig[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [output, setOutput] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [loginNote, setLoginNote] = useState<string | null>(null);
  /** Full outputs of loaded TC Library entries, by id. */
  const tcOutputs = useRef(new Map<string, string>());
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pr-qa-session/templates")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { templates: SessionTemplateConfig[] }) => {
        if (!cancelled) setCustomTemplates(data.templates);
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load saved templates.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const prUrls = [draft.frontendPr, draft.backendPr, ...draft.additionalPrs].map((u) => u.trim());
  const hasPr = prUrls.some(Boolean);
  const urlError = (value: string, field: string) =>
    value.trim() && (attempted || touched[field]) && !isGithubPrUrl(value) ? PR_ERROR : undefined;

  function applyTemplate(t: SessionTemplateConfig) {
    const patch: Partial<Draft> = { template: t.name, focusAreas: [...t.focusAreas], steps: [...t.steps], mode: t.mode ?? "full" };
    // Saved templates also carry a spec reference, login URL / method, spec folders, and context when the field is still empty.
    if (t.specRef) patch.specRef = t.specRef;
    if (t.loginUrl) patch.loginUrl = sanitizeLoginUrl(t.loginUrl)?.url ?? "";
    if (t.loginMethod) patch.loginMethod = t.loginMethod as LoginMethod;
    if (t.specFolders) patch.specFolders = t.specFolders;
    if (t.context && !draft.context.trim()) patch.context = t.context;
    update(patch);
  }

  function toggle<T>(list: T[], item: T) {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  /** The prompt for the current inputs, loading the TC Library entry's output if needed. */
  async function promptFromInputs(): Promise<string | null> {
    let approvedPlan: SessionInputs["approvedPlan"] = null;
    if (draft.tcEntry) {
      const { id, name } = draft.tcEntry;
      let text = tcOutputs.current.get(id);
      if (text === undefined) {
        const res = await fetch(`/api/tc-library/${id}`).catch(() => null);
        if (!res?.ok) {
          toast.error(`Couldn't load “${name}” from the TC Library. Remove it or pick another entry.`);
          return null;
        }
        text = ((await res.json()).entry.output as string) ?? "";
        tcOutputs.current.set(id, text);
      }
      approvedPlan = { name, output: text };
    }
    return buildPrompt({ ...draft, approvedPlan });
  }

  async function build() {
    setAttempted(true);
    if (!hasPr) return;
    if (prUrls.some((u) => u && !isGithubPrUrl(u))) {
      toast.error("Fix the PR URLs marked in red first.");
      return;
    }
    if (draft.steps.length === 0 && !draft.tcEntry) {
      toast.error("Select at least one step.");
      return;
    }
    setBuilding(true);
    const prompt = await promptFromInputs();
    setBuilding(false);
    if (prompt === null) return;
    setOutput(prompt);
    requestAnimationFrame(() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function saveTemplate(name: string): Promise<string | null> {
    if (draft.steps.length === 0) return "Select at least one step first.";
    try {
      const res = await fetch("/api/pr-qa-session/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          focusAreas: draft.focusAreas,
          steps: draft.steps,
          context: draft.context,
          specRef: draft.specRef,
          loginUrl: draft.loginUrl || null,
          loginMethod: draft.loginMethod || null,
          specFolders: draft.specFolders,
        }),
      });
      const data = await res.json();
      if (!res.ok) return data.error ?? "Couldn't save the template.";
      setCustomTemplates((list) => [...list, data.template]);
      update({ template: data.template.name });
      toast.success(`Template “${name}” saved`);
      return null;
    } catch {
      return "Couldn't reach the server. Try again.";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks />
      <BeforeYouStart />

      <section
        aria-labelledby="session-inputs-title"
        className="overflow-hidden rounded-xl border border-t-4 border-neutral-200 border-t-purple-600 bg-card shadow-xs"
      >
        <header className="flex items-center gap-2 border-b border-purple-100 bg-purple-50 px-4 py-3">
          <FlaskConical className="size-4 text-purple-600" aria-hidden />
          <h2 id="session-inputs-title" className="text-base font-semibold text-neutral-900">
            Session Inputs
          </h2>
        </header>

        <div className="flex flex-col gap-6 p-4 sm:p-5">
          <div className="flex flex-col gap-2">
            <span className={labelClass} id="templates-label">
              Templates
            </span>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="templates-label">
              {[...BUILT_IN_TEMPLATES, ...customTemplates].map((t) => (
                <Chip key={t.name} pressed={draft.template === t.name} onClick={() => applyTemplate(t)}>
                  {t.name}
                </Chip>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setSaveOpen(true)} className="text-purple-700">
                <Save /> Save current
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid gap-4 md:grid-cols-2">
              <UrlField
                id="frontend-pr"
                label="Frontend PR URL"
                value={draft.frontendPr}
                error={urlError(draft.frontendPr, "frontend")}
                onChange={(v) => update({ frontendPr: v })}
                onBlur={() => setTouched((t) => ({ ...t, frontend: true }))}
              />
              <UrlField
                id="backend-pr"
                label="Backend PR URL"
                value={draft.backendPr}
                error={urlError(draft.backendPr, "backend")}
                onChange={(v) => update({ backendPr: v })}
                onBlur={() => setTouched((t) => ({ ...t, backend: true }))}
              />
            </div>
            {draft.additionalPrs.map((url, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1">
                  <UrlField
                    id={`additional-pr-${i}`}
                    label={`Additional PR URL ${i + 1}`}
                    hideLabel
                    value={url}
                    error={urlError(url, `additional-${i}`)}
                    onChange={(v) =>
                      update({ additionalPrs: draft.additionalPrs.map((u, j) => (j === i ? v : u)) })
                    }
                    onBlur={() => setTouched((t) => ({ ...t, [`additional-${i}`]: true }))}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove additional PR ${i + 1}`}
                  onClick={() => update({ additionalPrs: draft.additionalPrs.filter((_, j) => j !== i) })}
                >
                  <X />
                </Button>
              </div>
            ))}
            <p className={cn("text-xs", attempted && !hasPr ? "text-red-700" : "text-neutral-500")}>
              At least one PR URL is required. Provide both for contract mismatch analysis.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="w-fit text-purple-700"
              onClick={() => update({ additionalPrs: [...draft.additionalPrs, ""] })}
            >
              <Plus /> Add another PR
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="test-env" className={labelClass}>
                Test Environment URL
              </Label>
              <Input
                id="test-env"
                value={draft.testEnvUrl}
                onChange={(e) => update({ testEnvUrl: e.target.value })}
                placeholder="https://your-env.example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="spec-folders" className={labelClass}>
                Existing Spec Folders <span className="font-normal normal-case tracking-normal">(optional)</span>
              </Label>
              <Input
                id="spec-folders"
                value={draft.specFolders}
                onChange={(e) => update({ specFolders: e.target.value })}
                placeholder={DEFAULT_SPEC_FOLDERS}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
            <LoginUrlField
              key={draft.loginUrl}
              value={draft.loginUrl}
              note={loginNote}
              onSave={(loginUrl, note) => {
                setLoginNote(note);
                if (loginUrl !== draft.loginUrl) update({ loginUrl });
              }}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-method" className={labelClass}>
                Login Method <span className="font-normal normal-case tracking-normal">(optional)</span>
              </Label>
              <Select value={draft.loginMethod || "none"} onValueChange={(v) => update({ loginMethod: (v === "none" ? "" : v) as LoginMethod })}>
                <SelectTrigger id="login-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="none">Not provided</SelectItem>
                  {LOGIN_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="-mt-4 text-xs text-neutral-600">
            Only the login page and method are stored — never usernames, passwords, OTPs or tokens. The prompt tells Claude to read credentials from environment variables
            (e.g. <code>TEST_USER_EMAIL</code>, <code>TEST_USER_PASSWORD</code>) or ask you at run time.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="context" className={labelClass}>
              Additional Context <span className="font-normal normal-case tracking-normal">(optional)</span>
            </Label>
            <Textarea
              id="context"
              value={draft.context}
              onChange={(e) => update({ context: e.target.value })}
              placeholder="e.g. what the feature does, known edge cases"
              className="min-h-20"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className={labelClass} id="focus-label">
              Focus Areas <span className="font-normal normal-case tracking-normal">(optional)</span>
            </span>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="focus-label">
              {FOCUS_AREAS.map((area) => (
                <Chip
                  key={area}
                  pressed={draft.focusAreas.includes(area)}
                  onClick={() => update({ focusAreas: toggle(draft.focusAreas, area), template: null })}
                >
                  {area}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className={labelClass} id="steps-label">
                Steps{" "}
                <span className="font-normal normal-case tracking-normal">— deselect steps you don&apos;t need</span>
              </span>
              <span className="flex gap-3 text-sm">
                <button type="button" className="font-medium text-purple-700 hover:underline" onClick={() => update({ steps: ALL_STEP_IDS, template: null })}>
                  All
                </button>
                <button type="button" className="font-medium text-purple-700 hover:underline" onClick={() => update({ steps: [], template: null })}>
                  None
                </button>
              </span>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="steps-label">
              {SESSION_STEPS.map((step) => (
                <Chip
                  key={step.id}
                  pressed={draft.steps.includes(step.id)}
                  onClick={() => update({ steps: toggle(draft.steps, step.id as number), template: null })}
                >
                  <span>{step.id}.</span> {step.name}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className={labelClass}>
              Approved Steps 1–2 <span className="font-normal normal-case tracking-normal">(optional)</span>
            </span>
            {draft.tcEntry ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm text-teal-800">
                  <BookMarked className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{draft.tcEntry.name}</span>
                  <button
                    type="button"
                    onClick={() => update({ tcEntry: null })}
                    aria-label="Remove TC Library entry"
                    className="rounded-full p-0.5 hover:bg-teal-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
                <span className="text-xs text-neutral-500">Claude will skip Steps 1–2 and start from Step 3.</span>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-fit" onClick={() => setPickerOpen(true)}>
                <BookMarked className="text-teal-600" /> Load from TC Library
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="spec-ref" className={labelClass}>
              Style Reference <span className="font-normal normal-case tracking-normal">(optional — a sample spec or Page Object)</span>
            </Label>
            <Textarea
              id="spec-ref"
              value={draft.specRef}
              onChange={(e) => update({ specRef: e.target.value })}
              placeholder="Paste a sample .spec.ts or Page Object here..."
              className="min-h-28 resize-y font-mono text-xs"
              spellCheck={false}
            />
            <p className="text-xs text-neutral-500">Used in Step 9 so Claude mirrors your team&apos;s style.</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resume-from" className={labelClass}>
                Resume From Step
              </Label>
              <Select value={String(draft.tcEntry ? 3 : draft.resumeFrom)} onValueChange={(v) => update({ resumeFrom: Number(v) })} disabled={Boolean(draft.tcEntry)}>
                <SelectTrigger id="resume-from" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {SESSION_STEPS.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.id}. {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={build} disabled={!hasPr || building} size="lg" className="w-full bg-purple-700 text-purple-50 hover:bg-purple-800 sm:w-fit">
              <FlaskConical /> Build Prompt
            </Button>
          </div>
        </div>
      </section>

      {output !== null && (
        <div ref={outputRef} className="scroll-mt-4">
          <OutputPanel
            value={output}
            onChange={setOutput}
            onReset={async () => {
              const prompt = await promptFromInputs();
              if (prompt === null) return;
              setOutput(prompt);
              toast.success("Prompt regenerated from inputs");
            }}
          />
        </div>
      )}

      <SaveTemplateDialog open={saveOpen} onOpenChange={setSaveOpen} onSave={saveTemplate} />
      <TcLibraryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(entry) => {
          update({ tcEntry: entry });
          toast.success(`Loaded “${entry.name}” from the TC Library`);
        }}
      />
    </div>
  );
}

type UrlFieldProps = {
  id: string;
  label: string;
  hideLabel?: boolean;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
};

function UrlField({ id, label, hideLabel, value, error, onChange, onBlur }: UrlFieldProps) {
  const ref = parsePrUrl(value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={cn(labelClass, hideLabel && "sr-only")}>
        {label}
      </Label>
      <Input
        id={id}
        type="url"
        inputMode="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={PR_PLACEHOLDER}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-700">
          {error}
        </p>
      ) : (
        ref && (
          <p className="font-mono text-xs text-neutral-600" data-testid={`${id}-diff`}>
            {diffCommand(ref)}
          </p>
        )
      )}
    </div>
  );
}

/**
 * Login page URL. Typing stays in local state; only a cleaned URL (no user:password@, no
 * token / password / OTP parameters) is saved to the draft, on blur.
 */
function LoginUrlField({ value, note, onSave }: { value: string; note: string | null; onSave: (url: string, note: string | null) => void }) {
  const [text, setText] = useState(value);
  function commit() {
    const clean = sanitizeLoginUrl(text);
    if (!clean) {
      onSave(value, "Enter an http(s) URL, e.g. https://your-env.example.com/login");
      return;
    }
    setText(clean.url);
    onSave(clean.url, clean.removed ? "Credentials or tokens were removed from the URL — only the login page is kept." : null);
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="login-url" className={labelClass}>
        Login URL <span className="font-normal normal-case tracking-normal">(optional)</span>
      </Label>
      <Input
        id="login-url"
        type="url"
        inputMode="url"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder="https://your-env.example.com/login"
        aria-describedby={note ? "login-url-note" : undefined}
      />
      {note && (
        <p id="login-url-note" role="status" className="text-xs text-amber-800">
          {note}
        </p>
      )}
    </div>
  );
}
