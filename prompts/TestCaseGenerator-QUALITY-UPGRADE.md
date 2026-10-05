# Upgrade: Test Case Generator — Standard Test Case Format for ANY requirement

## 0. Principle

The Test Case Generator must produce **execution-ready, detailed test cases in one standard format for every requirement** — login, registration, forms, search/filter, payments, file upload, notifications, reports, APIs, anything.

`tests/fixtures/tcgen/golden-resume-upload.xlsx` is the **reference for format and level of detail only**. It happens to be about resume upload, but nothing in the generator may be specific to that feature. Its structure, field style, depth and workbook layout are the standard; its content is just one example.

Today's output fails this standard: checklist mode produces generic template cases ("the feature: invalid formats are rejected"), empty test data, 2–3 vague steps, one-line expected results, and ignores the requirement's actual rules.

---

## 1. The Standard Test Case Format (applies to every requirement and every mode)

### Columns (always in this order)

`ID | Title | Category | Type | Priority | Automation | Preconditions | Steps | Test data | Expected result` (+ optional `Requirement ref`)

### Field rules

| Field | Rule | Format example (any domain) |
|---|---|---|
| ID | `TC_<MODULE-ABBR>_<NNN>`, 3 digits; abbreviation from the module name | `TC_LGN_004`, `TC_PAY_012`, `TC_RU_007` |
| Title | Starts with "Verify", states the exact condition and the outcome; never a "the feature:" prefix | "Verify login is blocked after 5 consecutive wrong passwords" |
| Category | One of: Functional, Validation, Boundary Value, Security, UI, Usability, Accessibility, Reliability, Performance, Compatibility, Localisation, API, API / Security, Integration, Data Integrity | `Boundary Value` |
| Type | Positive / Negative | `Negative` |
| Priority | Default scheme "P1 - Critical / P2 - High / P3 - Medium / P4 - Low" (P0–P3 optional) | `P1 - Critical` |
| Automation | Yes / No | `Yes` |
| Preconditions | Numbered, 4–6 lines: application/environment available, logged-in role with the needed permission, starting screen/record state, test data prepared, any case-specific setup | "4. Test account has 4 failed attempts recorded." |
| Steps | Numbered, 5–10 lines, real navigation path and UI element names in quotes, one action per line, ending with a verification step (refresh, re-open, check list/DB/log) | "3. Enter the password in the 'Password' field and click 'Sign in'." |
| Test data | **Never empty.** Concrete values as `Key: value` lines: names, emails, amounts, dates, exact lengths/sizes, IDs, files, payloads | "Email: qa.user01@example.com / Password: Wrong@123 (attempt 5)" |
| Expected result | Numbered, 4–7 lines: immediate UI response, exact message text in quotes, resulting state after refresh/re-open (persistence), what must NOT happen (no partial save, no duplicate, no API side effect), recovery/retry possible, client- and server-side enforcement where relevant | "2. Message shown: 'Your account is locked for 15 minutes.'" |

### Universal coverage rules (applied to whatever the requirement contains)

For every rule, field, value or limit found in the requirement:

- **Each allowed value / option / path** → its own positive case.
- **Each limit** (length, size, count, amount, range, date, attempts, time) → boundary cases: exactly at the limit, limit − 1, limit + 1, far beyond, minimum/lower bound, zero/empty.
- **Each disallowed value class** → negative case(s).
- **Each required field** → missing/blank, whitespace-only, invalid format.
- **Each role** → allowed role succeeds; disallowed role blocked in UI **and** API.
- **Each state change** → persistence after refresh, effect visible wherever the data appears, audit/activity log.
- **Lifecycle** of the entity, where applicable: create, view, edit, delete, duplicate prevention, cancel mid-way.
- **Security** relevant to the feature: injection/XSS in inputs, auth/session expiry, unauthorised access, bypassing client validation via API, sensitive data exposure, brute force/rate limits.
- **UI**: labels/helper text, loading/progress, double-click prevention, empty/error states, keyboard use.
- **Reliability**: network loss / timeout mid-action, server error handling.
- **Compatibility** (supported browsers/devices), **Performance** (time for the heaviest valid input with an assumed SLA).
- **Assumptions & open questions** for anything the requirement leaves unclear (units, inclusive limits, single vs multiple, messages), referencing test IDs.

### Depth targets

Quick 12–18 · Standard 30–45 · Exhaustive 60–90. No duplicates, no filler.

---

## 2. Input improvements

Add to "More context" (optional, used in steps/test data when provided):
- **Navigation path** (e.g. "App > Settings > Profile")
- **UI element names** (buttons, fields, sections)
- **Environment** (e.g. "QA environment")
- **Known messages** (success/error copy)
- **Module abbreviation** for IDs (auto-suggested, editable)

If the module name is empty, derive it from the requirement's first line or main noun phrase. Never output "the feature". When navigation or element names are unknown, use clear neutral placeholders in quotes (e.g. `'<Submit button>'`, `'<Profile page>'`) and add an assumption line.

---

## 3. AI mode and "Copy prompt for Claude" (one shared prompt builder)

Rewrite `src/lib/tcgen/prompt.ts`:

1. **Role:** senior QA engineer writing execution-ready manual test cases that a new tester can run without asking questions.
2. **Inputs:** requirement, context fields, selected test types, depth, priority scheme, ID prefix.
3. **The Standard Test Case Format:** section 1's field rules and universal coverage rules, stated explicitly.
4. **Format examples, not content:** include 3 complete example cases from **different domains** to show the style, stating clearly "copy the format and depth, not the content":
   - one positive functional case (from the golden file, e.g. `TC_RU_001`);
   - one negative boundary case (from the golden file, e.g. `TC_RU_007`);
   - one written for a non-upload domain (e.g. a login lockout or form-field length case) in the same style — store it in `src/lib/tcgen/examples.ts`.
5. **Process:** (a) list the requirement's rules, allowed values, limits, roles and states; (b) plan coverage per category from the universal coverage rules; (c) write the cases; (d) self-review against the field rules (no empty test data, ≥ 5 steps, ≥ 4 expected lines, every extracted limit covered, no generic phrases) and fix before answering.
6. **Output:** JSON only, with `summary`, `requirementRules`, `assumptions`, `questions`, `testCases`.

AI mode specifics:
- For Standard/Exhaustive depth, generate **in batches by category group** (e.g. Functional+Validation · Boundary · Security+API · UI+Reliability+Compatibility+Performance) and merge: renumber IDs, remove duplicates. Long outputs must never be cut off.
- One generation counts once against the 10-per-hour limit regardless of batches.

Copy-prompt mode uses exactly the same prompt; Import accepts the JSON (fenced or not).

---

## 4. Checklist mode (no AI) — requirement-aware and domain-agnostic

Replace the generic-template-first approach with **a rule extractor + reusable generators** (`src/lib/tcgen/requirement.ts`, `src/lib/tcgen/generators/*`).

### Extract from any requirement text

- Module/feature name and abbreviation; main entity (user, order, resume, payment…) and actions (create, upload, login, search, edit, delete, export, approve…).
- **Allowed value lists** ("only A, B, C", "must be one of", "supported: …").
- **Limits with units:** size (KB/MB/GB → bytes), length (characters), count (items/attempts), amount/currency, numeric ranges, dates/age, time (seconds/minutes).
- **Required / optional fields** and field types (email, phone, password, date, number, URL, text, file, dropdown, checkbox).
- **Roles/permissions**, **states/status transitions**, **business rules** ("if … then …").

### Generic generators (each produces cases in the Standard Format with concrete test data)

| Generator | Triggered by | Produces |
|---|---|---|
| Allowed-values | any allowed list | one positive per value; disallowed classes; case sensitivity; empty selection |
| Limits / boundary | any limit | at, −1, +1, far beyond, min, zero/empty — with exact values in test data |
| Field validation | each field + type | required, whitespace, format rules per type (email, phone, password strength, date ranges, URL, numeric), Unicode/emoji, XSS/SQL strings |
| File input | files mentioned | per format, size boundaries, spoofed type, double/no extension, corrupted, protected, odd names, malware, multiple files, drag-and-drop, cancel |
| Auth / session | login, password, session, OTP | valid/invalid credentials, lockout/attempt limits, expiry, logout, remember-me, rate limiting |
| CRUD lifecycle | create/edit/delete/view | create, view, edit, delete, duplicate prevention, cancel, persistence, audit log |
| Search / filter / list | search, filter, sort, pagination | match, no match, partial/case, special chars, combined filters, sort order, page boundaries |
| Workflow / state | statuses, approvals, "if…then" | each valid transition, invalid transition blocked, rule branches |
| Roles | roles/permissions | allowed role UI+API, denied role UI+API, data isolation |
| Cross-cutting | always (filtered by selected types) | UI states, network loss, server error, session expiry, API bypass of client validation, browsers, performance |

Write all generator text in the Standard Format (no "the feature:" prefix, ≥ 5 steps, concrete test data, ≥ 4 expected lines). Pure templates are used **only** for selected test types no generator covers, written in the same detailed style and badged "Template". Generate assumptions from what was extracted (units, inclusive limits, unknown messages, unknown navigation).

---

## 5. Quality check on every result

Show a **Quality score (0–100)** above the table, with per-row warnings for: empty test data, < 5 steps, < 3 expected-result lines, title not starting with "Verify", generic phrases ("the feature", "works correctly", "as expected", "appropriate"), duplicate titles, and requirement limits/values not covered by any case.

- Amber marker on weak rows; a filter shows only weak rows.
- With AI: **"Improve weak cases"** regenerates only those rows. Without AI: **"Copy improve prompt"** builds a prompt containing the weak rows and the Standard Format rules.

---

## 6. Excel export — same workbook layout for every requirement

1. **Test Cases:** columns in the standard order; header bold white on dark blue `#1F4E78`; wrap text and top alignment on all cells; widths A 12, B 38, C 15, D 11, E 13, F 12, G 52, H 62, I 42, J 66; freeze panes at C2; autofilter on the header row.
2. **Summary:** "<Module> – Test Case Summary", the requirement line, then four blocks — Category, Type, Priority, Automation — each listing only the values present, with live `COUNTIF` formulas against the Test Cases sheet and a `SUM` total.
3. **Assumptions & Queries:** `# | Assumption / Open question to confirm with PO/Dev`.

File name `<Module_Name>_Test_Cases.xlsx`. CSV, Markdown, Gherkin and Postman exports use the same columns and content.

---

## 7. Tests — prove it works for different requirements, not one

Create `tests/fixtures/tcgen/requirements/` with 6 short, generic sample requirements:

1. **File upload:** "Resume upload — only PDF, DOCX, DOC, TXT; max file size 5 MB."
2. **Login:** "Login with email and password; account locks for 15 minutes after 5 failed attempts; password 8–20 characters."
3. **Registration form:** "Name (required, max 50 chars), email (required, unique), phone (10 digits), date of birth (age 18+)."
4. **Search & filter:** "Search candidates by name or skill; filter by location and experience (0–30 years); 20 results per page; sort by date or relevance."
5. **Payment:** "Pay an invoice by card or UPI; amount ₹1 to ₹1,00,000; duplicate payment for the same invoice is blocked."
6. **API endpoint:** "POST /api/users creates a user; requires admin token; email unique; returns 201, 400, 401, 403, 409."

For **each** sample, checklist mode must:
- produce ≥ 25 cases in the Standard Format (non-empty test data, ≥ 5 steps, ≥ 3 expected lines, "Verify" titles, no "the feature");
- cover every extracted allowed value and every limit at, −1 and +1;
- reach a quality score ≥ 80.

Additionally:
- **Golden format test:** the exported workbook for sample 1 matches the golden file's structure (sheet names, column order, widths, header style, freeze pane, COUNTIF summary blocks) — structure only, not wording.
- Unit tests: extractor (lists, units → bytes, lengths, ranges, counts, roles, field types), each generator, quality scorer, prompt builder (contains rules + 3 multi-domain examples + "format, not content" instruction), batch merge/renumber/dedupe.
- E2E: paste the login sample → checklist → score ≥ 80 → export xlsx → three sheets present; paste a sample AI JSON answer into Import → table shows it with quality score.
