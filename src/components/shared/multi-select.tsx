"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Checkbox list in a popover, with a filter. */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  empty,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  empty: string;
}) {
  const [q, setQ] = useState("");
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const selected = options.filter((o) => value.includes(o.value));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal" aria-label={label}>
          <span className="truncate">{selected.length ? selected.map((s) => s.label).join(", ") : `None selected`}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        {options.length === 0 ? (
          <p className="p-2 text-sm text-neutral-500">{empty}</p>
        ) : (
          <>
            {options.length > 6 && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="mb-2 h-8" aria-label={`Filter ${label}`} />}
            <ul className="max-h-60 overflow-y-auto" aria-label={label}>
              {shown.map((o) => {
                const id = `ms-${label}-${o.value}`.replace(/[^\w-]/g, "_");
                return (
                  <li key={o.value} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-neutral-100">
                    <Checkbox id={id} checked={value.includes(o.value)} onCheckedChange={(c) => onChange(c === true ? [...value, o.value] : value.filter((v) => v !== o.value))} />
                    <label htmlFor={id} className="flex-1 cursor-pointer truncate text-sm">
                      {o.label}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
