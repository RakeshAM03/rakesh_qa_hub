"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, Save, Send, Terminal } from "lucide-react";
import { toast } from "sonner";

import { useAdminPasscode } from "@/components/shared/use-admin-passcode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { copyText, downloadText } from "@/lib/browser";
import { runAssertions } from "@/lib/api-playground/assertions";
import { buildRequest, draftUnknownVariables, EMPTY_DRAFT, METHODS, toCurl, unknownVariables, type Method, type RequestDraft } from "@/lib/api-playground/request";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CollectionsSidebar, METHOD_TONE, type CollectionSummary } from "./collections-sidebar";
import { EnvironmentPicker, type Environment } from "./environments";
import { RequestTabs, syncUrl } from "./request-builder";
import { ResponseViewer, statusTone, type PlaygroundResponse } from "./response-viewer";

const ENV_KEY = "qa-hub:api-playground:env";
const HISTORY_KEY = "qa-hub:api-playground:history";
const MAX_HISTORY = 20;

type HistoryEntry = { id: string; at: string; draft: RequestDraft; status: number | null; timeMs: number | null };
type Current = { id?: string; collectionId?: string };
type SendState = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; response: PlaygroundResponse };
type NamePrompt = { title: string; label: string; initial: string; onSubmit: (name: string) => Promise<void> | void } | null;

function readHistory(raw: string | null): HistoryEntry[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((e) => e && e.draft && typeof e.draft.url === "string") : [];
  } catch {
    return [];
  }
}

/** The editable fields of a saved request. */
const fromSaved = (r: RequestDraft): RequestDraft => ({
  name: r.name,
  method: r.method,
  url: r.url,
  params: r.params ?? [],
  headers: r.headers ?? [],
  auth: r.auth && "type" in r.auth ? r.auth : { type: "none" },
  body: r.body && "type" in r.body ? r.body : { type: "none" },
  assertions: r.assertions ?? [],
});

const snapshot = (d: RequestDraft) => JSON.stringify(d);

export function ApiPlayground() {
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [envRaw, setEnvRaw] = useLocalStorage(ENV_KEY);
  const [historyRaw, setHistoryRaw] = useLocalStorage(HISTORY_KEY);
  const history = useMemo(() => readHistory(historyRaw), [historyRaw]);
  const [draft, setDraft] = useState<RequestDraft>(EMPTY_DRAFT);
  const [current, setCurrent] = useState<Current>({});
  const [saved, setSaved] = useState(snapshot(EMPTY_DRAFT));
  const [send, setSend] = useState<SendState>({ kind: "idle" });
  const [sentAssertions, setSentAssertions] = useState<ReturnType<typeof runAssertions> | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<(() => void) | null>(null);
  const [namePrompt, setNamePrompt] = useState<NamePrompt>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  const dirty = snapshot(draft) !== saved;
  const env = environments.find((e) => e.id === envRaw) ?? null;
  const vars = useMemo(() => Object.fromEntries((env?.variables ?? []).map((v) => [v.key, v.value])), [env]);
  const unknown = draftUnknownVariables(draft, vars);
  const isUnknown = useCallback((t: string) => unknownVariables(t, vars).length > 0, [vars]);
  const patch = (p: Partial<RequestDraft>) => setDraft((d) => ({ ...d, ...p }));

  const loadCollections = useCallback(() => {
    fetch("/api/api-playground/collections")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { collections: CollectionSummary[] }) => setCollections(d.collections))
      .catch(() => toast.error("Couldn't load collections."));
  }, []);
  const loadEnvironments = useCallback(() => {
    fetch("/api/api-playground/environments")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { environments: Environment[] }) => setEnvironments(d.environments))
      .catch(() => toast.error("Couldn't load environments."));
  }, []);
  useEffect(() => {
    loadCollections();
    loadEnvironments();
  }, [loadCollections, loadEnvironments]);

  const doSend = useCallback(async () => {
    if (!draft.url.trim()) return toast.error("Enter a URL first.");
    const built = buildRequest(draft, vars);
    if (unknownVariables(built.url, vars).length) return toast.error("The URL uses variables the environment doesn't define.");
    setSend({ kind: "loading" });
    setSentAssertions(null);
    try {
      const res = await fetch("/api/api-playground/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(built) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `The request failed (${res.status}).`);
      const response = data.response as PlaygroundResponse;
      setSend({ kind: "done", response });
      setSentAssertions(draft.assertions.length ? runAssertions(draft.assertions, response) : null);
      record(response.status, response.timeMs);
    } catch (e) {
      setSend({ kind: "error", message: e instanceof Error ? e.message : "The request failed." });
      record(null, null);
    }
    function record(status: number | null, timeMs: number | null) {
      const entry: HistoryEntry = { id: crypto.randomUUID(), at: new Date().toISOString(), draft, status, timeMs };
      setHistoryRaw((prev) => JSON.stringify([entry, ...readHistory(prev)].slice(0, MAX_HISTORY)));
    }
  }, [draft, vars, setHistoryRaw]);

  // Ctrl/Cmd + Enter sends from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        doSend();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSend]);

  /** Runs `action`, asking first when there are unsaved changes. */
  function guard(action: () => void) {
    if (dirty) setPendingOpen(() => action);
    else action();
  }

  function openRequest(id: string) {
    guard(async () => {
      const res = await fetch(`/api/api-playground/requests/${id}`);
      if (!res.ok) return toast.error("Couldn't open that request.");
      const { request } = await res.json();
      const d = fromSaved(request);
      setDraft(d);
      setSaved(snapshot(d));
      setCurrent({ id: request.id, collectionId: request.collectionId });
      setSend({ kind: "idle" });
      setSentAssertions(null);
    });
  }

  function newRequest() {
    guard(() => {
      setDraft(EMPTY_DRAFT);
      setSaved(snapshot(EMPTY_DRAFT));
      setCurrent({});
      setSend({ kind: "idle" });
    });
  }

  async function saveExisting() {
    if (!current.id) return setSaveOpen(true);
    const res = await fetch(`/api/api-playground/requests/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't save.");
    setSaved(snapshot(draft));
    toast.success("Request saved");
    loadCollections();
  }

  async function createCollection(name: string, requests?: RequestDraft[]) {
    const res = await fetch("/api/api-playground/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, requests }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Couldn't create the collection.");
    loadCollections();
    return data.collection as CollectionSummary;
  }

  async function fullCollection(id: string) {
    const res = await fetch(`/api/api-playground/collections/${id}`);
    if (!res.ok) throw new Error("Couldn't load the collection.");
    const { collection } = await res.json();
    return { name: collection.name as string, requests: (collection.requests as RequestDraft[]).map(fromSaved) };
  }

  async function onCollectionAction(action: "rename" | "duplicate" | "export" | "delete", c: CollectionSummary) {
    try {
      if (action === "rename") {
        setNamePrompt({
          title: "Rename collection",
          label: "Name",
          initial: c.name,
          onSubmit: async (name) => {
            const res = await fetch(`/api/api-playground/collections/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't rename.");
            loadCollections();
          },
        });
      } else if (action === "duplicate") {
        const full = await fullCollection(c.id);
        await createCollection(`${full.name} (copy)`, full.requests);
        toast.success("Collection duplicated");
      } else if (action === "export") {
        const full = await fullCollection(c.id);
        downloadText(`${full.name.replace(/[^\w.-]+/g, "_")}.collection.json`, JSON.stringify(full, null, 2), "application/json");
      } else {
        const res = await withPasscode((headers) => fetch(`/api/api-playground/collections/${c.id}`, { method: "DELETE", headers }));
        if (!res) return;
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
        toast.success("Collection deleted");
        if (current.collectionId === c.id) setCurrent({});
        loadCollections();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  async function onRequestAction(action: "rename" | "duplicate" | "delete", r: { id: string; name: string }, collectionId: string) {
    try {
      if (action === "rename") {
        setNamePrompt({
          title: "Rename request",
          label: "Name",
          initial: r.name,
          onSubmit: async (name) => {
            const res = await fetch(`/api/api-playground/requests/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't rename.");
            if (current.id === r.id) {
              patch({ name });
              setSaved((s) => snapshot({ ...(JSON.parse(s) as RequestDraft), name }));
            }
            loadCollections();
          },
        });
      } else if (action === "duplicate") {
        const res = await fetch(`/api/api-playground/requests/${r.id}`);
        const { request } = await res.json();
        const copy = await fetch("/api/api-playground/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...fromSaved(request), name: `${request.name} (copy)`, collectionId }),
        });
        if (!copy.ok) throw new Error((await copy.json().catch(() => ({}))).error ?? "Couldn't duplicate.");
        toast.success("Request duplicated");
        loadCollections();
      } else {
        const res = await withPasscode((headers) => fetch(`/api/api-playground/requests/${r.id}`, { method: "DELETE", headers }));
        if (!res) return;
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
        toast.success("Request deleted");
        if (current.id === r.id) setCurrent({});
        loadCollections();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  async function importFile(file: File) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("That file is larger than 10 MB.");
      const json = JSON.parse(await file.text());
      if (!json || typeof json.name !== "string" || !Array.isArray(json.requests)) throw new Error("Expected { name, requests: [...] } — an exported collection.");
      await createCollection(json.name, json.requests.map(fromSaved));
      toast.success(`Imported “${json.name}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't import that file.");
    }
  }

  const built = buildRequest(draft, vars);

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
      <CollectionsSidebar
        collections={collections}
        activeId={current.id}
        dirty={dirty}
        onOpen={openRequest}
        onNewCollection={() =>
          setNamePrompt({
            title: "New collection",
            label: "Name",
            initial: "",
            onSubmit: async (name) => {
              await createCollection(name);
              toast.success("Collection created");
            },
          })
        }
        onImport={importFile}
        onCollectionAction={onCollectionAction}
        onRequestAction={onRequestAction}
      />

      <div className="flex min-w-0 flex-col gap-4">
        <section aria-label="Request" className="rounded-xl border border-t-4 border-neutral-200 border-t-indigo-500 bg-card p-4 shadow-xs">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-neutral-900">
              <span className="truncate" data-testid="request-name">
                {draft.name}
              </span>
              {dirty && <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-label="Unsaved changes" title="Unsaved changes" />}
            </h2>
            <Button size="sm" variant="ghost" onClick={newRequest}>
              New request
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" aria-hidden /> History
            </Button>
            <EnvironmentPicker
              environments={environments}
              activeId={env?.id ?? null}
              onSelect={(id) => setEnvRaw(id)}
              onChanged={loadEnvironments}
              withPasscode={withPasscode}
            />
          </div>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              doSend();
            }}
          >
            <Select value={draft.method} onValueChange={(m) => patch({ method: m as Method })}>
              <SelectTrigger className={cn("w-full font-mono font-semibold sm:w-32", METHOD_TONE[draft.method])} aria-label="Method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m} className={cn("font-mono font-semibold", METHOD_TONE[m])}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={draft.url}
              onChange={(e) => patch(syncUrl(draft, e.target.value))}
              placeholder="https://api.example.com/users"
              aria-label="URL"
              aria-invalid={unknownVariables(draft.url, vars).length > 0}
              className={cn("flex-1 font-mono text-sm", unknownVariables(draft.url, vars).length > 0 && "border-red-500")}
              spellCheck={false}
            />
            <Button type="submit" disabled={send.kind === "loading"} className="bg-indigo-600 text-white hover:bg-indigo-700">
              <Send className="size-4" aria-hidden /> Send
            </Button>
            <Button type="button" variant="outline" onClick={saveExisting}>
              <Save className="size-4" aria-hidden /> Save
            </Button>
          </form>
          {unknown.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600" role="status">
              <AlertTriangle className="size-3.5" aria-hidden /> Unknown variable{unknown.length === 1 ? "" : "s"}: {unknown.map((u) => `{{${u}}}`).join(", ")}
              {env ? ` (not in “${env.name}”)` : " — pick an environment"}
            </p>
          )}
          <div className="mt-4">
            <RequestTabs draft={draft} onChange={patch} isUnknown={isUnknown} />
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => copyText(toCurl(built), "cURL command copied")}>
              <Terminal className="size-4" aria-hidden /> Copy as cURL
            </Button>
          </div>
        </section>

        <ResponseViewer key={send.kind === "done" ? send.response.timeMs + send.response.finalUrl : send.kind} state={send} assertions={sentAssertions} />
      </div>

      <SaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        draft={draft}
        collections={collections ?? []}
        createCollection={createCollection}
        onSaved={(id, collectionId, name) => {
          const d = { ...draft, name };
          setDraft(d);
          setSaved(snapshot(d));
          setCurrent({ id, collectionId });
          loadCollections();
        }}
      />
      <NamePromptDialog prompt={namePrompt} onClose={() => setNamePrompt(null)} />
      <AlertDialog open={!!pendingOpen} onOpenChange={(o) => !o && setPendingOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>The current request has changes that aren&apos;t saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = pendingOpen;
                setPendingOpen(null);
                action?.();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>History</SheetTitle>
            <SheetDescription>The last {MAX_HISTORY} requests sent from this browser.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {history.length === 0 ? (
              <p className="text-sm text-neutral-500">Nothing sent yet.</p>
            ) : (
              <ul className="flex flex-col gap-1" aria-label="Request history">
                {history.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left hover:bg-neutral-100"
                      onClick={() =>
                        guard(() => {
                          setDraft(h.draft);
                          setCurrent({});
                          setSaved("");
                          setHistoryOpen(false);
                        })
                      }
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span className={cn("font-mono text-xs font-bold", METHOD_TONE[h.draft.method])}>{h.draft.method}</span>
                        <span className="truncate font-mono text-xs text-neutral-800">{h.draft.url}</span>
                      </span>
                      <span className="flex items-center gap-2 text-xs text-neutral-500">
                        {h.status !== null ? <span className={cn("rounded-full px-1.5 font-semibold", statusTone(h.status))}>{h.status}</span> : <span className="text-red-600">failed</span>}
                        {h.timeMs !== null && `${h.timeMs} ms ·`} {formatDateTime(h.at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {passcodeDialog}
    </div>
  );
}

function SaveDialog({
  open,
  onOpenChange,
  draft,
  collections,
  createCollection,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draft: RequestDraft;
  collections: CollectionSummary[];
  createCollection: (name: string) => Promise<CollectionSummary>;
  onSaved: (id: string, collectionId: string, name: string) => void;
}) {
  const [name, setName] = useState(draft.name);
  const [collectionId, setCollectionId] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(draft.name === EMPTY_DRAFT.name ? "" : draft.name);
      setCollectionId(collections[0]?.id ?? "");
      setNewCollection("");
    }
  }
  async function save() {
    if (!name.trim()) return toast.error("Give the request a name.");
    setBusy(true);
    try {
      let target = collectionId;
      if (!target) {
        if (!newCollection.trim()) throw new Error("Pick a collection or name a new one.");
        target = (await createCollection(newCollection.trim())).id;
      }
      const res = await fetch("/api/api-playground/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, name: name.trim(), collectionId: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the request.");
      toast.success("Request saved");
      onOpenChange(false);
      onSaved(data.request.id, target, name.trim());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the request.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save request</DialogTitle>
          <DialogDescription className="flex items-start gap-1.5 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Saved requests are visible to anyone using this hub — don&apos;t save real secrets.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-save-name">Request name</Label>
            <Input id="ap-save-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="List users" maxLength={200} autoFocus />
          </div>
          {collections.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-save-collection">Collection</Label>
              <Select value={collectionId || "__new__"} onValueChange={(v) => setCollectionId(v === "__new__" ? "" : v)}>
                <SelectTrigger id="ap-save-collection" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ New collection…</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {!collectionId && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-save-new-collection">New collection name</Label>
              <Input id="ap-save-new-collection" value={newCollection} onChange={(e) => setNewCollection(e.target.value)} placeholder="Users API" maxLength={200} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NamePromptDialog({ prompt, onClose }: { prompt: NamePrompt; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [shown, setShown] = useState<NamePrompt>(null);
  const [busy, setBusy] = useState(false);
  if (prompt !== shown) {
    setShown(prompt);
    setValue(prompt?.initial ?? "");
  }
  async function submit() {
    if (!prompt || !value.trim()) return;
    setBusy(true);
    try {
      await prompt.onSubmit(value.trim());
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!prompt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{prompt?.title}</DialogTitle>
            <DialogDescription className="sr-only">{prompt?.title}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-name-prompt">{prompt?.label}</Label>
            <Input id="ap-name-prompt" value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !value.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
