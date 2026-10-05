"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { CopyPlus, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/format";
import type { Mode } from "@/lib/tcgen/types";

export type HistoryItem = {
  id: string;
  name: string;
  mode: Mode;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  counts: { total: number; functional: number; nonFunctional: number; api: number };
};

const MODE_LABEL: Record<Mode, string> = { AI: "AI", IMPORTED: "Imported", CHECKLIST: "Checklist" };

export async function errorText(res: Response, fallback: string) {
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? fallback;
}

export function HistoryDrawer({
  open,
  onOpenChange,
  onOpen,
  currentId,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onOpen: (id: string) => Promise<void>;
  currentId: string | null;
  onDeleted: (id: string) => void;
}) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [confirm, setConfirm] = useState<HistoryItem | null>(null);
  const { withPasscode, passcodeDialog } = useAdminPasscode();
  const { displayName } = useYourName();

  const load = () =>
    fetch("/api/test-case-generator/generations")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { generations: HistoryItem[] }) => setItems(d.generations))
      .catch(() => {
        setItems([]);
        toast.error("Couldn't load saved generations.");
      });

  useEffect(() => {
    if (open) load();
  }, [open]);

  async function duplicate(item: HistoryItem) {
    const res = await fetch(`/api/test-case-generator/generations/${item.id}`);
    if (!res.ok) return toast.error(await errorText(res, "Couldn't open it."));
    const { generation } = await res.json();
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = generation;
    void _id;
    void _c;
    void _u;
    const copy = await fetch("/api/test-case-generator/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rest, name: `${item.name} (copy)`.slice(0, 200), createdBy: displayName }),
    });
    if (!copy.ok) return toast.error(await errorText(copy, "Couldn't duplicate."));
    toast.success("Duplicated");
    load();
  }

  async function remove(item: HistoryItem) {
    const res = await withPasscode((headers) => fetch(`/api/test-case-generator/generations/${item.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toast.error(await errorText(res, "Couldn't delete."));
    toast.success(`Deleted “${item.name}”`);
    onDeleted(item.id);
    load();
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Saved generations</SheetTitle>
            <SheetDescription>Open one to reload its inputs and test cases.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {items === null && <p className="text-sm text-neutral-600">Loading…</p>}
            {items?.length === 0 && <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600">Nothing saved yet. Generate test cases and press Save generation.</p>}
            <ul className="flex flex-col gap-2" aria-label="Saved generations">
              {items?.map((g) => (
                <li key={g.id} className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {g.name}
                        {g.id === currentId && <span className="ml-2 text-xs font-normal text-neutral-600">(open)</span>}
                      </p>
                      <p className="text-xs text-neutral-600">
                        {g.counts.total} cases · {g.counts.functional} functional · {g.counts.nonFunctional} non-functional · {g.counts.api} API
                      </p>
                      <p className="text-xs text-neutral-600">
                        <Badge variant="outline" className="mr-1 px-1 py-0 text-[10px]">
                          {MODE_LABEL[g.mode]}
                        </Badge>
                        {g.createdBy || "Anonymous"} · {formatDateTime(g.updatedAt)}
                      </p>
                    </div>
                    <Button type="button" size="sm" onClick={() => onOpen(g.id)} aria-label={`Open ${g.name}`}>
                      <FolderOpen aria-hidden /> Open
                    </Button>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => duplicate(g)} aria-label={`Duplicate ${g.name}`}>
                      <CopyPlus aria-hidden /> Duplicate
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-700" onClick={() => setConfirm(g)} aria-label={`Delete ${g.name}`}>
                      <Trash2 aria-hidden /> Delete
                    </Button>
                  </div>
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
            <AlertDialogDescription>This removes the saved inputs and test cases for everyone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 text-red-50 hover:bg-red-800"
              onClick={() => {
                const g = confirm;
                setConfirm(null);
                if (g) void remove(g);
              }}
            >
              Delete generation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {passcodeDialog}
    </>
  );
}

/** Single text field + optional second field dialog (Save generation / Save to TC Library). */
export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  submitLabel,
  second,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  initial: string;
  submitLabel: string;
  second?: { label: string; placeholder: string };
  onSubmit: (name: string, second: string) => Promise<string | null>;
}) {
  const id = useId();
  const [name, setName] = useState(initial);
  const [extra, setExtra] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required.");
    setBusy(true);
    const err = await onSubmit(name.trim(), extra.trim());
    setBusy(false);
    if (err) setError(err);
    else onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setName(initial);
          setExtra("");
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>
              Name <span className="text-red-700">*</span>
            </Label>
            <Input id={`${id}-name`} value={name} maxLength={200} onChange={(e) => (setName(e.target.value), setError(null))} aria-invalid={!!error} autoFocus />
          </div>
          {second && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-second`}>{second.label}</Label>
              <Input id={`${id}-second`} value={extra} maxLength={300} onChange={(e) => (setExtra(e.target.value), setError(null))} placeholder={second.placeholder} />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
