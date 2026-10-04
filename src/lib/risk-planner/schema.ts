import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const score = z.number().int().min(1).max(5);
const changeSize = z.enum(["NONE", "SMALL", "MEDIUM", "LARGE", "NEW_FEATURE"]);

export const planCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  availableHours: z.number().min(0).max(10_000),
  testers: z.number().int().min(0).max(1000).nullable().optional(),
  notes: z.string().trim().max(5000).optional(),
  releaseId: z.string().nullable().optional(),
  start: z.discriminatedUnion("from", [
    z.object({ from: z.literal("blank") }),
    z.object({ from: z.literal("duplicate"), planId: z.string() }),
    z.object({ from: z.literal("features"), featurePageIds: z.array(z.string()).min(1).max(200) }),
  ]),
});

export const planPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  availableHours: z.number().min(0).max(10_000).optional(),
  testers: z.number().int().min(0).max(1000).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  releaseId: z.string().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const areaFields = {
  name: z.string().trim().min(1, "Area name is required").max(200),
  featurePageId: z.string().nullable().optional(),
  changeSize,
  complexity: score,
  defectHistory: score,
  dependencies: score,
  businessImpact: score,
  usageFrequency: score,
  depthOverride: z.string().trim().max(500).nullable().optional(),
  hoursOverride: z.number().min(0).max(10_000).nullable().optional(),
  deferred: z.boolean(),
  deferReason: z.string().trim().max(1000).nullable().optional(),
};

export const areaCreateSchema = z.object({
  planId: z.string(),
  name: areaFields.name,
  featurePageId: areaFields.featurePageId,
  changeSize: changeSize.default("MEDIUM"),
  complexity: score.default(3),
  defectHistory: score.default(3),
  dependencies: score.default(3),
  businessImpact: score.default(3),
  usageFrequency: score.default(3),
});

/** Built without defaults (zod 4 .partial() keeps them). */
export const areaPatchSchema = z
  .object({ ...areaFields, sortOrder: z.number().int() })
  .partial()
  .refine((v) => !v.deferred || (v.deferReason ?? "").trim().length > 0 || v.deferReason === undefined, "A reason is required to defer an area");
