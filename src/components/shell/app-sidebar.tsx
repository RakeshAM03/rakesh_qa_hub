"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Brand } from "@/components/shell/brand";
import { NavList } from "@/components/shell/nav-list";
import { ThemePicker } from "@/components/theme/theme-picker";
import { Button } from "@/components/ui/button";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "qa-hub:sidebar-collapsed";

/** Desktop sidebar (md and up). Collapsed state is remembered per browser. */
export function AppSidebar() {
  const [stored, setStored] = useLocalStorage(STORAGE_KEY);
  const collapsed = stored === "1";

  function toggle() {
    setStored(collapsed ? "0" : "1");
  }

  return (
    <aside
      data-testid="app-sidebar"
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-neutral-200 bg-[var(--sidebar-glass)] backdrop-blur-xl transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-72",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center gap-2 px-4",
          collapsed && "justify-center px-2",
        )}
      >
        {!collapsed && <Brand className="flex-1" />}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>
      <div className={cn("flex-1 overflow-y-auto px-3 pb-4", collapsed && "px-2")}>
        <NavList collapsed={collapsed} />
      </div>
      <div className={cn("border-t border-neutral-200 p-3", collapsed && "flex justify-center px-2")}>
        <ThemePicker compact={collapsed} side={collapsed ? "right" : "top"} />
      </div>
    </aside>
  );
}
