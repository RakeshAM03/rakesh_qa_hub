# Rakesh QA Hub — Overview

**One web toolkit for the whole QA lifecycle:** plan → execute → automate → report. No login needed. AI help from Claude is optional, and every module works without it.

## The 16 modules

| Section | Module | What it does for the team |
|---|---|---|
| Test Planning | Test Case Generator | Turns requirements and API definitions into detailed test cases with boundary values; exports to Excel, CSV, Gherkin and Postman. |
| Test Planning | TC Library | Keeps approved test plans so the team can reuse them instead of redoing the analysis. |
| Test Planning | Risk-Based Test Planner | Scores areas by likelihood × impact and splits testing hours by risk; records accepted risks. |
| Test Planning | Release Readiness | Quality-gate checklist per release, with a live readiness score, sign-offs and a recorded Go / No-Go. |
| Test Execution | PR QA Session | Builds a 10-step Claude Code session: code-based analysis, approved plan, browser testing, report and Playwright specs. |
| Test Execution | API Test Playground | Sends API requests with assertions, environments and shared collections, in the browser. |
| Test Execution | Bug Tracker | Issues per feature and team, with % valid, an activity feed and workload per person. |
| Test Execution | Bug Formatter | Turns raw findings into clean bug reports for Jira or Slack. |
| Test Execution | AI PR Review | A standard AI code-review prompt, plus a searchable log of the issues it finds. |
| Automation | CI Reports | Starts and follows GitHub Actions test suites from one page. |
| Automation | Test Failure Analyzer | Groups failed tests by root cause and separates script problems from product bugs. |
| Automation | Locator Helper | Suggests stable, scored locators for Selenium and Playwright. |
| Automation | Selenium → Playwright Converter | Converts Selenium Java tests to Playwright TypeScript, with review notes. |
| Automation | Test Data Generator | Creates realistic, repeatable fake data with edge cases in 8 formats, including SQL for 5 databases. |
| Reports & Insights | QA Tracker | Daily log of QA tasks and hours, with 7/14/30-day charts. |
| Reports & Insights | Automation ROI Dashboard | Hours saved, ROI %, break-even, coverage growth and CI pass rate. |

## Three typical workflows

**1. A new feature** — Test Case Generator → TC Library → Risk-Based Test Planner → PR QA Session → Bug Formatter → Bug Tracker → Release Readiness.
Test cases are generated and stored, effort is prioritised by risk, and the PR is tested in a guided AI session. Bugs are reported cleanly and tracked, and the release decision is made against live quality gates.

**2. An automation failure** — CI Reports → Test Failure Analyzer → Locator Helper → Bug Formatter.
The failed run is analysed into root-cause groups. Broken locators are fixed with robust alternatives, and real product bugs are reported straight away.

**3. Moving to Playwright** — Selenium → Playwright Converter → Test Data Generator → API Test Playground → Automation ROI.
Tests are converted with review notes, given reproducible data, and backed by API checks, and the time saved is tracked as the migration progresses.

## Why it matters

- **Faster:** test cases, bug reports and AI prompts in minutes, not hours.
- **Consistent:** one format for test cases, bugs, reviews and session prompts across the team.
- **Visible:** release readiness, risk decisions, QA effort and automation value are always up to date and easy to share.
- **Safe:** destructive actions need an admin passcode, credentials are never stored, and all sample data is fake.
