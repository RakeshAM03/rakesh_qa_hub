import { z } from "zod";

export const CI_COLORS = ["blue", "orange", "teal", "purple", "light blue", "green", "red", "grey"] as const;
export type CiColor = (typeof CI_COLORS)[number];

export const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

export const dispatchInputSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, "Key is required")
      .max(100)
      .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - or _"),
    label: z.string().trim().max(100).optional().default(""),
    type: z.enum(["text", "choice"]),
    options: z.array(z.string().trim().min(1).max(100)).max(30).optional().default([]),
    default: z.string().trim().max(200).optional().default(""),
  })
  .refine((i) => i.type !== "choice" || i.options.length > 0, {
    message: "A choice input needs at least one option",
    path: ["options"],
  })
  .refine((i) => i.type !== "choice" || !i.default || i.options.includes(i.default), {
    message: "The default must be one of the options",
    path: ["default"],
  });
export type DispatchInput = z.infer<typeof dispatchInputSchema>;

export const suiteFields = {
  name: z.string().trim().min(1, "Name is required").max(100),
  repo: z.string().trim().regex(REPO_RE, "Use the GitHub repo as owner/name"),
  workflowFile: z
    .string()
    .trim()
    .min(1, "Workflow file is required")
    .max(200)
    .regex(/^[A-Za-z0-9._/-]+\.ya?ml$/, "Use the workflow file name, e.g. regression.yml"),
  color: z.enum(CI_COLORS),
  dispatchInputs: z
    .array(dispatchInputSchema)
    .max(10, "At most 10 inputs")
    .refine((list) => new Set(list.map((i) => i.key)).size === list.length, "Input keys must be unique")
    .default([]),
};

export const suiteSchema = z.object(suiteFields);
/** Patches carry the full editable set (the edit modal always sends every field). */
export const suitePatchSchema = suiteSchema;

export const reorderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

export const dispatchSchema = z.object({
  ref: z.string().trim().max(200).optional(),
  inputs: z.record(z.string().regex(/^[A-Za-z0-9_-]+$/), z.string().max(1000)).default({}),
});

/** Parses the JSON column back into inputs, dropping anything malformed. */
export function readDispatchInputs(value: unknown): DispatchInput[] {
  const parsed = z.array(dispatchInputSchema).safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}
