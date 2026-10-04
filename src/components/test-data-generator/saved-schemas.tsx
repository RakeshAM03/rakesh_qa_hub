"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Code2, FileDown, FileUp, FolderOpen, Pencil, Save, Star, Trash2, CopyPlus } from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/shared/copy-button";
import { useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { useYourName } from "@/components/shared/your-name";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadText } from "@/lib/browser";
import { formatDateTime } from "@/lib/format";
import { fileName } from "@/lib/testdata/export";
import { schemaFile, SCHEMA_FILE_VERSION, withDefaultOptions } from "@/lib/testdata/schema";
import { cloneField, countFields, uniqueName } from "@/lib/testdata/schema-ops";
import { javaTestNgSnippet, playwrightSnippet } from "@/lib/testdata/snippets";
import type { Field, GenOptions } from "@/lib/testdata/types";

export type SavedSchema = {
  id: string;
  name: string;
  fields: Field[];
  options: GenOptions;
  isPreset: boolean;
  createdBy: string | null;
  updatedAt: string;
};

export type Current = { id: string; name: string } | null;

type Props = {
  schemas: SavedSchema[] | null;
  reload: () => Promise<void>;
  fields: Field[];
  options: GenOptions;
  current: Current;
  /** Base for download / snippet file names. */
  name: string;
  onLoad: (s: { fields: Field[]; options: GenOptions; current: Current }) => void;
  onSaved: (current: Current) => void;
};

async function errorText(res: Response, fallback: string) {
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? fallback;
}

export function SchemaToolbar({ schemas, reload, fields, options, current, name, onLoad, onSaved }: Props) {
  const [listOpen, setListOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function exportJson() {
    const body = { version: SCHEMA_FILE_VERSION, name, fields, options };
    downloadText(`${fileName(name, 0, "json").replace(/-0-rows\.json$/, "")}.schema.json`, JSON.stringify(body, null, 2), "application/json");
  }

  async function importJson(file: File) {
    if (file.size > 2 * 1024 * 1024) return toast.error("That file is over 2 MB.");
    try {
      const parsed = schemaFile.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) return toast.error("That isn't a Test Data Generator schema file.");
      onLoad({ fields: parsed.data.fields.map(cloneField), options: withDefaultOptions(parsed.data.options), current: null });
      toast.success(`Imported ${parsed.data.name || "schema"} — save it to keep it in My schemas.`);
    } catch {
      toast.error("Couldn't read that file as JSON.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setListOpen(true)}>
        <FolderOpen aria-hidden /> My schemas{schemas ? ` (${schemas.length})` : ""}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setSaveOpen(true)} disabled={!fields.length}>
        <Save aria-hidden /> Save schema
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
        <FileUp aria-hidden /> Import JSON
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Import schema JSON file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importJson(f);
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={exportJson} disabled={!fields.length}>
        <FileDown aria-hidden /> Export JSON
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setSnippetOpen(true)} disabled={!fields.length}>
        <Code2 aria-hidden /> Use in automation
      </Button>
      {current && (
        <span className="text-sm text-neutral-700">
          Editing <span className="font-medium">{current.name}</span>
        </span>
      )}

      <SaveDialog open={saveOpen} onOpenChange={setSaveOpen} fields={fields} options={options} current={current} schemas={schemas} reload={reload} onSaved={onSaved} />
      <MySchemas open={listOpen} onOpenChange={setListOpen} schemas={schemas} reload={reload} current={current} onLoad={onLoad} onSaved={onSaved} />
      <SnippetDialog open={snippetOpen} onOpenChange={setSnippetOpen} name={name} rows={options.rows} columns={fields.map((f) => f.name)} />
    </div>
  );
}

function SaveDialog({
  open,
  onOpenChange,
  fields,
  options,
  current,
  schemas,
  reload,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fields: Field[];
  options: GenOptions;
  current: Current;
  schemas: SavedSchema[] | null;
  reload: () => Promise<void>;
  onSaved: (c: Current) => void;
}) {
  const id = useId();
  const { displayName } = useYourName();
  const [name, setName] = useState("");
  const [isPreset, setIsPreset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const existing = current ? schemas?.find((s) => s.id === current.id) : undefined;
  const updating = Boolean(existing && name.trim() === existing.name);

  function reset(o: boolean) {
    if (o) {
      setName(current?.name ?? "");
      setIsPreset(existing?.isPreset ?? false);
      setError(null);
    }
    onOpenChange(o);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the schema a name.");
    setBusy(true);
    try {
      const res = updating
        ? await fetch(`/api/test-data-generator/schemas/${existing!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fields, options, isPreset }),
          })
        : await fetch("/api/test-data-generator/schemas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim(), fields, options, isPreset, createdBy: displayName }),
          });
      if (!res.ok) return setError(await errorText(res, "Couldn't save the schema."));
      const { schema } = (await res.json()) as { schema: SavedSchema };
      toast.success(updating ? "Schema updated" : "Schema saved");
      onSaved({ id: schema.id, name: schema.name });
      await reload();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Save schema</DialogTitle>
            <DialogDescription>Saves the fields and options, not the generated data. Saved as {displayName}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>
              Name <span className="text-red-700">*</span>
            </Label>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={100}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-err` : undefined}
              autoFocus
            />
            {existing && !updating && name.trim() && <p className="text-xs text-neutral-600">A new name saves a new copy; keep “{existing.name}” to update it.</p>}
            {error && (
              <p id={`${id}-err`} className="text-xs text-red-700" role="alert">
                {error}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isPreset} onCheckedChange={(c) => setIsPreset(c === true)} />
            Save as preset (shows in the preset chips)
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {updating ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MySchemas({
  open,
  onOpenChange,
  schemas,
  reload,
  current,
  onLoad,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schemas: SavedSchema[] | null;
  reload: () => Promise<void>;
  current: Current;
  onLoad: Props["onLoad"];
  onSaved: (c: Current) => void;
}) {
  const { displayName } = useYourName();
  const { withPasscode, passcodeDialog } = useAdminPasscode();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<SavedSchema | null>(null);

  async function duplicate(s: SavedSchema) {
    const name = uniqueName(`${s.name} copy`, (schemas ?? []).map((x) => x.name));
    const res = await fetch("/api/test-data-generator/schemas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, fields: s.fields, options: withDefaultOptions(s.options), isPreset: false, createdBy: displayName }),
    });
    if (!res.ok) return toast.error(await errorText(res, "Couldn't duplicate."));
    toast.success(`Saved “${name}”`);
    await reload();
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (!renaming?.name.trim()) return;
    const res = await fetch(`/api/test-data-generator/schemas/${renaming.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renaming.name.trim() }),
    });
    if (!res.ok) return toast.error(await errorText(res, "Couldn't rename."));
    if (current?.id === renaming.id) onSaved({ id: renaming.id, name: renaming.name.trim() });
    setRenaming(null);
    toast.success("Renamed");
    await reload();
  }

  async function remove(s: SavedSchema) {
    const res = await withPasscode((headers) => fetch(`/api/test-data-generator/schemas/${s.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toast.error(await errorText(res, "Couldn't delete."));
    if (current?.id === s.id) onSaved(null);
    toast.success(`Deleted “${s.name}”`);
    await reload();
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>My schemas</SheetTitle>
            <SheetDescription>Saved field lists and options. Presets also show as chips above the builder.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {schemas === null && <p className="text-sm text-neutral-600">Loading…</p>}
            {schemas?.length === 0 && <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600">No saved schemas yet. Build one and press Save schema.</p>}
            <ul className="flex flex-col gap-2" aria-label="Saved schemas">
              {schemas?.map((s) => (
                <li key={s.id} className="rounded-lg border border-neutral-200 p-3">
                  {renaming?.id === s.id ? (
                    <form onSubmit={rename} className="flex gap-2">
                      <Input aria-label="New name" value={renaming.name} maxLength={100} onChange={(e) => setRenaming({ id: s.id, name: e.target.value })} autoFocus className="h-8" />
                      <Button type="submit" size="sm">
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setRenaming(null)}>
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {s.name}
                            {s.isPreset && (
                              <Badge variant="outline" className="ml-2 border-teal-200 text-teal-800">
                                <Star className="size-3" aria-hidden /> Preset
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-neutral-600">
                            {countFields(s.fields)} fields · {s.createdBy || "Anonymous"} · {formatDateTime(s.updatedAt)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            onLoad({ fields: s.fields.map(cloneField), options: withDefaultOptions(s.options), current: { id: s.id, name: s.name } });
                            onOpenChange(false);
                            toast.success(`Loaded “${s.name}”`);
                          }}
                        >
                          Load
                        </Button>
                      </div>
                      <div className="mt-2 flex gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => duplicate(s)} aria-label={`Duplicate ${s.name}`}>
                          <CopyPlus aria-hidden /> Duplicate
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming({ id: s.id, name: s.name })} aria-label={`Rename ${s.name}`}>
                          <Pencil aria-hidden /> Rename
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-700" onClick={() => setConfirm(s)} aria-label={`Delete ${s.name}`}>
                          <Trash2 aria-hidden /> Delete
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This removes the saved schema for everyone. Generated files you downloaded aren&apos;t affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 text-red-50 hover:bg-red-800"
              onClick={() => {
                const s = confirm;
                setConfirm(null);
                if (s) void remove(s);
              }}
            >
              Delete schema
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {passcodeDialog}
    </>
  );
}

function SnippetDialog({ open, onOpenChange, name, rows, columns }: { open: boolean; onOpenChange: (o: boolean) => void; name: string; rows: number; columns: string[] }) {
  const java = javaTestNgSnippet(fileName(name, rows, "csv"), columns);
  const pw = playwrightSnippet(fileName(name, rows, "json"), columns);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Use in automation</DialogTitle>
          <DialogDescription>Starter code for loading the downloaded file in your tests. Adjust paths to your project.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="java">
          <TabsList>
            <TabsTrigger value="java">Java · TestNG (CSV)</TabsTrigger>
            <TabsTrigger value="pw">Playwright · TypeScript (JSON)</TabsTrigger>
          </TabsList>
          {[
            ["java", java],
            ["pw", pw],
          ].map(([key, code]) => (
            <TabsContent key={key} value={key} className="flex flex-col gap-2">
              <CopyButton text={code} label="Copy code" className="self-end" />
              <pre className="max-h-96 overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs">{code}</pre>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
