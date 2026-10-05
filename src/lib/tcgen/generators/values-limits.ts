/** Allowed-values and limits/boundary generators. */

import { describeBytes, fmt, fmtAmount, type AllowedList, type Limit } from "../requirement";
import { cap, plural, rejected, succeeded, verifySteps, type Ctx, type Draft } from "./common";

const DISALLOWED_FILES: [string, string[]][] = [
  ["image files", ["JPG", "PNG", "JPEG", "GIF"]],
  ["other document formats", ["XLSX", "PPTX", "RTF", "ODT", "CSV", "PDF", "DOCX", "DOC", "TXT"]],
  ["executable, script and archive files", ["EXE", "ZIP", "RAR", "JS", "BAT", "HTML"]],
];

const sizeOf = (bytes: number) => `${describeBytes(bytes)} (${fmt(bytes)} bytes)`;

/** The action's main button, by feature. */
export function submitButton(ctx: Ctx): string {
  const f = ctx.req.features;
  if (f.files) return ctx.button(["upload", "save"], "Upload button");
  if (f.auth) return ctx.button(["sign in", "login", "log in"], "Login button");
  if (f.payment) return ctx.button(["pay", "confirm"], "Pay button");
  if (f.search) return ctx.button(["search", "apply"], "Search button");
  return ctx.button(["submit", "save", "register", "create"], "Submit button");
}

/** Steps to choose a file and upload it. */
export function uploadSteps(ctx: Ctx, fileDesc: string): string[] {
  return [
    ...ctx.open,
    `Click ${ctx.button(["upload", "browse", "choose"], "Upload button")}.`,
    `In the file picker, select ${fileDesc} and click 'Open'.`,
    `Click ${ctx.button(["save", "upload", "submit"], "Save button")} if a separate confirm button exists.`,
    ...verifySteps(ctx),
  ];
}

function fileFormat(ctx: Ctx): string {
  return ctx.req.lists.find((l) => l.kind === "format")?.values[0] ?? "PDF";
}

const ext = (v: string) => v.toLowerCase().replace(/^\./, "");
const fileName = (ctx: Ctx, suffix: string, format: string) => `Sample_${cap(ctx.req.entity).replace(/\s+/g, "_")}${suffix}.${ext(format)}`;

// ---------------------------------------------------------------- allowed values

export function allowedValueCases(ctx: Ctx, list: AllowedList): Draft[] {
  const { req } = ctx;
  const out: Draft[] = [];
  const maxSize = req.limits.find((l) => l.kind === "size")?.max;
  const validSize = maxSize ? Math.min(1024 ** 2, Math.floor(maxSize / 2)) : 1024 ** 2;
  const submit = submitButton(ctx);

  for (const value of list.values) {
    switch (list.kind) {
      case "format": {
        const name = fileName(ctx, "", value);
        out.push({
          title: `Verify a valid ${value} ${req.entity} within the size limit is uploaded successfully`,
          category: "Functional",
          type: "Positive",
          priority: "P1",
          automation: true,
          state: `The ${req.entity} has no file attached yet.`,
          steps: uploadSteps(ctx, `the ${value} file '${name}'`),
          data: [`File name: ${name}`, `Format: ${value}`, `Size: ${sizeOf(validSize)}`],
          expected: succeeded(
            ctx,
            "The file picker closes and the upload starts with a progress indicator.",
            ctx.msg(["upload", "success"], `${cap(req.entity)} uploaded successfully`),
            `The ${ctx.area} shows '${name}' with the .${ext(value)} extension, its size and the upload date/time; it is still there after a page refresh.`,
            ["The file can be downloaded or previewed."],
          ),
          tags: ["positive", "equivalence"],
          essential: true,
        });
        break;
      }
      case "method": {
        const data =
          /card/i.test(value)
            ? ["Card number: 4111 1111 1111 1111 (test card)", "Expiry: 12/30", "CVV: 123", "Card holder: QA Test User"]
            : /upi/i.test(value)
              ? ["UPI ID: success@upi (sandbox)"]
              : [`${cap(list.subject)}: ${value}`];
        const amount = req.limits.find((l) => l.kind === "amount");
        out.push({
          title: `Verify ${req.features.payment ? `the ${req.entity} can be paid` : "the user can sign in"} by ${value}`,
          category: "Functional",
          type: "Positive",
          priority: "P1",
          automation: true,
          state: req.features.payment ? `An unpaid test ${req.entity} exists.` : undefined,
          base: req.features.auth && !req.features.payment ? "auth" : "app",
          steps: [
            ...ctx.open,
            req.features.payment ? `Open the test ${req.entity} and click ${submit}.` : `Choose '${value}' as the sign-in method.`,
            `Select '${value}' as the ${list.subject}.`,
            `Enter the ${value} details from the test data${amount ? " and the amount" : ""}.`,
            `Confirm the ${req.features.payment ? "payment" : "sign-in"}.`,
            ...verifySteps(ctx),
          ],
          data: [...data, ...(amount ? [`Amount: ${fmtAmount(Math.min(amount.max ?? 500, 500), amount.unit)}`] : [])],
          expected: succeeded(
            ctx,
            `The ${value} ${req.features.payment ? "payment" : "sign-in"} is processed without errors.`,
            ctx.msg(["success", "paid"], req.features.payment ? "Payment successful" : "Signed in successfully"),
            req.features.payment ? `The ${req.entity} status changes to 'Paid' and stays 'Paid' after a page refresh.` : "The user lands on the home page and stays signed in after a refresh.",
            req.features.payment ? ["A payment reference is shown and recorded against the invoice."] : [],
          ),
          tags: ["positive", "workflow", "equivalence"],
          essential: true,
        });
        break;
      }
      case "search":
      case "filter":
      case "sort": {
        const verb = list.kind === "search" ? `searching by ${value}` : list.kind === "filter" ? `filtering by ${value}` : `sorting by ${value}`;
        out.push({
          title: `Verify ${verb} returns the correct ${req.entity} results`,
          category: "Functional",
          type: "Positive",
          priority: list.kind === "sort" ? "P2" : "P1",
          automation: true,
          state: `At least 25 test ${req.entity}s exist with known ${value} values.`,
          steps: [
            ...ctx.open,
            list.kind === "sort" ? `Open the 'Sort by' control.` : list.kind === "filter" ? `Open the '${cap(value)}' filter.` : `Choose '${cap(value)}' as the search field (if there is a selector).`,
            list.kind === "sort" ? `Select '${cap(value)}'.` : `Enter / select the ${value} from the test data.`,
            list.kind === "sort" ? "Check the order of the first 10 results." : `Click ${submit}.`,
            "Compare the results with the expected list in the test data.",
            ...verifySteps(ctx, "the results list"),
          ],
          data: list.kind === "sort" ? [`Sort by: ${cap(value)}`, `Records: 25 ${req.entity}s with different ${value} values`] : [`${cap(value)}: ${list.kind === "filter" && /location/i.test(value) ? "Bengaluru" : "a value that matches exactly 3 records"}`, "Expected matches: 3"],
          expected: [
            list.kind === "sort" ? `Results are ordered by ${value} (${/date/i.test(value) ? "newest first" : "best match first"}).` : `Only ${req.entity}s matching the ${value} are listed (3 results).`,
            "The result count shown matches the number of rows.",
            `The selected ${list.kind === "sort" ? "sort" : value} stays applied after a page refresh / in the URL.`,
            "No unrelated records appear.",
          ],
          tags: list.kind === "sort" || list.kind === "filter" ? ["positive", "pagination"] : ["positive"],
          essential: true,
        });
        break;
      }
      default:
        out.push({
          title: `Verify '${value}' is accepted as the ${list.subject}`,
          category: "Functional",
          type: "Positive",
          priority: "P2",
          automation: true,
          steps: [...ctx.open, "Fill all required fields with valid data (see test data).", `Select '${value}' as the ${list.subject}.`, `Click ${submit}.`, ...verifySteps(ctx)],
          data: [`${cap(list.subject)}: ${value}`],
          expected: succeeded(ctx, `'${value}' is accepted.`, ctx.msg(["success", "saved"], "Saved successfully"), `After a refresh the ${list.subject} still shows '${value}'.`),
          tags: ["positive", "equivalence"],
          essential: true,
        });
    }
  }

  // Disallowed / invalid values.
  if (list.kind === "format") {
    const allowed = new Set(list.values.map((v) => v.toUpperCase()));
    for (const [label, formats] of DISALLOWED_FILES) {
      const bad = formats.filter((f) => !allowed.has(f)).slice(0, 4);
      if (!bad.length) continue;
      out.push({
        title: `Verify ${label} (${bad.join(", ")}) are rejected`,
        category: label.startsWith("exec") ? "Security" : "Validation",
        type: "Negative",
        priority: label.startsWith("exec") ? "P1" : "P2",
        automation: true,
        steps: uploadSteps(ctx, `each file from the test data, one at a time`),
        data: bad.map((f, i) => `File ${i + 1}: ${fileName(ctx, "", f)} (${f}, 500 KB)`),
        expected: rejected(ctx, ctx.msg(["format", "type"], `Only ${list.values.join(", ")} files are allowed.`), ["No file is stored on the server for any of the attempts."]),
        tags: ["negative", label.startsWith("exec") ? "security" : "validation"],
      });
    }
    out.push({
      title: "Verify file extension validation is case-insensitive",
      category: "Validation",
      type: "Positive",
      priority: "P3",
      automation: true,
      steps: uploadSteps(ctx, "each file from the test data, one at a time"),
      data: list.values.slice(0, 4).map((v, i) => `File ${i + 1}: ${["SAMPLE", "Sample", "sample", "SaMpLe"][i]}.${i % 2 ? v.toLowerCase().replace(/^(.)/, (c) => c.toUpperCase()) : v.toUpperCase()} (300 KB)`),
      expected: succeeded(ctx, "Every file is accepted regardless of the extension's letter case.", ctx.msg(["upload", "success"], `${cap(req.entity)} uploaded successfully`), "Each uploaded file keeps its original name and is still listed after a refresh."),
      tags: ["positive", "edge"],
    });
  } else if (list.kind === "method" || list.kind === "option" || list.kind === "sort") {
    const fake = list.kind === "sort" ? "price_desc" : list.kind === "method" ? (req.features.payment ? "NETBANKING" : "SSO") : "INVALID_OPTION";
    out.push({
      title: `Verify an unsupported ${list.subject} ('${fake}') is rejected`,
      category: list.kind === "sort" ? "Validation" : "Security",
      type: "Negative",
      priority: list.kind === "sort" ? "P3" : "P2",
      automation: true,
      steps: [
        ...ctx.open,
        "Open the browser developer tools (or an API client).",
        `Change the ${list.subject} value sent with the request to '${fake}'.`,
        `Submit the request${list.kind === "sort" ? " / reload the URL" : ""}.`,
        `Observe the response and the ${ctx.area}.`,
        "Refresh the page and re-check the data.",
      ],
      data: [`${cap(list.subject)} (tampered): ${fake}`, `Allowed values: ${list.values.join(", ")}`],
      expected:
        list.kind === "sort"
          ? ["The server ignores the unknown sort and returns the default order, or returns 400 with a clear message.", "No server error (500) or stack trace is shown.", "The page still renders normally.", "Only allowed sort options are offered in the UI."]
          : rejected(ctx, ctx.msg(["not supported", "invalid"], `This ${list.subject} is not supported.`), [], true),
      tags: ["negative", list.kind === "sort" ? "validation" : "security"],
    });
    if (list.kind === "method") {
      out.push({
        title: `Verify the ${req.features.payment ? "payment" : "action"} cannot be submitted without selecting a ${list.subject}`,
        category: "Validation",
        type: "Negative",
        priority: "P2",
        automation: true,
        state: req.features.payment ? `An unpaid test ${req.entity} exists.` : undefined,
        steps: [...ctx.open, req.features.payment ? `Open the test ${req.entity} and click ${submit}.` : "Open the form.", `Leave the ${list.subject} unselected.`, "Fill every other field with valid data.", "Click 'Confirm'.", ...verifySteps(ctx)],
        data: [`${cap(list.subject)}: (none selected)`],
        expected: rejected(ctx, ctx.msg(["select", "choose"], `Please select a ${list.subject}.`)),
        tags: ["negative", "validation"],
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- limits

type Point = { value: number; label: string; ok: boolean; priority: "P1" | "P2" | "P3"; extra?: string };

function points(l: Limit): Point[] {
  const pts: Point[] = [];
  const { min, max } = l;
  if (min !== undefined && max !== undefined && min === max) {
    return [
      { value: min, label: `exactly ${min}`, ok: true, priority: "P1" },
      { value: min - 1, label: `${min - 1} (one fewer)`, ok: false, priority: "P1" },
      { value: min + 1, label: `${min + 1} (one more)`, ok: false, priority: "P1" },
    ];
  }
  if (max !== undefined) {
    pts.push({ value: max, label: `exactly ${max} (upper boundary)`, ok: true, priority: "P1" });
    pts.push({ value: max - 1, label: `${max - 1} (max − 1)`, ok: true, priority: "P2" });
    pts.push({ value: max + 1, label: `${max + 1} (max + 1)`, ok: false, priority: "P1" });
  }
  if (min !== undefined) {
    pts.push({ value: min, label: `exactly ${min} (lower boundary)`, ok: true, priority: "P1" });
    pts.push({ value: min - 1, label: `${min - 1} (min − 1)`, ok: false, priority: "P1" });
    pts.push({ value: min + 1, label: `${min + 1} (min + 1)`, ok: true, priority: "P3" });
  }
  return pts;
}

const repeat = (n: number) => (n <= 0 ? "(empty)" : `${n} characters ('A' × ${n})`);

function dobForAge(years: number, dayOffset = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function limitCases(ctx: Ctx, l: Limit): Draft[] {
  const { req } = ctx;
  const submit = submitButton(ctx);
  const field = cap(l.subject);
  const out: Draft[] = [];
  const formSteps = (entry: string) => [...ctx.open, "Fill all other required fields with valid data (see test data).", entry, `Click ${submit}.`, ...verifySteps(ctx)];

  switch (l.kind) {
    case "size": {
      const fmtName = fileFormat(ctx);
      const max = l.max ?? l.min!;
      const pts: [number, string, boolean, "P1" | "P2" | "P3", string][] = [
        [max, `a file of exactly ${describeBytes(max)} (upper boundary)`, true, "P1", "_max_exact"],
        [max - 1, `a file just below ${describeBytes(max)} (max − 1 byte)`, true, "P2", "_max_minus1"],
        [max + 1, `a file just above ${describeBytes(max)} (max + 1 byte)`, false, "P1", "_max_plus1"],
        [max * 3, `a file well above ${describeBytes(max)} (${describeBytes(max * 3)})`, false, "P2", "_large"],
        [1024, "a very small valid file (1 KB, lower boundary)", true, "P3", "_tiny"],
        [0, "an empty file (0 bytes)", false, "P2", "_empty"],
      ];
      for (const [bytes, label, ok, priority, suffix] of pts) {
        const name = fileName(ctx, suffix, fmtName);
        out.push({
          title: `Verify ${label} is ${ok ? "accepted" : "rejected"}`,
          category: "Boundary Value",
          type: ok ? "Positive" : "Negative",
          priority,
          automation: true,
          state: `The ${req.entity} has no file attached yet.`,
          pre: bytes > 0 ? [`File size verified as ${fmt(bytes)} bytes.`] : [],
          steps: uploadSteps(ctx, `the ${fmtName} file of ${fmt(bytes)} bytes`),
          data: [`File name: ${name}`, `Format: ${fmtName}`, `Size: ${fmt(bytes)} bytes${bytes === max + 1 ? ` (${describeBytes(max)} + 1 byte)` : bytes === max - 1 ? ` (${describeBytes(max)} − 1 byte)` : bytes === max ? ` (exactly ${describeBytes(max)})` : ""}`],
          expected: ok
            ? succeeded(ctx, "The upload completes without a size error.", ctx.msg(["upload", "success"], `${cap(req.entity)} uploaded successfully`), `The ${ctx.area} shows '${name}' with its size; it is still there after a refresh.`)
            : rejected(ctx, ctx.msg(["size", "large", "empty"], bytes === 0 ? "The selected file is empty." : `File size exceeds the maximum limit of ${describeBytes(max)}.`), ["No file is stored on the server and no orphan file is left in storage."]),
          tags: ["boundary", ok ? "positive" : "negative"],
          essential: Math.abs(bytes - max) <= 1,
        });
      }
      ctx.assume(`${describeBytes(max)} is treated as ${fmt(max)} bytes (binary units) and the limit is inclusive.`);
      return out;
    }
    case "length":
    case "digits": {
      const isDigits = l.kind === "digits";
      for (const p of points(l)) {
        const value = isDigits ? "98765432109876".slice(0, Math.max(0, p.value)) : repeat(p.value);
        const note = p.label.replace(/^(?:exactly )?-?\d+\s*/, "");
        out.push({
          title: `Verify ${field} with ${p.value} ${isDigits ? "digits" : "characters"}${note ? ` ${note}` : ""} is ${p.ok ? "accepted" : "rejected"}`,
          category: "Boundary Value",
          type: p.ok ? "Positive" : "Negative",
          priority: p.priority,
          automation: true,
          base: req.features.auth && /password/i.test(field) ? "auth" : "app",
          steps: formSteps(`Enter ${isDigits ? `a ${p.value}-digit number` : `a ${p.value}-character value`} in the '${field}' field.`),
          data: [`${field}: ${isDigits ? value || "(empty)" : value}`, `Length: ${p.value} ${isDigits ? "digits" : "characters"}`, `Rule: ${l.min !== undefined && l.max !== undefined ? (l.min === l.max ? `exactly ${l.min}` : `${l.min}–${l.max}`) : l.max !== undefined ? `max ${l.max}` : `min ${l.min}`} ${isDigits ? "digits" : "characters"}`],
          expected: p.ok
            ? succeeded(ctx, `The ${field} value is accepted without a length error.`, ctx.msg(["success", "saved", "welcome"], req.features.auth ? "Signed in successfully" : "Saved successfully"), `After a refresh the saved ${field} shows all ${p.value} ${isDigits ? "digits" : "characters"} (not truncated).`)
            : rejected(ctx, ctx.msg(["length", "characters", "digits"], isDigits ? `${field} must be exactly ${l.min} digits.` : l.max !== undefined && p.value > l.max ? `${field} must be at most ${l.max} characters.` : `${field} must be at least ${l.min} characters.`)),
          tags: ["boundary", p.ok ? "positive" : "negative", "validation"],
          essential: true,
        });
      }
      if (!isDigits && l.max !== undefined) {
        const far = Math.max(l.max * 5, 255);
        out.push({
          title: `Verify ${field} far beyond the limit (${far} characters) is rejected or blocked`,
          category: "Boundary Value",
          type: "Negative",
          priority: "P3",
          automation: true,
          steps: formSteps(`Paste a ${far}-character value into the '${field}' field.`),
          data: [`${field}: ${repeat(far)}`],
          expected: rejected(ctx, ctx.msg(["length", "characters"], `${field} must be at most ${l.max} characters.`), ["The field stops accepting input at the limit, or the server rejects the value."]),
          tags: ["boundary", "negative"],
        });
      }
      return out;
    }
    case "attempts": {
      const n = l.max!;
      const minutes = req.lockout?.minutes;
      out.push({
        title: `Verify login still works after ${n - 1} failed attempts (one below the lockout limit)`,
        category: "Boundary Value",
        type: "Positive",
        priority: "P1",
        automation: true,
        base: "auth",
        state: `The account has ${n - 1} failed login attempts recorded.`,
        steps: [...ctx.open, "Enter the registered email in the 'Email' field.", "Enter the correct password in the 'Password' field.", `Click ${submit}.`, "Observe the result.", "Log out and check the failed-attempt counter (DB / admin view)."],
        data: ["Email: qa.user01@example.com", "Password: Valid@1234 (correct)", `Failed attempts before this test: ${n - 1}`],
        expected: ["The login succeeds and the user lands on the home page.", "No lockout message is shown.", "The failed-attempt counter is reset to 0.", "A later wrong password starts counting from 1 again."],
        tags: ["boundary", "positive", "security"],
        essential: true,
      });
      out.push({
        title: `Verify the account is locked after ${n} consecutive failed attempts`,
        category: "Boundary Value",
        type: "Negative",
        priority: "P1",
        automation: true,
        base: "auth",
        state: `The account has ${n - 1} failed login attempts recorded.`,
        steps: [...ctx.open, "Enter the registered email in the 'Email' field.", "Enter a wrong password in the 'Password' field.", `Click ${submit} (attempt ${n}).`, "Now enter the correct password and click it again.", "Observe the messages after each attempt."],
        data: ["Email: qa.user01@example.com", `Password: Wrong@123 (attempt ${n})`, "Then: Valid@1234 (correct)"],
        expected: [
          `After attempt ${n} a message is shown: ${ctx.msg(["lock"], `Your account is locked${minutes ? ` for ${minutes} minutes` : ""}.`)}.`,
          "The correct password is also rejected while the account is locked.",
          "The user stays on the login page; no session is created.",
          "The lockout is recorded in the audit / security log with the time.",
          "The message doesn't reveal whether the email or the password was wrong.",
        ],
        tags: ["boundary", "negative", "security"],
        essential: true,
      });
      out.push({
        title: `Verify further attempts (attempt ${n + 1}) while locked keep the account locked`,
        category: "Security",
        type: "Negative",
        priority: "P2",
        automation: true,
        base: "auth",
        state: `The account was locked after ${n} failed attempts${minutes ? ` less than ${minutes} minutes ago` : ""}.`,
        steps: [...ctx.open, "Enter the registered email.", "Enter a wrong password.", `Click ${submit} (attempt ${n + 1}).`, "Repeat with the correct password.", "Check the lockout end time (DB / admin view)."],
        data: ["Email: qa.user01@example.com", `Password: Wrong@123 (attempt ${n + 1}), then Valid@1234`],
        expected: ["Both attempts are rejected with the lockout message.", minutes ? `The lockout period is not extended beyond ${minutes} minutes from the original lock (or is extended, as the requirement says — confirm).` : "The lock remains in place.", "No session is created.", "Each attempt is logged."],
        tags: ["boundary", "negative", "security"],
        essential: true,
      });
      return out;
    }
    case "duration": {
      const m = l.max!;
      const unit = l.unit;
      out.push({
        title: `Verify the account is still locked ${m - 1} ${unit} after lockout`,
        category: "Boundary Value",
        type: "Negative",
        priority: "P2",
        automation: false,
        base: "auth",
        state: `The account was locked ${m - 1} ${unit} ago.`,
        steps: [...ctx.open, "Enter the registered email.", "Enter the correct password.", `Click ${submit}.`, "Observe the message.", "Check the lockout end time (DB / admin view)."],
        data: ["Email: qa.user01@example.com", "Password: Valid@1234 (correct)", `Time since lockout: ${m - 1} ${unit}`],
        expected: ["The login is rejected with the lockout message.", "The remaining lock time (if shown) is about 1 " + unit.replace(/s$/, "") + ".", "No session is created.", "The attempt is logged."],
        tags: ["boundary", "negative"],
        essential: true,
      });
      out.push({
        title: `Verify login works again after exactly ${m} ${unit} (and at ${m + 1} ${unit})`,
        category: "Boundary Value",
        type: "Positive",
        priority: "P1",
        automation: false,
        base: "auth",
        state: `The account was locked exactly ${m} ${unit} ago.`,
        steps: [...ctx.open, "Enter the registered email.", "Enter the correct password.", `Click ${submit}.`, "Observe the result.", `Repeat on a second locked test account at ${m + 1} ${unit}.`],
        data: ["Email: qa.user01@example.com / qa.user02@example.com", "Password: Valid@1234 (correct)", `Time since lockout: ${m} ${unit} and ${m + 1} ${unit}`],
        expected: ["The login succeeds at both times.", "The failed-attempt counter is reset.", "No lockout message is shown.", "The unlock is recorded in the audit log."],
        tags: ["boundary", "positive"],
        essential: true,
      });
      ctx.assume(`The ${m}-${unit.replace(/s$/, "")} lockout is measured from the last failed attempt and the account unlocks automatically.`);
      return out;
    }
    case "amount": {
      const fmtA = (n: number) => fmtAmount(n, l.unit);
      const pts: [number, string, boolean, "P1" | "P2" | "P3"][] = [];
      if (l.min !== undefined) pts.push([l.min, `the minimum amount ${fmtA(l.min)}`, true, "P1"], [l.min - 1, `an amount of ${fmtA(l.min - 1)} (min − 1)`, false, "P1"]);
      if (l.max !== undefined) pts.push([l.max, `the maximum amount ${fmtA(l.max)}`, true, "P1"], [l.max + 1, `an amount of ${fmtA(l.max + 1)} (max + 1)`, false, "P1"]);
      if (l.min !== undefined && l.max !== undefined) pts.push([l.min + 1, `amounts of ${fmtA(l.min + 1)} and ${fmtA(l.max - 1)} (just inside both limits)`, true, "P2"]);
      pts.push([-1, `a negative amount (${fmtA(-1)})`, false, "P2"]);
      for (const [value, label, ok, priority] of pts) {
        const both = label.includes("both limits");
        out.push({
          title: `Verify ${label} ${label.startsWith("amounts") ? "are" : "is"} ${ok ? "accepted" : "rejected"}`,
          category: "Boundary Value",
          type: ok ? "Positive" : "Negative",
          priority,
          automation: true,
          state: req.features.payment ? `An unpaid test ${req.entity} exists for the amount being tested.` : undefined,
          steps: [...ctx.open, req.features.payment ? `Open the test ${req.entity} and click ${submit}.` : "Open the form.", `Enter ${both ? "each amount from the test data" : fmtA(value < 0 ? -1 : value)} in the 'Amount' field.`, req.features.payment ? "Select a payment method and enter valid test details." : "Fill all other required fields.", "Confirm.", ...verifySteps(ctx)],
          data: [both ? `Amounts: ${fmtA(l.min! + 1)} and ${fmtA(l.max! - 1)}` : `Amount: ${fmtA(value < 0 ? -1 : value)}`, `Allowed: ${fmtA(l.min ?? 0)} to ${fmtA(l.max ?? 0)}`, ...(req.features.payment ? ["Method: Card 4111 1111 1111 1111 (test)"] : [])],
          expected: ok
            ? succeeded(ctx, "The amount is accepted and the payment is processed.", ctx.msg(["success", "paid"], "Payment successful"), `The ${req.entity} shows the exact amount paid, also after a refresh.`)
            : rejected(ctx, ctx.msg(["amount"], `Enter an amount between ${fmtA(l.min ?? 0)} and ${fmtA(l.max ?? 0)}.`), ["No charge is made and no payment record is created."]),
          tags: ["boundary", ok ? "positive" : "negative"],
          essential: !label.includes("negative"),
        });
      }
      ctx.assume(`Amount limits ${fmtA(l.min ?? 0)}–${fmtA(l.max ?? 0)} are inclusive; decimals (paise / cents) are allowed up to 2 places.`);
      return out;
    }
    case "age": {
      const a = l.min!;
      const rows: [string, string, boolean, "P1" | "P2" | "P3", string][] = [
        [`exactly ${a} years old today`, dobForAge(a), true, "P1", `${a} years`],
        [`one day short of ${a} (${a - 1} years)`, dobForAge(a, 1), false, "P1", `${a - 1} years 364 days`],
        [`${a + 1} years old (min + 1)`, dobForAge(a + 1), true, "P3", `${a + 1} years`],
      ];
      for (const [label, dob, ok, priority, age] of rows) {
        out.push({
          title: `Verify a ${field} for someone ${label} is ${ok ? "accepted" : "rejected"}`,
          category: "Boundary Value",
          type: ok ? "Positive" : "Negative",
          priority,
          automation: true,
          steps: formSteps(`Enter ${dob} in the '${field}' field (DD/MM/YYYY).`),
          data: [`${field}: ${dob}`, `Age on the test date: ${age}`, `Rule: minimum age ${a} years`],
          expected: ok
            ? succeeded(ctx, "The date is accepted without an age error.", ctx.msg(["success", "registered"], "Registration successful"), `After a refresh the saved ${field} shows ${dob}.`)
            : rejected(ctx, ctx.msg(["age", "18"], `You must be at least ${a} years old.`)),
          tags: ["boundary", ok ? "positive" : "negative", "validation"],
          essential: true,
        });
      }
      ctx.assume(`Age is calculated on the server from the ${field} and today's date; someone becomes ${a} on their birthday.`);
      return out;
    }
    case "range": {
      const unit = l.unit;
      for (const p of points(l)) {
        out.push({
          title: `Verify ${l.subject} ${p.ok ? "of" : "value"} ${plural(p.value, unit)} ${p.label.includes("boundary") ? "(boundary) " : ""}is ${p.ok ? "accepted" : "rejected"}`,
          category: "Boundary Value",
          type: p.ok ? "Positive" : "Negative",
          priority: p.priority,
          automation: true,
          state: req.features.search ? `Test ${req.entity}s exist with ${l.subject} values ${l.min} to ${l.max} ${unit}.` : undefined,
          steps: [...ctx.open, `Set the '${cap(l.subject)}' ${req.features.search ? "filter" : "field"} to ${plural(p.value, unit)}.`, `Click ${submit}.`, "Check the value shown in the control.", ...verifySteps(ctx, req.features.search ? "the results list" : "the on-screen message")],
          data: [`${cap(l.subject)}: ${plural(p.value, unit)}`, `Allowed range: ${l.min}–${l.max} ${unit}`],
          expected: p.ok
            ? [`The value ${p.value} is accepted.`, req.features.search ? `Only ${req.entity}s with ${l.subject} matching ${plural(p.value, unit)} are listed.` : "The value is saved.", "The control keeps the value after a refresh.", "No validation error is shown."]
            : rejected(ctx, ctx.msg(["range", l.subject], `${cap(l.subject)} must be between ${l.min} and ${l.max} ${unit}.`)),
          tags: ["boundary", p.ok ? "positive" : "negative"],
          essential: true,
        });
      }
      return out;
    }
    case "perPage": {
      const n = l.max!;
      for (const [count, label, pages] of [
        [n - 1, `${n - 1} matching results (one less than a page)`, "1 page, no pagination controls"],
        [n, `exactly ${n} matching results (one full page)`, "1 page"],
        [n + 1, `${n + 1} matching results (one more than a page)`, `2 pages; page 2 shows 1 result`],
      ] as [number, string, string][]) {
        out.push({
          title: `Verify pagination with ${label}`,
          category: "Boundary Value",
          type: "Positive",
          priority: count === n + 1 ? "P1" : "P2",
          automation: true,
          state: `Exactly ${count} test ${req.entity}s match the search term in the test data.`,
          steps: [...ctx.open, "Enter the search term from the test data.", `Click ${submit}.`, "Count the results on page 1.", "Use the pagination controls (if shown) to go to the last page.", "Refresh the page and re-check the result count."],
          data: [`Search term: matches exactly ${count} records`, `Page size: ${n} results per page`],
          expected: [`Page 1 shows ${Math.min(count, n)} results.`, `Pagination: ${pages}.`, `The total result count shows ${count}.`, "No result is duplicated or missing across pages."],
          tags: ["boundary", "pagination"],
          essential: true,
        });
      }
      return out;
    }
    case "count": {
      for (const p of points(l).filter((x) => x.value >= 0)) {
        out.push({
          title: `Verify adding ${p.value} ${l.unit} (${p.label}) is ${p.ok ? "allowed" : "blocked"}`,
          category: "Boundary Value",
          type: p.ok ? "Positive" : "Negative",
          priority: p.priority,
          automation: true,
          steps: [...ctx.open, `Add ${p.value} ${l.unit} one after another.`, `Click ${submit}.`, "Check the count shown.", ...verifySteps(ctx)],
          data: [`${cap(l.unit)}: ${p.value}`, `Limit: ${l.max} ${l.unit}`],
          expected: p.ok ? succeeded(ctx, `All ${p.value} ${l.unit} are added.`, ctx.msg(["success", "added"], "Added successfully"), `${p.value} ${l.unit} are still listed after a refresh.`) : rejected(ctx, ctx.msg(["limit", "maximum"], `You can add up to ${l.max} ${l.unit}.`)),
          tags: ["boundary", p.ok ? "positive" : "negative"],
          essential: true,
        });
      }
      return out;
    }
  }
  return out;
}
