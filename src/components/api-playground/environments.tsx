"use client";

import { useState } from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Environment = { id: string; name: string; variables: { key: string; value: string }[] };

const NONE = "__none__";

type Props = {
  environments: Environment[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onChanged: () => void;
  withPasscode: (action: (headers: Record<string, string>) => Promise<Response>) => Promise<Response | null>;
};

export function EnvironmentPicker({ environments, activeId, onSelect, onChanged, withPasscode }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Select value={activeId ?? NONE} onValueChange={(v) => onSelect(v === NONE ? null : v)}>
        <SelectTrigger className="w-44" aria-label="Environment">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={NONE}>No environment</SelectItem>
          {environments.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon" aria-label="Manage environments" onClick={() => setOpen(true)}>
        <Settings2 className="size-4" />
      </Button>
      <EnvironmentDialog
        open={open}
        onOpenChange={setOpen}
        environments={environments}
        activeId={activeId}
        onSelect={onSelect}
        onChanged={onChanged}
        withPasscode={withPasscode}
      />
    </div>
  );
}

function EnvironmentDialog({
  open,
  onOpenChange,
  environments,
  activeId,
  onSelect,
  onChanged,
  withPasscode,
}: Props & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [vars, setVars] = useState<{ key: string; value: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const editing = environments.find((e) => e.id === editingId);

  function edit(e: Environment | null) {
    setEditingId(e?.id ?? "new");
    setName(e?.name ?? "");
    setVars(e ? e.variables.map((v) => ({ ...v })) : [{ key: "baseUrl", value: "https://api.example.com" }]);
  }

  async function save() {
    if (!name.trim()) return toast.error("Give the environment a name.");
    setBusy(true);
    try {
      const body = JSON.stringify({ name, variables: vars.filter((v) => v.key.trim()) });
      const res =
        editingId === "new"
          ? await fetch("/api/api-playground/environments", { method: "POST", headers: { "Content-Type": "application/json" }, body })
          : await fetch(`/api/api-playground/environments?id=${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the environment.");
      toast.success("Environment saved");
      if (editingId === "new") onSelect(data.environment.id);
      setEditingId(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the environment.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: Environment) {
    const res = await withPasscode((headers) => fetch(`/api/api-playground/environments?id=${e.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
    toast.success("Environment deleted");
    if (activeId === e.id) onSelect(null);
    if (editingId === e.id) setEditingId(null);
    onChanged();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setEditingId(null);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Environments</DialogTitle>
          <DialogDescription>Use {"{{name}}"} in the URL, params, headers, auth or body. Values are visible to anyone using this hub — don&apos;t store real secrets.</DialogDescription>
        </DialogHeader>
        {editingId === null ? (
          <div className="flex flex-col gap-2">
            {environments.length === 0 && <p className="text-sm text-neutral-500">No environments yet.</p>}
            <ul className="flex flex-col divide-y divide-neutral-200" aria-label="Environments">
              {environments.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-2">
                  <span className="flex-1 text-sm font-medium">
                    {e.name} <span className="text-xs font-normal text-neutral-500">· {e.variables.length} variables</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => edit(e)}>
                    Edit
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${e.name}`} onClick={() => remove(e)}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" className="self-start" onClick={() => edit(null)}>
              <Plus className="size-4" aria-hidden /> New environment
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="env-name">Name</Label>
              <Input id="env-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Staging" maxLength={100} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Variables</Label>
              {vars.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <Input aria-label={`Variable ${i + 1} name`} value={v.key} onChange={(e) => setVars(vars.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder="name" className="h-8 flex-1 font-mono text-xs" />
                  <Input aria-label={`Variable ${i + 1} value`} value={v.value} onChange={(e) => setVars(vars.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="value" className="h-8 flex-[2] font-mono text-xs" />
                  <Button size="icon" variant="ghost" className="size-8" aria-label={`Remove variable ${i + 1}`} onClick={() => setVars(vars.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="self-start" onClick={() => setVars([...vars, { key: "", value: "" }])}>
                <Plus className="size-4" aria-hidden /> Add variable
              </Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingId(null)}>
                Back
              </Button>
              <Button onClick={save} disabled={busy}>
                {editing ? "Save changes" : "Create"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
