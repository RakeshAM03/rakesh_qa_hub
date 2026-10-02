# Progress

**Current phase:** 4 done (PR QA Session). Next: Phase 5 — TC Library.

## Decisions (Phase 0)

1. Keep existing `prompts/`, `.gitignore`, `.claude/settings.json`, `.env`.
2. AI root cause: off (no ANTHROPIC_API_KEY); code path exists, column shows "—".
3. CI Reports: no hard-coded suites anywhere; `CiSuite` model, users add/edit/delete/reorder
   suites in the app (passcode). No GITHUB_TOKEN → "Connect GitHub to see runs".
4. Vercel: team `rakesh-qa`, subdomain `rakesh-qa-hub` (fallback `rakesh-qa-hub-demo`).
5. `prompts/` made fully generic (explicitly approved): no product/team/feature/people
   names, neutral example values, computed counts. Git history replaced by a single
   orphan commit "Initial commit: generic prompts and plan".
5b. Everything starts empty: default seed creates 0 CI suites, teams, feature pages,
   resources. Optional `npm run seed:demo` ("Demo Team", "Sample Feature",
   "Demo Resource 1", "Demo Suite") for local/E2E only, never auto-run on production.
   Every module has a friendly empty state with an "add first item" action.
6. No auth. "Your name" field (localStorage) fills Logged by / Saved by / reporter;
   fallback "Anonymous". QA Tracker opens on the first resource's tab.
7. Every DELETE route + CI dispatch needs ADMIN_PASSCODE.
8. Bug Formatter is client-only (localStorage); its Clear all uses an in-app confirm, no passcode.
9. New `IssueEvent` model for the Bug Tracker Activity feed.
10. Issue status: OPEN, IN_PROGRESS, RESOLVED, CLOSED. Workload by assignee.
11. QA Tracker resources: none seeded; "Manage resources" dialog (add / rename /
   deactivate; delete needs passcode).
12. Prisma 6 (keeps url/directUrl in schema.prisma). Vitest for unit tests. sonner for toasts.
13. GitHub Actions E2E: Postgres service container, migrate + seed, then lint/unit/build/Playwright.
14. No nightly reset cron (next step).
15. Date formats per spec (QA Tracker DD/MM/YYYY, AI PR Review MM/DD/YYYY).
16. Jira export = Jira wiki markup; .md download = spec Markdown.
17. % VALID with 0 issues → grey "—" pill.
18. In-memory rate limiter accepted (per serverless instance).

## Phase notes

- **Phase 1:** Next.js 16.3 (App Router, `src/`), React 19.2, Tailwind 4, shadcn/ui
  (radix-nova preset; `cn` helper comes from shadcn's `cn` package), zod 4, recharts 3,
  Vitest 5, Playwright. `@types/node` ^22 (Vitest peer). npm 11 blocks package install
  scripts until approved (`npm install-scripts approve <pkg>`) — matters for Prisma.
  Sidebar collapse state stored via `useLocalStorage` (useSyncExternalStore).
  `.playwright-mcp/` is git-ignored. Next 16 ships its own docs in
  `node_modules/next/dist/docs/` (see AGENTS.md).

- **Phase 2:** Prisma 6.19. Install scripts for prisma/@prisma/* (and esbuild,
  fsevents, unrs-resolver) approved in package.json `allowScripts` — version-pinned,
  re-approve after upgrades. Migration `init` applied to Supabase. Enums for fixed
  value sets; unique names for Team, FeaturePage, Resource. `IssueEvent` keeps
  `issueTitle` and uses SetNull so the feed survives deletes.
  Supabase password had unencoded reserved chars — user percent-encoded it in `.env`
  (remember for Vercel env vars: use the same encoded URLs).
  Default seed inserts nothing. `seed:demo` needs `ALLOW_DEMO_SEED=1`, refuses on
  production, `--reset` removes demo rows. Never run it against Supabase.
- **Local test DB:** Homebrew `postgresql@16`, started with
  `/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 start`
  (not a login service). Database `qa_hub_test`, URL
  `postgresql://rakesham@localhost:5432/qa_hub_test` — pass as DATABASE_URL and
  DIRECT_URL env vars (they override `.env`).

- **Phase 3:** Bug Formatter is client-only; findings stored in localStorage
  (`qa-hub:bug-formatter:findings`, zod-validated on read). Parser extras beyond spec:
  severity may be bracketed/trailing, label lines may be bold/bulleted, unlabelled
  lines before the first label become notes, prose after a blank line ends an item,
  single-line steps split on , ; > -> →. New bugs are inserted by severity; drag
  handle (or arrow keys on it) reorders. Edited bugs keep their position.
  Jira export = wiki markup; Slack escapes & < >.

- **Phase 4:** Shared `src/lib/api.ts` (readJson + zod, 2 MB body cap, Prisma error
  helpers) and `src/lib/github.ts` (PR URL parsing, list splitting). DB GET routes use
  `dynamic = "force-dynamic"`. Built-in templates in `src/config/pr-qa-templates.ts`;
  custom ones via `/api/pr-qa-session/templates` (GET/POST, names unique, built-in
  names reserved). Picking a saved template applies focus areas + steps + spec ref,
  and its context only if the context field is empty (spec: templates don't
  overwrite context). Manual chip changes clear the template highlight. Contract
  comparison sentence in step 1 appears only when both PRs are given. Inputs kept
  as a localStorage draft. Manual testing runs against the local `qa_hub_test` DB.

## Open questions

None.
