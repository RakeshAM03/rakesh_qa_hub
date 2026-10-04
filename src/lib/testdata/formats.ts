/**
 * Format-only identifiers: test card numbers and India-style IDs. None of these are real —
 * they follow the published format so validation code can be exercised.
 */

/** Small random source so these helpers work with any seeded generator. */
export type Rand = {
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
};

const DIGITS = "0123456789";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALNUM = DIGITS + LETTERS;

const chars = (r: Rand, pool: string, n: number) => Array.from({ length: n }, () => pool[r.int(0, pool.length - 1)]).join("");

// ---------- Cards ----------

/** Luhn check digit for a number string without its last digit. */
export function luhnCheckDigit(partial: string): number {
  let sum = 0;
  for (let i = 0; i < partial.length; i++) {
    let d = Number(partial[partial.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export function isLuhnValid(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  return digits.length > 1 && luhnCheckDigit(digits.slice(0, -1)) === Number(digits.at(-1));
}

export type CardBrand = "visa" | "mastercard" | "amex" | "discover";

/** Published payment-sandbox test numbers (Stripe / Braintree / Adyen docs). Never real cards. */
export const SANDBOX_CARDS: Record<CardBrand, readonly string[]> = {
  visa: ["4111111111111111", "4242424242424242", "4012888888881881", "4000056655665556"],
  mastercard: ["5555555555554444", "5105105105105100", "2223003122003222", "5200828282828210"],
  amex: ["378282246310005", "371449635398431"],
  discover: ["6011111111111117", "6011000990139424"],
};

/** Prefixes of the sandbox numbers, used for random Luhn-valid numbers (format testing). */
const SANDBOX_PREFIXES: Record<CardBrand, { prefix: string; length: number }[]> = {
  visa: [{ prefix: "411111", length: 16 }, { prefix: "424242", length: 16 }],
  mastercard: [{ prefix: "555555", length: 16 }, { prefix: "222300", length: 16 }],
  amex: [{ prefix: "378282", length: 15 }],
  discover: [{ prefix: "601111", length: 16 }],
};

const BRANDS: CardBrand[] = ["visa", "mastercard", "amex", "discover"];

export function testCardNumber(r: Rand, brand: CardBrand | "any", source: "sandbox" | "luhn"): string {
  const b = brand === "any" ? r.pick(BRANDS) : brand;
  if (source === "sandbox") return r.pick(SANDBOX_CARDS[b]);
  const { prefix, length } = r.pick(SANDBOX_PREFIXES[b]);
  const body = prefix + chars(r, DIGITS, length - prefix.length - 1);
  return body + luhnCheckDigit(body);
}

export function cardBrandOf(num: string): CardBrand | "unknown" {
  if (/^4/.test(num)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(num)) return "mastercard";
  if (/^3[47]/.test(num)) return "amex";
  if (/^6011/.test(num)) return "discover";
  return "unknown";
}

// ---------- India-style formats ----------

/** +91 followed by 10 digits starting 6–9. */
export const inMobile = (r: Rand) => `+91${r.int(6, 9)}${chars(r, DIGITS, 9)}`;

/** 4th character: holder type (P person, C company, H HUF, F firm, …). */
const PAN_HOLDER = "PCHFATBLJG";

/** PAN pattern AAAAA9999A. */
export const pan = (r: Rand) => `${chars(r, LETTERS, 3)}${r.pick([...PAN_HOLDER])}${chars(r, LETTERS, 1)}${chars(r, DIGITS, 4)}${chars(r, LETTERS, 1)}`;

/** GSTIN check character (mod-36 algorithm used by the GST portal). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = ALNUM.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return ALNUM[(36 - (sum % 36)) % 36];
}

/** GSTIN: 2-digit state code + PAN + entity number + Z + check character. */
export function gstin(r: Rand): string {
  const state = String(r.int(1, 37)).padStart(2, "0");
  const first14 = `${state}${pan(r)}${r.int(1, 9)}Z`;
  return first14 + gstinCheckChar(first14);
}

/** IFSC: 4 letters, a 0, 6 letters/digits. */
export const ifsc = (r: Rand) => `${chars(r, LETTERS, 4)}0${chars(r, ALNUM, 6)}`;

/** 6 digits, first digit 1–8. */
export const pincode = (r: Rand) => `${r.int(1, 8)}${chars(r, DIGITS, 5)}`;

const STATE_CODES = ["MH", "KA", "TN", "DL", "GJ", "RJ", "UP", "WB", "KL", "TS", "AP", "PB", "HR", "MP", "BR"];

/** e.g. KA 05 MN 4821 */
export const vehicleNumber = (r: Rand) =>
  `${r.pick(STATE_CODES)} ${String(r.int(1, 99)).padStart(2, "0")} ${chars(r, LETTERS, 2)} ${String(r.int(1, 9999)).padStart(4, "0")}`;

// Verhoeff tables (used by Aadhaar's check digit).
const V_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const V_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const V_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export function verhoeffCheckDigit(partial: string): number {
  let c = 0;
  const digits = [...partial].reverse();
  for (let i = 0; i < digits.length; i++) c = V_D[c][V_P[(i + 1) % 8][Number(digits[i])]];
  return V_INV[c];
}

export function isVerhoeffValid(num: string): boolean {
  let c = 0;
  const digits = [...num].reverse();
  for (let i = 0; i < digits.length; i++) c = V_D[c][V_P[i % 8][Number(digits[i])]];
  return c === 0;
}

/**
 * Aadhaar-format number: 12 digits, first digit 2–9. Masked by default (XXXX XXXX 1234).
 * Unmasked numbers deliberately FAIL the Verhoeff check digit, so they can never be a real
 * Aadhaar number.
 */
export function aadhaar(r: Rand, masked: boolean): string {
  const first11 = `${r.int(2, 9)}${chars(r, DIGITS, 10)}`;
  const valid = verhoeffCheckDigit(first11);
  const wrong = (valid + r.int(1, 9)) % 10;
  const full = first11 + wrong;
  return masked ? `XXXX XXXX ${full.slice(8)}` : `${full.slice(0, 4)} ${full.slice(4, 8)} ${full.slice(8)}`;
}

const UPI_HANDLES = ["examplebank", "testupi", "sandboxpay", "demobank"];

/** name@bank style, with made-up handles. */
export const upiId = (r: Rand, name: string) => `${name.toLowerCase().replace(/[^a-z0-9.]/g, "")}${r.int(1, 999)}@${r.pick(UPI_HANDLES)}`;

export const transactionId = (r: Rand) => `TXN${chars(r, ALNUM, 12)}`;
