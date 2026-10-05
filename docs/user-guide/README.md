# Rakesh QA Hub — User Guide

## What is Rakesh QA Hub?

Rakesh QA Hub is a free web toolkit for everyday software testing work. It brings 16 small tools together in one place:

- planning what to test;
- running tests and logging bugs;
- keeping automated tests healthy;
- reporting on QA effort and value.

Several tools prepare work for **Claude**, Anthropic's AI assistant, so you get consistent, high-quality AI help without writing prompts yourself.

The hub is open in the browser with no login. Your choices (theme, drafts, your name) are remembered in your own browser, and shared data (bugs, plans, releases and so on) is visible to everyone who uses the same hub.

### Who it's for

- **QA engineers** — write test cases, test pull requests, log and format bugs, fix flaky automation.
- **QA leads** — plan by risk, track releases, balance workload, report on automation.
- **Managers** — see release readiness, QA effort and the value of automation at a glance.
- **Developers** — get QA-style reviews of their changes and reproducible bug reports.

### Problems it solves

- Test cases written slowly and inconsistently → generated in a standard format with boundary values.
- "Are we ready to release?" answered by a meeting → a live readiness score with quality gates and a recorded decision.
- PRs tested by guesswork → a step-by-step Claude Code session that reads the actual code changes.
- Dozens of failing tests read one by one → failures grouped by root cause.
- Automation value nobody can prove → hours saved, ROI and coverage over time.

## How the sidebar follows the QA lifecycle

The sidebar has four sections, in the order work usually flows:

1. **Test Planning** — decide *what* to test and *how much*: write test cases, reuse approved plans, prioritise by risk, track release gates.
2. **Test Execution** — *do* the testing: run AI-assisted PR sessions, call APIs, log and format bugs, review code changes.
3. **Automation** — keep automated tests *running and healthy*: CI runs, failure analysis, locators, migration to Playwright, test data.
4. **Reports & Insights** — *show* the effort and value: daily QA time and automation ROI.

## All 16 modules

| Module | Section | What it's for | Guide |
|---|---|---|---|
| Test Case Generator | Test Planning | Turn a requirement or API definition into detailed, standard-format test cases | [Open](test-case-generator.md) |
| TC Library | Test Planning | Save approved PR analyses and test plans to reuse later | [Open](tc-library.md) |
| Risk-Based Test Planner | Test Planning | Score areas by risk and split testing hours by priority | [Open](risk-planner.md) |
| Release Readiness | Test Planning | Track quality gates per release and record the Go / No-Go decision | [Open](release-readiness.md) |
| PR QA Session | Test Execution | Build a 10-step Claude Code testing prompt from PR URLs | [Open](pr-qa-session.md) |
| API Test Playground | Test Execution | Send HTTP requests, check responses with assertions, save collections | [Open](api-playground.md) |
| Bug Tracker | Test Execution | Log issues per feature and team; see % valid, activity and workload | [Open](bug-tracker.md) |
| Bug Formatter | Test Execution | Turn findings, forms or CSVs into Jira or Slack-ready bug reports | [Open](bug-formatter.md) |
| AI PR Review | Test Execution | Generate a code review prompt and log the flags Claude finds | [Open](ai-pr-review.md) |
| CI Reports | Automation | Trigger and follow GitHub Actions test suites | [Open](ci.md) |
| Test Failure Analyzer | Automation | Group test failures by root cause: script issues vs product bugs | [Open](failure-analyzer.md) |
| Locator Helper | Automation | Get stable Selenium and Playwright locators from pasted HTML | [Open](locator-helper.md) |
| Selenium → Playwright Converter | Automation | Convert Selenium Java tests and page objects to Playwright TypeScript | [Open](selenium-to-playwright.md) |
| Test Data Generator | Automation | Generate realistic fake data and edge cases in many formats | [Open](test-data-generator.md) |
| QA Tracker | Reports & Insights | Log daily QA tasks and hours, with charts and history | [Open](qa-tracker.md) |
| Automation ROI Dashboard | Reports & Insights | Show hours saved, ROI, coverage and CI pass rate for automation | [Open](automation-roi.md) |

A one-page summary for sharing is in the [Overview](OVERVIEW.md).

## How the modules work together

### a) Testing a new feature

1. **[Test Case Generator](test-case-generator.md)** — paste the story and acceptance criteria and generate test cases. Click **Save to TC Library**.
2. **[TC Library](tc-library.md)** — the cases (and later, approved session plans) are stored for the team.
3. **[Risk-Based Test Planner](risk-planner.md)** — score the feature's areas, split the hours, and click **Send to PR QA Session** for the riskiest ones.
4. **[PR QA Session](pr-qa-session.md)** — paste the PR URLs and build the prompt. Claude Code analyses the code, plans (you approve), tests in a browser and reports.
5. **[Bug Formatter](bug-formatter.md)** — paste Claude's findings and copy clean bug reports for Jira or Slack.
6. **[Bug Tracker](bug-tracker.md)** — log the bugs under the feature page and follow them to Closed.
7. **[Release Readiness](release-readiness.md)** — the linked feature page feeds the P0/P1 gates. Sign off and record **Go**.

### b) An automation run failed

1. **[CI Reports](ci.md)** — the nightly suite shows a failed run. Optionally click **Analyse** for an AI summary.
2. **[Test Failure Analyzer](failure-analyzer.md)** — choose **From CI**, pick the run and click **Analyze**. Failures are grouped into clusters.
3. **[Locator Helper](locator-helper.md)** — for "element not found" clusters, paste the page HTML and pick a robust locator.
4. **[Bug Formatter](bug-formatter.md)** — for clusters that look like product bugs, click **Send to Bug Formatter** and share the report.

### c) Moving to Playwright

1. **[Selenium → Playwright Converter](selenium-to-playwright.md)** — convert Selenium Java classes one at a time and work through the review notes.
2. **[Test Data Generator](test-data-generator.md)** — replace hard-coded data with seeded, reproducible data files (**Use in automation** gives loader code).
3. **[API Test Playground](api-playground.md)** — check the APIs behind the converted flows and save them as a collection.
4. **[Automation ROI](automation-roi.md)** — add the new suite as a project, link it to CI, and track hours saved and coverage as the migration progresses.

## Common features

### "Your name"

There are no accounts. A **Your name** field (on TC Library, AI PR Review, Release Readiness and Failure Analyzer, and shared across the hub) is remembered in your browser. It fills "Saved by", reporter, sign-off and activity names. If it's empty, "Anonymous" is used.

### Admin passcode

Actions that could lose data or cost money ask for an **admin passcode**. It's set by the person who runs the hub (the owner), not by users. Ask them for it if you need it. It protects:

- deleting anything (bugs, plans, releases, entries, schemas and so on);
- adding, editing or reordering CI suites, and starting workflow runs;
- changing a recorded release decision;
- editing or deleting ROI projects, and changing the ROI currency.

You enter it once per browser tab; it's forgotten when the tab closes.

### Light / dark mode and colour themes

Click **Theme** at the bottom of the sidebar. Choose **Light**, **Dark** or **System** under **Mode**. Then pick a **Colour theme**: Aurora, Ocean, Emerald, Sunset or Mono. Your choice is remembered in your browser. Every page is checked for readable contrast in both modes.

### AI features

Modules with an **AI** badge on the home page can use Claude. AI buttons (such as **Generate with AI**, **Explain with AI** or **Analyse**) only appear when the hub owner has configured an AI key. Without one, the same modules offer **Copy prompt for Claude** (or a similar button): you paste the prompt into Claude yourself and, where offered, paste the answer back. The rule-based features (checklist generation, locator ranking, conversion, failure grouping) always work without AI.

### Help inside the app

**Help** at the bottom of the sidebar opens this guide. Each module page has a **How to use** link in its header that opens that module's guide.

## Glossary

| Term | Meaning |
|---|---|
| Acceptance criteria (AC) | The conditions a feature must meet to be accepted, usually written under a user story. |
| Assertion | An automatic check in a test, e.g. "status code equals 200". It passes or fails. |
| Automation coverage | The share of test cases that are automated (automated ÷ total). |
| Blocker | A gate or bug serious enough to stop a release on its own. |
| Boundary value | A value at or just beyond a limit (e.g. 50, 49 and 51 for "max 50"). Bugs cluster at boundaries. |
| Break-even | The point at which the time saved by automation equals the time spent building it. |
| CI (continuous integration) | Automatically building and testing code on a server whenever it changes, e.g. with GitHub Actions. |
| Claude Code | Anthropic's AI assistant that runs in a terminal and can read code, run commands and drive a browser. |
| Collection | A saved group of API requests. |
| Contract (API contract) | The agreed shape of an API's requests and responses. A mismatch means the frontend and backend disagree. |
| Edge case | An unusual but possible input or situation, such as an empty field, a very long name or 29 February. |
| Environment (API) | A named set of variables, such as `baseUrl`, so the same request can run against QA or staging. |
| Exploratory testing | Unscripted testing where the tester learns the feature while looking for problems. |
| Flaky test | A test that sometimes passes and sometimes fails without any code change. |
| Gherkin | A plain-language test format using Given / When / Then. |
| Go / No-Go | The release decision: ship (Go), don't ship (No-Go), or ship with known issues. |
| Impact radius | Everything that uses a changed piece of code and could break because of it. |
| Locator | The instruction a test uses to find an element on a page, e.g. role + name, test ID, CSS or XPath. |
| Negative test | A test that checks the system rejects invalid input or actions correctly. |
| Page Object (POM) | A class that wraps one page's locators and actions so tests stay readable and easy to maintain. |
| Playwright | A modern browser-automation and testing framework. |
| Playwright MCP | A connector that lets Claude Code control a real browser through Playwright. |
| PR (pull request) | A proposed code change on GitHub, reviewed before it's merged. |
| P0 / P1 / P2 / P3 | Severity or priority levels, from critical (P0) to low (P3). |
| Quality gate | A condition a release must meet before shipping, e.g. "No open P0 bugs". |
| Regression testing | Re-testing existing features to make sure a change didn't break them. |
| Risk-based testing | Spending the most testing effort where failure is most likely and most costly. |
| ROI (return on investment) | What you gained compared with what you spent, as a percentage. |
| Root cause | The underlying reason a test failed or a bug happened. |
| Seed | A number that makes "random" data repeatable: the same seed gives the same data. |
| Selenium | A widely used, older browser-automation framework. |
| Smoke test | A quick check that the most important functions work at all. |
| Snapshot | A recorded state at a point in time (e.g. coverage numbers, or a release checklist at decision time). |
| Test case | A set of steps, test data and expected results that checks one behaviour. |
| Valid issue | A reported issue confirmed as a real defect (not a duplicate or "works as designed"). |
