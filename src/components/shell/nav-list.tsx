"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { isActivePath, isNavChildActive, navGroups, type NavGroup as NavGroupConfig, type NavItem } from "@/config/nav";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const itemClass =
  "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-200/60 hover:text-neutral-900";
const activeClass = "nav-active hover:bg-[color-mix(in_oklab,var(--accent-1)_16%,transparent)]";

type NavListProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

const CLOSED_GROUPS_KEY = "qa-hub:nav-groups-closed";

export function NavList({ collapsed = false, onNavigate }: NavListProps) {
  const pathname = usePathname();
  const [stored, setStored] = useLocalStorage(CLOSED_GROUPS_KEY);
  const closed = parseClosed(stored);

  function toggleSection(title: string) {
    setStored((prev) => {
      const set = new Set(parseClosed(prev));
      if (set.has(title)) set.delete(title);
      else set.add(title);
      return JSON.stringify([...set]);
    });
  }

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {navGroups.map((group, i) => (
        <NavSection
          key={group.title}
          group={group}
          first={i === 0}
          open={collapsed || !closed.includes(group.title)}
          onToggle={() => toggleSection(group.title)}
          pathname={pathname}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

function parseClosed(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** A collapsible group heading (Test Planning, Test Execution, …) and its modules. */
function NavSection({
  group,
  first,
  open,
  onToggle,
  pathname,
  collapsed,
  onNavigate,
}: {
  group: NavGroupConfig;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const sectionId = `nav-section-${group.title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className={cn(!first && "mt-3")}>
      {collapsed ? (
        !first && <div role="separator" className="mx-2 mb-3 border-t border-neutral-200" />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={sectionId}
          className="flex h-7 w-full items-center gap-1 rounded-md px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-800"
        >
          <span className="flex-1 text-left">{group.title}</span>
          <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} aria-hidden />
        </button>
      )}
      {open && (
        <div id={sectionId} className="mt-1 flex flex-col gap-1">
          {group.items.map((item) =>
            item.children ? (
              <NavGroup
                key={item.href}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ) : (
              <NavItemLink
                key={item.href}
                item={item}
                active={isActivePath(pathname, item.href)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function NavItemLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.title : undefined}
      className={cn(itemClass, active && activeClass, collapsed && "justify-center px-0")}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.title}</span>}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.title}</TooltipContent>
    </Tooltip>
  );
}

function NavGroup({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const inGroup = isActivePath(pathname, item.href);
  const [open, setOpen] = useState(inGroup);
  // Re-open the group when navigating into it from elsewhere.
  const [lastInGroup, setLastInGroup] = useState(inGroup);
  if (inGroup !== lastInGroup) {
    setLastInGroup(inGroup);
    if (inGroup) setOpen(true);
  }

  if (collapsed) {
    return <NavItemLink item={item} active={inGroup} collapsed onNavigate={onNavigate} />;
  }

  const Icon = item.icon;
  const groupId = `nav-group-${item.href.slice(1)}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={groupId}
        className={cn(itemClass, "w-full")}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">{item.title}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div id={groupId} className="ml-5 mt-1 flex flex-col gap-1 border-l border-neutral-300 pl-3">
          {item.children!.map((child) => {
            const active = isNavChildActive(pathname, item, child);
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(itemClass, "h-8", active && activeClass)}
              >
                {child.title}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
