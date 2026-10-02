import { defineConfig, devices } from "@playwright/test";

/**
 * Local / CI: starts the built app on :3100 against a throwaway Postgres
 * (E2E_DATABASE_URL), resets it first, and runs every test.
 * Live: set BASE_URL to test a deployed site. Tests tagged @write (they create
 * data) are skipped there unless E2E_ALLOW_WRITES=1.
 */
const baseURL = process.env.BASE_URL ?? "http://localhost:3100";
const local = !process.env.BASE_URL;
const testDb = process.env.E2E_DATABASE_URL ?? "postgresql://rakesham@localhost:5432/qa_hub_test";

export default defineConfig({
  testDir: "./e2e",
  // Tests share one database, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  grepInvert: !local && process.env.E2E_ALLOW_WRITES !== "1" ? /@write/ : undefined,
  globalSetup: local ? "./e2e/global-setup.ts" : undefined,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: local
    ? {
        command: "npx next start -p 3100",
        url: "http://localhost:3100",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          DATABASE_URL: testDb,
          DIRECT_URL: testDb,
          ADMIN_PASSCODE: process.env.E2E_ADMIN_PASSCODE ?? "e2e-passcode",
          RATE_LIMIT_DISABLED: "1",
          GITHUB_TOKEN: "",
          ANTHROPIC_API_KEY: "",
        },
      }
    : undefined,
});
