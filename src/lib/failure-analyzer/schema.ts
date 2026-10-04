import { z } from "zod";

import { CATEGORY_ORDER, type CategoryId } from "./rules";

const category = z.enum(CATEGORY_ORDER as [CategoryId, ...CategoryId[]]);

export const clusterSchema = z.object({
  signature: z.string().min(1).max(100),
  category,
  message: z.string().max(1000),
  normalized: z.string().max(1000),
  frame: z.string().max(1000),
  tests: z.array(z.string().max(500)).max(2000),
  count: z.number().int().min(1),
  sample: z.object({
    testName: z.string().max(500),
    message: z.string().max(4000),
    stack: z.array(z.string().max(1000)).max(40),
  }),
});

export const analysisSchema = z.object({
  name: z.string().trim().max(200).optional(),
  source: z.string().trim().min(1).max(100),
  totalFailures: z.number().int().min(0).max(2000),
  passed: z.number().int().min(0).nullable().optional(),
  skipped: z.number().int().min(0).nullable().optional(),
  categoryCounts: z.record(category, z.number().int().min(0)),
  clusters: z.array(clusterSchema).max(2000),
  createdBy: z.string().trim().max(100).optional(),
});

export const knownIssueSchema = z.object({
  signature: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1, "Label is required").max(200),
  notes: z.string().trim().max(2000).optional(),
});
