"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { toastResponseError } from "@/components/shared/use-admin-passcode";
import { useYourName } from "@/components/shared/your-name";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CATCHABLE_LABELS, type CatchableValue, type ListKind } from "@/config/customer-issues";
import type { Lists } from "@/lib/customer-issues/model";

const NONE = "__none";
const KEEP = "__keep";
const today = () => new Date().toISOString().slice(0, 10);

export function ListSelect({ id, label, list, lists, value, onChange, keepOption, parentId, disabled }: { id: string; label: string; list: ListKind; lists: Lists; value: string; onChange: (v: string) => void; keepOption?: boolean; parentId?: string | null; disabled?: boolean }) {
  const items = list === "RCA_SUBCATEGORY" ? lists.subcategories(parentId, value) : lists.of(list, value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {keepOption && <SelectItem value={KEEP}>Don&apos;t change</SelectItem>}
          <SelectItem value={NONE}>—</SelectItem>
          {items.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** + New issue: the tracker basics; classification happens on the detail page. */
export function NewIssueDialog({ open, onOpenChange, lists, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; lists: Lists; onCreated: (id: string) => void }) {
  const { name } = useYourName();
  const [form, setForm] = useState({ issueKey: "", summary: "", description: "", issueUrl: "", createdDate: today(), productId: NONE, module: "", releasedIn: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(form.issueKey.trim())) return setError("Use an issue key like DEMO-101.");
    if (!form.summary.trim()) return setError("Summary is required.");
    setBusy(true);
    const body = {
      issueKey: form.issueKey.trim(),
      summary: form.summary,
      description: form.description || null,
      issueUrl: form.issueUrl.trim() || null,
      createdDate: form.createdDate,
      productId: form.productId === NONE ? null : form.productId,
      module: form.module.trim() || null,
      releasedIn: form.releasedIn.trim() || null,
      qaOwner: name || null,
    };
    const res = await fetch("/api/customer-issues/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setError(d.error ?? "Couldn't create the issue.");
    }
    const { issue } = await res.json();
    toast.success(`${issue.issueKey} added — classify it next`);
    onOpenChange(false);
    setForm({ issueKey: "", summary: "", description: "", issueUrl: "", createdDate: today(), productId: NONE, module: "", releasedIn: "" });
    onCreated(issue.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New customer issue</DialogTitle>
            <DialogDescription>The basics from the tracker. You classify it and write the RCA on the next page.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ni-key">Issue key *</Label>
              <Input id="ni-key" value={form.issueKey} onChange={(e) => set({ issueKey: e.target.value })} placeholder="DEMO-101" autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ni-created">Created date *</Label>
              <DatePicker id="ni-created" value={form.createdDate} onChange={(v) => set({ createdDate: v ?? today() })} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ni-summary">Summary *</Label>
            <Input id="ni-summary" value={form.summary} onChange={(e) => set({ summary: e.target.value })} maxLength={500} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ni-desc">Description</Label>
            <Textarea id="ni-desc" value={form.description} onChange={(e) => set({ description: e.target.value })} rows={4} placeholder="What the customer saw, steps, environment…" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <ListSelect id="ni-product" label="Product" list="PRODUCT" lists={lists} value={form.productId} onChange={(v) => set({ productId: v })} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ni-module">Module / feature</Label>
              <Input id="ni-module" value={form.module} onChange={(e) => set({ module: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ni-released">Released in</Label>
              <Input id="ni-released" value={form.releasedIn} onChange={(e) => set({ releasedIn: e.target.value })} placeholder="v2.4.0" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ni-url">Issue URL</Label>
            <Input id="ni-url" type="url" value={form.issueUrl} onChange={(e) => set({ issueUrl: e.target.value })} placeholder="https://your-tracker.example.com/browse/DEMO-101" />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
              Create issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Bulk edit: disposition, RCA category, product, catchable, owner team ("Don't change" by default). */
export function BulkEditDialog({ open, onOpenChange, lists, ids, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; lists: Lists; ids: string[]; onDone: () => void }) {
  const [v, setV] = useState({ dispositionId: KEEP, rcaCategoryId: KEEP, productId: KEEP, catchable: KEEP, ownerTeamId: KEEP });
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const set = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== KEEP).map(([k, x]) => [k, x === NONE ? null : x]));
    if (!Object.keys(set).length) return toast.error("Pick at least one field to change.");
    setBusy(true);
    const res = await fetch("/api/customer-issues/issues/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, set }) });
    setBusy(false);
    if (!res.ok) return toastResponseError(res, "Couldn't update the issues.");
    toast.success(`${ids.length} issue${ids.length === 1 ? "" : "s"} updated`);
    onOpenChange(false);
    onDone();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Bulk edit {ids.length} issue{ids.length === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>Only the fields you change are applied. A new RCA category also sets its default catchable and owner team, unless you set them here.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <ListSelect id="be-disp" label="Disposition" list="DISPOSITION" lists={lists} value={v.dispositionId} onChange={(x) => setV({ ...v, dispositionId: x })} keepOption />
            <ListSelect id="be-cat" label="RCA category" list="RCA_CATEGORY" lists={lists} value={v.rcaCategoryId} onChange={(x) => setV({ ...v, rcaCategoryId: x })} keepOption />
            <ListSelect id="be-product" label="Product" list="PRODUCT" lists={lists} value={v.productId} onChange={(x) => setV({ ...v, productId: x })} keepOption />
            <ListSelect id="be-owner" label="Owner team" list="OWNER_TEAM" lists={lists} value={v.ownerTeamId} onChange={(x) => setV({ ...v, ownerTeamId: x })} keepOption />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="be-catchable">Catchable by QA?</Label>
              <Select value={v.catchable} onValueChange={(x) => setV({ ...v, catchable: x })}>
                <SelectTrigger id="be-catchable" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={KEEP}>Don&apos;t change</SelectItem>
                  <SelectItem value={NONE}>—</SelectItem>
                  {(Object.keys(CATCHABLE_LABELS) as CatchableValue[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATCHABLE_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-rose-700 text-rose-50 hover:bg-rose-800">
              Apply to {ids.length}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
