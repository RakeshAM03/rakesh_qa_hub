# Master Prompt for Claude Code — Add 7 New Modules to Rakesh QA Hub

## How to use this

1. Put the 8 new files in your project's `prompts/` folder:
   - `APIPlayground-prompt.md`
   - `AutomationROI-prompt.md`
   - `LocatorHelper-prompt.md`
   - `FailureAnalyzer-prompt.md`
   - `SeleniumToPlaywright-prompt.md`
   - `ReleaseReadiness-prompt.md`
   - `RiskPlanner-prompt.md`
   - `NEW-MODULES-MASTER-PROMPT.md` (this file)
2. Open Terminal in the project folder (`~/Projects/rakesh_qa_hub`, or `~/Documents/rakesh_qa_hub` if you moved it) and push the files:
   ```bash
   git add prompts
   git commit -m "Add specs for 7 new modules"
   git push
   ```
3. Start Claude Code: `claude`
4. Paste this as your first message:
   ```
   Read prompts/NEW-MODULES-MASTER-PROMPT.md. The section "The prompt" is
   your task — follow it exactly, starting with Phase 0.
   ```
5. Answer Claude's questions at each 🛑 checkpoint.

---

## The prompt

````markdown
# Task: Add 7 new modules to Rakesh QA Hub

The hub is already built and live at https://rakesh-qa-hub.vercel.app
(Next.js App Router, TypeScript, Tailwind, shadcn/ui, Prisma 6 + Supabase
Postgres, Vitest, Playwright, deployed on Vercel team "rakesh-qa").
Read PROGRESS.md and PLAN.md first to understand the existing conventions,
decisions and rules — follow them exactly (no login, "Your name" field,
ADMIN_PASSCODE for destructive actions, rate limiting, zod validation,
generic data only, empty states everywhere, default seed creates nothing).

## Specs

| # | Module | Spec file | Route | Sidebar group |
|---|---|---|---|---|
| 1 | Release Readiness | prompts/ReleaseReadiness-prompt.md | /release-readiness | Planning |
| 2 | Risk-Based Test Planner | prompts/RiskPlanner-prompt.md | /risk-planner | Planning |
| 3 | Locator Helper | prompts/LocatorHelper-prompt.md | /locator-helper | Automation Tools |
| 4 | Selenium → Playwright Converter | prompts/SeleniumToPlaywright-prompt.md | /selenium-to-playwright | Automation Tools |
| 5 | Test Failure Analyzer | prompts/FailureAnalyzer-prompt.md | /failure-analyzer | Automation Tools |
| 6 | API Test Playground | prompts/APIPlayground-prompt.md | /api-playground | Automation Tools |
| 7 | Automation ROI Dashboard | prompts/AutomationROI-prompt.md | /automation-roi | Insights |

Read all 7 specs before writing code. Items marked [inferred] or vague
details: build a simple, working version and note it.

## Sidebar

Reorganise the sidebar into groups (collapsible headings), keeping every
existing route working:

- **Testing:** CI Reports, Bug Tracker (Dashboard / Activity / Workload),
  QA Tracker, PR QA Session, AI PR Review, TC Library, Bug Formatter
- **Planning:** Release Readiness, Risk-Based Test Planner
- **Automation Tools:** Locator Helper, Selenium → Playwright,
  Test Failure Analyzer, API Test Playground
- **Insights:** Automation ROI, QA Digest

Update the Home page with a card for each new module, grouped the same way.

## Rules (in addition to the existing ones in PLAN.md / PROGRESS.md)

1. AI features are optional. If ANTHROPIC_API_KEY is not set, hide AI
   buttons and offer a "Copy prompt for Claude" alternative where the spec
   says so. Never fail a page because the key is missing. Use the current
   Anthropic TypeScript SDK and a current Claude model id; keep the model id
   in one config constant.
2. Features that read CI data must work without GITHUB_TOKEN (show a clear
   "Connect GitHub" message and fall back as the spec describes).
3. Cross-module features (e.g. "Send to Bug Formatter", "Send to PR QA
   Session", Release Readiness auto-gates) must use the existing modules'
   data and routes; don't duplicate them.
4. API Test Playground's send route MUST block private/internal addresses
   (SSRF protection) exactly as its spec describes, with unit tests.
5. Locator Helper must never render pasted HTML as live HTML.
6. Each module's core logic lives in pure functions under src/lib/<module>/
   with Vitest unit tests.
7. Add Playwright E2E tests per module (page object model), following the
   existing test setup (local throwaway DB; live mode skips write tests).
8. Don't change existing modules' behaviour except the sidebar/home changes
   and the cross-module hooks the specs ask for.
9. Database changes: add models with a new Prisma migration; never reset or
   drop existing data. Run `prisma migrate deploy` against Supabase only
   through the normal build.
10. Never read .env, never commit secrets, never force-push.

## How to work

- Phase 0: read PROGRESS.md, PLAN.md and all 7 specs. Ask me all your
  clarifying questions in one numbered message, each with your recommended
  default. Then add the phases below to PLAN.md and wait for my "go".
  🛑 CHECKPOINT
- Then work phase by phase. After each phase: lint, typecheck, unit tests,
  build, run the module's E2E tests, check the page in the browser
  (Playwright MCP), commit, push, update PROGRESS.md, and give me a 3–5 line
  summary. Continue without waiting unless it's a checkpoint or you're
  blocked. If something fails 3 times, stop and ask.

## Phases

- **Phase 1 — Sidebar groups + home cards + Prisma models** for all new
  modules (one migration).
- **Phase 2 — Locator Helper** (no DB, quick win).
- **Phase 3 — Selenium → Playwright Converter** (no DB).
- **Phase 4 — Test Failure Analyzer.**
- **Phase 5 — API Test Playground** (incl. SSRF protection + tests).
- **Phase 6 — Release Readiness** (incl. the one generic built-in template).
- **Phase 7 — Risk-Based Test Planner.**
- **Phase 8 — Automation ROI Dashboard.**
- **Phase 9 — Full test pass + deploy.** Run the whole unit and E2E suite;
  push to main. If Vercel auto-deploy is connected, wait for it; otherwise
  run `vercel deploy --prod --scope rakesh-qa`. Smoke-test every new route
  on the live URL (read-only checks), then run the live-mode Playwright
  suite. 🛑 CHECKPOINT: show me the results.
- **Phase 10 — Wrap-up.** Update README (module list, screenshots of the
  new pages), PROGRESS.md and PLAN.md. Final summary: what's done, what's
  [inferred], what needs a key or token, suggested next steps.

Start with Phase 0 now.
````

---

## Tips

- **If the session stops partway**, start `claude` again in the project folder and paste:
  ```
  Continue adding the new modules. Read PROGRESS.md, PLAN.md and
  prompts/NEW-MODULES-MASTER-PROMPT.md, tell me which phase you're
  resuming and what's left, then continue.
  ```
- **To build only some modules**, tell Claude in Phase 0 which ones to skip, e.g. "Skip API Test Playground for now."
- **AI features** (Locator Helper alternatives, Failure Analyzer explanations, Converter AI mode) need `ANTHROPIC_API_KEY` in Vercel. Without it, everything else still works, and those buttons become "Copy prompt for Claude".
