"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Brand } from "@/components/shell/brand";
import { HelpLink } from "@/components/shell/help-link";
import { NavList } from "@/components/shell/nav-list";
import { ThemePicker } from "@/components/theme/theme-picker";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** Top bar with a slide-out drawer, shown below the md breakpoint. */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-14 print:hidden items-center gap-2 border-b border-neutral-200 bg-[var(--sidebar-glass)] px-4 backdrop-blur-xl md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-background p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle className="sr-only">Rakesh QA Hub</SheetTitle>
            <Brand />
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-3 pb-4">
            <NavList onNavigate={() => setOpen(false)} />
            <div className="mt-3 border-t border-neutral-200 pt-3">
              <HelpLink onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <Brand className="flex-1" />
      <ThemePicker compact side="bottom" />
    </header>
  );
}
