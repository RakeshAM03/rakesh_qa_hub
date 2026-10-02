# Prompt: QA Tracker Page for Rakesh QA Hub

Build an internal web app page called **QA Tracker** for the **Rakesh QA Hub**. QA team members log their daily tasks with status and time spent, and the page shows time-tracking analytics plus a per-person history of logged work.

## Tech stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, lucide-react icons, a chart library (Recharts) for analytics
- **Backend:** Next.js API routes with a database (PostgreSQL + Prisma, or similar)
- **Auth:** Google SSO restricted to the company domain
- **Route:** `/qa-tracker`

## Layout

- Main left sidebar ("Rakesh QA Hub", collapsible) with **QA Tracker** as the active item (grey pill highlight, clipboard icon).
- Breadcrumb `< Home`, then a large bold page title "QA Tracker".
- One large card with a green top border and a light-green tinted header: clipboard icon + "QA Tracker".
- Inside the card, top to bottom: **Log Entry** form, **Time Tracking Analytics**, then the **per-resource task history**.
- Clean, minimal style: white cards, rounded corners, soft borders, small uppercase letter-spaced labels and table headers.

## 1. Log Entry form (collapsible panel)

Panel header: pencil-on-clipboard icon + "Log Entry", with a ▲/▼ toggle on the right to collapse or expand.

**Top row**
- **RESOURCE**: dropdown of QA team members, placeholder "Select..." (required).
- **DATE**: date picker with a calendar icon, defaulting to today (shown like "Mon D, YYYY").

**Task rows** (one or more per entry)

| Field            | Control                                                                 |
|------------------|-------------------------------------------------------------------------|
| TASK DESCRIPTION | Wide text input, placeholder "What did you work on?" (required)         |
| STATUS           | Dropdown: Not Started (default), In Progress, Completed                 |
| TIME SPENT (HRS) | Number input with "hrs" suffix, default 0, decimals allowed (0.25 steps), required, must be > 0 |
| (delete)         | Trash icon to remove that task row (disabled when only one row exists)  |

- Inline red "Required" message under each empty required field after a submit attempt.
- **+ Add task** link below the rows adds another task row, so one entry can log several tasks for the same person and date.
- Black **Log Entry** button at the bottom right saves all rows, shows a success toast, resets the task rows and refreshes the analytics and history.

## 2. Time Tracking Analytics

- Section label `TIME TRACKING ANALYTICS` (uppercase, letter-spaced).
- Empty state: "No time data recorded yet."
- When data exists, show:
  - Total hours logged per resource for the selected period (bar chart).
  - Hours by status (Completed / In Progress / Not Started).
  - Daily hours trend over the last 7–30 days (line chart).
  - Summary stats: total hours, tasks logged, average hours per day.

## 3. Manage resources

There is no built-in team list: resources (QA team members) are added by users.

- A small **Manage resources** button (users icon) in the card header opens a dialog listing all resources.
- **Add** a resource (name required, email optional), **rename** it inline, and **deactivate / reactivate** it with a toggle. Inactive resources are hidden from the RESOURCE dropdown and the tabs, but their logs are kept.
- **Delete** a resource only after an in-app confirmation and the admin passcode; this also deletes its logs.
- With no resources yet, the Log Entry form shows "Add a resource to start logging" with a shortcut to the dialog.

## 4. Per-resource task history

**Tabs:** one tab per resource (active QA team members), underlined active tab. Defaults to the signed-in user's tab.

**Filters** (below the tabs)
- **Search tasks...** box with a search icon, filters by task description.
- **Filter by date** button with a calendar icon, opens a date or date-range picker.

**Table**

| Column           | Content                                                      |
|------------------|--------------------------------------------------------------|
| DATE             | `DD/MM/YYYY`, shown once per date group                      |
| TASK DESCRIPTION | Free text, often `Product : Module : Feature` style          |
| STATUS           | Coloured pill (see below)                                    |
| TIME SPENT       | Hours as a number (e.g. 1, 0.75, 1.5)                        |

- Rows are **grouped by date**: the date appears only on the first row of each group, newest date first, with the group's tasks listed below it.
- Status pill colours:
  - **Not Started:** grey
  - **In Progress:** amber/yellow
  - **Completed:** green
- [inferred] Allow editing a row's status and time inline, and deleting a row, so people can update tasks they logged earlier.
- Paginate or lazy-load older dates.

## Data model

```ts
Resource { id, name, email, active: boolean }
TaskLog  { id, resourceId, date, description,
           status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED",
           hours: number, createdAt, updatedAt }
```

Analytics are computed from `TaskLog` rows, not stored.

## API routes

| Route                                         | Purpose                                     |
|-----------------------------------------------|---------------------------------------------|
| `GET /api/qa-tracker/resources`               | List team members for the dropdown and tabs |
| `POST /api/qa-tracker/resources`              | Add a resource                              |
| `PATCH /api/qa-tracker/resources/[id]`        | Rename or (de)activate a resource           |
| `DELETE /api/qa-tracker/resources/[id]`       | Remove a resource and its logs (admin passcode) |
| `POST /api/qa-tracker/logs`                   | Save one entry with multiple task rows      |
| `GET /api/qa-tracker/logs?resourceId=&q=&from=&to=` | Task history for a tab, with search and date filters |
| `PATCH /api/qa-tracker/logs/[id]`             | Update status or hours                      |
| `DELETE /api/qa-tracker/logs/[id]`            | Remove a task                               |
| `GET /api/qa-tracker/analytics?from=&to=`     | Aggregated hours for the analytics section  |

## Behaviour

- Client-side validation before submit; the button stays disabled while saving.
- Search is debounced; filters combine (search + date).
- Loading skeletons for the analytics and table; friendly empty states for each.

## Non-functional

- Only signed-in company users can log or view entries.
- Responsive down to tablet width; task-row fields stack vertically on small screens.
