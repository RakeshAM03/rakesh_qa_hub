---
name: ci-reports-dashboard
description: Build a "CI Reports" dashboard page for a QA hub that lists, triggers and monitors user-added GitHub Actions regression suites, with AI root-cause summaries for failed runs. Use when asked to create or extend a CI/CD reports page.
---

# CI Reports Dashboard

Build an internal web page called **CI Reports** for the **Rakesh QA Hub**: one place where the QA team triggers and monitors the CI regression suites that users add.

## Tech stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, lucide-react icons
- **Backend:** Next.js API routes (or a small Node/Express service)
- **CI integration:** GitHub Actions REST API (workflow runs, jobs, `workflow_dispatch`)
- **AI:** an LLM API for failure root-cause analysis
- **Auth:** Google SSO restricted to the company domain
- **Route:** `/ci`

## Layout

- Left sidebar with the app title "Rakesh QA Hub". "CI Reports" is the active nav item, with a grey pill highlight and a branch icon.
- Main area: breadcrumb `< Home`, then a large bold title "CI Reports".
- Style: clean and minimal. White cards, rounded corners, soft shadows, generous spacing, and small uppercase letter-spaced table headers.

## "Jump to" bar (top card)

- Label `JUMP TO` followed by colour-coded pill chips, one per saved suite, in `sortOrder`, using each suite's colour (the active chip is filled).
- Clicking a chip smooth-scrolls to that suite's section.
- A **Refresh** button on the right re-fetches every section.

## Suites are user-added (no hard-coded list)

There is no built-in product or suite list — not in code, config, seed data or this spec. Users add their own suites in the app, and they are stored in the database:

```ts
CiSuite {
  id, name,                 // display name, e.g. "Checkout Regression"
  repo,                     // GitHub repo "owner/name"
  workflowFile,             // e.g. "regression.yml"
  color,                    // blue | orange | teal | purple | light blue | green | red | grey
  dispatchInputs?: Array<{  // optional; JSON
    key, label, type: "text" | "choice", options?: string[], default?
  }>,
  sortOrder, createdAt
}
```

- **Empty state:** with no suites, `/ci` shows "No CI suites yet — add your first one" with an **Add suite** button.
- **Add / Edit suite modal:** display name, GitHub repo (`owner/name`), workflow file, colour picker (the 8 colours above), and an optional list of dispatch inputs (key, label, type text/choice, options for choice, default).
  - Validate the repo format (`owner/name`) and that the workflow file ends in `.yml` or `.yaml`.
  - If `GITHUB_TOKEN` is set, check that the repo and workflow exist on GitHub and show a clear error if not.
- **Delete** a suite with an in-app confirmation; **reorder** suites (move up / down) to change `sortOrder`.
- Add, edit, delete and reorder require the admin passcode.
- An **Add suite** button sits in the page header next to Refresh.

## Suite sections (one card each, stacked vertically)

One card per saved suite, in `sortOrder`. Each card has a top border and a tinted header in the suite's colour, titled "CI Reports — <suite name>", with **Edit** and **Delete** actions in the header.

### Run Workflow button (header, right side, black)

- Triggers that suite's GitHub Actions workflow via `workflow_dispatch`.
- If the suite has dispatch inputs, the button has a dropdown chevron that opens a small form for those inputs (text fields or choice selects, pre-filled with defaults) before dispatch.
- Show a toast on success or failure, then auto-refresh the table.

### Runs table

| Column     | Content                                                                                 |
|------------|-----------------------------------------------------------------------------------------|
| RUN        | Run number, linked to the GitHub Actions run                                            |
| STATUS     | `queued` / `in_progress` / `completed` badge, with a spinner while running              |
| REPORT     | Link to the published HTML test report (Allure/Extent) for that run                     |
| CONCLUSION | `success` / `failure` / `cancelled` badge (green / red / grey)                          |
| JOBS       | Passed/total job count, expandable to list individual jobs                              |
| ROOT CAUSE | For failed runs, an AI one-line summary from the failed job logs; full text on click    |
| TRIGGER    | `schedule` / `workflow_dispatch` / `push` / `pull_request`                              |
| DURATION   | Human-readable, e.g. `12m 34s`                                                          |
| STARTED    | Relative time, with the exact timestamp on hover                                        |
| ACTOR      | GitHub user who triggered the run, with avatar                                          |

### Footer

- `Showing X–Y of N` on the left; first / prev / next / last pagination on the right.
- Empty state shows `Showing 0–0 of 0` with pagination disabled.

## API routes

| Route                                    | Purpose                                                          |
|------------------------------------------|------------------------------------------------------------------|
| `GET /api/ci/suites`                     | List saved suites in `sortOrder`                                 |
| `POST /api/ci/suites`                    | Add a suite (admin passcode; checks repo/workflow when a token is set) |
| `PATCH /api/ci/suites/[suiteId]`         | Edit a suite (admin passcode)                                    |
| `DELETE /api/ci/suites/[suiteId]`        | Delete a suite (admin passcode)                                  |
| `POST /api/ci/suites/reorder`            | Save a new `sortOrder` (admin passcode)                          |
| `GET /api/ci/suites/[suiteId]/runs?page=` | List workflow runs with jobs summary                             |
| `POST /api/ci/suites/[suiteId]/dispatch` | Trigger `workflow_dispatch` with the selected inputs (admin passcode) |
| `GET /api/ci/suites/[suiteId]/runs/[id]/rca` | Fetch failed job logs, send them to the LLM, return the summary  |

Cache the root-cause result per run ID so the LLM is called only once per failed run.

## Behaviour

- Poll in-progress runs every 15–30 seconds.
- Each section loads independently, so one failing API call doesn't break the page.
- Show loading skeletons for tables.

## Non-functional requirements

- Keep GitHub and LLM tokens server-side only; never expose them to the browser.
- Cache GitHub API responses briefly to stay under rate limits.
- Responsive down to tablet width.
