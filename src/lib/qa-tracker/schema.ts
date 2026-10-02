import { z } from "zod";

export const TASK_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
};

/** "YYYY-MM-DD", a real calendar date. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && toIsoDate(fromIsoDate(v)) === v, "Not a valid date");

/** Stored as a UTC midnight DATE so the calendar day never shifts with time zones. */
export const fromIsoDate = (v: string) => new Date(`${v}T00:00:00Z`);
export const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

export const hours = z
  .number({ error: "Required" })
  .gt(0, "Must be more than 0")
  .max(24, "At most 24 hours")
  .refine((v) => Number.isInteger(v * 4), "Use steps of 0.25");

export const taskSchema = z.object({
  description: z.string().trim().min(1, "Required").max(1000),
  status: z.enum(TASK_STATUSES),
  hours,
});

export const logEntrySchema = z.object({
  resourceId: z.string().min(1, "Select a resource"),
  date: isoDate,
  tasks: z.array(taskSchema).min(1, "Add at least one task").max(30),
});

export const logPatchSchema = z
  .object({ status: z.enum(TASK_STATUSES), hours, description: taskSchema.shape.description })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const resourceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || z.email().safeParse(v).success, "Not a valid email"),
});

export const resourcePatchSchema = resourceSchema
  .extend({ active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
