/**
 * Field type catalogue: group, options, edge-case kind, SQL type and value generator for
 * every type. The schema builder UI, validation, generation and exporters all read this.
 */

import type { Faker } from "@faker-js/faker";

import { formatDate, parseIsoDate, shiftYears } from "./dates";
import { INVALID_PASSWORDS } from "./edge-cases";
import { aadhaar, gstin, ifsc, inMobile, pan, pincode, SANDBOX_CARDS, testCardNumber, transactionId, upiId, vehicleNumber, type Rand } from "./formats";
import { generateFromRegex, parseRegex, regexVariety } from "./regex";
import type { Field, FieldValue, OptionValue } from "./types";

export type EdgeKind = "text" | "email" | "phone" | "number" | "date" | "password" | "boolean";
export type SqlKind = "int" | "bigint" | "decimal" | "bool" | "date" | "datetime" | "time" | "text" | "longtext" | "uuid" | "json";

export type OptionSpec = {
  key: string;
  label: string;
  kind: "number" | "text" | "textarea" | "boolean" | "select" | "date";
  choices?: { value: string; label: string }[];
  min?: number;
  max?: number;
  placeholder?: string;
  help?: string;
};

export type GenContext = {
  f: Faker;
  r: Rand;
  o: Record<string, OptionValue>;
  index: number;
  ref: Date;
};

export type FieldTypeDef = {
  id: string;
  label: string;
  group: FieldGroup;
  options?: OptionSpec[];
  defaults?: Record<string, OptionValue>;
  edge: EdgeKind | null;
  sql: SqlKind;
  /** Not used for structural types (object, array, template, formula, foreignKey). */
  gen?: (c: GenContext) => FieldValue;
  /** Max distinct values for these options (for "unique" checks). Omitted = plenty. */
  variety?: (o: Record<string, OptionValue>) => number;
  /** Shown under the type in the options popover. */
  note?: string;
};

export const FIELD_GROUPS = [
  "Person",
  "Location",
  "Internet",
  "Numbers & dates",
  "Finance",
  "India formats",
  "Commerce & business",
  "Text",
  "Custom",
] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

export const FAKE_ID_NOTE = "Generated IDs follow the format only and are not real; never use them outside testing.";

const num = (o: Record<string, OptionValue>, k: string, d: number) => {
  const v = Number(o[k]);
  return Number.isFinite(v) && o[k] !== "" ? v : d;
};
const str = (o: Record<string, OptionValue>, k: string, d = "") => (o[k] === undefined || o[k] === "" ? d : String(o[k]));
const bool = (o: Record<string, OptionValue>, k: string, d: boolean) => (typeof o[k] === "boolean" ? (o[k] as boolean) : d);
const round = (v: number, decimals: number) => Number(v.toFixed(decimals));

const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY", "YYYY/MM/DD", "DD MMM YYYY"].map((v) => ({ value: v, label: v }));
const DATETIME_FORMATS = [
  { value: "iso", label: "ISO 8601 (UTC)" },
  { value: "YYYY-MM-DD HH:mm:ss", label: "YYYY-MM-DD HH:mm:ss" },
  { value: "DD/MM/YYYY HH:mm", label: "DD/MM/YYYY HH:mm" },
  { value: "MM/DD/YYYY hh:mm A", label: "MM/DD/YYYY hh:mm AM/PM" },
];

const dateFormatOpt: OptionSpec = { key: "format", label: "Format", kind: "select", choices: DATE_FORMATS };
const rangeOpts = (kind: "number" | "date"): OptionSpec[] =>
  kind === "number"
    ? [
        { key: "min", label: "Min", kind: "number" },
        { key: "max", label: "Max", kind: "number" },
      ]
    : [
        { key: "from", label: "From", kind: "date", help: "Empty = 5 years before the reference date" },
        { key: "to", label: "To", kind: "date", help: "Empty = the reference date" },
      ];

function dateRange(c: GenContext): [Date, Date] {
  const from = parseIsoDate(str(c.o, "from")) ?? shiftYears(c.ref, -5);
  const to = parseIsoDate(str(c.o, "to")) ?? c.ref;
  return [from, to];
}

const DEPARTMENTS = ["Engineering", "Quality Assurance", "Product", "Design", "Sales", "Marketing", "Finance", "Human Resources", "Operations", "Customer Support"];
const ORDER_STATUSES = ["Pending", "Confirmed", "Packed", "Shipped", "Delivered", "Cancelled", "Returned"];
const PAYMENT_STATUSES = ["SUCCESS", "PENDING", "FAILED", "REFUNDED"];

function password(c: GenContext): string {
  const length = Math.max(4, Math.min(128, num(c.o, "length", 12)));
  const pools = ["abcdefghijkmnopqrstuvwxyz"];
  if (bool(c.o, "uppercase", true)) pools.push("ABCDEFGHJKLMNPQRSTUVWXYZ");
  if (bool(c.o, "numbers", true)) pools.push("23456789");
  if (bool(c.o, "symbols", true)) pools.push("!@#$%^&*-_=+?");
  const all = pools.join("");
  const chars = pools.map((p) => p[c.r.int(0, p.length - 1)]);
  while (chars.length < length) chars.push(all[c.r.int(0, all.length - 1)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = c.r.int(0, i);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** "active:70, inactive:20, banned" → weighted values (numbers when every value is numeric). */
export function parsePickList(text: string): { value: string | number; weight: number }[] {
  const items = text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(.*?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(s);
      return m && m[1] ? { value: m[1], weight: Number(m[2]) } : { value: s, weight: 1 };
    });
  const numeric = items.length > 0 && items.every((i) => /^-?\d+(\.\d+)?$/.test(i.value));
  return items.map((i) => ({ value: numeric ? Number(i.value) : i.value, weight: i.weight }));
}

export const parseList = (text: string) =>
  text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

const defs: FieldTypeDef[] = [
  // ---------- Person ----------
  { id: "firstName", label: "First name", group: "Person", edge: "text", sql: "text", gen: ({ f }) => f.person.firstName() },
  { id: "lastName", label: "Last name", group: "Person", edge: "text", sql: "text", gen: ({ f }) => f.person.lastName() },
  { id: "fullName", label: "Full name", group: "Person", edge: "text", sql: "text", gen: ({ f }) => f.person.fullName() },
  {
    id: "gender",
    label: "Gender",
    group: "Person",
    options: [
      {
        key: "values",
        label: "Values",
        kind: "select",
        choices: [
          { value: "binary", label: "Male / Female" },
          { value: "inclusive", label: "Male / Female / Non-binary" },
        ],
      },
    ],
    defaults: { values: "binary" },
    edge: "text",
    sql: "text",
    gen: ({ r, o }) => r.pick(o.values === "inclusive" ? ["Male", "Female", "Non-binary"] : ["Male", "Female"]),
    variety: (o) => (o.values === "inclusive" ? 3 : 2),
  },
  { id: "jobTitle", label: "Job title", group: "Person", edge: "text", sql: "text", gen: ({ f }) => f.person.jobTitle() },
  { id: "username", label: "Username", group: "Person", edge: "text", sql: "text", gen: ({ f }) => f.internet.username() },
  {
    id: "email",
    label: "Email",
    group: "Person",
    options: [{ key: "domain", label: "Domain", kind: "text", placeholder: "example.com" }],
    defaults: { domain: "example.com" },
    edge: "email",
    sql: "text",
    gen: ({ f, o }) => f.internet.email({ provider: str(o, "domain", "example.com") }).toLowerCase(),
  },
  {
    id: "phone",
    label: "Phone",
    group: "Person",
    options: [
      {
        key: "style",
        label: "Style",
        kind: "select",
        choices: [
          { value: "international", label: "International (+country code)" },
          { value: "national", label: "National" },
          { value: "human", label: "As written locally" },
        ],
      },
    ],
    defaults: { style: "international" },
    edge: "phone",
    sql: "text",
    gen: ({ f, o }) => f.phone.number({ style: str(o, "style", "international") as "international" | "national" | "human" }),
  },
  {
    id: "dateOfBirth",
    label: "Date of birth",
    group: "Person",
    options: [{ key: "minAge", label: "Min age", kind: "number", min: 0, max: 120 }, { key: "maxAge", label: "Max age", kind: "number", min: 0, max: 120 }, dateFormatOpt],
    defaults: { minAge: 18, maxAge: 65, format: "YYYY-MM-DD" },
    edge: "date",
    sql: "date",
    gen: ({ f, o, ref }) =>
      formatDate(f.date.birthdate({ mode: "age", min: num(o, "minAge", 18), max: num(o, "maxAge", 65), refDate: ref }), str(o, "format", "YYYY-MM-DD")),
  },
  {
    id: "avatarUrl",
    label: "Avatar URL",
    group: "Person",
    edge: "text",
    sql: "text",
    gen: ({ f }) => `https://example.com/avatars/${f.string.alphanumeric({ length: 10, casing: "lower" })}.png`,
    note: "Points at example.com, so no real person's photo is used.",
  },

  // ---------- Location ----------
  { id: "street", label: "Street", group: "Location", edge: "text", sql: "text", gen: ({ f }) => f.location.streetAddress() },
  { id: "city", label: "City", group: "Location", edge: "text", sql: "text", gen: ({ f }) => f.location.city() },
  { id: "state", label: "State", group: "Location", edge: "text", sql: "text", gen: ({ f }) => f.location.state() },
  { id: "postalCode", label: "Postal code / pincode", group: "Location", edge: "text", sql: "text", gen: ({ f }) => f.location.zipCode() },
  { id: "country", label: "Country", group: "Location", edge: "text", sql: "text", gen: ({ f }) => f.location.country() },
  { id: "countryCode", label: "Country code", group: "Location", edge: "text", sql: "text", gen: ({ f }) => f.location.countryCode(), variety: () => 240 },
  {
    id: "latitude",
    label: "Latitude",
    group: "Location",
    options: [{ key: "decimals", label: "Decimals", kind: "number", min: 0, max: 8 }],
    defaults: { decimals: 6 },
    edge: "number",
    sql: "decimal",
    gen: ({ f, o }) => f.location.latitude({ precision: num(o, "decimals", 6) }),
  },
  {
    id: "longitude",
    label: "Longitude",
    group: "Location",
    options: [{ key: "decimals", label: "Decimals", kind: "number", min: 0, max: 8 }],
    defaults: { decimals: 6 },
    edge: "number",
    sql: "decimal",
    gen: ({ f, o }) => f.location.longitude({ precision: num(o, "decimals", 6) }),
  },
  {
    id: "fullAddress",
    label: "Full address",
    group: "Location",
    edge: "text",
    sql: "text",
    gen: ({ f }) => `${f.location.streetAddress()}, ${f.location.city()}, ${f.location.state()} ${f.location.zipCode()}, ${f.location.country()}`,
  },
  { id: "timeZone", label: "Time zone", group: "Location", edge: "text", sql: "text", gen: ({ f }) => f.location.timeZone(), variety: () => 300 },

  // ---------- Internet ----------
  {
    id: "url",
    label: "URL",
    group: "Internet",
    options: [{ key: "safe", label: "Use example.com sub-domains", kind: "boolean" }],
    defaults: { safe: true },
    edge: "text",
    sql: "text",
    gen: ({ f, o }) => (bool(o, "safe", true) ? `https://${f.lorem.word()}.example.com/${f.lorem.slug(2)}` : f.internet.url()),
  },
  { id: "domain", label: "Domain", group: "Internet", edge: "text", sql: "text", gen: ({ f }) => f.internet.domainName() },
  { id: "ipv4", label: "IPv4", group: "Internet", edge: "text", sql: "text", gen: ({ f }) => f.internet.ipv4() },
  { id: "ipv6", label: "IPv6", group: "Internet", edge: "text", sql: "text", gen: ({ f }) => f.internet.ipv6() },
  { id: "mac", label: "MAC address", group: "Internet", edge: "text", sql: "text", gen: ({ f }) => f.internet.mac() },
  { id: "userAgent", label: "User agent", group: "Internet", edge: "text", sql: "longtext", gen: ({ f }) => f.internet.userAgent() },
  {
    id: "password",
    label: "Password",
    group: "Internet",
    options: [
      { key: "length", label: "Length", kind: "number", min: 4, max: 128 },
      { key: "uppercase", label: "Uppercase", kind: "boolean" },
      { key: "numbers", label: "Numbers", kind: "boolean" },
      { key: "symbols", label: "Symbols", kind: "boolean" },
    ],
    defaults: { length: 12, uppercase: true, numbers: true, symbols: true },
    edge: "password",
    sql: "text",
    gen: password,
  },
  {
    id: "invalidPassword",
    label: "Password (invalid variants)",
    group: "Internet",
    edge: null,
    sql: "text",
    gen: ({ r }) => r.pick(INVALID_PASSWORDS).value,
    note: "Always invalid: too short, missing a number or symbol, only spaces, common passwords, too long.",
  },
  { id: "uuid", label: "UUID", group: "Internet", edge: "text", sql: "uuid", gen: ({ f }) => f.string.uuid() },
  { id: "slug", label: "Slug", group: "Internet", edge: "text", sql: "text", gen: ({ f }) => f.lorem.slug(3) },
  { id: "hexColor", label: "Hex colour", group: "Internet", edge: "text", sql: "text", gen: ({ f }) => f.color.rgb(), variety: () => 16 ** 6 },
  { id: "emoji", label: "Emoji", group: "Internet", edge: "text", sql: "text", gen: ({ f }) => f.internet.emoji() },

  // ---------- Numbers & dates ----------
  {
    id: "integer",
    label: "Integer",
    group: "Numbers & dates",
    options: rangeOpts("number"),
    defaults: { min: 0, max: 1000 },
    edge: "number",
    sql: "int",
    gen: ({ f, o }) => f.number.int({ min: num(o, "min", 0), max: num(o, "max", 1000) }),
    variety: (o) => Math.floor(num(o, "max", 1000)) - Math.ceil(num(o, "min", 0)) + 1,
  },
  {
    id: "decimal",
    label: "Decimal",
    group: "Numbers & dates",
    options: [...rangeOpts("number"), { key: "decimals", label: "Decimals", kind: "number", min: 0, max: 10 }],
    defaults: { min: 0, max: 1000, decimals: 2 },
    edge: "number",
    sql: "decimal",
    gen: ({ f, o }) => f.number.float({ min: num(o, "min", 0), max: num(o, "max", 1000), fractionDigits: num(o, "decimals", 2) }),
    variety: (o) => (num(o, "max", 1000) - num(o, "min", 0)) * 10 ** num(o, "decimals", 2) + 1,
  },
  {
    id: "boolean",
    label: "Boolean",
    group: "Numbers & dates",
    options: [{ key: "truePct", label: "True %", kind: "number", min: 0, max: 100 }],
    defaults: { truePct: 50 },
    edge: "boolean",
    sql: "bool",
    gen: ({ f, o }) => f.datatype.boolean({ probability: num(o, "truePct", 50) / 100 }),
    variety: () => 2,
  },
  {
    id: "date",
    label: "Date",
    group: "Numbers & dates",
    options: [...rangeOpts("date"), dateFormatOpt],
    defaults: { from: "", to: "", format: "YYYY-MM-DD" },
    edge: "date",
    sql: "date",
    gen: (c) => {
      const [from, to] = dateRange(c);
      return formatDate(c.f.date.between({ from, to }), str(c.o, "format", "YYYY-MM-DD"));
    },
  },
  {
    id: "time",
    label: "Time",
    group: "Numbers & dates",
    options: [
      {
        key: "format",
        label: "Format",
        kind: "select",
        choices: [
          { value: "HH:mm:ss", label: "HH:mm:ss" },
          { value: "HH:mm", label: "HH:mm" },
          { value: "hh:mm A", label: "hh:mm AM/PM" },
        ],
      },
    ],
    defaults: { format: "HH:mm:ss" },
    edge: "text",
    sql: "time",
    gen: ({ r, o }) => formatDate(new Date(Date.UTC(2000, 0, 1, r.int(0, 23), r.int(0, 59), r.int(0, 59))), str(o, "format", "HH:mm:ss")),
  },
  {
    id: "datetime",
    label: "Date & time",
    group: "Numbers & dates",
    options: [...rangeOpts("date"), { key: "format", label: "Format", kind: "select", choices: DATETIME_FORMATS }],
    defaults: { from: "", to: "", format: "iso" },
    edge: "date",
    sql: "datetime",
    gen: (c) => {
      const [from, to] = dateRange(c);
      return formatDate(c.f.date.between({ from, to }), str(c.o, "format", "iso"));
    },
  },
  {
    id: "timestamp",
    label: "Timestamp (epoch)",
    group: "Numbers & dates",
    options: [
      ...rangeOpts("date"),
      {
        key: "unit",
        label: "Unit",
        kind: "select",
        choices: [
          { value: "s", label: "Seconds" },
          { value: "ms", label: "Milliseconds" },
        ],
      },
    ],
    defaults: { from: "", to: "", unit: "s" },
    edge: "number",
    sql: "bigint",
    gen: (c) => {
      const [from, to] = dateRange(c);
      const ms = c.f.date.between({ from, to }).getTime();
      return c.o.unit === "ms" ? ms : Math.floor(ms / 1000);
    },
  },
  {
    id: "sequence",
    label: "Sequence / auto-increment",
    group: "Numbers & dates",
    options: [
      { key: "start", label: "Start", kind: "number" },
      { key: "step", label: "Step", kind: "number" },
    ],
    defaults: { start: 1, step: 1 },
    edge: "number",
    sql: "bigint",
    gen: ({ o, index }) => num(o, "start", 1) + index * num(o, "step", 1),
  },
  {
    id: "pastDate",
    label: "Past date",
    group: "Numbers & dates",
    options: [{ key: "years", label: "Up to years ago", kind: "number", min: 1, max: 200 }, dateFormatOpt],
    defaults: { years: 1, format: "YYYY-MM-DD" },
    edge: "date",
    sql: "date",
    gen: ({ f, o, ref }) => formatDate(f.date.past({ years: num(o, "years", 1), refDate: ref }), str(o, "format", "YYYY-MM-DD")),
  },
  {
    id: "futureDate",
    label: "Future date",
    group: "Numbers & dates",
    options: [{ key: "years", label: "Up to years ahead", kind: "number", min: 1, max: 200 }, dateFormatOpt],
    defaults: { years: 1, format: "YYYY-MM-DD" },
    edge: "date",
    sql: "date",
    gen: ({ f, o, ref }) => formatDate(f.date.future({ years: num(o, "years", 1), refDate: ref }), str(o, "format", "YYYY-MM-DD")),
  },

  // ---------- Finance ----------
  {
    id: "amount",
    label: "Amount",
    group: "Finance",
    options: [
      ...rangeOpts("number"),
      { key: "decimals", label: "Decimals", kind: "number", min: 0, max: 4 },
      { key: "currency", label: "Currency prefix", kind: "text", placeholder: "e.g. INR (empty = number only)" },
    ],
    defaults: { min: 1, max: 10000, decimals: 2, currency: "" },
    edge: "number",
    sql: "decimal",
    gen: ({ f, o }) => {
      const v = f.number.float({ min: num(o, "min", 1), max: num(o, "max", 10000), fractionDigits: num(o, "decimals", 2) });
      const cur = str(o, "currency");
      return cur ? `${cur} ${v.toFixed(num(o, "decimals", 2))}` : v;
    },
  },
  { id: "currencyCode", label: "Currency code", group: "Finance", edge: "text", sql: "text", gen: ({ f }) => f.finance.currencyCode(), variety: () => 150 },
  {
    id: "creditCard",
    label: "Credit card number (test)",
    group: "Finance",
    options: [
      {
        key: "brand",
        label: "Brand",
        kind: "select",
        choices: [
          { value: "any", label: "Any" },
          { value: "visa", label: "Visa" },
          { value: "mastercard", label: "Mastercard" },
          { value: "amex", label: "American Express" },
          { value: "discover", label: "Discover" },
        ],
      },
      {
        key: "source",
        label: "Numbers",
        kind: "select",
        choices: [
          { value: "sandbox", label: "Published sandbox test numbers" },
          { value: "luhn", label: "Random Luhn-valid (format testing)" },
        ],
      },
    ],
    defaults: { brand: "any", source: "sandbox" },
    edge: "text",
    sql: "text",
    gen: ({ r, o }) => testCardNumber(r, str(o, "brand", "any") as "any", o.source === "luhn" ? "luhn" : "sandbox"),
    variety: (o) =>
      o.source === "luhn" ? 1e9 : o.brand && o.brand !== "any" ? (SANDBOX_CARDS[o.brand as keyof typeof SANDBOX_CARDS]?.length ?? 1) : Object.values(SANDBOX_CARDS).flat().length,
    note: "Test card numbers only — sandbox numbers from payment-provider docs, or Luhn-valid numbers on sandbox prefixes. Never real cards.",
  },
  {
    id: "cardExpiry",
    label: "Card expiry (future)",
    group: "Finance",
    edge: "text",
    sql: "text",
    gen: ({ r, ref }) => {
      const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + r.int(1, 60), 1));
      return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(2)}`;
    },
    variety: () => 60,
  },
  {
    id: "cvv",
    label: "CVV",
    group: "Finance",
    options: [
      {
        key: "digits",
        label: "Digits",
        kind: "select",
        choices: [
          { value: "3", label: "3" },
          { value: "4", label: "4 (Amex)" },
        ],
      },
    ],
    defaults: { digits: "3" },
    edge: "text",
    sql: "text",
    gen: ({ f, o }) => f.string.numeric({ length: num(o, "digits", 3), allowLeadingZeros: true }),
    variety: (o) => 10 ** num(o, "digits", 3),
  },
  { id: "iban", label: "IBAN (format only)", group: "Finance", edge: "text", sql: "text", gen: ({ f }) => f.finance.iban() },
  { id: "upiId", label: "UPI ID (fake)", group: "Finance", edge: "text", sql: "text", gen: ({ f, r }) => upiId(r, f.person.firstName()) },
  { id: "transactionId", label: "Transaction id", group: "Finance", edge: "text", sql: "text", gen: ({ r }) => transactionId(r) },

  // ---------- India formats (fake, format-valid only) ----------
  { id: "inMobile", label: "Mobile (+91)", group: "India formats", edge: "phone", sql: "text", gen: ({ r }) => inMobile(r), note: FAKE_ID_NOTE },
  { id: "pan", label: "PAN format", group: "India formats", edge: "text", sql: "text", gen: ({ r }) => pan(r), note: FAKE_ID_NOTE },
  { id: "gstin", label: "GSTIN format", group: "India formats", edge: "text", sql: "text", gen: ({ r }) => gstin(r), note: FAKE_ID_NOTE },
  { id: "ifsc", label: "IFSC format", group: "India formats", edge: "text", sql: "text", gen: ({ r }) => ifsc(r), note: FAKE_ID_NOTE },
  { id: "pincode", label: "Pincode", group: "India formats", edge: "text", sql: "text", gen: ({ r }) => pincode(r), variety: () => 800000 },
  { id: "vehicleNumber", label: "Vehicle number", group: "India formats", edge: "text", sql: "text", gen: ({ r }) => vehicleNumber(r), note: FAKE_ID_NOTE },
  {
    id: "aadhaar",
    label: "Aadhaar format",
    group: "India formats",
    options: [{ key: "masked", label: "Masked (XXXX XXXX 1234)", kind: "boolean" }],
    defaults: { masked: true },
    edge: "text",
    sql: "text",
    gen: ({ r, o }) => aadhaar(r, bool(o, "masked", true)),
    variety: (o) => (bool(o, "masked", true) ? 10000 : 1e10),
    note: `${FAKE_ID_NOTE} Unmasked numbers always fail the Aadhaar check digit, so none can be real.`,
  },

  // ---------- Commerce & business ----------
  { id: "productName", label: "Product name", group: "Commerce & business", edge: "text", sql: "text", gen: ({ f }) => f.commerce.productName() },
  { id: "category", label: "Category", group: "Commerce & business", edge: "text", sql: "text", gen: ({ f }) => f.commerce.department(), variety: () => 22 },
  {
    id: "sku",
    label: "SKU",
    group: "Commerce & business",
    edge: "text",
    sql: "text",
    gen: ({ f }) => `SKU-${f.string.alpha({ length: 3, casing: "upper" })}-${f.string.numeric({ length: 5, allowLeadingZeros: true })}`,
  },
  {
    id: "price",
    label: "Price",
    group: "Commerce & business",
    options: [...rangeOpts("number"), { key: "decimals", label: "Decimals", kind: "number", min: 0, max: 4 }],
    defaults: { min: 10, max: 5000, decimals: 2 },
    edge: "number",
    sql: "decimal",
    gen: ({ f, o }) => f.number.float({ min: num(o, "min", 10), max: num(o, "max", 5000), fractionDigits: num(o, "decimals", 2) }),
  },
  { id: "companyName", label: "Company name", group: "Commerce & business", edge: "text", sql: "text", gen: ({ f }) => f.company.name() },
  { id: "department", label: "Department", group: "Commerce & business", edge: "text", sql: "text", gen: ({ r }) => r.pick(DEPARTMENTS), variety: () => DEPARTMENTS.length },
  {
    id: "orderStatus",
    label: "Order status",
    group: "Commerce & business",
    edge: "text",
    sql: "text",
    gen: ({ r }) => r.pick(ORDER_STATUSES),
    variety: () => ORDER_STATUSES.length,
  },
  {
    id: "paymentStatus",
    label: "Payment status",
    group: "Commerce & business",
    edge: "text",
    sql: "text",
    gen: ({ r }) => r.pick(PAYMENT_STATUSES),
    variety: () => PAYMENT_STATUSES.length,
  },
  {
    id: "rating",
    label: "Rating (1–5)",
    group: "Commerce & business",
    options: [{ key: "decimals", label: "Decimals", kind: "number", min: 0, max: 2 }],
    defaults: { decimals: 0 },
    edge: "number",
    sql: "decimal",
    gen: ({ f, o }) => (num(o, "decimals", 0) === 0 ? f.number.int({ min: 1, max: 5 }) : f.number.float({ min: 1, max: 5, fractionDigits: num(o, "decimals", 0) })),
    variety: (o) => 4 * 10 ** num(o, "decimals", 0) + 1,
  },

  // ---------- Text ----------
  { id: "word", label: "Word", group: "Text", edge: "text", sql: "text", gen: ({ f }) => f.lorem.word() },
  {
    id: "words",
    label: "Words",
    group: "Text",
    options: [{ key: "count", label: "Count", kind: "number", min: 1, max: 100 }],
    defaults: { count: 3 },
    edge: "text",
    sql: "text",
    gen: ({ f, o }) => f.lorem.words(num(o, "count", 3)),
  },
  { id: "sentence", label: "Sentence", group: "Text", edge: "text", sql: "text", gen: ({ f }) => f.lorem.sentence() },
  {
    id: "paragraph",
    label: "Paragraph",
    group: "Text",
    options: [{ key: "sentences", label: "Sentences", kind: "number", min: 1, max: 20 }],
    defaults: { sentences: 3 },
    edge: "text",
    sql: "longtext",
    gen: ({ f, o }) => f.lorem.paragraph(num(o, "sentences", 3)),
  },
  {
    id: "lorem",
    label: "Lorem ipsum",
    group: "Text",
    options: [{ key: "paragraphs", label: "Paragraphs", kind: "number", min: 1, max: 10 }],
    defaults: { paragraphs: 1 },
    edge: "text",
    sql: "longtext",
    gen: ({ f, o }) => f.lorem.paragraphs(num(o, "paragraphs", 1), "\n\n"),
  },
  {
    id: "customText",
    label: "Custom text",
    group: "Text",
    options: [{ key: "text", label: "Text", kind: "textarea" }],
    defaults: { text: "" },
    edge: "text",
    sql: "text",
    gen: ({ o }) => str(o, "text"),
    variety: () => 1,
  },
  {
    id: "regex",
    label: "Regex pattern",
    group: "Text",
    options: [{ key: "pattern", label: "Pattern", kind: "text", placeholder: "[A-Z]{3}-\\d{4}", help: "Character classes, groups, | and quantifiers." }],
    defaults: { pattern: "[A-Z]{3}-\\d{4}" },
    edge: "text",
    sql: "text",
    gen: ({ r, o }) => generateFromRegex(parseRegex(str(o, "pattern")), r.int),
    variety: (o) => {
      try {
        return regexVariety(parseRegex(str(o, "pattern")));
      } catch {
        return 1e12;
      }
    },
  },

  // ---------- Custom ----------
  {
    id: "pickList",
    label: "Pick from list",
    group: "Custom",
    options: [{ key: "values", label: "Values", kind: "textarea", placeholder: "active:70, inactive:20, banned:10", help: "Comma-separated. Optional weights after a colon." }],
    defaults: { values: "active:70, inactive:20, banned:10" },
    edge: "text",
    sql: "text",
    gen: ({ f, o }) => {
      const items = parsePickList(str(o, "values"));
      return items.length ? f.helpers.weightedArrayElement(items.map((i) => ({ value: i.value, weight: i.weight }))) : null;
    },
    variety: (o) => parsePickList(str(o, "values")).length,
  },
  {
    id: "constant",
    label: "Constant value",
    group: "Custom",
    options: [
      { key: "value", label: "Value", kind: "text" },
      {
        key: "as",
        label: "Type",
        kind: "select",
        choices: [
          { value: "text", label: "Text" },
          { value: "number", label: "Number" },
          { value: "boolean", label: "Boolean" },
        ],
      },
    ],
    defaults: { value: "", as: "text" },
    edge: null,
    sql: "text",
    gen: ({ o }) => (o.as === "number" ? num(o, "value", 0) : o.as === "boolean" ? String(o.value).toLowerCase() === "true" : str(o, "value")),
    variety: () => 1,
  },
  {
    id: "template",
    label: "Template",
    group: "Custom",
    options: [{ key: "template", label: "Template", kind: "text", placeholder: "{{firstName}}.{{lastName}}@example.com", help: "Use {{fieldName}} to insert other fields." }],
    defaults: { template: "" },
    edge: "text",
    sql: "text",
  },
  {
    id: "formula",
    label: "Formula",
    group: "Custom",
    options: [
      { key: "expression", label: "Formula", kind: "text", placeholder: "{{quantity}} * {{unitPrice}}", help: "{{field}} references, numbers, quotes and + - * / ( )." },
      { key: "decimals", label: "Round to decimals", kind: "number", min: 0, max: 10, placeholder: "No rounding" },
    ],
    defaults: { expression: "", decimals: 2 },
    edge: "number",
    sql: "decimal",
  },
  {
    id: "object",
    label: "Nested object",
    group: "Custom",
    edge: null,
    sql: "json",
    note: "Child fields become a nested object in JSON, YAML and XML, and a JSON string in CSV, Excel and SQL.",
  },
  {
    id: "array",
    label: "Array of",
    group: "Custom",
    options: [
      { key: "min", label: "Min items", kind: "number", min: 0, max: 100 },
      { key: "max", label: "Max items", kind: "number", min: 0, max: 100 },
    ],
    defaults: { min: 1, max: 3 },
    edge: null,
    sql: "json",
    note: "Repeats its one child field (use a nested object child for arrays of objects).",
  },
  {
    id: "foreignKey",
    label: "Foreign key",
    group: "Custom",
    options: [
      {
        key: "source",
        label: "Values from",
        kind: "select",
        choices: [
          { value: "field", label: "Another field in this dataset" },
          { value: "list", label: "A pasted list" },
        ],
      },
      { key: "field", label: "Field name", kind: "text", placeholder: "id" },
      { key: "list", label: "List", kind: "textarea", placeholder: "101, 102, 103" },
    ],
    defaults: { source: "field", field: "", list: "" },
    edge: null,
    sql: "text",
  },
];

export const FIELD_TYPES: Record<string, FieldTypeDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const FIELD_TYPE_LIST = defs;

/** Types whose values come from other fields or children rather than a generator. */
export const STRUCTURAL = new Set(["object", "array", "template", "formula", "foreignKey"]);

export const typeLabel = (id: string) => FIELD_TYPES[id]?.label ?? id;

let counter = 0;
export const newFieldId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}`;

/** A new field of a type, with that type's default options. */
export function makeField(name: string, type: string, extra: Partial<Field> = {}): Field {
  return {
    id: newFieldId(),
    name,
    type,
    options: { ...(FIELD_TYPES[type]?.defaults ?? {}) },
    blankPct: 0,
    unique: false,
    edgeCases: false,
    edgePct: 20,
    ...(type === "object" || type === "array" ? { children: [] } : {}),
    ...extra,
  };
}

export { round };
