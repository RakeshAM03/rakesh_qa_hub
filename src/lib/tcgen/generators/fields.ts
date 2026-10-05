/** Field-validation generator: required / whitespace / format rules per field type, Unicode, injection, uniqueness. */

import type { FieldInfo } from "../requirement";
import { article, rejected, succeeded, verifySteps, type Ctx, type Draft } from "./common";
import { submitButton } from "./values-limits";

const SAMPLE: Record<FieldInfo["type"], string> = {
  email: "qa.user01@example.com",
  password: "Valid@1234",
  phone: "9876543210",
  date: "15/08/1995",
  number: "12",
  url: "https://example.com/profile",
  text: "Asha Rao",
  amount: "500.00",
  otp: "123456",
};

export function fieldCases(ctx: Ctx, f: FieldInfo, depth: "quick" | "standard" | "exhaustive"): Draft[] {
  const { req } = ctx;
  const submit = submitButton(ctx);
  const out: Draft[] = [];
  const base = req.features.auth && (f.type === "email" || f.type === "password") ? ("auth" as const) : ("app" as const);
  const steps = (entry: string) => [...ctx.open, `Fill all other ${req.features.auth ? "" : "required "}fields with valid data (see test data).`, entry, `Click ${submit}.`, ...verifySteps(ctx)];
  const others = req.fields.filter((x) => x.name !== f.name).map((x) => `${x.name}: ${SAMPLE[x.type]}`);
  const reject = (msg: string, extra: string[] = []) => rejected(ctx, ctx.msg([f.name.toLowerCase(), "required", "valid"], msg), extra);

  if (f.required || req.features.auth) {
    out.push({
      title: `Verify submitting with the ${f.name} left blank is blocked`,
      category: "Validation",
      type: "Negative",
      priority: "P1",
      automation: true,
      base,
      steps: steps(`Leave the '${f.name}' field empty.`),
      data: [`${f.name}: (empty)`, ...others],
      expected: reject(`${f.name} is required.`),
      tags: ["negative", "validation"],
    });
    out.push({
      title: `Verify ${article(f.name)} ${f.name} of only spaces is treated as blank and rejected`,
      category: "Validation",
      type: "Negative",
      priority: "P2",
      automation: true,
      base,
      steps: steps(`Enter three spaces in the '${f.name}' field.`),
      data: [`${f.name}: "   " (3 spaces)`, ...others],
      expected: reject(`${f.name} is required.`),
      tags: ["negative", "validation", "edge"],
    });
  }

  switch (f.type) {
    case "email":
      out.push({
        title: `Verify invalid ${f.name} formats are rejected`,
        category: "Validation",
        type: "Negative",
        priority: "P1",
        automation: true,
        base,
        steps: steps(`Enter each invalid ${f.name} from the test data, one at a time.`),
        data: ["1. qa.user01example.com (missing @)", "2. qa.user01@ (no domain)", "3. qa user@example.com (space)", "4. qa@@example.com (double @)", "5. qa.user01@example (no top-level domain)"],
        expected: reject(`Please enter a valid ${f.name.toLowerCase()} address.`),
        tags: ["negative", "validation", "equivalence"],
      });
      out.push({
        title: `Verify ${f.name} is trimmed and handled case-insensitively`,
        category: "Validation",
        type: "Positive",
        priority: "P3",
        automation: true,
        base,
        steps: steps(`Enter '  QA.User01@Example.COM  ' in the '${f.name}' field.`),
        data: [`${f.name}: "  QA.User01@Example.COM  " (mixed case, spaces around)`, ...others],
        expected: succeeded(
          ctx,
          "The value is accepted.",
          ctx.msg(["success", "welcome", "saved"], req.features.auth ? "Signed in successfully" : "Saved successfully"),
          req.features.auth ? "The user is signed in to the account qa.user01@example.com." : `The saved ${f.name} is 'qa.user01@example.com' (trimmed, lower-case) after a refresh.`,
        ),
        tags: ["positive", "edge"],
      });
      break;
    case "phone":
      out.push({
        title: `Verify ${f.name} with letters or special characters is rejected`,
        category: "Validation",
        type: "Negative",
        priority: "P2",
        automation: true,
        steps: steps(`Enter each invalid ${f.name} from the test data, one at a time.`),
        data: ["1. 98765abcde (letters)", "2. 98765-4321# (special characters)", "3. +91 98765 4321 (spaces / country code, if not allowed)"],
        expected: reject(`Please enter a valid ${f.name.toLowerCase()} number.`),
        tags: ["negative", "validation", "equivalence"],
      });
      break;
    case "password":
      if (!req.features.auth || req.features.form) {
        out.push({
          title: `Verify weak ${f.name}s that miss a required character type are rejected`,
          category: "Validation",
          type: "Negative",
          priority: "P1",
          automation: true,
          steps: steps(`Enter each weak ${f.name} from the test data, one at a time.`),
          data: ["1. password1 (no uppercase, no symbol)", "2. Password! (no number)", "3. PASSWORD1! (no lowercase)", "4. Pass word1! (contains a space)"],
          expected: reject(`${f.name} must contain upper- and lower-case letters, a number and a symbol.`),
          tags: ["negative", "validation", "security"],
        });
      }
      out.push({
        title: `Verify the ${f.name} is masked and can be shown / hidden`,
        category: "Security",
        type: "Positive",
        priority: "P2",
        automation: true,
        base,
        steps: [...ctx.open, `Type the test ${f.name} in the '${f.name}' field.`, "Check how the characters are displayed.", `Click the show / hide (eye) icon next to the field.`, "Click it again.", "Copy the field value and paste it into a text editor."],
        data: [`${f.name}: ${SAMPLE.password}`],
        expected: ["Characters are masked (•••) by default.", "The eye icon reveals the plain text, and clicking again masks it.", "Copying the masked field does not expose the password (or copy is disabled).", "The password never appears in the URL, page source or browser autocomplete for other sites."],
        tags: ["security", "usability"],
      });
      break;
    case "date":
      out.push({
        title: `Verify invalid and future dates are rejected in ${f.name}`,
        category: "Validation",
        type: "Negative",
        priority: "P2",
        automation: true,
        steps: steps(`Enter each date from the test data in the '${f.name}' field, one at a time.`),
        data: ["1. 31/04/2000 (April has 30 days)", "2. 29/02/2023 (not a leap year)", "3. A date in the future", "4. 2000-13-01 (wrong format / month)"],
        expected: reject(`Please enter a valid ${f.name.toLowerCase()}.`),
        tags: ["negative", "validation", "edge"],
      });
      break;
    case "url":
      out.push({
        title: `Verify invalid or unsafe URLs are rejected in ${f.name}`,
        category: "Security",
        type: "Negative",
        priority: "P2",
        automation: true,
        steps: steps(`Enter each value from the test data in the '${f.name}' field, one at a time.`),
        data: ["1. javascript:alert(1)", "2. htp:/broken", "3. www.example.com (no scheme, if a scheme is required)"],
        expected: reject("Please enter a valid URL (https://…)."),
        tags: ["negative", "security"],
      });
      break;
    case "amount":
      out.push({
        title: `Verify non-numeric and over-precise ${f.name} values are rejected`,
        category: "Validation",
        type: "Negative",
        priority: "P2",
        automation: true,
        steps: steps(`Enter each value from the test data in the '${f.name}' field, one at a time.`),
        data: ["1. abc", "2. 100.999 (3 decimal places)", "3. 1e3 (scientific notation)", "4. ₹ 500 (currency symbol typed in)"],
        expected: reject(`Enter a valid ${f.name.toLowerCase()}.`, ["No charge or record is created."]),
        tags: ["negative", "validation"],
      });
      break;
    case "otp":
      out.push({
        title: "Verify a wrong, expired or reused OTP is rejected",
        category: "Security",
        type: "Negative",
        priority: "P1",
        automation: true,
        steps: steps("Enter each OTP from the test data, one at a time."),
        data: ["1. 000000 (wrong)", "2. The previous OTP after expiry", "3. An OTP that was already used"],
        expected: reject("The OTP is invalid or has expired."),
        tags: ["negative", "security"],
      });
      break;
    case "text":
      out.push({
        title: `Verify ${f.name} accepts accented and Unicode characters`,
        category: "Functional",
        type: "Positive",
        priority: "P3",
        automation: true,
        steps: steps(`Enter '${"Zoë O'Brien-Núñez"}' in the '${f.name}' field.`),
        data: [`${f.name}: Zoë O'Brien-Núñez`, ...others],
        expected: succeeded(ctx, "The value is accepted.", ctx.msg(["success", "saved"], "Saved successfully"), `After a refresh, the ${f.name} shows exactly 'Zoë O'Brien-Núñez' (no encoding issues).`),
        tags: ["positive", "edge", "localisation"],
      });
      break;
    default:
      break;
  }

  if (f.type === "text" || f.type === "email" || (depth !== "quick" && f.type !== "password")) {
    out.push({
      title: `Verify script and SQL injection input in ${f.name} is not executed`,
      category: "Security",
      type: "Negative",
      priority: "P1",
      automation: true,
      base,
      steps: steps(`Enter each payload from the test data in the '${f.name}' field, one at a time.`),
      data: [`1. <script>alert(1)</script>`, `2. "><img src=x onerror=alert(1)>`, `3. ' OR '1'='1' --`],
      expected: [
        "No script runs and no alert box appears.",
        "The input is either rejected with a validation message or saved and shown as plain text.",
        "No database error or stack trace is shown.",
        "After a refresh the page renders normally (no stored XSS).",
      ],
      tags: ["negative", "security"],
    });
  }

  if (f.unique) {
    out.push({
      title: `Verify ${article(f.name)} ${f.name} that already exists is rejected (duplicate)`,
      category: "Validation",
      type: "Negative",
      priority: "P1",
      automation: true,
      state: `A ${req.entity} with ${f.name} '${SAMPLE[f.type]}' already exists.`,
      steps: steps(`Enter the existing ${f.name} '${SAMPLE[f.type]}' — first exactly, then in UPPER CASE.`),
      data: [`${f.name} (existing): ${SAMPLE[f.type]}`, `${f.name} (case variant): ${SAMPLE[f.type].toUpperCase()}`, ...others],
      expected: reject(`This ${f.name.toLowerCase()} is already registered.`, ["No second record is created (check the list / DB)."]),
      tags: ["negative", "validation"],
      essential: true,
    });
    ctx.assume(`${f.name} uniqueness is case-insensitive and ignores surrounding spaces.`);
  }
  return out;
}
