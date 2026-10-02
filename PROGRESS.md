# Progress

**Current phase:** 12 done (live at https://rakesh-qa-hub.vercel.app). Next: Phase 13 — Wrap-up.

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

- **Phase 5:** Shared pieces added early (Phase 10 will audit/extend):
  `src/lib/admin.ts` (`requireAdmin`, sha256 + timingSafeEqual; 503 if
  ADMIN_PASSCODE unset), `useAdminPasscode()` dialog hook (sessionStorage, re-asks
  on 401), `useYourName()`/`YourNameField` ("Anonymous" fallback), `Pagination` +
  `pageItems()`, `Markdown` (react-markdown + remark-gfm, skipHtml, safe links,
  `.markdown` styles in globals.css), `formatDate/formatRelative`.
  TC Library: list API returns a 280-char preview; full output via `/[id]`.
  PR reference links: URL / `owner/repo #n` → PR, bare `repo #n` → GitHub PR search.
  Import accepts one entry, an array, or `{entries: [...]}`; max 500 entries / 10 MB.
  Name duplicates allowed with a hint (`/api/tc-library/name-check`).
  Load from TC Library: steps 1–2 listed as "already approved — skip", others
  continue from 3, saved output appended under "Approved Steps 1–2".
  `npm run typecheck` runs `next typegen` first (route types).
  `npm audit`: 3 high in deepmerge-ts via Prisma CLI's @prisma/config — dev-only,
  fix requires a Prisma downgrade; left as is.

- **Phase 6:** Review prompt adds one line to the spec template: "Repo: `owner/name`"
  so Location can link to the PR file (`/pull/N/files#diff-<sha256(path)>R<line>`,
  computed server-side in `withFileUrl`). Table parser finds the first table with
  Flag Type + Detail + Severity columns (others optional, aliases accepted), handles
  escaped pipes / pipes in code / `<br>`. Rows with unknown type or severity other
  than P0/P1 are shown in red in the preview and must be fixed or removed before
  saving (data model allows only P0/P1). Preview rows: inline type/severity selects
  + edit dialog + remove. Flag edit is open to everyone; delete needs passcode.
  Summary endpoint also returns the distinct repo list for the filter.

- **Phase 7:** Dates travel as YYYY-MM-DD and are stored as UTC-midnight `@db.Date`
  (`src/lib/dates.ts`, `fromIsoDate/toIsoDate`); the date picker can't pick future days.
  Hours: > 0, ≤ 24, steps of 0.25. Analytics period selector (7/14/30 days, default 14);
  "Avg hours per day" = total ÷ days that have logs. Charts (Recharts): single-hue bars
  per resource, status bars in the pill colours with text labels, linear daily line,
  tooltips, "Show the data as a table". History pages by date groups (10 dates per
  "Load older dates"). Inline status/hours edit open to all; delete needs passcode.
  Manage resources: add / rename (on blur) / (de)activate; delete (passcode) also deletes
  logs. Inactive resources vanish from form + tabs; history kept. Logging switches the
  history tab to that person.

- **Phase 8:** Counts/% valid computed from Issue rows (`issueCounts` groupBy). Team and
  feature names are unique case-insensitively (409). Issue changes write IssueEvents
  (`diffIssue`: status, valid/invalid, assignee, severity, title/description/reporter
  edits; DELETED before delete). Actor = "Your name". Feature detail: inline status +
  valid switch (optimistic), edit dialog, delete issue / delete feature page (passcode).
  Global search (issues + features) on all Bug Tracker pages; issue results open the
  feature page with `?issue=` highlighted. "View sheet" shows "Coming soon". Workload
  counts valid issues only: open = Open + In Progress, closed = Resolved + Closed, plus
  open P0/P1. Issue display ID = last 6 chars of the cuid. Note: zod 4 `.partial()`
  keeps `.default()`s — patch schemas must be built without defaults.

- **Phase 9:** No suite is hard-coded (`CiSuite` rows only; demo suite only via seed:demo).
  `src/lib/ci/github.ts` (server-only): runs + jobs, workflow check, dispatch, failed
  job log tails; GET responses cached 20 s in memory. Add/edit verifies repo + workflow
  on GitHub when GITHUB_TOKEN is set. Dispatch sends only inputs the suite defines
  (choice values checked) plus an optional branch (default = repo default branch).
  Sections poll every 20 s while a run is queued/in progress. REPORT links to the run's
  artifacts (`#artifacts`) — inferred; a per-suite report URL template could be added
  later. AI root cause (`src/lib/ci/rca.ts`): @anthropic-ai/sdk, `claude-opus-5`,
  structured JSON output, server-side refusal fallback (`fallbacks: "default"`),
  cached in RootCauseCache by `repo#runId`, in-memory daily cap (RCA_DAILY_LIMIT,
  default 50); only when ANTHROPIC_API_KEY is set (currently off → "—").
  Verified locally with the user's `gh` token (read-only) against actions/checkout.

- **Phase 10:** `src/proxy.ts` (Next 16 "proxy" = middleware) applies `src/lib/rate-limit.ts`:
  POST/PATCH 30 / 10 min per IP; CI dispatch 5 / hour; AI root cause 10 / hour; 429 JSON
  + Retry-After. `RATE_LIMIT_DISABLED=1` turns it off for local/CI E2E only — never on
  Vercel. Audit: all 7 DELETE routes call `requireAdmin`; every POST/PATCH body goes
  through `readJson` + zod; no dangerouslySetInnerHTML; no NEXT_PUBLIC_ vars; no
  process.env in client files; client bundle only contains the GITHUB_TOKEN *name* in
  help text. Security headers in next.config.ts (nosniff, referrer policy, DENY
  framing, permissions policy), X-Powered-By off. No CSP yet (Next inline scripts).

- **Phase 11:** Playwright (POM in `e2e/pages/`, 52 tests across navigation + every
  module). Local: `npm run e2e` (build + test) against `qa_hub_test`; global setup
  applies migrations and TRUNCATEs all app tables — refuses non-local hosts (does NOT
  use Prisma's AI-consent bypass). Server for tests: :3100, ADMIN_PASSCODE
  `e2e-passcode`, RATE_LIMIT_DISABLED=1, no GitHub/Anthropic keys. Live mode:
  `BASE_URL=... npx playwright test` skips tests tagged @write unless
  E2E_ALLOW_WRITES=1. `.github/workflows/e2e.yml`: Postgres 16 service → lint,
  typecheck, unit, build (migrate deploy), Playwright; manual `workflow_dispatch`
  with `base_url` runs the suite against a deployed site. Found & fixed via E2E:
  in-table Radix selects opened off-screen → `position="popper"`.

- **Phase 12:** Vercel team `rakesh-qa`, project `rakesh-qa-hub`, production URL
  https://rakesh-qa-hub.vercel.app (subdomain as planned). Functions pinned to `bom1`
  (Mumbai, next to Supabase) via `vercel.json`. Production env: DATABASE_URL,
  DIRECT_URL, ADMIN_PASSCODE (piped from `.env`, never displayed). GITHUB_TOKEN and
  ANTHROPIC_API_KEY unset. Production domain is public (Standard Protection only
  guards preview URLs). Deployed with `vercel deploy --prod` from the CLI;
  `vercel git connect` failed because the Vercel GitHub app isn't installed on the
  user's GitHub account — until it is, deploy with `vercel deploy --prod --scope rakesh-qa`.
  Smoke test: all routes 200, one item created + deleted per DB module (prod left
  empty), deletes refused without passcode. Live Playwright: 30/30 read-only pass.

## Open questions

- Install the Vercel GitHub app for RakeshAM03/rakesh_qa_hub, then run
  `vercel git connect --scope rakesh-qa` so pushes to main auto-deploy.
- Optional: turn Deployment Protection fully off if preview URLs should be public too.
