"use client";

import { useId, useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import { ChevronDown, Copy, GripVertical, Plus, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FIELD_GROUPS, FIELD_TYPE_LIST, FIELD_TYPES, typeLabel, type OptionSpec } from "@/lib/testdata/field-types";
import { addField, changeType, duplicateField, moveField, removeField, updateField } from "@/lib/testdata/schema-ops";
import type { Field, OptionValue } from "@/lib/testdata/types";
import type { SchemaError } from "@/lib/testdata/validate";
import { cn } from "@/lib/utils";

type BuilderProps = {
  fields: Field[];
  onChange: (fields: Field[]) => void;
  errors: SchemaError[];
};

export function SchemaBuilder({ fields, onChange, errors }: BuilderProps) {
  const errorsById = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of errors) if (e.fieldId) m.set(e.fieldId, [...(m.get(e.fieldId) ?? []), e.message]);
    return m;
  }, [errors]);

  return (
    <div className="flex flex-col gap-3">
      <FieldList list={fields} all={fields} onChange={onChange} errorsById={errorsById} parentId={null} depth={0} />
    </div>
  );
}

type ListProps = {
  list: Field[];
  all: Field[];
  onChange: (fields: Field[]) => void;
  errorsById: Map<string, string[]>;
  parentId: string | null;
  depth: number;
  /** Arrays hold exactly one child (their item). */
  single?: boolean;
};

function FieldList({ list, all, onChange, errorsById, parentId, depth, single }: ListProps) {
  const dragType = `text/x-tdg-field-${parentId ?? "root"}`;
  return (
    <div className="flex flex-col gap-2">
      {list.length === 0 && depth === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-600">
          No fields yet. Pick a preset above or add your first field.
        </p>
      )}
      <ol className="flex flex-col gap-2" aria-label={depth === 0 ? "Fields" : "Child fields"}>
        {list.map((f, i) => (
          <FieldRow
            key={f.id}
            field={f}
            index={i}
            total={list.length}
            all={all}
            onChange={onChange}
            errorsById={errorsById}
            depth={depth}
            dragType={dragType}
            canDuplicate={!single}
          />
        ))}
      </ol>
      {!(single && list.length >= 1) && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange(addField(all, parentId))}>
          <Plus aria-hidden /> {depth === 0 ? "Add field" : "Add child field"}
        </Button>
      )}
    </div>
  );
}

type RowProps = {
  field: Field;
  index: number;
  total: number;
  all: Field[];
  onChange: (fields: Field[]) => void;
  errorsById: Map<string, string[]>;
  depth: number;
  dragType: string;
  canDuplicate: boolean;
};

function FieldRow({ field, index, total, all, onChange, errorsById, depth, dragType, canDuplicate }: RowProps) {
  const id = useId();
  const [dragOver, setDragOver] = useState(false);
  const def = FIELD_TYPES[field.type];
  const errs = errorsById.get(field.id) ?? [];
  const label = field.name || `field ${index + 1}`;
  const set = (patch: Partial<Field>) => onChange(updateField(all, field.id, patch));

  function onHandleKey(e: KeyboardEvent) {
    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      onChange(moveField(all, field.id, index - 1));
    } else if (e.key === "ArrowDown" && index < total - 1) {
      e.preventDefault();
      onChange(moveField(all, field.id, index + 1));
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const fromId = e.dataTransfer.getData(dragType);
    if (fromId && fromId !== field.id) onChange(moveField(all, fromId, index));
  }

  return (
    <li
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(dragType)) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      data-testid="field-row"
      className={cn(
        "rounded-lg border bg-card p-2",
        errs.length ? "border-red-300" : "border-neutral-200",
        dragOver && "border-teal-500 bg-teal-50",
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData(dragType, field.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onKeyDown={onHandleKey}
          aria-label={`Reorder ${label}. Use arrow keys to move.`}
          className="cursor-grab rounded p-1 text-neutral-500 hover:text-neutral-800 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <Input
          aria-label={`Field ${index + 1} name`}
          value={field.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="fieldName"
          maxLength={64}
          aria-invalid={errs.length > 0}
          className="h-8 min-w-0 flex-1 font-mono text-xs"
        />
        <TypePicker value={field.type} label={label} onChange={(type) => onChange(changeType(all, field.id, type))} />
        <OptionsPopover field={field} label={label} onChange={set} />
        <div className="flex shrink-0 items-center">
          {canDuplicate && (
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Duplicate ${label}`} onClick={() => onChange(duplicateField(all, field.id))}>
              <Copy className="size-4" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Delete ${label}`} onClick={() => onChange(removeField(all, field.id))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-8 text-xs text-neutral-700">
        <label className="flex items-center gap-1.5" htmlFor={`${id}-blank`}>
          Blank %
          <Input
            id={`${id}-blank`}
            type="number"
            min={0}
            max={100}
            value={field.blankPct}
            onChange={(e) => set({ blankPct: clampPct(e.target.value) })}
            className="h-7 w-16 text-xs"
          />
        </label>
        {depth === 0 && (
          <label className="flex items-center gap-1.5">
            <Checkbox checked={field.unique} onCheckedChange={(c) => set({ unique: c === true })} aria-label={`${label} unique`} />
            Unique
          </label>
        )}
        {def?.edge && (
          <label className="flex items-center gap-1.5">
            <Switch checked={field.edgeCases} onCheckedChange={(c) => set({ edgeCases: c })} aria-label={`${label} edge cases`} className="scale-90" />
            Edge cases{field.edgeCases ? ` (${field.edgePct}%)` : ""}
          </label>
        )}
      </div>

      {errs.length > 0 && (
        <ul className="mt-1.5 pl-8 text-xs text-red-700">
          {errs.map((m) => (
            <li key={m}>{m.replace(/^[^:]+: /, "")}</li>
          ))}
        </ul>
      )}

      {(field.type === "object" || field.type === "array") && (
        <div className="mt-2 ml-4 border-l-2 border-teal-200 pl-3">
          <p className="mb-1.5 text-xs font-medium text-neutral-700">{field.type === "array" ? "Item" : "Child fields"}</p>
          <FieldList
            list={field.children ?? []}
            all={all}
            onChange={onChange}
            errorsById={errorsById}
            parentId={field.id}
            depth={depth + 1}
            single={field.type === "array"}
          />
        </div>
      )}
    </li>
  );
}

const clampPct = (v: string) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

function TypePicker({ value, label, onChange }: { value: string; label: string; onChange: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = FIELD_GROUPS.map((g) => ({
    group: g,
    items: FIELD_TYPE_LIST.filter((d) => d.group === g && (!q || d.label.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || g.toLowerCase().includes(q))),
  })).filter((g) => g.items.length);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 w-36 shrink-0 justify-between font-normal sm:w-40" aria-label={`Type for ${label}: ${typeLabel(value)}`}>
          <span className="truncate">{typeLabel(value)}</span>
          <ChevronDown className="opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b border-neutral-200 p-2">
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search types…" aria-label="Search field types" className="h-8" />
        </div>
        <div className="max-h-80 overflow-y-auto p-1" role="listbox" aria-label="Field types">
          {groups.length === 0 && <p className="px-2 py-3 text-sm text-neutral-600">No matching type.</p>}
          {groups.map((g) => (
            <div key={g.group} role="group" aria-label={g.group}>
              <p className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-neutral-600">{g.group}</p>
              {g.items.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="option"
                  aria-selected={d.id === value}
                  onClick={() => {
                    onChange(d.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none",
                    d.id === value && "bg-teal-50 font-medium text-teal-800",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OptionsPopover({ field, label, onChange }: { field: Field; label: string; onChange: (patch: Partial<Field>) => void }) {
  const def = FIELD_TYPES[field.type];
  const id = useId();
  const specs = def?.options ?? [];
  if (!specs.length && !def?.edge && !def?.note) return null;
  const setOpt = (key: string, v: OptionValue) => onChange({ options: { ...field.options, [key]: v } });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Options for ${label}`}>
          <Settings2 className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">{def?.label} options</p>
          {def?.note && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{def.note}</p>}
          {specs
            .filter((s) => field.type !== "foreignKey" || s.key === "source" || (field.options.source === "list" ? s.key === "list" : s.key === "field"))
            .map((s) => (
              <OptionInput key={s.key} id={`${id}-${s.key}`} spec={s} value={field.options[s.key]} onChange={(v) => setOpt(s.key, v)} />
            ))}
          {def?.edge && (
            <div className="flex flex-col gap-1.5 border-t border-neutral-200 pt-3">
              <Label htmlFor={`${id}-edgepct`} className="text-xs">
                Edge-case share (% of rows, Mixed mode)
              </Label>
              <Input
                id={`${id}-edgepct`}
                type="number"
                min={0}
                max={100}
                value={field.edgePct}
                onChange={(e) => onChange({ edgePct: clampPct(e.target.value) })}
                className="h-8"
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OptionInput({ id, spec, value, onChange }: { id: string; spec: OptionSpec; value: OptionValue | undefined; onChange: (v: OptionValue) => void }) {
  const help = spec.help && <p className="text-xs text-neutral-600">{spec.help}</p>;
  if (spec.kind === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={value === true} onCheckedChange={(c) => onChange(c === true)} />
        {spec.label}
      </label>
    );
  }
  if (spec.kind === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-xs">
          {spec.label}
        </Label>
        <Select value={String(value ?? spec.choices?.[0]?.value ?? "")} onValueChange={onChange}>
          <SelectTrigger id={id} className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {spec.choices?.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (spec.kind === "textarea") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-xs">
          {spec.label}
        </Label>
        <Textarea id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={spec.placeholder} rows={3} className="font-mono text-xs" />
        {help}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {spec.label}
      </Label>
      <Input
        id={id}
        type={spec.kind === "number" ? "number" : spec.kind === "date" ? "date" : "text"}
        min={spec.min}
        max={spec.max}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => onChange(spec.kind === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        placeholder={spec.placeholder}
        className={cn("h-8", spec.kind === "text" && "font-mono text-xs")}
      />
      {help}
    </div>
  );
}
