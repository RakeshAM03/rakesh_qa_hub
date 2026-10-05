/** Detects field-like words in a requirement and suggests targeted validation / boundary checks. */

export type FieldKind = "email" | "password" | "phone" | "date" | "amount" | "quantity" | "name" | "file" | "url" | "otp" | "search";

type FieldRule = {
  kind: FieldKind;
  label: string;
  pattern: RegExp;
  /** [title suffix, test data, expected result, type, priority] */
  checks: [string, string, string, string, "P0" | "P1" | "P2" | "P3"][];
};

export const FIELD_RULES: FieldRule[] = [
  {
    kind: "email",
    label: "Email",
    pattern: /\be-?mails?\b/i,
    checks: [
      ["accepts a valid address", "user@example.com", "The email is accepted.", "Positive", "P1"],
      ["rejects an address without @", "user.example.com", "A clear validation message is shown and nothing is saved.", "Negative", "P1"],
      ["rejects an address at max length + 1", "65-character local part @example.com", "The address is rejected with a length message.", "Boundary", "P2"],
      ["trims leading/trailing spaces", "  user@example.com  ", "Spaces are trimmed (or rejected) consistently.", "Field validation", "P2"],
      ["handles Unicode / IDN addresses", "user@exämple.com", "The address is handled as the requirement says (accepted or a clear message).", "Edge case", "P3"],
      ["rejects a duplicate address", "An email that is already registered", "A duplicate message is shown; no second record is created.", "Negative", "P1"],
    ],
  },
  {
    kind: "password",
    label: "Password",
    pattern: /\bpass(word|code|phrase)s?\b/i,
    checks: [
      ["accepts a password meeting every rule", "Str0ng!Pass", "The password is accepted.", "Positive", "P1"],
      ["rejects a password below the minimum length", "Ab1!", "A minimum-length message is shown.", "Boundary", "P1"],
      ["rejects a password missing a required character class", "password1 / Password! / PASSWORD1", "Each missing rule is explained.", "Negative", "P1"],
      ["masks the password and offers show/hide", "Any password", "Characters are masked by default; the toggle reveals them.", "Security", "P2"],
      ["is never shown in URLs, logs or error messages", "Any password", "The value never appears in the URL, network logs or messages.", "Security", "P0"],
    ],
  },
  {
    kind: "phone",
    label: "Phone",
    pattern: /\b(phone|mobile|contact number)s?\b/i,
    checks: [
      ["accepts a valid number with country code", "+91 98765 43210", "The number is accepted and stored in one format.", "Positive", "P1"],
      ["rejects too few / too many digits", "12345 / +9198765432101234", "A validation message is shown.", "Boundary", "P2"],
      ["rejects letters and symbols", "98765abcde", "Letters are rejected.", "Negative", "P2"],
    ],
  },
  {
    kind: "date",
    label: "Date",
    pattern: /\b(dates?|dob|birthday|deadline|expiry|schedule[ds]?)\b/i,
    checks: [
      ["accepts a valid date", "A date inside the allowed range", "The date is accepted.", "Positive", "P2"],
      ["rejects an impossible date", "31/04/2025, 29/02/2023", "The date is rejected.", "Negative", "P2"],
      ["handles the range boundaries", "First and last allowed day, one day either side", "Boundary days are accepted; outside days are rejected.", "Boundary", "P2"],
      ["handles leap day and time zones", "29/02/2024; a user in another time zone", "The stored and shown date are the same day.", "Edge case", "P3"],
    ],
  },
  {
    kind: "amount",
    label: "Amount",
    pattern: /\b(amount|price|cost|total|fee|payment|balance|salary)s?\b/i,
    checks: [
      ["accepts a valid amount", "100.50", "The amount is accepted and shown with the right currency.", "Positive", "P1"],
      ["rejects zero / negative amounts where not allowed", "0, -1", "A validation message is shown.", "Negative", "P1"],
      ["handles min / max and decimals", "Min, max, max + 0.01, three decimals", "Limits and rounding follow the rules.", "Boundary", "P1"],
    ],
  },
  {
    kind: "quantity",
    label: "Quantity",
    pattern: /\b(quantity|qty|count|items?|stock)\b/i,
    checks: [
      ["accepts quantities inside the range", "1 and the maximum", "The quantity is accepted.", "Positive", "P2"],
      ["rejects 0, negative and above-max quantities", "0, -1, max + 1", "A validation message is shown.", "Boundary", "P1"],
      ["rejects decimals and text", "1.5, abc", "Only whole numbers are accepted.", "Negative", "P2"],
    ],
  },
  {
    kind: "name",
    label: "Name",
    pattern: /\b(first name|last name|full name|name|username)s?\b/i,
    checks: [
      ["accepts a typical name", "Asha Rao", "The name is accepted.", "Positive", "P2"],
      ["rejects an empty or spaces-only name", "\"\", \"   \"", "A required-field message is shown.", "Negative", "P1"],
      ["handles max length and accented characters", "255 / 256 characters; Zoë O'Brien-Núñez", "Long names are limited; accents and apostrophes are kept.", "Boundary", "P2"],
      ["escapes HTML / script input", "<script>alert(1)</script>", "The text is shown literally; no script runs.", "Security", "P0"],
    ],
  },
  {
    kind: "file",
    label: "File upload",
    pattern: /\b(files?|uploads?|attachments?|documents?|images?)\b/i,
    checks: [
      ["uploads an allowed file type", "A small valid file", "The file uploads and shows in the list.", "Positive", "P1"],
      ["rejects a disallowed type", "file.exe renamed to file.pdf", "The file is rejected by content, not just the extension.", "Security", "P1"],
      ["rejects a file over the size limit", "Size limit + 1 byte", "A size message is shown; nothing is stored.", "Boundary", "P1"],
      ["handles an empty file and odd file names", "0-byte file; name with spaces, Unicode and ../", "Handled safely with a clear message.", "Edge case", "P2"],
    ],
  },
  {
    kind: "url",
    label: "URL",
    pattern: /\b(urls?|links?|website)\b/i,
    checks: [
      ["accepts a valid https URL", "https://example.com/page", "The URL is accepted.", "Positive", "P2"],
      ["rejects javascript: and malformed URLs", "javascript:alert(1), htp:/bad", "The URL is rejected.", "Security", "P1"],
    ],
  },
  {
    kind: "otp",
    label: "OTP",
    pattern: /\b(otp|one[- ]time (password|code)|verification code|2fa|mfa)\b/i,
    checks: [
      ["accepts the correct code in time", "The code just sent", "Verification succeeds.", "Positive", "P0"],
      ["rejects a wrong or expired code", "Wrong digits; a code after expiry", "Verification fails with a clear message.", "Negative", "P0"],
      ["limits attempts and resends", "Repeated wrong codes; repeated resend clicks", "Attempts are locked and resends rate-limited.", "Security", "P1"],
    ],
  },
  {
    kind: "search",
    label: "Search",
    pattern: /\b(search|filter|find|lookup)\b/i,
    checks: [
      ["returns matching results", "A term that exists", "Matching results are listed.", "Positive", "P1"],
      ["shows an empty state for no matches", "A term that doesn't exist", "A friendly 'no results' message is shown.", "Negative", "P2"],
      ["handles special characters safely", "% _ ' \" < > and very long input", "No errors; input is treated as text.", "Security", "P1"],
    ],
  },
];

export function detectFields(text: string): FieldRule[] {
  return FIELD_RULES.filter((r) => r.pattern.test(text));
}
