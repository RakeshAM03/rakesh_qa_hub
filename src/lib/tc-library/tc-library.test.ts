import { describe, expect, it } from "vitest";

import { previewImport } from "./import";
import { isPrReference, prReferenceHref } from "./pr-ref";
import { entryInputSchema } from "./schema";

describe("PR references", () => {
  it("accepts repo #number and PR URLs", () => {
    expect(isPrReference("my-repo #42")).toBe(true);
    expect(isPrReference("org/my-repo#42")).toBe(true);
    expect(isPrReference("https://github.com/org/repo/pull/42")).toBe(true);
    expect(isPrReference("my repo 42")).toBe(false);
    expect(isPrReference("https://example.com/pull/1")).toBe(false);
  });

  it("links URLs and owner/repo directly, bare repos via search", () => {
    expect(prReferenceHref("https://github.com/org/repo/pull/42")).toBe("https://github.com/org/repo/pull/42");
    expect(prReferenceHref("org/my-repo #42")).toBe("https://github.com/org/my-repo/pull/42");
    expect(prReferenceHref("my-repo #42")).toBe(
      "https://github.com/search?type=pullrequests&q=my-repo%2042",
    );
    expect(prReferenceHref("")).toBeNull();
    expect(prReferenceHref(null)).toBeNull();
  });
});

describe("entryInputSchema", () => {
  it("requires name and output", () => {
    const r = entryInputSchema.safeParse({ name: " ", output: "  " });
    expect(r.success).toBe(false);
  });

  it("treats an empty PR reference as none and rejects bad ones", () => {
    expect(entryInputSchema.parse({ name: "A", output: "x", prReference: "" }).prReference).toBeNull();
    expect(entryInputSchema.safeParse({ name: "A", output: "x", prReference: "nope" }).success).toBe(false);
  });

  it("rejects output over 1 MB", () => {
    const big = "x".repeat(1024 * 1024 + 1);
    expect(entryInputSchema.safeParse({ name: "A", output: big }).success).toBe(false);
  });
});

describe("previewImport", () => {
  it("accepts an array, a single entry, or our export wrapper", () => {
    const entry = { name: "Checkout Flow — Oct 2026", prReference: "my-repo #42", output: "## Step 1" };
    expect(previewImport(JSON.stringify([entry])).valid).toHaveLength(1);
    expect(previewImport(JSON.stringify(entry)).valid).toHaveLength(1);
    expect(previewImport(JSON.stringify({ entries: [entry, entry] })).valid).toHaveLength(2);
  });

  it("flags invalid entries with a reason and keeps the valid ones", () => {
    const preview = previewImport(
      JSON.stringify([{ name: "Ok", output: "x" }, { name: "No output" }, { output: "no name" }, 42]),
    );
    expect(preview.valid.map((e) => e.name)).toEqual(["Ok"]);
    expect(preview.invalid.map((i) => i.index)).toEqual([1, 2, 3]);
    expect(preview.invalid[0].name).toBe("No output");
  });

  it("reports unusable files", () => {
    expect(previewImport("{oops").error).toMatch(/valid JSON/);
    expect(previewImport("[]").error).toMatch(/no entries/);
  });
});
