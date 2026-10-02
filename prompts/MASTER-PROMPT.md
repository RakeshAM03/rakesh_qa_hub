# Master Prompt for Claude Code — Build & Deploy Rakesh QA Hub

## How to use this

1. Clone the repo and open a terminal in it:
   ```bash
   git clone https://github.com/RakeshAM03/rakesh_qa_hub.git
   cd rakesh_qa_hub
   ```
2. Make sure the `prompts/` folder contains all the files:
   `CI-prompt.md`, `CIskill.md`, `BugTracker-prompt.md`, `QATracker-prompt.md`, `PRQASession-prompt.md`, `AIPRReview-prompt.md`, `TCLibrary-prompt.md`, `BugFormatter-prompt.md`, `DEPLOYMENT-GUIDE.md`, and this file.
3. Start Claude Code:
   ```bash
   claude
   ```
4. Copy **everything inside the box below** and paste it as your first message.
5. Answer Claude's questions when it stops at a checkpoint. It's told to wait for you before anything that needs your accounts, passwords or approval.

**Before you start, keep these ready** (Claude will ask for them at the right time):

| Item | Where to get it | Needed in phase |
|---|---|---|
| Supabase connection strings (pooler 6543 + direct 5432) | supabase.com → New project (region Mumbai) → Settings → Database | 2 |
| An admin passcode you choose | Make one up (12+ characters) | 2 |
| Vercel login | `npx vercel login` (opens your browser) | 10 |
| GitHub fine-grained token (Actions read/write) | GitHub → Settings → Developer settings → Fine-grained tokens | 9 (optional) |
| Anthropic API key | console.anthropic.com | 9 (optional) |

A full build takes several hours of Claude's work across many turns. If the session gets long, see "Resuming later" at the end.

---

## The prompt (copy everything inside the box)

````markdown
# Task: Build and deploy "Rakesh QA Hub" end to end

You are working in my GitHub repo https://github.com/RakeshAM03/rakesh_qa_hub
(already cloned; you are in its root). Build a complete Next.js web app with
seven QA modules and deploy it to a public Vercel URL that anyone can open and
use without logging in.

## Source of truth

The `prompts/` folder contains one detailed spec per module. Read every file in
`prompts/` before writing any code:

| Module         | Spec file                         | Route            |
|----------------|-----------------------------------|------------------|
| CI Reports     | prompts/CI-prompt.md (+ CIskill.md) | /ci            |
| Bug Tracker    | prompts/BugTracker-prompt.md      | /bug-tracker     |
| QA Tracker     | prompts/QATracker-prompt.md       | /qa-tracker      |
| PR QA Session  | prompts/PRQASession-prompt.md     | /pr-qa-session   |
| AI PR Review   | prompts/AIPRReview-prompt.md      | /ai-pr-review    |
| TC Library     | prompts/TCLibrary-prompt.md       | /tc-library      |
| Bug Formatter  | prompts/BugFormatter-prompt.md    | /bug-formatter   |

`prompts/DEPLOYMENT-GUIDE.md` has the setup steps, Prisma schema, protection
rules and Vercel settings. Follow it unless it conflicts with a spec file; if it
does, ask me.

Items marked `[inferred]` in the specs are guesses: build a simple, working
version of them.

The sidebar also lists "QA Digest" (/qa-digest). There is no spec for it yet:
build a placeholder page saying "Coming soon" and move on.

## Tech stack (fixed — don't change without asking)

- Next.js (App Router, `src/` dir), TypeScript, Tailwind CSS, shadcn/ui, lucide-react
- Prisma + PostgreSQL on Supabase
- zod for validating every API body
- recharts (QA Tracker analytics), papaparse (CSV), react-markdown (TC Library)
- Playwright (TypeScript) for E2E tests
- Deploy: Vercel

## How to work

1. **Start by asking me your clarifying questions** — all of them in one message,
   numbered, each with your recommended default. Don't write code until I answer.
   Questions I expect at minimum:
   - Is the repo empty, or is there existing code to keep?
   - Which Vercel subdomain should we try (e.g. rakesh-qa-hub)?
   - Do you have a GitHub token for CI Reports yet? (CI suites are added in the app.)
   - Should the AI root-cause feature be on (needs an Anthropic key) or off?
   - Anything else in the specs that is ambiguous.
2. Then write a plan to `PLAN.md` (phases, files, order) and show it to me.
   Wait for my "go".
3. Work **phase by phase** (below). At the end of each phase:
   - run `npm run lint` and `npm run build` and fix every error;
   - start the app and check the new pages actually load (use the Playwright MCP
     if available, otherwise `curl` the routes and run the Playwright tests);
   - commit with a clear message and push to `main`;
   - tick the phase off in `PLAN.md`;
   - give me a 3–5 line summary: what's done, anything that differs from the
     spec, anything you need from me.
   Then continue to the next phase **without waiting**, unless the phase is marked
   🛑 CHECKPOINT.
4. If something in a spec is unclear or contradicts another spec, **stop and ask
   me** instead of guessing — unless it's a minor UI detail, in which case pick
   the simplest option and note it in your summary.
5. If a step fails three times, stop, explain what you tried, and ask me.
6. Keep `PROGRESS.md` updated (current phase, decisions made, open questions)
   so a new session can resume from it.

## Phases

### Phase 0 — Read and plan
Read all `prompts/` files. Ask clarifying questions. Write `PLAN.md`.
🛑 CHECKPOINT: wait for my answers and "go".

### Phase 1 — Project setup + app shell
- Create the Next.js app in the repo root (keep `prompts/`). Install the stack.
- Collapsible left sidebar titled "Rakesh QA Hub" with all nav items and icons
  from the specs (Bug Tracker as an expandable group: Dashboard, Activity,
  Workload). Nav config in `src/config/nav.ts`.
- Shared `PageHeader` component (`< Home` breadcrumb, icon, title, subtitle, actions).
- Home page with a card per module.
- Placeholder page for every route. Toast provider. Mobile drawer sidebar.
- `.gitignore` must include `.env` and `.env*.local`.

### Phase 2 — Database
- 🛑 CHECKPOINT: ask me for the Supabase pooler URL, direct URL and the admin
  passcode. Write them into `.env` only (never into code, never commit them).
  Create `.env.example` with empty values and commit that instead.
- Prisma schema from DEPLOYMENT-GUIDE.md, adjusted to cover every spec's data model.
- Run the migration. Shared client in `src/lib/db.ts`.
- `prisma/seed.ts` creates only what the app needs to run — no CI suites, teams,
  feature pages or resources (users add them in the app). Run the seed.
- Optional `npm run seed:demo` with clearly generic demo data only ("Demo Team",
  "Sample Feature", "Demo Resource 1", "Demo Suite") — for local testing and E2E
  only, never run against production automatically. No real company names,
  people, PR links or bugs.
- Add `"postinstall": "prisma generate"` and make `build` run
  `prisma migrate deploy && next build`.

### Phase 3 — Bug Formatter (`/bug-formatter`)
Implement `prompts/BugFormatter-prompt.md` fully: three tabs, parser, manual form,
CSV upload + template download, Findings panel, exports.
Write unit tests for the paste parser and CSV mapping.

### Phase 4 — PR QA Session (`/pr-qa-session`)
Implement `prompts/PRQASession-prompt.md`: templates (+ save current to DB),
inputs, focus areas, step chips with All/None, Build Prompt, editable output
with Copy/Reset/Download. Unit-test the prompt builder (step renumbering).

### Phase 5 — TC Library (`/tc-library`)
Implement `prompts/TCLibrary-prompt.md`: save card, list with search and actions,
JSON import/export. Also add "Load from TC Library" to PR QA Session as the spec
describes.

### Phase 6 — AI PR Review (`/ai-pr-review`)
Implement `prompts/AIPRReview-prompt.md`: prompt generator, log flags (parse
Claude's markdown table + manual form), all-flags table with type counts,
severity/repo filters, search and pagination. Unit-test the table parser.

### Phase 7 — QA Tracker (`/qa-tracker`)
Implement `prompts/QATracker-prompt.md`: multi-row log entry with validation,
Manage resources dialog, analytics charts, per-resource tabs, date-grouped
history with search and date filter.

### Phase 8 — Bug Tracker (`/bug-tracker` + `/activity`, `/workload`, `/[featureId]`)
Implement `prompts/BugTracker-prompt.md`: team sidebar with counts, feature table
with % valid pills, New Team and New Feature Page modals, feature detail page,
Activity feed and Workload view. Skip the Google Sheets "View sheet" integration
for now — keep the dropdown but show "Coming soon".

### Phase 9 — CI Reports (`/ci`)
Implement `prompts/CI-prompt.md`: database-driven suites (`CiSuite`) with
add / edit / delete / reorder, empty state, a section per saved suite, runs table,
Run Workflow, polling, pagination. No suite is hard-coded in code, config or seed.
- If `GITHUB_TOKEN` is not set, the page must still work: show each section with
  a friendly "Connect GitHub to see runs" empty state, never crash.
- AI root cause: only if I said yes in Phase 0 and `ANTHROPIC_API_KEY` is set;
  cache results in the DB per run ID. Otherwise hide the column's content
  ("—").
- 🛑 CHECKPOINT (only if I want CI connected now): ask me for the token. I add
  the suites myself in the app.

### Phase 10 — Public-access protection
The app is public with no login. Add:
- `ADMIN_PASSCODE` check (header `x-admin-passcode`) on: CI dispatch, adding /
  editing / reordering CI suites, every DELETE route and "Clear all". UI shows a small passcode dialog first and
  remembers it in sessionStorage.
- In-memory rate limiter on POST/PATCH (30 per 10 min per IP), friendly 429.
- zod validation on every API route; escape all user content when rendering.
- Confirm no secret is ever sent to the browser (`NEXT_PUBLIC_` must not hold
  secrets).

### Phase 11 — Tests
- Playwright E2E tests, page object model, for every module's main flow
  (navigation, create, validate, parse, filter).
- `.github/workflows/e2e.yml` running lint, build, unit tests and Playwright on
  every push and PR.
- All tests must pass locally before moving on.

### Phase 12 — Deploy to Vercel
- 🛑 CHECKPOINT: tell me to run `npx vercel login` myself (it needs my browser),
  and wait for me to confirm.
- Link the project (`npx vercel link`), set every environment variable from
  `.env` with `npx vercel env add` for Production (ask me before each secret if
  you don't already have it), then deploy with `npx vercel --prod`.
- Try to set the subdomain I chose. If it's taken, ask me for an alternative.
- Remind me to turn OFF Settings → Deployment Protection → Vercel Authentication
  for production, so the link opens without a Vercel login. Wait for me to confirm.
- Smoke-test the live URL: open every route, create one item in each DB module,
  check the CSV template download. Point the Playwright suite at the live URL
  (`BASE_URL`) and run it.

### Phase 13 — Wrap-up
- `README.md`: what the hub is, live link, screenshot of the home page,
  module list, tech stack, local setup, env vars (names only), test commands.
- Make sure `git log --all -- .env` shows nothing and no token appears anywhere
  in the repo (search for `ghp_`, `github_pat_`, `sk-ant-`, `postgresql://`).
- Final summary for me: live URL, what's done, what's still `[inferred]` or
  "coming soon", and a short list of next steps.

## Rules

- Never commit `.env` or any secret. Never print a full secret back to me.
- Never use real company names, employee names, internal URLs, PR links or bug
  data from any employer. Demo data must be fictional.
- Don't delete or rewrite files in `prompts/`.
- Don't change the tech stack, routes or data models without asking.
- Don't run destructive git commands (force push, reset --hard, branch deletion)
  without asking.
- Everything starts empty and user-managed: every module needs a friendly empty
  state with a clear "add first item" action.
- Prefer small, readable components; one folder per module under
  `src/components/<module>/`; API routes under `src/app/api/<module>/`.
- When you finish a phase, keep going to the next one unless it's a checkpoint
  or you are blocked.

Start with Phase 0 now: read everything in `prompts/`, then ask me your
clarifying questions.
````

---

## Tips while Claude works

- **Approvals:** Claude Code asks permission before running commands. To let it work faster, approve "always allow" for safe ones like `npm run build`, `npm run lint`, `npx prisma ...`, `git add` and `git commit`.
- **Stay in control:** if it drifts from the spec, just say "Stop — this doesn't match `prompts/X.md` section Y, fix it."
- **Review each phase:** open http://localhost:3000 after each phase summary and click through the new module before letting it continue.
- **Cost of tokens:** this is a big build. If you hit usage limits, it resumes cleanly thanks to `PLAN.md` and `PROGRESS.md`.

## Resuming later

If the session ends or gets too long, start a new one with:

```
Continue building Rakesh QA Hub. Read PLAN.md and PROGRESS.md, then
prompts/MASTER-PROMPT.md for the full rules. Tell me which phase you're
resuming from and what's left, then continue.
```

## If something goes wrong

| Problem | What to tell Claude |
|---|---|
| Build fails on Vercel but works locally | "Read the Vercel build logs with `npx vercel logs` and fix the error." |
| Database errors on Vercel | "Check DATABASE_URL uses the pooler with `?pgbouncer=true` and DIRECT_URL uses port 5432." |
| Live link asks visitors to log in | Turn off Deployment Protection in Vercel settings yourself. |
| A module doesn't match the screenshot you remember | "Compare `/route` with `prompts/X-prompt.md` and list every difference, then fix them." |
