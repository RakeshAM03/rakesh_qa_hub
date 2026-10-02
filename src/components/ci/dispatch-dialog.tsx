"use client";

import { useState, type FormEvent } from "react";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Suite } from "./types";

type DispatchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suite: Suite;
  onRun: (ref: string, inputs: Record<string, string>) => Promise<boolean>;
};

/** Run options: branch plus the suite's dispatch inputs, pre-filled with defaults. */
export function DispatchDialog({ open, onOpenChange, suite, onRun }: DispatchDialogProps) {
  const defaults = () => Object.fromEntries(suite.dispatchInputs.map((i) => [i.key, i.default || (i.type === "choice" ? i.options[0] : "")]));
  const [ref, setRef] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>(defaults);
  const [running, setRunning] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setInputs(defaults());
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setRunning(true);
    const ok = await onRun(ref.trim(), inputs);
    setRunning(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Run {suite.name}</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {suite.repo} · {suite.workflowFile}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`ref-${suite.id}`}>Branch</Label>
            <Input id={`ref-${suite.id}`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Default branch" className="font-mono text-sm" />
          </div>
          {suite.dispatchInputs.map((input) => (
            <div key={input.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`in-${suite.id}-${input.key}`}>{input.label || input.key}</Label>
              {input.type === "choice" ? (
                <Select value={inputs[input.key]} onValueChange={(v) => setInputs((s) => ({ ...s, [input.key]: v }))}>
                  <SelectTrigger id={`in-${suite.id}-${input.key}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {input.options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`in-${suite.id}-${input.key}`}
                  value={inputs[input.key] ?? ""}
                  onChange={(e) => setInputs((s) => ({ ...s, [input.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={running}>
              <Play /> {running ? "Starting…" : "Run workflow"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
