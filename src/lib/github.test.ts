import { describe, expect, it } from "vitest";

import { isGithubPrUrl, parsePrUrl, splitList } from "./github";

describe("parsePrUrl", () => {
  it("parses owner, repo and number", () => {
    expect(parsePrUrl(" https://github.com/org/my-repo/pull/123 ")).toEqual({
      owner: "org",
      repo: "my-repo",
      number: 123,
      url: "https://github.com/org/my-repo/pull/123",
    });
  });

  it("accepts trailing paths, queries and hashes", () => {
    expect(isGithubPrUrl("https://github.com/org/repo/pull/7/files")).toBe(true);
    expect(isGithubPrUrl("https://github.com/org/repo/pull/7#discussion_r1")).toBe(true);
    expect(isGithubPrUrl("https://github.com/org/repo.js/pull/7?w=1")).toBe(true);
  });

  it("rejects other URLs", () => {
    for (const url of [
      "http://github.com/org/repo/pull/1",
      "https://github.com/org/repo/issues/1",
      "https://github.com/org/repo/pull/abc",
      "https://gitlab.com/org/repo/pull/1",
      "https://github.com.evil.com/org/repo/pull/1",
      "github.com/org/repo/pull/1",
      "",
    ]) {
      expect(isGithubPrUrl(url), url).toBe(false);
    }
  });
});

describe("splitList", () => {
  it("splits on commas and newlines", () => {
    expect(splitList("a, b\n\nc ,\n")).toEqual(["a", "b", "c"]);
  });
});
