import { Construction } from "lucide-react";

/** Placeholder body for routes that aren't built yet. */
export function ComingSoon({ message = "Coming soon" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-card px-6 py-16 text-center">
      <Construction className="size-8 text-neutral-400" aria-hidden />
      <p className="text-base font-medium text-neutral-700">{message}</p>
    </div>
  );
}
