import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/qa-tracker/schema";
import { cn } from "@/lib/utils";

export const STATUS_STYLES: Record<TaskStatus, string> = {
  NOT_STARTED: "bg-neutral-100 text-neutral-700 border-neutral-200",
  IN_PROGRESS: "bg-amber-100 text-amber-800 border-amber-200",
  COMPLETED: "bg-green-100 text-green-800 border-green-200",
};

/** Chart fills for the same statuses (grey / amber / green). */
export const STATUS_FILLS: Record<TaskStatus, string> = {
  NOT_STARTED: "#a3a3a3",
  IN_PROGRESS: "#eda100",
  COMPLETED: "#16a34a",
};

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium", STATUS_STYLES[status])}>
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

export type Resource = { id: string; name: string; email: string | null; active: boolean; _count?: { logs: number } };
