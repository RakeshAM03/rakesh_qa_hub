# Master Prompt for Claude Code — Add Test Case Generator + Test Data Generator

Run this **after** the 7-module build (NEW-MODULES-MASTER-PROMPT.md) has finished.

## How to use this

1. Copy these 3 files into `~/Documents/rakesh_qa_hub/prompts/`:
   - `TestCaseGenerator-prompt.md`
   - `TestDataGenerator-prompt.md`
   - `MORE-MODULES-MASTER-PROMPT.md` (this file)
2. In Terminal:
   ```bash
   cd ~/Documents/rakesh_qa_hub
   git add prompts
   git commit -m "Add specs for Test Case Generator and Test Data Generator"
   git push
   claude
   ```
3. Paste into Claude Code:
   ```
   Read prompts/MORE-MODULES-MASTER-PROMPT.md. The section "The prompt" is
   your task — follow it exactly, starting with Phase 0.
   ```

---

## The prompt

````markdown
# Task: Add 2 more modules to Rakesh QA Hub

The hub is live at https://rakesh-qa-hub.vercel.app. Read PROGRESS.md and
PLAN.md first and follow every existing convention and decision (no login,
"Your name" field, ADMIN_PASSCODE on every DELETE, rate limiting, zod,
generic data only, empty states, default seed creates nothing, AI model id
from src/config/ai.ts, AI optional with "Copy prompt for Claude" fallback,
build:app locally and migrations to Supabase only via the Vercel build).

## Specs

| # | Module | Spec file | Route | Sidebar group |
|---|---|---|---|---|
| 1 | Test Data Generator | prompts/TestDataGenerator-prompt.md | /test-data-generator | Automation Tools |
| 2 | Test Case Generator | prompts/TestCaseGenerator-prompt.md | /test-case-generator | Planning |

Read both specs fully before writing code. Add both to the sidebar group
shown and to the Home page cards.

## Cross-module hooks

- Test Case Generator → "Save to TC Library" uses the existing TC Library
  model and routes.
- Test Case Generator → "Send to API Playground" uses the existing API
  Playground collections/requests (skip gracefully if that module is
  missing).
- Test Data Generator reuses fflate if it's already a dependency.

## How to work

- Phase 0: read PROGRESS.md, PLAN.md and both specs. Ask all clarifying
  questions in one numbered message with recommended defaults. Add the
  phases below to PLAN.md. 🛑 CHECKPOINT — wait for my "go".
- After each phase: lint, typecheck, unit tests, build:app, the module's
  E2E tests, a browser check (Playwright MCP), commit, push, update
  PROGRESS.md, and a 3–5 line summary. Continue unless blocked; if
  something fails 3 times, stop and ask.

## Phases

- **Phase M1 — Prisma models** for both modules (one new migration;
  never reset or drop data).
- **Phase M2 — Test Data Generator** (presets, schema builder, all field
  types, edge-case library, Web Worker generation, all exporters, saved
  schemas).
- **Phase M3 — Test Case Generator** (input tabs, test-type chips, three
  modes: AI / Copy prompt + Import / Checklist, editable table, all
  exports, Save to TC Library, Send to API Playground, history).
- **Phase M4 — Full test pass + deploy.** Run all unit and E2E tests,
  push, deploy with `vercel deploy --prod --scope rakesh-qa` (unless
  auto-deploy is connected), smoke-test both new routes on the live URL
  and run the live-mode Playwright suite. 🛑 CHECKPOINT: show results.
- **Phase M5 — Wrap-up.** Update README, PROGRESS.md and PLAN.md; final
  summary.

Start with Phase 0 now.
````
