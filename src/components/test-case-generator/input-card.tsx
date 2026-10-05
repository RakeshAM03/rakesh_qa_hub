"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, ClipboardCopy, ListChecks, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { effectivePrefix } from "@/lib/tcgen/prompt";
import { MAX_INPUT_BYTES } from "@/lib/tcgen/schema";
import { CATEGORIES, DEPTHS, TEST_TYPES, TYPE_PRESETS, type ApiForm, type Context, type TcInput, type TcOptions } from "@/lib/tcgen/types";
import { cn } from "@/lib/utils";

const MAX_UPLOAD = 1024 * 1024;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

type Props = {
  input: TcInput;
  onChange: (input: TcInput) => void;
  tab: "requirement" | "api" | "upload";
  onTab: (tab: "requirement" | "api" | "upload") => void;
  aiEnabled: boolean | null;
  aiBusy: boolean;
  onAi: () => void;
  onCancelAi: () => void;
  onCopyPrompt: () => void;
  onChecklist: () => void;
};

export const inputBytes = (i: TcInput) => new TextEncoder().encode(i.requirement + i.apiSpec + i.apiForm.requestBody + i.apiForm.responseSample + i.apiForm.notes + i.context.rules + i.context.outOfScope).length;

export function InputCard({ input, onChange, tab, onTab, aiEnabled, aiBusy, onAi, onCancelAi, onCopyPrompt, onChecklist }: Props) {
  const id = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const setCtx = (patch: Partial<Context>) => onChange({ ...input, context: { ...input.context, ...patch } });
  const setOpt = (patch: Partial<TcOptions>) => onChange({ ...input, options: { ...input.options, ...patch } });
  const setForm = (patch: Partial<ApiForm>) => onChange({ ...input, apiForm: { ...input.apiForm, ...patch } });
  const bytes = inputBytes(input);
  const tooBig = bytes > MAX_INPUT_BYTES;
  const hasInput = Boolean(input.requirement.trim() || input.apiSpec.trim() || input.apiForm.endpoint.trim());
  const apiUsed = Boolean(input.apiSpec.trim() || input.apiForm.endpoint.trim()) || input.context.appType === "API";

  function toggleType(t: string) {
    onChange({ ...input, types: input.types.includes(t) ? input.types.filter((x) => x !== t) : [...input.types, t] });
  }

  async function upload(file: File) {
    if (file.size > MAX_UPLOAD) return toast.error("That file is over 1 MB.");
    if (!/\.(txt|md|json|ya?ml)$/i.test(file.name)) return toast.error("Upload a .txt, .md, .json or .yaml file.");
    const text = await file.text();
    const isApi = /\.(json|ya?ml)$/i.test(file.name) && /["']?(openapi|swagger)["']?\s*:/.test(text);
    if (isApi) {
      onChange({ ...input, apiSpec: text, types: [...new Set([...input.types, "status-codes", "request-validation"])] });
      onTab("api");
      toast.success(`Loaded ${file.name} into API definition`);
    } else {
      onChange({ ...input, requirement: text });
      onTab("requirement");
      toast.success(`Loaded ${file.name} into User story / requirement`);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-card p-4">
      <h2 id={`${id}-title`} className="text-base font-semibold">
        1. Input &amp; options
      </h2>

      <Tabs value={tab} onValueChange={(v) => onTab(v as Props["tab"])}>
        <TabsList>
          <TabsTrigger value="requirement">User story / requirement</TabsTrigger>
          <TabsTrigger value="api">API definition</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>
        <TabsContent value="requirement" className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-req`}>Requirement</Label>
          <Textarea
            id={`${id}-req`}
            value={input.requirement}
            onChange={(e) => onChange({ ...input, requirement: e.target.value })}
            rows={9}
            placeholder={"As a shopper, I want to pay by card so that I can complete my order.\n\nAC1: Valid cards are charged and an order confirmation is shown\nAC2: Declined cards show a clear error\nAC3: The email receipt is sent within 1 minute"}
            className="font-mono text-sm"
          />
          <p className="text-xs text-neutral-600">User story, acceptance criteria, feature description or business rules. Numbered, bulleted and “AC1:” lines feed the coverage view.</p>
        </TabsContent>
        <TabsContent value="api" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-spec`}>OpenAPI / Swagger (JSON or YAML) or a cURL command</Label>
            <Textarea id={`${id}-spec`} value={input.apiSpec} onChange={(e) => onChange({ ...input, apiSpec: e.target.value })} rows={8} placeholder={"openapi: 3.0.3\npaths:\n  /orders:\n    post: …\n\n— or —\n\ncurl -X POST https://api.example.com/orders -H 'Content-Type: application/json' -d '{\"quantity\":2}'"} className="font-mono text-xs" />
          </div>
          <fieldset className="rounded-lg border border-neutral-200 p-3">
            <legend className="px-1 text-sm font-medium">…or describe one endpoint</legend>
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr_10rem]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-method`}>Method</Label>
                <Select value={input.apiForm.method} onValueChange={(method) => setForm({ method })}>
                  <SelectTrigger id={`${id}-method`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-endpoint`}>Endpoint</Label>
                <Input id={`${id}-endpoint`} value={input.apiForm.endpoint} onChange={(e) => setForm({ endpoint: e.target.value })} placeholder="/v1/orders" className="font-mono text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-auth`}>Auth</Label>
                <Select value={input.apiForm.auth} onValueChange={(auth) => setForm({ auth: auth as ApiForm["auth"] })}>
                  <SelectTrigger id={`${id}-auth`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bearer">Bearer token</SelectItem>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="apikey">API key</SelectItem>
                    <SelectItem value="oauth2">OAuth 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-body`}>Request body sample</Label>
                <Textarea id={`${id}-body`} value={input.apiForm.requestBody} onChange={(e) => setForm({ requestBody: e.target.value })} rows={4} placeholder='{ "quantity": 2 }' className="font-mono text-xs" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-resp`}>Response sample</Label>
                <Textarea id={`${id}-resp`} value={input.apiForm.responseSample} onChange={(e) => setForm({ responseSample: e.target.value })} rows={4} placeholder='{ "id": "…", "status": "PENDING" }' className="font-mono text-xs" />
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <Label htmlFor={`${id}-notes`}>Notes</Label>
              <Input id={`${id}-notes`} value={input.apiForm.notes} onChange={(e) => setForm({ notes: e.target.value })} placeholder="e.g. quantity 1–10, idempotency key header" />
            </div>
          </fieldset>
        </TabsContent>
        <TabsContent value="upload">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 px-4 py-8 text-sm hover:border-blue-400 hover:bg-blue-50/50"
          >
            <Upload className="size-7 text-neutral-600" aria-hidden />
            <span className="font-medium">Choose a .txt, .md, .json or .yaml file (max 1 MB)</span>
            <span className="text-xs text-neutral-600">OpenAPI / Swagger files go to API definition; anything else to User story.</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.json,.yaml,.yml"
            className="hidden"
            aria-label="Upload requirement or API file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </TabsContent>
      </Tabs>

      <div>
        <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} className="flex items-center gap-1 text-sm font-medium text-blue-800 hover:underline">
          <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} aria-hidden /> More context
        </button>
        {moreOpen && (
          <div className="mt-2 grid gap-3 rounded-lg border border-neutral-200 p-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-module`}>Module / feature name</Label>
              <Input id={`${id}-module`} value={input.context.moduleName} onChange={(e) => setCtx({ moduleName: e.target.value })} placeholder="Checkout payment" maxLength={200} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-app`}>Application type</Label>
              <Select value={input.context.appType} onValueChange={(appType) => setCtx({ appType: appType as Context["appType"] })}>
                <SelectTrigger id={`${id}-app`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {["Web", "Mobile", "API", "Desktop"].map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-platforms`}>Platforms / browsers</Label>
              <Input id={`${id}-platforms`} value={input.context.platforms} onChange={(e) => setCtx({ platforms: e.target.value })} placeholder="Chrome, Safari, Android 14" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-roles`}>User roles</Label>
              <Input id={`${id}-roles`} value={input.context.roles} onChange={(e) => setCtx({ roles: e.target.value })} placeholder="Admin, Recruiter, Guest" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-rules`}>Business rules / constraints</Label>
              <Textarea id={`${id}-rules`} value={input.context.rules} onChange={(e) => setCtx({ rules: e.target.value })} rows={3} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-oos`}>Out of scope</Label>
              <Textarea id={`${id}-oos`} value={input.context.outOfScope} onChange={(e) => setCtx({ outOfScope: e.target.value })} rows={3} />
            </div>
          </div>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Test types to generate</legend>
        <div className="mb-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...input, types: TEST_TYPES.map((t) => t.id) })}>
            Select all
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...input, types: [] })}>
            Clear
          </Button>
          <span className="mx-1 self-center text-xs text-neutral-600">Presets:</span>
          {TYPE_PRESETS.map((p) => (
            <Button key={p.id} type="button" size="sm" variant="outline" className="rounded-full" onClick={() => onChange({ ...input, types: p.types })}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <div key={cat} role="group" aria-label={`${cat} test types`} className="rounded-lg border border-neutral-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-700">
                {cat}
                {cat === "API" && !apiUsed && <span className="ml-1 font-normal normal-case tracking-normal text-neutral-600">(for API definitions or app type API)</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEST_TYPES.filter((t) => t.category === cat).map((t) => {
                  const on = input.types.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleType(t.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        on ? "border-blue-700 bg-blue-700 text-blue-50" : "border-neutral-300 text-neutral-800 hover:bg-neutral-100",
                        cat === "API" && !apiUsed && !on && "opacity-80",
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-depth`}>Depth</Label>
          <Select value={input.options.depth} onValueChange={(depth) => setOpt({ depth: depth as TcOptions["depth"] })}>
            <SelectTrigger id={`${id}-depth`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {DEPTHS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label} ({d.target.replace("about ", "~")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-format`}>Output format</Label>
          <Select value={input.options.format} onValueChange={(format) => setOpt({ format: format as TcOptions["format"] })}>
            <SelectTrigger id={`${id}-format`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="steps">Detailed steps</SelectItem>
              <SelectItem value="gherkin">Gherkin (Given-When-Then)</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-prio`}>Priority scheme</Label>
          <Select value={input.options.priorityScheme} onValueChange={(v) => setOpt({ priorityScheme: v as TcOptions["priorityScheme"] })}>
            <SelectTrigger id={`${id}-prio`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="p">P0–P3</SelectItem>
              <SelectItem value="hml">High / Medium / Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-prefix`}>ID prefix</Label>
          <Input id={`${id}-prefix`} value={input.options.idPrefix} onChange={(e) => setOpt({ idPrefix: e.target.value.toUpperCase() })} placeholder={effectivePrefix(input)} maxLength={20} />
          <p className="text-xs text-neutral-600">IDs look like TC-{effectivePrefix(input)}-001</p>
        </div>
        <label className="flex items-center gap-2 self-center text-sm">
          <Checkbox checked={input.options.includeTestData} onCheckedChange={(c) => setOpt({ includeTestData: c === true })} />
          Include test data examples
        </label>
      </div>

      {tooBig && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          The input is {(bytes / 1024).toFixed(1)} KB — the limit is 30 KB. Shorten it before generating.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {aiEnabled &&
          (aiBusy ? (
            <>
              <Button type="button" disabled className="bg-blue-700 text-blue-50">
                <Loader2 className="animate-spin" aria-hidden /> Generating…
              </Button>
              <Button type="button" variant="outline" onClick={onCancelAi}>
                <X aria-hidden /> Cancel
              </Button>
            </>
          ) : (
            <Button type="button" onClick={onAi} disabled={!hasInput || !input.types.length || tooBig} className="bg-blue-700 text-blue-50 hover:bg-blue-800">
              <Sparkles aria-hidden /> Generate with AI
            </Button>
          ))}
        <Button type="button" variant="outline" onClick={onCopyPrompt} disabled={!hasInput || !input.types.length || tooBig}>
          <ClipboardCopy aria-hidden /> Copy prompt for Claude
        </Button>
        <Button type="button" variant="outline" onClick={onChecklist} disabled={!input.types.length || aiBusy}>
          <ListChecks aria-hidden /> Generate checklist (no AI)
        </Button>
        {!input.types.length && <span className="text-sm text-neutral-700">Pick at least one test type.</span>}
      </div>
    </section>
  );
}
