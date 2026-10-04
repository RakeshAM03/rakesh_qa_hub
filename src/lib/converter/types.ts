export type InputType = "auto" | "test" | "pageObject";
export type Framework = "auto" | "testng" | "junit5" | "junit4";
export type OutputStyle = "auto" | "test" | "pageObject";
export type LocatorPreference = "keep" | "semantic";

export type ConvertOptions = {
  inputType: InputType;
  framework: Framework;
  outputStyle: OutputStyle;
  locatorPreference: LocatorPreference;
  /** Keep Thread.sleep as page.waitForTimeout instead of removing it. */
  keepSleeps: boolean;
};

export const DEFAULT_OPTIONS: ConvertOptions = {
  inputType: "auto",
  framework: "auto",
  outputStyle: "auto",
  locatorPreference: "keep",
  keepSleeps: false,
};

export type Severity = "info" | "warning" | "attention";

export type ReviewNote = {
  severity: Severity;
  /** 1-based line in the Java input (null for general notes). */
  line: number | null;
  /** 1-based line in the TypeScript output, when known. */
  outLine?: number | null;
  message: string;
};

export type OutputFile = { name: string; kind: "test" | "pageObject"; code: string };

export type ConvertResult = {
  code: string;
  files: OutputFile[];
  notes: ReviewNote[];
  stats: { converted: number; review: number; removed: number; removedKinds: string[] };
  detected: { inputType: "test" | "pageObject" | "snippet"; framework: Exclude<Framework, "auto"> };
};
