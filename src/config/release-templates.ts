/**
 * The one built-in checklist template. It's generic process content, inserted
 * once by the `new_modules` migration (users can edit or delete it there).
 * E2E global setup re-inserts it after emptying the test database.
 */

export type TemplateGateType = "MANUAL" | "CI_GREEN" | "NO_P0" | "NO_P1" | "VALID_RATE" | "NO_P0_FLAGS" | "CUSTOMER_REGRESSION";

export type TemplateGate = {
  title: string;
  type: TemplateGateType;
  isBlocker: boolean;
  weight: number;
  config?: Record<string, number>;
};

export type TemplateSection = { name: string; gates: TemplateGate[] };

export const STANDARD_TEMPLATE_NAME = "Standard release";

const manual = (title: string): TemplateGate => ({ title, type: "MANUAL", isBlocker: false, weight: 1 });

export const STANDARD_TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    name: "Testing",
    gates: [
      manual("Smoke test passed"),
      { title: "Regression suite passed", type: "CI_GREEN", isBlocker: false, weight: 1 },
      manual("New features tested against acceptance criteria"),
      manual("Cross-browser / responsive checks done"),
      // Added by the customer_issues migration (blocker): mandatory customer-issue regressions passed.
      { title: "Customer issue regression pack passed", type: "CUSTOMER_REGRESSION", isBlocker: true, weight: 1 },
    ],
  },
  {
    name: "Defects",
    gates: [
      { title: "No open P0 bugs", type: "NO_P0", isBlocker: true, weight: 1 },
      { title: "No open P1 bugs", type: "NO_P1", isBlocker: false, weight: 1, config: { maxAllowed: 0 } },
      manual("Known issues documented"),
    ],
  },
  {
    name: "Code & review",
    gates: [
      { title: "No unresolved P0 review flags", type: "NO_P0_FLAGS", isBlocker: false, weight: 1, config: { days: 14 } },
      manual("Release notes reviewed"),
    ],
  },
  {
    name: "Deployment",
    gates: [
      manual("Staging matches production config"),
      manual("Rollback plan documented"),
      manual("Monitoring/alerts in place"),
    ],
  },
];
