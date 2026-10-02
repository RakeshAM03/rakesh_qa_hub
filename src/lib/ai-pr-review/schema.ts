import { z } from "zod";

import { FLAG_SEVERITIES, FLAG_TYPES } from "./constants";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const flagInputSchema = z.object({
  repo: z.string().trim().min(1, "Repo is required").max(200),
  flagType: z.enum(FLAG_TYPES, { error: "Pick a flag type" }),
  prNumber: z.number().int().positive().max(10_000_000).optional().nullable(),
  filePath: optionalText(500),
  line: z.number().int().positive().max(10_000_000).optional().nullable(),
  detail: z.string().trim().min(1, "Detail is required").max(10_000),
  severity: z.enum(FLAG_SEVERITIES, { error: "Severity must be P0 or P1" }),
  suggestedFix: optionalText(10_000),
});
export type FlagInput = z.infer<typeof flagInputSchema>;

export const saveFlagsSchema = z.object({
  flags: z.array(flagInputSchema).min(1, "No flags to save").max(200, "Save at most 200 flags at a time"),
  loggedBy: z.string().trim().max(60).optional().nullable(),
  source: z.enum(["CLAUDE_OUTPUT", "MANUAL"]),
});

export const flagPatchSchema = flagInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
