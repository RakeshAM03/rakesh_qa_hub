# Rakesh QA Hub — Build & Deployment Guide

A step-by-step guide to building all seven QA modules as **one Next.js app** and deploying it to **one public URL** that anyone can open and use.

- **Repo:** https://github.com/RakeshAM03/rakesh_qa_hub
- **Target URL:** `https://rakesh-qa-hub.vercel.app` (free), or your own domain later
- **Cost:** ₹0 on free tiers (an optional custom domain is around ₹800/year; the optional AI root-cause feature costs a little per call)

---

## Contents

1. [Architecture](#1-architecture)
2. [Prerequisites](#2-prerequisites)
3. [Set up the repo](#3-set-up-the-repo)
4. [Create the Next.js app](#4-create-the-nextjs-app)
5. [Build the app shell](#5-build-the-app-shell)
6. [Set up the database (Supabase)](#6-set-up-the-database-supabase)
7. [Build the modules with Claude Code](#7-build-the-modules-with-claude-code)
8. [Protect the public app (no login needed)](#8-protect-the-public-app-no-login-needed)
9. [Deploy to Vercel](#9-deploy-to-vercel)
10. [Connect CI Reports to your own automation](#10-connect-ci-reports-to-your-own-automation)
11. [Custom domain (optional)](#11-custom-domain-optional)
12. [Testing the hub](#12-testing-the-hub)
13. [Final checklist](#13-final-checklist)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Architecture

All modules are routes in a single app with a shared sidebar. One codebase, one deploy, one URL.

```
https://rakesh-qa-hub.vercel.app
├── /                    Home (cards linking to each module)
├── /ci                  CI Reports
├── /bug-tracker         Bug Tracker — Dashboard
│   ├── /activity        Bug Tracker — Activity
│   ├── /workload        Bug Tracker — Workload
│   └── /[featureId]     Feature issue list
├── /qa-tracker          QA Tracker
├── /pr-qa-session       PR QA Session
├── /ai-pr-review        AI PR Review
├── /tc-library          TC Library
└── /bug-formatter       Bug Formatter
```

```
Browser ──► Vercel (Next.js pages + API routes) ──► Supabase Postgres
                         │
                         ├──► GitHub Actions API   (CI Reports)
                         └──► Anthropic API        (CI root cause, optional)
```

| Module         | Needs database | Needs external API          | Build order |
|----------------|:--------------:|-----------------------------|:-----------:|
| Bug Formatter  | No             | —                           | 1           |
| PR QA Session  | Optional       | —                           | 2           |
| TC Library     | Yes            | —                           | 3           |
| AI PR Review   | Yes            | —                           | 4           |
| QA Tracker     | Yes            | —                           | 5           |
| Bug Tracker    | Yes            | Google Sheets (optional)    | 6           |
| CI Reports     | Yes (suites, cache) | GitHub Actions, Anthropic   | 7           |

---

## 2. Prerequisites

Install these on your machine:

| Tool        | Check it works             | Get it                                   |
|-------------|----------------------------|------------------------------------------|
| Node.js 20+ | `node -v`                  | https://nodejs.org                       |
| Git         | `git --version`            | https://git-scm.com                      |
| GitHub CLI  | `gh --version`             | https://cli.github.com                   |
| Claude Code | `claude --version`         | https://docs.claude.com (Claude Code)    |
| VS Code     | —                          | https://code.visualstudio.com            |

Create free accounts on:

- **GitHub** (you have one): `RakeshAM03`
- **Vercel**: https://vercel.com, sign up with GitHub
- **Supabase**: https://supabase.com, sign up with GitHub

Log in to the GitHub CLI once:

```bash
gh auth login
```

---

## 3. Set up the repo

```bash
git clone https://github.com/RakeshAM03/rakesh_qa_hub.git
cd rakesh_qa_hub
```

Put your 8 prompt files in a `prompts/` folder:

```
rakesh_qa_hub/
└── prompts/
    ├── CIskill.md
    ├── CI-prompt.md
    ├── BugTracker-prompt.md
    ├── QATracker-prompt.md
    ├── PRQASession-prompt.md
    ├── AIPRReview-prompt.md
    ├── TCLibrary-prompt.md
    ├── BugFormatter-prompt.md
    └── DEPLOYMENT-GUIDE.md      (this file)
```

Commit them:

```bash
git add prompts
git commit -m "Add module prompts and deployment guide"
git push
```

---

## 4. Create the Next.js app

From inside the repo folder (it creates the app in the current directory):

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

If it complains the folder isn't empty, move `prompts/` out temporarily, run the command, then move it back.

Add the UI library and helpers:

```bash
npx shadcn@latest init
npx shadcn@latest add button card input textarea select dialog tabs table badge toast dropdown-menu tooltip skeleton
npm install lucide-react @prisma/client zod papaparse react-markdown recharts
npm install -D prisma @types/papaparse
```

Run it:

```bash
npm run dev
```

Open http://localhost:3000. You should see the Next.js starter page.

---

## 5. Build the app shell

The shell is the sidebar and layout that every module shares. Build it first so each module drops into place.

Start Claude Code in the repo:

```bash
claude
```

Give it this prompt:

```
Build the app shell for "Rakesh QA Hub" in this Next.js App Router project
(src/app, Tailwind, shadcn/ui, lucide-react).

1. Root layout with a collapsible left sidebar (~300px, light grey background).
   Title "Rakesh QA Hub" with a collapse chevron. Collapsed state shows icons only.
2. Nav items with lucide icons, active item as a grey pill:
   - CI Reports (/ci) — GitBranch
   - Bug Tracker — LayoutGrid, expandable group with:
       Dashboard (/bug-tracker), Activity (/bug-tracker/activity),
       Workload (/bug-tracker/workload)
   - QA Tracker (/qa-tracker) — ClipboardList
   - QA Digest (/qa-digest) — CalendarDays
   - PR QA Session (/pr-qa-session) — FlaskConical
   - AI PR Review (/ai-pr-review) — ShieldCheck
   - TC Library (/tc-library) — BookMarked
   - Bug Formatter (/bug-formatter) — FileSignature
3. A reusable PageHeader component: "< Home" breadcrumb, optional icon,
   bold title, optional subtitle, optional right-side actions.
4. Home page (/) with one card per module (icon, name, one-line description).
5. A placeholder page for every route above that uses PageHeader.
6. Toast provider in the root layout.
7. Responsive: on mobile the sidebar becomes a slide-out drawer.

Keep the nav items in one config file (src/config/nav.ts).
```

Check every link works, then commit:

```bash
git add .
git commit -m "Add app shell with sidebar and module routes"
git push
```

---

## 6. Set up the database (Supabase)

1. Go to https://supabase.com → **New project**.
   - Name: `rakesh-qa-hub`
   - Region: **Mumbai (ap-south-1)**, closest to Bangalore
   - Save the database password somewhere safe.
2. Open **Project Settings → Database → Connection string**. Copy two URLs:
   - **Transaction pooler** (port `6543`): used by the app
   - **Direct connection** (port `5432`): used for migrations
3. Create `.env` in the repo root:

```env
# Supabase
DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"

# CI Reports (step 10)
GITHUB_TOKEN=""

# Optional — AI root cause in CI Reports
ANTHROPIC_API_KEY=""

# Protects destructive actions (step 8)
ADMIN_PASSCODE="choose-a-long-passcode"
```

4. Make sure `.env` is **never committed**. Check `.gitignore` contains:

```
.env
.env*.local
```

5. Initialise Prisma:

```bash
npx prisma init
```

6. Put this in `prisma/schema.prisma`. It combines the data models from all the prompt files:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ---------- Bug Tracker ----------
model Team {
  id        String        @id @default(cuid())
  name      String        @unique
  features  FeaturePage[]
  createdAt DateTime      @default(now())
}

model FeaturePage {
  id        String   @id @default(cuid())
  name      String
  teamId    String?
  team      Team?    @relation(fields: [teamId], references: [id])
  sheetUrl  String?
  issues    Issue[]
  createdAt DateTime @default(now())
}

model Issue {
  id            String      @id @default(cuid())
  featurePageId String
  featurePage   FeaturePage @relation(fields: [featurePageId], references: [id], onDelete: Cascade)
  title         String
  description   String?
  severity      String      @default("P2")
  status        String      @default("OPEN")
  isValid       Boolean     @default(true)
  reporter      String?
  assignee      String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}

// ---------- QA Tracker ----------
model Resource {
  id     String    @id @default(cuid())
  name   String
  email  String?
  active Boolean   @default(true)
  logs   TaskLog[]
}

model TaskLog {
  id          String   @id @default(cuid())
  resourceId  String
  resource    Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  date        DateTime
  description String
  status      String   @default("NOT_STARTED")
  hours       Float
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// ---------- AI PR Review ----------
model Flag {
  id           String   @id @default(cuid())
  date         DateTime @default(now())
  repo         String
  prNumber     Int?
  filePath     String?
  line         Int?
  flagType     String
  detail       String
  severity     String
  suggestedFix String?
  loggedBy     String?
  source       String   @default("MANUAL")
  createdAt    DateTime @default(now())
}

// ---------- TC Library ----------
model TestPlanEntry {
  id          String   @id @default(cuid())
  name        String
  prReference String?
  output      String
  createdBy   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// ---------- PR QA Session ----------
model SessionTemplate {
  id         String   @id @default(cuid())
  name       String   @unique
  focusAreas String[]
  steps      Int[]
  context    String?
  specRef    String?
  createdAt  DateTime @default(now())
}

// ---------- CI Reports ----------
model CiSuite {
  id             String   @id @default(cuid())
  name           String
  repo           String   // "owner/name"
  workflowFile   String
  color          String   @default("blue")
  dispatchInputs Json?    // [{ key, label, type: "text" | "choice", options?, default? }]
  sortOrder      Int      @default(0)
  createdAt      DateTime @default(now())
}

model RootCauseCache {
  runId     String   @id
  summary   String
  detail    String
  createdAt DateTime @default(now())
}
```

7. Create the tables:

```bash
npx prisma migrate dev --name init
```

8. Add a shared Prisma client at `src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

9. Add `postinstall` to `package.json` so Vercel generates the client on each deploy:

```json
"scripts": {
  "postinstall": "prisma generate",
  "dev": "next dev",
  "build": "prisma migrate deploy && next build",
  "start": "next start"
}
```

10. **Seed.** The app starts empty: CI suites, teams, feature pages and resources
    are all created by users in the app. The default seed creates only what the app
    needs to run (no CI suites, teams, feature pages or resources). Ask Claude Code:

```
Create prisma/seed.ts that creates only what the app needs to run — no CI suites,
teams, feature pages or resources. Add "prisma": {"seed": "tsx prisma/seed.ts"}
to package.json. Optionally add an `npm run seed:demo` script with clearly
generic demo data ("Demo Team", "Sample Feature", "Demo Resource 1",
"Demo Suite") for local testing and E2E only. Never run it against
production automatically, and never use real names.
```

```bash
npm install -D tsx
npx prisma db seed
```

---

## 7. Build the modules with Claude Code

Build **one module per session**, in this order. For each one:

1. Start Claude Code in the repo: `claude`
2. Give it this prompt, changing the file name:

```
Read prompts/BugFormatter-prompt.md and implement that page at its route,
inside the existing app shell (use PageHeader and the shared sidebar).
Use the Prisma client in src/lib/db.ts for any data, and Next.js route
handlers under src/app/api/ for the API routes in the prompt.
Mark anything tagged [inferred] as a simple, working version.
When done, run `npm run build` and fix any errors.
```

3. Test it locally at http://localhost:3000.
4. Commit and push:

```bash
git add .
git commit -m "Add Bug Formatter module"
git push
```

| Order | Prompt file               | Notes                                                    |
|:-----:|---------------------------|----------------------------------------------------------|
| 1     | `BugFormatter-prompt.md`  | Client-only, quickest win                                |
| 2     | `PRQASession-prompt.md`   | Client-only; saved templates use `SessionTemplate`       |
| 3     | `TCLibrary-prompt.md`     | First database module                                    |
| 4     | `AIPRReview-prompt.md`    | Markdown table parser + flags table                      |
| 5     | `QATracker-prompt.md`     | Recharts for analytics                                   |
| 6     | `BugTracker-prompt.md`    | Skip Google Sheets at first; add it later if needed      |
| 7     | `CI-prompt.md` or `CIskill.md` | Needs `GITHUB_TOKEN` (step 10)                      |

**Tip:** if you save `CIskill.md` as `.claude/skills/ci-reports-dashboard/SKILL.md` in the repo, Claude Code picks it up as a skill automatically. You can convert the other prompts the same way.

---

## 8. Protect the public app (no login needed)

You want anyone to use every module without signing in. That's fine, but a public link with open write access gets abused by bots. Add these protections; normal visitors won't notice them.

| Risk | Protection |
|---|---|
| Strangers trigger your CI repeatedly (burns GitHub Actions minutes) | **Run Workflow** and suite changes ask for `ADMIN_PASSCODE`; rate-limit to a few runs per hour |
| Someone deletes all data | **Delete / Clear all** asks for `ADMIN_PASSCODE` |
| Spam entries | Rate-limit write API routes per IP (e.g. 30 writes per 10 min) |
| AI root-cause costs | Cache per run ID (already in the schema), plus a daily call limit |
| Junk filling the demo | Optional nightly reset: a Vercel Cron job re-runs the seed |
| Leaked secrets | Tokens only in Vercel environment variables, never in code or the browser |

Ask Claude Code:

```
Add lightweight protection for this public, no-login app:
1. src/lib/admin.ts: verify an "x-admin-passcode" header against
   process.env.ADMIN_PASSCODE.
2. Require it on: CI dispatch, adding/editing/reordering CI suites,
   every DELETE route, and "Clear all".
   In the UI, show a small passcode dialog before those actions and
   remember the passcode in sessionStorage for the tab.
3. A simple in-memory rate limiter for POST/PATCH routes
   (30 requests per 10 minutes per IP) returning 429 with a friendly message.
4. Validate every API body with zod.
```

---

## 9. Deploy to Vercel

1. Go to https://vercel.com/new and import **RakeshAM03/rakesh_qa_hub**.
2. Framework preset: **Next.js** (auto-detected). Leave the build settings as they are.
3. Under **Environment Variables**, add the same keys as your `.env`:

   | Key                 | Value                                  |
   |---------------------|----------------------------------------|
   | `DATABASE_URL`      | Supabase transaction pooler URL (6543) |
   | `DIRECT_URL`        | Supabase direct URL (5432)             |
   | `GITHUB_TOKEN`      | From step 10                           |
   | `ANTHROPIC_API_KEY` | Optional                               |
   | `ADMIN_PASSCODE`    | Your passcode                          |

4. Click **Deploy**. In 1–2 minutes you get a URL like `https://rakesh-qa-hub.vercel.app`.
5. To change the subdomain: **Project → Settings → Domains**, then edit it to something like `rakesh-qa-hub.vercel.app`.

From now on, **every `git push` to `main` redeploys automatically**, and every pull request gets its own preview URL.

**Make sure the link is public:** in **Project → Settings → Deployment Protection**, set **Vercel Authentication** to **Disabled** for production. Otherwise visitors are asked to log in to Vercel.

---

## 10. Connect CI Reports to your own automation

CI Reports lists and triggers GitHub Actions runs. Point it at your **own** automation repos (for example, a Selenium/Java or Playwright framework).

### 10.1 Add a workflow to your automation repo

`.github/workflows/regression.yml`:

```yaml
name: Regression Suite

on:
  workflow_dispatch:
    inputs:
      environment:
        description: "Environment"
        type: choice
        options: [qa, staging]
        default: qa
      suite:
        description: "TestNG suite file"
        default: "testng.xml"
  schedule:
    - cron: "30 3 * * 1-5"   # 9:00 AM IST, weekdays

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"
          cache: maven
      - name: Run tests
        run: mvn -B test -Denv=${{ inputs.environment || 'qa' }} -DsuiteXmlFile=${{ inputs.suite || 'testng.xml' }}
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-report
          path: target/surefire-reports
```

To get a clickable **REPORT** link, publish the HTML report (Allure or Extent) to GitHub Pages from the workflow, and have CI Reports link to `https://<your-username>.github.io/<repo>/<run-number>/`.

### 10.2 Create a GitHub token

GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new token**:

- Repository access: only your automation repos
- Permissions: **Actions: Read and write**, **Contents: Read-only**, **Metadata: Read-only**
- Expiration: 90 days (set a reminder to rotate it)

Add it as `GITHUB_TOKEN` in Vercel, then redeploy.

### 10.3 Add the suites in the app

There is no config file for CI suites; they live in the database (`CiSuite`).

1. Open `/ci` and click **Add suite** (asks for the admin passcode).
2. Enter a display name, the GitHub repo (`owner/name`), the workflow file
   (e.g. `regression.yml`), a colour, and any dispatch inputs the workflow takes
   (e.g. `environment` as a choice of `qa` / `staging`).
3. Save. With `GITHUB_TOKEN` set, the app checks the repo and workflow exist first.

Edit, delete and reorder suites from the same page.

---

## 11. Custom domain (optional)

1. Buy a domain (e.g. `rakeshqahub.in`) from GoDaddy, Hostinger or Namecheap.
2. Vercel → **Project → Settings → Domains → Add** → enter the domain.
3. At your registrar, add the DNS records Vercel shows:
   - `A` record `@` → `76.76.21.21`
   - `CNAME` record `www` → `cname.vercel-dns.com`
4. HTTPS is issued automatically within a few minutes.

---

## 12. Testing the hub

This is a QA portfolio project, so test it like one.

### Playwright E2E tests

```bash
npm init playwright@latest
```

Ask Claude Code:

```
Write Playwright TypeScript tests (page object model) for every module:
navigation via sidebar, Bug Formatter parsing + manual + CSV, PR QA Session
prompt building with step deselection, TC Library create/import,
AI PR Review markdown-table parsing, QA Tracker log entry validation,
Bug Tracker new feature page modal. Each test creates the data it needs
(the default seed is empty).
```

### Run the tests on every push

`.github/workflows/e2e.yml`:

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
        env:
          BASE_URL: https://rakesh-qa-hub.vercel.app
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report
```

Then add the hub's own repo as a suite in CI Reports, so it shows the hub testing itself.

---

## 13. Final checklist

- [ ] Prompt files committed in `prompts/`
- [ ] App shell with all 8 sidebar items working
- [ ] Supabase project created, migration run, seed run (starts empty)
- [ ] All 7 modules built and passing `npm run build`
- [ ] Admin passcode on CI dispatch and deletes; rate limiting on writes
- [ ] `.env` **not** in the repo (`git log --all -- .env` shows nothing)
- [ ] Vercel deployed, environment variables set, **Deployment Protection disabled**
- [ ] Opened the URL in an incognito window: every module loads without login
- [ ] CI Reports connected to at least one of your automation repos
- [ ] Playwright suite running in GitHub Actions
- [ ] README with a screenshot, the live link and the tech stack
- [ ] Live link added to your portfolio site, LinkedIn and résumé

---

## 14. Troubleshooting

| Problem | Fix |
|---|---|
| `PrismaClientInitializationError` on Vercel | Check `DATABASE_URL` uses the pooler (6543) with `?pgbouncer=true`, and that `postinstall` runs `prisma generate` |
| Migrations fail on build | `DIRECT_URL` is missing or wrong; it must be port 5432 |
| Visitors are asked to log in to Vercel | Settings → Deployment Protection → disable Vercel Authentication for production |
| CI Reports shows nothing | Token lacks **Actions: Read** on that repo, or the suite's repo/workflow file in CI Reports is wrong |
| Run Workflow returns 404 | The workflow file has no `workflow_dispatch:` trigger, or it isn't on the default branch |
| Run Workflow returns 403 | Token needs **Actions: Read and write** |
| Supabase project paused | Free projects pause after 7 days without activity; open the dashboard and click **Restore**. The daily E2E run also keeps it active |
| Build works locally but not on Vercel | Run `npm run build` locally first; Vercel is stricter about TypeScript and ESLint errors |

---

## Important

- Build this from the prompt files only. Don't copy code, data, team names, PR links or bug details from any employer's internal tools. Use fictional demo data in the public version.
- Before making the repo public, search it for company names, internal URLs and tokens.
