/**
 * Rule extractor: reads any requirement text into allowed values, limits (with units), fields,
 * roles, rules, statuses and API details. Domain-agnostic — nothing here is feature-specific.
 */

import { endpointsFromApiText, parseSpecText } from "./openapi";
import { derivePrefix, type Context } from "./types";

export type ListKind = "format" | "method" | "sort" | "search" | "filter" | "option";
export type AllowedList = { id: string; kind: ListKind; subject: string; values: string[] };

export type LimitKind = "size" | "length" | "digits" | "count" | "attempts" | "amount" | "range" | "age" | "duration" | "perPage";
export type Limit = {
  id: string;
  kind: LimitKind;
  subject: string;
  min?: number;
  max?: number;
  /** Display unit: "bytes", "characters", "digits", "years", "minutes", "₹", … */
  unit: string;
  raw: string;
};

export type FieldType = "email" | "password" | "phone" | "date" | "number" | "url" | "text" | "amount" | "otp";
export type FieldInfo = { name: string; type: FieldType; required: boolean; unique: boolean };

export type Requirement = {
  text: string;
  moduleName: string;
  abbr: string;
  /** Main entity, singular ("resume", "account", "candidate", "invoice", "user"). */
  entity: string;
  actions: string[];
  lists: AllowedList[];
  limits: Limit[];
  fields: FieldInfo[];
  roles: string[];
  /** Role named for an API token ("admin" in "requires admin token"). */
  tokenRole: string | null;
  duplicate: { subject: string; scope: string } | null;
  lockout: { attempts: number; minutes: number | null } | null;
  conditions: { when: string; then: string }[];
  states: string[];
  endpoints: { method: string; path: string }[];
  statusCodes: number[];
  features: { files: boolean; auth: boolean; search: boolean; payment: boolean; api: boolean; form: boolean; crud: boolean };
  /** Human-readable list of what was found (shown in the UI and the summary). */
  rules: string[];
};

const ACTION_WORDS = ["create", "add", "register", "upload", "login", "log in", "sign in", "search", "filter", "sort", "edit", "update", "delete", "remove", "export", "import", "approve", "reject", "pay", "submit", "view", "download"];
const MODULE_ACTIONS = new Set(["upload", "login", "search", "pay", "registration", "form", "create", "creates", "add", "edit", "update", "delete", "submit", "management", "page", "screen", "api"]);
const SMALL = new Set(["a", "an", "the", "of", "for", "to", "and", "or", "with", "by", "in", "on"]);

const titleCase = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

const singular = (w: string) => (/ies$/.test(w) ? w.replace(/ies$/, "y") : /(ss|us)$/.test(w) ? w : w.replace(/s$/, ""));

/** "1,00,000" / "100,000" / "1.5" → number. */
export const parseNumber = (s: string) => Number(s.replace(/,/g, ""));

const UNIT_BYTES: Record<string, number> = { b: 1, byte: 1, bytes: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };

/** Splits into clauses on ; newlines and sentence ends (not inside numbers). */
export function clauses(text: string): string[] {
  return text
    .split(/;|\n|(?<!\d)\.(?=\s|$)|\.\s+(?=[A-Z])/)
    .map((c) => c.trim())
    .filter((c) => c.length > 1);
}

function moduleNameFrom(text: string): string {
  const first = (text.split(/\n/).find((l) => l.trim()) ?? "").trim();
  const api = /^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/i.exec(first);
  if (api) {
    const seg = api[2].split("/").filter((s) => s && !s.startsWith("{") && !s.startsWith(":") && s !== "api" && !/^v\d+$/.test(s)).pop() ?? "Endpoint";
    return `${titleCase(seg.replace(/[-_]/g, " "))} API`;
  }
  let head = first.split(/\s[—–-]\s|[—–:;(]/)[0].trim();
  head = head.split(/\s+(?:with|by|for|so that|to|using|via|when|if)\s+/i)[0];
  head = head.replace(/^(as an? [^,]+,\s*)?(i want to|i can|user can|users can|allow users to)\s+/i, "");
  const words = head.split(/\s+/).filter(Boolean).slice(0, 4);
  return words.length ? titleCase(words.join(" ")) : "";
}

function entityFrom(moduleName: string, f: Requirement["features"], endpoints: Requirement["endpoints"]): string {
  if (endpoints.length) {
    const seg = endpoints[0].path.split("/").filter((s) => s && !s.startsWith("{") && s !== "api" && !/^v\d+$/.test(s)).pop();
    if (seg) return singular(seg.toLowerCase());
  }
  const words = moduleName
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !MODULE_ACTIONS.has(w) && !SMALL.has(w));
  if (words.length) return singular(words[words.length - 1]);
  if (/regist|sign ?up/i.test(moduleName)) return "user account";
  if (f.auth) return "account";
  if (f.payment) return "payment";
  if (f.files) return "file";
  if (f.search) return "result";
  return "record";
}

const FIELD_HINTS: [RegExp, string, FieldType][] = [
  [/\be-?mail(?: address)?\b/i, "Email", "email"],
  [/\bpassword\b/i, "Password", "password"],
  [/\b(?:phone|mobile)(?: number)?\b/i, "Phone", "phone"],
  [/\b(?:date of birth|dob|birth ?date)\b/i, "Date of birth", "date"],
  [/\b(?:otp|one[- ]time (?:password|code)|verification code)\b/i, "OTP", "otp"],
  [/\b(?:url|website|link)\b/i, "URL", "url"],
  [/\busername\b/i, "Username", "text"],
  [/\bamount\b/i, "Amount", "amount"],
];

export function fieldTypeOf(name: string): FieldType {
  const n = name.toLowerCase();
  if (/mail/.test(n)) return "email";
  if (/password|passcode/.test(n)) return "password";
  if (/phone|mobile/.test(n)) return "phone";
  if (/date|dob|birth/.test(n)) return "date";
  if (/otp|code/.test(n)) return "otp";
  if (/url|website|link/.test(n)) return "url";
  if (/amount|price|salary|fee/.test(n)) return "amount";
  if (/age|quantity|qty|count|number of|experience/.test(n)) return "number";
  return "text";
}

const splitValues = (s: string) =>
  s
    .replace(/\([^)]*\)/g, " ")
    .split(/,|\/|\bor\b|\band\b|\|/i)
    .map((v) => v.trim().replace(/^(?:a|an|the)\s+/i, "").replace(/[.]$/, ""))
    .filter((v) => v && v.length <= 40 && !/^\d+$/.test(v))
    .map((v) => v.split(/\s+/).slice(0, 3).join(" "));

const FILE_EXT = /^(?:pdf|docx?|txt|rtf|odt|xlsx?|csv|pptx?|jpe?g|png|gif|svg|webp|zip|json|xml|mp4|mp3|html?)$/i;

/** International grouping (5,242,880); amounts in ₹ use Indian grouping (1,00,000). */
export const fmt = (n: number) => n.toLocaleString("en-US");
export const fmtAmount = (n: number, unit: string) => `${unit}${n.toLocaleString(unit === "₹" ? "en-IN" : "en-US")}`;

export function describeBytes(bytes: number): string {
  if (bytes % 1024 ** 3 === 0) return `${bytes / 1024 ** 3} GB`;
  if (bytes % 1024 ** 2 === 0) return `${bytes / 1024 ** 2} MB`;
  if (bytes % 1024 === 0) return `${bytes / 1024} KB`;
  return `${fmt(bytes)} bytes`;
}

export function extractRequirement(text: string, context?: Partial<Context>, apiText = ""): Requirement {
  const all = `${text}\n${context?.rules ?? ""}`;
  const cls = clauses(all);
  const lower = all.toLowerCase();

  const endpoints = [...`${all}\n${apiText}`.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w\-./{}:]*)/g)].map((m) => ({ method: m[1], path: m[2] }));
  // A pasted OpenAPI / Swagger / cURL definition adds its endpoints and (for specs) its title.
  let specTitle = "";
  if (apiText.trim()) {
    try {
      for (const e of endpointsFromApiText(apiText.trim()).endpoints) if (!endpoints.some((x) => x.method === e.method && x.path === e.path)) endpoints.push({ method: e.method, path: e.path });
      const info = (parseSpecText(apiText.trim()) as { info?: { title?: unknown } }).info;
      if (typeof info?.title === "string") specTitle = info.title.replace(/^(?:sample|example|demo)\s+/i, "").trim();
    } catch {
      // not a spec / cURL — the regex above already picked up any "METHOD /path" text
    }
  }
  const statusCodes = [...new Set(cls.filter((c) => /return|respond|status|codes?/i.test(c)).flatMap((c) => [...c.matchAll(/\b([1-5]\d{2})\b/g)].map((m) => Number(m[1]))))].sort();

  const features: Requirement["features"] = {
    files: /\b(upload|attach(?:ment)?s?|files?|resume|documents?|images?)\b/.test(lower),
    auth: /\b(login|log in|sign in|sign-in|password|otp|session|logout|log out|2fa)\b/.test(lower),
    search: /\b(search|filter|sort|per page|pagination)\b/.test(lower),
    payment: /\b(pay|payment|invoice|card|upi|checkout|refund)\b/.test(lower),
    api: endpoints.length > 0 || context?.appType === "API" || Boolean(apiText.trim()),
    form: /\b(form|register|registration|sign up|signup|profile)\b/.test(lower),
    crud: /\b(create|creates|add|register|registration|edit|update|delete|remove|sign up)\b/.test(lower),
  };

  const fromEndpoint = () => {
    const seg = endpoints[0]?.path.split("/").filter((x) => x && !x.startsWith("{") && !x.startsWith(":") && x !== "api" && !/^v\d+$/.test(x)).pop();
    return seg ? `${titleCase(seg.replace(/[-_]/g, " "))} API` : "";
  };
  const moduleName = context?.moduleName?.trim() || moduleNameFrom(text) || specTitle || fromEndpoint() || "Module";
  const lists: AllowedList[] = [];
  const limits: Limit[] = [];
  const fields: FieldInfo[] = [];
  const rules: string[] = [];
  const addField = (name: string, patch: Partial<FieldInfo> = {}) => {
    const clean = titleCase(name.trim().replace(/\s+/g, " "));
    const existing = fields.find((f) => f.name.toLowerCase() === clean.toLowerCase() || fieldTypeOf(f.name) === fieldTypeOf(clean) && fieldTypeOf(clean) !== "text" && fieldTypeOf(clean) !== "number");
    if (existing) Object.assign(existing, Object.fromEntries(Object.entries(patch).filter(([, v]) => v)));
    else fields.push({ name: clean, type: fieldTypeOf(clean), required: false, unique: false, ...patch });
  };
  const addLimit = (l: Omit<Limit, "id">) => {
    if (limits.some((x) => x.kind === l.kind && x.subject === l.subject && x.min === l.min && x.max === l.max)) return;
    limits.push({ ...l, id: `L${limits.length + 1}` });
  };

  for (const c of cls) {
    const cl = c.toLowerCase();

    // ---- fields written as "Name (required, max 50 chars)"
    for (const m of c.matchAll(/([A-Za-z][A-Za-z ]{0,30}?)\s*\(([^)]*)\)/g)) {
      const name = m[1].trim().split(/\s+/).slice(-3).join(" ").replace(/^(?:and|or|with)\s+/i, "");
      const attrs = m[2].toLowerCase();
      if (!/required|optional|unique|char|digit|age|\d+\+|format|mandatory/.test(attrs)) continue;
      addField(name, { required: /required|mandatory/.test(attrs), unique: /unique/.test(attrs) });
      const len = /max(?:imum)?\s*(\d+)\s*(?:chars?|characters)/.exec(attrs);
      if (len) addLimit({ kind: "length", subject: titleCase(name), max: Number(len[1]), unit: "characters", raw: m[0] });
      const minLen = /min(?:imum)?\s*(\d+)\s*(?:chars?|characters)/.exec(attrs);
      if (minLen) addLimit({ kind: "length", subject: titleCase(name), min: Number(minLen[1]), unit: "characters", raw: m[0] });
      const lenRange = /(\d+)\s*(?:–|-|to)\s*(\d+)\s*(?:chars?|characters)/.exec(attrs);
      if (lenRange) addLimit({ kind: "length", subject: titleCase(name), min: Number(lenRange[1]), max: Number(lenRange[2]), unit: "characters", raw: m[0] });
      const digits = /(\d+)\s*digits?/.exec(attrs);
      if (digits) addLimit({ kind: "digits", subject: titleCase(name), min: Number(digits[1]), max: Number(digits[1]), unit: "digits", raw: m[0] });
      const age = /age\s*(\d+)\s*\+|(\d+)\s*\+/.exec(attrs);
      if (age) addLimit({ kind: "age", subject: titleCase(name), min: Number(age[1] ?? age[2]), unit: "years", raw: m[0] });
    }

    // ---- allowed lists
    const only = /\bonly\s+([^;.\n]+)/i.exec(c);
    if (only) {
      const values = splitValues(only[1].replace(/\b(?:files?|formats?|are allowed|allowed|accepted|supported)\b/gi, ""));
      const isFormat = values.length > 0 && (values.every((v) => FILE_EXT.test(v)) || /file|format|upload|attach/.test(cl));
      if (values.length >= 2 || (isFormat && values.length)) {
        lists.push({ id: `V${lists.length + 1}`, kind: isFormat ? "format" : "option", subject: isFormat ? "file format" : moduleName.toLowerCase(), values: isFormat ? values.map((v) => v.toUpperCase()) : values });
      }
    }
    const oneOf = /\b(?:one of|supported|allowed values?|options?)\s*:?\s+([^;.\n]+)/i.exec(c);
    if (oneOf && !only) {
      const values = splitValues(oneOf[1]);
      if (values.length > 1) lists.push({ id: `V${lists.length + 1}`, kind: values.every((v) => FILE_EXT.test(v)) ? "format" : "option", subject: moduleName.toLowerCase(), values });
    }
    for (const m of c.matchAll(/\b(pay|paid|paying|sort(?:ed)?|search(?:ed)?|filter(?:ed)?|log ?in|sign ?in)\b[^;.]*?\bby\s+([^;.]+)/gi)) {
      const verb = m[1].toLowerCase();
      const kind: ListKind = verb.startsWith("pay") || verb.startsWith("paid") ? "method" : verb.startsWith("sort") ? "sort" : verb.startsWith("search") ? "search" : verb.startsWith("filter") ? "filter" : "method";
      const raw = m[2].split(/\s*\(/)[0];
      const values = splitValues(raw).filter((v) => !/^\d/.test(v));
      if (values.length) lists.push({ id: `V${lists.length + 1}`, kind, subject: kind === "method" ? (verb.startsWith("log") || verb.startsWith("sign") ? "login method" : "payment method") : `${kind} option`, values });
    }

    // ---- limits
    for (const m of c.matchAll(/(\d+(?:\.\d+)?)\s*(KB|MB|GB|bytes?)\b/gi)) {
      const before = c.slice(Math.max(0, (m.index ?? 0) - 40), m.index).toLowerCase();
      const bytes = Math.round(Number(m[1]) * UNIT_BYTES[m[2].toLowerCase()]);
      // The nearest keyword wins ("minimum 10 KB each and max 1 GB" → the 1 GB is a max).
      const lastMin = Math.max(before.lastIndexOf("min"), before.lastIndexOf("at least"));
      const lastMax = Math.max(before.lastIndexOf("max"), before.lastIndexOf("up to"), before.lastIndexOf("not exceed"), before.lastIndexOf("limit"));
      const isMin = lastMin > lastMax;
      addLimit({ kind: "size", subject: "file size", ...(isMin ? { min: bytes } : { max: bytes }), unit: "bytes", raw: m[0] });
    }
    for (const m of c.matchAll(/(\b[A-Za-z]+\b)?\s*(\d+)\s*(?:–|-|to)\s*(\d+)\s*(?:chars?|characters)\b/gi)) {
      if (/\(/.test(c.slice(0, m.index ?? 0)) && /\)/.test(c.slice(m.index ?? 0))) continue;
      const subject = titleCase(m[1] && !/^(?:between|of|is|be|must)$/i.test(m[1]) ? m[1] : fields.at(-1)?.name ?? "Text");
      addLimit({ kind: "length", subject, min: Number(m[2]), max: Number(m[3]), unit: "characters", raw: m[0].trim() });
      if (fieldTypeOf(subject) !== "text") addField(subject, { required: true });
    }
    for (const m of c.matchAll(/(?:at least|min(?:imum)?(?: of)?)\s+(\d+)\s*(?:chars?|characters)/gi)) {
      const subject = titleCase((/(\b\w+)\s+(?:must|should|needs?)/i.exec(c) ?? [])[1] ?? fields.at(-1)?.name ?? "Text");
      addLimit({ kind: "length", subject, min: Number(m[1]), unit: "characters", raw: m[0] });
    }
    const attempts = /after\s+(\d+)\s+(?:consecutive\s+)?(?:failed|wrong|invalid|unsuccessful|incorrect)\s+(?:login\s+|sign-?in\s+)?attempts/i.exec(c);
    if (attempts) addLimit({ kind: "attempts", subject: "failed login attempts", max: Number(attempts[1]), unit: "attempts", raw: attempts[0] });
    const duration = /(?:for|after|within)\s+(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i.exec(c);
    if (duration && !/\d+\s*(?:minutes?|hours?|seconds?)\s+(?:sla|response)/i.test(c)) {
      const unit = /^h/i.test(duration[2]) ? "hours" : /^s/i.test(duration[2]) ? "seconds" : "minutes";
      addLimit({ kind: "duration", subject: /lock/i.test(c) ? "lockout period" : "time limit", max: Number(duration[1]), unit, raw: duration[0] });
    }
    for (const m of c.matchAll(/\bage\s*(\d+)\s*\+|(\d+)\s*\+\s*years|at least\s+(\d+)\s+years(?:\s+old)?|(\d+)\s+years\s+or\s+older/gi)) {
      if (limits.some((l) => l.kind === "age")) break;
      addLimit({ kind: "age", subject: fields.find((f) => f.type === "date")?.name ?? "Date of birth", min: Number(m[1] ?? m[2] ?? m[3] ?? m[4]), unit: "years", raw: m[0] });
    }
    const amount = /([₹$€£]|rs\.?|inr|usd|eur)\s*([\d,]+(?:\.\d+)?)\s*(?:to|–|-|and)\s*(?:[₹$€£]|rs\.?|inr|usd|eur)?\s*([\d,]+(?:\.\d+)?)/i.exec(c);
    if (amount) {
      const cur = { rs: "₹", "rs.": "₹", inr: "₹", usd: "$", eur: "€" }[amount[1].toLowerCase()] ?? amount[1];
      addLimit({ kind: "amount", subject: "amount", min: parseNumber(amount[2]), max: parseNumber(amount[3]), unit: cur, raw: amount[0] });
      addField("Amount", { required: true });
    }
    const perPage = /(\d+)\s+(results|items|records|rows|entries)\s+per\s+page/i.exec(c);
    if (perPage) addLimit({ kind: "perPage", subject: `${perPage[2].toLowerCase()} per page`, max: Number(perPage[1]), unit: perPage[2].toLowerCase(), raw: perPage[0] });
    const count = /(?:max(?:imum)?|up to|at most|no more than)\s+(\d+)\s+(files|items|attachments|images|documents|entries|members|products|users)/i.exec(c);
    if (count) addLimit({ kind: "count", subject: count[2].toLowerCase(), max: Number(count[1]), unit: count[2].toLowerCase(), raw: count[0] });
    for (const m of c.matchAll(/(\b[A-Za-z]+\b)?\s*\(?\s*(\d+)\s*(?:–|-|to)\s*(\d+)\s*(years|yrs|days|months|items|units|%|percent|kg|km)\s*\)?/gi)) {
      if (amount && c.includes(m[0])) continue;
      const subject = m[1] && !/^(?:between|of|is|be|must|from)$/i.test(m[1]) ? m[1].toLowerCase() : "value";
      addLimit({ kind: "range", subject, min: Number(m[2]), max: Number(m[3]), unit: m[4].toLowerCase().replace("yrs", "years"), raw: m[0].trim() });
    }

    // ---- unique / required in prose
    for (const m of c.matchAll(/\b([A-Za-z][A-Za-z ]{1,20}?)\s+(?:must be\s+|is\s+|should be\s+)?unique\b|\bunique\s+([A-Za-z]+)/gi)) {
      const name = (m[1] ?? m[2]).trim().split(/\s+/).pop()!;
      if (!/^(?:a|an|the|is|be)$/i.test(name)) addField(name, { unique: true, required: true });
    }
    for (const m of c.matchAll(/\b([A-Za-z][A-Za-z ]{1,20}?)\s+(?:is|are)\s+(?:required|mandatory)\b/gi)) addField(m[1].trim().split(/\s+/).slice(-2).join(" "), { required: true });
  }

  // ---- fields named in prose (email, password, phone, …)
  for (const [re, name, type] of FIELD_HINTS) {
    if (!re.test(all)) continue;
    if (type === "amount" && fields.some((f) => f.type === "amount")) continue;
    const isSearchCriterion = lists.some((l) => (l.kind === "search" || l.kind === "sort" || l.kind === "filter") && l.values.some((v) => v.toLowerCase() === name.toLowerCase()));
    if (!isSearchCriterion) addField(name, { type, required: features.auth && (type === "email" || type === "password") ? true : undefined });
  }
  if (features.api && !fields.length && endpoints.some((e) => e.method === "POST" || e.method === "PUT")) addField("Name", {});

  // ---- roles, token, rules
  const roleSet = new Set<string>((context?.roles ?? "").split(",").map((r) => r.trim()).filter(Boolean));
  for (const m of all.matchAll(/\b(super ?admin|admin(?:istrator)?|recruiter|manager|viewer|guest|editor|owner|agent|approver|reviewer)s?\b/gi)) roleSet.add(titleCase(m[1].replace(/istrator$/i, "")));
  const token = /requires?\s+(?:an?\s+)?([A-Za-z]+)\s+(?:token|role|permission|access|rights)/i.exec(all);
  const dup = /duplicate\s+([A-Za-z ]+?)\s+(?:for\s+(?:the\s+)?same\s+([A-Za-z ]+?)\s+)?(?:is|are|will be|must be|gets?)\s+(?:blocked|prevented|rejected|not allowed|disallowed)/i.exec(all);
  const lockAttempts = limits.find((l) => l.kind === "attempts");
  const lockTime = limits.find((l) => l.kind === "duration" && l.subject === "lockout period");
  const conditions = [
    ...[...all.matchAll(/\b(?:if|when)\s+([^;.]+?)\s+then\s+([^;.]+)/gi)].map((m) => ({ when: m[1].trim(), then: m[2].trim() })),
    ...[...all.matchAll(/\b(?:if|when)\s+([^,;.]+),\s*([^;.]+)/gi)].filter((m) => !/\bthen\b/i.test(m[0])).map((m) => ({ when: m[1].trim(), then: m[2].trim() })),
  ]
    .filter((k) => k.when.split(/\s+/).length >= 2 && k.then.split(/\s+/).length >= 2)
    .slice(0, 6);
  const statusMatch = /status(?:es)?\s*(?::|=|from|flow)?\s*([A-Za-z]+(?:\s*(?:→|->|to|,|\/)\s*[A-Za-z]+)+)/i.exec(all);
  const states = statusMatch ? statusMatch[1].split(/\s*(?:→|->|\bto\b|,|\/)\s*/).map((s) => titleCase(s)).filter(Boolean) : [];

  const req: Requirement = {
    text,
    moduleName,
    abbr: derivePrefix(moduleName),
    entity: "record",
    actions: ACTION_WORDS.filter((a) => new RegExp(`\\b${a}`, "i").test(all)),
    lists,
    limits,
    fields,
    roles: [...roleSet],
    tokenRole: token ? token[1].toLowerCase() : null,
    duplicate: dup ? { subject: dup[1].trim().toLowerCase(), scope: (dup[2] ?? "").trim().toLowerCase() } : null,
    lockout: lockAttempts ? { attempts: lockAttempts.max!, minutes: lockTime?.max ?? null } : null,
    conditions,
    states,
    endpoints,
    statusCodes,
    features,
    rules,
  };
  req.entity = entityFrom(moduleName, features, endpoints);

  // ---- human-readable summary of what was found
  for (const l of lists) rules.push(`${titleCase(l.subject)}: ${l.values.join(", ")}`);
  for (const l of limits) rules.push(describeLimit(l));
  for (const f of fields) rules.push(`Field "${f.name}" (${f.type}${f.required ? ", required" : ""}${f.unique ? ", unique" : ""})`);
  if (req.roles.length) rules.push(`Roles: ${req.roles.join(", ")}`);
  if (req.tokenRole) rules.push(`Requires ${/^[aeiou]/.test(req.tokenRole) ? "an" : "a"} ${req.tokenRole} token`);
  if (req.duplicate) rules.push(`Duplicate ${req.duplicate.subject}${req.duplicate.scope ? ` for the same ${req.duplicate.scope}` : ""} is blocked`);
  if (req.lockout) rules.push(`Account locks after ${req.lockout.attempts} failed attempts${req.lockout.minutes ? ` for ${req.lockout.minutes} minutes` : ""}`);
  for (const k of req.conditions) rules.push(`If ${k.when} → ${k.then}`);
  if (states.length) rules.push(`Statuses: ${states.join(" → ")}`);
  for (const e of endpoints) rules.push(`Endpoint: ${e.method} ${e.path}`);
  if (statusCodes.length) rules.push(`Status codes: ${statusCodes.join(", ")}`);
  return req;
}

export function describeLimit(l: Limit): string {
  const v = (n: number) => (l.kind === "size" ? `${describeBytes(n)} (${fmt(n)} bytes)` : l.kind === "amount" ? fmtAmount(n, l.unit) : `${fmt(n)} ${l.unit}`);
  const label = l.subject[0].toUpperCase() + l.subject.slice(1);
  if (l.min !== undefined && l.max !== undefined) return l.min === l.max ? `${label}: exactly ${v(l.min)}` : `${label}: ${v(l.min)} to ${v(l.max)}`;
  if (l.max !== undefined) return `${label}: max ${v(l.max)}`;
  return `${label}: min ${v(l.min!)}`;
}
