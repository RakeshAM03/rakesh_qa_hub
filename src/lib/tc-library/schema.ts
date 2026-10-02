import { z } from "zod";

import { isPrReference } from "./pr-ref";

export const OUTPUT_MAX_BYTES = 1024 * 1024;
export const IMPORT_MAX_ENTRIES = 500;
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

const byteLength = (s: string) => new TextEncoder().encode(s).length;

export const entryFields = {
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be 200 characters or fewer"),
  prReference: z
    .string()
    .trim()
    .max(300)
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || isPrReference(v), "Use `repo #number` or a GitHub pull request URL"),
  output: z
    .string()
    .refine((v) => v.trim().length > 0, "Output is required")
    .refine((v) => byteLength(v) <= OUTPUT_MAX_BYTES, "Output is larger than 1 MB"),
};

export const entryInputSchema = z.object({
  ...entryFields,
  createdBy: z.string().trim().max(60).optional().nullable(),
});

export const entryPatchSchema = z
  .object(entryFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

/** One entry in an import file. Unknown keys are ignored. */
export const importEntrySchema = z.object(entryFields);

export const importRequestSchema = z.object({
  entries: z.array(importEntrySchema).min(1, "No entries to import").max(IMPORT_MAX_ENTRIES),
  createdBy: z.string().trim().max(60).optional().nullable(),
});

export type EntryInput = z.infer<typeof entryInputSchema>;
export type ImportEntry = z.infer<typeof importEntrySchema>;
