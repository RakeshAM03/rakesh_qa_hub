/** Cross-cutting generator (UI, reliability, security, compatibility, performance, …) and fallback templates. */

import { describeBytes } from "../requirement";
import { TYPE_BY_ID } from "../types";
import { cap, rejected, verifySteps, type Ctx, type Draft } from "./common";
import { submitButton } from "./values-limits";

/** Heaviest valid input, for the performance case. */
function heaviest(ctx: Ctx): string {
  const size = ctx.req.limits.find((l) => l.kind === "size")?.max;
  if (size) return `a ${describeBytes(size)} file (the maximum size)`;
  const page = ctx.req.limits.find((l) => l.kind === "perPage")?.max;
  if (page) return `a search returning 1,000+ matches (${page} per page)`;
  return "the largest valid input (all fields at their maximum length)";
}

export function crossCases(ctx: Ctx): Draft[] {
  const { req } = ctx;
  const submit = submitButton(ctx);
  const E = req.entity;
  const valid = "valid test data for every field";
  if (req.features.api && !req.features.form && !req.features.files && !req.features.search) return apiCrossCases(ctx);

  const out: Draft[] = [
    {
      title: `Verify labels, helper text and required markers on the ${req.moduleName} screen`,
      category: "UI",
      type: "Positive",
      priority: "P3",
      automation: false,
      steps: [...ctx.open, "Read every label, placeholder and helper text.", "Check which fields are marked as required (*).", "Hover over any info icons.", "Compare the texts with the requirement and the UI copy deck."],
      data: ["Reference: requirement text and UI copy deck"],
      expected: ["Every field has a clear label; required fields are marked.", `Helper text states the rules (${req.rules.slice(0, 2).join("; ") || "formats and limits"}).`, "Texts have no spelling mistakes and match the copy deck.", "The layout is aligned with no overlapping or cut-off text."],
      tags: ["usability"],
    },
    {
      title: `Verify a loading indicator shows and ${submit} can't be clicked twice`,
      category: "UI",
      type: "Positive",
      priority: "P2",
      automation: true,
      steps: [...ctx.open, `Enter ${valid}.`, "Throttle the network to 'Slow 3G' in the developer tools.", `Double-click ${submit}.`, ...verifySteps(ctx)],
      data: [`${cap(E)}: ${valid}`, "Network: Slow 3G (throttled)"],
      expected: ["A loading indicator / progress appears immediately.", `${submit} is disabled while the request is in progress.`, `Only one ${E} / request is created.`, "The indicator disappears when the request finishes."],
      tags: ["usability", "idempotency"],
    },
    {
      title: `Verify ${req.moduleName} can be completed with the keyboard only`,
      category: "Accessibility",
      type: "Positive",
      priority: "P2",
      automation: false,
      steps: [...ctx.open, "Put the mouse aside.", "Use Tab / Shift+Tab to move through every control.", "Use Enter / Space to activate buttons, check boxes and pickers.", `Complete the main action with ${valid}.`, "Press Esc on any dialog that opens."],
      data: [`${cap(E)}: ${valid}`, "Input: keyboard only"],
      expected: ["Every control is reachable in a logical order.", "A visible focus outline is always shown.", "The main action can be completed without a mouse.", "Dialogs trap focus and close with Esc."],
      tags: ["accessibility"],
    },
    {
      title: "Verify screen readers announce labels, errors and results",
      category: "Accessibility",
      type: "Positive",
      priority: "P3",
      automation: false,
      steps: [...ctx.open, "Turn on a screen reader (NVDA on Windows / VoiceOver on macOS).", "Move through the form fields.", "Submit once with an invalid value and once with valid data.", "Listen to the announcements.", "Run an axe / Lighthouse accessibility check."],
      data: ["Screen reader: NVDA 2024 / VoiceOver", "Tool: axe DevTools"],
      expected: ["Each field's label and required state are announced.", "Validation errors are announced and linked to their fields.", "Success messages are announced (live region).", "No critical axe issues; text contrast is at least 4.5:1."],
      tags: ["accessibility"],
    },
    {
      title: `Verify a network drop during ${req.moduleName} is handled without data loss`,
      category: "Reliability",
      type: "Negative",
      priority: "P2",
      automation: false,
      steps: [...ctx.open, `Enter ${valid}.`, `Click ${submit} and immediately switch the browser to 'Offline' (developer tools).`, "Observe the message.", "Switch back to 'Online' and retry.", ...verifySteps(ctx)],
      data: [`${cap(E)}: ${valid}`, "Network: Offline during the request"],
      expected: [`A clear message is shown: ${ctx.msg(["network", "connection", "offline"], "Connection lost. Please try again.")}.`, `No partial or duplicate ${E} is created.`, "The user's input is kept so they can retry.", "The retry succeeds once the network is back."],
      tags: ["reliability"],
    },
    {
      title: "Verify a server error is shown as a friendly message",
      category: "Reliability",
      type: "Negative",
      priority: "P2",
      automation: true,
      steps: [...ctx.open, `Enter ${valid}.`, "Force the backend to return HTTP 500 (mock / stub, or a test switch).", `Click ${submit}.`, ...verifySteps(ctx)],
      data: [`${cap(E)}: ${valid}`, "Backend response: 500 Internal Server Error (forced)"],
      expected: [`A friendly message is shown: ${ctx.msg(["something went wrong", "error"], "Something went wrong. Please try again.")}.`, "No stack trace or technical detail is shown.", "The input is kept and the user can retry.", "Nothing is half-saved."],
      tags: ["reliability", "negative"],
    },
    {
      title: "Verify server-side validation can't be bypassed by calling the API directly",
      category: "API / Security",
      type: "Negative",
      priority: "P1",
      automation: true,
      steps: [...ctx.open, "Open the browser developer tools (Network tab).", `Submit once with ${valid} and copy the request as cURL.`, "Change the payload to break each rule (invalid value / over the limit / disallowed type).", "Send the changed request with an API client.", "Check the response and the stored data."],
      data: ["Original request: copied from the browser", `Changed values: ${req.rules.slice(0, 3).join("; ") || "values that break each rule"} — broken on purpose`],
      expected: ["The server rejects every invalid payload with 400 / 422.", "The error names the field and the rule.", "Nothing invalid is stored.", "The behaviour matches the UI validation."],
      tags: ["security", "request-validation"],
      essential: true,
    },
    {
      title: `Verify ${req.moduleName} works in all supported browsers`,
      category: "Compatibility",
      type: "Positive",
      priority: "P3",
      automation: true,
      steps: ["Open the application in each browser from the test data.", ...ctx.open, "Run the main positive flow with valid data.", "Run one negative case (an invalid value).", "Compare the layout and messages across browsers."],
      data: ["Browsers: Chrome, Firefox, Edge, Safari (latest)", `${cap(E)}: ${valid}`, ...(ctx.input.context.platforms ? [`Platforms: ${ctx.input.context.platforms}`] : [])],
      expected: ["The flow works the same in every browser.", "Validation messages are identical.", "No layout breaks or console errors.", "Pickers / dialogs use the browser's normal behaviour."],
      tags: ["compatibility"],
    },
    {
      title: `Verify ${req.moduleName} is usable on mobile screen sizes`,
      category: "Compatibility",
      type: "Positive",
      priority: "P3",
      automation: false,
      steps: ["Open the application on a phone (or 375 × 812 in device mode).", ...ctx.open, "Complete the main flow with valid data.", "Rotate to landscape.", "Check tap targets and on-screen keyboard behaviour."],
      data: ["Devices: iPhone 15 (Safari), Pixel 8 (Chrome)", `${cap(E)}: ${valid}`],
      expected: ["The layout fits without horizontal scrolling.", "Buttons and fields are easy to tap (≥ 44 px).", "The right keyboard opens for each field (email, number, phone).", "The flow completes in both orientations."],
      tags: ["compatibility", "usability"],
    },
    {
      title: `Verify response time for ${heaviest(ctx)}`,
      category: "Performance",
      type: "Positive",
      priority: "P3",
      automation: true,
      steps: [...ctx.open, "Open the developer tools (Network tab).", `Perform the main action with ${heaviest(ctx)}.`, "Record the time from the click to the result.", "Repeat 5 times and take the average."],
      data: [`Input: ${heaviest(ctx)}`, "Network: 10 Mbps", "Assumed SLA: ≤ 5 seconds"],
      expected: ["The average time is within the assumed SLA (≤ 5 s).", "The UI stays responsive (progress shown, no freeze).", "No timeout or server error occurs.", "Server CPU / memory stay within normal limits (if monitored)."],
      tags: ["performance"],
    },
    {
      title: "Verify dates, numbers and messages follow the user's language and region",
      category: "Localisation",
      type: "Positive",
      priority: "P4",
      automation: false,
      steps: ["Set the browser / profile language to Hindi (hi-IN), then German (de-DE).", ...ctx.open, "Complete the main flow with valid data.", "Check dates, numbers, currency and messages.", "Switch to an RTL language (Arabic) and check the layout."],
      data: ["Locales: hi-IN, de-DE, ar", `${cap(E)}: ${valid}`],
      expected: ["Dates and numbers use the locale's format.", "Messages are translated (no keys or English left).", "Text fits without truncation.", "RTL layout mirrors correctly."],
      tags: ["localisation"],
    },
    {
      title: `Verify features that use ${E} data still work after this change`,
      category: "Functional",
      type: "Positive",
      priority: "P3",
      automation: true,
      steps: [`List the screens / reports that show ${E} data.`, ...ctx.open, "Create or change one record with valid data.", "Open each related screen / report.", "Run their smoke checks."],
      data: [`${cap(E)}: ${valid}`, "Related features: lists, search, exports and notifications that use this data"],
      expected: [`The new / changed ${E} shows correctly everywhere.`, "Related features behave as before.", "Exports include the new data with the right formats.", "No new errors appear in the logs."],
      tags: ["regression"],
    },
  ];
  if (!req.features.auth) {
    out.push({
      title: `Verify an expired session during ${req.moduleName} asks the user to sign in again`,
      category: "Security",
      type: "Negative",
      priority: "P2",
      automation: false,
      steps: [...ctx.open, `Enter ${valid}.`, "Expire the session (wait for the timeout or delete the session cookie).", `Click ${submit}.`, ...verifySteps(ctx)],
      data: [`${cap(E)}: ${valid}`, "Session: expired before submit"],
      expected: rejected(ctx, ctx.msg(["session", "expired"], "Your session has expired. Please sign in again."), ["The user is redirected to sign in and can retry afterwards without losing the input."], false),
      tags: ["security"],
    });
  }
  return out;
}

function apiCrossCases(ctx: Ctx): Draft[] {
  const { req } = ctx;
  const ep = req.endpoints[0] ?? { method: "POST", path: "/api/resource" };
  const name = `${ep.method} ${ep.path}`;
  const token = req.tokenRole ? `${req.tokenRole} token` : "valid access token";
  const steps = (extra: string, check = "Check the status code and the response body.") => [`In the API client, create a ${ep.method} request to {{baseUrl}}${ep.path}.`, `Set the header 'Authorization: Bearer <${token}>'.`, extra, "Send the request.", check];
  const body = `{"name":"Asha Rao","email":"qa.user01@example.com"}`;
  return [
    {
      title: `Verify ${name} responds within the assumed SLA`,
      category: "Performance",
      type: "Positive",
      priority: "P3",
      automation: true,
      base: "api",
      steps: steps("Use a valid body from the test data.", "Repeat 50 times (or with a load tool at 10 requests/second) and record the response times."),
      data: [`Endpoint: ${name}`, `Body: ${body}`, "Assumed SLA: p95 ≤ 500 ms"],
      expected: ["p95 response time is within 500 ms.", "No errors under the test load.", "Responses are consistent.", "No memory / connection leaks in the logs."],
      tags: ["performance"],
    },
    {
      title: `Verify ${name} is rate-limited and returns 429 when the limit is exceeded`,
      category: "API / Security",
      type: "Negative",
      priority: "P2",
      automation: true,
      base: "api",
      steps: steps("Use a valid body.", "Send 100 requests within one minute and watch for 429 responses."),
      data: [`Endpoint: ${name}`, "Requests: 100 in 60 seconds"],
      expected: ["Requests beyond the limit return 429 Too Many Requests.", "A 'Retry-After' header is present.", "Requests succeed again after the window.", "Rate-limited requests create nothing."],
      tags: ["rate-limit", "security"],
    },
    {
      title: `Verify ${name} with a wrong Content-Type returns 415`,
      category: "API",
      type: "Negative",
      priority: "P3",
      automation: true,
      base: "api",
      steps: steps("Set 'Content-Type: text/plain' and send the JSON body as plain text."),
      data: [`Endpoint: ${name}`, "Content-Type: text/plain", `Body: ${body}`],
      expected: ["Status code: 415 Unsupported Media Type (or 400).", "Nothing is created.", "The error explains the expected content type.", "No stack trace is exposed."],
      tags: ["headers", "negative"],
    },
    {
      title: `Verify ${name} only allows cross-origin calls from approved origins (CORS)`,
      category: "API / Security",
      type: "Negative",
      priority: "P3",
      automation: true,
      base: "api",
      steps: steps("Add the header 'Origin: https://evil.example.com'.", "Check the 'Access-Control-Allow-Origin' response header; repeat the preflight (OPTIONS)."),
      data: [`Endpoint: ${name}`, "Origin: https://evil.example.com"],
      expected: ["The unapproved origin is not echoed in 'Access-Control-Allow-Origin'.", "The preflight from the unapproved origin is refused.", "Approved origins still work.", "Credentials are never allowed with a wildcard origin."],
      tags: ["headers", "security"],
    },
    {
      title: `Verify script and SQL injection in ${name} fields is neutralised`,
      category: "API / Security",
      type: "Negative",
      priority: "P1",
      automation: true,
      base: "api",
      steps: steps("Put the payloads from the test data into the text fields of the body."),
      data: [`Endpoint: ${name}`, `Body: {"name":"<script>alert(1)</script>","email":"x' OR '1'='1@example.com"}`],
      expected: ["The request is rejected (400) or the values are stored safely as text.", "No database error or stack trace is returned.", "Reading the record back returns the escaped text.", "Nothing else in the database is affected."],
      tags: ["security", "request-validation"],
      essential: true,
    },
    {
      title: `Verify ${name} rejects over-long values and oversized payloads`,
      category: "API",
      type: "Negative",
      priority: "P2",
      automation: true,
      base: "api",
      steps: steps("Use a 256-character name and, separately, a 2 MB body."),
      data: [`Endpoint: ${name}`, "1. name: 'A' × 256", "2. Body size: 2 MB"],
      expected: ["Status code: 400 for the long value and 413 (or 400) for the large body.", "The error names the field / size limit.", "Nothing is stored.", "The server stays responsive."],
      tags: ["request-validation", "boundary"],
    },
    {
      title: `Verify unknown extra fields in ${name} are ignored and can't escalate privileges`,
      category: "API / Security",
      type: "Negative",
      priority: "P2",
      automation: true,
      base: "api",
      steps: steps(`Add extra fields to the body: "role":"admin" and "isVerified":true.`),
      data: [`Endpoint: ${name}`, `Body: {"name":"Asha Rao","email":"qa.user02@example.com","role":"admin","isVerified":true}`],
      expected: ["The request succeeds or returns 400 — as the contract says.", "The extra fields are NOT applied (the new user is not an admin / verified).", "The response doesn't echo the unknown fields as saved.", "The behaviour is documented."],
      tags: ["contract", "security"],
    },
    {
      title: `Verify every ${name} error uses the same documented error format`,
      category: "API",
      type: "Negative",
      priority: "P3",
      automation: true,
      base: "api",
      steps: steps("Trigger 400, 401, 403 and 409 in turn (see the other test cases).", "Compare the error bodies."),
      data: [`Endpoint: ${name}`, "Errors: 400, 401, 403, 409"],
      expected: ["Every error body has the same shape (e.g. code, message, details).", "Messages are human-readable and don't expose internals.", "HTTP status and body code agree.", "Content-Type is application/json for every error."],
      tags: ["error-contract"],
    },
    {
      title: `Verify the ${name} success response matches the published schema`,
      category: "API",
      type: "Positive",
      priority: "P2",
      automation: true,
      base: "api",
      steps: steps("Use a valid body.", "Validate the response body against the JSON schema / OpenAPI definition."),
      data: [`Endpoint: ${name}`, `Body: ${body}`],
      expected: ["All documented fields are present with the right types.", "Dates use ISO 8601.", "No undocumented or sensitive fields (password hash, internal IDs) are returned.", "The 'Location' header (if used) points to the new resource."],
      tags: ["response-schema"],
    },
    {
      title: `Verify existing clients of ${name} keep working (backward compatibility)`,
      category: "API",
      type: "Positive",
      priority: "P3",
      automation: true,
      base: "api",
      steps: ["Take the previous version's contract tests / Postman collection.", `Run them against the new build of ${name}.`, "Compare responses with the previous version.", "Check removed or renamed fields.", "Check changed status codes."],
      data: ["Previous contract: last released collection / OpenAPI file"],
      expected: ["All previous contract tests pass.", "No field is removed or renamed without a version change.", "Status codes are unchanged for existing scenarios.", "New fields are optional for old clients."],
      tags: ["contract", "regression"],
    },
    {
      title: `Verify ${name} hides internal errors behind a generic 500 response`,
      category: "Reliability",
      type: "Negative",
      priority: "P3",
      automation: false,
      base: "api",
      steps: steps("Force an internal failure (e.g. stop the database in a test environment)."),
      data: [`Endpoint: ${name}`, "Failure: database unavailable (test environment)"],
      expected: ["Status code: 500 (or 503).", "The body has a generic message and a correlation ID.", "No stack trace, SQL or hostnames are exposed.", "The error is logged with details on the server."],
      tags: ["reliability"],
    },
  ];
}

/** Detailed fallback for a selected test type that no generator covered (badged "Template"). */
export function templateCase(ctx: Ctx, typeId: string): Draft | null {
  const t = TYPE_BY_ID.get(typeId);
  if (!t) return null;
  const { req } = ctx;
  const api = req.features.api && !req.features.form && !req.features.files;
  return {
    title: `Verify ${t.label.toLowerCase()} for ${req.moduleName}`,
    category: t.group === "API" ? "API" : t.group === "Non-Functional" ? "UI" : "Functional",
    type: "Positive",
    priority: "P3",
    automation: false,
    base: api ? "api" : "app",
    steps: api
      ? ["In the API client, prepare a request for the endpoint under test.", `Design the inputs for ${t.label.toLowerCase()} (see the test data).`, "Send each request.", "Check the status codes and response bodies.", "Check the stored data."]
      : [...ctx.open, `Prepare the scenario for ${t.label.toLowerCase()} (see the test data).`, "Perform the main action.", "Observe the result.", ...verifySteps(ctx)],
    data: [`Scenario: ${t.label} for ${req.moduleName}`, `Rules in scope: ${req.rules.slice(0, 3).join("; ") || "see the requirement"}`],
    expected: [`The ${req.moduleName} behaves as the requirement states for ${t.label.toLowerCase()}.`, "No errors or unexpected data changes occur.", "The result is the same after a refresh.", "Any failure is clearly reported to the user."],
    tags: [typeId],
    template: true,
  };
}
