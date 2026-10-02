# Progress

**Current phase:** 0 done — prompts generic, history reset to one orphan commit (force push by user). Waiting for "go" to start Phase 1.

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

## Open questions

None.
