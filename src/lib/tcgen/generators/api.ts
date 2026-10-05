/** API generator: endpoints from the requirement text or a pasted OpenAPI / Swagger / cURL definition. */

import { endpointsFromApiText, SpecError, type Endpoint, type ParamInfo } from "../openapi";
import type { Requirement } from "../requirement";
import { cap, type Ctx, type Draft } from "./common";

const SAMPLE: Record<string, unknown> = { email: "qa.user01@example.com", name: "Asha Rao", phone: "9876543210", password: "Valid@1234", role: "member", amount: 500 };

/** Endpoints described in the requirement text, shaped like OpenAPI endpoints. */
function textEndpoints(req: Requirement): Endpoint[] {
  return req.endpoints.map((e) => {
    const bodyFields: ParamInfo[] = req.fields.map((f) => ({ name: f.name.toLowerCase().replace(/\s+/g, "_"), in: "body", required: f.required || f.unique, type: f.type === "number" || f.type === "amount" ? "number" : "string" }));
    if (!bodyFields.some((f) => f.name === "name") && /user|customer|member|employee/i.test(e.path)) bodyFields.unshift({ name: "name", in: "body", required: true, type: "string" });
    const sampleBody = e.method === "GET" || e.method === "DELETE" ? null : Object.fromEntries(bodyFields.map((f) => [f.name, SAMPLE[f.name] ?? (f.type === "number" ? 1 : "sample")]));
    return {
      method: e.method,
      path: e.path,
      summary: "",
      bodyFields,
      params: [],
      sampleBody,
      responses: req.statusCodes.map((c) => ({ code: String(c), description: "", hasSchema: c < 300 })),
      secured: Boolean(req.tokenRole) || req.statusCodes.includes(401),
      server: "",
    };
  });
}

export function apiEndpoints(ctx: Ctx): { endpoints: Endpoint[]; warnings: string[] } {
  const warnings: string[] = [];
  let endpoints: Endpoint[] = [];
  if (ctx.input.apiSpec.trim()) {
    try {
      endpoints = endpointsFromApiText(ctx.input.apiSpec).endpoints;
    } catch (e) {
      warnings.push(e instanceof SpecError ? e.message : "Couldn't read the API definition.");
    }
  }
  const f = ctx.input.apiForm;
  if (f.endpoint.trim()) {
    let sampleBody: unknown = null;
    try {
      sampleBody = f.requestBody.trim() ? JSON.parse(f.requestBody) : null;
    } catch {
      sampleBody = f.requestBody;
    }
    const bodyFields: ParamInfo[] = sampleBody && typeof sampleBody === "object" ? Object.keys(sampleBody).map((name) => ({ name, in: "body", required: true, type: "string" })) : [];
    endpoints.push({ method: f.method.toUpperCase(), path: f.endpoint.trim(), summary: f.notes, bodyFields, params: [], sampleBody, responses: [], secured: f.auth !== "none", server: "" });
  }
  const known = new Set(endpoints.map((e) => `${e.method} ${e.path}`));
  for (const e of textEndpoints(ctx.req)) if (!known.has(`${e.method} ${e.path}`)) endpoints.push(e);
  return { endpoints, warnings };
}

const json = (b: unknown) => (b === null || b === undefined ? "(no body)" : JSON.stringify(b));

export function apiCases(ctx: Ctx, e: Endpoint): Draft[] {
  const { req } = ctx;
  const name = `${e.method} ${e.path}`;
  const okCode = Number(e.responses.find((r) => /^2\d\d$/.test(r.code))?.code ?? (e.method === "POST" ? 201 : e.method === "DELETE" ? 204 : 200));
  const codes = new Set(e.responses.map((r) => Number(r.code)).filter(Boolean));
  const badCode = codes.has(422) && !codes.has(400) ? 422 : 400;
  const token = req.tokenRole ? `${req.tokenRole} token` : "valid access token";
  const headers: Record<string, string> = { ...(e.secured ? { Authorization: `Bearer <${token}>` } : {}), ...(e.sampleBody !== null ? { "Content-Type": "application/json" } : {}) };
  const base = (body: unknown, auth = e.secured ? `Bearer <${token}>` : "") => [
    `In the API client, create a new ${e.method} request to {{baseUrl}}${e.path}.`,
    auth ? `Set the header 'Authorization: ${auth}'.` : "Do not set an Authorization header.",
    "Set the header 'Content-Type: application/json'.",
    body === null ? "Leave the request body empty." : "Paste the request body from the test data.",
    "Send the request.",
  ];
  const check = (what: string) => [`Check the status code and the response body.`, what];
  const api = (body: unknown, expectedStatus: number, h = headers) => ({ method: e.method, endpoint: e.path, headers: h, body, expectedStatus, assertions: [`status equals ${expectedStatus}`] });
  const out: Draft[] = [];
  const entity = req.entity && req.entity !== "record" ? req.entity : e.path.split("/").filter(Boolean).pop()?.replace(/s$/, "") ?? "resource";

  out.push({
    title: `Verify ${name} with a valid request returns ${okCode}${e.method === "POST" ? ` and creates the ${entity}` : ""}`,
    category: "API",
    type: "Positive",
    priority: "P1",
    automation: true,
    base: "api",
    steps: [...base(e.sampleBody), ...check(e.method === "POST" ? `Send GET for the new ${entity} (or check the DB) to confirm it was stored.` : "Compare the data with the database.")],
    data: [`Endpoint: ${name}`, `Token: ${token}`, `Body: ${json(e.sampleBody)}`],
    expected: [`Status code: ${okCode}.`, e.method === "POST" ? `The response body contains the new ${entity}'s id and the submitted values.` : "The response body contains the expected data.", "Sensitive fields (password, tokens) are not returned.", e.method === "POST" ? `The ${entity} exists in the database exactly once.` : "No data is changed by a read request.", "The response has 'Content-Type: application/json'."],
    tags: ["status-codes", "positive", "response-schema"],
    essential: true,
    api: api(e.sampleBody, okCode),
  });

  if (e.sampleBody !== null && typeof e.sampleBody === "object") {
    const required = e.bodyFields.filter((x) => x.required).map((x) => x.name);
    out.push(
      {
        title: `Verify ${name} with an empty JSON body returns ${badCode} listing every required field`,
        category: "API",
        type: "Negative",
        priority: "P2",
        automation: true,
        base: "api",
        steps: [...base({}), ...check(`Confirm no ${entity} was created.`)],
        data: [`Endpoint: ${name}`, "Body: {}", `Required fields: ${required.join(", ") || "as documented"}`],
        expected: [`Status code: ${badCode}.`, `The error lists every missing required field (${required.join(", ") || "as documented"}).`, `No ${entity} is created.`, "The error follows the documented format."],
        tags: ["request-validation", "negative", "error-contract"],
        api: api({}, badCode),
      },
      {
        title: `Verify ${name} with malformed JSON returns 400`,
        category: "API",
        type: "Negative",
        priority: "P2",
        automation: true,
        base: "api",
        steps: [...base(e.sampleBody).slice(0, 3), "Paste the malformed body from the test data (missing closing brace).", "Send the request.", "Check the status code and the response body."],
        data: [`Endpoint: ${name}`, `Body: ${json(e.sampleBody).slice(0, -1)} (closing brace missing)`],
        expected: ["Status code: 400.", "The error says the body is not valid JSON.", "No stack trace or parser internals are exposed.", `No ${entity} is created.`],
        tags: ["request-validation", "negative"],
        api: api(null, 400),
      },
      {
        title: `Verify ${name} stores Unicode and accented values exactly`,
        category: "API",
        type: "Positive",
        priority: "P3",
        automation: true,
        base: "api",
        steps: [...base(e.sampleBody), ...check(`Send GET for the new ${entity} and compare the stored values byte for byte.`)],
        data: [`Endpoint: ${name}`, `Body: ${json({ ...(e.sampleBody as Record<string, unknown>), ...(e.bodyFields.some((x) => x.name === "name") ? { name: "Zoë O'Brien-Núñez" } : {}) })}`],
        expected: [`Status code: ${okCode}.`, "Accented and Unicode characters are stored and returned unchanged.", "No encoding errors (e.g. 'Ã«') appear.", "The values are the same when read back later."],
        tags: ["positive", "edge", "localisation"],
        api: api(e.sampleBody, okCode),
      },
    );
    if (e.method === "POST") {
      out.push({
        title: `Verify the ${entity} created by ${name} can be retrieved and matches the request`,
        category: "Integration",
        type: "Positive",
        priority: "P2",
        automation: true,
        base: "api",
        steps: [...base(e.sampleBody), `Take the id from the response (or the 'Location' header).`, `Send GET for that ${entity} with the same token.`],
        data: [`Endpoint: ${name} then GET ${e.path}/{id}`, `Body: ${json(e.sampleBody)}`],
        expected: [`The POST returns ${okCode} with the new id.`, `The GET returns 200 with the same values as the request.`, "Server-generated fields (id, created date) are filled in.", "Sensitive fields are not returned by the GET either."],
        tags: ["positive", "workflow", "response-schema"],
        api: api(e.sampleBody, okCode),
      });
    }
  }

  // Missing / invalid body fields.
  for (const f of e.bodyFields.filter((x) => x.required)) {
    const body = { ...((e.sampleBody as Record<string, unknown>) ?? {}) };
    delete body[f.name];
    out.push({
      title: `Verify ${name} without the required field '${f.name}' returns ${badCode}`,
      category: "API",
      type: "Negative",
      priority: "P1",
      automation: true,
      base: "api",
      steps: [...base(body), ...check(`Confirm no ${entity} was created (GET / DB).`)],
      data: [`Endpoint: ${name}`, `Body (no '${f.name}'): ${json(body)}`],
      expected: [`Status code: ${badCode}.`, `The error body names the missing field '${f.name}'.`, `No ${entity} is created.`, "The error follows the documented error format (no stack trace)."],
      tags: ["request-validation", "negative", "error-contract"],
      essential: true,
      api: api(body, badCode),
    });
  }
  const emailField = e.bodyFields.find((f) => /mail/i.test(f.name));
  if (emailField) {
    const body = { ...((e.sampleBody as Record<string, unknown>) ?? {}), [emailField.name]: "qa.user01example.com" };
    out.push({
      title: `Verify ${name} with an invalid '${emailField.name}' format returns ${badCode}`,
      category: "API",
      type: "Negative",
      priority: "P2",
      automation: true,
      base: "api",
      steps: [...base(body), ...check(`Confirm no ${entity} was created.`)],
      data: [`Endpoint: ${name}`, `Body: ${json(body)}`],
      expected: [`Status code: ${badCode}.`, `The error names '${emailField.name}' and explains the format.`, `No ${entity} is created.`, "The response time is normal (no hang)."],
      tags: ["request-validation", "negative"],
      api: api(body, badCode),
    });
  }
  const typed = e.bodyFields[0];
  if (typed) {
    const body = { ...((e.sampleBody as Record<string, unknown>) ?? {}), [typed.name]: typed.type === "string" ? 12345 : "not-a-number" };
    out.push({
      title: `Verify ${name} with the wrong data type for '${typed.name}' returns ${badCode}`,
      category: "API",
      type: "Negative",
      priority: "P2",
      automation: true,
      base: "api",
      steps: [...base(body), ...check("Confirm nothing was stored.")],
      data: [`Endpoint: ${name}`, `Body: ${json(body)}`, `Expected type of '${typed.name}': ${typed.type}`],
      expected: [`Status code: ${badCode}.`, `The error names '${typed.name}' and the expected type.`, "Nothing is stored.", "No server error (500) is returned."],
      tags: ["request-validation", "negative"],
      api: api(body, badCode),
    });
  }
  for (const f of [...e.bodyFields, ...e.params].filter((x) => x.enum?.length)) {
    out.push({
      title: `Verify ${name} with an invalid value for '${f.name}' returns ${badCode}`,
      category: "API",
      type: "Negative",
      priority: "P2",
      automation: true,
      base: "api",
      steps: [...base(e.sampleBody), "Set the field / parameter to 'NOT_A_VALID_VALUE' before sending.", ...check("Confirm nothing was stored.")],
      data: [`Endpoint: ${name}`, `${f.name}: NOT_A_VALID_VALUE`, `Allowed: ${f.enum!.join(", ")}`],
      expected: [`Status code: ${badCode}.`, "The error lists the allowed values.", "Nothing is stored.", "The error follows the documented format."],
      tags: ["request-validation", "negative"],
      api: api(e.sampleBody, badCode),
    });
  }

  // Auth.
  if (e.secured) {
    const noAuth = { ...headers };
    delete noAuth.Authorization;
    out.push(
      {
        title: `Verify ${name} without a token returns 401`,
        category: "API / Security",
        type: "Negative",
        priority: "P1",
        automation: true,
        base: "api",
        steps: [...base(e.sampleBody, ""), ...check("Confirm nothing was stored or returned.")],
        data: [`Endpoint: ${name}`, "Authorization header: (none)", `Body: ${json(e.sampleBody)}`],
        expected: ["Status code: 401 Unauthorized.", "The body has a generic error and no data.", "Nothing is created or changed.", "The 'WWW-Authenticate' header (if used) describes the scheme."],
        tags: ["api-auth", "negative", "security"],
        essential: true,
        api: api(e.sampleBody, 401, noAuth),
      },
      {
        title: `Verify ${name} with an invalid or expired token returns 401`,
        category: "API / Security",
        type: "Negative",
        priority: "P1",
        automation: true,
        base: "api",
        steps: [...base(e.sampleBody, "Bearer invalid-or-expired-token"), ...check("Repeat with an expired token.")],
        data: [`Endpoint: ${name}`, "Tokens: 'invalid-token-123' and an expired token"],
        expected: ["Status code: 401 for both tokens.", "No data is returned.", "Nothing is created or changed.", "The attempts are logged."],
        tags: ["api-auth", "negative", "security"],
        api: api(e.sampleBody, 401, { ...headers, Authorization: "Bearer invalid-token-123" }),
      },
    );
    if (req.tokenRole || codes.has(403)) {
      out.push({
        title: `Verify ${name} with a valid token for a role without access returns 403`,
        category: "API / Security",
        type: "Negative",
        priority: "P1",
        automation: true,
        base: "api",
        pre: [`A valid token for a non-${req.tokenRole ?? "authorised"} user (e.g. a regular member) is available.`],
        steps: [...base(e.sampleBody, "Bearer <member token>"), ...check("Confirm nothing was stored.")],
        data: [`Endpoint: ${name}`, `Token: member (not ${req.tokenRole ?? "authorised"})`, `Body: ${json(e.sampleBody)}`],
        expected: ["Status code: 403 Forbidden.", "No data is created or changed.", "The error doesn't reveal internal details.", "The denied attempt is logged."],
        tags: ["api-auth", "roles", "negative", "security"],
        essential: true,
        api: api(e.sampleBody, 403, { ...headers, Authorization: "Bearer <member token>" }),
      });
    }
  }

  // Duplicate (unique fields / 409).
  const uniqueField = req.fields.find((f) => f.unique);
  if (codes.has(409) || (uniqueField && e.method === "POST")) {
    const field = uniqueField ? uniqueField.name.toLowerCase() : "identifier";
    out.push({
      title: `Verify ${name} with an existing ${field} returns ${codes.has(409) ? 409 : badCode} (duplicate)`,
      category: "API",
      type: "Negative",
      priority: "P1",
      automation: true,
      base: "api",
      state: `A ${entity} with the ${field} in the test data already exists.`,
      steps: [...base(e.sampleBody), ...check(`Confirm only one ${entity} with this ${field} exists.`)],
      data: [`Endpoint: ${name}`, `Body: ${json(e.sampleBody)} (${field} already registered)`, `Variant: the same ${field} in UPPER CASE`],
      expected: [`Status code: ${codes.has(409) ? 409 : badCode}.`, `The error says the ${field} already exists.`, `No second ${entity} is created (also for the upper-case variant).`, "The existing record is unchanged."],
      tags: ["status-codes", "negative", "idempotency"],
      essential: true,
      api: api(e.sampleBody, codes.has(409) ? 409 : badCode),
    });
  }

  // Remaining documented codes not covered above.
  for (const r of e.responses) {
    const c = Number(r.code);
    if (!c || c === okCode || [400, 401, 403, 409, 422].includes(c)) continue;
    out.push({
      title: `Verify ${name} returns ${c}${r.description ? ` (${r.description})` : ""} in the documented situation`,
      category: "API",
      type: c < 400 ? "Positive" : "Negative",
      priority: c >= 500 ? "P3" : "P2",
      automation: true,
      base: "api",
      steps: [...base(e.sampleBody), `Set up the situation that should return ${c}${r.description ? `: ${r.description}` : ""}.`, "Check the status code and the response body."],
      data: [`Endpoint: ${name}`, `Expected status: ${c}`],
      expected: [`Status code: ${c}.`, "The body follows the documented format.", "No unexpected data is changed.", "No stack trace or internal detail is exposed."],
      tags: ["status-codes", c < 400 ? "positive" : "negative"],
      essential: true,
      api: api(e.sampleBody, c),
    });
  }

  out.push({
    title: `Verify ${name} rejects an unsupported HTTP method with 405`,
    category: "API",
    type: "Negative",
    priority: "P3",
    automation: true,
    base: "api",
    steps: [`In the API client, create a ${e.method === "DELETE" ? "PATCH" : "DELETE"} request to {{baseUrl}}${e.path}.`, `Set the header 'Authorization: Bearer <${token}>'.`, "Send the request.", "Check the status code.", "Check the 'Allow' response header."],
    data: [`Endpoint: ${e.method === "DELETE" ? "PATCH" : "DELETE"} ${e.path}`],
    expected: ["Status code: 405 Method Not Allowed (or 404).", `The 'Allow' header lists ${e.method}.`, "Nothing is changed.", "No stack trace is exposed."],
    tags: ["contract", "negative"],
  });

  if (e.method === "POST" && e.sampleBody !== null) {
    out.push({
      title: `Verify sending the same ${name} request twice quickly creates only one ${entity}`,
      category: "Data Integrity",
      type: "Negative",
      priority: "P2",
      automation: true,
      base: "api",
      steps: [...base(e.sampleBody), "Immediately send the identical request again (or run both in parallel).", "Check both responses and the database."],
      data: [`Endpoint: ${name}`, `Body: ${json(e.sampleBody)} (sent twice)`],
      expected: [`One request returns ${okCode}; the other returns ${codes.has(409) ? 409 : "an error / the same resource"}.`, `Exactly one ${entity} exists.`, "No partial or duplicate records.", "Both responses arrive without a server error."],
      tags: ["idempotency", "negative"],
    });
  }
  ctx.assume(`API cases assume {{baseUrl}} is set in the API client and tokens are obtained from the auth service; status codes follow the requirement${e.responses.length ? "" : " (none were documented — standard REST codes assumed)"}.`);
  return out;
}

export const endpointLabel = (e: Endpoint) => `${e.method} ${e.path}`;
export { cap };
