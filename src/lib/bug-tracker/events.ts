import type { IssueStatus } from "./schema";

type IssueFields = {
  title: string;
  description: string | null;
  severity: string;
  status: IssueStatus;
  isValid: boolean;
  reporter: string | null;
  assignee: string | null;
};

export type EventDraft = {
  type: "STATUS_CHANGED" | "MARKED_VALID" | "MARKED_INVALID" | "UPDATED";
  field?: string;
  fromValue?: string | null;
  toValue?: string | null;
};

const TRACKED: (keyof IssueFields)[] = ["title", "description", "severity", "assignee", "reporter"];

/** Activity events for an issue update: status and validity get their own event; other changes one each. */
export function diffIssue(before: IssueFields, patch: Partial<IssueFields>): EventDraft[] {
  const events: EventDraft[] = [];
  if (patch.status !== undefined && patch.status !== before.status) {
    events.push({ type: "STATUS_CHANGED", field: "status", fromValue: before.status, toValue: patch.status });
  }
  if (patch.isValid !== undefined && patch.isValid !== before.isValid) {
    events.push({ type: patch.isValid ? "MARKED_VALID" : "MARKED_INVALID", field: "isValid" });
  }
  for (const field of TRACKED) {
    const next = patch[field];
    if (next === undefined) continue;
    const prev = before[field];
    if ((next ?? null) !== (prev ?? null)) {
      // Long text isn't copied into the feed.
      const short = field !== "description";
      events.push({
        type: "UPDATED",
        field,
        fromValue: short ? (prev as string | null) : null,
        toValue: short ? (next as string | null) : null,
      });
    }
  }
  return events;
}
