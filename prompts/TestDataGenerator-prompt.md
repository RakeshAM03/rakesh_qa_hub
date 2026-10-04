# Prompt: Test Data Generator Page for Rakesh QA Hub

Build a page called **Test Data Generator** for the **Rakesh QA Hub**. QA designs a data schema (fields and their types), picks how many rows, and gets realistic **fake** test data in any common format: CSV, JSON, Excel, SQL INSERT, XML, YAML, or TSV. It also generates **edge-case / negative** values for validation testing, and has presets for common entities (user, address, payment, order, employee, product).

Everything runs **in the browser** — no AI and no database needed (presets and saved schemas are the only things stored).

## Tech stack

Same as the rest of the hub, plus:
- `@faker-js/faker` for realistic values (supports many locales, including `en_IN`).
- `exceljs` (or SheetJS) for `.xlsx`.
- `js-yaml` for YAML.
- Generation runs in a **Web Worker** so large row counts don't freeze the page.

- **Route:** `/test-data-generator`
- **Sidebar:** group **Automation Tools**, icon `Database`
- **Accent colour:** teal

## Layout

- Breadcrumb `< Home`, `Database` icon + title "Test Data Generator".
- Subtitle: "Generate realistic fake data and edge cases for testing — in CSV, JSON, Excel, SQL and more."
- Three areas:
  - **Left:** schema builder.
  - **Right top:** options + **Generate**.
  - **Right bottom:** preview table + export buttons.
- On small screens, stack vertically.

## 1. Presets

A row of preset chips at the top; clicking one loads its fields into the schema builder (replacing or appending, user's choice):

| Preset | Fields |
|---|---|
| User | id, firstName, lastName, fullName, email, username, password, phone, dateOfBirth, gender, createdAt |
| Address | street, city, state, postalCode, country, latitude, longitude |
| Payment | cardHolder, cardNumber (test numbers only), cardType, expiry, cvv, upiId, amount, currency, transactionId, status |
| Order | orderId, customerEmail, product, quantity, unitPrice, total, orderDate, status |
| Employee | employeeId, fullName, email, department, jobTitle, salary, joiningDate, manager |
| Product | sku, name, category, price, stock, rating, description, imageUrl |
| Login credentials | username, email, password (valid), password (invalid variants) |
| API request body | a JSON-object field with nested fields, to build request payloads |
| India (KYC-style) | fullName, mobile (+91), PAN-format, GSTIN-format, IFSC-format, pincode, state, city, Aadhaar-format (masked) |

Users can also **save their own presets** (stored in the database, see Data model).

## 2. Schema builder

A list of field rows; **+ Add field**; drag to reorder; duplicate; delete.

Each row:

| Control | Details |
|---|---|
| Field name | text, required, unique within schema |
| Type | searchable dropdown, grouped (see below) |
| Options | type-specific (gear icon opens a small popover) |
| Blank % | 0–100: share of rows where this field is empty/null |
| Unique | checkbox (guarantee no duplicates within the dataset; error if impossible for the row count) |

### Field types (grouped)

**Person:** first name, last name, full name, gender, job title, username, email (options: domain, use `@example.com` by default), phone (format per locale), date of birth (age range), avatar URL.

**Location:** street, city, state, postal code / pincode, country, country code, latitude, longitude, full address, time zone.

**Internet:** URL, domain, IPv4, IPv6, MAC address, user agent, password (options: length, symbols, numbers, uppercase), UUID, slug, hex colour, emoji.

**Numbers & dates:** integer (min, max), decimal (min, max, decimals), boolean (true %), date (from, to, format), time, datetime (ISO / custom format), timestamp (epoch), sequence/auto-increment (start, step), past date, future date.

**Finance:** amount (min, max, currency), currency code, credit card number (**test card numbers only** — well-known sandbox numbers like `4111 1111 1111 1111` plus Luhn-valid numbers from reserved test ranges; label clearly as test data), card expiry (future), CVV, IBAN (format only), UPI ID (`name@bank` style, fake), transaction id.

**India-specific formats (fake, format-valid only):** mobile (+91, starts 6–9), PAN (`AAAAA9999A` pattern), GSTIN (state code + PAN pattern), IFSC (`AAAA0XXXXXX`), pincode (6 digits), vehicle number, Aadhaar-format (12 digits, shown masked `XXXX XXXX 1234` by default). Show a note: "Generated IDs follow the format only and are not real; never use them outside testing."

**Commerce & business:** product name, category, SKU, price, company name, department, job title, order status, rating (1–5).

**Text:** word, words (count), sentence, paragraph, lorem ipsum, custom text, regex pattern (generate strings matching a simple regex, e.g. `[A-Z]{3}-\d{4}`).

**Custom:**
- Pick from list (comma-separated values, optional weights like `active:70, inactive:20, banned:10`).
- Constant value.
- Template / formula using other fields, e.g. `{{firstName}}.{{lastName}}@example.com` or `{{quantity}} * {{unitPrice}}` for computed totals.
- Nested object (child fields; for JSON/YAML/XML output) and array of (child type, min/max items).
- Foreign key: pick values from another field or a pasted list.

### Edge cases / negative data

Each field row has an **Edge cases** toggle. When on, a configurable % of rows (default 20%) get a value from that type's edge-case library instead of a normal one:

| Type | Edge values |
|---|---|
| Any text | empty string, single space, leading/trailing spaces, very long (255 / 256 / 1000 / 5000 chars), Unicode (é, ñ, ü), emoji, RTL text (Arabic/Hebrew), Chinese/Japanese characters, zero-width characters, newline and tab characters |
| Security strings | SQL injection (`' OR '1'='1`), XSS (`<script>alert(1)</script>`), HTML tags, path traversal (`../../etc/passwd`), command injection (`; ls`), format strings (`%s%n`), null byte |
| Email | missing @, double @, no domain, spaces, very long local part, uppercase, plus-addressing, IDN domain, trailing dot |
| Phone | too short, too long, letters, missing country code, with spaces/dashes, `+` only |
| Numbers | 0, -1, min/max of the range, min-1 / max+1, very large (2^31, 2^53), decimals where integers expected, `NaN`-like strings, scientific notation, leading zeros |
| Dates | 29 Feb (leap and non-leap), 31 Apr (invalid), year 1900 / 9999, far future, past, wrong format, timezone edge (DST change) |
| Password | too short, no number, no symbol, only spaces, common passwords, max length + 1 |
| Boolean | `"true"` as string, `1`/`0`, null |

Option at the top: **Data mode** — Valid only / Mixed (valid + edge cases per field settings) / Edge cases only. In Mixed mode, add an `_isEdgeCase` column (toggleable) and an `_edgeCaseType` column so testers know which rows are negative.

## 3. Options (right top)

| Option | Values | Default |
|---|---|---|
| Rows | 1 – 100,000 | 100 |
| Locale | English (India), English (US), English (UK), German, French, Spanish, Japanese, Arabic, … (Faker locales) | English (India) |
| Seed | number (optional) — same seed = same data, for reproducible tests | empty (random) |
| Data mode | Valid only / Mixed / Edge cases only | Valid only |
| Output format | CSV / TSV / JSON (array) / JSON Lines / Excel / SQL INSERT / XML / YAML | CSV |

Format-specific options:
- **CSV/TSV:** delimiter, quote all, header row on/off, line ending, include BOM for Excel.
- **JSON:** pretty / minified, wrap in a root key.
- **SQL:** table name, dialect (PostgreSQL / MySQL / SQL Server / SQLite / Oracle), batch size per INSERT, include `CREATE TABLE` (column types inferred from field types).
- **XML:** root and row element names.
- **Excel:** sheet name, freeze header, auto-fit columns.

**Generate** button (teal). Show progress for large row counts; allow **Cancel**.

## 4. Preview & export

- Preview table: first 100 rows, column headers with type badges, edge-case rows highlighted with a subtle tint and a tooltip showing the edge-case type.
- Tabs: **Table** / **Raw** (first 200 lines of the chosen format).
- Stats line: "10,000 rows · 12 fields · 2.1 MB · 1,980 edge-case values · generated in 0.8 s".
- Actions:
  - **Download** in the chosen format (file name `<schema-name>-<rows>-rows.<ext>`).
  - **Copy to clipboard** (disabled above ~5 MB with a hint to download instead).
  - **Regenerate** (new random data, same schema).
  - **Download all formats** as a `.zip` (optional, using `fflate`, which the hub already uses).

## 5. Saved schemas

- **Save schema** (name required): stores the field list and options, not the generated data.
- **My schemas** dropdown: load, duplicate, rename, delete (passcode for delete).
- **Export / import schema as JSON** so schemas can be shared or kept in a repo.
- **"Use in automation"** helper: shows a short code snippet for loading the generated file in **Java (TestNG DataProvider reading CSV)** and **Playwright TypeScript (reading JSON)**.

## Data model

```ts
DataSchema { id, name @unique, fields Json, options Json, isPreset Boolean @default(false),
             createdBy String?, createdAt, updatedAt }
```

Built-in presets live in code (`src/lib/testdata/presets.ts`), not the database. User-saved presets/schemas are `DataSchema` rows.

## API routes

| Route | Purpose |
|---|---|
| `GET/POST /api/test-data-generator/schemas` | List / save schemas |
| `GET/PATCH/DELETE /api/test-data-generator/schemas/[id]` | Load / update / delete (passcode) |

All generation and exporting happen in the browser (Web Worker).

## Behaviour

- Core logic in `src/lib/testdata/` (field generators, edge-case library, template/formula evaluator, uniqueness, exporters per format, SQL type inference), all pure and unit-tested.
- The formula evaluator must be safe: support only field references, numbers and `+ - * / ( )` and string concatenation — never `eval`.
- Validate the schema before generating (duplicate names, unique impossible, min > max, circular template references) with clear inline errors.
- Seeded generation must be fully reproducible (same seed + schema + options = identical output).
- Never show the India-format IDs or card numbers as "valid real" — always labelled as test/fake.

## Tests

- Unit: each field type respects its options, edge-case insertion %, uniqueness, seeded reproducibility, formula evaluator (including rejection of anything unsafe), each exporter (CSV escaping, SQL quoting per dialect, XML escaping, Excel structure, JSON Lines), schema validation errors.
- E2E: load the User preset, set 50 rows and Mixed mode, generate, see edge-case rows highlighted, download CSV and SQL, save the schema and reload it.
