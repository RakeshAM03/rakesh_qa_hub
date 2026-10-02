export const FLAG_TYPES = [
  "LOGIC_ERROR",
  "REGRESSION_RISK",
  "SECURITY",
  "MISSING_ERROR_HANDLING",
  "REQUIREMENT_FIDELITY",
] as const;
export type FlagTypeKey = (typeof FLAG_TYPES)[number];

export const FLAG_TYPE_LABELS: Record<FlagTypeKey, string> = {
  LOGIC_ERROR: "Logic Error",
  REGRESSION_RISK: "Regression Risk",
  SECURITY: "Security",
  MISSING_ERROR_HANDLING: "Missing Error Handling",
  REQUIREMENT_FIDELITY: "Requirement Fidelity",
};

export const FLAG_SEVERITIES = ["P0", "P1"] as const;
export type FlagSeverity = (typeof FLAG_SEVERITIES)[number];

/** "Logic Error", "logic-error", "LOGIC_ERROR", "Logic" → LOGIC_ERROR; null when unknown. */
export function toFlagType(value: string | undefined | null): FlagTypeKey | null {
  const norm = (value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!norm) return null;
  for (const key of FLAG_TYPES) {
    const label = FLAG_TYPE_LABELS[key].toLowerCase().replace(/[^a-z]/g, "");
    if (norm === label) return key;
  }
  // Unambiguous prefixes such as "Logic", "Regression", "Missing Error", "Requirement"
  const matches = FLAG_TYPES.filter((k) =>
    FLAG_TYPE_LABELS[k].toLowerCase().replace(/[^a-z]/g, "").startsWith(norm),
  );
  return matches.length === 1 && norm.length >= 4 ? matches[0] : null;
}
