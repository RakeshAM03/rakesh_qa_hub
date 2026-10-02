import { describe, expect, it } from "vitest";

import { computeAnalytics } from "./analytics";
import { fromIsoDate, logEntrySchema, resourceSchema } from "./schema";

describe("logEntrySchema", () => {
  const base = { resourceId: "r1", date: "2026-10-02", tasks: [{ description: "Regression", status: "COMPLETED", hours: 1.5 }] };

  it("accepts a valid entry", () => {
    expect(logEntrySchema.safeParse(base).success).toBe(true);
  });

  it("rejects zero hours, non-quarter steps and empty descriptions", () => {
    const bad = (task: object) =>
      logEntrySchema.safeParse({ ...base, tasks: [{ ...base.tasks[0], ...task }] }).success;
    expect(bad({ hours: 0 })).toBe(false);
    expect(bad({ hours: 0.3 })).toBe(false);
    expect(bad({ hours: 0.25 })).toBe(true);
    expect(bad({ description: "  " })).toBe(false);
  });

  it("rejects impossible dates", () => {
    expect(logEntrySchema.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false);
    expect(logEntrySchema.safeParse({ ...base, date: "02/10/2026" }).success).toBe(false);
  });
});

describe("resourceSchema", () => {
  it("treats an empty email as none and rejects bad ones", () => {
    expect(resourceSchema.parse({ name: "Demo Resource 1", email: "" }).email).toBeNull();
    expect(resourceSchema.safeParse({ name: "A", email: "nope" }).success).toBe(false);
  });
});

describe("computeAnalytics", () => {
  it("aggregates totals, resources, statuses and a zero-filled daily series", () => {
    const logs = [
      { date: fromIsoDate("2026-10-01"), hours: 2, status: "COMPLETED" as const, resourceId: "a" },
      { date: fromIsoDate("2026-10-01"), hours: 1.5, status: "IN_PROGRESS" as const, resourceId: "b" },
      { date: fromIsoDate("2026-10-03"), hours: 0.5, status: "COMPLETED" as const, resourceId: "a" },
    ];
    const result = computeAnalytics(
      logs,
      [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
      fromIsoDate("2026-10-01"),
      fromIsoDate("2026-10-03"),
    );
    expect(result.totals).toEqual({ hours: 4, tasks: 3, loggedDays: 2, avgHoursPerDay: 2 });
    expect(result.byResource).toEqual([
      { id: "a", name: "A", hours: 2.5 },
      { id: "b", name: "B", hours: 1.5 },
    ]);
    expect(result.byStatus).toEqual([
      { status: "COMPLETED", hours: 2.5, tasks: 2 },
      { status: "IN_PROGRESS", hours: 1.5, tasks: 1 },
      { status: "NOT_STARTED", hours: 0, tasks: 0 },
    ]);
    expect(result.daily).toEqual([
      { date: "2026-10-01", hours: 3.5 },
      { date: "2026-10-02", hours: 0 },
      { date: "2026-10-03", hours: 0.5 },
    ]);
  });
});
