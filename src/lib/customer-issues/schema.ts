/** Request schemas for the Customer Issue RCA API. */

import { z } from "zod";

import { SEVERITIES } from "@/config/customer-issues";

const LIST_KINDS = ["PRODUCT", "DISPOSITION", "RCA_CATEGORY", "RCA_SUBCATEGORY", "CAUGHT_AT", "WHY_ESCAPED", "DETECTED_BY", "SCOPE", "IMPACT", "OWNER_TEAM"] as const;
const catchable = z.enum(["YES", "NO", "PARTIAL"]);
const id = z.string().trim().min(1).max(100);
const text = (max: number) => z.string().max(max).nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const issueKey = z
  .string()
  .trim()
  .min(1, "Issue key is required")
  .max(50)
  .regex(/^[A-Za-z][A-Za-z0-9_]*-\d+$/, "Use an issue key like DEMO-101");

export const listItemCreateSchema = z.object({
  list: z.enum(LIST_KINDS),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: text(1000),
  parentId: id.nullable().optional(),
  defaultCatchable: catchable.nullable().optional(),
  defaultOwnerId: id.nullable().optional(),
});

export const listItemPatchSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  description: text(1000),
  defaultCatchable: catchable.nullable().optional(),
  defaultOwnerId: id.nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
});

/** Hub-owned classification (all optional on PATCH). */
export const classificationSchema = z.object({
  productId: id.nullable().optional(),
  module: text(200),
  releasedIn: text(100),
  severity: z.enum(SEVERITIES).nullable().optional(),
  dispositionId: id.nullable().optional(),
  dispositionNote: text(5000),
  linkedIssueKey: z.string().trim().max(50).nullable().optional(),
  rcaCategoryId: id.nullable().optional(),
  rcaSubcategoryId: id.nullable().optional(),
  caughtAtId: id.nullable().optional(),
  catchable: catchable.nullable().optional(),
  whyEscapedId: id.nullable().optional(),
  detectedById: id.nullable().optional(),
  scopeId: id.nullable().optional(),
  impactId: id.nullable().optional(),
  recurring: z.boolean().optional(),
  ownerTeamId: id.nullable().optional(),
  rca: text(50_000),
  prevention: text(50_000),
  preventionStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE"]).optional(),
  qaOwner: text(100),
  comments: text(50_000),
  regressionRequired: z.boolean().optional(),
});

/** Tracker fields a person can edit (for Jira issues they're refreshed by the next sync). */
export const trackerSchema = z.object({
  issueUrl: z.string().trim().max(2000).nullable().optional().refine((v) => !v || /^https?:\/\//i.test(v), "Issue URL must be an http(s) link"),
  summary: z.string().trim().min(1, "Summary is required").max(500).optional(),
  description: text(100_000),
  status: z.enum(["OPEN", "IN_PROGRESS", "FIXED", "CLOSED"]).optional(),
  createdDate: isoDate.optional(),
  resolvedDate: isoDate.nullable().optional(),
  fixVersion: text(100),
});

export const issueCreateSchema = classificationSchema.extend({
  ...trackerSchema.shape,
  issueKey,
  summary: z.string().trim().min(1, "Summary is required").max(500),
  createdDate: isoDate,
});

export const issuePatchSchema = classificationSchema.extend({ ...trackerSchema.shape, actor: text(100) });

export const bulkEditSchema = z.object({
  ids: z.array(id).min(1).max(500),
  set: classificationSchema.pick({ dispositionId: true, rcaCategoryId: true, productId: true, catchable: true, ownerTeamId: true }),
});

export const importSchema = z.object({
  rows: z.array(issueCreateSchema.extend({ source: z.enum(["CSV", "MANUAL"]).optional() })).min(1).max(2000),
});

export { LIST_KINDS };

export const jiraSettingsSchema = z.object({
  jql: z.string().max(5000).optional(),
  productMapping: z
    .array(z.object({ kind: z.enum(["project", "component"]), value: z.string().trim().min(1, "Enter a project key or component").max(200), productId: id }))
    .max(200)
    .optional(),
  scheduleEnabled: z.boolean().optional(),
  writeBackEnabled: z.boolean().optional(),
});
