# Prompt: QA Bug Tracker Page for Rakesh QA Hub

Build an internal web app page called **QA Bug Tracker** for the **Rakesh QA Hub**. It tracks QA issues across all features, grouped by team, and shows how many reported issues were valid.

## Tech stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, lucide-react icons
- **Backend:** Next.js API routes with a database (PostgreSQL + Prisma, or similar)
- **Sheet integration:** Google Sheets API, to view and sync a feature's issues from a linked sheet
- **Auth:** Google SSO restricted to the company domain
- **Route:** `/bug-tracker`

## Navigation

In the app's main left sidebar ("Rakesh QA Hub", collapsible), **Bug Tracker** is an expandable group with three sub-pages:

| Sub-page  | Route                    | Purpose                                                                 |
|-----------|--------------------------|-------------------------------------------------------------------------|
| Dashboard | `/bug-tracker`           | The feature table described below (default, highlighted when active)    |
| Activity  | `/bug-tracker/activity`  | [inferred] Chronological feed of issue changes: created, status changed, marked valid/invalid, by whom and when |
| Workload  | `/bug-tracker/workload`  | [inferred] Issues per assignee/QA, open vs closed, to balance work across the team |

The sub-items sit under a thin vertical guide line, indented below "Bug Tracker"; the group's chevron flips up when expanded.

## Layout

- Breadcrumb `< Home` at the top left.
- Global search box at the top right: placeholder "Search issues...", searches issue titles and features across all teams.
- Two-column body: a team sidebar on the left, the feature table on the right.
- Clean, minimal style: white cards, rounded corners, soft borders, small uppercase letter-spaced table headers.

## Team sidebar (left)

- Top item **All** with a total count badge (number of feature pages), shown as a black filled pill when active.
- Below it, one collapsible row per team, each with a chevron and a count badge of its feature pages. There is no built-in team list: teams are created by users with **+ New Team**. Long team names are truncated with an ellipsis.
- With no teams yet, the sidebar shows only **All** (count `0`) and **+ New Team**.
- Clicking a team filters the feature table to that team; expanding it lists its feature pages as links.
- Teams with zero feature pages still appear, with a `0` badge.
- **+ New Team** link at the bottom opens a small modal to create a team (team name, required).

## Header (right column)

- Title **QA Bug Tracker** with the subtitle "Track QA issues across all features".
- **View sheet** label with a **Select a sheet...** dropdown that lists the linked Google Sheets; selecting one opens or syncs that sheet's issues.
- Black **+ New Feature Page** button on the right.

## Feature table

| Column       | Content                                                         |
|--------------|-----------------------------------------------------------------|
| FEATURE      | Feature page name, clickable to open that feature's issue list  |
| TOTAL ISSUES | Count of all issues logged for the feature                      |
| VALID ISSUES | Count of issues marked valid (not invalid, duplicate or "works as designed") |
| % VALID      | `valid / total`, rounded, shown as a coloured pill              |

`% VALID` pill colours:
- **Green:** 95% and above
- **Amber:** 85–94%
- **Red/pink:** below 85%

There are no built-in feature rows: feature pages are created by users with **+ New Feature Page**. With none yet, the table shows an empty state: "No feature pages yet — click New Feature Page to add one."

Feature names often follow a `Product : Feature` naming convention.

## New Feature Page modal

- Title **New Feature Page** with a close (×) icon.
- **Feature Name** (required, red asterisk), placeholder "e.g. User Authentication".
- **Team** dropdown, defaulting to "— No team —", listing all teams.
- **Cancel** (outlined) and **Create** (black) buttons.
- On create: validate the name is not empty or a duplicate, save it, close the modal, add the row to the table and bump the team's count badge.

## Feature detail page (`/bug-tracker/[featureId]`)

- Issue list for that feature with columns such as ID, title, severity, status, valid/invalid flag, reporter, assignee and created date.
- Add, edit and mark issues valid or invalid; the parent table's counts update from this data.
- Optional link to a Google Sheet as the source of issues.

## Data model

```ts
Team        { id, name, createdAt }
FeaturePage { id, name, teamId | null, sheetUrl?, createdAt }
Issue       { id, featurePageId, title, description, severity, status,
              isValid: boolean, reporter, assignee, createdAt }
```

Total, valid and `% valid` are computed from the `Issue` rows, not stored.

## Behaviour

- Search filters live as you type (debounced).
- Sidebar counts and table numbers stay in sync after any create or update.
- Loading skeletons for the sidebar and table; empty state when a team has no feature pages.

## Non-functional

- Keep Google API credentials server-side only.
- Responsive down to tablet width; the sidebar collapses into a dropdown on small screens.
