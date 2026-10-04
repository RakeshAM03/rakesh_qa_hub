# Prompt: Selenium → Playwright Converter Page for Rakesh QA Hub

Build a page called **Selenium → Playwright Converter** for the **Rakesh QA Hub**. QA pastes Selenium **Java** code (a TestNG/JUnit test class or a Page Object) and gets **Playwright TypeScript** code back, plus a list of things that need manual review.

It works in two modes:
1. **Rule-based conversion** in the browser (always available) — handles common, mechanical patterns.
2. **AI conversion** (when `ANTHROPIC_API_KEY` is set) — handles everything else; without a key, the page builds a ready-to-paste prompt for Claude instead.

## Tech stack

Same as the rest of the hub. A code editor component for input/output (e.g. CodeMirror 6 or Monaco, Java and TypeScript syntax highlighting).

- **Route:** `/selenium-to-playwright`
- **Sidebar:** group **Automation Tools**, icon `ArrowRightLeft`
- **Accent colour:** violet

## Layout

- Breadcrumb `< Home`, icon + title "Selenium → Playwright Converter".
- Subtitle: "Paste Selenium Java code and get Playwright TypeScript, with a checklist of anything that needs review."
- Options bar → two side-by-side editors (Java left, TypeScript right; stacked on small screens) → review notes below.

## 1. Options bar

| Option | Values | Default |
|---|---|---|
| Input type | Test class / Page Object / Auto-detect | Auto-detect |
| Test framework (input) | TestNG / JUnit 5 / JUnit 4 | Auto-detect from imports and annotations |
| Output style | Playwright Test (`test()` + fixtures) / Page Object class | Matches input type |
| Locator preference | Keep original selectors / Prefer `getByRole` / `getByLabel` / `getByTestId` where possible | Keep original |
| Mode | Rule-based / AI (shown only when key is set) / Build prompt for Claude | Rule-based |

Buttons: **Convert** (violet), **Load sample** (a generic login test + page object), **Clear**.

## 2. Rule-based conversion (mapping table)

Keep the rules in `src/lib/converter/rules.ts`, each with a regex/AST pattern, a replacement, and a confidence level.

| Selenium Java | Playwright TypeScript |
|---|---|
| `driver.get(url)` / `driver.navigate().to(url)` | `await page.goto(url)` |
| `driver.findElement(By.id("x"))` | `page.locator('#x')` |
| `By.cssSelector("…")` | `page.locator('…')` |
| `By.xpath("…")` | `page.locator('xpath=…')` |
| `By.name("x")` | `page.locator('[name="x"]')` |
| `By.className("x")` | `page.locator('.x')` |
| `By.linkText("x")` | `page.getByRole('link', { name: 'x', exact: true })` |
| `By.partialLinkText("x")` | `page.getByRole('link', { name: 'x' })` |
| `By.tagName("x")` | `page.locator('x')` |
| `findElements(...)` | `page.locator(...)` (+ `.all()` / `.count()` as used) |
| `.click()` | `await locator.click()` |
| `.sendKeys("text")` | `await locator.fill('text')` (note: `pressSequentially` if typing behaviour matters) |
| `.sendKeys(Keys.ENTER)` | `await locator.press('Enter')` |
| `.clear()` | `await locator.clear()` |
| `.getText()` | `await locator.textContent()` (or `innerText()`) |
| `.getAttribute("x")` | `await locator.getAttribute('x')` |
| `.isDisplayed()` | `await locator.isVisible()` |
| `.isEnabled()` / `.isSelected()` | `await locator.isEnabled()` / `await locator.isChecked()` |
| `new Select(el).selectByVisibleText("x")` | `await locator.selectOption({ label: 'x' })` |
| `selectByValue("x")` / `selectByIndex(n)` | `selectOption('x')` / `selectOption({ index: n })` |
| `new WebDriverWait(...).until(ExpectedConditions.visibilityOfElementLocated(by))` | `await expect(locator).toBeVisible()` (Playwright auto-waits) |
| `elementToBeClickable(...)` | removed — Playwright actions auto-wait; add a review note |
| `Thread.sleep(n)` | removed, with a review note ("Use auto-waiting or `expect` instead") — keep as `await page.waitForTimeout(n)` only if the user ticks "Keep sleeps" |
| `driver.getTitle()` / `getCurrentUrl()` | `await page.title()` / `page.url()` |
| `driver.switchTo().frame(...)` | `page.frameLocator(...)` |
| `driver.switchTo().alert().accept()` | `page.once('dialog', d => d.accept())` (placed before the triggering action — flag for review) |
| New window/tab handling | `context.waitForEvent('page')` (flag for review) |
| `Actions` hover / double-click / drag | `locator.hover()` / `dblclick()` / `dragTo()` |
| `JavascriptExecutor.executeScript(...)` | `await page.evaluate(...)` (flag for review) |
| Screenshots | `await page.screenshot({ path })` |
| `Assert.assertEquals(actual, expected)` (TestNG) | `expect(actual).toBe(expected)` — and for element text, `await expect(locator).toHaveText(expected)` |
| `assertTrue(x.isDisplayed())` | `await expect(locator).toBeVisible()` |
| `assertTrue` / `assertFalse` / `assertNotNull` | `expect(x).toBeTruthy()` / `toBeFalsy()` / `not.toBeNull()` |
| `@Test` method | `test('<method name in words>', async ({ page }) => { … })` |
| `@BeforeMethod` / `@BeforeEach` | `test.beforeEach(async ({ page }) => { … })` |
| `@AfterMethod` / `@AfterEach` | `test.afterEach(...)` |
| `@BeforeClass` / `@BeforeAll` | `test.beforeAll(...)` |
| `@DataProvider` / `@ParameterizedTest` | a `for … of` loop generating tests, flagged for review |
| `@Test(groups = {"smoke"})` | tag in the title: `test('… @smoke', …)` |
| Driver setup/teardown (`new ChromeDriver()`, `driver.quit()`) | removed — Playwright fixtures handle it; noted in review |
| `@FindBy(id = "x") WebElement field;` + `PageFactory.initElements` | `readonly field: Locator;` set in the constructor: `this.field = page.locator('#x');` |
| Page Object methods | `async` methods using `this.page` |
| Java types (`String`, `int`, `boolean`, `List<WebElement>`) | `string`, `number`, `boolean`, `Locator` |

Method names become readable test titles (`verifyLoginWithValidUser` → `'verify login with valid user'`).

Anything the rules can't convert stays in the output as a comment:
```ts
// TODO(convert): <original Java line>
```
and is added to the review list.

## 3. AI conversion (optional)

- If `ANTHROPIC_API_KEY` is set, **AI mode** sends the Java code (max 50 KB) and selected options to `POST /api/selenium-to-playwright/ai`. The system prompt asks for idiomatic Playwright TypeScript using `@playwright/test`, web-first assertions, auto-waiting (no sleeps), the selected output style, and a final list of review notes in a fixed JSON block. Parse that block into the review list.
- Rate limit 10 conversions per hour per IP. Show a spinner and allow cancel.
- **Build prompt for Claude** mode (always available): instead of calling the API, it generates the same prompt (instructions + options + the Java code) in a copyable box, so the user can paste it into Claude themselves.

## 4. Output panel

- TypeScript editor (editable), with **Copy** and **Download** (`<ClassName>.spec.ts` or `<ClassName>.page.ts`).
- If the input was a test class that uses page objects, offer to download a `.zip` with both when both are present in the input.
- Small stats line: "42 lines converted · 3 need review · 2 removed (sleeps, driver setup)".

## 5. Review notes (below the editors)

A checklist generated from the conversion, each item with severity (info / warning / needs attention), the original line number, and a short explanation, e.g.:
- ⚠ "Line 18: `Thread.sleep(3000)` removed — Playwright waits automatically."
- ⚠ "Line 31: alert handling must be registered before the click that opens it."
- ℹ "Driver setup removed — configure browsers in `playwright.config.ts`."
- ❗ "Line 44: `executeScript` converted to `page.evaluate` — check the arguments."

Clicking an item highlights the line in both editors.

A collapsible **"Setup checklist"** section with the basics: `npm init playwright@latest`, where to put the spec, how to run it (`npx playwright test`), and a sample `playwright.config.ts` baseURL setting.

## 6. History (optional)

Keep the last 10 conversions in `localStorage` (input, output, options, date) with a **History** dropdown. No database needed for this module.

## Tests

- Unit: each mapping rule with input/expected-output pairs, framework detection, test title generation, `@FindBy` → constructor conversion, TODO fallback.
- E2E: load sample, convert in rule-based mode, output contains `await page.goto`, `test(`, `expect(` and no `Thread.sleep`; review notes appear; copy and download work.
