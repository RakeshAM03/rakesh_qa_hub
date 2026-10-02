"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";

import { NavList } from "@/components/shell/nav-list";
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
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-neutral-200 bg-neutral-100 px-4 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-neutral-100 p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>Rakesh QA Hub</SheetTitle>
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-3 pb-4">
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <Link href="/" className="font-semibold text-neutral-900">
        Rakesh QA Hub
      </Link>
    </header>
  );
}
