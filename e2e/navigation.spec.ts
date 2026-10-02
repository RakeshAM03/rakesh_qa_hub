import { expect, test } from "@playwright/test";

import { BasePage } from "./pages/base-page";

const MODULES = [
  { link: "CI Reports", path: "/ci", heading: "CI Reports" },
  { link: "QA Tracker", path: "/qa-tracker", heading: "QA Tracker" },
  { link: "QA Digest", path: "/qa-digest", heading: "QA Digest" },
  { link: "PR QA Session", path: "/pr-qa-session", heading: "PR QA Session" },
  { link: "AI PR Review", path: "/ai-pr-review", heading: "AI PR Review" },
  { link: "TC Library", path: "/tc-library", heading: "TC Library" },
  { link: "Bug Formatter", path: "/bug-formatter", heading: "Bug Report Formatter" },
];

test.describe("navigation", () => {
  test("home lists a card for every module", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Rakesh QA Hub" })).toBeVisible();
    const cards = page.getByRole("list", { name: "Modules" }).getByRole("link");
    await expect(cards).toHaveCount(8);
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

  test("QA Digest is a coming-soon placeholder", async ({ page }) => {
    await page.goto("/qa-digest");
    await expect(page.getByText("Coming soon")).toBeVisible();
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
