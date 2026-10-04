"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseFindings } from "@/lib/bug-formatter/parser";
import type { BugInput } from "@/lib/bug-formatter/types";

const PLACEHOLDER = `1. **P1 — Login button broken on mobile**
   Steps: Open on mobile, tap Login
   Expected: Login page opens
   Actual: Nothing happens

2. **P2 — Table overflows on small screen**
   ...`;

export function PasteTab({ onAdd }: { onAdd: (bugs: BugInput[]) => void }) {
  const [text, setText] = useState("");

  function parse() {
    const bugs = parseFindings(text);
    if (bugs.length === 0) {
      toast.warning("No findings found. Use a numbered list, e.g. “1. P1 — Title”.");
      return;
    }
    onAdd(bugs);
    setText("");
    toast.success(`${bugs.length} ${bugs.length === 1 ? "finding" : "findings"} added`);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-neutral-500">
        After running the PR validation in Claude Code, paste the findings output here. The parser
        picks up numbered lists, severity labels (P0–P3), and fields like <code>Steps:</code>{" "}
        <code>Expected:</code> <code>Actual:</code>.
      </p>
      <Textarea
        aria-label="Claude Code findings"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        className="min-h-64 font-mono text-xs"
      />
      <Button
        onClick={parse}
        disabled={!text.trim()}
        className="w-full bg-orange-700 text-orange-50 hover:bg-orange-800"
      >
        <ClipboardList /> Parse Findings
      </Button>
    </div>
  );
}
