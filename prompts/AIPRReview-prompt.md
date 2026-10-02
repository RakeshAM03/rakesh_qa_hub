# Prompt: AI PR Review Page for Rakesh QA Hub

Build an internal web app page called **AI PR Review** for the **Rakesh QA Hub**. It does two things:

1. **Generates a focused code review prompt** from one or more PR URLs, which QA runs in Claude.
2. **Logs the review flags** Claude finds (parsed automatically from Claude's output, or entered manually) into a searchable table of all flags across all sessions.

The page does not call an LLM itself; it builds prompts and parses pasted output.

## Tech stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, lucide-react icons
- **Backend:** Next.js API routes with a database (PostgreSQL + Prisma, or similar)
- **Auth:** Google SSO restricted to the company domain (used for "Logged by")
- **Route:** `/ai-pr-review`

## Layout

- Main left sidebar ("Rakesh QA Hub", collapsible) with **AI PR Review** active (grey pill highlight, shield-check icon).
- Breadcrumb `< Home`, then a purple shield-check icon + large bold title "AI PR Review".
- Subtitle: "Generate a focused code review prompt from a PR, or log AI review flags from a PR QA session."
- Three stacked cards. The first two have lavender headers with a collapse chevron.
- Purple accent colour for primary buttons and active filters.

## 1. Generate code review prompt (collapsible card)

- Helper text: "Paste one or more PR URLs to generate a focused code review prompt. Run it in Claude, then paste the output into 'Log flags from session' below."
- **PR URLs** textarea (resizable). Placeholder: `https://github.com/org/repo/pull/123, https://github.com/org/repo/pull/456` or one per line. Accept comma- or newline-separated values.
- **Generate** button (purple; light/disabled until at least one valid PR URL is entered).
- On Generate, show the generated prompt in a read-only/editable code box with a **Copy** button.

### Generated prompt structure

```markdown
You are a senior engineer doing a focused code review of these PRs:
<list of PR URLs>

Use `gh pr view` and `gh pr diff` to read each PR. Review only the changed code and
the code it directly affects. Look for:
- Logic Error — wrong conditions, ordering, state or data handling
- Regression Risk — changes that can break existing behaviour
- Security — injection, auth/permission gaps, secrets, unsafe input handling
- Missing Error Handling — unhandled failures, missing retries/rollbacks, silent errors
- Requirement Fidelity — code that doesn't match the PR description or ticket

Severity:
- P0 — blocks release; data loss, security hole, broken core flow
- P1 — must fix soon; wrong behaviour in real scenarios
(lower levels optional)

Output ONLY real issues, no style nits, as a markdown table with these columns:
| Repo | Flag Type | Location | Detail | Severity | Suggested Fix |
- Location: `#<PR number> > <file path>:<line>`
- Detail: what is wrong and the concrete scenario where it fails
- Suggested Fix: the specific change to make
```

## 2. Log flags (collapsible card)

Segmented toggle at the top: **From Claude output** (default) | **Enter manually**.

### From Claude output

- Label **Paste Claude's output**, helper "Paste the full review output — the flag table will be extracted automatically."
- Large textarea, placeholder "Paste Claude's review output here..."
- Parse the first markdown table that has the expected columns (match headers case-insensitively); ignore surrounding text.
- Show a **preview table** of extracted flags with per-row remove and inline edit, plus a computed count ("<N> flags found").
- **Save flags** button stores them with today's date and the signed-in user as "Logged by". Show an error if no table is found.

### Enter manually

Form with: Repo, Flag Type (dropdown of the 5 types), Location, Detail (textarea), Severity (P0 / P1), Suggested Fix (textarea), and **Add flag**.

## 3. All logged flags (card)

**Header:** "All logged flags", subtitle "<N> flags across all sessions".

**Flag type summary bar:** each of the five flag types with its computed count, shown as `<Flag Type> — <count>` (e.g. `Logic Error — <N>`). Clicking one filters the table to that type.

**Filters row**
- **Search flags...** input (searches detail, location, repo, suggested fix).
- Severity toggle pills: **All** (active, purple) / **P0** / **P1**.
- **All repos** dropdown listing distinct repos.

**Pagination row:** "Rows per page" select (10 / 25 / 50, default 25), "<from>–<to> of <total>", first / prev / page numbers with ellipsis / next / last.

**Table**

| Column        | Content                                                                  |
|---------------|--------------------------------------------------------------------------|
| Date          | `MM/DD/YYYY`, truncated with full value on hover                         |
| Repo          | Repository name, truncated                                               |
| Flag Type     | Bold type label                                                          |
| Location      | Purple link `#<PR> > <file path>` to the PR file on GitHub, truncated    |
| Detail        | Full wrapped text explaining the issue                                   |
| Severity      | Small pill: P0 red, P1 amber                                             |
| Logged by     | User name, truncated                                                     |
| Suggested Fix | Wrapped text                                                             |

- Long Detail and Suggested Fix text wraps; consider a max height with "Show more", or open the row in a side drawer on click.
- [inferred] Row actions for edit and delete for the person who logged it.

## Data model

```ts
Flag {
  id, date, repo, prNumber, filePath, line?,
  flagType: "LOGIC_ERROR" | "REGRESSION_RISK" | "SECURITY" |
            "MISSING_ERROR_HANDLING" | "REQUIREMENT_FIDELITY",
  detail, severity: "P0" | "P1",
  suggestedFix, loggedBy, source: "CLAUDE_OUTPUT" | "MANUAL", createdAt
}
```

## API routes

| Route                                                        | Purpose                          |
|--------------------------------------------------------------|----------------------------------|
| `POST /api/ai-pr-review/flags`                               | Save one or many flags           |
| `GET /api/ai-pr-review/flags?q=&severity=&repo=&type=&page=&size=` | List with filters and pagination |
| `GET /api/ai-pr-review/flags/summary`                        | Counts per flag type             |
| `PATCH` / `DELETE /api/ai-pr-review/flags/[id]`              | Edit or remove a flag            |

## Behaviour

- Filters combine (search + severity + repo + type) and reset pagination to page 1.
- Search is debounced.
- Summary counts reflect all flags (not just the current filter).
- Loading skeletons and empty states for the table.

## Non-functional

- Validate PR URLs against the GitHub pull request URL pattern.
- Escape pasted content when rendering (no raw HTML).
- Responsive down to tablet width; the table scrolls horizontally on small screens.
