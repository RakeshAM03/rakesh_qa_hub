import { expect, test } from "@playwright/test";

import { BasePage } from "./pages/base-page";

const MODULES = [
  { link: "CI Reports", path: "/ci", heading: "CI Reports" },
  { link: "QA Tracker", path: "/qa-tracker", heading: "QA Tracker" },
  { link: "PR QA Session", path: "/pr-qa-session", heading: "PR QA Session" },
  { link: "AI PR Review", path: "/ai-pr-review", heading: "AI PR Review" },
  { link: "TC Library", path: "/tc-library", heading: "TC Library" },
  { link: "Bug Formatter", path: "/bug-formatter", heading: "Bug Report Formatter" },
  { link: "Release Readiness", path: "/release-readiness", heading: "Release Readiness" },
  { link: "Risk-Based Test Planner", path: "/risk-planner", heading: "Risk-Based Test Planner" },
  { link: "Locator Helper", path: "/locator-helper", heading: "Locator Helper" },
  { link: "Selenium → Playwright", path: "/selenium-to-playwright", heading: "Selenium → Playwright Converter" },
  { link: "Test Failure Analyzer", path: "/failure-analyzer", heading: "Test Failure Analyzer" },
  { link: "API Test Playground", path: "/api-playground", heading: "API Test Playground" },
  { link: "Automation ROI", path: "/automation-roi", heading: "Automation ROI Dashboard" },
  { link: "Test Case Generator", path: "/test-case-generator", heading: "Test Case Generator" },
  { link: "Test Data Generator", path: "/test-data-generator", heading: "Test Data Generator" },
];

const GROUPS = [
  { name: "Test Planning", cards: 4 },
  { name: "Test Execution", cards: 6 },
  { name: "Automation", cards: 5 },
  { name: "Reports & Insights", cards: 2 },
];

test.describe("navigation", () => {
  test("home lists a card for every module", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Rakesh QA Hub" })).toBeVisible();
    for (const g of GROUPS) {
      await expect(page.getByRole("list", { name: g.name }).getByRole("link")).toHaveCount(g.cards);
    }
  });

  test("sidebar group headings collapse and remember it", async ({ page }) => {
    const base = new BasePage(page, "/");
    await base.goto();
    const heading = base.sidebar.getByRole("button", { name: "Test Planning" });
    await expect(heading).toHaveAttribute("aria-expanded", "true");
    await heading.click();
    await expect(heading).toHaveAttribute("aria-expanded", "false");
    await expect(base.sidebarLink("Release Readiness")).toBeHidden();
    await page.reload();
    await expect(base.sidebar.getByRole("button", { name: "Test Planning" })).toHaveAttribute("aria-expanded", "false");
    await base.sidebar.getByRole("button", { name: "Test Planning" }).click();
    await expect(base.sidebarLink("Release Readiness")).toBeVisible();
  });

  for (const m of MODULES) {
    test(`sidebar opens ${m.link}`, async ({ page }) => {
      const base = new BasePage(page, "/");
      await base.goto();
      await base.sidebarLink(m.link).click();
      await expect(page).toHaveURL(m.path);
      await expect(base.heading(m.heading)).toBeVisible();
      await expect(base.sidebarLink(m.link)).toHaveAttribute("aria-current", "page");
    });
  }

  test("Bug Tracker group expands to Dashboard, Activity and Workload", async ({ page }) => {
    const base = new BasePage(page, "/");
    await base.goto();
    await base.sidebar.getByRole("button", { name: "Bug Tracker" }).click();
    for (const [name, path] of [["Activity", "/bug-tracker/activity"], ["Workload", "/bug-tracker/workload"], ["Dashboard", "/bug-tracker"]]) {
      await base.sidebarLink(name).click();
      await expect(page).toHaveURL(path);
      await expect(base.sidebarLink(name)).toHaveAttribute("aria-current", "page");
    }
  });

  test("Customer Issue RCA group expands to its pages", async ({ page }) => {
    const base = new BasePage(page, "/");
    await base.goto();
    await base.sidebar.getByRole("button", { name: "Customer Issue RCA" }).click();
    for (const [name, path] of [["Regression pack", "/customer-issues/pack"], ["Release runs", "/customer-issues/runs"], ["Settings", "/customer-issues/settings"], ["Dashboard & issues", "/customer-issues"]]) {
      await base.sidebarLink(name).click();
      await expect(page).toHaveURL(path);
      await expect(base.sidebarLink(name)).toHaveAttribute("aria-current", "page");
    }
  });

  test("the removed QA Digest route redirects home", async ({ page }) => {
    await page.goto("/qa-digest");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Rakesh QA Hub" })).toBeVisible();
  });

  test("sidebar collapses to icons and remembers it", async ({ page }) => {
    const base = new BasePage(page, "/");
    await base.goto();
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(base.sidebar).toHaveAttribute("data-collapsed", "true");
    await page.reload();
    await expect(base.sidebar).toHaveAttribute("data-collapsed", "true");
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(base.sidebar).toHaveAttribute("data-collapsed", "false");
  });

  test("mobile drawer navigates and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("link", { name: "TC Library" }).click();
    await expect(page).toHaveURL("/tc-library");
    await expect(drawer).toBeHidden();
  });

  test("theme picker switches mode and colour theme, and remembers them", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-accent", "aurora");

    await page.getByRole("button", { name: /^Theme/ }).click();
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(html).toHaveClass(/\bdark\b/);
    await page.getByRole("radio", { name: /^Ocean/ }).click();
    await expect(html).toHaveAttribute("data-accent", "ocean");

    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(html).toHaveAttribute("data-accent", "ocean");

    await page.getByRole("button", { name: /^Theme/ }).click();
    await page.getByRole("radio", { name: "Light" }).click();
    await page.getByRole("radio", { name: /^Aurora/ }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);
    await expect(html).toHaveAttribute("data-accent", "aurora");
  });

  test("unknown routes show a 404 page", async ({ page }) => {
    const res = await page.goto("/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
