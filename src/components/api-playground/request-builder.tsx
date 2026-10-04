"use client";

import { Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NO_EXPECTED, OPERATORS, TYPE_OPERATORS } from "@/lib/api-playground/assertions";
import { formatJson, newId, paramsFromUrl, urlWithParams, type Assertion, type Auth, type Body, type RequestDraft } from "@/lib/api-playground/request";
import { KvTable } from "./kv-table";

const HEADER_SUGGESTIONS = ["Content-Type", "Authorization", "Accept", "Accept-Language", "Cache-Control", "User-Agent", "X-Request-Id", "X-API-Key"];
const ASSERTION_TYPES: { value: Assertion["type"]; label: string }[] = [
  { value: "status", label: "Status code" },
  { value: "time", label: "Response time" },
  { value: "header", label: "Header" },
  { value: "jsonpath", label: "JSON path" },
  { value: "body", label: "Body text" },
];

type Props = {
  draft: RequestDraft;
  onChange: (patch: Partial<RequestDraft>) => void;
  isUnknown: (text: string) => boolean;
};

export function RequestTabs({ draft, onChange, isUnknown }: Props) {
  const count = (n: number) => (n ? ` (${n})` : "");
  return (
    <Tabs defaultValue="params">
      <TabsList className="flex-wrap">
        <TabsTrigger value="params">Params{count(draft.params.filter((p) => p.enabled && p.key).length)}</TabsTrigger>
        <TabsTrigger value="headers">Headers{count(draft.headers.filter((p) => p.enabled && p.key).length)}</TabsTrigger>
        <TabsTrigger value="auth">Auth</TabsTrigger>
        <TabsTrigger value="body">Body</TabsTrigger>
        <TabsTrigger value="assertions">Assertions{count(draft.assertions.length)}</TabsTrigger>
      </TabsList>
      <TabsContent value="params" className="pt-3">
        <KvTable
          label="Param"
          rows={draft.params}
          isUnknown={isUnknown}
          onChange={(params) => onChange({ params, url: urlWithParams(draft.url, params) })}
        />
      </TabsContent>
      <TabsContent value="headers" className="pt-3">
        <KvTable label="Header" rows={draft.headers} onChange={(headers) => onChange({ headers })} suggestions={HEADER_SUGGESTIONS} isUnknown={isUnknown} />
      </TabsContent>
      <TabsContent value="auth" className="pt-3">
        <AuthTab auth={draft.auth} onChange={(auth) => onChange({ auth })} />
      </TabsContent>
      <TabsContent value="body" className="pt-3">
        <BodyTab body={draft.body} method={draft.method} onChange={(body) => onChange({ body })} isUnknown={isUnknown} />
      </TabsContent>
      <TabsContent value="assertions" className="pt-3">
        <AssertionsTab assertions={draft.assertions} onChange={(assertions) => onChange({ assertions })} />
      </TabsContent>
    </Tabs>
  );
}

/** URL input that keeps the Params tab in sync. */
export function syncUrl(draft: RequestDraft, url: string): Partial<RequestDraft> {
  return { url, params: paramsFromUrl(url, draft.params) };
}

function AuthTab({ auth, onChange }: { auth: Auth; onChange: (a: Auth) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="ap-auth-type">Type</Label>
        <Select
          value={auth.type}
          onValueChange={(t) =>
            onChange(
              t === "bearer"
                ? { type: "bearer", token: "" }
                : t === "basic"
                  ? { type: "basic", username: "", password: "" }
                  : t === "apikey"
                    ? { type: "apikey", key: "X-API-Key", value: "", in: "header" }
                    : { type: "none" },
            )
          }
        >
          <SelectTrigger id="ap-auth-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="bearer">Bearer token</SelectItem>
            <SelectItem value="basic">Basic auth</SelectItem>
            <SelectItem value="apikey">API key</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {auth.type === "bearer" && <Field id="ap-token" label="Token" value={auth.token} onChange={(token) => onChange({ ...auth, token })} placeholder="{{token}}" />}
      {auth.type === "basic" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ap-user" label="Username" value={auth.username} onChange={(username) => onChange({ ...auth, username })} />
          <Field id="ap-pass" label="Password" type="password" value={auth.password} onChange={(password) => onChange({ ...auth, password })} />
        </div>
      )}
      {auth.type === "apikey" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="ap-key" label="Key" value={auth.key} onChange={(key) => onChange({ ...auth, key })} />
          <Field id="ap-key-value" label="Value" value={auth.value} onChange={(value) => onChange({ ...auth, value })} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-key-in">Add to</Label>
            <Select value={auth.in} onValueChange={(v) => onChange({ ...auth, in: v as "header" | "query" })}>
              <SelectTrigger id="ap-key-in" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query params</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <p className="text-xs text-neutral-500">Use {"{{variables}}"} from the environment so secrets aren&apos;t saved with the request.</p>
    </div>
  );
}

function Field({ id, label, value, onChange, placeholder, type = "text" }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="font-mono text-xs" autoComplete="off" />
    </div>
  );
}

function BodyTab({ body, method, onChange, isUnknown }: { body: Body; method: string; onChange: (b: Body) => void; isUnknown: (t: string) => boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Body type">
        {(["none", "json", "form", "raw"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={body.type === t}
            onClick={() =>
              onChange(t === "json" ? { type: "json", text: "{\n  \n}" } : t === "form" ? { type: "form", fields: [] } : t === "raw" ? { type: "raw", text: "", contentType: "text/plain" } : { type: "none" })
            }
            className={
              body.type === t
                ? "rounded-full border border-indigo-500 bg-indigo-500 px-3 py-1 text-xs font-medium text-white"
                : "rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:border-indigo-300"
            }
          >
            {t === "none" ? "None" : t === "json" ? "JSON" : t === "form" ? "Form URL-encoded" : "Raw text"}
          </button>
        ))}
      </div>
      {["GET", "HEAD"].includes(method) && body.type !== "none" && <p className="text-xs text-amber-700">{method} requests are sent without a body.</p>}
      {body.type === "json" && (
        <>
          <CodeEditor value={body.text} onChange={(text) => onChange({ type: "json", text })} language="json" ariaLabel="JSON body" minHeight="10rem" maxHeight="20rem" />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const r = formatJson(body.text);
                if (r.ok) onChange({ type: "json", text: r.text });
                else toast.error(`Invalid JSON: ${r.error}`);
              }}
            >
              <Wand2 className="size-4" aria-hidden /> Format
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const r = formatJson(body.text);
                if (r.ok) toast.success("Valid JSON");
                else if (/\{\{/.test(body.text)) toast.message("Contains {{variables}} — they're replaced before sending.");
                else toast.error(`Invalid JSON: ${r.error}`);
              }}
            >
              Validate
            </Button>
          </div>
        </>
      )}
      {body.type === "form" && <KvTable label="Field" rows={body.fields} onChange={(fields) => onChange({ type: "form", fields })} isUnknown={isUnknown} />}
      {body.type === "raw" && (
        <>
          <Field id="ap-raw-type" label="Content-Type" value={body.contentType} onChange={(contentType) => onChange({ ...body, contentType })} />
          <CodeEditor value={body.text} onChange={(text) => onChange({ ...body, text })} language="text" ariaLabel="Raw body" minHeight="10rem" maxHeight="20rem" />
        </>
      )}
    </div>
  );
}

function AssertionsTab({ assertions, onChange }: { assertions: Assertion[]; onChange: (a: Assertion[]) => void }) {
  const update = (id: string, patch: Partial<Assertion>) => onChange(assertions.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  return (
    <div className="flex flex-col gap-2">
      {assertions.length === 0 && <p className="text-sm text-neutral-500">No assertions yet — add checks that run when the response arrives.</p>}
      {assertions.map((a, i) => {
        const ops = TYPE_OPERATORS[a.type];
        const needsTarget = a.type === "header" || a.type === "jsonpath";
        return (
          <div key={a.id} className="flex flex-wrap items-center gap-2" data-testid="assertion-row">
            <Select
              value={a.type}
              onValueChange={(type) => {
                const t = type as Assertion["type"];
                update(a.id, { type: t, operator: TYPE_OPERATORS[t][0], target: t === "jsonpath" ? "$." : "", expected: t === "status" ? "200" : t === "time" ? "1000" : "" });
              }}
            >
              <SelectTrigger size="sm" className="w-36" aria-label={`Assertion ${i + 1} type`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {ASSERTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsTarget && (
              <Input
                value={a.target}
                onChange={(e) => update(a.id, { target: e.target.value })}
                placeholder={a.type === "header" ? "Content-Type" : "$.data[0].id"}
                aria-label={`Assertion ${i + 1} target`}
                className="h-8 w-44 font-mono text-xs"
              />
            )}
            <Select value={a.operator} onValueChange={(op) => update(a.id, { operator: op as Assertion["operator"] })}>
              <SelectTrigger size="sm" className="w-36" aria-label={`Assertion ${i + 1} operator`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {ops.map((o) => (
                  <SelectItem key={o} value={o}>
                    {OPERATORS[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!NO_EXPECTED.includes(a.operator) && (
              <Input
                value={a.expected}
                onChange={(e) => update(a.id, { expected: e.target.value })}
                placeholder={a.operator === "isType" ? "string | number | array | object | boolean" : "Expected"}
                aria-label={`Assertion ${i + 1} expected`}
                className="h-8 min-w-32 flex-1 font-mono text-xs"
              />
            )}
            <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={`Remove assertion ${i + 1}`} onClick={() => onChange(assertions.filter((x) => x.id !== a.id))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => onChange([...assertions, { id: newId(), type: "status", target: "", operator: "equals", expected: "200" }])}
      >
        <Plus className="size-4" aria-hidden /> Add assertion
      </Button>
    </div>
  );
}
