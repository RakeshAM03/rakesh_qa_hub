"use client";

import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SaveTemplateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves to an error message, or null when saved. */
  onSave: (name: string) => Promise<string | null>;
};

export function SaveTemplateDialog({ open, onOpenChange, onSave }: SaveTemplateDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Required");
      return;
    }
    setSaving(true);
    const message = await onSave(name.trim());
    setSaving(false);
    if (message) {
      setError(message);
    } else {
      setName("");
      setError(null);
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Save current as template</DialogTitle>
            <DialogDescription>
              Saves the selected focus areas, steps, context and spec reference. PR URLs aren&apos;t saved.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-name">
              Template name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Checkout smoke"
              maxLength={60}
              aria-invalid={!!error}
              aria-describedby={error ? "template-name-error" : undefined}
              autoFocus
            />
            {error && (
              <p id="template-name-error" className="text-xs text-red-600">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-purple-600 text-white hover:bg-purple-700">
              <Save /> {saving ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
