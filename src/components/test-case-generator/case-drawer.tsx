"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CASE_TYPES, CATEGORIES, PRIORITIES, priorityLabel, type CaseType, type Category, type Priority, type PriorityScheme, type TestCase } from "@/lib/tcgen/types";

type Props = {
  testCase: TestCase | null;
  scheme: PriorityScheme;
  /** Quality warnings for this row. */
  issues?: string[];
  onChange: (c: TestCase) => void;
  onClose: () => void;
};

const lines = (s: string) => s.split("\n").map((l) => l.replace(/^\s*\d+[.)]\s*/, "")).filter((l) => l.trim());

export function CaseDrawer({ testCase: c, scheme, issues = [], onChange, onClose }: Props) {
  const id = useId();
  const set = (patch: Partial<TestCase>) => c && onChange({ ...c, ...patch });
  const field = (key: keyof TestCase, label: string, rows = 3) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Textarea id={`${id}-${key}`} value={String(c?.[key] ?? "")} onChange={(e) => set({ [key]: e.target.value } as Partial<TestCase>)} rows={rows} />
    </div>
  );

  return (
    <Sheet open={c !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit {c?.id}</SheetTitle>
          <SheetDescription>Changes apply straight away. Save the generation to keep them.</SheetDescription>
        </SheetHeader>
        {c && (
          <div key={c.key} className="flex flex-col gap-3 px-4 pb-6">
            {issues.length > 0 && (
              <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Weak row: {issues.join("; ")}.
              </p>
            )}
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-id`}>ID</Label>
                <Input id={`${id}-id`} value={c.id} onChange={(e) => set({ id: e.target.value })} className="font-mono text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-title`}>Title</Label>
                <Input id={`${id}-title`} value={c.title} onChange={(e) => set({ title: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-cat`}>Category</Label>
                <Select value={c.category} onValueChange={(v) => set({ category: v as Category })}>
                  <SelectTrigger id={`${id}-cat`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {CATEGORIES.map((x) => (
                      <SelectItem key={x} value={x}>
                        {x}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-type`}>Type</Label>
                <Select value={c.type} onValueChange={(v) => set({ type: v as CaseType })}>
                  <SelectTrigger id={`${id}-type`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {CASE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-prio`}>Priority</Label>
                <Select value={c.priority} onValueChange={(v) => set({ priority: v as Priority })}>
                  <SelectTrigger id={`${id}-prio`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {priorityLabel(p, scheme)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {field("preconditions", "Preconditions (numbered lines)", 5)}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-steps`}>Steps (one per line)</Label>
              <Textarea id={`${id}-steps`} value={c.steps.join("\n")} onChange={(e) => set({ steps: e.target.value.split("\n") })} onBlur={(e) => set({ steps: lines(e.target.value) })} rows={5} />
            </div>
            {field("testData", "Test data (Key: value lines)", 3)}
            {field("expectedResult", "Expected result (numbered lines)", 5)}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-ref`}>Requirement reference</Label>
              <Input id={`${id}-ref`} value={c.requirementRef} onChange={(e) => set({ requirementRef: e.target.value })} placeholder="AC1" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={c.automationCandidate} onCheckedChange={(v) => set({ automationCandidate: v })} />
              Automation candidate
            </label>
            {(c.gherkin !== null || c.category !== "API") && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-gherkin`}>Gherkin</Label>
                <Textarea id={`${id}-gherkin`} value={c.gherkin ?? ""} onChange={(e) => set({ gherkin: e.target.value || null })} rows={6} className="font-mono text-xs" placeholder="Feature / Scenario (optional)" />
              </div>
            )}
            {c.api && (
              <fieldset className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-3">
                <legend className="px-1 text-sm font-medium">API details</legend>
                <div className="grid grid-cols-[6rem_1fr_7rem] gap-2">
                  <Input aria-label="Method" value={c.api.method} onChange={(e) => set({ api: { ...c.api!, method: e.target.value.toUpperCase() } })} className="font-mono text-sm" />
                  <Input aria-label="Endpoint" value={c.api.endpoint} onChange={(e) => set({ api: { ...c.api!, endpoint: e.target.value } })} className="font-mono text-sm" />
                  <Input
                    aria-label="Expected status"
                    type="number"
                    value={c.api.expectedStatus ?? ""}
                    onChange={(e) => set({ api: { ...c.api!, expectedStatus: e.target.value ? Number(e.target.value) : null } })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-headers`}>Headers (Name: value per line)</Label>
                  <Textarea
                    id={`${id}-headers`}
                    rows={3}
                    className="font-mono text-xs"
                    defaultValue={Object.entries(c.api.headers)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join("\n")}
                    onBlur={(e) =>
                      set({
                        api: {
                          ...c.api!,
                          headers: Object.fromEntries(
                            e.target.value
                              .split("\n")
                              .map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()])
                              .filter(([k]) => k),
                          ),
                        },
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-apibody`}>Body (JSON)</Label>
                  <Textarea
                    id={`${id}-apibody`}
                    rows={4}
                    className="font-mono text-xs"
                    defaultValue={c.api.body === null || c.api.body === undefined ? "" : typeof c.api.body === "string" ? c.api.body : JSON.stringify(c.api.body, null, 2)}
                    onBlur={(e) => {
                      const t = e.target.value.trim();
                      let body: unknown = t || null;
                      try {
                        body = t ? JSON.parse(t) : null;
                      } catch {
                        // keep as text
                      }
                      set({ api: { ...c.api!, body } });
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-asserts`}>Assertions (one per line)</Label>
                  <Textarea id={`${id}-asserts`} rows={3} value={c.api.assertions.join("\n")} onChange={(e) => set({ api: { ...c.api!, assertions: e.target.value.split("\n") } })} />
                </div>
              </fieldset>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
