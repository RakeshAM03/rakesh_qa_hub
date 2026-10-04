"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { toastResponseError, useAdminPasscode } from "@/components/shared/use-admin-passcode";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Resource } from "./status";

type ManageResourcesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after any change so the page can reload its resources. */
  onChanged: () => void;
};

async function patchResource(id: string, body: object) {
  const res = await fetch(`/api/qa-tracker/resources/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) {
    toast.error("Couldn't reach the server.");
    return false;
  }
  if (!res.ok) {
    await toastResponseError(res, "Couldn't update the resource.");
    return false;
  }
  return true;
}

export function ManageResourcesDialog({ open, onOpenChange, onChanged }: ManageResourcesDialogProps) {
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Resource | null>(null);
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/qa-tracker/resources?all=1")
      .then((res) => res.json())
      .then((data) => !cancelled && setResources(data.resources))
      .catch(() => !cancelled && toast.error("Couldn't load resources."));
    return () => {
      cancelled = true;
    };
  }, [open, reloadKey]);

  const changed = () => {
    setReloadKey((k) => k + 1);
    onChanged();
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setAddError("Name is required");
    const res = await fetch("/api/qa-tracker/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    }).catch(() => null);
    if (!res) return setAddError("Couldn't reach the server.");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setAddError(data.error ?? "Couldn't add the resource.");
    toast.success(`Added ${data.resource.name}`);
    setName("");
    setEmail("");
    setAddError(null);
    changed();
  }

  async function rename(r: Resource, next: string) {
    if (!next.trim() || next.trim() === r.name) return;
    if (await patchResource(r.id, { name: next })) {
      toast.success("Renamed");
      changed();
    }
  }

  async function confirmDelete() {
    const r = toDelete;
    setToDelete(null);
    if (!r) return;
    const res = await withPasscode((headers) => fetch(`/api/qa-tracker/resources/${r.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't delete the resource.");
    toast.success(`Deleted ${r.name}`);
    changed();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4" /> Manage resources
          </DialogTitle>
          <DialogDescription>
            The QA team members who log work. Inactive people are hidden from the form and tabs; their history is kept.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={add} noValidate className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="new-resource-name">Name *</Label>
              <Input
                id="new-resource-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setAddError(null);
                }}
                placeholder="e.g. Demo Resource 1"
                maxLength={80}
                aria-invalid={!!addError}
                aria-describedby={addError ? "new-resource-error" : undefined}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="new-resource-email">Email (optional)</Label>
              <Input id="new-resource-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
          </div>
          {addError && (
            <p id="new-resource-error" className="text-xs text-red-700">
              {addError}
            </p>
          )}
          <Button type="submit" size="sm" className="w-fit bg-green-700 text-green-50 hover:bg-green-800">
            <Plus /> Add resource
          </Button>
        </form>

        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto" aria-label="Resources">
          {resources === null ? (
            <li className="py-4 text-center text-sm text-neutral-500">Loading…</li>
          ) : resources.length === 0 ? (
            <li className="py-4 text-center text-sm text-neutral-500">No resources yet. Add the first one above.</li>
          ) : (
            resources.map((r) => (
              <li key={`${r.id}-${r.name}`} className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-neutral-50">
                <Input
                  defaultValue={r.name}
                  aria-label={`Rename ${r.name}`}
                  className="h-8 flex-1"
                  maxLength={80}
                  onBlur={(e) => rename(r, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
                <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <Switch
                    checked={r.active}
                    onCheckedChange={async (active) => {
                      if (await patchResource(r.id, { active })) changed();
                    }}
                    aria-label={`${r.name} active`}
                  />
                  {r.active ? "Active" : "Inactive"}
                </label>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${r.name}`}
                  onClick={() => setToDelete(r)}
                  className="text-neutral-500 hover:text-red-600"
                >
                  <Trash2 />
                </Button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This also deletes their {toDelete?._count?.logs ?? 0} logged tasks. To keep the history, make them inactive
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-700 text-red-50 hover:bg-red-800">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {passcodeDialog}
    </Dialog>
  );
}
