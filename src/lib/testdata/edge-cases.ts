/**
 * Edge-case / negative values per kind of field. Each entry has a short label that ends up in
 * the `_edgeCaseType` column and the preview tooltip.
 */

import { formatParts } from "./dates";
import type { EdgeKind } from "./field-types";
import type { FieldValue, OptionValue } from "./types";

export type EdgeCase = { label: string; value: FieldValue };
type Opts = Record<string, OptionValue>;

const long = (n: number) => "abcdefghij".repeat(Math.ceil(n / 10)).slice(0, n);

export const TEXT_EDGES: EdgeCase[] = [
  { label: "empty string", value: "" },
  { label: "single space", value: " " },
  { label: "leading/trailing spaces", value: "  padded value  " },
  { label: "255 chars", value: long(255) },
  { label: "256 chars", value: long(256) },
  { label: "1000 chars", value: long(1000) },
  { label: "5000 chars", value: long(5000) },
  { label: "accented Unicode", value: "Crème brûlée, Ñandú, über" },
  { label: "emoji", value: "Party 🎉😀👍🏽" },
  { label: "RTL Arabic", value: "مرحبا بالعالم" },
  { label: "RTL Hebrew", value: "שלום עולם" },
  { label: "Chinese", value: "你好世界" },
  { label: "Japanese", value: "こんにちは世界" },
  { label: "zero-width characters", value: "zero​width‍joiner" },
  { label: "newline", value: "line one\nline two" },
  { label: "tab", value: "col one\tcol two" },
];

export const SECURITY_EDGES: EdgeCase[] = [
  { label: "SQL injection", value: "' OR '1'='1" },
  { label: "SQL injection (comment)", value: "admin'--" },
  { label: "XSS script tag", value: "<script>alert(1)</script>" },
  { label: "HTML tags", value: '<b>bold</b><img src=x onerror="alert(1)">' },
  { label: "path traversal", value: "../../etc/passwd" },
  { label: "command injection", value: "; ls -la" },
  { label: "format string", value: "%s%n%x%d" },
  { label: "null byte", value: "null\u0000byte" },
];

/** Shared by every string-like kind: blanks and the two most common attacks. */
const COMMON_STRING: EdgeCase[] = [TEXT_EDGES[0], TEXT_EDGES[2], SECURITY_EDGES[0], SECURITY_EDGES[2]];

const EMAIL_EDGES: EdgeCase[] = [
  { label: "missing @", value: "user.example.com" },
  { label: "double @", value: "user@@example.com" },
  { label: "no domain", value: "user@" },
  { label: "spaces", value: "first last@example.com" },
  { label: "local part 65 chars", value: `${long(65)}@example.com` },
  { label: "uppercase", value: "USER.NAME@EXAMPLE.COM" },
  { label: "plus-addressing", value: "user+tag@example.com" },
  { label: "IDN domain", value: "user@exämple.com" },
  { label: "trailing dot", value: "user@example.com." },
  ...COMMON_STRING,
];

const PHONE_EDGES: EdgeCase[] = [
  { label: "too short", value: "12345" },
  { label: "too long", value: "+9198765432101234" },
  { label: "letters", value: "98765abcde" },
  { label: "missing country code", value: "9876543210" },
  { label: "spaces and dashes", value: "+91 98765-43210" },
  { label: "+ only", value: "+" },
  ...COMMON_STRING,
];

export const INVALID_PASSWORDS: EdgeCase[] = [
  { label: "too short", value: "Ab1!" },
  { label: "no number", value: "Password!" },
  { label: "no symbol", value: "Password1" },
  { label: "only spaces", value: "        " },
  { label: "common password", value: "password" },
  { label: "common password", value: "123456" },
  { label: "common password", value: "qwerty" },
  { label: "max length + 1 (129 chars)", value: long(129) },
];

const PASSWORD_EDGES: EdgeCase[] = [...INVALID_PASSWORDS, SECURITY_EDGES[0]];

const BOOLEAN_EDGES: EdgeCase[] = [
  { label: '"true" as text', value: "true" },
  { label: "1", value: 1 },
  { label: "0", value: 0 },
  { label: "null", value: null },
];

function numberEdges(o: Opts): EdgeCase[] {
  const min = Number(o.min ?? 0);
  const max = Number(o.max ?? 1000);
  const hasRange = o.min !== undefined && o.max !== undefined && Number.isFinite(min) && Number.isFinite(max);
  return [
    { label: "zero", value: 0 },
    { label: "-1", value: -1 },
    ...(hasRange
      ? [
          { label: "min", value: min },
          { label: "max", value: max },
          { label: "min - 1", value: min - 1 },
          { label: "max + 1", value: max + 1 },
        ]
      : []),
    { label: "2^31", value: 2 ** 31 },
    { label: "2^53", value: 2 ** 53 },
    { label: "decimal where integer expected", value: 1.5 },
    { label: "NaN as text", value: "NaN" },
    { label: "scientific notation", value: "1e10" },
    { label: "leading zeros", value: "007" },
    { label: "text", value: "abc" },
  ];
}

function dateEdges(o: Opts): EdgeCase[] {
  const fmt = typeof o.format === "string" && o.format && o.format !== "iso" ? o.format : "YYYY-MM-DD";
  const f = (y: number, m: number, d: number) => formatParts({ y, m, d }, fmt);
  return [
    { label: "29 Feb (leap year)", value: f(2024, 2, 29) },
    { label: "29 Feb (non-leap, invalid)", value: f(2023, 2, 29) },
    { label: "31 Apr (invalid)", value: f(2025, 4, 31) },
    { label: "year 1900", value: f(1900, 1, 1) },
    { label: "year 9999", value: f(9999, 12, 31) },
    { label: "far future", value: f(2999, 6, 15) },
    { label: "epoch start", value: f(1970, 1, 1) },
    { label: "wrong format", value: fmt.startsWith("YYYY") ? "31/12/2024" : "2024-12-31" },
    { label: "DST change (Europe)", value: "2025-03-30T02:30:00+01:00" },
    { label: "DST change (US)", value: "2025-11-02T01:30:00-05:00" },
    COMMON_STRING[0],
  ];
}

export function edgeCasesFor(kind: EdgeKind, o: Opts): EdgeCase[] {
  switch (kind) {
    case "text":
      return [...TEXT_EDGES, ...SECURITY_EDGES];
    case "email":
      return EMAIL_EDGES;
    case "phone":
      return PHONE_EDGES;
    case "password":
      return PASSWORD_EDGES;
    case "boolean":
      return BOOLEAN_EDGES;
    case "number":
      return numberEdges(o);
    case "date":
      return dateEdges(o);
  }
}
