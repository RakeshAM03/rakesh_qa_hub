import { describe, expect, it } from "vitest";

import { diffIssue } from "./events";
import { featureSchema, issuePatchSchema, issueSchema } from "./schema";
import { percentValid, validTone } from "./stats";

describe("percentValid / validTone", () => {
  it("rounds and picks the pill colour", () => {
    expect(percentValid(19, 20)).toBe(95);
    expect(validTone(percentValid(19, 20))).toBe("green");
    expect(validTone(percentValid(11, 12))).toBe("amber"); // 92%
    expect(validTone(85)).toBe("amber");
    expect(validTone(84)).toBe("red");
    expect(percentValid(0, 0)).toBeNull();
    expect(validTone(null)).toBe("none");
  });
});

describe("schemas", () => {
  it("defaults issue severity, status and validity", () => {
    expect(issueSchema.parse({ title: "Broken" })).toMatchObject({ severity: "P2", status: "OPEN", isValid: true });
  });
  it("treats an empty team as no team", () => {
    expect(featureSchema.parse({ name: "Checkout", teamId: "" }).teamId).toBeNull();
  });
  it("rejects a patch with only the actor", () => {
    expect(issuePatchSchema.safeParse({ actor: "QA" }).success).toBe(false);
    expect(issuePatchSchema.safeParse({ status: "CLOSED", actor: "QA" }).success).toBe(true);
  });
});

describe("diffIssue", () => {
  const before = {
    title: "Login broken",
    description: "Long text",
    severity: "P1",
    status: "OPEN" as const,
    isValid: true,
    reporter: "A",
    assignee: null,
  };

  it("emits status and validity events", () => {
    expect(diffIssue(before, { status: "RESOLVED", isValid: false })).toEqual([
      { type: "STATUS_CHANGED", field: "status", fromValue: "OPEN", toValue: "RESOLVED" },
      { type: "MARKED_INVALID", field: "isValid" },
    ]);
  });

  it("emits one UPDATED event per changed field, without copying descriptions", () => {
    expect(diffIssue(before, { assignee: "B", description: "New text", severity: "P1", title: "Login broken" })).toEqual([
      { type: "UPDATED", field: "description", fromValue: null, toValue: null },
      { type: "UPDATED", field: "assignee", fromValue: null, toValue: "B" },
    ]);
  });

  it("emits nothing when nothing changed", () => {
    expect(diffIssue(before, { status: "OPEN", isValid: true })).toEqual([]);
  });
});
