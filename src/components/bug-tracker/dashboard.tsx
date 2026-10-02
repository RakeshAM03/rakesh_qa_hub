"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewFeatureDialog, NewTeamDialog } from "./create-dialogs";
import { FeatureTable } from "./feature-table";
import { TeamSidebar } from "./team-sidebar";
import { BugTrackerTopBar } from "./top-bar";
import type { Feature, Team } from "./types";

export function BugTrackerDashboard() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [featureOpen, setFeatureOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/bug-tracker/teams").then((r) => (r.ok ? r.json() : Promise.reject(r))),
      fetch("/api/bug-tracker/features").then((r) => (r.ok ? r.json() : Promise.reject(r))),
    ])
      .then(([t, f]) => {
        if (cancelled) return;
        setTeams(t.teams);
        setFeatures(f.features);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = features && (selected ? features.filter((f) => f.teamId === selected) : features);
  const teamName = selected ? (teams?.find((t) => t.id === selected)?.name ?? null) : null;

  return (
    <>
      <BugTrackerTopBar />
      {failed && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Couldn&apos;t load the Bug Tracker. Refresh to try again.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <TeamSidebar
          teams={teams}
          features={features ?? []}
          selected={selected}
          onSelect={setSelected}
          onNewTeam={() => setTeamOpen(true)}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">QA Bug Tracker</h1>
              <p className="mt-1 text-sm text-neutral-500">
                Track QA issues across all features{teamName && <> · <span className="font-medium text-neutral-700">{teamName}</span></>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="view-sheet" className="text-sm text-neutral-600">
                View sheet
              </Label>
              <Select>
                <SelectTrigger id="view-sheet" className="w-44 bg-white">
                  <SelectValue placeholder="Select a sheet..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Google Sheets sync is coming soon</SelectLabel>
                    <SelectItem value="soon" disabled>
                      Coming soon
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button onClick={() => setFeatureOpen(true)} disabled={teams === null}>
                <Plus /> New Feature Page
              </Button>
            </div>
          </div>
          <FeatureTable features={shown} teamName={teamName} onNewFeature={() => setFeatureOpen(true)} />
        </div>
      </div>

      <NewTeamDialog
        open={teamOpen}
        onOpenChange={setTeamOpen}
        onCreated={(team) => {
          setTeams((list) => [...(list ?? []), team].sort((a, b) => a.name.localeCompare(b.name)));
          toast.success(`Team “${team.name}” created`);
        }}
      />
      <NewFeatureDialog
        open={featureOpen}
        onOpenChange={setFeatureOpen}
        teams={teams ?? []}
        defaultTeamId={selected}
        onCreated={(feature) => {
          setFeatures((list) => [...(list ?? []), feature].sort((a, b) => a.name.localeCompare(b.name)));
          if (feature.teamId) {
            setTeams((list) => list?.map((t) => (t.id === feature.teamId ? { ...t, featureCount: t.featureCount + 1 } : t)) ?? null);
          }
          toast.success(`Feature page “${feature.name}” created`);
        }}
      />
    </>
  );
}
