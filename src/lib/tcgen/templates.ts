/**
 * Checklist-mode templates: generic test ideas per test type. `{m}` is replaced by the module
 * name ("the feature" when empty), `{r}` by the first user role ("a standard user").
 */

import type { Priority } from "./types";

export type Template = {
  title: string;
  steps: string[];
  expected: string;
  priority: Priority;
  /** Shown in the Type column. */
  type: string;
  automation?: boolean;
};

const t = (type: string, priority: Priority, title: string, steps: string[], expected: string, automation = false): Template => ({ type, priority, title, steps, expected, automation });

export const TEMPLATES: Record<string, Template[]> = {
  positive: [
    t("Positive", "P0", "{m}: main flow succeeds with valid input", ["Open {m} as {r}", "Fill every required field with valid data", "Submit"], "The action succeeds, a confirmation is shown and the data is saved.", true),
    t("Positive", "P1", "{m}: optional fields are saved when provided", ["Open {m}", "Fill required and optional fields", "Submit and reopen the record"], "All entered values are shown exactly as entered.", true),
    t("Positive", "P1", "{m}: result is visible to other places that use it", ["Complete the main flow", "Open the screens / reports that show this data"], "The new or changed data appears everywhere it should.", false),
    t("Positive", "P2", "{m}: works with only the minimum required data", ["Open {m}", "Fill only required fields", "Submit"], "The action succeeds with defaults applied to optional fields.", true),
  ],
  negative: [
    t("Negative", "P1", "{m}: required fields left empty are rejected", ["Open {m}", "Leave each required field empty in turn", "Submit"], "A clear message names each missing field; nothing is saved.", true),
    t("Negative", "P1", "{m}: invalid formats are rejected", ["Enter invalid values (wrong format, letters in numbers)", "Submit"], "Inline validation explains the problem; nothing is saved.", true),
    t("Negative", "P2", "{m}: server error is handled gracefully", ["Make the backend return an error (e.g. stub a 500)", "Submit"], "A friendly error is shown, input is kept, and the user can retry.", false),
    t("Negative", "P2", "{m}: double submit doesn't create duplicates", ["Fill the form", "Click Submit twice quickly"], "Only one record is created.", true),
  ],
  boundary: [
    t("Boundary", "P1", "{m}: numeric fields at min, max and one outside", ["For each numeric field, enter min, max, min − 1 and max + 1"], "Min and max are accepted; values outside are rejected.", true),
    t("Boundary", "P1", "{m}: text fields at max length and max + 1", ["Enter text exactly at the max length", "Enter one character more"], "Max length is accepted; longer input is blocked or rejected.", true),
    t("Boundary", "P2", "{m}: lists and pages at 0, 1 and the page size", ["View {m} with 0 items, 1 item, exactly one page and one page + 1"], "Empty state, single item and pagination all render correctly.", false),
  ],
  equivalence: [
    t("Equivalence partitioning", "P2", "{m}: one value from each valid class", ["Identify the valid input classes (e.g. user types, ranges)", "Test one representative value per class"], "Each class behaves as specified.", true),
    t("Equivalence partitioning", "P2", "{m}: one value from each invalid class", ["Identify the invalid input classes", "Test one representative value per class"], "Each invalid class is rejected with the right message.", true),
  ],
  edge: [
    t("Edge case", "P2", "{m}: Unicode, emoji and RTL text", ["Enter accented, emoji and Arabic/Hebrew text in text fields", "Save and view"], "Text is stored and shown correctly without corruption.", false),
    t("Edge case", "P2", "{m}: leading/trailing spaces", ["Enter values with leading and trailing spaces", "Save"], "Spaces are trimmed (or kept) consistently.", true),
    t("Edge case", "P3", "{m}: very large data volume", ["Create many records (e.g. 1,000+)", "Open {m}"], "The page stays responsive; lists paginate or virtualise.", false),
    t("Edge case", "P3", "{m}: concurrent edits by two users", ["Open the same record in two sessions", "Save different changes in both"], "The conflict is detected or the last save wins as specified, without data loss.", false),
  ],
  validation: [
    t("Field validation", "P1", "{m}: inline validation messages are clear and placed next to the field", ["Trigger each validation rule"], "Each message names the field and how to fix it; focus moves to the first error.", false),
    t("Field validation", "P2", "{m}: validation runs on both client and server", ["Bypass the UI (e.g. call the API directly) with invalid data"], "The server rejects invalid data with the same rules.", true),
    t("Field validation", "P2", "{m}: input masks and formats", ["Type into formatted fields (phone, date, amount)"], "Masks guide input and don't block valid values.", false),
  ],
  roles: [
    t("Role / permission", "P0", "{m}: allowed role can perform the action", ["Log in as {r}", "Perform the main action"], "The action succeeds.", true),
    t("Role / permission", "P0", "{m}: disallowed role can't perform the action (UI and API)", ["Log in as a role without access", "Try the action in the UI and directly via the API / URL"], "The control is hidden or disabled and the API returns 403.", true),
    t("Role / permission", "P1", "{m}: data of other users / tenants is not visible", ["Log in as user A", "Try to open user B's records by ID"], "Access is denied; no data leaks.", true),
  ],
  workflow: [
    t("Workflow / end-to-end", "P0", "{m}: complete end-to-end journey", ["Start from the entry point (e.g. login / home)", "Go through every step of the journey", "Verify the final outcome and any notifications"], "The journey completes and every side effect (emails, records, status) is correct.", true),
    t("Workflow / end-to-end", "P1", "{m}: leaving mid-way and coming back", ["Start the flow", "Leave or refresh in the middle", "Return"], "Progress is kept or the user is guided to restart without broken state.", false),
    t("Workflow / end-to-end", "P2", "{m}: back / forward navigation during the flow", ["Use browser back and forward between steps"], "No duplicate submissions or stale data.", false),
  ],
  regression: [
    t("Regression", "P1", "{m}: related features still work", ["List features sharing data or code with {m}", "Run their smoke checks"], "Related features behave as before.", true),
    t("Regression", "P2", "{m}: existing data still displays correctly", ["Open records created before this change"], "Old records display and edit correctly.", false),
  ],
  performance: [
    t("Performance", "P1", "{m}: response time under normal load", ["Measure the main action's response time (p95) with typical data"], "p95 is within the agreed target (e.g. < 2 s page, < 500 ms API).", true),
    t("Performance", "P2", "{m}: behaviour under peak / stress load", ["Run a load test at expected peak and 2× peak"], "No errors at peak; graceful degradation beyond it.", false),
    t("Performance", "P3", "{m}: page weight and Core Web Vitals", ["Audit with Lighthouse / WebPageTest"], "LCP, INP and CLS meet the targets.", false),
  ],
  security: [
    t("Security", "P0", "{m}: authentication is required", ["Open {m} / call its API while logged out"], "The user is redirected to log in / the API returns 401.", true),
    t("Security", "P0", "{m}: injection and XSS input is neutralised", ["Enter ' OR '1'='1 and <script>alert(1)</script> in every input", "Save and view"], "No query error and no script execution; text is shown literally.", true),
    t("Security", "P1", "{m}: CSRF protection on state-changing requests", ["Replay a state-changing request from another origin without the token"], "The request is rejected.", false),
    t("Security", "P1", "{m}: sensitive data isn't exposed", ["Check responses, URLs, logs and local storage for secrets / PII"], "Sensitive values are masked or absent.", false),
    t("Security", "P2", "{m}: session expiry and logout", ["Stay idle past the timeout; log out and press Back"], "The session ends; protected pages need a new login.", true),
  ],
  usability: [
    t("Usability / UX", "P2", "{m}: labels, hints and empty states are clear", ["Review every screen of {m} with a first-time user mindset"], "Users understand what to do without help.", false),
    t("Usability / UX", "P3", "{m}: feedback for loading, success and errors", ["Trigger slow, successful and failing actions"], "Each state is visible and understandable.", false),
  ],
  accessibility: [
    t("Accessibility", "P1", "{m}: fully usable with the keyboard", ["Navigate every control with Tab / Shift+Tab / Enter / Space / Esc"], "Everything is reachable, operable, in a logical order, with a visible focus.", false),
    t("Accessibility", "P1", "{m}: screen reader announces names, roles and errors", ["Use NVDA / VoiceOver on {m}"], "Controls have accessible names; errors and status changes are announced.", false),
    t("Accessibility", "P2", "{m}: colour contrast meets WCAG 2.2 AA", ["Check text and UI contrast in light and dark themes (axe / contrast checker)"], "Text ≥ 4.5:1 (large 3:1); UI components ≥ 3:1.", true),
    t("Accessibility", "P2", "{m}: zoom to 200% / reflow at 320 px", ["Zoom to 200% and test at a 320 px wide viewport"], "No content is lost and there's no horizontal scrolling.", false),
  ],
  compatibility: [
    t("Compatibility", "P2", "{m}: latest Chrome, Firefox, Safari and Edge", ["Run the main flow in each browser"], "Same behaviour and layout in every browser.", true),
    t("Compatibility", "P2", "{m}: mobile and tablet screen sizes", ["Run the main flow on phone and tablet sizes / devices"], "The layout adapts; touch targets are usable.", false),
  ],
  reliability: [
    t("Reliability / recovery", "P1", "{m}: network loss during submit", ["Go offline (DevTools) while submitting", "Reconnect"], "A clear message is shown; retry works without duplicates.", false),
    t("Reliability / recovery", "P2", "{m}: slow dependency / timeout", ["Delay a backend dependency beyond its timeout"], "The UI times out gracefully and offers a retry.", false),
  ],
  localisation: [
    t("Localisation", "P2", "{m}: dates, numbers and currency follow the locale", ["Switch locale (e.g. en-IN, en-US, de-DE)", "View dates, numbers and amounts"], "Formats follow the locale.", false),
    t("Localisation", "P3", "{m}: translated text fits and RTL layout works", ["Switch to a long-text language and an RTL language"], "No truncation or overlap; RTL mirrors correctly.", false),
  ],
  // API types without a spec fall back to generic endpoint checks.
  "status-codes": [
    t("Status codes", "P0", "{m} API: success returns the documented 2xx", ["Send a valid request"], "The documented 2xx status and body are returned.", true),
    t("Status codes", "P1", "{m} API: bad input returns 400/422", ["Send an invalid body"], "400/422 with a helpful error.", true),
    t("Status codes", "P1", "{m} API: unknown resource returns 404", ["Request an ID that doesn't exist"], "404 is returned.", true),
  ],
  "request-validation": [
    t("Request validation", "P1", "{m} API: each required field missing is rejected", ["Send the request without each required field in turn"], "400/422 naming the missing field.", true),
    t("Request validation", "P1", "{m} API: wrong types, formats, lengths and enum values are rejected", ["Send wrong types, bad formats, over-long strings and unknown enum values"], "400/422 for each, with a field-level error.", true),
  ],
  "response-schema": [
    t("Response schema", "P1", "{m} API: response matches the schema", ["Validate the response against the OpenAPI / JSON schema"], "Every field is present with the right type; no extra sensitive fields.", true),
  ],
  "api-auth": [
    t("Authentication / authorisation", "P0", "{m} API: missing, invalid and expired tokens are rejected", ["Call without a token, with a malformed token and with an expired token"], "401 for each.", true),
    t("Authentication / authorisation", "P0", "{m} API: wrong role is forbidden", ["Call with a valid token for a role without access"], "403 is returned.", true),
  ],
  headers: [
    t("Headers", "P2", "{m} API: content type, CORS and caching headers", ["Check Content-Type, CORS (allowed / disallowed origin) and Cache-Control"], "Headers match the contract; disallowed origins are refused.", true),
  ],
  pagination: [
    t("Pagination, filtering, sorting", "P2", "{m} API: page / limit, filters and sort work", ["Request pages at the edges, filter values and both sort orders"], "Correct items, totals and ordering; invalid params return 400.", true),
  ],
  idempotency: [
    t("Idempotency and concurrency", "P1", "{m} API: retrying a request doesn't duplicate", ["Send the same create/payment request twice (with an idempotency key if supported)"], "One resource is created; the retry returns the same result.", true),
    t("Idempotency and concurrency", "P2", "{m} API: concurrent updates", ["Send two updates to the same resource at the same time"], "No lost update (409 / ETag conflict or consistent last-write).", false),
  ],
  "rate-limit": [
    t("Rate limiting", "P2", "{m} API: limit returns 429 with Retry-After", ["Exceed the documented rate limit"], "429 with Retry-After; normal service after the window.", true),
  ],
  "error-contract": [
    t("Error contract", "P2", "{m} API: errors use the documented format", ["Trigger 400, 401, 403, 404 and 500 responses"], "Every error has the documented shape (code, message, details) and no stack traces.", true),
  ],
  contract: [
    t("Contract / backward compatibility", "P1", "{m} API: existing clients keep working", ["Run the previous version's contract tests against the new build"], "No removed fields, renamed fields or changed types.", true),
  ],
};

export function fill(text: string, moduleName: string, role: string) {
  return text.replaceAll("{m}", moduleName.trim() || "the feature").replaceAll("{r}", role || "a standard user");
}
