"use client";

import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ACCENTS } from "@/config/themes";
import { cn } from "@/lib/utils";
import { useAccent } from "./use-accent";

const MODES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
] as const;

/** True after hydration (theme values are only known in the browser). */
const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

type ThemePickerProps = {
  /** Icon-only trigger (collapsed sidebar, mobile header). */
  compact?: boolean;
  side?: "top" | "right" | "bottom" | "left";
};

export function ThemePicker({ compact = false, side = "top" }: ThemePickerProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const mounted = useMounted();
  const current = ACCENTS.find((a) => a.id === accent)!;
  const ModeIcon = mounted && resolvedTheme === "dark" ? Moon : Sun;

  const trigger = compact ? (
    <Button variant="ghost" size="icon" aria-label="Change theme">
      <Palette />
    </Button>
  ) : (
    <Button variant="ghost" className="h-10 w-full justify-start gap-3 px-3 font-normal text-neutral-600">
      <span className="flex -space-x-1" aria-hidden>
        {current.swatch.map((c) => (
          <span key={c} className="size-3.5 rounded-full ring-2 ring-background" style={{ background: c }} />
        ))}
      </span>
      <span className="flex-1 text-left">
        <span className="block text-sm font-medium text-neutral-900">Theme</span>
        <span className="block text-xs">{current.name}{mounted ? ` · ${MODES.find((m) => m.id === theme)?.label ?? "System"}` : ""}</span>
      </span>
      <ModeIcon className="size-4" />
    </Button>
  );

  return (
    <Popover>
      {compact ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Change theme</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent side={side} align="start" className="w-72 p-3" aria-label="Theme settings">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Mode</p>
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-neutral-100 p-1" role="radiogroup" aria-label="Colour mode">
          {MODES.map(({ id, label, icon: Icon }) => {
            const active = mounted && theme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(id)}
                className={cn(
                  "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
                  active ? "bg-card text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-900",
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            );
          })}
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Colour theme</p>
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="Colour theme">
          {ACCENTS.map((a) => {
            const active = mounted && accent === a.id;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setAccent(a.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  active ? "border-neutral-300 bg-neutral-100" : "border-transparent hover:bg-neutral-100",
                )}
              >
                <span
                  className="size-7 shrink-0 rounded-md"
                  style={{ background: `linear-gradient(135deg, ${a.swatch[0]}, ${a.swatch[1]} 55%, ${a.swatch[2]})` }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-neutral-900">{a.name}</span>
                  <span className="block truncate text-xs text-neutral-500">{a.description}</span>
                </span>
                {active && <Check className="size-4 text-neutral-700" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
