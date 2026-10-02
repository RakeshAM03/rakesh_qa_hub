import { describe, expect, it } from "vitest";

import { pageItems, rangeLabel, totalPagesFor } from "./pagination";

describe("pageItems", () => {
  it("lists every page when there are few", () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("adds ellipses around the current page", () => {
    expect(pageItems(1, 20)).toEqual([1, 2, "ellipsis-end", 20]);
    expect(pageItems(10, 20)).toEqual([1, "ellipsis-start", 9, 10, 11, "ellipsis-end", 20]);
    expect(pageItems(20, 20)).toEqual([1, "ellipsis-start", 19, 20]);
  });

  it("skips an ellipsis that would hide nothing", () => {
    expect(pageItems(3, 20)).toEqual([1, 2, 3, 4, "ellipsis-end", 20]);
  });

  it("returns nothing for zero pages", () => {
    expect(pageItems(1, 0)).toEqual([]);
  });
});

describe("rangeLabel", () => {
  it("formats the visible range", () => {
    expect(rangeLabel(1, 25, 197)).toBe("1–25 of 197");
    expect(rangeLabel(8, 25, 197)).toBe("176–197 of 197");
    expect(rangeLabel(1, 25, 0)).toBe("0–0 of 0");
  });
});

describe("totalPagesFor", () => {
  it("is at least one", () => {
    expect(totalPagesFor(0, 10)).toBe(1);
    expect(totalPagesFor(21, 10)).toBe(3);
  });
});
