# Prompt: Automation ROI Dashboard Page for Rakesh QA Hub

Build a page called **Automation ROI Dashboard** for the **Rakesh QA Hub**. It shows the value of test automation: how much time it saves, how coverage is growing, and how stable the suites are. It combines numbers the user enters with data the hub already has (CI Reports runs, TC Library, Bug Tracker).

## Tech stack

Same as the rest of the hub, plus Recharts for charts.

- **Route:** `/automation-roi`
- **Sidebar:** group **Insights**, icon `TrendingUp`
- **Accent colour:** emerald

## Layout

- Breadcrumb `< Home`, `TrendingUp` icon + title "Automation ROI Dashboard".
- Subtitle: "Track how much time automation saves and how coverage is growing."
- Top right: **period selector** (Last 30 days / Last 90 days / This year / Custom) and **Manage projects** button.
- Rows: KPI tiles → charts → per-project table.

## 1. Projects (user-managed)

Nothing is hard-coded. The user adds **automation projects** via a modal (admin passcode for edit/delete):

| Field | Example | Notes |
|---|---|---|
| Name | "Checkout regression" | required, unique |
| Linked CI suite | dropdown of CI Reports suites | optional; used to pull run counts and durations |
| Total test cases | 240 | manual + automated in scope |
| Automated test cases | 180 | must be ≤ total |
| Avg manual time per test (min) | 6 | how long one test takes by hand |
| Avg automated time per test (sec) | 20 | used if no CI suite is linked |
| Runs per month (manual estimate) | 40 | used if no CI suite is linked |
| Build cost (hours) | 120 | one-time effort to write the automation |
| Maintenance (hours/month) | 8 | |
| Hourly cost (optional) | 1500 | currency symbol setting (₹ default, changeable) |

Also a **"Log a snapshot"** action: records today's automated/total counts, so coverage growth can be charted over time.

Empty state: "No automation projects yet — add one to start tracking ROI."

## 2. Calculations

For each project, over the selected period:

- **Runs** = CI run count from the linked suite (if linked and `GITHUB_TOKEN` set), else runs per month × months in the period.
- **Manual effort avoided (hours)** = runs × automated tests × manual minutes ÷ 60
- **Automated execution time (hours)** = sum of CI run durations (if linked), else runs × automated tests × automated seconds ÷ 3600
- **Net hours saved** = manual effort avoided − execution time − maintenance hours in the period
- **Break-even** = month in which cumulative net hours saved ≥ build cost
- **ROI %** = (cumulative net hours saved − build cost) ÷ build cost × 100
- **Coverage %** = automated ÷ total × 100
- **Pass rate %** = successful CI runs ÷ completed CI runs (linked suites only)
- **Cost saved** = net hours saved × hourly cost (only if hourly cost is set)

Show a small "How is this calculated?" info popover listing these formulas.

## 3. KPI tiles (top row)

| Tile | Value |
|---|---|
| Hours saved | sum of net hours saved, with ↑/↓ vs previous period |
| ROI | overall ROI %, coloured green if positive |
| Automation coverage | weighted coverage % across projects |
| CI pass rate | across linked suites; "—" if none |
| Cost saved | only shown if hourly cost is set |

## 4. Charts

1. **Cumulative hours saved vs build cost** (line chart, monthly) — shows the break-even point with a marker.
2. **Coverage over time** (line chart from snapshots) — one line per project, plus an overall line.
3. **Hours saved by project** (horizontal bar chart).
4. **CI pass rate trend** (line chart, weekly) — linked suites only.

Each chart has an empty state when there isn't enough data.

## 5. Projects table

Columns: Project · Coverage % (progress bar) · Runs · Hours saved · ROI % · Break-even (month or "Not yet") · Pass rate · Actions (edit, snapshot, delete).

Sortable columns; click a row to open a detail drawer with that project's charts and inputs.

## 6. Export

- **Download CSV** of the projects table.
- **Copy summary** button: copies a short text summary for a status update, e.g. "Automation saved 312 hours this quarter across 4 projects (ROI 160%, coverage 74%)."

## Data model

```ts
AutomationProject {
  id, name @unique, ciSuiteId?, totalTests, automatedTests,
  manualMinutesPerTest, automatedSecondsPerTest?, runsPerMonth?,
  buildHours, maintenanceHoursPerMonth, hourlyCost?, createdAt, updatedAt
}
CoverageSnapshot { id, projectId, date, totalTests, automatedTests }
```

Store the currency symbol as an app setting (simple key/value `AppSetting` table if one doesn't exist yet).

## API routes

| Route | Purpose |
|---|---|
| `GET/POST /api/automation-roi/projects` | List / create |
| `PATCH/DELETE /api/automation-roi/projects/[id]` | Edit / delete (passcode) |
| `POST /api/automation-roi/projects/[id]/snapshots` | Log a snapshot |
| `GET /api/automation-roi/summary?from=&to=` | Computed KPIs, chart series and table rows |

## Behaviour

- All calculations live in one pure module (`src/lib/roi.ts`) with unit tests.
- If CI data can't be fetched, fall back to manual estimates and show a small "Using estimates" badge on that project.
- Validate inputs with zod (no negatives, automated ≤ total).

## Tests

- Unit: every formula, break-even month, period boundaries, estimate fallback.
- E2E: add a project, see KPIs and charts update, log a snapshot, export CSV.
