import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultInput } from "@/lib/tcgen/types";

const structuredJson = vi.fn();
vi.mock("@/lib/ai/claude", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/claude")>()), structuredJson: (...args: unknown[]) => structuredJson(...args) }));

const { POST } = await import("./route");
const { POST: IMPROVE } = await import("../improve/route");
const { AiError } = await import("@/lib/ai/claude");

const tc = (id: string, title: string, category = "Functional") => ({
  id,
  title,
  category,
  type: "Positive",
  priority: "P2 - High",
  automation: "Yes",
  preconditions: ["a", "b", "c", "d"],
  steps: ["1", "2", "3", "4", "5"],
  testData: ["Key: value"],
  expectedResult: ["x", "y", "z", "w"],
  gherkin: null,
  requirementRef: "",
  api: null,
});
const answer = (cases: ReturnType<typeof tc>[], q = "") => ({ summary: "s", requirementRules: ["Rule"], assumptions: [], questions: q ? [q] : [], testCases: cases });

const req = (url: string, body: unknown) => new Request(`http://x${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const post = (body: unknown) => POST(req("/api/test-case-generator/generate", body));
const valid = (depth: "quick" | "standard" = "quick") => ({ ...defaultInput(), requirement: "Login with email and password.", options: { ...defaultInput().options, depth } });

describe("POST /api/test-case-generator/generate", () => {
  beforeEach(() => {
    structuredJson.mockReset();
  });

  it("Quick depth: one call with the system prompt, format rules and schema", async () => {
    structuredJson.mockResolvedValueOnce(answer([tc("TC_LOG_001", "Verify login works")]));
    const res = await post(valid());
    expect(res.status).toBe(200);
    const { result } = await res.json();
    expect(result.testCases[0]).toMatchObject({ id: "TC_LOG_001", priority: "P2", automationCandidate: true });
    expect(structuredJson).toHaveBeenCalledTimes(1);
    const call = structuredJson.mock.calls[0][0];
    expect(call.system).toContain("senior QA engineer");
    expect(call.user).toContain("THE STANDARD TEST CASE FORMAT");
    expect(call.schema.required).toContain("requirementRules");
  });

  it("Standard depth: 4 category batches in parallel, merged, de-duplicated and renumbered", async () => {
    structuredJson.mockImplementation(async ({ user }: { user: string }) => {
      const start = Number(/TC_LOG_(\d{3})/.exec(user)![1]);
      return answer([tc(`TC_LOG_${String(start).padStart(3, "0")}`, `Verify case ${start}`), tc(`TC_LOG_${String(start + 1).padStart(3, "0")}`, "Verify shared case")], `About TC_LOG_${String(start).padStart(3, "0")}?`);
    });
    const res = await post(valid("standard"));
    expect(res.status).toBe(200);
    const { result, warnings } = await res.json();
    expect(structuredJson).toHaveBeenCalledTimes(4);
    const batchUsers = structuredJson.mock.calls.map((c) => c[0].user as string);
    expect(batchUsers.map((u) => /ONLY in these categories: ([^.]+)/.exec(u)?.[1].split(",")[0])).toEqual(["Functional", "Boundary Value", "Security", "UI"]);
    expect(result.testCases.map((c: { id: string; title: string }) => [c.id, c.title])).toEqual([
      ["TC_LOG_001", "Verify case 1"],
      ["TC_LOG_002", "Verify shared case"],
      ["TC_LOG_003", "Verify case 101"],
      ["TC_LOG_004", "Verify case 201"],
      ["TC_LOG_005", "Verify case 301"],
    ]);
    expect(result.questions).toContain("About TC_LOG_003?");
    expect(warnings).toEqual([]);
  });

  it("keeps the batches that worked and warns about the ones that failed", async () => {
    let n = 0;
    structuredJson.mockImplementation(async ({ user }: { user: string }) => {
      if (user.includes("ONLY in these categories: Boundary Value")) throw new AiError(502, "boom");
      n++;
      return answer([tc(`TC_LOG_00${n}`, `Verify batch case ${n}`)]);
    });
    const res = await post(valid("standard"));
    const { result, warnings } = await res.json();
    expect(result.testCases).toHaveLength(3);
    expect(warnings[0]).toMatch(/Boundary values/);
  });

  it("retries once with the validation error, then succeeds", async () => {
    structuredJson.mockResolvedValueOnce(answer([])).mockResolvedValueOnce(answer([tc("TC_LOG_001", "Verify login works")]));
    expect((await post(valid())).status).toBe(200);
    expect(structuredJson.mock.calls[1][0].user).toMatch(/previous answer was rejected: testCases: The answer has no test cases/);
  });

  it("gives a friendly error when the retry is also invalid, and passes AI errors through", async () => {
    structuredJson.mockResolvedValue({ nope: true });
    const res = await post(valid());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/even after a retry/);
    structuredJson.mockReset();
    structuredJson.mockRejectedValueOnce(new AiError(503, "AI is off (ANTHROPIC_API_KEY is not set)."));
    expect((await post(valid())).status).toBe(503);
  });

  it("rejects empty input, no types and input over 30 KB without calling the AI", async () => {
    expect((await post({ ...defaultInput() })).status).toBe(400);
    expect((await post({ ...valid(), types: [] })).status).toBe(400);
    expect((await post({ ...valid(), requirement: "x".repeat(20_000), apiSpec: "y".repeat(12_000) })).status).toBe(413);
    expect(structuredJson).not.toHaveBeenCalled();
  });
});

describe("POST /api/test-case-generator/improve", () => {
  beforeEach(() => {
    structuredJson.mockReset();
  });

  it("sends only the weak rows and returns the rewritten cases", async () => {
    structuredJson.mockResolvedValueOnce(answer([tc("TC_LOG_007", "Verify login is blocked after 5 wrong passwords")]));
    const weak = { key: "k", id: "TC_LOG_007", title: "Check lockout", category: "Functional", type: "Negative", priority: "P1", automationCandidate: true, preconditions: "", steps: ["a"], testData: "", expectedResult: "x", gherkin: null, requirementRef: "", api: null };
    const res = await IMPROVE(req("/api/test-case-generator/improve", { input: valid(), cases: [weak] }));
    expect(res.status).toBe(200);
    const { cases } = await res.json();
    expect(cases[0]).toMatchObject({ id: "TC_LOG_007", title: "Verify login is blocked after 5 wrong passwords" });
    expect(structuredJson.mock.calls[0][0].user).toContain("TC_LOG_007: test data is empty");
  });
});
