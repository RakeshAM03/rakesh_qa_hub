import { z } from "zod";

export const ISSUE_SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
export const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
export const OPEN_STATUSES: IssueStatus[] = ["OPEN", "IN_PROGRESS"];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const teamSchema = z.object({
  name: z.string().trim().min(1, "Team name is required").max(80, "At most 80 characters"),
});

export const featureSchema = z.object({
  name: z.string().trim().min(1, "Feature name is required").max(200, "At most 200 characters"),
  teamId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null),
});
export const featurePatchSchema = featureSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

const issueFields = {
  title: z.string().trim().min(1, "Title is required").max(300),
  description: optionalText(10_000),
  severity: z.enum(ISSUE_SEVERITIES),
  status: z.enum(ISSUE_STATUSES),
  isValid: z.boolean(),
  reporter: optionalText(80),
  assignee: optionalText(80),
};

export const issueSchema = z.object({
  ...issueFields,
  severity: issueFields.severity.default("P2"),
  status: issueFields.status.default("OPEN"),
  isValid: issueFields.isValid.default(true),
});
/** No defaults here: a patch must only contain what the user changed. */
export const issuePatchSchema = z
  .object(issueFields)
  .partial()
  .extend({ actor: optionalText(80) })
  .refine((v) => Object.keys(v).some((k) => k !== "actor"), "Nothing to update");
export const issueCreateSchema = issueSchema.extend({ actor: optionalText(80) });
