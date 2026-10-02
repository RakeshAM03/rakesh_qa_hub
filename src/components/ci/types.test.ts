import { describe, expect, it } from "vitest";

import { formatDuration } from "./types";

describe("formatDuration", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(754)).toBe("12m 34s");
    expect(formatDuration(3720)).toBe("1h 02m");
    expect(formatDuration(null)).toBe("—");
  });
});
