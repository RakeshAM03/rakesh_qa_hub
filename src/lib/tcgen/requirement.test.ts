import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { describeBytes, describeLimit, extractRequirement, fieldTypeOf } from "./requirement";

const sample = (name: string) => readFileSync(`tests/fixtures/tcgen/requirements/${name}`, "utf8");

describe("rule extractor", () => {
  it("file upload: allowed formats and a size limit in bytes", () => {
    const r = extractRequirement(sample("1-file-upload.txt"));
    expect(r.moduleName).toBe("Resume Upload");
    expect(r.abbr).toBe("RU");
    expect(r.entity).toBe("resume");
    expect(r.features.files).toBe(true);
    expect(r.lists).toEqual([expect.objectContaining({ kind: "format", values: ["PDF", "DOCX", "DOC", "TXT"] })]);
    expect(r.limits).toEqual([expect.objectContaining({ kind: "size", max: 5_242_880, unit: "bytes" })]);
    expect(r.rules).toContain("File size: max 5 MB (5,242,880 bytes)");
  });

  it("login: attempts, lockout duration, password length range and auth fields", () => {
    const r = extractRequirement(sample("2-login.txt"));
    expect(r.moduleName).toBe("Login");
    expect(r.abbr).toBe("LOG");
    expect(r.features.auth).toBe(true);
    expect(r.lockout).toEqual({ attempts: 5, minutes: 15 });
    expect(r.limits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "attempts", max: 5 }),
        expect.objectContaining({ kind: "duration", max: 15, unit: "minutes", subject: "lockout period" }),
        expect.objectContaining({ kind: "length", subject: "Password", min: 8, max: 20 }),
      ]),
    );
    expect(r.fields.map((f) => [f.name, f.type, f.required])).toEqual(
      expect.arrayContaining([
        ["Email", "email", true],
        ["Password", "password", true],
      ]),
    );
  });

  it("takes the subject of 'X must be 8–20 characters' from X, not a generic 'Text'", () => {
    const r = extractRequirement("Users log in with email and password.\nAC1: Password must be 8–20 characters.\nAC2: Display name should be between 3 and 30 characters.");
    expect(r.limits.filter((l) => l.kind === "length").map(describeLimit)).toContain("Password: 8 characters to 20 characters");
    expect(r.limits.some((l) => l.subject === "Text")).toBe(false);
  });

  it("registration form: fields with attributes, digits, age and uniqueness", () => {
    const r = extractRequirement(sample("3-registration.txt"));
    expect(r.moduleName).toBe("Registration Form");
    expect(r.entity).toBe("user account");
    const byName = Object.fromEntries(r.fields.map((f) => [f.name, f]));
    expect(byName.Name).toMatchObject({ type: "text", required: true });
    expect(byName.Email).toMatchObject({ type: "email", required: true, unique: true });
    expect(byName.Phone.type).toBe("phone");
    expect(byName["Date of Birth"].type).toBe("date");
    expect(r.limits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "length", subject: "Name", max: 50 }),
        expect.objectContaining({ kind: "digits", subject: "Phone", min: 10, max: 10 }),
        expect.objectContaining({ kind: "age", min: 18 }),
      ]),
    );
  });

  it("search & filter: search, filter and sort lists, a numeric range and page size", () => {
    const r = extractRequirement(sample("4-search-filter.txt"));
    expect(r.features.search).toBe(true);
    expect(r.entity).toBe("candidate");
    const lists = Object.fromEntries(r.lists.map((l) => [l.kind, l.values]));
    expect(lists).toEqual({ search: ["name", "skill"], filter: ["location", "experience"], sort: ["date", "relevance"] });
    expect(r.limits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "range", subject: "experience", min: 0, max: 30, unit: "years" }),
        expect.objectContaining({ kind: "perPage", max: 20 }),
      ]),
    );
    expect(r.fields.find((f) => f.name === "Name")).toBeUndefined(); // search criteria aren't form fields
  });

  it("payment: methods, an amount range in rupees and a duplicate rule", () => {
    const r = extractRequirement(sample("5-payment.txt"));
    expect(r.lists).toEqual([expect.objectContaining({ kind: "method", values: ["card", "UPI"] })]);
    expect(r.limits).toEqual([expect.objectContaining({ kind: "amount", min: 1, max: 100_000, unit: "₹" })]);
    expect(r.duplicate).toEqual({ subject: "payment", scope: "invoice" });
    expect(describeLimit(r.limits[0])).toBe("Amount: ₹1 to ₹1,00,000");
  });

  it("API endpoint: method and path, token role, unique field and status codes", () => {
    const r = extractRequirement(sample("6-api-endpoint.txt"));
    expect(r.moduleName).toBe("Users API");
    expect(r.features.api).toBe(true);
    expect(r.endpoints).toEqual([{ method: "POST", path: "/api/users" }]);
    expect(r.tokenRole).toBe("admin");
    expect(r.statusCodes).toEqual([201, 400, 401, 403, 409]);
    expect(r.fields.find((f) => f.type === "email")).toMatchObject({ unique: true });
    expect(r.rules).toContain("Requires an admin token");
  });

  it("understands other phrasings: KB / GB, 'at least', counts, roles, if/then and statuses", () => {
    const r = extractRequirement(
      "Expense claims: attach up to 3 files, minimum 10 KB each and max 1 GB in total; Description must be at least 20 characters; " +
        "Only Managers can approve; if the amount is above 50000 then finance must review; Status: Draft → Submitted → Approved.",
    );
    expect(r.limits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "count", max: 3, unit: "files" }),
        expect.objectContaining({ kind: "size", min: 10_240 }),
        expect.objectContaining({ kind: "size", max: 1024 ** 3 }),
        expect.objectContaining({ kind: "length", min: 20 }),
      ]),
    );
    expect(r.roles).toContain("Manager");
    expect(r.conditions[0]).toEqual({ when: "the amount is above 50000", then: "finance must review" });
    expect(r.states).toEqual(["Draft", "Submitted", "Approved"]);
  });

  it("uses the module name from context when given", () => {
    expect(extractRequirement("Users can do things.", { moduleName: "Profile Settings" }).abbr).toBe("PS");
  });

  it("maps field names to types and formats byte sizes", () => {
    expect(["Work email", "Mobile", "Date of joining", "Website", "Salary", "Years of experience", "City"].map(fieldTypeOf)).toEqual(["email", "phone", "date", "url", "amount", "number", "text"]);
    expect([describeBytes(5_242_880), describeBytes(10_240), describeBytes(1000)]).toEqual(["5 MB", "10 KB", "1,000 bytes"]);
  });
});
