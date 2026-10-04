# Prompt: Locator Helper Page for Rakesh QA Hub

Build a page called **Locator Helper** for the **Rakesh QA Hub**. QA pastes a snippet of HTML (or a whole page's HTML), picks an element, and gets ranked locator suggestions for **Selenium (Java)** and **Playwright (TypeScript)**, with a robustness score for each and the ready-to-paste code.

It runs **entirely in the browser** using a rule-based engine; an optional AI mode can suggest locators for tricky cases.

## Tech stack

Same as the rest of the hub. Parse HTML with the browser's `DOMParser` (never inject pasted HTML into the live page).

- **Route:** `/locator-helper`
- **Sidebar:** group **Automation Tools**, icon `Crosshair`
- **Accent colour:** cyan

## Layout

- Breadcrumb `< Home`, `Crosshair` icon + title "Locator Helper".
- Subtitle: "Paste HTML, pick an element, and get stable locators for Selenium and Playwright."
- Two columns:
  - **Left:** HTML input + element tree.
  - **Right:** locator suggestions for the selected element.

## 1. HTML input

- Large code textarea, placeholder: "Paste HTML here — a single element, a form, or a full page (right-click → Inspect → Copy outerHTML)".
- **Parse** button; **Load sample** link (a small generic login form).
- Size limit 1 MB with a clear error.

## 2. Element tree

After parsing, show the DOM as a collapsible tree:
- Each node: tag name, plus `id`, `name`, `data-testid` / `data-test` / `data-qa`, and the first 30 characters of its text.
- Interactive elements (`a`, `button`, `input`, `select`, `textarea`, `[role]`, `[onclick]`) are highlighted.
- **Filter** box: search by tag, attribute or text.
- **"Interactive only"** toggle.
- Click a node to select it.

Alternative quick mode: a **"Find by text"** input — type visible text like `Sign in` and jump to the matching element.

## 3. Locator suggestions (right panel)

For the selected element, generate candidates, check each one's uniqueness against the parsed document, score them, and show them sorted by score.

### Strategies, in priority order

| Strategy | Example (Selenium) | Example (Playwright) |
|---|---|---|
| Test attribute | `By.cssSelector("[data-testid='login-btn']")` | `page.getByTestId('login-btn')` |
| ID (if not auto-generated) | `By.id("email")` | `page.locator('#email')` |
| Role + accessible name | XPath built from tag + text/aria-label | `page.getByRole('button', { name: 'Sign in' })` |
| Label (for inputs) | XPath via `label[for]` | `page.getByLabel('Email')` |
| Placeholder | `By.cssSelector("input[placeholder='Email']")` | `page.getByPlaceholder('Email')` |
| Name attribute | `By.name("password")` | `page.locator('[name="password"]')` |
| Visible text | `By.xpath("//button[normalize-space()='Sign in']")` | `page.getByText('Sign in', { exact: true })` |
| Short CSS (tag + stable class/attrs) | `By.cssSelector("form.login button[type='submit']")` | `page.locator('form.login button[type="submit"]')` |
| Relative XPath (anchored to a stable ancestor) | `By.xpath("//form[@id='login']//button")` | `page.locator('xpath=//form[@id="login"]//button')` |
| Absolute XPath (last resort) | `/html/body/div[2]/form/button` | — |

### Scoring (0–100)

Start at the strategy's base score, then adjust:
- **−40** if the locator is not unique in the document (show "matches 3 elements").
- **−30** if it relies on auto-generated-looking values (long hex/number sequences, framework IDs like `ember123`, `mui-45`, hashed CSS-module classes such as `btn_x7f3a`).
- **−15** if it uses positional indexes (`[2]`, `:nth-child`).
- **−10** for long text (> 40 chars) or text likely to change/be translated.
- **+5** for short, readable locators.

Badge colours: **80–100 Robust** (green), **50–79 OK** (amber), **< 50 Fragile** (red), each with a one-line reason ("Unique test attribute", "Index-based — breaks if layout changes").

### Each suggestion card shows

- Strategy name, score badge, reason.
- Tabs: **Selenium Java** · **Playwright TS** · **CSS** · **XPath** (the raw selector).
- A copy button per tab.
- Uniqueness: "✓ Unique" or "⚠ Matches N elements".

### Extras

- **Page Object snippet** button: generates a field declaration for the top locator in both styles, e.g.
  - Java: `@FindBy(css = "[data-testid='login-btn']") private WebElement loginButton;` and a `By` constant version.
  - TS: `readonly loginButton = this.page.getByTestId('login-btn');`
  - Field name derived from the element (text, label, id), in camelCase.
- **Recommendation box** at the top: "Best choice: …" plus a tip if the element has no stable attribute, e.g. "Ask developers to add `data-testid` to this element."

## 4. Locator tester

A separate **Test a locator** tab: paste any CSS or XPath, and see how many elements it matches in the parsed HTML, with those elements highlighted in the tree. Show syntax errors clearly.

## 5. Optional AI mode

If `ANTHROPIC_API_KEY` is set, show an **"Ask AI for alternatives"** button that sends the selected element's outerHTML plus its ancestors (trimmed to 8 KB) to `POST /api/locator-helper/ai` and shows extra suggestions, still scored and uniqueness-checked locally. If the key isn't set, hide the button. Rate limit: 20 calls per hour per IP.

## Data model

No database needed. Keep the last pasted HTML and selected element in `localStorage` so a refresh doesn't lose work.

## Behaviour

- All locator logic in `src/lib/locators/` as pure functions with unit tests.
- Escape quotes correctly in generated code (single quotes inside XPath, etc.).
- Never render pasted HTML as live HTML; only show it as text/tree.

## Tests

- Unit: each strategy, uniqueness check, auto-generated value detection, scoring, quote escaping, Page Object naming.
- E2E: load sample, select the submit button, top suggestion is the test attribute with score ≥ 80, copy works, locator tester counts matches.
