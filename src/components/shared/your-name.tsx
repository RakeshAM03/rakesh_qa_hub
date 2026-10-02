"use client";

import { UserRound } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocalStorage } from "@/hooks/use-local-storage";

const STORAGE_KEY = "qa-hub:your-name";

/** The visitor's display name, used for "Saved by" / "Logged by". There's no login. */
export function useYourName() {
  const [name, setName] = useLocalStorage(STORAGE_KEY);
  return { name: name ?? "", displayName: name?.trim() || "Anonymous", setName };
}

export function YourNameField({ id = "your-name" }: { id?: string }) {
  const { name, setName } = useYourName();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        <UserRound className="size-3.5" aria-hidden /> Your name{" "}
        <span className="font-normal normal-case tracking-normal">(optional, remembered in this browser)</span>
      </Label>
      <Input
        id={id}
        value={name}
        onChange={(e) => setName(e.target.value || null)}
        placeholder="Anonymous"
        maxLength={60}
      />
    </div>
  );
}
