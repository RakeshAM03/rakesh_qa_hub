import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultInput } from "@/lib/tcgen/types";

const structuredJson = vi.fn();
vi.mock("@/lib/ai/claude", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/claude")>()), structuredJson: (...args: unknown[]) => structuredJson(...args) }));

const { POST } = await import("./route");
const { AiError } = await import("@/lib/ai/claude");

const good = {
  summary: "s",
  assumptions: [],
  questions: [],
  testCases: [{ id: "TC-X-001", title: "Works", category: "Functional", type: "Positive", priority: "P1", preconditions: "", testData: "", steps: ["a"], expectedResult: "ok", gherkin: null, requirementRef: "", automationCandidate: true, api: null }],
};

const post = (body: unknown) => POST(new Request("http://x/api/test-case-generator/generate", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const valid = () => ({ ...defaultInput(), requirement: "As a user I can log in." });

describe("POST /api/test-case-generator/generate", () => {
  beforeEach(() => structuredJson.mockReset());

  it("returns validated cases and sends the system prompt and schema", async () => {
    structuredJson.mockResolvedValueOnce(good);
    const res = await post(valid());
    expect(res.status).toBe(200);
    const { result } = await res.json();
    expect(result.testCases[0]).toMatchObject({ id: "TC-X-001", title: "Works", priority: "P1" });
    const call = structuredJson.mock.calls[0][0];
    expect(call.system).toContain("senior QA engineer");
    expect(call.user).toContain("<requirement>\nAs a user I can log in.\n</requirement>");
    expect(call.schema.required).toEqual(["summary", "assumptions", "questions", "testCases"]);
  });

  it("retries once with the validation error, then succeeds", async () => {
    structuredJson.mockResolvedValueOnce({ ...good, testCases: [] }).mockResolvedValueOnce(good);
    const res = await post(valid());
    expect(res.status).toBe(200);
    expect(structuredJson).toHaveBeenCalledTimes(2);
    expect(structuredJson.mock.calls[1][0].user).toMatch(/previous answer was rejected: testCases: The answer has no test cases/);
  });

  it("gives a friendly error when the retry is also invalid", async () => {
    structuredJson.mockResolvedValue({ nope: true });
    const res = await post(valid());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/even after a retry/);
    expect(structuredJson).toHaveBeenCalledTimes(2);
  });

  it("passes AI errors through (e.g. AI off)", async () => {
    structuredJson.mockRejectedValueOnce(new AiError(503, "AI is off (ANTHROPIC_API_KEY is not set)."));
    const res = await post(valid());
    expect(res.status).toBe(503);
  });

  it("rejects empty input, no types and input over 30 KB without calling the AI", async () => {
    expect((await post({ ...defaultInput() })).status).toBe(400);
    expect((await post({ ...valid(), types: [] })).status).toBe(400);
    expect((await post({ ...valid(), requirement: "x".repeat(20_000), apiSpec: "y".repeat(12_000) })).status).toBe(413);
    expect(structuredJson).not.toHaveBeenCalled();
  });
});
