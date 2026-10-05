import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { analyze, bugFromCluster, classify, clusterMarkdown, normalizeMessage, topAppFrame, verdict } from "./analyze";
import { parseFile, parseInputs, parseJUnit, parsePlainText, parsePlaywright, parseTestNg } from "./parsers";
import { SAMPLE_LOG } from "./sample";

const fixture = (name: string) => readFileSync(join(process.cwd(), "tests/fixtures/failure-analyzer", name), "utf8");

describe("parsers", () => {
  it("parses TestNG results (skips config methods, counts pass/skip)", () => {
    const r = parseTestNg(fixture("testng-results.xml"));
    expect(r.passed).toBe(2);
    expect(r.skipped).toBe(1);
    expect(r.failures.map((f) => f.testName)).toEqual(["appliesCoupon", "opensPaymentPage"]);
    expect(r.failures[0]).toMatchObject({
      className: "com.example.tests.CheckoutTest",
      suite: "Demo Suite",
      durationMs: 2100,
      message: "java.lang.AssertionError: expected [Total: $90.00] but found [Total: $100.00]",
      source: "testng",
    });
    expect(r.failures[1].stackTrace).toContain("PaymentPage.open(PaymentPage.java:22)");
  });

  it("parses JUnit/Surefire XML (failure and error, skipped)", () => {
    const r = parseJUnit(fixture("TEST-com.example.tests.LoginTest.xml"));
    expect(r.passed).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.failures).toHaveLength(2);
    expect(r.failures[0].message).toBe("org.openqa.selenium.TimeoutException: Timeout 10000ms exceeded waiting for .error-banner");
    expect(r.failures[1].message).toMatch(/^java\.lang\.NullPointerException: Cannot invoke "String\.trim\(\)"/);
    expect(r.failures[1].durationMs).toBe(900);
  });

  it("parses Playwright JSON (nested suites, strips ANSI, counts pass/skip)", () => {
    const r = parsePlaywright(fixture("results.json"));
    expect(r.passed).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.failures.map((f) => f.testName)).toEqual(["Search › shows suggestions [chromium]", "Search › loads results page [chromium]"]);
    expect(r.failures[0].message).toMatch(/^Error: Timed out 5000ms waiting for expect\(locator\)\.toHaveText/);
    expect(r.failures[0].message).not.toContain("\u001b");
  });

  it("splits plain Selenium console output into failures with test names", () => {
    const r = parsePlainText(fixture("selenium-console.log"));
    expect(r.failures.map((f) => f.testName)).toEqual([
      "updatesDisplayName",
      "updatesAvatar",
      "savesPreferences",
      "showsOrderHistory",
      "loadsProfileApi",
      "opensSettings",
    ]);
    expect(r.failures[0].message).not.toMatch(/Session info|For documentation/);
    expect(r.failures[0].stackTrace).toContain("ProfilePage.setName");
  });

  it("finds test names in stack frames and handles Playwright list output", () => {
    const java = parsePlainText(`java.lang.IllegalStateException: boom\n\tat com.example.tests.CartTest.emptiesCart(CartTest.java:9)`);
    expect(java.failures[0]).toMatchObject({ testName: "emptiesCart", className: "com.example.tests.CartTest" });
    const pw = parsePlainText(`  ✘  2 [chromium] › cart.spec.ts:12:5 › Cart › removes item (3.1s)\n    Error: expect(received).toBe(expected)\n    at /repo/tests/cart.spec.ts:20:9`);
    expect(pw.failures[0].testName).toBe("[chromium] › cart.spec.ts:12:5 › Cart › removes item");
  });

  it("picks the parser by content and enforces limits", () => {
    expect(parseFile({ name: "a.xml", content: fixture("testng-results.xml") }).sources).toEqual(["testng"]);
    expect(parseFile({ name: "b.xml", content: fixture("TEST-com.example.tests.LoginTest.xml") }).sources).toEqual(["junit"]);
    expect(parseFile({ name: "c.json", content: fixture("results.json") }).sources).toEqual(["playwright"]);
    const merged = parseInputs([
      { name: "a.xml", content: fixture("testng-results.xml") },
      { name: "b.xml", content: fixture("TEST-com.example.tests.LoginTest.xml") },
      { name: "bad.json", content: "{nope" },
    ]);
    expect(merged.failures).toHaveLength(4);
    expect(merged.passed).toBe(3);
    expect(merged.warnings[0]).toMatch(/^bad\.json/);
    expect(() => parseInputs([{ name: "big.log", content: "x".repeat(5 * 1024 * 1024 + 1) }])).toThrow(/5 MB/);
    const many = Array.from({ length: 2001 }, (_, i) => `FAILED: t${i}\njava.lang.AssertionError: x\n\tat a.B.c(B.java:1)\n`).join("\n");
    expect(() => parseInputs([{ name: "many.log", content: many }])).toThrow(/limit is 2000/);
  });
});

describe("classification rules", () => {
  const c = (message: string, stackTrace = "") => classify({ message, stackTrace });
  it.each([
    ["org.openqa.selenium.NoSuchElementException: no such element", "locator"],
    ["org.openqa.selenium.InvalidSelectorException: invalid selector", "locator"],
    ["Error: strict mode violation: getByRole('button') resolved to 2 elements", "locator"],
    ["TimeoutError: locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator('#go')", "locator"],
    ["org.openqa.selenium.TimeoutException: Expected condition failed", "timing"],
    ["org.openqa.selenium.StaleElementReferenceException: stale element reference", "timing"],
    ["org.openqa.selenium.ElementClickInterceptedException: element click intercepted", "timing"],
    ["org.openqa.selenium.ElementNotInteractableException: element not interactable", "timing"],
    ["java.lang.AssertionError: expected [3] but found [2]", "assertion"],
    ["Error: expect(received).toBe(expected)\n\nExpected: 3\nReceived: 2", "assertion"],
    ["Error: Timed out 5000ms waiting for expect(locator).toHaveText(expected)", "assertion"],
    ["java.lang.NullPointerException: user is null", "data"],
    ["java.lang.IllegalArgumentException: no such user: demo", "data"],
    ["ERROR: duplicate key value violates unique constraint", "data"],
    ["java.io.FileNotFoundException: users.csv", "data"],
    ["org.openqa.selenium.SessionNotCreatedException: Could not start a new session", "environment"],
    ["org.openqa.selenium.WebDriverException: unknown error: cannot find Chrome binary", "environment"],
    ["Error: page.goto: net::ERR_CONNECTION_REFUSED at https://x", "environment"],
    ["Error: connect ECONNREFUSED 127.0.0.1:8080", "environment"],
    ["Request failed: 503 Service Unavailable", "environment"],
    ["java.lang.OutOfMemoryError: Java heap space", "environment"],
    ["java.lang.AssertionError: 1 expectation failed.\nExpected status code <200> but was <500>.", "api"],
    ["Error: API returned 500 Internal Server Error", "api"],
    ["HTTP 404 for GET /api/orders", "api"],
    ["Something odd happened", "unknown"],
  ])("%s → %s", (message, expected) => expect(c(message)).toBe(expected));
});

describe("normalisation and clustering", () => {
  it("strips numbers, ids, quoted values, timestamps and addresses", () => {
    expect(normalizeMessage(`Unable to locate element: {"method":"css selector","selector":"#pay-now"}`)).toBe("Unable to locate element: {<v>}");
    expect(normalizeMessage("expected [3] but found [2] at 2026-10-04T10:00:00Z")).toBe("expected [<n>] but found [<n>] at <ts>");
    expect(normalizeMessage("Object@1a2b3c4d is null (0x7ffee3)")).toBe("Object@<addr> is null (<addr>)");
    expect(normalizeMessage("user 'demo.user' 550e8400-e29b-41d4-a716-446655440000")).toBe('user "<v>" <id>');
  });

  it("finds the top application frame without line numbers", () => {
    expect(topAppFrame("at org.openqa.selenium.remote.RemoteWebDriver.findElement(RemoteWebDriver.java:350)\nat com.example.pages.ProfilePage.setName(ProfilePage.java:31)")).toBe(
      "com.example.pages.ProfilePage.setName(ProfilePage.java)",
    );
    expect(topAppFrame("Error: x\n    at /home/runner/work/shop/tests/search.spec.ts:18:40")).toBe("search.spec.ts");
    expect(topAppFrame("at java.base/jdk.internal.Foo.bar(Foo.java:1)")).toBe("");
  });

  it("clusters the sample log: same locator failure from one page method groups together", () => {
    const { failures } = parsePlainText(SAMPLE_LOG);
    const a = analyze(failures);
    expect(a.total).toBe(6);
    expect(a.categoryCounts).toMatchObject({ locator: 2, timing: 1, assertion: 1, api: 1, environment: 1, data: 0, unknown: 0 });
    const locator = a.categories.find((c) => c.category === "locator")!;
    expect(locator.clusters).toHaveLength(1);
    expect(locator.clusters[0]).toMatchObject({ count: 2, tests: ["ProfileTest.updatesDisplayName", "ProfileTest.updatesAvatar"] });
    expect(a.categories[0].category).toBe("locator"); // sorted by count
    expect(a.verdict).toBe("50% of failures look like automation issues; 2 clusters look like product bugs; 1 is an environment problem.");
    // signatures are stable
    expect(analyze(failures).categories[0].clusters[0].signature).toBe(locator.clusters[0].signature);
  });

  it("writes Markdown and a Bug Formatter bug for a cluster", () => {
    const a = analyze(parsePlainText(SAMPLE_LOG).failures);
    const api = a.categories.find((c) => c.category === "api")!.clusters[0];
    expect(clusterMarkdown(api)).toContain("### API / backend error — 1 failure");
    expect(clusterMarkdown(api)).toContain("- ProfileTest.loadsProfileApi");
    const bug = bugFromCluster(api);
    expect(bug.title).toBe("1 expectation failed.");
    expect(bug.actual).toBe("java.lang.AssertionError: 1 expectation failed.");
    expect(bug.notes).toContain("Top frames: com.example.tests.ProfileTest.loadsProfileApi(ProfileTest.java:88)");
    expect(bug.steps[0]).toBe("Run the automated test: ProfileTest.loadsProfileApi");
  });

  it("verdict handles no failures", () => {
    expect(verdict(0, { locator: 0, timing: 0, assertion: 0, data: 0, environment: 0, api: 0, unknown: 0 }, [])).toMatch(/No failures/);
  });
});

describe("connection-level errors are Environment problems", () => {
  const FIXTURES: [file: string, mentions: RegExp][] = [
    ["java-connection-refused.log", /ConnectException: Connection refused/],
    ["restassured-connect-exception.log", /ConnectException/],
    ["socket-timeout.log", /SocketTimeoutException: Read timed out/],
    ["unknown-host.log", /UnknownHostException/],
    ["node-econnrefused.log", /connect ECONNREFUSED/],
    ["node-econnreset.log", /ECONNRESET/],
    ["node-etimedout.log", /ETIMEDOUT/],
    ["playwright-err-connection-refused.log", /net::ERR_CONNECTION_REFUSED/],
    ["selenium-err-connection-refused.log", /net::ERR_CONNECTION_REFUSED/],
  ];

  it.each(FIXTURES)("%s → one Environment failure", (file, mentions) => {
    const parsed = parseFile({ name: file, content: fixture(`connection-errors/${file}`) });
    expect(parsed.failures).toHaveLength(1);
    const [f] = parsed.failures;
    expect(`${f.message}\n${f.stackTrace}`).toMatch(mentions);
    expect(classify(f)).toBe("environment");
    const a = analyze(parsed.failures);
    expect(a.categoryCounts.environment).toBe(1);
    expect(a.verdict).toContain("1 is an environment problem");
  });

  it.each([
    "java.net.ConnectException: Connection refused",
    "java.net.ConnectException: Connection timed out: connect",
    "java.net.SocketTimeoutException: connect timed out",
    "java.net.SocketException: Connection reset",
    "org.apache.http.conn.HttpHostConnectException: Connect to qa.example.com:443 failed: Connection refused",
    "java.net.UnknownHostException: qa.example.com",
    "Error: connect ECONNREFUSED 127.0.0.1:3000",
    "Error: read ECONNRESET",
    "Error: connect ETIMEDOUT 203.0.113.10:443",
    "Error: page.goto: net::ERR_CONNECTION_REFUSED at https://qa.example.com",
  ])("%s → environment (not timing, API or unknown)", (message) => {
    expect(classify({ message, stackTrace: "" })).toBe("environment");
  });

  it("keeps ordinary timeouts and assertions in their own categories", () => {
    expect(classify({ message: "org.openqa.selenium.TimeoutException: Expected condition failed", stackTrace: "" })).toBe("timing");
    expect(classify({ message: "java.lang.AssertionError: expected [connected] but found [offline]", stackTrace: "" })).toBe("assertion");
  });
});
