# Progress

**Current phase:** All done — original 13 phases, N0–N10, M0–M5, Phase Q (Test Case Generator upgrade), Phase P (PR QA Session prompt rebuild) and Phase G (user guide). Live at https://rakesh-qa-hub.vercel.app.

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
- **Phase 13:** README (live link, screenshot `docs/home.png`, modules, stack, setup,
  env var names, tests, deployment). Secret scan: `.env` never in git history; no
  `ghp_` / `github_pat_` / `sk-ant-` anywhere; `postgresql://` only placeholders,
  the CI throwaway DB and the local test DB.

## New modules (7) — decisions (Phase N0, 2026-10-04)

Spec: `prompts/NEW-MODULES-MASTER-PROMPT.md`. Phases N0–N10 in PLAN.md.

1. Per-phase builds use `npm run build:app` (no migrate) against the local `qa_hub_test`
   DB; Supabase gets the new migration only in the Phase N9 Vercel build.
2. One model constant `AI_MODEL = "claude-sonnet-5-5"` in `src/config/ai.ts` (user's
   choice: cheaper; these features don't need Opus). CI Reports root cause uses it too.
3. Cross-module prefill (Send to Bug Formatter / PR QA Session) via a one-shot
   sessionStorage handoff read on page load — nothing sensitive in URLs.
4. Every DELETE still needs ADMIN_PASSCODE (incl. gates, risk areas, known issues, environments).
5. "Standard release" template inserted by the `new_modules` migration SQL
   (id `builtin_standard_release`); E2E global setup re-inserts it after TRUNCATE.
6. API Playground SSRF: block beyond spec (0/8, 100.64/10, multicast/reserved,
   IPv4-mapped IPv6, fc00::/7, fe80::/10); check the resolved IP inside the socket
   lookup (no DNS-rebinding gap); manual redirects (max 5), re-checked per hop.
7. API Playground E2E mocks the send route; real-network test only with `E2E_NETWORK=1`.
8. CodeMirror 6 for code inputs; `fast-xml-parser`; `fflate` for the converter zip.
9. Converter = regex/line rules with brace tracking (no Java AST); TODO(convert) fallback.
10. No ANTHROPIC_API_KEY → AI buttons hidden, "Copy prompt for Claude" instead (all AI modules).
11. ROI: create project + snapshot open; edit/delete + currency change need passcode;
    CI data capped at 1,000 runs per suite per period.
12. Failure Analyzer parses client-side only (no optional server parse route); From CI
    reuses CI Reports' failed-job log code.
13. Push after every phase; deploy only in N9 (`vercel deploy --prod --scope rakesh-qa`).
14. All 7 modules, in phase order.

### New-module phase notes

- **N1:** `navGroups` in `src/config/nav.ts` (Testing / Planning / Automation Tools /
  Insights); `navItems` is the flattened list. Sidebar group headings collapse, state in
  localStorage `qa-hub:nav-groups-closed`; with the sidebar collapsed to icons, groups
  show as separators. Home cards grouped the same way (one list per group).
  Migration `new_modules`: 17 additive tables + AppSetting; links to Bug Tracker
  feature pages / CI suites are soft (plain ids, no FK) so existing models are untouched.
  Gate weight [inferred]: effective weight = weight × 3 for blockers.
  NO_P0_FLAGS default window 14 days [inferred]. Placeholder pages for the 7 routes.
- **N2 Locator Helper:** client-only engine in `src/lib/locators/` (quote, autogen, dom,
  match, strategies, page-object, tree, ai-prompt); 35 unit tests run on jsdom documents
  (devDependency). Pasted HTML goes through DOMParser only (inert) and is shown as a
  text tree. Uniqueness for role/label/placeholder uses Playwright's default matching
  (case-insensitive substring); text uses exact deepest-element matching. Accessible
  name is simplified [inferred] (aria-labelledby, aria-label, label, value, content,
  alt, title). "Short CSS" scopes to a classed ancestor, else falls back to
  :nth-of-type (penalised). Draft (editor text, parsed HTML, selected path) in
  localStorage `qa-hub:locator-helper:draft`. Tree renders max 1,500 rows.
  Shared: `src/lib/ai/claude.ts` (structured JSON call, server-side refusal fallback,
  effort medium), `GET /api/ai/status`, `useAiEnabled()`, `CodeEditor` (CodeMirror 6,
  lazy-loaded, line highlight), `CopyButton`. Rate limits: AI routes and API send get
  their own limits instead of the generic write limit (locator AI 20/h, converter 10/h,
  failure AI 20/h, API send 30/10 min). AI suggestions are re-scored locally
  ("AI suggestion", base 70; 0 if they don't select the element). No key → "Copy
  prompt for Claude" (element + ancestors, max 8 KB).
- **N3 Converter:** `src/lib/converter/` — `java.ts` (string-aware scanning, balanced
  calls, chain detection, statement splitting), `rules.ts` (By→locator map, expression
  rewrites, assertions per framework arg order, await insertion, statement rules with
  confidence), `convert.ts` (class/member parser; page objects → Locator fields set in
  the constructor; tests → test.describe + test()/hooks; data providers / @ValueSource /
  @CsvSource → for-of loops). 44 unit tests. Selenium `getText()` → `innerText()`
  (visible text, returns string). Awaits are added for page/locator chains and for
  methods on page-object variables. Removed block openers (e.g. `if (driver != null) {`)
  drop their closing brace; hooks left empty are removed. Unconvertible lines stay as
  `// TODO(convert): …` with an attention note. Multiple classes → one file each
  (`X.page.ts`, `Y.spec.ts`), shown concatenated, downloaded as a zip (fflate).
  Output style only changes snippets (bare statements): classes keep their kind
  [inferred]. Helper methods in test classes become `async function x(page, …)`.
  History: last 10 in localStorage `qa-hub:converter:history`. AI mode: structured
  output (files + notes), 50 KB cap, cancellable (AbortController → req.signal),
  maxDuration 300 s; without a key → "Build prompt for Claude" (asks for a fixed JSON
  notes block).
- **N4 Failure Analyzer:** `src/lib/failure-analyzer/` — `rules.ts` (editable config;
  evaluation order environment → locator → API status mismatch → assertion → timing →
  data → API generic, so e.g. RestAssured status mismatches thrown as AssertionError
  land in API), `parsers.ts` (TestNG, JUnit/Surefire, Playwright JSON, plain text incl.
  TestNG/Surefire console and Playwright list output; strips ANSI and GitHub log
  timestamps; 5 MB / 2,000 failures), `analyze.ts` (normalise + top app frame →
  FNV-1a signature; verdict; Markdown; Bug Formatter bug; AI prompt). NPE /
  IllegalArgument → test data [inferred]. Fixtures in `tests/fixtures/failure-analyzer/`.
  Client-side parsing only. Saved analyses keep clusters with a 40-line sample stack
  (no raw logs). Known issues by signature (409 on duplicates). AI explanations cached in
  AiExplanationCache. From CI lists failed runs via the CI Reports APIs and reuses
  `failedJobLogs` (larger tail). Charts use `useChartTheme()` (new shared hook with the
  validated categorical palette; Unknown = neutral).
  Cross-module: `src/lib/handoff.ts` — one-shot sessionStorage hand-off read with
  useSyncExternalStore (no effects); Bug Formatter opens the Manual tab pre-filled with a
  "Pre-filled from …" notice (only addition to Bug Formatter; its E2E suite unchanged).
- **N5 API Playground:** SSRF guard `src/lib/api-playground/ssrf.ts` — allow-list: only
  ipaddr.js `unicast` addresses (IPv4-mapped IPv6 checked as IPv4); blocked names
  (localhost, *.localhost, *.local, *.internal, *.home.arpa, metadata); http(s) only; no
  userinfo. `guardedLookup` is the socket's DNS lookup: refuses if ANY resolved address is
  blocked and hands the checked address to the socket (no rebinding gap). `send.ts`
  (node:http/https, agent:false): manual redirects (max 5, each hop re-validated, 303 /
  POST→GET, Authorization/Cookie dropped cross-origin), 15 s overall deadline, 2 MB cap
  applied after gzip/deflate/br decompression (bomb-safe), 1 MB request body, hop-by-hop
  headers stripped, header CR/LF neutralised, nothing logged. Only playground-built
  headers are sent (visitor cookies never forwarded). 62 unit tests incl. a local server
  for redirects/size/timeout (`server-only` aliased to its empty build in vitest).
  Client libs: variables, params↔URL sync (keeps {{vars}} readable), auth (bearer /
  basic / API key header|query), body (JSON with format/validate, form, raw), cURL,
  JSONPath subset ($ . [n] [-n] [*] ['k']), assertions. Unknown variables are listed in
  red under the URL and red-bordered in tables [simplified vs inline highlight].
  Environment choice in localStorage `qa-hub:api-playground:env`; history (20) in
  `qa-hub:api-playground:history`. Import/export: `{ name, requests: [...] }` JSON.
  Small screens: sidebar → a Select of saved requests. E2E mocks the send route; the
  SSRF E2E uses the real route; `@network` test runs only with E2E_NETWORK=1 (passed
  locally against httpbin.org).
- **N6 Release Readiness:** pure logic in `src/lib/readiness.ts` (effective status =
  override → successful auto check → manual value; score = weighted PASS share of
  non-N/A gates, blockers ×3; verdict rules; auto rules; snapshot; summary). Auto rules
  count only valid, open (Open/In progress) issues [inferred]; valid-rate with 0 issues
  and unlinked sources → "Can't check" (gate stays manual). NO_P0_FLAGS counts P0 flags
  by flag date (flags have no resolved state). CI green = latest *completed* run of each
  linked suite (GitHub, 20 most recent runs). Auto gates refresh on page open
  (`GET …/releases/[id]?refresh=1`, avoids the write rate limit) and on "Refresh checks";
  changed results log AUTO_CHECK events. Overriding a computed result needs a note.
  New releases get the default sign-off roles QA / Dev lead / Product. Decision →
  status + frozen snapshot; changing it needs the passcode (DECISION_CHANGED event).
  "Mark as released" only after Go / Go-with-issues. Extra route: `/duplicate`.
  Linked-data pickers reuse `/api/ci/suites`, `/api/bug-tracker/features`,
  `/api/ai-pr-review/flags/summary`. Print = `window.print()`; sidebar and mobile nav
  got `print:hidden` (only shell change). Shared DatePicker got an opt-in `allowFuture`
  prop (default unchanged — QA Tracker E2E re-run green).
- **N7 Risk Planner:** pure logic in `src/lib/risk.ts` (likelihood/impact weighted
  averages to one decimal, score = L × I, thresholds, depth, allocation with 0.5 h
  floors and largest-remainder rounding so totals match, overrides kept, deferred get
  0; suggestions; Markdown/CSV with formula-injection escaping). Settings per plan
  (merged over defaults; drawer with reset). Inline edits update locally and auto-save
  per area after 600 ms ("Saving… / Saved"). Defect-history suggestion counts valid
  issues in the last 90 days (P0/P1 double) [inferred: valid only]; complexity bump uses
  the linked release's AI PR Review repos (plans have no repo field) [inferred].
  Suggestions never apply silently (💡 per field + "Apply all"). Matrix is a CSS-grid
  heat map (accessible grid cells, chips scroll to the row) rather than Recharts
  [inferred]. "Send to PR QA Session" maps top factors → focus areas [inferred mapping:
  dependencies→Contract, size/complexity→UI/UX, business impact 5→Security,
  usage→Performance, defects/High+→Regression] via the hand-off; PR QA Session reads it
  (only change there; its E2E suite unchanged and green). MultiSelect moved to
  `components/shared`.
- **N8 Automation ROI:** pure calculations in `src/lib/roi.ts` (spec formulas; months =
  days ÷ 30.44; monthly buckets clipped to the period; previous same-length period for
  ↑/↓; weighted coverage; weekly pass rate; coverage-over-time from each project's
  latest snapshot ≤ date; status sentence; CSV with formula escaping). Cumulative net,
  ROI % and break-even are computed over the selected period [inferred — projects
  have no start date]. CI data: new `listRunsSince()` in `src/lib/ci/github.ts`
  (date-filtered workflow runs without per-run job calls, max 1,000) — CI Reports'
  existing functions unchanged. Linked projects fall back to estimates (badge) when
  GitHub isn't connected or fails. Creating a project also logs its first snapshot;
  one snapshot per day (re-logging replaces it and updates the project's counts).
  Currency in AppSetting `roi.currency` (default ₹, passcode to change). Edit and
  delete need the passcode.
- **N9 Test pass + deploy (2026-10-04):** local: lint, typecheck, 365 unit tests
  (23 files), build, full E2E 90 passed + 1 skipped (`@network`, opt-in). GitHub Actions
  green for every phase commit. Vercel auto-deploy still not connected → deployed with
  `vercel deploy --prod --scope rakesh-qa`; the build applied `20261004043828_new_modules`
  to Supabase (additive; Standard release template inserted). Live smoke: all 17 pages
  200; new GET APIs 200 and empty (only the built-in template); AI status off; 8 SSRF
  probes blocked (metadata IP, loopback, localhost, 10/8, ::1, decimal IP, metadata
  hostname, file://) while a public request works; 7 new DELETEs and the currency PATCH
  401 without the passcode; security headers present. Live Playwright (read-only):
  first run 59/60 — the converter's note-highlight step lost a race with the lazily
  loaded editor on a cold start; fixed (`CodeEditor` tracks the view via
  `onCreateEditor`), redeployed, live suite 60/60 passed + 1 skipped.
- **N10 Wrap-up:** README updated (modules grouped like the sidebar, "New modules at a
  glance" screenshots in `docs/`, refreshed home light/dark, AI-optional note, stack,
  protection incl. SSRF and new rate limits, env var uses, test notes). Screenshots taken
  from the local test DB with generic sample data ("Checkout revamp", "Sprint 42",
  "Checkout regression", "Demo API").

- **Theme check (2026-10-04, after N10):** swept every new page in light + dark × all 5
  colour themes with axe-core colour-contrast (scratch script, not committed). Colour
  themes behave identically (no theme-specific issues). Found and fixed dark-mode
  problems in the new modules: explicit `dark:` palette classes double-inverted under the
  palette remap in `theme-palette.css` (removed — the remap handles dark mode, as in the
  existing modules); white text on 500/600 colours → `-700` background with `-50` text
  (reads well in both modes after the remap); status segments; grey helper text
  neutral-500 → 600; risk-matrix cells → mid-tone hues at low opacity (400–500 aren't
  remapped); CodeMirror uses One Dark syntax colours in dark mode and readable gutter
  numbers. Violations on new pages: 1,875 → 1 (a CodeMirror token on the active line in
  light mode, 4.26:1). Existing Bug Formatter still has 6 minor ones (neutral-500 helper
  text in dark, orange tab in light) — left unchanged. Guard: `src/lib/theme-guard.test.ts`
  fails on any `dark:` palette override in components (shadcn `ui/` exempt). README dark
  home screenshot retaken (the earlier one used the wrong storage key) and new-page
  screenshots refreshed.

- **Full-app contrast pass (2026-10-04):** an axe-core sweep of every page and key UI
  state (27) × light/dark × 5 colour themes = 270 checks found 1,231 issues app-wide —
  more than the earlier new-pages-only sweep showed. User approved fixing everything.
  Fixes: dark-mode `--color-neutral-500` 55.6% → 64% lightness (theme-palette.css);
  shared `--primary` deepened in light (accent 78% + black, white text) and lightened
  in dark (accent 62% + white, dark text) so primary buttons/links pass in every theme;
  rich-colour toast text darker in light mode (`[data-sonner-theme="light"]`); targeted
  class changes in CI (repo line), QA Tracker (hours suffix), AI PR Review (hint), PR QA
  Session (step numbers no longer 70% opacity), TC Library and Bug Formatter buttons
  (`-700` bg / `-50` text), Bug Formatter active tab, CSV link, environment link, Clear
  all and title error (`-700`); Risk Planner deferred rows use a tint instead of 60%
  opacity; CodeMirror light syntax colours `#085/#e40/#f00` → `#006b42/#b42d00/#c00000`
  (≥5.2:1 even on the selection colour). Result: 0 violations across all 270 checks.
  Follow-up: the live sweep and a static scan found issues only visible in hidden states
  (empty states, validation errors, dialogs, hover). Fixed: validation-error text and
  required asterisks (`text-red-500/600` → `red-700`), QA Tracker green buttons, buttons
  whose `hover:bg-*-700` turned light under the dark remap (→ `-700` bg / `-50` text /
  `hover:-800`), theme-picker descriptions, Failure Analyzer drawer frames, CodeMirror
  placeholder, a few faint labels/dashes. Hidden-state sweep (47 states: dialogs,
  validation errors, passcode prompt, drawers, menus, popovers, mobile nav, collapsed
  sidebar) × light/dark × 5 themes: 0 violations, plus 0 on the 270 page checks.

## More modules (2) — decisions (Phase M0, 2026-10-04)

Spec: `prompts/MORE-MODULES-MASTER-PROMPT.md`. Phases M0–M5 in PLAN.md. All defaults accepted.

1. New deps: `@faker-js/faker` (one locale loaded at a time, in the Web Worker), `exceljs`
   (loaded only on export), `js-yaml` (YAML export + OpenAPI YAML). Reuse `fflate`.
2. No other deps: own regex-subset generator, native drag reorder (Bug Formatter pattern +
   keyboard), pagination (50/page) instead of virtualisation.
3. Locales: en_IN (default), en_US, en_GB, de, fr, es, ja, ar.
4. Aadhaar masked by default; unmasked option always fails the Verhoeff check digit.
   PAN/GSTIN/IFSC format-only with the "not real" note; cards = sandbox numbers + Luhn-valid
   reserved test ranges, labelled "test".
5. Saved schemas: unique names; "Save as preset" (`isPreset`) → preset chip row. Load / save /
   rename / duplicate open; delete needs passcode.
6. 100,000 rows max; clipboard copy off above 5 MB; zip built in the worker.
7. Test Case Generator AI: hidden without a key; route uses `AI_MODEL`, zod + one retry,
   10/hour, cancellable; unit-tested with a mocked client.
8. OpenAPI 3.x + Swagger 2.0 (JSON/YAML), local `$ref` only; basic cURL parsing.
9. Save to TC Library → `TestPlanEntry` (module name + date, optional PR ref, Markdown table,
   createdBy = Your name).
10. Send to API Playground → new collection "<module> test cases (<date>)", relative endpoints
    → `{{baseUrl}}/path`, status (+ header) assertions; hidden if the module is absent.
11. Coverage view refs = acceptance-criteria lines (numbered/bulleted, "AC…", Given/When/Then).
12. History: save/update open, delete passcode; unsaved-changes warning.
13. Order M1 → M2 → M3; push per phase, deploy only in M4 (migration reaches Supabase via
    the Vercel build).
14. Accents: teal (Test Data Generator), blue (Test Case Generator); contrast rules from the
    full-app pass; M4 re-runs the contrast sweep including the new pages.

### More-module phase notes

- **M1:** migration `more_modules` — `DataSchema` (unique name, `isPreset`) and
  `TestCaseGeneration` (+ `TcGenMode` enum); additive only. Nav: Test Case Generator
  (ListChecks, blue) at the end of Planning, Test Data Generator (Database, teal) at the end
  of Automation Tools; home cards follow `navGroups`. Placeholder pages for both routes.
  Nav unit test and navigation E2E updated (Planning 3, Automation Tools 5).
  QA Digest removed (user request, part of M1): sidebar + home card, `src/app/qa-digest`
  deleted, `/qa-digest` → `/` via a temporary (307) redirect in `next.config.ts` (not
  permanent, so browsers don't cache it if the module comes back), nav unit test, navigation
  E2E (now asserts the redirect), README module table, contrast sweep scripts. Insights now
  has only Automation ROI (group kept). The original specs in `prompts/` still mention it
  as history.
- **M2 Test Data Generator:** pure engine in `src/lib/testdata/` — `field-types.ts` (one
  catalogue: group, option specs, edge kind, SQL kind, generator, variety for unique
  checks; 80 types), `formats.ts` (Luhn, sandbox cards, PAN/GSTIN with the portal's mod-36
  check char/IFSC/pincode/vehicle, Aadhaar via Verhoeff — unmasked numbers always FAIL the
  check digit), `regex.ts` (own subset generator + variety), `formula.ts` (tokenizer +
  recursive-descent parser: refs, numbers, quoted strings, + - * / ( ); no eval),
  `edge-cases.ts`, `validate.ts` (names, ranges, dates, regex/formula errors, unknown refs,
  cycles via topological order, impossible unique), `generate.ts`, `export.ts` (CSV/TSV,
  JSON, JSON Lines, YAML, XML, SQL × 5 dialects), `excel.ts` (exceljs, dynamic import),
  `presets.ts`, `schema.ts` (zod), `schema-ops.ts`, `snippets.ts`, `locales.ts`.
  Decisions made while building [inferred]: dates are relative to a "Dates relative to" day
  (default today, saved with the schema) so seeded runs stay reproducible across days; a
  random run shows the seed it used. Edge-only mode applies to every field that has edge
  cases (toggle ignored); Mixed uses each field's toggle + % (default 20). Blanks and edge
  values don't count against Unique. Templates/formulas reference fields at the same level;
  foreign keys are top-level only and filled after all rows. Nested values are JSON strings
  in CSV/Excel/SQL. SQL column types fall back to text when a column holds edge cases,
  non-ISO dates or text amounts, so every INSERT runs; Oracle uses INSERT ALL; SQL Server
  batches are capped at 1,000 and strings are N'…'; MySQL also escapes backslashes. XML
  replaces characters XML 1.0 can't hold (e.g. null byte) with U+FFFD. CSV isn't
  formula-escaped (it's raw test data, and would break negative numbers). URL/avatar/image
  values use example.com. Card numbers: sandbox list by default, or Luhn-valid numbers on
  sandbox prefixes ("format testing") — can't promise those prefixes are unissued, so they're
  labelled as test data. Extra type "Password (invalid variants)" for the Login preset.
  Worker (`generator.worker.ts`): generates, keeps the last dataset, builds files on demand
  (format settings changed after a run apply without regenerating), zip via fflate.
  100,000 rows × 9 fields in ~1.3 s locally. Draft in localStorage
  `qa-hub:test-data-generator:draft`. API: schemas GET/POST, [id] GET/PATCH/DELETE
  (passcode). 157 unit tests; E2E 9 (spec flow + seed reproducibility, errors, presets,
  Excel/zip/JSON import, snippets, save/load/delete, saved presets). Contrast sweep of 10
  page states × light/dark × 5 themes: 0 after darkening the "(empty)" marker.
- **M3 Test Case Generator:** pure logic in `src/lib/tcgen/` — `types.ts` (26 test types in
  3 categories, presets Smoke / Full functional / API complete / Everything, ID prefix from
  the module name's initials, e.g. "Checkout payment" → CP), `schema.ts` (one lenient zod
  schema for AI and pasted answers: priority words → P0–P3, steps as text or list, headers
  as object or list, body as JSON text or object; strict JSON Schema for structured output;
  API bodies), `prompt.ts` (same instructions for AI and Copy prompt; user inputs wrapped in
  tags and marked as data), `extract.ts` (fenced / unfenced JSON with string-aware brace
  matching, bare arrays; Markdown-table fallback with column aliases, escaped pipes, `<br>`),
  `fields.ts` (11 field kinds), `templates.ts`, `openapi.ts` (OpenAPI 3 + Swagger 2, JSON or
  YAML, local `$ref`, allOf, sample bodies; shell-style cURL parsing), `checklist.ts`,
  `coverage.ts`, `export.ts` (CSV with BOM + formula escaping, Markdown, `.feature` grouped by
  category with @ID/@priority/@automation tags, Postman v2.1 with status tests, TC Library
  Markdown, API Playground requests), `excel.ts` (Test Cases / Summary / API sheets).
  Decisions made while building [inferred]: priorities are stored as P0–P3 and only shown as
  High/Medium/Low (P0+P1 = High). Checklist depth = templates per type (Quick 1, Standard 3,
  Exhaustive all) plus field checks (2 / 4 / all); with an API definition, status codes /
  request validation / auth / pagination / response schema are answered per endpoint
  (other API types stay generic). Coverage matches cases to criteria by their requirement
  reference ("AC2", "ac-2") or ≥ 60% of the criterion's words. Send to API Playground reuses
  the existing `POST /api/api-playground/collections` with `requests` (one write, so the
  rate limit isn't hit); relative endpoints become `{{baseUrl}}/…`; one status assertion per
  request (case assertions are free text, so they go in the request name/description only).
  Save to TC Library uses the existing `POST /api/tc-library`. AI route: 30 KB input cap,
  10/hour (`tcgenAi`), retry once with the validation error, cancellable, maxDuration 300 s;
  5 route tests with a mocked `structuredJson`. Replacing edited cases asks first (in-app
  dialog); leaving with an unsaved result warns (beforeunload). Table pages at 50 rows.
  Inputs kept as a draft in localStorage `qa-hub:test-case-generator:draft`; cases aren't
  (save them to History). History list returns counts only; delete needs the passcode.
  The `ComingSoon` placeholder component was removed (no longer used). Tests: 32 library
  + 5 route unit tests; 9 E2E (spec flows: checklist → edit → CSV, JSON import →
  questions / coverage / Gherkin / Postman / Excel, bad answer + Markdown fallback,
  filters + bulk, OpenAPI per-endpoint cases, Save to TC Library, Send to API Playground,
  save / reopen / delete). Contrast sweep of 8 states × light/dark × 5 themes: 0.
- **Sidebar regrouping (user request, part of M3):** Test Planning (Test Case Generator, TC
  Library, Risk-Based Test Planner, Release Readiness), Test Execution (PR QA Session, API
  Test Playground, Bug Tracker, Bug Formatter, AI PR Review), Automation (CI Reports, Test
  Failure Analyzer, Locator Helper, Selenium → Playwright, Test Data Generator), Reports &
  Insights (QA Tracker, Automation ROI). Home cards follow `navGroups`; README module tables,
  nav unit test and navigation E2E updated. Routes unchanged. Old collapsed-group state in
  `qa-hub:nav-groups-closed` refers to the old titles and is simply ignored.
- **M4 Test pass + deploy (2026-10-05):** local: lint, typecheck, 560 unit tests (29 files),
  build, full E2E 109 passed + 1 skipped (`@network`, opt-in). GitHub Actions green.
  Deployed with `vercel deploy --prod --scope rakesh-qa` (first try "Not authorized", retry
  fine, as before); the build applied `20261004175132_more_modules` to Supabase (additive).
  Live smoke: all 20 pages 200; `/qa-digest` → 307 to `/`; new GET APIs 200 and empty; both
  new DELETEs 401 without the passcode; AI generate 503 (AI off); security headers present.
  Live Playwright (read-only): 73 passed + 1 skipped, 1 failed on a network stall
  (`page.goto` load event > 45 s; the whole run took 10.8 min instead of ~2) — that spec
  re-run alone: 4/4 passed. Live contrast sweep: 249 page checks + 525 hidden-state checks
  (incl. 18 new-module states) × light/dark × 5 themes, 0 violations; checks lost to
  ERR_NETWORK_CHANGED / timeouts were re-run (50 checks, 0 violations). Only gap: the QA
  Tracker log-entry form needs a resource, which production doesn't have (0 locally).
- **M5 Wrap-up:** README: intro, module tables in the new sidebar groups (both new modules
  described), screenshots `docs/test-case-generator.png` and `docs/test-data-generator.png`,
  refreshed home light/dark (new groups), AI-optional note (Test Case Generator + checklist
  mode), stack (Faker, ExcelJS, js-yaml), rate limits, env var use, test notes. Screenshots
  taken from the local test DB with generic data only (E2E leftovers deleted first).
- **Theme review + table layout (2026-10-05, after M5):** visual review of 11 key states of both
  new modules in light, dark and dark + Sunset (33 screenshots) found no theme problems. Test
  Case Generator table: at 1400 px the Automation toggle and row actions were off-screen, so
  Automation now sits after Priority, the four row buttons became one "More actions" menu
  (Move up / Move down / Duplicate / Delete) in the Title cell, text columns got min/max
  widths, and titles are auto-growing text boxes that wrap (Enter doesn't add a line break).
  At 1400 px every Automation toggle is now visible; the long text columns still scroll (they
  also open in full via Expand and the edit drawer). New E2E for the row menu; contrast
  re-check 40 checks, 0 violations.

## Test Case Generator quality upgrade — decisions (Phase Q, 2026-10-05)

Spec: `prompts/TestCaseGenerator-QUALITY-UPGRADE.md`. All defaults accepted, plus: "Everything"
test types and Standard depth are the page defaults.

1. Golden workbook scrubbed before committing: 11 cells — `Rakesh_Resume.pdf` → `Sample_Resume.pdf`,
   `Rakesh A_M (QA) #1.pdf` → `Sample User (QA) #1.pdf`, `रेज़्यूमे_राकेश.pdf` → `रेज़्यूमे_नमूना.pdf`,
   `Résumé_José-García.docx` → `Résumé_Échantillon-Ñ.docx`, `*@test.com` → `*@example.com`.
   Only `xl/sharedStrings.xml` changed (verified byte-for-byte); formulas, styles, widths,
   freeze pane and autofilter identical. Metadata had no personal data (author "openpyxl").
2. Priority stored as P1 (critical) … P4 (low); shown as "P1 - Critical … P4 - Low" (default),
   P0–P3, or High/Medium/Low. Older answers / saved generations (P0–P3, Non-Functional,
   type "Boundary"…) are converted on read (`normalizeCases`).
3. 15 categories, Type = Positive / Negative; the 26 test-type chips stay as the selector.
4. IDs `TC_<ABBR>_001`; abbreviation field in More context (auto: initials of up to 3 words,
   or the first 3 letters of one word; stop words ignored — "Pay an Invoice" → PI).
5. Workbook keeps exactly 10 columns; "Requirement ref" is added as K only when a case has one.
6. AI: Quick = one call; Standard / Exhaustive = 4 category batches in parallel inside one
   request (one rate-limit hit), each with its own ID range (001 / 101 / 201 / 301), validated
   and retried once, then merged (duplicate titles dropped, renumbered, IDs in questions
   remapped). Failed batches are reported as a warning instead of failing the run.
7. "Improve weak cases" = new `POST /api/test-case-generator/improve`, sharing the 10/hour
   bucket. Without AI, "Copy improve prompt" opens the prompt panel; pasting the answer
   updates those rows in place (matched by ID).
8. Quality score = 70% rows (6 checks) + 30% coverage of extracted limits (at / −1 / +1 and
   min ones) and allowed values, measured on the cases' text for every mode; rounded down so
   any weak row keeps it under 100.
9. Checklist depth: no padding; above the maximum, non-essential lowest-priority cases go
   first (Quick may also trim essential ones). A warning shows when the requirement gives
   fewer cases than the depth's minimum.
10. The 6 sample tests run at Standard depth with Everything selected.
11. Unknown navigation / element names → quoted neutral placeholders + an assumption.

### Phase Q notes

- **Extractor** (`src/lib/tcgen/requirement.ts`): clauses → allowed lists (only / one of /
  "pay|sort|search|filter … by A or B"; ≥ 2 values unless file formats), limits (KB/MB/GB →
  bytes with the nearest min/max keyword winning, char ranges, digits, attempts, lockout
  durations, age N+, ₹/$ amount ranges with Indian grouping, numeric ranges with units,
  per-page, counts), fields ("Name (required, max 50 chars)" + prose hints + unique /
  required phrasing), roles, token role, duplicate rule, if/then, statuses, endpoints (text
  and pasted OpenAPI / cURL; spec title → module name), status codes. Module name: context →
  first clause → spec title → endpoint → "Module" (never "the feature").
- **Generators** (`src/lib/tcgen/generators/`): common (standard 5-line preconditions for
  app / auth / API, open steps, verify steps, indicative messages + assumption),
  values-limits, fields, files, auth, domain (CRUD, search, workflow / duplicates / payments
  / conditions / states, roles), api (text endpoints + OpenAPI / cURL: 2xx, missing / empty /
  malformed / wrong-type / enum, 401 ×2, 403, 409, other documented codes, 405, idempotency,
  Unicode, retrieve-after-create), cross (UI or API variant). Templates only for selected
  types that apply and nothing covered (badged "Template"). Old `templates.ts` / `fields.ts`
  removed.
- Sample results (Standard, Everything): file upload 45, login 40, registration 43, search
  & filter 39, payment 35, API 28 (with the "below Standard target" warning) — all quality
  100, every value / limit covered.
- **Excel** (`excel.ts`): golden layout — header Arial 10 bold white on #1F4E78, bordered body,
  bold IDs, centred C–F, priority fills (P4 grey, not in the golden), widths, freeze C2,
  autofilter, Summary COUNTIF blocks (values present only) + SUM, Assumptions & Queries;
  file `<Module_Name>_Test_Cases.xlsx`. CSV / Markdown / Gherkin / Postman use the same
  columns (Gherkin tags add @positive / @negative).
- Migration `tcgen_requirement_rules` (additive column `requirementRules String[]`).
- Tests: extractor 9, generators 25 (incl. the 6 samples), golden format 6, tcgen 17, routes
  7 (batches, partial failure, retry, improve). E2E 11 (incl. login sample → score ≥ 80 →
  xlsx with 3 sheets, AI JSON import with quality score, weak rows + improve prompt).
  Contrast: 10 Test Case Generator states × light/dark × 5 themes, 0 violations.
- Found while testing: a spec-only input named the module "Feature" (→ "the feature" in
  titles) — fixed and covered by a test; a Vitest `beforeEach(() => mock.mockReset())`
  returned the mock, which Vitest then called as a cleanup hook — use a block body.

## PR QA Session prompt rebuild — decisions (Phase P, 2026-10-05)

1. Builder moved to `src/lib/pr-qa-session/prompt/` — `inputs.ts` (PR URL → `gh pr diff <n> --repo
   <owner/repo>`, FE / BE / both, risk level, login URL sanitising), `sections.ts` (one function per
   header block and step, sub-blocks toggled by template mode, focus areas and single-PR mode),
   `index.ts` (`buildPrompt`). Old `build-prompt.ts` removed.
2. Template modes: Full Session (all), API Only (Steps 1 BE + contract, 2, 3 TC-API only, 7, 8,
   9 Category D, 10), UI Regression (1 FE + impact radius, 2, 4, 5, 6, 7, 9 A + C, 10), Security
   (all steps, Security focus forced, Step 6 weighted). Manual chip changes keep the mode.
3. Step numbers are no longer renumbered when steps are deselected (steps reference each other);
   a Scope section lists skipped steps and why (FE only, BE only, template).
4. Credentials (user rule): only the login URL and login method (SSO / Email + password / Magic
   link / Other) are stored. The URL loses `user:password@` and token / password / OTP / email
   query or hash parameters — on blur in the page (typed text stays in component state; only the
   cleaned URL reaches the draft), on draft read, and again on the server for saved templates.
   The prompt always says credentials come from env vars (`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`)
   or are asked at run time; OTP / MFA always asked at run time. Unit + E2E tests check that no
   secret reaches localStorage or the prompt.
5. Risk level read from Additional context ("Risk: Critical", "high-risk"…) scales test-case
   depth; context gets its own Risk Context section.
6. TC Library entry still means "resume at Step 3" with the saved output appended; Resume From
   Step > 1 without one adds a block asking for the Step 1 analysis and approved Step 2 plan.
7. Migration `pr_qa_session_login`: nullable `loginUrl`, `loginMethod`, `specFolders` on
   SessionTemplate (additive).
8. Generic content (user rule): scanned the new sections, templates, tests and the sample prompt;
   replaced `acme`, `org/repo` and `org/web` with `example-org/frontend|backend`. Remaining:
   example-org repos, example.com hosts, a deliberately fake credential in the stripping tests.

### Phase P notes

- Tests: 24 builder unit tests (done-when check, FE / BE / both, each template, each focus area,
  empty env → `<not provided>`, URL → `gh pr diff --repo`, credentials, risk, resume, generic
  content); E2E 11 PR QA Session + updated TC Library hand-off. Copy is checked to equal the full
  prompt. Contrast: 5 PR QA Session states × light / dark × 5 themes, 0 violations.
- Sample (FE #3419 + BE #386, Full Session, all focus areas): 265 lines, ~13 KB.

## User guide — decisions (Phase G, 2026-10-05)

1. `docs/user-guide/`: README.md (index, lifecycle, 16-module table, 3 workflows, common features,
   glossary), OVERVIEW.md (one page for managers) and one file per module named after its route
   (`ci.md`, `bug-tracker.md` covers Dashboard / Activity / Workload). Every module file has exactly
   the 11 required sections, 1,000–1,650 words (5–8 min). Product name "Rakesh QA Hub" kept
   (user-approved); everything else generic.
2. Written from the code (labels, fields, options, thresholds, formulas), not the specs. Worked
   examples for Test Case Generator, Locator Helper, Failure Analyzer, Risk Planner and the converter
   were run through the real libraries and use their actual output.
3. In-app guide: `/guide`, `/guide/overview`, `/guide/<module>` render the same Markdown at build
   time (`src/lib/guide/content.ts`, static params); links like `ci.md#faq` → `/guide/ci#faq`;
   screenshots served by `/guide/images/[file]` (static route handler, no copies in `public/`).
   Side panel with all pages + "On this page"; anchors on h2/h3. Unknown slugs → 404.
4. Help link in the sidebar footer (icon + tooltip when collapsed) and the mobile menu; "How to use"
   link in every module header (PageHeader + Bug Tracker top bar), chosen from the current path,
   → `/guide/<module>#how-to-use-it`.
5. Print: guide pages print without the shell and with compact type; the overview fits one A4 page
   (browser Print → Save as PDF). No PDF committed.
6. Screenshots: 16 PNGs, 1440 × 900, light mode, from the local test DB with `seed:demo` data plus
   generic API-created data (release "Checkout revamp", plan "Sprint 42", ROI projects, "Users API"
   collection). The API Playground response is mocked. Test Data Generator uses the Product preset
   (Faker person names avoided).

### Phase G notes

- Found while verifying examples: Test Case Generator named the limit in "Password must be 8–20
  characters" "Text" (filler word before the numbers) → now takes the "<word> must / should …"
  subject; regression test added. Not fixed (reported): open-question case IDs can be off by one
  (lockout question cites TC_…_007–010, the cases are 008–011); Failure Analyzer doesn't classify
  Java `ConnectException: Connection refused` as Environment (only `ECONNREFUSED` / `net::ERR_`).
- Tests: `src/lib/guide/guide.test.ts` (54: files ↔ sidebar, 11 sections in order, screenshot under
  How to use, word counts, every relative link / image / anchor resolves, link mapping); E2E
  `e2e/guide.spec.ts` (21: index + overview, all 16 pages with 11 sections and a loaded screenshot,
  404, in-app links, Help link, How to use links). Contrast: 21 guide states × light / dark × 5
  themes = 210 checks, 0 violations.

## Open questions / next steps

- Install the Vercel GitHub app for RakeshAM03/rakesh_qa_hub, then run
  `vercel git connect --scope rakesh-qa` so pushes to main auto-deploy (still manual).
- Optional keys in Vercel: `ANTHROPIC_API_KEY` (all AI features; model `claude-sonnet-5-5`
  in `src/config/ai.ts`) and `GITHUB_TOKEN` (CI Reports, CI-green gate, Failure
  Analyzer "From CI", ROI run counts). Without them the app falls back gracefully.
- Optional: turn Deployment Protection fully off if preview URLs should be public too.
- Ideas: Test Case Generator → "Send to Test Data Generator" (seed a schema from detected fields); Release Readiness could link a Risk Plan's
  accepted risks into "Known issues"; a CSP header (Next inline scripts need nonces);
  Prisma 7 config file (`package.json#prisma` deprecation warning in builds).
