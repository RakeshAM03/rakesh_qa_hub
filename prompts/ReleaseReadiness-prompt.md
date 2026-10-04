# Prompt: Release Readiness Checklist Page for Rakesh QA Hub

Build a page called **Release Readiness** for the **Rakesh QA Hub**. For each release, QA tracks a checklist of quality gates (smoke done, regression green, P0/P1 bugs closed, sign-offs…), sees a live **readiness score**, and records a final **Go / No-Go** decision with a shareable summary.

Some gates are ticked by hand; others are **auto-checked** from data already in the hub (CI Reports, Bug Tracker, AI PR Review).

## Tech stack

Same as the rest of the hub.

- **Routes:** `/release-readiness` (list) and `/release-readiness/[id]` (detail)
- **Sidebar:** group **Planning**, icon `Rocket`
- **Accent colour:** green

## 1. Releases list page

- Breadcrumb `< Home`, `Rocket` icon + title "Release Readiness".
- Subtitle: "Track quality gates for each release and record the Go / No-Go decision."
- Header actions: **+ New Release**, **Manage templates**.
- Filters: status (Planned / In testing / Go / No-Go / Released), search by name.
- Cards or table rows, newest first:

| Column | Content |
|---|---|
| Release | Name + version (e.g. "v2.4.0") |
| Target date | Date, red if overdue and not decided |
| Readiness | Progress ring with score % |
| Gates | "12 / 15 passed", plus count of blockers |
| Status | Pill: Planned (grey), In testing (blue), Go (green), No-Go (red), Released (purple) |
| Owner | QA owner name |

- Empty state: "No releases yet — create your first release checklist."

## 2. New Release modal

- **Name** (required), **Version** (optional), **Target date**, **QA owner** (text), **Description / scope** (textarea).
- **Template** dropdown: pick a checklist template to start from (see section 5). Defaults to the built-in "Standard release".
- **Linked data** (all optional):
  - CI suites (multi-select from CI Reports)
  - Bug Tracker feature pages in scope (multi-select)
  - AI PR Review repos (multi-select)
- **Create** → opens the detail page.

## 3. Release detail page

### Header

Release name, version, status pill, target date (with "in 3 days" / "2 days overdue"), owner, and **Edit** / **Duplicate** / **Delete** (delete needs passcode).

### Readiness score card

- Big score %: weighted share of passed gates (each gate has a weight; default 1, blockers count as 3).
- Breakdown: passed / failed / pending / not applicable.
- **Blockers** list: every failed gate marked as blocker, in red at the top.
- Verdict hint: "Ready to go" (score ≥ 90% and no failed blockers), "At risk" (score 70–89% or pending blockers), "Not ready" (any failed blocker or score < 70%).

### Checklist

Gates grouped by section (collapsible), each row:

| Element | Details |
|---|---|
| Status | Pending / Pass / Fail / N/A (segmented control; auto gates show their computed status with a "Auto" badge and a refresh icon) |
| Title | e.g. "Regression suite passed on staging" |
| Blocker toggle | Marks the gate as a release blocker |
| Owner | Optional name |
| Evidence | Optional link (CI run, test report, Jira ticket) + note |
| Updated | Who and when |

Users can add, edit, reorder and delete gates on a release without changing the template.

### Auto-checked gate types

| Gate type | Rule | Source |
|---|---|---|
| CI suite green | Latest completed run of each linked suite concluded `success` | CI Reports (needs `GITHUB_TOKEN`; otherwise shows "Can't check — connect GitHub" and falls back to manual) |
| No open P0 bugs | Zero open issues with severity P0 in linked feature pages | Bug Tracker |
| No open P1 bugs | Zero open P1 issues in linked feature pages (configurable max allowed) | Bug Tracker |
| Valid-bug rate | % valid issues ≥ threshold (default 80%) | Bug Tracker |
| No unresolved P0 review flags | Zero P0 flags logged in the last N days for linked repos | AI PR Review |

Auto gates recompute when the page opens and on **Refresh checks**; the user can override an auto result with a note (shown as "Overridden by <name>").

### Sign-offs

A **Sign-offs** section: list of roles (QA, Dev lead, Product — editable list), each with name, decision (Approve / Reject / Pending), comment and timestamp. Visitors enter their name (the hub's "Your name" field) when signing.

### Decision

- **Record decision** button → modal: Go / No-Go / Go with known issues, mandatory comment, list of known issues (free text lines).
- Recording a decision sets the status and freezes a **snapshot** of the checklist (so later edits don't change what was decided). Changing the decision later needs the admin passcode and is logged.
- After release, a **Mark as released** action with the actual release date.

### Activity log

Timeline of every change on the release: gate status changes, overrides, sign-offs, decisions — who and when.

## 4. Shareable summary

- **Copy summary** (Markdown / Slack format), e.g.:

```
Release v2.4.0 — Checkout revamp
Decision: GO WITH KNOWN ISSUES (score 92%)
✅ 13 passed · ❌ 1 failed (non-blocker) · ➖ 1 N/A
Known issues: …
Sign-offs: QA ✅, Dev lead ✅, Product ✅
```

- **Print / Save as PDF** view (clean, print-friendly layout using CSS print styles).

## 5. Checklist templates

`/release-readiness/templates` (or a modal): create, edit, duplicate and delete templates (passcode for delete). Each template has sections and gates (title, type manual/auto, blocker default, weight).

Seed **one** built-in generic template, "Standard release", with sections:
- **Testing:** Smoke test passed; Regression suite passed (auto: CI suite green); New features tested against acceptance criteria; Cross-browser / responsive checks done.
- **Defects:** No open P0 bugs (auto, blocker); No open P1 bugs (auto); Known issues documented.
- **Code & review:** No unresolved P0 review flags (auto); Release notes reviewed.
- **Deployment:** Staging matches production config; Rollback plan documented; Monitoring/alerts in place.

This template is generic process content (not data), so seeding it is fine; users can edit or delete it.

## Data model

```ts
Release { id, name, version?, targetDate?, releasedAt?, owner?, description?,
          status: PLANNED | IN_TESTING | GO | NO_GO | GO_WITH_ISSUES | RELEASED,
          linkedCiSuiteIds String[], linkedFeaturePageIds String[], linkedRepos String[],
          createdAt, updatedAt }
ReleaseGate { id, releaseId, section, title, type: MANUAL | CI_GREEN | NO_P0 | NO_P1 | VALID_RATE | NO_P0_FLAGS,
              config Json?, status: PENDING | PASS | FAIL | NA, isBlocker, weight,
              owner?, evidenceUrl?, note?, override Json?, sortOrder, updatedBy?, updatedAt }
ReleaseSignoff { id, releaseId, role, name?, decision: PENDING | APPROVE | REJECT, comment?, signedAt? }
ReleaseDecision { id, releaseId, decision, comment, knownIssues String[], snapshot Json, decidedBy?, createdAt }
ReleaseEvent { id, releaseId, type, detail Json, actor?, createdAt }
ChecklistTemplate { id, name @unique, sections Json, createdAt, updatedAt }
```

## API routes

| Route | Purpose |
|---|---|
| `GET/POST /api/release-readiness/releases` | List / create (creates gates from the template) |
| `GET/PATCH/DELETE /api/release-readiness/releases/[id]` | Detail / edit / delete (passcode) |
| `POST /api/release-readiness/releases/[id]/refresh` | Recompute auto gates |
| `PATCH /api/release-readiness/gates/[id]` | Update gate status, note, evidence, override |
| `POST /api/release-readiness/releases/[id]/gates` | Add a gate; reorder via PATCH |
| `POST /api/release-readiness/releases/[id]/signoffs` | Sign off |
| `POST /api/release-readiness/releases/[id]/decision` | Record decision (changing an existing one needs passcode) |
| `GET/POST/PATCH/DELETE /api/release-readiness/templates` | Templates |

## Behaviour

- Score and verdict logic in `src/lib/readiness.ts`, unit-tested.
- Auto gates never crash the page if a source is unavailable; they show "Can't check" and stay manual.
- Every change writes a `ReleaseEvent`.

## Tests

- Unit: score weighting, verdict rules, each auto-gate rule with sample data, snapshot on decision.
- E2E: create a release from the template, tick gates, see the score change, add a sign-off, record a Go decision, copy the summary.
