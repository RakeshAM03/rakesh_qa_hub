"use client";

import { useMemo, useState } from "react";
import { ClipboardPaste, NotebookPen, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { YourNameField, useYourName } from "@/components/shared/your-name";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  FLAG_SEVERITIES,
  FLAG_TYPE_LABELS,
  FLAG_TYPES,
  type FlagSeverity,
  type FlagTypeKey,
} from "@/lib/ai-pr-review/constants";
import { formatLocation } from "@/lib/ai-pr-review/location";
import { parseFlagTable, type ParsedFlag } from "@/lib/ai-pr-review/parse-table";
import type { FlagInput } from "@/lib/ai-pr-review/schema";
import { CollapsibleCard } from "./collapsible-card";
import { FlagForm, flagToForm, formToInput } from "./flag-form";

type Mode = "claude" | "manual";
type PreviewRow = ParsedFlag & { key: number };

async function saveFlags(flags: FlagInput[], source: "CLAUDE_OUTPUT" | "MANUAL", loggedBy: string) {
  const res = await fetch("/api/ai-pr-review/flags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flags, source, loggedBy }),
  }).catch(() => null);
  if (!res) return { ok: false, error: "Couldn't reach the server. Try again." };
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, saved: data.saved as number } : { ok: false, error: data.error ?? "Couldn't save flags." };
}

export function LogFlagsCard({ onSaved }: { onSaved: () => void }) {
  const [mode, setMode] = useState<Mode>("claude");
  const { displayName } = useYourName();

  return (
    <CollapsibleCard id="log-flags" title="Log flags from session" icon={<NotebookPen className="size-4 text-purple-600" />}>
      <div className="flex flex-col gap-4">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          variant="outline"
          className="w-fit"
          aria-label="How to log flags"
        >
          <ToggleGroupItem value="claude" className="px-4 data-[state=on]:bg-purple-600 data-[state=on]:text-white">
            From Claude output
          </ToggleGroupItem>
          <ToggleGroupItem value="manual" className="px-4 data-[state=on]:bg-purple-600 data-[state=on]:text-white">
            Enter manually
          </ToggleGroupItem>
        </ToggleGroup>

        {mode === "claude" ? (
          <FromClaude
            onSave={async (flags) => {
              const result = await saveFlags(flags, "CLAUDE_OUTPUT", displayName);
              if (!result.ok) {
                toast.error(result.error);
                return false;
              }
              toast.success(`Saved ${result.saved} ${result.saved === 1 ? "flag" : "flags"}`);
              onSaved();
              return true;
            }}
          />
        ) : (
          <FlagForm
            idPrefix="manual-flag"
            onSubmit={async (input) => {
              const result = await saveFlags([input], "MANUAL", displayName);
              if (!result.ok) {
                toast.error(result.error);
                return false;
              }
              toast.success("Flag added");
              onSaved();
              return true;
            }}
            footer={({ submitting }) => (
              <Button type="submit" disabled={submitting} className="w-fit bg-purple-600 text-white hover:bg-purple-700">
                <Plus /> {submitting ? "Adding…" : "Add flag"}
              </Button>
            )}
          />
        )}
        <YourNameField id="flags-your-name" />
      </div>
    </CollapsibleCard>
  );
}

function rowProblem(row: ParsedFlag) {
  if (!row.flagType) return `Unknown flag type “${row.flagTypeText || "—"}”`;
  if (!row.severity) return `Severity must be P0 or P1 (got “${row.severityText || "—"}”)`;
  if (!row.repo) return "Repo is missing";
  if (!row.detail) return "Detail is missing";
  return null;
}

function FromClaude({ onSave }: { onSave: (flags: FlagInput[]) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const debounced = useDebouncedValue(text, 250);
  const parsed = useMemo(() => parseFlagTable(debounced), [debounced]);
  // User edits on top of the parsed rows; reset whenever the pasted text changes.
  const [edits, setEdits] = useState<{ source: string; rows: PreviewRow[] } | null>(null);
  const rows: PreviewRow[] =
    edits?.source === debounced ? edits.rows : parsed.flags.map((f, key) => ({ ...f, key }));
  const setRows = (next: PreviewRow[]) => setEdits({ source: debounced, rows: next });
  const [editing, setEditing] = useState<PreviewRow | null>(null);
  const [saving, setSaving] = useState(false);

  const problems = rows.map(rowProblem);
  const invalidCount = problems.filter(Boolean).length;

  function update(key: number, patch: Partial<ParsedFlag>) {
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function save() {
    const inputs: FlagInput[] = [];
    for (const row of rows) {
      const { input } = formToInput(flagToForm({ ...row, suggestedFix: row.suggestedFix }));
      if (!input) return toast.error("Fix the rows marked in red first.");
      inputs.push(input);
    }
    setSaving(true);
    const ok = await onSave(inputs);
    setSaving(false);
    if (ok) {
      setText("");
      setEdits(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor="claude-output" className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Paste Claude&apos;s output
      </Label>
      <p className="-mt-2 text-sm text-neutral-500">
        Paste the full review output — the flag table will be extracted automatically.
      </p>
      <Textarea
        id="claude-output"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste Claude's review output here..."
        className="min-h-40 resize-y font-mono text-xs"
      />
      {debounced.trim() && !parsed.found && (
        <p className="text-sm text-red-600" role="alert">
          No flag table found. It needs a markdown table with Flag Type, Detail and Severity columns.
        </p>
      )}
      {parsed.found && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-neutral-800" aria-live="polite">
            {rows.length} {rows.length === 1 ? "flag" : "flags"} found
            {invalidCount > 0 && <span className="text-red-600"> · {invalidCount} need fixing</span>}
          </p>
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Repo</th>
                    <th className="px-3 py-2">Flag Type</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Detail</th>
                    <th className="px-3 py-2">Severity</th>
                    <th className="px-3 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.key}
                      data-testid="preview-flag"
                      className={problems[i] ? "bg-red-50/60" : "border-t border-neutral-100"}
                    >
                      <td className="px-3 py-2 align-top">{row.repo || <span className="text-red-600">—</span>}</td>
                      <td className="px-3 py-2 align-top">
                        <Select value={row.flagType ?? ""} onValueChange={(v) => update(row.key, { flagType: v as FlagTypeKey })}>
                          <SelectTrigger size="sm" className="w-44" aria-label={`Flag type for row ${i + 1}`} aria-invalid={!row.flagType}>
                            <SelectValue placeholder={row.flagTypeText || "Select..."} />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {FLAG_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {FLAG_TYPE_LABELS[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="max-w-48 px-3 py-2 align-top font-mono text-xs break-all">{row.location}</td>
                      <td className="max-w-80 px-3 py-2 align-top">
                        <p className="line-clamp-3 whitespace-pre-wrap">{row.detail}</p>
                        {problems[i] && <p className="mt-1 text-xs text-red-600">{problems[i]}</p>}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Select value={row.severity ?? ""} onValueChange={(v) => update(row.key, { severity: v as FlagSeverity })}>
                          <SelectTrigger size="sm" className="w-20" aria-label={`Severity for row ${i + 1}`} aria-invalid={!row.severity}>
                            <SelectValue placeholder={row.severityText || "—"} />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {FLAG_SEVERITIES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit row ${i + 1}`} onClick={() => setEditing(row)}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove row ${i + 1}`}
                          onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                          className="text-neutral-500 hover:text-red-600"
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button
            onClick={save}
            disabled={rows.length === 0 || invalidCount > 0 || saving}
            className="w-fit bg-purple-600 text-white hover:bg-purple-700"
          >
            <Save /> {saving ? "Saving…" : `Save ${rows.length || ""} ${rows.length === 1 ? "flag" : "flags"}`}
          </Button>
        </div>
      )}
      {!text && (
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <ClipboardPaste className="size-3.5" /> Tip: generate the prompt above so Claude outputs the table in the right format.
        </p>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit flag</DialogTitle>
            <DialogDescription>Changes apply to the preview; nothing is saved until you click Save flags.</DialogDescription>
          </DialogHeader>
          {editing && (
            <FlagForm
              idPrefix="preview-edit"
              initial={flagToForm(editing)}
              onSubmit={(input) => {
                const loc = {
                  prNumber: input.prNumber ?? null,
                  filePath: input.filePath ?? null,
                  line: input.line ?? null,
                };
                update(editing.key, {
                  ...input,
                  ...loc,
                  location: formatLocation(loc),
                  suggestedFix: input.suggestedFix ?? "",
                });
                setEditing(null);
                return false;
              }}
              footer={() => (
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-purple-600 text-white hover:bg-purple-700">
                    Apply
                  </Button>
                </DialogFooter>
              )}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
