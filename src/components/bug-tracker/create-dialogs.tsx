"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NO_TEAM, type Feature, type Team } from "./types";

async function post<T>(url: string, body: object): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { data: json } : { error: json.error ?? "Something went wrong." };
  } catch {
    return { error: "Couldn't reach the server. Try again." };
  }
}

type BaseProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function NewTeamDialog({ open, onOpenChange, onCreated }: BaseProps & { onCreated: (team: Team) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Team name is required");
    setSaving(true);
    const { data, error } = await post<{ team: Team }>("/api/bug-tracker/teams", { name });
    setSaving(false);
    if (error) return setError(error);
    onCreated(data!.team);
    setName("");
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setError(null); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New Team</DialogTitle>
            <DialogDescription>Teams group feature pages in the sidebar.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team-name">
              Team name <span className="text-red-700">*</span>
            </Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="e.g. Checkout"
              maxLength={80}
              aria-invalid={!!error}
              aria-describedby={error ? "team-name-error" : undefined}
              autoFocus
            />
            {error && <p id="team-name-error" className="text-xs text-red-700">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type NewFeatureProps = BaseProps & {
  teams: Team[];
  defaultTeamId: string | null;
  onCreated: (feature: Feature) => void;
};

export function NewFeatureDialog({ open, onOpenChange, teams, defaultTeamId, onCreated }: NewFeatureProps) {
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState(defaultTeamId ?? NO_TEAM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pre-select the team that is filtered in the sidebar each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTeamId(defaultTeamId ?? NO_TEAM);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Feature name is required");
    setSaving(true);
    const { data, error } = await post<{ feature: Feature }>("/api/bug-tracker/features", {
      name,
      teamId: teamId === NO_TEAM ? null : teamId,
    });
    setSaving(false);
    if (error) return setError(error);
    onCreated(data!.feature);
    setName("");
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setError(null); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <DialogTitle>New Feature Page</DialogTitle>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close">
                <X />
              </Button>
            </DialogClose>
          </DialogHeader>
          <DialogDescription className="sr-only">Create a feature page to log its QA issues.</DialogDescription>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feature-name">
              Feature Name <span className="text-red-700">*</span>
            </Label>
            <Input
              id="feature-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="e.g. User Authentication"
              maxLength={200}
              aria-invalid={!!error}
              aria-describedby={error ? "feature-name-error" : undefined}
              autoFocus
            />
            {error && <p id="feature-name-error" className="text-xs text-red-700">{error}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feature-team">Team</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger id="feature-team" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEAM}>— No team —</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
