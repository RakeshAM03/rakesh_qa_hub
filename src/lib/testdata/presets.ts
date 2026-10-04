/** Built-in presets (code only — user presets are DataSchema rows) and default options. */

import { todayIso } from "./dates";
import { makeField } from "./field-types";
import type { Field, GenOptions, OptionValue } from "./types";

export const LOCALES = [
  { value: "en_IN", label: "English (India)" },
  { value: "en_US", label: "English (US)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "ja", label: "Japanese" },
  { value: "ar", label: "Arabic" },
] as const;

export const LOCALE_IDS = LOCALES.map((l) => l.value) as string[];

export function defaultOptions(): GenOptions {
  return {
    rows: 100,
    locale: "en_IN",
    seed: null,
    refDate: todayIso(),
    dataMode: "valid",
    edgeColumns: true,
    format: "csv",
    csv: { delimiter: ",", quoteAll: false, header: true, lineEnding: "lf", bom: false },
    json: { pretty: true, rootKey: "" },
    sql: { table: "test_data", dialect: "postgresql", batchSize: 100, createTable: true },
    xml: { root: "rows", row: "row" },
    xlsx: { sheet: "Test data", freezeHeader: true, autoFit: true },
  };
}

type Spec = [name: string, type: string, options?: Record<string, OptionValue>, extra?: Partial<Field>];

const build = (specs: Spec[]): Field[] =>
  specs.map(([name, type, options, extra]) => {
    const f = makeField(name, type, extra);
    return { ...f, options: { ...f.options, ...options } };
  });

export type Preset = { id: string; label: string; fields: () => Field[] };

export const PRESETS: Preset[] = [
  {
    id: "user",
    label: "User",
    fields: () =>
      build([
        ["id", "sequence", {}, { unique: true }],
        ["firstName", "firstName"],
        ["lastName", "lastName"],
        ["fullName", "template", { template: "{{firstName}} {{lastName}}" }],
        ["email", "email", {}, { unique: true }],
        ["username", "username", {}, { unique: true }],
        ["password", "password"],
        ["phone", "phone"],
        ["dateOfBirth", "dateOfBirth"],
        ["gender", "gender"],
        ["createdAt", "datetime"],
      ]),
  },
  {
    id: "address",
    label: "Address",
    fields: () =>
      build([
        ["street", "street"],
        ["city", "city"],
        ["state", "state"],
        ["postalCode", "postalCode"],
        ["country", "country"],
        ["latitude", "latitude"],
        ["longitude", "longitude"],
      ]),
  },
  {
    id: "payment",
    label: "Payment",
    fields: () =>
      build([
        ["cardHolder", "fullName"],
        ["cardNumber", "creditCard"],
        ["cardType", "pickList", { values: "Visa, Mastercard, American Express, Discover" }],
        ["expiry", "cardExpiry"],
        ["cvv", "cvv"],
        ["upiId", "upiId"],
        ["amount", "amount"],
        ["currency", "currencyCode"],
        ["transactionId", "transactionId", {}, { unique: true }],
        ["status", "paymentStatus"],
      ]),
  },
  {
    id: "order",
    label: "Order",
    fields: () =>
      build([
        ["orderId", "regex", { pattern: "ORD-\\d{6}" }, { unique: true }],
        ["customerEmail", "email"],
        ["product", "productName"],
        ["quantity", "integer", { min: 1, max: 10 }],
        ["unitPrice", "price"],
        ["total", "formula", { expression: "{{quantity}} * {{unitPrice}}", decimals: 2 }],
        ["orderDate", "pastDate"],
        ["status", "orderStatus"],
      ]),
  },
  {
    id: "employee",
    label: "Employee",
    fields: () =>
      build([
        ["employeeId", "regex", { pattern: "EMP\\d{5}" }, { unique: true }],
        ["fullName", "fullName"],
        ["email", "email", {}, { unique: true }],
        ["department", "department"],
        ["jobTitle", "jobTitle"],
        ["salary", "integer", { min: 300000, max: 3000000 }],
        ["joiningDate", "pastDate", { years: 10 }],
        ["manager", "fullName"],
      ]),
  },
  {
    id: "product",
    label: "Product",
    fields: () =>
      build([
        ["sku", "sku", {}, { unique: true }],
        ["name", "productName"],
        ["category", "category"],
        ["price", "price"],
        ["stock", "integer", { min: 0, max: 500 }],
        ["rating", "rating", { decimals: 1 }],
        ["description", "sentence"],
        ["imageUrl", "template", { template: "https://example.com/images/{{sku}}.jpg" }],
      ]),
  },
  {
    id: "login",
    label: "Login credentials",
    fields: () =>
      build([
        ["username", "username"],
        ["email", "email"],
        ["password", "password"],
        ["invalidPassword", "invalidPassword"],
      ]),
  },
  {
    id: "api-body",
    label: "API request body",
    fields: () => {
      const [address] = build([["address", "object"]]);
      address.children = build([
        ["city", "city"],
        ["pincode", "pincode"],
      ]);
      const [tags] = build([["tags", "array", { min: 1, max: 3 }]]);
      tags.children = build([["tag", "word"]]);
      const [body] = build([["requestBody", "object"]]);
      body.children = [
        ...build([
          ["name", "fullName"],
          ["email", "email"],
          ["age", "integer", { min: 18, max: 80 }],
        ]),
        address,
        tags,
      ];
      return [body];
    },
  },
  {
    id: "india-kyc",
    label: "India (KYC-style)",
    fields: () =>
      build([
        ["fullName", "fullName"],
        ["mobile", "inMobile"],
        ["pan", "pan"],
        ["gstin", "gstin"],
        ["ifsc", "ifsc"],
        ["pincode", "pincode"],
        ["state", "state"],
        ["city", "city"],
        ["aadhaar", "aadhaar"],
      ]),
  },
];
