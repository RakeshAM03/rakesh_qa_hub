# Prompt: PR QA Session Page for Rakesh QA Hub

Build an internal web app page called **PR QA Session** for the **Rakesh QA Hub**. It is a **prompt builder**: QA pastes PR URLs and session details, picks focus areas and steps, clicks **Build Prompt**, edits the generated prompt if needed, and copies it into **Claude Code** (the CLI), which then runs a full QA session on the PR.

The page itself does not call an LLM. It only assembles a structured, copy-ready prompt from the inputs.

## Tech stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, lucide-react icons
- **Storage:** database (or `localStorage` as a fallback) for saved templates
- **Auth:** Google SSO restricted to the company domain
- **Route:** `/pr-qa-session`

## Layout

- Main left sidebar ("Rakesh QA Hub", collapsible) with **PR QA Session** active (grey pill highlight, flask icon).
- Breadcrumb `< Home`, then a flask icon + large bold title "PR QA Session".
- Subtitle: "Paste PR URLs, build the full QA session prompt, edit if needed, then copy into Claude."
- Purple/lavender accent theme for this page.

## 1. "How this works" panel (collapsible)

- Book icon + "How this works — 4-step workflow from PR to findings", chevron on the right, collapsed by default.
- When expanded, show the 4-step workflow:
  1. Paste the PR URL(s) and the test environment URL.
  2. Pick a template, focus areas and steps, then click **Build Prompt**.
  3. Review and edit the generated prompt, then copy it.
  4. Paste it into Claude Code in your terminal; Claude analyses the PR, tests it with Playwright and reports findings.

## 2. "Before you start" notice

Lightbulb icon with a short prerequisites note:

- This prompt runs inside **Claude Code** (the CLI), not Claude.ai. Two things must be set up:
  - `gh` CLI authenticated — run `gh auth login` in your terminal.
  - **Playwright MCP** connected — add it under MCP Servers in Claude Code settings.

## 3. Session Inputs card

Card with a purple top border and a lavender header: flask icon + "Session Inputs".

### Templates

- Label `TEMPLATES` with pill buttons: **Full Session**, **API Only**, **UI Regression**, **Security**.
- Clicking a template pre-fills focus areas and the selected steps:

  | Template      | Focus areas                     | Steps selected                         |
  |---------------|---------------------------------|----------------------------------------|
  | Full Session  | All                             | 1–10                                   |
  | API Only      | Contract Testing, Regression    | 1, 2, 3, 7, 8, 9, 10                   |
  | UI Regression | UI / UX, Regression             | 1, 2, 4, 5, 6, 7, 8, 10                |
  | Security      | Security                        | 1, 2, 3, 6, 7, 8, 10                   |

  (Mappings are a sensible default; keep them in a config file.)

- **Save current** (save icon): saves the current inputs (focus areas, steps, context, spec reference) as a named custom template, which then appears as another pill.

### Fields

| Field | Details |
|---|---|
| **Frontend PR URL** | Text input, placeholder `https://github.com/org/repo/pull/123` |
| **Backend PR URL** | Same placeholder, side by side with the frontend field |
| Helper text | "At least one PR URL is required. Provide both for contract mismatch analysis." |
| **+ Add another PR** | Adds extra PR URL inputs (removable) |
| **Test Environment URL** | Full-width input, placeholder `https://your-env.example.com` |
| **Additional Context** | Optional textarea — e.g. what the feature does, known edge cases |
| **Focus Areas** | Optional multi-select chips: Contract Testing, UI / UX, Security, Performance, Regression (outlined when off, filled when on) |
| **Steps** | Multi-select chips, all selected (filled purple) by default, with **All / None** links on the right; "deselect steps you don't need" |
| **Playwright Spec Style Reference** | Optional resizable textarea, placeholder "Paste a sample .spec.ts file here..." — used in Step 9 so Claude mirrors the team's style |

Validate PR URLs against the GitHub pull request URL pattern.

### Steps (chips)

1. Analyse the PR
2. Test Plan
3. Feature Validation
4. UI Validation
5. UX Validation
6. Exploratory
7. Report
8. Defect Consolidation
9. Automation Generation
10. Session Closure Checklist

### Build Prompt button

- Flask icon + **Build Prompt**, disabled (greyed) until at least one PR URL is entered.
- On click, generate the prompt and show the output panel below.

## 4. Generated prompt panel

- Large editable textarea (monospace) holding the full generated prompt.
- **Copy** button (copies to clipboard, shows a "Copied" toast), **Reset** (regenerate from inputs), and an optional **Download .md**.
- Character/line count.

### Structure of the generated prompt

Assemble it from the inputs, including only the selected steps, renumbered in order:

```markdown
You are a senior QA engineer running a full QA session on the PR(s) below,
using the gh CLI and the Playwright MCP.

## Inputs
- Frontend PR: <url or "not provided">
- Backend PR: <url or "not provided">
- Additional PRs: <list>
- Test environment: <url>
- Context: <additional context>
- Focus areas: <selected focus areas — give these extra attention>

## Steps
1. Analyse the PR — use `gh pr view` and `gh pr diff` to read the description,
   changed files and linked tickets. Summarise what changed and the risk areas.
   If both frontend and backend PRs are given, compare API contracts
   (endpoints, request/response fields, types) and flag mismatches.
2. Test Plan — list test scenarios (positive, negative, edge, regression)
   with priority, based on the analysis.
3. Feature Validation — execute the functional scenarios on the test
   environment with Playwright MCP; record pass/fail with evidence.
4. UI Validation — check layout, alignment, responsiveness, visual states.
5. UX Validation — check flows, error messages, empty/loading states, accessibility basics.
6. Exploratory — free-form testing around the changed areas to find unexpected issues.
7. Report — summarise results in a table: scenario, result, evidence, notes.
8. Defect Consolidation — deduplicate failures into bugs, each with title,
   steps to reproduce, expected vs actual, severity, environment.
9. Automation Generation — write Playwright TypeScript specs for the key
   scenarios. <If a spec reference was pasted: "Follow the style of this
   reference spec:" + the pasted code>
10. Session Closure Checklist — confirm every step is done, list open risks,
    and give a go / no-go recommendation.

## Output
Work through the steps in order, and show the output of each step under its own heading.
```

## Behaviour

- Inputs persist in the page state while navigating within the session (and optionally in `localStorage` as a draft).
- Selecting a template overwrites focus areas and steps but not URLs or context.
- **All / None** toggles every step chip.
- Steps are renumbered in the generated prompt when some are deselected.

## Non-functional

- No secrets stored or sent; everything runs client-side except saved templates.
- Responsive down to tablet width; the two PR URL fields stack on small screens.
