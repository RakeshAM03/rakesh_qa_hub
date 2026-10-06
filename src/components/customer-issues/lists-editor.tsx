"use client";

import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { toastResponseError, useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CATCHABLE_LABELS, LIST_LABELS, type CatchableValue, type ListKind } from "@/config/customer-issues";
import type { ListItemDto, Lists } from "@/lib/customer-issues/model";
import { cn } from "@/lib/utils";

/** Lists shown as editable chips (sub-categories are edited under their category). */
const EDITABLE: ListKind[] = ["PRODUCT", "DISPOSITION", "RCA_CATEGORY", "CAUGHT_AT", "WHY_ESCAPED", "DETECTED_BY", "SCOPE", "IMPACT", "OWNER_TEAM"];
const NONE = "__none";

type Props = { lists: Lists; reload: () => void };

/** Settings → Lists: add (open), edit / reorder / (de)activate / delete (admin passcode). */
export function ListsEditor({ lists, reload }: Props) {
  const [kind, setKind] = useState<ListKind>("PRODUCT");
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  async function patch(item: ListItemDto, body: Record<string, unknown>, done?: string) {
    const res = await withPasscode((headers) => fetch(`/api/customer-issues/lists/${item.id}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    if (!res) return false;
    if (!res.ok) {
      await toastResponseError(res, "Couldn't save the change.");
      return false;
    }
    if (done) toast.success(done);
    reload();
    return true;
  }

  async function remove(item: ListItemDto) {
    const res = await withPasscode((headers) => fetch(`/api/customer-issues/lists/${item.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toastResponseError(res, "Couldn't delete.");
    toast.success(`"${item.name}" deleted`);
    reload();
  }

  async function move(items: ListItemDto[], index: number, dir: -1 | 1) {
    const other = items[index + dir];
    if (!other) return;
    const a = items[index];
    // Two writes, one passcode prompt: swap sort orders (ties get distinct values).
    const aOrder = other.sortOrder === a.sortOrder ? a.sortOrder + dir : other.sortOrder;
    if (await patch(a, { sortOrder: Math.max(0, aOrder) })) await patch(other, { sortOrder: Math.max(0, a.sortOrder) });
  }

  const items = lists.of(kind).concat(lists.items.filter((i) => i.list === kind && !i.active));
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Lists" className="flex flex-wrap gap-1.5">
        {EDITABLE.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn("rounded-full border px-3 py-1 text-sm", kind === k ? "border-rose-700 bg-rose-700 text-rose-50" : "border-neutral-200 text-neutral-700 hover:bg-neutral-100")}
          >
            {LIST_LABELS[k]} ({lists.items.filter((i) => i.list === k).length})
          </button>
        ))}
      </div>

      {kind === "PRODUCT" && !items.length && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
          No products yet. Add the products your team supports (for example generic names like &ldquo;CRM&rdquo; or &ldquo;CMS&rdquo;) — every page can then be filtered by product.
        </p>
      )}

      <ul className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200" aria-label={LIST_LABELS[kind]}>
        {items.map((item, i) => (
          <li key={item.id} className={cn("flex flex-col gap-2 px-3 py-2.5", !item.active && "bg-neutral-50")}>
            <ItemRow
              item={item}
              lists={lists}
              first={i === 0}
              last={i === items.length - 1 || !items[i + 1]?.active}
              onSave={(body) => patch(item, body, "Saved")}
              onMove={(dir) => move(items, i, dir)}
              onDelete={() => remove(item)}
            />
            {kind === "RCA_CATEGORY" && <Subcategories parent={item} lists={lists} reload={reload} onSave={patch} onDelete={remove} />}
          </li>
        ))}
      </ul>

      <AddItemForm list={kind} lists={lists} onAdded={reload} />
      {passcodeDialog}
    </div>
  );
}

function ItemRow({
  item,
  lists,
  first,
  last,
  onSave,
  onMove,
  onDelete,
}: {
  item: ListItemDto;
  lists: Lists;
  first: boolean;
  last: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [catchable, setCatchable] = useState<string>(item.defaultCatchable ?? NONE);
  const [owner, setOwner] = useState<string>(item.defaultOwnerId ?? NONE);
  const isCategory = item.list === "RCA_CATEGORY";

  async function save(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { name, description };
    if (isCategory) Object.assign(body, { defaultCatchable: catchable === NONE ? null : catchable, defaultOwnerId: owner === NONE ? null : owner });
    if (await onSave(body)) setEditing(false);
  }

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor={`name-${item.id}`}>Name</Label>
          <Input id={`name-${item.id}`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </div>
        <div className="flex min-w-64 flex-[2] flex-col gap-1">
          <Label htmlFor={`desc-${item.id}`}>Description / definition</Label>
          <Input id={`desc-${item.id}`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </div>
        {isCategory && <CategoryDefaults lists={lists} catchable={catchable} owner={owner} setCatchable={setCatchable} setOwner={setOwner} idPrefix={item.id} />}
        <div className="flex gap-1">
          <Button type="submit" size="sm" className="bg-rose-700 text-rose-50 hover:bg-rose-800">
            <Check aria-hidden /> Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X aria-hidden /> Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium text-neutral-900", !item.active && "text-neutral-600 line-through")}>
          {item.name} {item.key && <Badge className="ml-1 bg-neutral-100 font-normal text-neutral-700">used by rules</Badge>}
        </p>
        {item.description && <p className="text-sm text-neutral-600">{item.description}</p>}
        {isCategory && (
          <p className="text-xs text-neutral-600">
            Default catchable: {item.defaultCatchable ? CATCHABLE_LABELS[item.defaultCatchable] : "—"} · Default owner: {lists.name(item.defaultOwnerId) ?? "—"}
          </p>
        )}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-neutral-700">
        <Switch checked={item.active} onCheckedChange={(v) => void onSave({ active: v })} aria-label={`${item.name} active`} /> Active
      </label>
      <div className="flex">
        <Button size="icon-sm" variant="ghost" disabled={first || !item.active} onClick={() => onMove(-1)} aria-label={`Move ${item.name} up`}>
          <ArrowUp aria-hidden />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={last || !item.active} onClick={() => onMove(1)} aria-label={`Move ${item.name} down`}>
          <ArrowDown aria-hidden />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit ${item.name}`}>
          <Pencil aria-hidden />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${item.name}`} disabled={!!item.key}>
          <Trash2 aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function CategoryDefaults({ lists, catchable, owner, setCatchable, setOwner, idPrefix }: { lists: Lists; catchable: string; owner: string; setCatchable: (v: string) => void; setOwner: (v: string) => void; idPrefix: string }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`catch-${idPrefix}`}>Default catchable</Label>
        <Select value={catchable} onValueChange={setCatchable}>
          <SelectTrigger id={`catch-${idPrefix}`} className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={NONE}>—</SelectItem>
            {(Object.keys(CATCHABLE_LABELS) as CatchableValue[]).map((c) => (
              <SelectItem key={c} value={c}>
                {CATCHABLE_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`owner-${idPrefix}`}>Default owner</Label>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger id={`owner-${idPrefix}`} className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={NONE}>—</SelectItem>
            {lists.of("OWNER_TEAM", owner).map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function Subcategories({ parent, lists, reload, onSave, onDelete }: { parent: ListItemDto; lists: Lists; reload: () => void; onSave: (i: ListItemDto, body: Record<string, unknown>, done?: string) => Promise<boolean>; onDelete: (i: ListItemDto) => void }) {
  const subs = lists.items.filter((i) => i.list === "RCA_SUBCATEGORY" && i.parentId === parent.id).sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder);
  return (
    <div className="ml-4 border-l border-rose-100 pl-3">
      <ul className="flex flex-col gap-1" aria-label={`Sub-categories of ${parent.name}`}>
        {subs.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <span className={cn("flex-1 text-neutral-800", !s.active && "text-neutral-600 line-through")}>{s.name}</span>
            <label className="flex items-center gap-1 text-xs text-neutral-700">
              <Switch checked={s.active} onCheckedChange={(v) => void onSave(s, { active: v })} aria-label={`${s.name} active`} />
            </label>
            <RenameButton item={s} onSave={(name) => onSave(s, { name }, "Saved")} />
            <Button size="icon-sm" variant="ghost" onClick={() => onDelete(s)} aria-label={`Delete ${s.name}`}>
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
        {!subs.length && <li className="text-xs text-neutral-600">No sub-categories.</li>}
      </ul>
      <AddItemForm list="RCA_SUBCATEGORY" parentId={parent.id} lists={lists} onAdded={reload} compact />
    </div>
  );
}

function RenameButton({ item, onSave }: { item: ListItemDto; onSave: (name: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  if (!editing)
    return (
      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Rename ${item.name}`}>
        <Pencil aria-hidden />
      </Button>
    );
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSave(name)) setEditing(false);
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 w-56" aria-label="New name" maxLength={120} required />
      <Button size="icon-sm" type="submit" variant="ghost" aria-label="Save name">
        <Check aria-hidden />
      </Button>
    </form>
  );
}

function AddItemForm({ list, parentId, lists, onAdded, compact }: { list: ListKind; parentId?: string; lists: Lists; onAdded: () => void; compact?: boolean }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [catchable, setCatchable] = useState<string>(NONE);
  const [owner, setOwner] = useState<string>(NONE);
  const [busy, setBusy] = useState(false);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const body = { list, parentId: parentId ?? null, name, description: description || null, defaultCatchable: catchable === NONE ? null : catchable, defaultOwnerId: owner === NONE ? null : owner };
    const res = await fetch("/api/customer-issues/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) return toastResponseError(res, "Couldn't add it.");
    toast.success(`"${name.trim()}" added`);
    setName("");
    setDescription("");
    onAdded();
  }
  const label = list === "RCA_SUBCATEGORY" ? "sub-category" : list === "PRODUCT" ? "product" : "item";
  return (
    <form onSubmit={add} className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end", compact ? "mt-1.5" : "rounded-lg border border-dashed border-neutral-300 p-3")}>
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        {!compact && <Label htmlFor={`add-${list}`}>New {label}</Label>}
        <Input id={`add-${list}${parentId ?? ""}`} value={name} onChange={(e) => setName(e.target.value)} placeholder={compact ? "Add a sub-category" : `Name of the new ${label}`} aria-label={`New ${label} name`} maxLength={120} className={compact ? "h-8" : undefined} />
      </div>
      {!compact && (
        <div className="flex min-w-64 flex-[2] flex-col gap-1">
          <Label htmlFor={`add-desc-${list}`}>Description (optional)</Label>
          <Input id={`add-desc-${list}`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </div>
      )}
      {list === "RCA_CATEGORY" && <CategoryDefaults lists={lists} catchable={catchable} owner={owner} setCatchable={setCatchable} setOwner={setOwner} idPrefix="new" />}
      <Button type="submit" size={compact ? "sm" : "default"} variant={compact ? "outline" : "default"} disabled={busy || !name.trim()} className={compact ? undefined : "bg-rose-700 text-rose-50 hover:bg-rose-800"}>
        <Plus aria-hidden /> Add {label}
      </Button>
    </form>
  );
}
