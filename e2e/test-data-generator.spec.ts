import { expect, test } from "@playwright/test";

import { enterPasscode, expectToast, uid } from "./fixtures/helpers";
import { TestDataGeneratorPage } from "./pages/test-data-generator-page";

test.describe("Test Data Generator", () => {
  test("starts empty with presets and a disabled Generate", async ({ page }) => {
    const tdg = new TestDataGeneratorPage(page);
    await tdg.goto();
    await expect(tdg.heading("Test Data Generator")).toBeVisible();
    await expect(page.getByText("No fields yet. Pick a preset above or add your first field.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No data yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate", exact: true })).toBeDisabled();
    for (const p of ["User", "Address", "Payment", "Order", "Employee", "Product", "Login credentials", "API request body", "India (KYC-style)"]) {
      await expect(tdg.preset(p)).toBeVisible();
    }
  });

  test("User preset, 50 rows in Mixed mode: edge rows highlighted, CSV and SQL downloads", async ({ page }) => {
    const tdg = new TestDataGeneratorPage(page);
    await tdg.goto();
    await tdg.preset("User").click();
    await expect(tdg.fieldRows).toHaveCount(11);
    await tdg.rows.fill("50");
    await tdg.mode("Mixed").click();
    await page.getByRole("switch", { name: "email edge cases" }).click();
    await page.getByRole("button", { name: "Options for email" }).click();
    await page.getByLabel("Edge-case share (% of rows, Mixed mode)").fill("60");
    await page.keyboard.press("Escape");
    await page.getByLabel("Seed (optional)").fill("42");
    await tdg.generate();

    await expect(tdg.stats).toContainText("50 rows · 11 fields");
    await expect(tdg.stats).toContainText("seed 42");
    const edgeRows = tdg.previewTable.locator("tr[data-edge]");
    expect(await edgeRows.count()).toBeGreaterThan(10);
    await expect(edgeRows.first().locator("td[title^='Edge case: ']").first()).toBeVisible();
    await expect(tdg.previewTable.getByRole("columnheader", { name: /_isEdgeCase/ })).toBeVisible();

    const csv = await tdg.download(/^Download CSV/);
    expect(csv.name).toBe("user-50-rows.csv");
    const lines = csv.text.trim().split("\n");
    expect(lines[0]).toBe("id,firstName,lastName,fullName,email,username,password,phone,dateOfBirth,gender,createdAt,_isEdgeCase,_edgeCaseType");
    expect(csv.text).toContain(",true,email: ");

    await tdg.setFormat("SQL INSERT");
    const sql = await tdg.download(/^Download SQL INSERT/);
    expect(sql.name).toBe("user-50-rows.sql");
    expect(sql.text).toContain('CREATE TABLE "test_data"');
    expect(sql.text).toContain('INSERT INTO "test_data" ("id", "firstName"');
    expect(sql.text.match(/^\s+\(/gm)?.length).toBe(50);
  });

  test("the same seed gives identical data; Raw shows the chosen format", async ({ page }) => {
    const tdg = new TestDataGeneratorPage(page);
    await tdg.goto();
    await tdg.preset("Order").click();
    await tdg.rows.fill("5");
    await page.getByLabel("Seed (optional)").fill("7");
    await tdg.setFormat("JSON (array)");
    await tdg.generate();
    const first = (await tdg.previewTable.locator("tbody").textContent()) ?? "";
    await page.getByRole("button", { name: "Regenerate" }).click();
    await expectToast(page, "A fixed seed gives the same data");
    await expect(tdg.previewTable.locator("tbody")).toHaveText(first);
    await page.getByRole("tab", { name: "Raw" }).click();
    await expect(page.getByLabel("Raw output (first 200 lines)")).toContainText('"orderId": "ORD-');
  });

  test("shows schema errors inline and blocks generation", async ({ page }) => {
    const tdg = new TestDataGeneratorPage(page);
    await tdg.goto();
    await page.getByRole("button", { name: "Add field" }).click();
    await page.getByRole("button", { name: "Add field" }).click();
    await page.getByLabel("Field 2 name").fill("field");
    await expect(tdg.fieldRows.nth(0)).toContainText("name is used more than once.");
    await page.getByRole("button", { name: /^Type for field: / }).first().click();
    await page.getByLabel("Search field types").fill("integer");
    await page.getByRole("option", { name: "Integer" }).click();
    await page.getByRole("button", { name: "Options for field" }).first().click();
    await page.getByLabel("Min").fill("10");
    await page.getByLabel("Max").fill("1");
    await page.keyboard.press("Escape");
    await expect(tdg.fieldRows.nth(0)).toContainText("min (10) is greater than max (1).");
    await page.getByRole("button", { name: "Generate", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Fix these before generating" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No data yet" })).toBeVisible();
  });

  test("preset over existing fields asks to replace or append", async ({ page }) => {
    const tdg = new TestDataGeneratorPage(page);
    await tdg.goto();
    await tdg.preset("Address").click();
    await expect(tdg.fieldRows).toHaveCount(7);
    await tdg.preset("Product").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Append" }).click();
    await expect(tdg.fieldRows).toHaveCount(15);
    await tdg.preset("Login credentials").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Replace" }).click();
    await expect(tdg.fieldRows).toHaveCount(4);
  });

  test("Excel and zip downloads; schema JSON export imports back", async ({ page }) => {
    const tdg = new TestDataGeneratorPage(page);
    await tdg.goto();
    await tdg.preset("Product").click();
    await tdg.rows.fill("20");
    await tdg.generate();
    await tdg.setFormat("Excel");
    const xlsx = await tdg.download(/^Download Excel/);
    expect(xlsx.name).toBe("product-20-rows.xlsx");
    expect(xlsx.text.startsWith("PK")).toBe(true);
    await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeDisabled();
    const zip = await tdg.download(/all formats/);
    expect(zip.name).toBe("product-20-rows-all-formats.zip");

    const schema = await tdg.download("Export JSON");
    expect(schema.name).toBe("product.schema.json");
    expect(JSON.parse(schema.text).fields).toHaveLength(8);
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByLabel("Import schema JSON file").setInputFiles({ name: "s.json", mimeType: "application/json", buffer: Buffer.from(schema.text) });
    await expect(tdg.fieldRows).toHaveCount(8);
  });

  test("Use in automation shows Java and Playwright snippets", async ({ page }) => {
    const tdg = new TestDataGeneratorPage(page);
    await tdg.goto();
    await tdg.preset("Employee").click();
    await page.getByRole("button", { name: "Use in automation" }).click();
    const dialog = page.getByRole("dialog", { name: "Use in automation" });
    await expect(dialog).toContainText("@DataProvider");
    await expect(dialog).toContainText("employee-100-rows.csv");
    await dialog.getByRole("tab", { name: /Playwright/ }).click();
    await expect(dialog).toContainText('import rows from "./data/employee-100-rows.json"');
  });
});

test.describe("Test Data Generator @write", () => {
  test("saves a schema, reloads it, and deletes it with the passcode", async ({ page }) => {
    const tdg = new TestDataGeneratorPage(page);
    const name = `E2E schema ${uid()}`;
    await tdg.goto();
    await tdg.preset("User").click();
    await page.getByRole("button", { name: "Save schema" }).click();
    const save = page.getByRole("dialog", { name: "Save schema" });
    await save.getByLabel("Name").fill(name);
    await save.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Schema saved");
    await expect(page.getByText(`Editing ${name}`)).toBeVisible();

    // Change the schema, then load the saved version back.
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(tdg.fieldRows).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: /^My schemas/ }).click();
    const item = page.getByRole("list", { name: "Saved schemas" }).getByRole("listitem").filter({ hasText: name });
    await expect(item).toContainText("11 fields");
    await item.getByRole("button", { name: "Load" }).click();
    await expect(tdg.fieldRows).toHaveCount(11);
    await expect(page.getByLabel("Field 5 name")).toHaveValue("email");

    await page.getByRole("button", { name: /^My schemas/ }).click();
    await item.getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete schema" }).click();
    await enterPasscode(page);
    await expectToast(page, `Deleted “${name}”`);
    await expect(item).toHaveCount(0);
  });

  test("saved presets appear as preset chips", async ({ page }) => {
    const tdg = new TestDataGeneratorPage(page);
    const name = `E2E preset ${uid()}`;
    await tdg.goto();
    await tdg.preset("Address").click();
    await page.getByRole("button", { name: "Save schema" }).click();
    const save = page.getByRole("dialog", { name: "Save schema" });
    await save.getByLabel("Name").fill(name);
    await save.getByText("Save as preset").click();
    await save.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Schema saved");
    await expect(tdg.preset(name)).toBeVisible();
  });
});
