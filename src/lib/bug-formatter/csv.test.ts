import { describe, expect, it } from "vitest";

import { bugCsvTemplate, parseBugCsv } from "./csv";

describe("parseBugCsv", () => {
  it("matches headers case-insensitively and ignores unknown columns", () => {
    const csv = `TITLE,severity,Steps,Expected Result,actual,Environment,Notes,Owner
Broken link,P1,"Open home
Click Help",Help opens,404,https://qa.example.com,none,someone`;
    const { bugs, skipped } = parseBugCsv(csv);
    expect(skipped).toBe(0);
    expect(bugs).toEqual([
      {
        title: "Broken link",
        severity: "P1",
        steps: ["Open home", "Click Help"],
        expected: "Help opens",
        actual: "404",
        environmentUrl: "https://qa.example.com",
        notes: "none",
      },
    ]);
  });

  it("skips rows without a title and counts them", () => {
    const { bugs, skipped } = parseBugCsv("Title,Severity\nA,P0\n,P1\n  ,P2\nB,P3");
    expect(bugs.map((b) => b.title)).toEqual(["A", "B"]);
    expect(skipped).toBe(2);
  });

  it("turns invalid or missing severity into P2", () => {
    const { bugs } = parseBugCsv("Title,Severity\nA,high\nB,\nC,p0\nD,3");
    expect(bugs.map((b) => b.severity)).toEqual(["P2", "P2", "P0", "P3"]);
  });

  it("needs only the Title column", () => {
    const { bugs } = parseBugCsv("Title\nOnly a title");
    expect(bugs[0]).toMatchObject({ title: "Only a title", severity: "P2", steps: [] });
  });

  it("errors when there is no Title column", () => {
    expect(parseBugCsv("Name,Severity\nA,P1").error).toMatch(/Title/);
  });

  it("strips a UTF-8 BOM before the header", () => {
    expect(parseBugCsv("﻿Title\nA").bugs).toHaveLength(1);
  });

  it("round-trips the downloadable template", () => {
    const template = bugCsvTemplate();
    expect(template.split(/\r?\n/)[0]).toBe("Title,Severity,Steps,Expected,Actual,Environment,Notes");
    const { bugs } = parseBugCsv(template);
    expect(bugs).toHaveLength(1);
    expect(bugs[0].steps).toEqual(["Open the app on mobile", "Tap Login"]);
  });
});
