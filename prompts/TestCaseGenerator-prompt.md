# Prompt: Requirements → Test Case Generator Page for Rakesh QA Hub

Build a page called **Test Case Generator** for the **Rakesh QA Hub**. QA pastes a requirement (user story, acceptance criteria, feature description, or an API definition) and gets a complete set of test cases covering **Functional**, **Non-Functional** and **API** testing. Test cases can be edited, exported (Excel/CSV/Markdown/Gherkin) and saved to the **TC Library**.

It works in three ways:
1. **AI generation** — when `ANTHROPIC_API_KEY` is set.
2. **Copy prompt for Claude** — always available: builds a ready-to-paste prompt, and the user pastes Claude's answer back to import it.
3. **Checklist mode** — always available, no AI: generates a structured checklist of test ideas from built-in templates based on what the user selects.

## Tech stack

Same as the rest of the hub. `exceljs` (or SheetJS) for `.xlsx` export.

- **Route:** `/test-case-generator`
- **Sidebar:** group **Planning**, icon `ListChecks`
- **Accent colour:** blue

## Layout

- Breadcrumb `< Home`, `ListChecks` icon + title "Test Case Generator".
- Subtitle: "Turn requirements into functional, non-functional and API test cases."
- Two steps on one page:
  1. **Input & options** card (top).
  2. **Generated test cases** (below), with a toolbar.
- History drawer on the right (saved generations).

## 1. Input card

### Requirement input (tabs)

| Tab | Accepts |
|---|---|
| User story / requirement | Free text: user story, acceptance criteria, feature description, business rules |
| API definition | Paste an **OpenAPI/Swagger** spec (JSON or YAML), a **cURL** command, or fill a small form: method, endpoint, request body sample, response sample, auth type, notes |
| Upload | `.txt`, `.md`, `.json`, `.yaml` (≤ 1 MB) — content goes into the matching tab |

Optional fields (collapsible "More context"):
- **Module / feature name** (used in test case IDs and titles)
- **Application type:** Web / Mobile / API / Desktop
- **Platforms / browsers** (free text)
- **User roles** (comma-separated, e.g. "Admin, Recruiter, Guest")
- **Business rules / constraints** (textarea)
- **Out of scope** (textarea)

### Test types to generate (multi-select chips, grouped)

**Functional**
- Positive (happy path)
- Negative
- Boundary value analysis
- Equivalence partitioning
- Edge cases
- Field validation (UI)
- Role / permission based
- Workflow / end-to-end
- Regression impact

**Non-Functional**
- Performance (load, stress, response-time targets)
- Security (auth, authorisation, injection, XSS, CSRF, sensitive data, session)
- Usability / UX
- Accessibility (WCAG 2.2 AA: keyboard, screen reader, contrast, focus)
- Compatibility (browsers, devices, OS, screen sizes)
- Reliability / recovery (network loss, retries, timeouts)
- Localisation (dates, currency, language, RTL)

**API** (enabled when the API tab is used or app type = API)
- Status codes (2xx, 4xx, 5xx)
- Request validation (required fields, types, formats, lengths, enums)
- Response schema validation
- Authentication / authorisation (missing, invalid, expired token, wrong role)
- Headers (content type, CORS, caching)
- Pagination, filtering, sorting
- Idempotency and concurrency
- Rate limiting
- Error message contract
- Contract / backward compatibility

Buttons: **Select all** · **Clear** · presets: **Smoke**, **Full functional**, **API complete**, **Everything**.

### Options

| Option | Values | Default |
|---|---|---|
| Depth | Quick (~10–15) / Standard (~25–40) / Exhaustive (60+) | Standard |
| Output format | Detailed steps / Gherkin (Given-When-Then) / Both | Detailed steps |
| Priority scheme | P0–P3 / High-Medium-Low | P0–P3 |
| Include test data examples | on / off | on |
| ID prefix | text | derived from module name, e.g. `CHK` → `TC-CHK-001` |

### Generate buttons

- **Generate with AI** (only when the key is set).
- **Copy prompt for Claude** — always shown.
- **Generate checklist (no AI)** — always shown.

## 2. Generation modes

### 2a. AI generation

`POST /api/test-case-generator/generate` with the requirement, context, selected types and options (input max 30 KB). The system prompt asks Claude to act as a senior QA engineer and return **only JSON** matching this schema:

```json
{
  "summary": "one paragraph: what's being tested and key risks",
  "assumptions": ["…"],
  "questions": ["open questions / ambiguities in the requirement"],
  "testCases": [
    {
      "id": "TC-CHK-001",
      "title": "…",
      "category": "Functional | Non-Functional | API",
      "type": "Positive | Negative | Boundary | Security | Performance | …",
      "priority": "P0 | P1 | P2 | P3",
      "preconditions": "…",
      "testData": "…",
      "steps": ["…", "…"],
      "expectedResult": "…",
      "gherkin": "Feature/Scenario text if requested, else null",
      "requirementRef": "which acceptance criterion it covers, if any",
      "automationCandidate": true,
      "api": { "method": "POST", "endpoint": "/users", "headers": {}, "body": {}, "expectedStatus": 201, "assertions": ["…"] }
    }
  ]
}
```

- Validate with zod; if invalid, retry once with the validation error, then show a friendly error.
- Use the model constant from `src/config/ai.ts`.
- Rate limit: 10 generations per hour per IP. Show a spinner with **Cancel**.

### 2b. Copy prompt for Claude

- Builds the same instructions + inputs into a copyable prompt (with the JSON schema above).
- Below it: **"Paste Claude's answer"** textarea + **Import** button. Extract the JSON (even if wrapped in ```json fences or surrounded by text), validate it, and load the test cases into the table. If JSON fails, try to parse a Markdown table with the main columns as a fallback.

### 2c. Checklist mode (no AI)

Rule-based: for each selected test type, add template test ideas from `src/lib/tcgen/templates.ts`, filling in the module name and detected nouns where possible. Also:
- **Field detection:** scan the requirement for field-like words ("email", "password", "phone", "date", "amount", "quantity", "name", "file/upload", "URL", "OTP", "search") and add targeted validation and boundary cases for each (e.g. email → valid, missing @, max length, leading/trailing spaces, Unicode, duplicate).
- **API:** if an OpenAPI spec is pasted, parse it and generate per-endpoint cases (each documented status code, each required field missing, wrong types, auth missing/invalid, enum invalid, pagination params if present). For a cURL command, parse method/URL/headers/body and do the same at a basic level.
- Mark these cases with a "Template" badge so the user knows they're generic and should be reviewed.

## 3. Generated test cases

### Summary bar

Counts by category and priority (small chips), plus "Automation candidates: N". If AI returned **assumptions** and **questions**, show them in a collapsible panel above the table, with a **Copy questions** button (to send to the product owner).

### Table

| Column | Notes |
|---|---|
| ☐ | row selection |
| ID | editable |
| Title | editable |
| Category | Functional / Non-Functional / API (coloured pill) |
| Type | pill |
| Priority | P0 red, P1 orange, P2 amber, P3 grey |
| Preconditions | expandable |
| Steps | numbered, expandable |
| Test data | expandable |
| Expected result | expandable |
| Automation | toggle |

- Click a row to open an **edit drawer** with all fields (and Gherkin / API details if present).
- Filters: category, type, priority, text search. Sort by ID or priority.
- Row actions: duplicate, delete (local only until saved — no passcode needed before saving), move up/down.
- **+ Add test case** (blank row).
- Bulk actions on selected rows: change priority, delete, export selected.
- **Coverage view** toggle: a simple matrix of requirement references (acceptance criteria lines) × test cases, highlighting criteria with no tests.

### Toolbar actions

| Action | Output |
|---|---|
| Export Excel | `.xlsx` with one sheet "Test Cases" (columns above, steps joined with line breaks), a "Summary" sheet, and an "API" sheet if any API cases exist |
| Export CSV | Same columns, UTF-8 with BOM (opens cleanly in Excel) |
| Copy Markdown | Markdown table |
| Download Gherkin | `.feature` file grouping scenarios by category |
| Export for Postman | (API cases only) a Postman collection v2.1 JSON with each API case as a request |
| Send to API Playground | (API cases only, if that module exists) creates a collection with the API cases as saved requests and assertions |
| Save to TC Library | Creates a TC Library entry (name = module name + date, PR reference optional) with the cases as Markdown, so they can be reused in PR QA Sessions |
| Save generation | Saves inputs + cases to this module's history |

## 4. History

- Drawer listing saved generations: name, date, counts, created by ("Your name" field).
- Open to reload inputs and cases; duplicate; delete (passcode).

## Data model

```ts
TestCaseGeneration {
  id, name, requirement String, apiInput String?, context Json, options Json,
  selectedTypes String[], mode: AI | IMPORTED | CHECKLIST,
  summary String?, assumptions String[], questions String[],
  testCases Json, createdBy String?, createdAt, updatedAt
}
```

## API routes

| Route | Purpose |
|---|---|
| `POST /api/test-case-generator/generate` | AI generation (needs key) |
| `GET/POST /api/test-case-generator/generations` | History list / save |
| `GET/PATCH/DELETE /api/test-case-generator/generations/[id]` | Open / update / delete (passcode) |

Checklist mode, prompt building, import parsing and all exports run in the browser.

## Behaviour

- Core logic in `src/lib/tcgen/` (prompt builder, JSON extractor, Markdown-table fallback parser, checklist templates, field detection, OpenAPI → cases, exporters), all unit-tested.
- Unsaved changes warning before leaving the page.
- Large outputs (100+ cases) stay responsive (virtualised table or pagination).
- Escape all user and AI content when rendering.

## Tests

- Unit: JSON extraction from fenced/unfenced text, schema validation, Markdown fallback, field detection, OpenAPI parsing (fixture spec with made-up endpoints), each exporter (xlsx structure, CSV escaping, Gherkin, Postman JSON).
- E2E: paste a sample generic user story, run checklist mode, edit a case, export CSV; paste a sample Claude JSON answer into Import and see the table; save to TC Library and see the entry there.
