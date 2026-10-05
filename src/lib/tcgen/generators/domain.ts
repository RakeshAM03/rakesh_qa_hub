/** CRUD lifecycle, search / filter / list, workflow & business rules, and role generators. */

import { fmtAmount } from "../requirement";
import { cap, rejected, succeeded, verifySteps, type Ctx, type Draft } from "./common";
import { submitButton } from "./values-limits";

const SAMPLE_VALUE: Record<string, string> = { email: "qa.user01@example.com", password: "Valid@1234", phone: "9876543210", date: "15/08/1995", number: "12", url: "https://example.com", text: "Asha Rao", amount: "500.00", otp: "123456" };

// ---------------------------------------------------------------- CRUD lifecycle

export function crudCases(ctx: Ctx): Draft[] {
  const { req } = ctx;
  if (!(req.features.form || req.features.crud) || req.features.api && !req.features.form) return [];
  const submit = submitButton(ctx);
  const E = req.entity;
  const data = req.fields.length ? req.fields.map((f) => `${f.name}: ${SAMPLE_VALUE[f.type]}`) : [`${cap(E)} details: valid values for every field`];
  const out: Draft[] = [
    {
      title: `Verify a new ${E} is created when all fields are valid`,
      category: "Functional",
      type: "Positive",
      priority: "P1",
      automation: true,
      steps: [...ctx.open, ...req.fields.slice(0, 4).map((f) => `Enter the ${f.name} from the test data in the '${f.name}' field.`), ...(req.fields.length ? [] : ["Fill every field with the valid values from the test data."]), `Click ${submit}.`, ...verifySteps(ctx)],
      data,
      expected: succeeded(ctx, `The ${E} is created without errors.`, ctx.msg(["success", "registered", "created"], `${cap(E)} created successfully`), `The new ${E} appears wherever it is listed, with exactly the entered values, also after a refresh.`, ["A confirmation (e.g. email or notification) is sent if the requirement says so."]),
      tags: ["positive", "workflow"],
      essential: true,
    },
    {
      title: `Verify cancelling the ${E} form part-way saves nothing`,
      category: "Functional",
      type: "Negative",
      priority: "P3",
      automation: true,
      steps: [...ctx.open, "Fill half of the fields with the test data.", `Click ${ctx.button(["cancel", "back"], "Cancel button")} (or close the form).`, "Confirm leaving if a 'discard changes' prompt appears.", ...verifySteps(ctx, "the list")],
      data,
      expected: [`No ${E} is created.`, "A 'discard unsaved changes?' prompt appears before leaving (if designed).", "The list is unchanged after a refresh.", "Re-opening the form shows empty fields (no stale draft, unless drafts are a feature)."],
      tags: ["negative", "workflow"],
    },
    {
      title: `Verify creating the ${E} is recorded in the activity / audit log`,
      category: "Data Integrity",
      type: "Positive",
      priority: "P3",
      automation: false,
      steps: [...ctx.open, "Create a valid record with the test data.", "Open the activity / audit log (admin view or DB).", "Find the entry for the new record.", "Check who, what and when is recorded."],
      data,
      expected: ["An audit entry exists for the creation.", "It records the acting user, the time (with time zone) and the record ID.", "Sensitive values (passwords, full card numbers) are not stored in the log.", "Audit entries cannot be edited by normal users."],
      tags: ["regression"],
    },
  ];
  if (/edit|update/i.test(req.text)) {
    out.push({
      title: `Verify an existing ${E} can be edited and the change persists`,
      category: "Functional",
      type: "Positive",
      priority: "P2",
      automation: true,
      state: `A ${E} created with the test data exists.`,
      steps: [...ctx.open, `Open the existing ${E}.`, `Click ${ctx.button(["edit"], "Edit button")}.`, "Change one field to a new valid value.", `Click ${ctx.button(["save", "update"], "Save button")}.`, ...verifySteps(ctx)],
      data: [...data, "New value: a different valid value for one field"],
      expected: succeeded(ctx, "The change is saved.", ctx.msg(["updated", "saved"], `${cap(E)} updated successfully`), "After a refresh the new value is shown everywhere the record appears."),
      tags: ["positive", "workflow"],
    });
  }
  if (/delete|remove/i.test(req.text)) {
    out.push({
      title: `Verify a ${E} can be deleted after confirmation`,
      category: "Functional",
      type: "Positive",
      priority: "P2",
      automation: true,
      state: `A ${E} created with the test data exists.`,
      steps: [...ctx.open, `Open the existing ${E}.`, `Click ${ctx.button(["delete", "remove"], "Delete button")}.`, "Confirm in the dialog.", ...verifySteps(ctx, "the list")],
      data,
      expected: succeeded(ctx, "The record is removed from the list.", ctx.msg(["deleted", "removed"], `${cap(E)} deleted`), "After a refresh it is still gone and its URL shows 'not found'.", ["Cancelling the dialog keeps the record."]),
      tags: ["positive", "workflow"],
    });
  }
  return out;
}

// ---------------------------------------------------------------- search / filter / list

export function searchCases(ctx: Ctx): Draft[] {
  const { req } = ctx;
  if (!req.features.search) return [];
  const submit = submitButton(ctx);
  const E = req.entity;
  const searchBy = req.lists.find((l) => l.kind === "search")?.values ?? ["keyword"];
  const filters = req.lists.find((l) => l.kind === "filter")?.values ?? [];
  const out: Draft[] = [
    {
      title: `Verify a search with no matching ${E}s shows a clear empty state`,
      category: "Functional",
      type: "Negative",
      priority: "P2",
      automation: true,
      steps: [...ctx.open, `Enter the search term from the test data (search by ${searchBy[0]}).`, `Click ${submit}.`, "Observe the results area.", "Clear the search box.", "Refresh the page."],
      data: [`Search term: zzqx-no-match-2026`, "Expected matches: 0"],
      expected: [`A friendly message is shown: ${ctx.msg(["no result", "not found"], `No ${E}s match your search.`)}.`, "No error or broken layout is shown.", "Clearing the search shows the full list again.", "The empty state offers a way to reset filters."],
      tags: ["negative", "usability"],
    },
    {
      title: `Verify partial and case-insensitive search matches the right ${E}s`,
      category: "Functional",
      type: "Positive",
      priority: "P2",
      automation: true,
      state: `A ${E} with ${searchBy[0]} 'Priyanka Sharma' exists among the test data.`,
      steps: [...ctx.open, "Enter 'priy' in the search box.", `Click ${submit}.`, "Repeat with 'SHARMA'.", "Repeat with '  Priyanka  ' (spaces around).", "Compare the results."],
      data: [`Searches: 'priy', 'SHARMA', '  Priyanka  '`, `Record: ${cap(searchBy[0])} = Priyanka Sharma`],
      expected: ["All three searches return the record.", "Matching is case-insensitive and ignores surrounding spaces.", "Results unrelated to the term are not shown.", "The search term stays in the box after a refresh."],
      tags: ["positive", "equivalence"],
    },
    {
      title: "Verify special characters in the search are handled safely",
      category: "Security",
      type: "Negative",
      priority: "P2",
      automation: true,
      steps: [...ctx.open, "Enter each value from the test data in the search box, one at a time.", `Click ${submit}.`, "Observe the results and the page.", "Check the browser console for errors.", "Refresh the page."],
      data: ["1. % _ (SQL wildcards)", "2. ' OR '1'='1", "3. <script>alert(1)</script>", "4. A 500-character string"],
      expected: ["Each value is treated as plain text (wildcards don't match everything).", "No script runs and no database error is shown.", "The page stays responsive.", "Long input is rejected or trimmed safely."],
      tags: ["negative", "security"],
    },
  ];
  if (filters.length >= 2 || (filters.length && searchBy.length)) {
    out.push({
      title: `Verify combining ${[searchBy[0], ...filters].slice(0, 3).join(", ")} returns only ${E}s matching all criteria`,
      category: "Functional",
      type: "Positive",
      priority: "P1",
      automation: true,
      state: `Test ${E}s exist that match each criterion separately and exactly 2 that match all of them.`,
      steps: [...ctx.open, `Enter the ${searchBy[0]} from the test data.`, ...filters.map((f) => `Set the '${cap(f)}' filter to the value from the test data.`), `Click ${submit}.`, "Check every result against all the criteria.", "Refresh the page and re-check the results and filters."],
      data: [`${cap(searchBy[0])}: Java`, ...filters.map((f) => `${cap(f)}: ${/location/i.test(f) ? "Bengaluru" : /experience/i.test(f) ? "5 years" : "a valid value"}`), "Expected matches: 2"],
      expected: ["Exactly the 2 records matching all criteria are shown.", "The result count shows 2.", "The filters stay applied after a refresh / in the URL.", "Removing one filter widens the results accordingly."],
      tags: ["positive", "pagination"],
      essential: true,
    });
    out.push({
      title: "Verify 'Clear filters' resets the search and filters",
      category: "UI",
      type: "Positive",
      priority: "P3",
      automation: true,
      state: "A search term and filters are applied.",
      steps: [...ctx.open, "Apply the search and filters from the test data.", `Click ${ctx.button(["clear", "reset"], "Clear filters button")}.`, "Observe the results and the filter controls.", "Refresh the page.", "Check the URL query string."],
      data: [`${cap(searchBy[0])}: Java`, ...filters.map((f) => `${cap(f)}: any value`)],
      expected: ["All filters and the search box are cleared.", "The full, unfiltered list is shown.", "The cleared state remains after a refresh.", "The URL no longer contains filter parameters."],
      tags: ["positive", "usability"],
    });
  }
  return out;
}

// ---------------------------------------------------------------- workflow / business rules

export function workflowCases(ctx: Ctx): Draft[] {
  const { req } = ctx;
  const submit = submitButton(ctx);
  const out: Draft[] = [];
  const E = req.entity;
  const amount = req.limits.find((l) => l.kind === "amount");
  const amt = amount ? fmtAmount(Math.min(500, amount.max ?? 500), amount.unit) : "";

  if (req.duplicate) {
    const { subject, scope } = req.duplicate;
    const target = scope || E;
    out.push(
      {
        title: `Verify a second ${subject} for the same ${target} is blocked`,
        category: "Functional",
        type: "Negative",
        priority: "P1",
        automation: true,
        state: `The test ${target} already has a successful ${subject}.`,
        steps: [...ctx.open, `Open the same ${target} again.`, `Start a new ${subject} (click ${submit}).`, "Enter valid details from the test data.", "Confirm.", ...verifySteps(ctx)],
        data: [`${cap(target)}: INV-2026-0001 (already paid)`, ...(amt ? [`Amount: ${amt}`] : []), "Method: Card 4111 1111 1111 1111 (test)"],
        expected: rejected(ctx, ctx.msg(["already", "duplicate"], `This ${target} has already been paid.`), [`No second ${subject} record or charge is created (check the gateway / DB).`], true),
        tags: ["negative", "workflow"],
        essential: true,
      },
      {
        title: `Verify double-clicking confirm or two tabs cannot create a duplicate ${subject}`,
        category: "Data Integrity",
        type: "Negative",
        priority: "P1",
        automation: false,
        state: `An unpaid test ${target} exists.`,
        steps: [...ctx.open, `Open the same ${target} in two browser tabs.`, `Start the ${subject} in both tabs with the test data.`, "Click confirm in both tabs at the same time (or double-click confirm in one).", "Wait for both responses.", `Check the ${target}'s ${subject} history (UI and DB).`],
        data: [`${cap(target)}: INV-2026-0002 (unpaid)`, ...(amt ? [`Amount: ${amt}`] : [])],
        expected: [`Exactly one ${subject} succeeds.`, `The other attempt is rejected with ${ctx.msg(["already", "duplicate", "progress"], `A ${subject} is already in progress for this ${target}.`)}.`, `Only one charge / record exists for the ${target}.`, "The confirm button is disabled while the first request is processing."],
        tags: ["negative", "idempotency", "reliability"],
        essential: true,
      },
      {
        title: `Verify a ${subject} for a different ${target} is still allowed`,
        category: "Functional",
        type: "Positive",
        priority: "P2",
        automation: true,
        state: `${cap(target)} A is already paid; ${target} B is unpaid.`,
        steps: [...ctx.open, `Open ${target} B.`, `Click ${submit}.`, "Enter valid details from the test data.", "Confirm.", ...verifySteps(ctx)],
        data: [`${cap(target)}: INV-2026-0003 (unpaid)`, ...(amt ? [`Amount: ${amt}`] : [])],
        expected: succeeded(ctx, `The ${subject} is processed.`, ctx.msg(["success"], `${cap(subject)} successful`), `${cap(target)} B shows the ${subject} after a refresh; ${target} A is unchanged.`),
        tags: ["positive", "workflow"],
      },
    );
  }

  if (req.features.payment) {
    out.push({
      title: "Verify a declined or failed transaction leaves the invoice unpaid and allows a retry",
      category: "Reliability",
      type: "Negative",
      priority: "P1",
      automation: true,
      state: `An unpaid test ${E} exists.`,
      steps: [...ctx.open, `Open the test ${E} and click ${submit}.`, "Pay with the declined test card from the test data.", "Observe the message.", "Retry with the valid test card.", "Refresh and check the status and payment history."],
      data: ["Declined card: 4000 0000 0000 0002 (test)", "Valid card: 4111 1111 1111 1111 (test)", ...(amt ? [`Amount: ${amt}`] : [])],
      expected: [`The first attempt shows ${ctx.msg(["declined", "failed"], "Payment failed. Please try another method.")}.`, `The ${E} stays 'Unpaid' and no charge is recorded.`, "The retry with the valid card succeeds.", "The history shows one failed and one successful attempt."],
      tags: ["negative", "reliability", "workflow"],
    });
  }

  for (const k of req.conditions) {
    out.push(
      {
        title: `Verify that when ${k.when}, ${k.then}`,
        category: "Functional",
        type: "Positive",
        priority: "P1",
        automation: true,
        steps: [...ctx.open, `Set up the condition: ${k.when}.`, "Perform the action under test.", `Click ${submit}.`, ...verifySteps(ctx)],
        data: [`Condition: ${k.when}`, `Expected outcome: ${k.then}`],
        expected: [`Result: ${k.then}.`, "The outcome is visible in the UI.", "It is still in effect after a refresh.", "The change is recorded in the activity log."],
        tags: ["positive", "workflow"],
        essential: true,
      },
      {
        title: `Verify that when the condition '${k.when}' is not met, it does not happen (${k.then})`,
        category: "Functional",
        type: "Negative",
        priority: "P2",
        automation: true,
        steps: [...ctx.open, `Set up the opposite of: ${k.when}.`, "Perform the action under test.", `Click ${submit}.`, ...verifySteps(ctx)],
        data: [`Condition: NOT (${k.when})`],
        expected: [`The rule's outcome ("${k.then}") does not happen.`, "The normal behaviour applies.", "No error is shown.", "Nothing changes after a refresh."],
        tags: ["negative", "workflow"],
      },
    );
  }

  for (let i = 0; i + 1 < req.states.length; i++) {
    out.push({
      title: `Verify a ${E} can move from '${req.states[i]}' to '${req.states[i + 1]}'`,
      category: "Functional",
      type: "Positive",
      priority: "P1",
      automation: true,
      state: `A ${E} in status '${req.states[i]}' exists.`,
      steps: [...ctx.open, `Open the ${E} in status '${req.states[i]}'.`, `Perform the action that moves it to '${req.states[i + 1]}'.`, "Confirm if asked.", ...verifySteps(ctx)],
      data: [`From: ${req.states[i]}`, `To: ${req.states[i + 1]}`],
      expected: [`The status changes to '${req.states[i + 1]}'.`, "The new status shows in every list and detail view.", "It persists after a refresh.", "The transition is recorded in the history / audit log."],
      tags: ["positive", "workflow"],
      essential: true,
    });
  }
  if (req.states.length > 2) {
    out.push({
      title: `Verify an invalid status jump ('${req.states[0]}' → '${req.states.at(-1)}') is blocked`,
      category: "Functional",
      type: "Negative",
      priority: "P2",
      automation: true,
      state: `A ${E} in status '${req.states[0]}' exists.`,
      steps: [...ctx.open, `Open the ${E}.`, `Try to set the status directly to '${req.states.at(-1)}' (UI, or via the API if the UI hides it).`, "Confirm.", ...verifySteps(ctx)],
      data: [`From: ${req.states[0]}`, `To: ${req.states.at(-1)} (skipping steps)`],
      expected: rejected(ctx, ctx.msg(["status", "transition"], "This status change is not allowed."), [], true),
      tags: ["negative", "workflow"],
    });
  }
  return out;
}

// ---------------------------------------------------------------- roles

export function roleCases(ctx: Ctx): Draft[] {
  const { req } = ctx;
  if (req.features.api && !req.features.form && !req.features.files) return []; // API generator covers 401 / 403
  const hasRoles = req.roles.length > 0 || ctx.input.context.roles.trim() !== "";
  if (!hasRoles && req.features.auth) return [];
  const submit = submitButton(ctx);
  const E = req.entity;
  return [
    {
      title: `Verify a user without permission cannot use ${req.moduleName} in the UI`,
      category: "Security",
      type: "Negative",
      priority: "P1",
      automation: true,
      pre: [`A second test user with the ${ctx.deniedRole} role exists.`],
      steps: [`Sign in as the ${ctx.deniedRole} user.`, ...ctx.open, `Look for ${submit}.`, "Try to perform the action anyway (e.g. by opening its URL directly).", ...verifySteps(ctx)],
      data: [`User: viewer.user@example.com (${ctx.deniedRole})`],
      expected: ["The action's controls are hidden or disabled for this role.", `Opening the URL directly shows ${ctx.msg(["permission", "not allowed", "access"], "You don't have permission to do this.")}.`, "No data is changed.", "The denied attempt is logged."],
      tags: ["negative", "roles", "security"],
      essential: hasRoles,
    },
    {
      title: `Verify a user without permission is refused by the API (client checks bypassed)`,
      category: "API / Security",
      type: "Negative",
      priority: "P1",
      automation: true,
      pre: [`A valid session token for the ${ctx.deniedRole} user is available.`],
      steps: ["Open an API client (e.g. Postman).", `Copy the request the UI sends for ${req.moduleName} (browser developer tools).`, `Replay it with the ${ctx.deniedRole} user's token.`, "Observe the status code and body.", `Check that no ${E} data was changed.`],
      data: [`User token: ${ctx.deniedRole}`, "Request: the same payload the UI sends"],
      expected: ["The API returns 403 Forbidden.", "The response does not include other users' data.", "Nothing is created or changed.", "The attempt is logged."],
      tags: ["negative", "roles", "api-auth", "security"],
    },
    {
      title: `Verify one user cannot see or change another user's ${E} data`,
      category: "Security",
      type: "Negative",
      priority: "P1",
      automation: true,
      pre: ["Two users (A and B) exist, each with their own test data."],
      steps: ["Sign in as user A.", `Open one of user B's ${E} records by changing the ID in the URL.`, "Try to edit or delete it.", "Repeat through the API with user A's token.", "Check user B's record."],
      data: ["User A: qa.user01@example.com", "User B: qa.user02@example.com", `Record: user B's ${E} ID`],
      expected: ["Access is refused (403 or 404) in the UI and the API.", "No data from user B is shown.", `User B's ${E} is unchanged.`, "The attempt is logged."],
      tags: ["negative", "roles", "security"],
    },
  ];
}
