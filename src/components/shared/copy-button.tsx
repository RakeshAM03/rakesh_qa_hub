"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/browser";

type CopyButtonProps = {
  text: string;
  label?: string;
  /** Toast text on success. */
  message?: string;
  size?: "sm" | "icon" | "default";
  variant?: "outline" | "ghost" | "secondary";
  className?: string;
};

/** Copies `text`; briefly shows a check. Icon-only when no label is given. */
export function CopyButton({ text, label, message = "Copied", size = "sm", variant = "outline", className }: CopyButtonProps) {
  const [done, setDone] = useState(false);
  const Icon = done ? Check : Copy;
  return (
    <Button
      type="button"
      size={label ? size : "icon"}
      variant={variant}
      className={className}
      aria-label={label ? undefined : "Copy"}
      onClick={async () => {
        if (await copyText(text, message)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
