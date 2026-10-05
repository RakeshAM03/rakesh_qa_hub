import {
  ArrowRightLeft,
  BookMarked,
  ClipboardList,
  Crosshair,
  Database,
  FileSignature,
  FlaskConical,
  GitBranch,
  LayoutGrid,
  ListChecks,
  Rocket,
  Send,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  title: string;
  href: string;
};

export type NavItem = NavLink & {
  icon: LucideIcon;
  /** One-line description shown on the home page card. */
  description: string;
  /** Icon chip colours on the home page (literal classes for Tailwind). */
  tone: string;
  /** Module uses or prepares AI (Claude) work — shows an "AI" badge. */
  ai?: boolean;
  /** Sub-pages; when present the item renders as an expandable group. */
  children?: NavLink[];
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    title: "Test Planning",
    items: [
      {
        title: "Test Case Generator",
        href: "/test-case-generator",
        icon: ListChecks,
        description: "Turn requirements into functional, non-functional and API test cases.",
        tone: "bg-blue-100 text-blue-700",
        ai: true,
      },
      {
        title: "TC Library",
        href: "/tc-library",
        icon: BookMarked,
        description: "Save approved PR analyses and test plans to reuse later.",
        tone: "bg-teal-100 text-teal-700",
        ai: true,
      },
      {
        title: "Risk-Based Test Planner",
        href: "/risk-planner",
        icon: ShieldAlert,
        description: "Score features by risk and get a prioritised test plan for your sprint.",
        tone: "bg-amber-100 text-amber-700",
      },
      {
        title: "Release Readiness",
        href: "/release-readiness",
        icon: Rocket,
        description: "Track quality gates per release and record the Go / No-Go decision.",
        tone: "bg-green-100 text-green-700",
      },
    ],
  },
  {
    title: "Test Execution",
    items: [
      {
        title: "PR QA Session",
        href: "/pr-qa-session",
        icon: FlaskConical,
        description: "Build a full QA session prompt for Claude Code from PR URLs.",
        tone: "bg-purple-100 text-purple-700",
        ai: true,
      },
      {
        title: "API Test Playground",
        href: "/api-playground",
        icon: Send,
        description: "Build and send HTTP requests, assert on responses, save them in collections.",
        tone: "bg-indigo-100 text-indigo-700",
      },
      {
        title: "Bug Tracker",
        href: "/bug-tracker",
        icon: LayoutGrid,
        description: "Track QA issues per feature and team, with % valid at a glance.",
        tone: "bg-rose-100 text-rose-700",
        children: [
          { title: "Dashboard", href: "/bug-tracker" },
          { title: "Activity", href: "/bug-tracker/activity" },
          { title: "Workload", href: "/bug-tracker/workload" },
        ],
      },
      {
        title: "Bug Formatter",
        href: "/bug-formatter",
        icon: FileSignature,
        description: "Turn findings, forms or CSVs into clean Markdown for Jira or Slack.",
        tone: "bg-orange-100 text-orange-700",
        ai: true,
      },
      {
        title: "AI PR Review",
        href: "/ai-pr-review",
        icon: ShieldCheck,
        description: "Generate a code review prompt and log the flags Claude finds.",
        tone: "bg-violet-100 text-violet-700",
        ai: true,
      },
    ],
  },
  {
    title: "Automation",
    items: [
      {
        title: "CI Reports",
        href: "/ci",
        icon: GitBranch,
        description: "Trigger and monitor the GitHub Actions regression suites you add.",
        tone: "bg-blue-100 text-blue-700",
        ai: true,
      },
      {
        title: "Test Failure Analyzer",
        href: "/failure-analyzer",
        icon: Stethoscope,
        description: "Group test failures by root cause: script issues vs likely product bugs.",
        tone: "bg-rose-100 text-rose-700",
        ai: true,
      },
      {
        title: "Locator Helper",
        href: "/locator-helper",
        icon: Crosshair,
        description: "Paste HTML, pick an element, and get stable Selenium and Playwright locators.",
        tone: "bg-cyan-100 text-cyan-700",
        ai: true,
      },
      {
        title: "Selenium → Playwright",
        href: "/selenium-to-playwright",
        icon: ArrowRightLeft,
        description: "Convert Selenium Java tests and page objects to Playwright TypeScript.",
        tone: "bg-violet-100 text-violet-700",
        ai: true,
      },
      {
        title: "Test Data Generator",
        href: "/test-data-generator",
        icon: Database,
        description: "Generate realistic fake data and edge cases in CSV, JSON, Excel, SQL and more.",
        tone: "bg-teal-100 text-teal-700",
      },
    ],
  },
  {
    title: "Reports & Insights",
    items: [
      {
        title: "QA Tracker",
        href: "/qa-tracker",
        icon: ClipboardList,
        description: "Log daily QA tasks and time spent, with analytics and history.",
        tone: "bg-green-100 text-green-700",
      },
      {
        title: "Automation ROI",
        href: "/automation-roi",
        icon: TrendingUp,
        description: "Track how much time automation saves and how coverage is growing.",
        tone: "bg-emerald-100 text-emerald-700",
      },
    ],
  },
];

/** Every module, in sidebar order. */
export const navItems: NavItem[] = navGroups.flatMap((g) => g.items);

/** True when `pathname` is `href` or one of its sub-routes. */
export function isActivePath(pathname: string, href: string, exact = false) {
  if (exact || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A group's child link is active on its own route. The child that shares the
 * group's href (e.g. Dashboard) also owns any other sub-route, such as
 * /bug-tracker/[featureId].
 */
export function isNavChildActive(pathname: string, item: NavItem, child: NavLink) {
  if (child.href !== item.href) return isActivePath(pathname, child.href);
  const ownedBySibling = (item.children ?? []).some(
    (c) => c.href !== item.href && isActivePath(pathname, c.href),
  );
  return isActivePath(pathname, item.href) && !ownedBySibling;
}
