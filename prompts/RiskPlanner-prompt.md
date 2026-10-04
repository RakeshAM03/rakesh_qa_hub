# Prompt: Risk-Based Test Planner Page for Rakesh QA Hub

Build a page called **Risk-Based Test Planner** for the **Rakesh QA Hub**. For a sprint or release, QA lists the features/areas in scope, scores each one's **likelihood of failure** and **business impact**, and the page produces a **prioritised test plan**: what to test first, how deeply, and how to split the available testing hours. It uses data already in the hub (Bug Tracker history, AI PR Review flags) to suggest scores.

## Tech stack

Same as the rest of the hub, plus Recharts for the risk matrix.

- **Routes:** `/risk-planner` (list of plans) and `/risk-planner/[id]` (plan detail)
- **Sidebar:** group **Planning**, icon `ShieldAlert`
- **Accent colour:** amber

## 1. Plans list

- Breadcrumb `< Home`, icon + title "Risk-Based Test Planner".
- Subtitle: "Score features by risk and get a prioritised test plan for your sprint or release."
- **+ New Plan** button. Optional link to a Release (from Release Readiness) if that module exists.
- Table: Plan name · Period/sprint · Areas · High-risk areas · Available hours · Created · Actions (open, duplicate, delete with passcode).
- Empty state: "No test plans yet — create one to start prioritising."

## 2. New Plan modal

- **Name** (required, e.g. "Sprint 42"), **Start / end date**, **Available testing hours** (number), **Testers** (count, optional), **Notes**.
- **Start from:** blank / duplicate a previous plan / import areas from Bug Tracker feature pages (multi-select).

## 3. Plan detail page

### Areas table (the core)

Each row is a feature/area under test. **+ Add area** adds a row; rows are editable inline.

| Column | Input | Notes |
|---|---|---|
| Area | text (required) | e.g. "Checkout payment" |
| Linked feature page | optional dropdown | from Bug Tracker; enables suggestions |
| Change size | None / Small / Medium / Large / New feature | |
| Complexity | 1–5 | |
| Defect history | 1–5 | suggested from Bug Tracker (see below) |
| Dependencies / integrations | 1–5 | |
| Business impact | 1–5 | how bad a failure is for users/revenue |
| Usage frequency | 1–5 | how many users hit this area |
| Likelihood | computed | |
| Impact | computed | |
| Risk score | computed | 1–25, coloured pill |
| Risk level | computed | Critical / High / Medium / Low |
| Test depth | computed (overridable) | see below |
| Allocated hours | computed (overridable) | |

Each 1–5 input uses a small segmented control with tooltips explaining each level (e.g. Business impact 5 = "Revenue loss, data loss or legal risk", 1 = "Cosmetic").

### Scoring

All weights editable in a **Scoring settings** drawer (per plan, with "Reset to defaults"):

- **Change size → score:** None 1, Small 2, Medium 3, Large 4, New feature 5.
- **Likelihood (1–5)** = weighted average of change size (30%), complexity (25%), defect history (30%), dependencies (15%), rounded to one decimal.
- **Impact (1–5)** = weighted average of business impact (70%) and usage frequency (30%).
- **Risk score** = likelihood × impact (1–25).
- **Risk level:** Critical ≥ 16, High 10–15.9, Medium 5–9.9, Low < 5.
- **Test depth by level:**
  - Critical → "Full: functional, negative, edge, integration, regression, exploratory"
  - High → "Thorough: functional, negative, key edge cases, regression"
  - Medium → "Standard: happy path, main negatives, smoke regression"
  - Low → "Light: smoke / sanity only"
- **Hour allocation:** split available hours in proportion to risk score, with a minimum of 0.5 h per area and rounding to 0.5 h; overrides are respected and the rest is redistributed.

A "How is this calculated?" popover shows these rules.

### Suggestions from hub data

For areas linked to a Bug Tracker feature page, show a 💡 **suggested value** next to Defect history, with a tooltip explaining why:
- Based on issue count and valid-issue rate in the feature page over the last 90 days (e.g. 0 issues → 1, 1–3 → 2, 4–8 → 3, 9–15 → 4, 16+ → 5; weight P0/P1 issues double).
- If AI PR Review has P0/P1 flags on repos linked to the plan in the last 30 days, suggest bumping Complexity by 1 and show the flag count.
- **Apply all suggestions** button; suggestions never overwrite a value silently.

### Risk matrix

A 5 × 5 heat map: X = Impact, Y = Likelihood, cells coloured green → red. Each area is a dot/chip in its cell; hover shows details; click scrolls to the row.

### Prioritised test plan

Sorted list (Critical first, then by risk score):
- Rank, area, risk level pill, score, test depth, allocated hours, and suggested test types as small tags.
- A capacity bar: allocated hours vs available hours (warn if over).
- **"Out of scope / deferred"** toggle per area — deferred areas drop out of allocation and appear in a separate "Accepted risks" list with a mandatory reason.

### Exports

- **Copy as Markdown** (table + accepted risks) for Confluence/Slack.
- **Download CSV**.
- **Print / Save as PDF** view.
- **Send to PR QA Session** (for one area): opens `/pr-qa-session` with Additional Context pre-filled ("Risk level: High. Focus: negative and edge cases for …") and focus areas pre-selected based on the area's top factors.

## Data model

```ts
RiskPlan  { id, name, startDate?, endDate?, availableHours, testers?, notes?,
            releaseId?, settings Json, createdAt, updatedAt }
RiskArea  { id, planId, name, featurePageId?, changeSize, complexity, defectHistory,
            dependencies, businessImpact, usageFrequency,
            depthOverride?, hoursOverride?, deferred Boolean, deferReason?, sortOrder }
```

Likelihood, impact, score, level, depth and hours are computed, not stored.

## API routes

| Route | Purpose |
|---|---|
| `GET/POST /api/risk-planner/plans` | List / create |
| `GET/PATCH/DELETE /api/risk-planner/plans/[id]` | Detail / edit / delete (passcode) |
| `POST /api/risk-planner/plans/[id]/duplicate` | Duplicate a plan |
| `POST/PATCH/DELETE /api/risk-planner/areas[/id]` | Manage areas |
| `GET /api/risk-planner/suggestions?planId=` | Suggested values from Bug Tracker and AI PR Review |

## Behaviour

- All scoring and allocation logic in `src/lib/risk.ts` as pure functions, unit-tested.
- Inline edits save automatically (debounced) with a small "Saved" indicator.
- Works fully without any linked data — suggestions are a bonus, not required.

## Tests

- Unit: likelihood/impact/score formulas, level thresholds, hour allocation with minimums, rounding and overrides, suggestion mapping.
- E2E: create a plan, add three areas with different scores, see correct order in the prioritised plan and on the matrix, override hours, defer an area with a reason, copy Markdown.
