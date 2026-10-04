"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

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

const STORAGE_KEY = "qa-hub:admin-passcode";
export const ADMIN_HEADER = "x-admin-passcode";

function stored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function store(value: string | null) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage unavailable — the passcode is asked for each time
  }
}

/**
 * Runs admin-only requests. Asks for the passcode in a small dialog the first
 * time, remembers it for this tab, and asks again if the server rejects it.
 *
 *   const { withPasscode, passcodeDialog } = useAdminPasscode();
 *   const res = await withPasscode((headers) => fetch(url, { method: "DELETE", headers }));
 *   // res is null when the user cancelled
 */
export function useAdminPasscode() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolver = useRef<((passcode: string | null) => void) | null>(null);

  const ask = useCallback((message: string | null) => {
    setValue("");
    setError(message);
    setOpen(true);
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (passcode: string | null) => {
    setOpen(false);
    resolver.current?.(passcode);
    resolver.current = null;
  };

  const withPasscode = useCallback(
    async (action: (headers: Record<string, string>) => Promise<Response>): Promise<Response | null> => {
      let passcode = stored() ?? (await ask(null));
      while (passcode) {
        const res = await action({ [ADMIN_HEADER]: passcode });
        if (res.status !== 401) {
          if (res.ok) store(passcode);
          return res;
        }
        store(null);
        passcode = await ask("That passcode didn't work. Try again.");
      }
      return null;
    },
    [ask],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) {
      setError("Required");
      return;
    }
    finish(value.trim());
  }

  const passcodeDialog = (
    <Dialog open={open} onOpenChange={(o) => !o && finish(null)}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Admin passcode
            </DialogTitle>
            <DialogDescription>
              This action is protected. Enter the admin passcode; it&apos;s remembered until you close this tab.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-passcode">Passcode</Label>
            <Input
              id="admin-passcode"
              type="password"
              autoComplete="current-password"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "admin-passcode-error" : undefined}
              autoFocus
            />
            {error && (
              <p id="admin-passcode-error" className="text-xs text-red-700">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit">Continue</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { withPasscode, passcodeDialog };
}

/** Shows the server's error message for a failed request. */
export async function toastResponseError(res: Response, fallback: string) {
  try {
    const data = await res.json();
    toast.error(data.error ?? fallback);
  } catch {
    toast.error(fallback);
  }
}
