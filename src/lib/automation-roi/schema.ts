import { z } from "zod";

const nonNeg = z.number().min(0).max(1_000_000);

const base = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  ciSuiteId: z.string().nullable().optional(),
  totalTests: z.number().int().min(0).max(1_000_000),
  automatedTests: z.number().int().min(0).max(1_000_000),
  manualMinutesPerTest: nonNeg,
  automatedSecondsPerTest: nonNeg.nullable().optional(),
  runsPerMonth: nonNeg.nullable().optional(),
  buildHours: nonNeg,
  maintenanceHoursPerMonth: nonNeg,
  hourlyCost: nonNeg.nullable().optional(),
});

const automatedLeTotal = (v: { automatedTests?: number; totalTests?: number }) => v.automatedTests === undefined || v.totalTests === undefined || v.automatedTests <= v.totalTests;

export const projectSchema = base.refine(automatedLeTotal, { message: "Automated test cases can't exceed the total", path: ["automatedTests"] });
export const projectPatchSchema = base.partial().refine(automatedLeTotal, { message: "Automated test cases can't exceed the total", path: ["automatedTests"] });

export const snapshotSchema = z
  .object({ totalTests: z.number().int().min(0).optional(), automatedTests: z.number().int().min(0).optional() })
  .refine(automatedLeTotal, { message: "Automated test cases can't exceed the total", path: ["automatedTests"] });

export const settingsSchema = z.object({ currency: z.string().trim().min(1).max(5) });
