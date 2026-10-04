import { describe, expect, it } from "vitest";

import { jsonPath, runAssertion, runAssertions } from "./assertions";
import { buildRequest, draftUnknownVariables, EMPTY_DRAFT, formatJson, paramsFromUrl, substitute, toCurl, unknownVariables, urlWithParams, type Assertion, type RequestDraft } from "./request";

const kv = (key: string, value: string, enabled = true) => ({ id: key, key, value, enabled });
const draft = (patch: Partial<RequestDraft>): RequestDraft => ({ ...EMPTY_DRAFT, ...patch });

describe("variables", () => {
  const vars = { baseUrl: "https://api.example.com", token: "abc" };
  it("substitutes {{name}} and leaves unknown ones", () => {
    expect(substitute("{{baseUrl}}/users/{{ id }}", vars)).toBe("https://api.example.com/users/{{ id }}");
    expect(substitute("{{ token }}", vars)).toBe("abc");
  });
  it("lists unknown variables across the request", () => {
    expect(unknownVariables("{{baseUrl}}/{{a}}/{{b}}/{{a}}", vars)).toEqual(["a", "b"]);
    const d = draft({ url: "{{baseUrl}}/x", headers: [kv("X-Key", "{{apiKey}}"), kv("X-Off", "{{off}}", false)], auth: { type: "bearer", token: "{{tok}}" } });
    expect(draftUnknownVariables(d, vars)).toEqual(["apiKey", "tok"]);
  });
});

describe("params and URL", () => {
  it("parses query params and rebuilds the URL, keeping variables readable", () => {
    const params = paramsFromUrl("https://x.test/a?q=hello%20world&page=2&k={{v}}");
    expect(params.map((p) => [p.key, p.value])).toEqual([
      ["q", "hello world"],
      ["page", "2"],
      ["k", "{{v}}"],
    ]);
    expect(urlWithParams("https://x.test/a?old=1#frag", [kv("q", "a b"), kv("off", "x", false), kv("k", "{{v}}")])).toBe("https://x.test/a?q=a%20b&k={{v}}#frag");
  });
  it("keeps disabled params when the URL changes", () => {
    expect(paramsFromUrl("https://x.test/?a=1", [kv("a", "0"), kv("off", "x", false)]).map((p) => p.key)).toEqual(["a", "off"]);
  });
});

describe("buildRequest", () => {
  const vars = { host: "https://api.example.com", tok: "secret" };
  it("applies variables, bearer auth and JSON body", () => {
    const r = buildRequest(draft({ method: "POST", url: "{{host}}/users", auth: { type: "bearer", token: "{{tok}}" }, body: { type: "json", text: '{"name":"{{tok}}"}' } }), vars);
    expect(r).toEqual({
      method: "POST",
      url: "https://api.example.com/users",
      headers: [
        { key: "Authorization", value: "Bearer secret" },
        { key: "Content-Type", value: "application/json" },
      ],
      body: '{"name":"secret"}',
    });
  });
  it("encodes basic auth, API keys in the query and form bodies", () => {
    expect(buildRequest(draft({ url: "https://x.test", auth: { type: "basic", username: "u", password: "p" } }), {}).headers).toEqual([{ key: "Authorization", value: "Basic dTpw" }]);
    expect(buildRequest(draft({ url: "https://x.test/a?b=1", auth: { type: "apikey", key: "api_key", value: "k 1", in: "query" } }), {}).url).toBe("https://x.test/a?b=1&api_key=k%201");
    const form = buildRequest(draft({ method: "POST", url: "https://x.test", body: { type: "form", fields: [kv("a", "1 2"), kv("b", "&")] } }), {});
    expect(form.body).toBe("a=1%202&b=%26");
    expect(form.headers).toContainEqual({ key: "Content-Type", value: "application/x-www-form-urlencoded" });
  });
  it("never sends a body with GET", () => {
    expect(buildRequest(draft({ url: "https://x.test", body: { type: "json", text: "{}" } }), {}).body).toBeUndefined();
  });
});

describe("cURL export", () => {
  it("quotes for the shell", () => {
    expect(toCurl({ method: "POST", url: "https://x.test/a?q=1", headers: [{ key: "Content-Type", value: "application/json" }], body: `{"it's":1}` })).toBe(
      `curl \\\n  -X POST \\\n  'https://x.test/a?q=1' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"it'\\''s":1}'`,
    );
    expect(toCurl({ method: "GET", url: "https://x.test", headers: [] })).toBe("curl \\\n  'https://x.test'");
  });
  it("formats JSON or reports the error", () => {
    expect(formatJson('{"a":[1]}')).toEqual({ ok: true, text: '{\n  "a": [\n    1\n  ]\n}' });
    expect(formatJson("{a}").ok).toBe(false);
  });
});

describe("JSON path", () => {
  const data = { data: [{ id: 7, tags: ["a", "b"], "odd key": true }, { id: 8 }], meta: { total: 2 } };
  it.each([
    ["$.data[0].id", [7]],
    ["$.data[-1].id", [8]],
    ["$.data[*].id", [7, 8]],
    ["$['meta']['total']", [2]],
    ["$.data[0]['odd key']", [true]],
    ["$.data[0].tags", [["a", "b"]]],
    ["$.missing", []],
    ["$.data[5].id", []],
  ])("%s", (path, values) => expect(jsonPath(data, path)).toEqual({ ok: true, values }));
  it("rejects invalid paths", () => {
    expect(jsonPath(data, "data.id").ok).toBe(false);
    expect(jsonPath(data, "$.data[").ok).toBe(false);
  });
});

describe("assertions", () => {
  const res = { status: 200, timeMs: 340, headers: [["content-type", "application/json; charset=utf-8"]] as [string, string][], body: JSON.stringify({ data: [{ id: 1, name: "Ada" }], ok: true, count: 3 }) };
  const a = (type: Assertion["type"], operator: Assertion["operator"], expected = "", target = ""): Assertion => ({ id: `${type}-${operator}-${target}`, type, operator, expected, target });
  it.each([
    [a("status", "equals", "200"), true],
    [a("status", "equals", "201"), false],
    [a("time", "lessThan", "1000"), true],
    [a("time", "lessThan", "100"), false],
    [a("header", "contains", "application/json", "Content-Type"), true],
    [a("header", "exists", "", "x-missing"), false],
    [a("header", "notExists", "", "x-missing"), true],
    [a("jsonpath", "exists", "", "$.data[0].id"), true],
    [a("jsonpath", "equals", "Ada", "$.data[0].name"), true],
    [a("jsonpath", "equals", "1", "$.data[0].id"), true],
    [a("jsonpath", "equals", "true", "$.ok"), true],
    [a("jsonpath", "isType", "array", "$.data"), true],
    [a("jsonpath", "isType", "string", "$.count"), false],
    [a("jsonpath", "greaterThan", "2", "$.count"), true],
    [a("jsonpath", "notExists", "", "$.nope"), true],
    [a("body", "contains", '"ok":true'), true],
    [a("body", "notContains", "error"), true],
  ])("%o → %s", (assertion, pass) => expect(runAssertion(assertion, res).pass).toBe(pass));
  it("reports actual values and a summary", () => {
    const r = runAssertions([a("status", "equals", "201"), a("jsonpath", "equals", "Ada", "$.data[0].name")], res);
    expect(r).toMatchObject({ passed: 1, total: 2 });
    expect(r.results[0]).toMatchObject({ pass: false, actual: "200", message: "Status code equals 201" });
    expect(runAssertion(a("jsonpath", "exists", "", "$.a"), { ...res, body: "<html>" }).actual).toBe("(body isn't JSON)");
  });
});
