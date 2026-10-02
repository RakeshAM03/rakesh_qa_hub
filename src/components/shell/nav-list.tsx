"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { isActivePath, isNavChildActive, navItems, type NavItem } from "@/config/nav";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const itemClass =
  "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-200/60 hover:text-neutral-900";
const activeClass = "bg-neutral-200 text-neutral-900 hover:bg-neutral-200";

type NavListProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function NavList({ collapsed = false, onNavigate }: NavListProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {navItems.map((item) =>
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
    </nav>
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
