import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const actor = z.string().trim().max(100).optional();
export const GATE_TYPES = ["MANUAL", "CI_GREEN", "NO_P0", "NO_P1", "VALID_RATE", "NO_P0_FLAGS", "CUSTOMER_REGRESSION"] as const;
export const GATE_STATUSES = ["PENDING", "PASS", "FAIL", "NA"] as const;

const gateConfig = z.record(z.string(), z.number().min(0).max(100_000)).nullable().optional();

export const releaseCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  version: z.string().trim().max(50).optional(),
  targetDate: isoDate.nullable().optional(),
  owner: z.string().trim().max(100).optional(),
  description: z.string().trim().max(5000).optional(),
  templateId: z.string().nullable().optional(),
  linkedCiSuiteIds: z.array(z.string()).max(50).default([]),
  linkedFeaturePageIds: z.array(z.string()).max(200).default([]),
  linkedRepos: z.array(z.string().max(200)).max(50).default([]),
  actor,
});

export const releasePatchSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  version: z.string().trim().max(50).nullable().optional(),
  targetDate: isoDate.nullable().optional(),
  owner: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["PLANNED", "IN_TESTING"]).optional(),
  linkedCiSuiteIds: z.array(z.string()).max(50).optional(),
  linkedFeaturePageIds: z.array(z.string()).max(200).optional(),
  linkedRepos: z.array(z.string().max(200)).max(50).optional(),
  /** Mark as released (needs a Go / Go-with-issues decision). */
  releasedAt: isoDate.optional(),
  actor,
});

export const gateCreateSchema = z.object({
  section: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1, "Title is required").max(300),
  type: z.enum(GATE_TYPES).default("MANUAL"),
  isBlocker: z.boolean().default(false),
  weight: z.number().int().min(0).max(10).default(1),
  config: gateConfig,
  actor,
});

export const gateReorderSchema = z.object({ order: z.array(z.string()).max(500), actor });

export const gatePatchSchema = z.object({
  status: z.enum(GATE_STATUSES).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  section: z.string().trim().min(1).max(100).optional(),
  isBlocker: z.boolean().optional(),
  weight: z.number().int().min(0).max(10).optional(),
  owner: z.string().trim().max(100).nullable().optional(),
  evidenceUrl: z.string().trim().max(2000).nullable().optional().refine((v) => !v || /^https?:\/\//i.test(v), "Evidence must be an http(s) link"),
  note: z.string().trim().max(2000).nullable().optional(),
  config: gateConfig,
  /** Override an auto gate's computed result (null clears it). */
  override: z.object({ status: z.enum(GATE_STATUSES), note: z.string().trim().min(1, "A note is required to override").max(1000) }).nullable().optional(),
  actor,
});

export const signoffSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), role: z.string().trim().min(1, "Role is required").max(100), actor }),
  z.object({
    action: z.literal("sign"),
    id: z.string(),
    name: z.string().trim().min(1, "Enter your name to sign").max(100),
    decision: z.enum(["APPROVE", "REJECT", "PENDING"]),
    comment: z.string().trim().max(2000).optional(),
  }),
]);

export const decisionSchema = z.object({
  decision: z.enum(["GO", "NO_GO", "GO_WITH_ISSUES"]),
  comment: z.string().trim().min(1, "A comment is required").max(5000),
  knownIssues: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  actor,
});

const templateGate = z.object({
  title: z.string().trim().min(1).max(300),
  type: z.enum(GATE_TYPES),
  isBlocker: z.boolean(),
  weight: z.number().int().min(0).max(10),
  config: z.record(z.string(), z.number()).optional(),
});
export const templateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  sections: z.array(z.object({ name: z.string().trim().min(1).max(100), gates: z.array(templateGate).max(100) })).max(30),
});
