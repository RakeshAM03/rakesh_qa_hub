"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { emptyKv, type KV } from "@/lib/api-playground/request";
import { cn } from "@/lib/utils";

type KvTableProps = {
  rows: KV[];
  onChange: (rows: KV[]) => void;
  /** Accessible name prefix, e.g. "Header". */
  label: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Suggestions for the key column (datalist). */
  suggestions?: string[];
  /** Variables the environment doesn't define (highlighted red). */
  isUnknown?: (text: string) => boolean;
};

/** Editable key/value rows with enable checkboxes. */
export function KvTable({ rows, onChange, label, keyPlaceholder = "Key", valuePlaceholder = "Value", suggestions, isUnknown }: KvTableProps) {
  const listId = suggestions ? `kv-suggest-${label.toLowerCase()}` : undefined;
  const update = (id: string, patch: Partial<KV>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && <p className="text-sm text-neutral-600">No {label.toLowerCase()}s yet.</p>}
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-center gap-2">
          <Checkbox checked={r.enabled} onCheckedChange={(c) => update(r.id, { enabled: c === true })} aria-label={`Enable ${label.toLowerCase()} ${i + 1}`} />
          <Input
            value={r.key}
            onChange={(e) => update(r.id, { key: e.target.value })}
            placeholder={keyPlaceholder}
            aria-label={`${label} ${i + 1} name`}
            list={listId}
            className={cn("h-8 flex-1 font-mono text-xs", isUnknown?.(r.key) && "border-red-500 text-red-700")}
          />
          <Input
            value={r.value}
            onChange={(e) => update(r.id, { value: e.target.value })}
            placeholder={valuePlaceholder}
            aria-label={`${label} ${i + 1} value`}
            className={cn("h-8 flex-[2] font-mono text-xs", isUnknown?.(r.value) && "border-red-500 text-red-700")}
          />
          <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(rows.filter((x) => x.id !== r.id))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      {listId && (
        <datalist id={listId}>
          {suggestions!.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => onChange([...rows, emptyKv()])}>
        <Plus className="size-4" aria-hidden /> Add {label.toLowerCase()}
      </Button>
    </div>
  );
}
