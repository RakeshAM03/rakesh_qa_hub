import {
  BookMarked,
  CalendarDays,
  ClipboardList,
  FileSignature,
  FlaskConical,
  GitBranch,
  LayoutGrid,
  ShieldCheck,
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
  /** Sub-pages; when present the item renders as an expandable group. */
  children?: NavLink[];
};

export const navItems: NavItem[] = [
  {
    title: "CI Reports",
    href: "/ci",
    icon: GitBranch,
    description: "Trigger and monitor the GitHub Actions regression suites you add.",
  },
  {
    title: "Bug Tracker",
    href: "/bug-tracker",
    icon: LayoutGrid,
    description: "Track QA issues per feature and team, with % valid at a glance.",
    children: [
      { title: "Dashboard", href: "/bug-tracker" },
      { title: "Activity", href: "/bug-tracker/activity" },
      { title: "Workload", href: "/bug-tracker/workload" },
    ],
  },
  {
    title: "QA Tracker",
    href: "/qa-tracker",
    icon: ClipboardList,
    description: "Log daily QA tasks and time spent, with analytics and history.",
  },
  {
    title: "QA Digest",
    href: "/qa-digest",
    icon: CalendarDays,
    description: "A periodic summary of QA activity. Coming soon.",
  },
  {
    title: "PR QA Session",
    href: "/pr-qa-session",
    icon: FlaskConical,
    description: "Build a full QA session prompt for Claude Code from PR URLs.",
  },
  {
    title: "AI PR Review",
    href: "/ai-pr-review",
    icon: ShieldCheck,
    description: "Generate a code review prompt and log the flags Claude finds.",
  },
  {
    title: "TC Library",
    href: "/tc-library",
    icon: BookMarked,
    description: "Save approved PR analyses and test plans to reuse later.",
  },
  {
    title: "Bug Formatter",
    href: "/bug-formatter",
    icon: FileSignature,
    description: "Turn findings, forms or CSVs into clean Markdown for Jira or Slack.",
  },
];

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
