/** Auth / session generator (login, password, session, OTP). Lockout boundaries come from the limits generator. */

import { rejected, type Ctx, type Draft } from "./common";
import { submitButton } from "./values-limits";

export function authCases(ctx: Ctx, depth: "quick" | "standard" | "exhaustive"): Draft[] {
  const submit = submitButton(ctx);
  const login = (pw: string, email = "qa.user01@example.com") => [...ctx.open, `Enter '${email}' in the 'Email' field.`, `Enter '${pw}' in the 'Password' field.`, `Click ${submit}.`];
  const generic = ctx.msg(["invalid", "incorrect"], "Invalid email or password.");
  const out: Draft[] = [
    {
      title: "Verify login succeeds with a registered email and the correct password",
      category: "Functional",
      type: "Positive",
      priority: "P1",
      automation: true,
      base: "auth",
      steps: [...login("Valid@1234"), "Observe the page that opens.", "Refresh the page.", "Open a protected page directly by its URL."],
      data: ["Email: qa.user01@example.com", "Password: Valid@1234", "Account status: Active"],
      expected: ["The user is signed in and lands on the home / dashboard page.", "The user's name or avatar is shown in the header.", "After a refresh the user is still signed in (session persisted).", "Protected pages open without asking to sign in again.", "The login is recorded in the audit log with the time and IP."],
      tags: ["positive", "workflow"],
      essential: true,
    },
    {
      title: "Verify login fails with the correct email and a wrong password",
      category: "Functional",
      type: "Negative",
      priority: "P1",
      automation: true,
      base: "auth",
      steps: [...login("Wrong@123"), "Observe the message.", "Check the failed-attempt counter (DB / admin view)."],
      data: ["Email: qa.user01@example.com", "Password: Wrong@123", "Failed attempts before this test: 0"],
      expected: rejected(ctx, generic, ["The failed-attempt counter increases to 1."], false),
      tags: ["negative"],
    },
    {
      title: "Verify login fails for an email that is not registered, without revealing it",
      category: "Security",
      type: "Negative",
      priority: "P1",
      automation: true,
      base: "auth",
      state: "No account exists for the email in the test data.",
      steps: [...login("Valid@1234", "not.registered@example.com"), "Observe the message.", "Compare it with the message for a wrong password."],
      data: ["Email: not.registered@example.com", "Password: Valid@1234"],
      expected: [`The same generic message is shown: ${generic}.`, "The message does not say whether the email exists (no user enumeration).", "No session is created.", "The response time is similar to a wrong-password attempt."],
      tags: ["negative", "security"],
    },
    {
      title: "Verify logout ends the session and protected pages need a new login",
      category: "Security",
      type: "Positive",
      priority: "P1",
      automation: true,
      base: "auth",
      state: "The user is signed in.",
      steps: [...ctx.open, `Click ${ctx.button(["logout", "log out", "sign out"], "Logout button")}.`, "Press the browser Back button.", "Open a protected page directly by its URL.", "Check the session cookie in the browser developer tools."],
      data: ["Email: qa.user01@example.com", "Password: Valid@1234"],
      expected: ["The user is signed out and taken to the login page.", "Back does not show protected content (no cached pages).", "Opening a protected URL redirects to the login page.", "The session cookie / token is cleared and refused by the server."],
      tags: ["positive", "security"],
    },
    {
      title: "Verify an expired session asks the user to sign in again",
      category: "Security",
      type: "Negative",
      priority: "P2",
      automation: false,
      base: "auth",
      state: "The user is signed in and the session idle timeout is reduced for testing (or the session token is removed).",
      steps: [...login("Valid@1234"), "Wait until the session times out (or delete the session cookie).", "Try to open or save any protected page / data.", "Sign in again when asked.", "Check whether the user returns to the page they were on."],
      data: ["Email: qa.user01@example.com", "Password: Valid@1234", "Session timeout: as configured (assumed 30 minutes)"],
      expected: ["The action is not completed with an expired session.", `A message is shown: ${ctx.msg(["session", "expired"], "Your session has expired. Please sign in again.")}.`, "The user is redirected to the login page.", "After signing in the user can retry; no data is lost or half-saved."],
      tags: ["negative", "security"],
    },
    {
      title: "Verify repeated login attempts from one client are rate-limited",
      category: "Security",
      type: "Negative",
      priority: "P2",
      automation: true,
      base: "auth",
      steps: [...ctx.open, "Using a script or API client, send 20 login requests in 1 minute with different emails and wrong passwords.", "Observe the responses after the limit is reached.", "Wait for the rate-limit window to pass.", "Send one more valid login request.", "Check the security log."],
      data: ["Emails: brute01…brute20@example.com", "Password: Wrong@123", "Requests: 20 within 60 seconds"],
      expected: ["Requests beyond the limit get HTTP 429 or a CAPTCHA challenge.", "No account is locked because of other users' failed attempts.", "A valid login works again after the window.", "The burst is recorded in the security log."],
      tags: ["negative", "security", "rate-limit"],
    },
    {
      title: "Verify credentials are sent only over HTTPS and never exposed",
      category: "Security",
      type: "Positive",
      priority: "P2",
      automation: false,
      base: "auth",
      steps: [...ctx.open, "Open the browser developer tools (Network tab).", "Sign in with the test account.", "Inspect the login request URL, headers and body.", "Try opening the login page over plain http://."],
      data: ["Email: qa.user01@example.com", "Password: Valid@1234"],
      expected: ["The login request uses HTTPS.", "The password is not in the URL, query string, logs or response.", "http:// redirects to https://.", "The session cookie is Secure, HttpOnly and SameSite."],
      tags: ["security"],
    },
  ];
  if (depth !== "quick") {
    out.push({
      title: "Verify 'Remember me' keeps the user signed in after the browser is reopened",
      category: "Functional",
      type: "Positive",
      priority: "P3",
      automation: false,
      base: "auth",
      steps: [...ctx.open, "Enter valid credentials from the test data.", "Tick 'Remember me'.", `Click ${submit}.`, "Close the browser completely and reopen it.", "Open the application URL."],
      data: ["Email: qa.user01@example.com", "Password: Valid@1234", "Remember me: ticked"],
      expected: ["The user is still signed in after reopening the browser.", "Without 'Remember me', the user must sign in again.", "The persistent cookie expires after the configured period.", "Logging out clears the remembered session."],
      tags: ["positive"],
    });
  }
  return out;
}
