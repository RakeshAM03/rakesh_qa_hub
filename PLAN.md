# Rakesh QA Hub — Build Plan

Source of truth: `prompts/` (made fully generic before Phase 1).
Rules: `prompts/MASTER-PROMPT.md`. Decisions: see `PROGRESS.md`.

Cross-cutting: everything starts empty and user-managed — every module gets a
friendly empty state with a clear "add first item" action.

After every phase: `npm run lint` + `npm run build` clean → check routes load
(Playwright MCP / curl) → commit + push to `main` → tick here → short summary.

## Phases

- [x] **Phase 0 — Read and plan**
  Read all specs, clarifying questions answered, prompts sanitized, this plan.

- [x] **Phase 1 — Project setup + app shell**
  - `create-next-app` (TS, Tailwind, ESLint, App Router, `src/`, `@/*`) in repo root,
    keeping `prompts/`, `.gitignore`, `.claude/`, `.env`.
  - shadcn/ui init + components (button, card, input, textarea, select, dialog, tabs,
    table, badge, sonner, dropdown-menu, tooltip, skeleton, sheet, label, checkbox,
    popover, calendar); lucide-react, zod, papaparse, react-markdown, recharts.
  - `src/config/nav.ts` — nav items + icons (Bug Tracker group: Dashboard/Activity/Workload).
  - `src/components/shell/` — `Sidebar` (collapsible, icons-only when collapsed),
    `MobileNav` (Sheet drawer), `PageHeader` (`< Home`, icon, title, subtitle, actions).
  - `src/app/page.tsx` — home with a card per module.
  - Placeholder pages for every route. (`/qa-digest` was later removed in Phase M1 and
    redirects to `/`.)
  - `<Toaster />` (sonner) in root layout. `.gitignore` keeps `.env`, `.env*.local`.
  - Vitest set up (`npm test`).

- [x] **Phase 2 — Database** (🛑 skipped: `.env` already has DATABASE_URL, DIRECT_URL, ADMIN_PASSCODE)
  - Prisma 6. `prisma/schema.prisma` from DEPLOYMENT-GUIDE (incl. `CiSuite`) + `IssueEvent`
    model (issueId, featurePageId, type, fromValue, toValue, actor, createdAt).
  - `npx prisma migrate dev --name init`; `src/lib/db.ts`.
  - `prisma/seed.ts`: creates nothing user-facing (0 CI suites, teams, feature pages,
    resources). Optional `npm run seed:demo` (`prisma/seed-demo.ts`) with clearly generic
    data ("Demo Team", "Sample Feature", "Demo Resource 1", "Demo Suite") for local
    testing and E2E only — never run against production automatically.
  - `.env.example` (empty values). `postinstall: prisma generate`,
    `build: prisma migrate deploy && next build`.

- [x] **Phase 3 — Bug Formatter** (`/bug-formatter`, client-only, localStorage draft)
  - `src/lib/bug-formatter/` — `parser.ts`, `csv.ts`, `export.ts` (Markdown, Jira wiki, Slack).
  - `src/components/bug-formatter/` — tabs (Paste/Manual/CSV), Findings panel, bug card.
  - CSV template download, 2 MB limit, Clear all with in-app confirm.
  - Unit tests: parser, CSV mapping, exporters.

- [x] **Phase 4 — PR QA Session** (`/pr-qa-session`)
  - `src/config/pr-qa-templates.ts`; `src/lib/pr-qa-session/build-prompt.ts`.
  - API: `GET/POST /api/pr-qa-session/templates` (SessionTemplate).
  - UI: how-it-works panel, notice, inputs, focus chips, step chips (All/None),
    output panel (Copy/Reset/Download .md, counts), localStorage draft.
  - Unit tests: prompt builder (step renumbering, optional sections), PR URL validation.

- [x] **Phase 5 — TC Library** (`/tc-library`)
  - API: list/search/paginate, get, create, import, patch, delete, export.
  - UI: Save card (create/edit, unsaved-changes warning, duplicate-name hint),
    list with search + sort, View drawer (react-markdown, no raw HTML), Copy, Edit,
    Export JSON, Delete (modal), Import JSON preview, Export all.
  - PR QA Session: "Load from TC Library" → prompt says skip Steps 1–2.

- [x] **Phase 6 — AI PR Review** (`/ai-pr-review`)
  - `src/lib/ai-pr-review/` — prompt generator, markdown-table parser, location parser.
  - API: flags POST (one/many), GET (filters + pagination), summary, PATCH, DELETE.
  - UI: generator card, log flags (Claude output preview w/ inline edit | manual form),
    all-flags table (type summary bar, search, severity pills, repo filter, pagination).
  - Unit tests: table parser, location parsing, URL splitting.

- [x] **Phase 7 — QA Tracker** (`/qa-tracker`)
  - API: resources, logs POST/GET, logs PATCH/DELETE, analytics.
  - API: resources POST/PATCH/DELETE (delete needs passcode).
  - UI: Manage resources dialog (add / rename / deactivate / delete),
    Log Entry (multi-row, validation), analytics (bar/pie/line + stats),
    per-resource tabs, date-grouped history, search + date range, inline edit, load more.

- [x] **Phase 8 — Bug Tracker** (`/bug-tracker`, `/activity`, `/workload`, `/[featureId]`)
  - API: teams, features (with computed counts), issues CRUD, activity, workload, search.
  - UI: team sidebar w/ counts (dropdown on small screens), feature table + % valid pills,
    New Team / New Feature Page modals, "View sheet" → Coming soon, global search,
    feature detail (issues add/edit/valid toggle), Activity feed, Workload view.

- [x] **Phase 9 — CI Reports** (`/ci`)
  - No hard-coded suites anywhere. `CiSuite` in DB; `src/lib/ci/github.ts` (runs, jobs,
    dispatch, repo/workflow existence check, short cache); `src/lib/ci/rca.ts`
    (Anthropic, cached in RootCauseCache, only when ANTHROPIC_API_KEY set — currently off).
  - API: `/api/ci/suites` (GET/POST), `/suites/[suiteId]` (PATCH/DELETE), `/suites/reorder`,
    `/suites/[suiteId]/runs`, `/dispatch`, `/runs/[id]/rca`. Writes need passcode.
  - UI: empty state "No CI suites yet — add your first one", Add/Edit suite modal
    (name, repo, workflow, 8-colour picker, dispatch inputs), delete, move up/down,
    Jump-to chips + sections from saved suites in sortOrder, runs table, polling,
    pagination, "Connect GitHub to see runs" when no GITHUB_TOKEN.

- [x] **Phase 10 — Public-access protection**
  - `src/lib/admin.ts` (x-admin-passcode), `src/lib/rate-limit.ts` (30 / 10 min / IP),
    passcode dialog + sessionStorage, zod everywhere, secrets audit.

- [x] **Phase 11 — Tests**
  - Playwright (POM in `e2e/pages/`) for every module's main flow, incl. empty states;
    tests create their own data (local/CI DB uses `seed:demo` where needed).
  - `.github/workflows/e2e.yml`: Postgres service → migrate + seed → lint, unit, build,
    Playwright.

- [x] **Phase 12 — Deploy to Vercel** 🛑 (CLI already logged in; team `rakesh-qa`)
  - Link, env vars (Production), `vercel --prod`, subdomain `rakesh-qa-hub`,
    Deployment Protection off (you), smoke test + Playwright against `BASE_URL`.

- [x] **Phase 13 — Wrap-up**
  - README (live link, screenshot, modules, stack, setup, env names, tests),
    secret scan, final summary.

---

# New modules (7) — Plan

Source: `prompts/NEW-MODULES-MASTER-PROMPT.md` + the 7 module specs.
After every phase: lint, typecheck, unit tests, `build:app` (no Supabase migrate),
module E2E, browser check (Playwright MCP), commit + push, PROGRESS.md, short summary.

- [x] **Phase N0 — Read and plan** 🛑 clarifying questions, this plan.
- [x] **Phase N1 — Sidebar groups + home cards + Prisma models**
  - Nav grouped: Testing / Planning / Automation Tools / Insights (collapsible headings);
    every existing route unchanged. Home cards grouped the same way.
  - One migration adding all new models (Release*, ChecklistTemplate, RiskPlan/RiskArea,
    FailureAnalysis/KnownIssue/AiExplanationCache, ApiCollection/ApiRequest/ApiEnvironment,
    AutomationProject/CoverageSnapshot, AppSetting) + "Standard release" template row.
  - Shared AI config constant + `isAiEnabled()`; placeholder pages for the 7 routes.
- [x] **Phase N2 — Locator Helper** (`/locator-helper`, client-only, `src/lib/locators/`).
- [x] **Phase N3 — Selenium → Playwright Converter** (`/selenium-to-playwright`, `src/lib/converter/`).
- [x] **Phase N4 — Test Failure Analyzer** (`/failure-analyzer`, parsers + classifier + clustering,
  Send to Bug Formatter, known issues, saved analyses, From CI).
- [x] **Phase N5 — API Test Playground** (`/api-playground`, SSRF-safe send route + unit tests,
  collections, environments, assertions, cURL, history).
- [x] **Phase N6 — Release Readiness** (`/release-readiness`, score/verdict, auto gates,
  sign-offs, decision snapshot, activity log, templates, summary + print).
- [x] **Phase N7 — Risk-Based Test Planner** (`/risk-planner`, `src/lib/risk.ts`, matrix,
  suggestions, allocation, exports, Send to PR QA Session).
- [x] **Phase N8 — Automation ROI Dashboard** (`/automation-roi`, `src/lib/roi.ts`, KPIs, charts, CSV).
- [x] **Phase N9 — Full test pass + deploy** 🛑 unit + E2E, push, `vercel deploy --prod --scope rakesh-qa`,
  live smoke test, live-mode Playwright.
- [x] **Phase N10 — Wrap-up** README (modules, screenshots), PROGRESS.md, PLAN.md, final summary.

---

# More modules (2) — Plan

Source: `prompts/MORE-MODULES-MASTER-PROMPT.md` + `TestDataGenerator-prompt.md` +
`TestCaseGenerator-prompt.md`. Same per-phase routine as the N-phases: lint, typecheck,
unit tests, `build:app` (no Supabase migrate), module E2E, browser check (Playwright MCP),
commit + push, PROGRESS.md, short summary. New UI follows the contrast rules from the
full-app pass (no `dark:` palette classes; `-700` text; `-700` bg / `-50` text buttons).

- [x] **Phase M0 — Read and plan** 🛑 clarifying questions, this plan.
- [x] **Phase M1 — Prisma models** — one additive migration: `DataSchema`,
  `TestCaseGeneration` (+ `TcGenMode` enum). Placeholder pages for both routes; nav
  (Test Data Generator → Automation Tools, Test Case Generator → Planning) and home cards.
  Also (user request): QA Digest removed — sidebar, home card, `/qa-digest` page (now a
  temporary redirect to `/`), nav config, tests, README. Insights keeps Automation ROI.
- [x] **Phase M2 — Test Data Generator** (`/test-data-generator`, `src/lib/testdata/`):
  presets, schema builder (all field types, options, blank %, unique, drag reorder),
  edge-case library + data modes, safe formula/template evaluator, regex subset,
  seeded generation in a Web Worker (progress + cancel), exporters (CSV/TSV, JSON,
  JSON Lines, Excel, SQL ×5 dialects, XML, YAML, zip), preview + stats, saved schemas
  (API + passcode delete), schema JSON import/export, "Use in automation" snippets.
- [x] **Phase M3 — Test Case Generator** (`/test-case-generator`, `src/lib/tcgen/`):
  input tabs (requirement / API definition / upload) + context, test-type chips and
  presets, options; three modes (AI route with zod + one retry, Copy prompt + Import
  with JSON/Markdown fallback, Checklist with templates + field detection + OpenAPI /
  cURL cases); editable table (filters, sort, bulk, drawer, coverage view, pagination);
  exports (Excel, CSV, Markdown, Gherkin, Postman), Save to TC Library, Send to API
  Playground, history (API + passcode delete).
  Also (user request): sidebar regrouped into Test Planning / Test Execution / Automation /
  Reports & Insights — home, README and tests too.
- [x] **Phase M4 — Full test pass + deploy** 🛑 unit + E2E, push, `vercel deploy --prod
  --scope rakesh-qa`, live smoke on both routes, live-mode Playwright, contrast sweep
  incl. the new pages.
- [x] **Phase M5 — Wrap-up** README, PROGRESS.md, PLAN.md, final summary.

---

# Test Case Generator quality upgrade — Plan

Source: `prompts/TestCaseGenerator-QUALITY-UPGRADE.md`; format reference
`tests/fixtures/tcgen/golden-resume-upload.xlsx` (structure and depth only).

- [x] **Phase Q — Standard Test Case Format** 🛑 questions answered ("defaults OK"; Everything +
  Standard as the page defaults). Workbook scrubbed of personal data; rule extractor + generic
  generators for checklist mode; quality score with weak-row tools; shared prompt with 3
  multi-domain examples and batched AI; golden-layout Excel; tests for 6 sample requirements
  and the golden format; deploy.
