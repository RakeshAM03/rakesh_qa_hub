import { expect, type Page } from "@playwright/test";

export const ADMIN_PASSCODE = process.env.E2E_ADMIN_PASSCODE ?? "e2e-passcode";

/** A short unique suffix so data from different runs never collides. */
export const uid = () => Math.random().toString(36).slice(2, 7);

/** Answers the admin passcode dialog if it appears. */
export async function enterPasscode(page: Page, passcode = ADMIN_PASSCODE) {
  const dialog = page.getByRole("dialog", { name: "Admin passcode" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Passcode").fill(passcode);
  await dialog.getByRole("button", { name: "Continue" }).click();
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}
