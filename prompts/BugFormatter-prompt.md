# Prompt: Bug Report Formatter Page for Rakesh QA Hub

Build an internal web app page called **Bug Report Formatter** for the **Rakesh QA Hub**. QA collects bugs from three sources — **Claude Code findings (pasted text)**, a **manual form**, or a **CSV upload** — into one Findings list, then exports them as clean **Markdown for Jira or Slack**.

Everything runs client-side; no LLM call is needed. The paste option uses a rule-based parser.

## Tech stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, lucide-react icons, PapaParse (CSV)
- **State:** React state, with an optional `localStorage` draft so findings survive a refresh
- **Auth:** Google SSO restricted to the company domain
- **Route:** `/bug-formatter`

## Layout

- Main left sidebar ("Rakesh QA Hub", collapsible) with **Bug Formatter** active (grey pill highlight, file-pen icon).
- Breadcrumb `< Home`, then an orange file-pen icon + large bold title "Bug Report Formatter".
- Subtitle: "Paste Claude Code's findings or log bugs manually, then export as Markdown for Jira or Slack."
- Two columns:
  - **Left (wider):** input card with an orange top border and three tabs.
  - **Right:** **Findings** card.
- Orange accent colour for this page (active tab tint, selected severity, links).

## 1. Input card — three tabs

Tabs across the top, equal width, each with an icon. The active tab has a light-orange background, orange text and an orange underline:

| Tab               | Icon       |
|-------------------|------------|
| Paste from Claude | clipboard  |
| Manual            | pencil     |
| CSV               | upload     |

### Tab 1 — Paste from Claude (default)

- Helper text: "After running the PR validation in Claude Code, paste the findings output here. The parser picks up numbered lists, severity labels (P0–P3), and fields like `Steps:` `Expected:` `Actual:`."
- Large textarea with an example placeholder:

```
1. **P1 — Login button broken on mobile**
   Steps: Open on mobile, tap Login
   Expected: Login page opens
   Actual: Nothing happens

2. **P2 — Table overflows on small screen**
   ...
```

- Full-width **Parse Findings** button (clipboard icon), disabled until text is entered.

**Parser rules**
- Split on numbered list items (`1.`, `2.`, …) at the start of a line.
- In each item's first line, strip markdown bold (`**`), read a severity `P0`–`P3` (default P2 if missing), and take the text after the separator (`—`, `-`, `:`) as the **Title**.
- Read labelled fields on the following lines, case-insensitive: `Steps:`, `Expected:`, `Actual:`, `Environment:` / `Env:`, `Notes:`. Multi-line values continue until the next label or item.
- Show how many bugs were parsed ("3 findings added"); warn when nothing could be parsed.

### Tab 2 — Manual

| Field | Control |
|---|---|
| **TITLE \*** | Text input, placeholder "Short description of the bug" (required) |
| **SEVERITY** | Pill toggle: P0, P1 (default, filled orange), P2, P3 |
| **ENVIRONMENT URL** | Text input, placeholder `https://...` |
| **STEPS TO REPRODUCE** | Textarea, placeholder "Go to... / Click on... / Observe..." (one step per line) |
| **EXPECTED RESULT** | Text input, "What should have happened" |
| **ACTUAL RESULT** | Text input, "What actually happened" |
| **NOTES** (optional) | Text input, "Suspected root cause or extra context" |

- Full-width **+ Add Bug** button; adds the bug to Findings and clears the form (keeping severity and environment for the next bug).

### Tab 3 — CSV

- Helper text: "Upload a CSV file with a header row. Columns are matched by name — required: `Title`. Optional: `Severity` `Steps` `Expected` `Actual` `Environment` `Notes`."
- **Template** link (download icon, orange) at the top right: downloads `bug-template.csv` with that header row and one example row.
- Dashed drop zone: upload icon, "Click to select a CSV file", "or drag and drop". Accept `.csv` only.
- Match headers case-insensitively and ignore unknown columns. Skip rows with no Title and report how many were skipped. Invalid or missing severity becomes P2.

## 2. Findings card (right)

**Empty state:** centred circled "!" icon with "No bugs logged yet".

**With bugs** [inferred — not visible in the screenshots]:
- Header shows a count ("Findings (4)") and severity counts (P0 / P1 / P2 / P3).
- Each bug as a collapsible card: severity pill (P0 red, P1 orange, P2 amber, P3 grey) + title. Expanded, it shows environment, steps (numbered), expected, actual and notes.
- Per-bug actions: **Edit** (loads it into the Manual tab), **Copy** (that bug's Markdown), **Delete**.
- Sorted by severity (P0 first), then by order added; drag to reorder.
- Footer actions:
  - **Copy for Jira**: Jira wiki/Markdown formatting.
  - **Copy for Slack**: Slack mrkdwn (bold with `*`, bullets).
  - **Download .md**: all bugs in one file.
  - **Clear all**: with an in-app confirmation.

### Export format (Markdown, per bug)

```markdown
## [P1] Login button broken on mobile

**Environment:** https://...

**Steps to Reproduce**
1. Open on mobile
2. Tap Login

**Expected Result:** Login page opens
**Actual Result:** Nothing happens

**Notes:** Suspected root cause or extra context
```

Omit empty sections. Separate bugs with `---`.

## Data model

```ts
Bug {
  id, title, severity: "P0" | "P1" | "P2" | "P3",
  environmentUrl?, steps: string[], expected?, actual?, notes?,
  source: "CLAUDE" | "MANUAL" | "CSV", createdAt
}
```

## Behaviour

- All three input methods append to the same Findings list.
- Toasts for "Added", "Copied" and parse/upload results.
- Inline "Required" validation on Title in the Manual tab.

## Non-functional

- Escape pasted or uploaded content when rendering (no raw HTML).
- Limit CSV size (e.g. 2 MB) with a clear error.
- Responsive: the Findings card moves below the input card on narrow screens.
