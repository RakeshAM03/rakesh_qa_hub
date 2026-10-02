import { describe, expect, it } from "vitest";

import { addDaysIso, isoToDdMmYyyy, isoToLong, isoToLocalDate, toLocalIso } from "./dates";

describe("date helpers", () => {
  it("round-trips local dates", () => {
    expect(toLocalIso(isoToLocalDate("2026-10-02"))).toBe("2026-10-02");
  });
  it("adds days across month ends", () => {
    expect(addDaysIso("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("formats", () => {
    expect(isoToDdMmYyyy("2026-10-02")).toBe("02/10/2026");
    expect(isoToLong("2026-10-02")).toBe("Oct 2, 2026");
  });
});
