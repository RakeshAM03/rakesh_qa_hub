# Prompt: Customer Issue RCA & Regression Hub for Rakesh QA Hub

Build a module called **Customer Issue RCA** for the **Rakesh QA Hub**.

## Purpose

When a customer reports an issue in production (an **escaped defect**), the team investigates, fixes it and writes an RCA. This module turns that into a repeatable QA process so **the same issue never escapes again**:

1. Pull customer issues **directly from Jira** (or import / add manually).
2. Classify each issue with a **disposition**, a **two-level RCA category**, the **stage where it should have been caught**, and impact details.
3. Create **regression test cases** for it in the hub's Standard Test Case Format.
4. Mark those cases **mandatory before every release**.
5. Execute them per release and **block the release** in Release Readiness until all mandatory cases pass.
6. Report trends per product: escapes, % catchable, top RCA categories, where the process leaks.

Everything is generic and user-entered — no customer, company or product names are hard-coded in code, seed, tests, screenshots or docs. The default seed creates only the generic lists below (categories, dispositions, stages), never issues.

## Tech stack and placement

Same stack and conventions as the rest of the hub (see PROGRESS.md).

- **Routes:** `/customer-issues` (dashboard + list), `/customer-issues/[id]` (detail), `/customer-issues/pack` (regression pack), `/customer-issues/runs/[runId]` (release run), `/customer-issues/settings` (lists + Jira)
- **Sidebar:** group **Test Planning**, after Release Readiness; icon `LifeBuoy`; accent colour rose.

---

## 1. Classification model (the core of this module)

All lists below are **seeded as editable defaults** (Settings → Lists, passcode-protected for edit/delete). Each list item has: name, description/definition, sort order, active flag.

### 1a. Disposition (what happened to the ticket)

Filled for every issue. RCA fields are required **only** when Disposition = **Valid Bug**.

| Disposition | Meaning | Extra field |
|---|---|---|
| Valid Bug | Real defect → RCA required | — |
| Duplicate | Same as another issue | Link to issue key (required) |
| Known Issue | Already reported/accepted | Link to issue key (required) |
| Not a Bug / Works as Designed | Expected behaviour | Note |
| Can't Reproduce | Could not be confirmed | Note |
| User Error / Training | Customer misuse; may need docs/UX change | Note |

### 1b. RCA Category → Sub-category (two-level, dependent dropdown)

The sub-category dropdown shows only the sub-categories of the selected main category. Each main category stores a **default Catchable value** and a **default Owner team**, pre-filled when selected (user can change).

| Main category | Definition | Sub-categories | Default Catchable | Default Owner |
|---|---|---|---|---|
| **QA Miss** | A test existed or was in scope, but QA didn't catch it | Test case missing · Test case existed but not executed · Edge case not covered · Wrong/insufficient test data · Negative scenario missed · Cross-browser/device not tested · Regression not run on impacted area | Yes | QA |
| **QA Skip** | Testing was knowingly skipped or reduced | Time pressure · Hotfix without full QA · Descoped by decision · Environment/build not available for testing | Yes | QA + PM |
| **Code Defect** | Logic bug in new or changed code | Logic error · Missing null/validation check · Error handling missing · Performance/timeout in code · Concurrency/race condition · Backward-compatibility break | Yes | Dev |
| **Code Sync / Release** | Merge, branch or release packaging problem | Fix missing from release branch · Merge conflict overwrote a change · Wrong build deployed · Feature flag misconfigured | Partially | Dev + DevOps |
| **Config / Data** | Configuration or data caused the issue | Shared config affected another client · Client-specific setting wrong · Data migration issue · Bad/duplicate data in production · Default values changed | Partially | Dev + Support |
| **Infra / Deployment** | Servers, deployment, caching, networking | Static asset/cache issue · Server/DB down or slow · CDN/DNS · Scaling/load · Deployment script failure · Third-party outage | No | DevOps |
| **Integration / Third-party** | External system behaviour | Partner API behaviour changed · Partner returned unexpected/empty data · Auth/token expiry · Rate limit from partner · Webhook/sync failure | Partially | Dev + QA |
| **Requirement Gap** | Requirement missing or unclear; built as specified but wrong for the customer | Requirement missing · Ambiguous acceptance criteria · Client-specific need not captured · Change request not communicated | No | PO / BA |
| **Design / UX** | Design or usability problem | Confusing flow · Missing validation message · Accessibility issue | Partially | Design + QA |
| **Security** | Security weakness | Access/permission leak · Data exposure · Injection/XSS | Yes | Dev + QA |
| **Others** | Only when nothing else fits — comment required | — | — | — |

"Others" requires a comment explaining why no category fits. The dashboard shows the % of "Others" (should stay low).

### 1c. Should have been caught at (stage)

| Stage | Example |
|---|---|
| Requirement review | Ambiguous acceptance criteria |
| Design review | Missing validation in the design |
| Code review / unit tests | Missing null-check |
| QA functional testing | Edge case not tested |
| Regression testing | Impacted area not re-tested |
| UAT | Client-specific flow |
| Deployment / release checklist | Wrong build, cache not cleared |
| Monitoring / alerting | Production errors not alerted |
| Not catchable before release | Genuine third-party outage etc. |

### 1d. Other classification fields

| Field | Values |
|---|---|
| **Catchable by QA?** | Yes / No / Partially (pre-filled from category default) |
| **Why it escaped** (required when Catchable = Yes/Partially) | Missing test case / Missing test data / Environment gap / Not in scope / Time pressure / Not reproducible pre-release / Other |
| **Detected by** | Customer / Support / Monitoring / Internal team |
| **Scope** | Single client / Multiple clients / All clients |
| **Customer impact** | Blocker / Major / Minor / Cosmetic |
| **Severity** | P1 - Critical / P2 - High / P3 - Medium / P4 - Low |
| **Recurring?** | Yes (link to previous issue key, required) / No |
| **Owner team** | QA / Dev / DevOps / PO-BA / Design / Support / combinations (pre-filled from category) |

---

## 2. Customer issue record

| Field | Type | Notes |
|---|---|---|
| Issue key | text, unique | e.g. `DEMO-101`; issue URL (link to external tracker) |
| Summary | text, required | |
| Description | long text | from Jira (plain text) — used by the test case generator |
| Status | Open / In Progress / Fixed / Closed (from Jira when synced) | |
| **Product** | user-managed list (e.g. "CRM", "CMS" — generic examples in Settings, editable) | one hub for several products; filter everywhere |
| **Module / feature** | text with suggestions from existing values | |
| Created date | date | when reported |
| Released in (version) | text | release that introduced the bug (optional) |
| Fix version | text | |
| Resolved date | date | |
| **Days to resolve** | computed = resolved − created | |
| **Days to detect** | computed = created − release date of "Released in" (when known) | how long the bug lived in production |
| Disposition | 1a | |
| RCA category / sub-category | 1b | |
| Should have been caught at | 1c | |
| Catchable, Why it escaped, Detected by, Scope, Customer impact, Severity, Recurring, Owner team | 1d | |
| **RCA** | Markdown | root cause and fix |
| **Prevention action** | Markdown | what changes so it can't recur |
| Prevention status | Not started / In progress / Done | so preventions are tracked, not forgotten |
| QA owner | text ("Your name" default) | |
| Comments | Markdown | |
| Regression required? | Yes / No (default Yes for Valid Bug; No for other dispositions) | |

### Input methods

- **Jira sync (primary)** — section 3.
- **Import CSV / Excel** with column mapping (auto-matches common headers like "Issue key", "Summary", "Status", "Created date", "Catchable?", "Type", "RCA", "Comments"; old "Type" values are mapped to the new categories via a mapping step the user confirms). Preview, validate, skip duplicates by issue key. Downloadable template.
- **+ New issue** form.
- Bulk edit: disposition, category, product, catchable, owner team.

### Validation rules

- Disposition = Valid Bug → RCA category, sub-category, caught-at stage, catchable and RCA text required before status can be set to "RCA complete".
- Catchable = Yes/Partially → "Why it escaped" required.
- Duplicate / Known Issue / Recurring = Yes → linked issue key required.
- Category = Others → comment required.
- Each issue shows an **RCA completeness** indicator (e.g. "7/9 fields") and appears in the **"Needs RCA"** queue until complete.

---

## 3. Jira integration (issues come in automatically)

### Connection (Settings → Jira, passcode-protected)

- Server-side environment variables only (never sent to the browser or logged): `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`.
- **Sync query (JQL)** stored in the database and editable, e.g. `project = ABC AND type = Bug AND labels = customer-reported ORDER BY created DESC`. Nothing hard-coded.
- **Product mapping:** map Jira project keys or components to the hub's Product list (e.g. project `ABC` → Product "CRM").
- **Test connection** button (`/rest/api/3/myself`).
- If the variables aren't set: show "Jira not connected — use CSV import or add issues manually"; everything else still works.

### Sync

- **Sync now** (rate-limited, 5/hour) + optional scheduled sync (Vercel Cron, e.g. every 6 hours; toggle in Settings).
- Jira REST API v3 search with the JQL, paginated, retry on 429 using `Retry-After`.
- Fields: key, summary, description (ADF → plain text), status, created, updated, resolution date, priority, reporter, assignee, components, labels, fix versions, issue URL.
- **Upsert by issue key:** Jira-owned fields refresh on every sync; **hub-owned fields** (all of section 1, RCA, prevention, comments, regression cases) are **never overwritten**.
- Sync log: start/end, added/updated/unchanged, errors.
- Badges: "Synced from Jira", last-synced time, **Open in Jira** link.

### Optional write-back (off by default)

When RCA is completed, post a Jira **comment**: "RCA: <category> → <sub-category> · Caught at: <stage> · Catchable: <value> · Regression cases: <n> · <hub link>". Only if the Jira admin approves.

---

## 4. Regression test cases per issue

On each issue's detail page (Disposition = Valid Bug and Regression required = Yes):

- **Generate test cases** with the **Test Case Generator engine** (Standard Test Case Format: ID, Title "Verify…", Category, Type, Priority, Automation, Preconditions, Steps, Test data, Expected result). The requirement text passed in is built from: summary + description + RCA + sub-category + prevention, with the instruction to cover the exact failure scenario, the fixed behaviour, variants of the same root cause (driven by the sub-category, e.g. "Missing null/validation check" → empty/null/partial responses), and closely related flows that could regress.
  - Modes: AI (if key set), Copy prompt for Claude + Import, Checklist.
- Edit/add/remove cases manually.
- Each case: linked issue key, product, module, **Mandatory before release** (default Yes), **Automated?** (No / Planned / Yes + automation reference).
- IDs: `TC_CI_<issue-key>_<NN>`.
- **Save to TC Library** too (one entry per issue).

## 5. Mandatory regression pack (`/customer-issues/pack`)

- All mandatory cases from all issues; filter by product, module, RCA category, severity, automated status.
- Counts: total, automated vs manual, per product/module.
- Retire a case (reason + passcode) when a feature is removed; stays in history.
- Export as Excel (Standard Test Case Format workbook + Linked issue key + Product columns).

## 6. Release execution run (`/customer-issues/runs/[runId]`)

- **+ New release run:** name, **product(s)** in scope, environment, build/version, optional link to a Release Readiness release. Snapshots the mandatory pack filtered by product.
- Execute each case: **Pass / Fail / Blocked / N/A** (N/A needs a reason), executed by, date, notes, evidence link.
- **Fail** → "Send to Bug Formatter" (pre-filled with the case and linked customer issue) and run status **Blocked**.
- Run is **Complete** only when every case is Pass or N/A-with-reason.
- Export run report (Excel + Markdown for Slack/email).

## 7. Release Readiness integration (enforcement)

New auto-gate type: **"Customer issue regression pack passed"** — blocker by default; passes only when the linked run is Complete with 0 Fail / 0 Blocked; shows "x/y executed, z failed" with a link. Add it to the built-in "Standard release" template.

## 8. Dashboard (`/customer-issues`)

**Product filter** at the top (All / each product) applies to everything below.

KPI tiles:
- Customer issues this quarter (vs last quarter)
- **% catchable** (Yes + Partially)
- **% found by customers first** (Detected by = Customer)
- **Needs RCA** count (should trend to 0)
- **Valid bugs missing regression cases** (should be 0)
- **Recurring issues** count
- Avg days to resolve / days to detect
- Preventions not done

Charts:
- Issues per month, stacked by product
- RCA main category breakdown + drill-down into sub-categories
- **Should have been caught at** — where the process leaks
- Why it escaped
- Catchable vs not, per product
- Disposition breakdown (how many reports were real bugs)
- Top modules with customer issues
- Owner team breakdown

Tables:
- Issue list with all key fields, completeness indicator, regression case count, last run result.
- **Leakage insights** (auto text): e.g. "Code review / unit tests is the most common catch stage this quarter (38%)", "Config / Data issues doubled vs last quarter", "3 issues are recurring".

## 9. Data model

```ts
ListItem { id, list: PRODUCT | DISPOSITION | RCA_CATEGORY | RCA_SUBCATEGORY | CAUGHT_AT |
           WHY_ESCAPED | DETECTED_BY | SCOPE | IMPACT | OWNER_TEAM,
           name, description?, parentId?, defaultCatchable?, defaultOwner?, sortOrder, active }

JiraSettings { id, jql, productMapping Json, scheduleEnabled, writeBackEnabled, updatedAt }
JiraSyncLog  { id, startedAt, finishedAt?, added, updated, unchanged, errors Json? }

CustomerIssue {
  id, issueKey @unique, issueUrl?, source: JIRA | CSV | MANUAL, lastSyncedAt?,
  summary, description?, status, productId?, module?, createdDate, releasedIn?, fixVersion?,
  resolvedDate?, severity?, priority?, assignee?, components String[], labels String[],
  dispositionId?, linkedIssueKey?, rcaCategoryId?, rcaSubcategoryId?, caughtAtId?,
  catchable: YES | NO | PARTIAL | null, whyEscapedId?, detectedById?, scopeId?, impactId?,
  recurring Boolean, ownerTeamId?, rca?, prevention?, preventionStatus, qaOwner?, comments?,
  regressionRequired Boolean, rcaComplete Boolean, createdAt, updatedAt
}

RegressionCase { id, issueId, caseId, title, category, type, priority, preconditions, steps,
                 testData, expectedResult, product?, module?, mandatory, automated, automationRef?,
                 retired, retiredReason?, createdAt, updatedAt }

RegressionRun { id, name, productIds String[], environment?, build?, releaseId?,
                status: IN_PROGRESS | BLOCKED | COMPLETE, createdBy?, createdAt }
RegressionRunResult { id, runId, caseSnapshot Json, result: PENDING | PASS | FAIL | BLOCKED | NA,
                      reason?, notes?, evidenceUrl?, executedBy?, executedAt? }
```

Days to resolve / detect and completeness are computed, not stored.

## 10. Rules

- Generic content only. `seed:demo` creates obviously fake issues covering several categories, e.g.:
  - "DEMO-101 Apply form rejects 10-digit phone numbers" → Config / Data → Shared config affected another client → caught at Regression testing
  - "DEMO-102 Blank page after deployment" → Infra / Deployment → Static asset/cache issue → caught at Deployment checklist
  - "DEMO-103 Partner sync shows false 'rejected' status" → Code Defect → Missing null/validation check → caught at Code review / unit tests
  - "DEMO-104 Cannot save item with an archived item's name" → Code Defect → Logic error → caught at QA functional testing
  - "DEMO-105 Duplicate of DEMO-101" → Disposition: Duplicate
- Deletes, retiring cases and editing lists need the admin passcode.
- Escape all user content; render Markdown safely.
- Add a user guide `docs/user-guide/customer-issues.md` (same 11 sections as other guides), including the category definitions table, and a "How to use" link on the page.

## 11. Tests

- Unit: dependent dropdown filtering; category defaults pre-fill catchable/owner; validation rules (Valid Bug requirements, Duplicate link, Others comment, Why-escaped); completeness score; CSV import mapping incl. old "Type" → new category mapping; Jira mapper (ADF → text, product mapping, hub-owned fields never overwritten); run completion rules; Readiness gate logic; dashboard aggregations (% catchable, caught-at, recurring, days to resolve/detect).
- E2E (mocked Jira): sync → issue appears in Needs RCA → classify (disposition, category, sub-category, caught-at) → generate checklist cases → create release run → fail one case → run Blocked and Readiness gate fails → pass it → run Complete and gate passes → dashboard updates.
- Never call a real Jira in tests or CI.
