# Prompt: Test Failure Analyzer Page for Rakesh QA Hub

Build a page called **Test Failure Analyzer** for the **Rakesh QA Hub**. After an automation run, QA pastes or uploads failure output (stack traces, TestNG / JUnit XML, Playwright JSON, plain console logs). The page groups the failures by likely root cause, so QA can see at a glance which failures are **script issues** (locators, waits, test data) and which are likely **real product bugs**, then send the real bugs to Bug Formatter.

It uses a **rule-based classifier** by default, with an optional AI mode for deeper explanations.

## Tech stack

Same as the rest of the hub. Use a lightweight XML parser (e.g. `fast-xml-parser`) for JUnit/TestNG reports.

- **Route:** `/failure-analyzer`
- **Sidebar:** group **Automation Tools**, icon `Bug` (or `Stethoscope`)
- **Accent colour:** rose

## Layout

- Breadcrumb `< Home`, icon + title "Test Failure Analyzer".
- Subtitle: "Paste test failures or upload a report to group them by root cause."
- Top: input card. Below: summary + groups. Right drawer: failure detail.

## 1. Input card

Tabs:

| Tab | Accepts |
|---|---|
| Paste logs | Free text: one or more stack traces / console output |
| Upload report | Drag-and-drop or file picker: TestNG `testng-results.xml`, JUnit/Surefire `TEST-*.xml` (multiple files), Playwright `results.json`, `.txt` / `.log` |
| From CI | Dropdown of CI Reports suites → pick a failed run → load its failed job logs (only when `GITHUB_TOKEN` is set; otherwise show "Connect GitHub in CI Reports to use this") |

- **Analyze** button.
- Limits: 5 MB total, 2,000 failures; clear errors when exceeded.

## 2. Parsing

Turn every input into a list of failures:

```ts
Failure { testName, className?, suite?, durationMs?, message, stackTrace, source: "paste" | "testng" | "junit" | "playwright" | "ci" }
```

- **TestNG XML:** `<test-method status="FAIL">` with `<exception>`, `<message>`, `<full-stacktrace>`.
- **JUnit XML:** `<testcase>` containing `<failure>` or `<error>`.
- **Playwright JSON:** specs → tests → results with `status: "failed"` and `error.message` / `error.stack`.
- **Plain text:** split on common exception headers (lines matching `^\S+(Exception|Error)(:|$)`, `FAILED:`, `✘`, `Error:`), keeping the following stack lines together.

Skip passed and skipped tests; show counts of each in the summary.

## 3. Classification rules

Classify each failure into one category by matching its exception type and message (first match wins; keep the rules in a config file so they're easy to extend):

| Category | Typical signals | Likely owner |
|---|---|---|
| **Locator / element not found** | `NoSuchElementException`, `InvalidSelectorException`, `strict mode violation`, `waiting for locator`, `element(s) not found` | Automation |
| **Timing / synchronisation** | `TimeoutException`, `Timeout \d+ms exceeded`, `StaleElementReferenceException`, `ElementClickInterceptedException`, `ElementNotInteractableException`, `not visible` | Automation |
| **Assertion / product behaviour** | `AssertionError`, `expected … but found …`, `expect(...).toHaveText`, `Expected:` / `Received:` | Product bug (verify) |
| **Test data / setup** | `NullPointerException` in test code, `IllegalArgumentException`, "no such user", duplicate key, `FileNotFoundException`, data-provider errors | Automation / data |
| **Environment / infrastructure** | `SessionNotCreatedException`, `WebDriverException: unknown error`, `net::ERR_`, `ECONNREFUSED`, DNS errors, `503`, `502`, browser crash, out of memory | Environment |
| **API / backend error** | HTTP 4xx/5xx in message, `RestAssured` status mismatch, `500 Internal Server Error` | Product bug (verify) |
| **Unknown** | anything else | Needs triage |

Within each category, **cluster** similar failures: normalise the message (strip numbers, ids, quoted values, timestamps, memory addresses) and group by normalised message + top application stack frame. Each cluster shows how many tests it affects.

## 4. Results

### Summary bar

- Total failures, passed/skipped counts (if known).
- A donut chart (or stacked bar) by category.
- A one-line verdict, e.g. "68% of failures look like automation issues; 2 clusters look like product bugs."

### Category sections (collapsible, sorted by count)

Each section header: category name, count, owner badge.

Each cluster row:
- Representative message (truncated), affected test count, list of test names (first 5 + "show all").
- **Suggested fix** text from the rule (e.g. Timing → "Replace fixed sleeps with explicit waits (`WebDriverWait` / Playwright auto-waiting); check for overlays or animations before clicking.").
- Actions:
  - **View details** → drawer with full message, stack trace (application frames highlighted, framework frames dimmed), test names.
  - **Send to Bug Formatter** (for product-bug categories) → opens `/bug-formatter` with a pre-filled bug (title from the message, steps placeholder, actual = message, notes = stack trace top frames).
  - **Mark as known flaky** → adds the normalised signature to a "known issues" list.
  - **Copy as Markdown** → cluster summary.

### Known issues

- A **Known issues** tab listing saved signatures with a label and notes.
- On future analyses, matching clusters show a "Known: <label>" badge and can be hidden with a toggle.

## 5. Optional AI mode

If `ANTHROPIC_API_KEY` is set, each cluster gets an **"Explain with AI"** button. It sends the representative failure (message + top 30 stack lines, trimmed to 8 KB) to `POST /api/failure-analyzer/ai` and returns: likely root cause, category confirmation, and a concrete fix. Cache results by cluster signature. Rate limit 20 per hour per IP. Hide the button when no key is set.

Without a key, show a **"Copy AI prompt"** button instead: it builds a prompt containing the failure that the user can paste into Claude.

## 6. Save and history

- **Save analysis** (name optional, defaults to date/time): stores the summary and clusters (not the full raw logs).
- **History** list: date, source, total failures, category breakdown; open to view; delete needs passcode.
- Trend mini-chart: failures per category across saved analyses.

## Data model

```ts
FailureAnalysis { id, name, source, totalFailures, passed?, skipped?,
                  categoryCounts Json, clusters Json, createdBy?, createdAt }
KnownIssue      { id, signature @unique, label, notes?, createdAt }
AiExplanationCache { signature @id, explanation Json, createdAt }
```

## API routes

| Route | Purpose |
|---|---|
| `POST /api/failure-analyzer/analyze` | Optional server-side parse for large uploads (client-side parsing is fine for normal sizes) |
| `GET/POST /api/failure-analyzer/analyses` | History list / save |
| `GET/DELETE /api/failure-analyzer/analyses/[id]` | View / delete (passcode) |
| `GET/POST/DELETE /api/failure-analyzer/known-issues` | Known issues |
| `GET /api/failure-analyzer/ci-run?suiteId=&runId=` | Fetch failed job logs from GitHub |
| `POST /api/failure-analyzer/ai` | Optional AI explanation |

## Tests

- Unit: each parser with fixture files (TestNG, JUnit, Playwright, plain Selenium Java trace), every classification rule, message normalisation and clustering.
- E2E: paste a sample Selenium log with mixed failures, see correct categories and counts, send a product bug to Bug Formatter and see it pre-filled, save an analysis.

Put fixture files in `tests/fixtures/failure-analyzer/` using made-up test and class names.
