import type { CategoryId } from "./rules";

export type FailureSource = "paste" | "testng" | "junit" | "playwright" | "ci";

export type Failure = {
  testName: string;
  className?: string;
  suite?: string;
  durationMs?: number;
  message: string;
  stackTrace: string;
  source: FailureSource;
};

export type ParseResult = {
  failures: Failure[];
  passed?: number;
  skipped?: number;
  /** Formats seen, e.g. ["testng", "junit"]. */
  sources: FailureSource[];
  warnings: string[];
};

export type Cluster = {
  /** Stable id: hash of category + normalised message + top app frame. */
  signature: string;
  category: CategoryId;
  /** First line of a representative failure message (raw). */
  message: string;
  normalized: string;
  /** Top application stack frame, without line numbers ("" if none). */
  frame: string;
  tests: string[];
  count: number;
  /** Representative failure: full message and up to 40 stack lines. */
  sample: { testName: string; message: string; stack: string[] };
};

export type CategorySummary = { category: CategoryId; count: number; clusters: Cluster[] };

export type Analysis = {
  total: number;
  passed?: number;
  skipped?: number;
  categories: CategorySummary[];
  categoryCounts: Record<CategoryId, number>;
  verdict: string;
};
