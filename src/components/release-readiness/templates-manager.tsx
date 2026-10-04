"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAdminPasscode } from "@/components/shared/use-admin-passcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { TemplateGate, TemplateSection } from "@/config/release-templates";
import { GATE_TYPE_LABELS, type GateType } from "@/lib/readiness";

type Template = { id: string; name: string; sections: TemplateSection[] };

export function TemplatesManager() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; name: string; sections: TemplateSection[] } | null>(null);
  const { withPasscode, passcodeDialog } = useAdminPasscode();

  const load = useCallback(() => {
    fetch("/api/release-readiness/templates")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { templates: Template[] }) => setTemplates(d.templates))
      .catch(() => toast.error("Couldn't load templates."));
  }, []);
  useEffect(load, [load]);

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error("Give the template a name.");
    const sections = editing.sections.map((s) => ({ ...s, gates: s.gates.filter((g) => g.title.trim()) })).filter((s) => s.name.trim());
    const res = await fetch(editing.id ? `/api/release-readiness/templates?id=${editing.id}` : "/api/release-readiness/templates", {
      method: editing.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editing.name, sections }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't save the template.");
    toast.success("Template saved");
    setEditing(null);
    load();
  }

  async function remove(t: Template) {
    const res = await withPasscode((headers) => fetch(`/api/release-readiness/templates?id=${t.id}`, { method: "DELETE", headers }));
    if (!res) return;
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
    toast.success("Template deleted");
    load();
  }

  if (editing) return <TemplateEditor value={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={save} />;

  return (
    <div className="flex flex-col gap-4">
      <Button className="self-start bg-green-600 text-white hover:bg-green-700" onClick={() => setEditing({ id: null, name: "", sections: [{ name: "Testing", gates: [{ title: "", type: "MANUAL", isBlocker: false, weight: 1 }] }] })}>
        <Plus className="size-4" aria-hidden /> New template
      </Button>
      {templates === null ? (
        <Skeleton className="h-32 w-full" />
      ) : templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-neutral-500">No templates — new releases use the built-in Standard release checklist.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-card shadow-xs" aria-label="Templates">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-900">{t.name}</p>
                <p className="text-xs text-neutral-500">
                  {t.sections.length} sections · {t.sections.reduce((n, s) => n + s.gates.length, 0)} gates ({t.sections.flatMap((s) => s.gates).filter((g) => g.type !== "MANUAL").length} auto)
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing({ id: t.id, name: t.name, sections: structuredClone(t.sections) })}>
                <Pencil className="size-4" aria-hidden /> Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing({ id: null, name: `${t.name} (copy)`, sections: structuredClone(t.sections) })}>
                <Copy className="size-4" aria-hidden /> Duplicate
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Delete ${t.name}`} onClick={() => remove(t)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {passcodeDialog}
    </div>
  );
}

function TemplateEditor({
  value,
  onChange,
  onCancel,
  onSave,
}: {
  value: { id: string | null; name: string; sections: TemplateSection[] };
  onChange: (v: { id: string | null; name: string; sections: TemplateSection[] }) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const setSections = (sections: TemplateSection[]) => onChange({ ...value, sections });
  const setGate = (si: number, gi: number, patch: Partial<TemplateGate>) =>
    setSections(value.sections.map((s, i) => (i === si ? { ...s, gates: s.gates.map((g, j) => (j === gi ? { ...g, ...patch } : g)) } : s)));
  const moveSection = (i: number, d: -1 | 1) => {
    const list = [...value.sections];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setSections(list);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-md flex-col gap-1.5">
        <Label htmlFor="tpl-name">Template name</Label>
        <Input id="tpl-name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} maxLength={100} />
      </div>
      {value.sections.map((s, si) => (
        <section key={si} aria-label={`Section ${si + 1}`} className="rounded-xl border border-neutral-200 bg-card p-4 shadow-xs">
          <div className="mb-3 flex items-center gap-2">
            <Input value={s.name} onChange={(e) => setSections(value.sections.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)))} aria-label={`Section ${si + 1} name`} className="max-w-xs font-semibold" />
            <Button size="icon" variant="ghost" aria-label="Move section up" onClick={() => moveSection(si, -1)}>
              <ArrowUp className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Move section down" onClick={() => moveSection(si, 1)}>
              <ArrowDown className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label={`Remove section ${s.name}`} onClick={() => setSections(value.sections.filter((_, i) => i !== si))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {s.gates.map((g, gi) => (
              <div key={gi} className="flex flex-wrap items-center gap-2">
                <Input value={g.title} onChange={(e) => setGate(si, gi, { title: e.target.value })} placeholder="Gate title" aria-label={`Gate ${gi + 1} title`} className="h-8 min-w-48 flex-1" />
                <Select value={g.type} onValueChange={(t) => setGate(si, gi, { type: t as GateType })}>
                  <SelectTrigger size="sm" className="w-56" aria-label={`Gate ${gi + 1} type`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(Object.keys(GATE_TYPE_LABELS) as GateType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t === "MANUAL" ? "Manual" : `Auto: ${GATE_TYPE_LABELS[t]}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <Switch checked={g.isBlocker} onCheckedChange={(c) => setGate(si, gi, { isBlocker: c })} aria-label={`Gate ${gi + 1} blocker`} /> Blocker
                </label>
                <Input type="number" min={0} max={10} value={g.weight} onChange={(e) => setGate(si, gi, { weight: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} aria-label={`Gate ${gi + 1} weight`} className="h-8 w-16" />
                <Button size="icon" variant="ghost" className="size-8" aria-label={`Remove gate ${gi + 1}`} onClick={() => setSections(value.sections.map((x, i) => (i === si ? { ...x, gates: x.gates.filter((_, j) => j !== gi) } : x)))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => setSections(value.sections.map((x, i) => (i === si ? { ...x, gates: [...x.gates, { title: "", type: "MANUAL", isBlocker: false, weight: 1 }] } : x)))}
            >
              <Plus className="size-4" aria-hidden /> Add gate
            </Button>
          </div>
        </section>
      ))}
      <Button variant="outline" className="self-start" onClick={() => setSections([...value.sections, { name: "New section", gates: [] }])}>
        <Plus className="size-4" aria-hidden /> Add section
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="bg-green-600 text-white hover:bg-green-700" onClick={onSave}>
          Save template
        </Button>
      </div>
    </div>
  );
}
