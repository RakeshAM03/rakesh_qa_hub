import { describe, expect, it } from "vitest";

import { clientIp, createLimiter, RULES, rulesFor, waitText } from "./rate-limit";

describe("createLimiter", () => {
  it("allows up to the limit, then asks to wait until the oldest hit expires", () => {
    let t = 0;
    const check = createLimiter(() => t);
    const rule = { name: "t", limit: 3, windowMs: 1000 };
    expect([check(rule, "a"), check(rule, "a"), check(rule, "a")]).toEqual([null, null, null]);
    t = 400;
    expect(check(rule, "a")).toBe(1); // oldest at 0 expires at 1000 → 0.6s, rounded up
    expect(check(rule, "b")).toBeNull(); // other clients are separate
    t = 1001;
    expect(check(rule, "a")).toBeNull();
  });

  it("does not count rejected requests", () => {
    let t = 0;
    const check = createLimiter(() => t);
    const rule = { name: "t", limit: 1, windowMs: 1000 };
    check(rule, "a");
    t = 500;
    check(rule, "a");
    t = 1000;
    expect(check(rule, "a")).toBeNull();
  });
});

describe("rulesFor", () => {
  it("limits writes, dispatches and root-cause calls", () => {
    expect(rulesFor("POST", "/api/tc-library")).toEqual([RULES.write]);
    expect(rulesFor("PATCH", "/api/bug-tracker/issues/x")).toEqual([RULES.write]);
    expect(rulesFor("POST", "/api/ci/suites/abc/dispatch")).toEqual([RULES.write, RULES.dispatch]);
    expect(rulesFor("GET", "/api/ci/suites/abc/runs/123/rca")).toEqual([RULES.rca]);
    expect(rulesFor("GET", "/api/tc-library")).toEqual([]);
    expect(rulesFor("DELETE", "/api/tc-library/x")).toEqual([]);
    expect(rulesFor("POST", "/bug-tracker")).toEqual([]);
  });

  it("gives AI and outbound-send routes their own limit instead of the write limit", () => {
    expect(rulesFor("POST", "/api/locator-helper/ai")).toEqual([RULES.locatorAi]);
    expect(rulesFor("POST", "/api/selenium-to-playwright/ai")).toEqual([RULES.converterAi]);
    expect(rulesFor("POST", "/api/failure-analyzer/ai")).toEqual([RULES.failureAi]);
    expect(rulesFor("POST", "/api/api-playground/send")).toEqual([RULES.apiSend]);
    expect(RULES.locatorAi.limit).toBe(20);
    expect(RULES.converterAi.limit).toBe(10);
    expect(RULES.apiSend).toMatchObject({ limit: 30, windowMs: 600_000 });
  });
});

describe("helpers", () => {
  it("reads the first forwarded IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers())).toBe("unknown");
  });
  it("formats waits", () => {
    expect(waitText(30)).toBe("30 seconds");
    expect(waitText(600)).toBe("10 minutes");
  });
});
