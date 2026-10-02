# Prompt: TC Library Page for Rakesh QA Hub

Build an internal web app page called **TC Library** for the **Rakesh QA Hub**. It stores the **Step 1 (PR analysis) + Step 2 (approved test plan)** outputs from Claude Code QA sessions, so they can be reloaded and reused in future sessions instead of being regenerated.

It works together with the **PR QA Session** page, whose steps 1 and 2 are "Analyse the PR" and "Test Plan".

## Tech stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, lucide-react icons, a markdown renderer (react-markdown)
- **Backend:** Next.js API routes with a database (PostgreSQL + Prisma, or similar)
- **Auth:** Google SSO restricted to the company domain
- **Route:** `/tc-library`

## Layout

- Main left sidebar ("Rakesh QA Hub", collapsible) with **TC Library** active (grey pill highlight, bookmark-book icon).
- Breadcrumb `< Home`, then a teal bookmark-book icon + large bold title "TC Library".
- Subtitle: "Save Step 1 + Step 2 outputs from Claude sessions and reload them in future sessions."
- Header actions on the right:
  - **Import JSON** (outlined, upload icon)
  - **+ New Entry** (filled teal)
- Teal accent colour for this page.

## 1. Save Test Plan card (opened by "+ New Entry")

Inline card with a teal top border, title **Save Test Plan**, and a close (×) icon.

Helper text: "After Claude completes Step 2, copy its Step 1 analysis + Step 2 approved test plan from the Claude Code session and paste it below."

| Field | Details |
|---|---|
| **NAME \*** | Required text input, placeholder "e.g. Checkout Flow — Oct 2026" |
| **PR REFERENCE** (optional) | Text input, placeholder "e.g. my-repo #42"; accepts `repo #number` or a full PR URL |
| **STEP 1 + STEP 2 OUTPUT \*** | Required large textarea (markdown), placeholder "Paste Claude's Step 1 analysis and Step 2 approved test plan here..." |

- Name and PR Reference sit side by side; the output textarea is full width.
- **Save to Library** button (book icon), disabled/greyed until Name and Output are filled.
- On save: store the entry, close the card, show a success toast, and add the entry to the top of the library list.

## 2. Library list [inferred — not visible in the screenshot]

Shown below the header (and below the card when it's open).

- **Search** box (name, PR reference, content) and a sort selector (newest first by default).
- Each entry as a card or table row with: name, PR reference (linked to GitHub when it's a URL or `repo #number`), saved by, saved date, and a short preview of the output.
- Row actions:
  - **View**: open the full output rendered as markdown in a drawer or detail page.
  - **Copy**: copy the full output to the clipboard so it can be pasted back into a Claude Code session as already-approved Steps 1–2.
  - **Edit**: reopen the Save Test Plan card pre-filled.
  - **Export JSON**: download that entry as JSON.
  - **Delete**: with a confirmation (in-app modal, not a browser alert).
- Empty state: "No saved test plans yet. Click New Entry after Claude completes Step 2."

## 3. Import JSON

- Opens a file picker for `.json`.
- Accepts a single entry or an array of entries:

```json
[
  {
    "name": "Checkout Flow — Oct 2026",
    "prReference": "my-repo #42",
    "output": "## Step 1 — PR Analysis\n...\n## Step 2 — Test Plan\n..."
  }
]
```

- Validate each entry (name and output required), show a preview with a count ("<N> entries ready to import"), skip or flag invalid ones, then **Import**.
- Offer an **Export all** option so the library can be backed up and re-imported.

## 4. Reuse in PR QA Session [inferred]

- On the PR QA Session page, add a **Load from TC Library** option that lets the user pick a saved entry.
- The generated session prompt then includes the saved Step 1 + Step 2 output and tells Claude to **skip Steps 1–2 and start from Step 3** using that approved plan.

## Data model

```ts
TestPlanEntry {
  id, name, prReference?: string, output: string,   // markdown
  createdBy, createdAt, updatedAt
}
```

## API routes

| Route                                  | Purpose                                     |
|----------------------------------------|---------------------------------------------|
| `GET /api/tc-library?q=&page=`         | List entries with search and pagination     |
| `GET /api/tc-library/[id]`             | One entry with full output                  |
| `POST /api/tc-library`                 | Create an entry                             |
| `POST /api/tc-library/import`          | Bulk import from JSON                       |
| `PATCH` / `DELETE /api/tc-library/[id]` | Edit or delete an entry                    |
| `GET /api/tc-library/export`           | Export all entries as JSON                  |

## Behaviour

- Inline "Required" validation on Name and Output.
- Warn before closing the Save card if there is unsaved text.
- Duplicate names are allowed but show a hint if one already exists.

## Non-functional

- Render pasted markdown safely (escape raw HTML).
- Limit output size (e.g. 1 MB) with a clear error.
- Responsive down to tablet width; Name and PR Reference stack on small screens.
