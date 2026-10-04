"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Feature, Team } from "./types";

const ALL = "__all__";

type TeamSidebarProps = {
  teams: Team[] | null;
  features: Feature[];
  selected: string | null;
  onSelect: (teamId: string | null) => void;
  onNewTeam: () => void;
};

function CountBadge({ count, active }: { count: number; active?: boolean }) {
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-5 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums",
        active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-neutral-100 text-neutral-600",
      )}
    >
      {count}
    </span>
  );
}

export function TeamSidebar({ teams, features, selected, onSelect, onNewTeam }: TeamSidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (teams === null) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Small screens: a dropdown */}
      <div className="flex items-center gap-2 lg:hidden">
        <Select value={selected ?? ALL} onValueChange={(v) => onSelect(v === ALL ? null : v)}>
          <SelectTrigger className="w-full bg-card" aria-label="Filter by team">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All ({features.length})</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} ({t.featureCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button type="button" onClick={onNewTeam} className="shrink-0 text-sm font-medium text-neutral-700 hover:underline">
          + New Team
        </button>
      </div>

      {/* Large screens: the sidebar */}
      <nav aria-label="Teams" className="hidden flex-col gap-1 rounded-xl border border-neutral-200 bg-card p-2 lg:flex">
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selected === null}
          className={cn(
            "flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium",
            selected === null ? "bg-primary text-primary-foreground" : "text-neutral-700 hover:bg-neutral-100",
          )}
        >
          All
          <CountBadge count={features.length} active={selected === null} />
        </button>
        {teams.map((team) => {
          const open = expanded.has(team.id);
          const teamFeatures = features.filter((f) => f.teamId === team.id);
          return (
            <div key={team.id}>
              <div
                className={cn(
                  "flex h-9 items-center rounded-lg text-sm",
                  selected === team.id ? "bg-neutral-100 font-semibold text-neutral-900" : "text-neutral-700 hover:bg-neutral-50",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(team.id)}
                  aria-expanded={open}
                  aria-label={`${open ? "Collapse" : "Expand"} ${team.name}`}
                  className="flex h-full w-7 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-700"
                >
                  <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(team.id)}
                  aria-pressed={selected === team.id}
                  title={team.name}
                  className="flex h-full min-w-0 flex-1 items-center gap-2 pr-2 text-left"
                >
                  <span className="truncate">{team.name}</span>
                  <CountBadge count={team.featureCount} />
                </button>
              </div>
              {open && (
                <ul className="mt-1 mb-1 ml-5 flex flex-col gap-0.5 border-l border-neutral-200 pl-3">
                  {teamFeatures.length === 0 ? (
                    <li className="py-1 text-xs text-neutral-500">No feature pages yet</li>
                  ) : (
                    teamFeatures.map((f) => (
                      <li key={f.id}>
                        <Link href={`/bug-tracker/${f.id}`} className="block truncate rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900" title={f.name}>
                          {f.name}
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={onNewTeam}
          className="mt-1 flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
        >
          <Plus className="size-4" /> New Team
        </button>
      </nav>
    </>
  );
}
