import type { Framework } from "./types";

/** TestNG / JUnit 5 / JUnit 4 from imports, then annotations. Defaults to TestNG. */
export function detectFramework(src: string): Exclude<Framework, "auto"> {
  if (/import\s+org\.testng\./.test(src)) return "testng";
  if (/import\s+(static\s+)?org\.junit\.jupiter\./.test(src)) return "junit5";
  if (/import\s+(static\s+)?org\.junit\.(Test|Before|After|Assert|BeforeClass|AfterClass)\b/.test(src)) return "junit4";
  if (/@(BeforeMethod|AfterMethod|DataProvider|BeforeSuite|BeforeTest)\b/.test(src)) return "testng";
  if (/@(BeforeEach|AfterEach|BeforeAll|AfterAll|ParameterizedTest|DisplayName)\b/.test(src)) return "junit5";
  if (/@(Before|After)\b(?!\w)/.test(src)) return "junit4";
  return "testng";
}

/** "test" when a class has test methods; "pageObject" for classes without; "snippet" for bare statements. */
export function detectInputType(src: string): "test" | "pageObject" | "snippet" {
  if (!/\bclass\s+\w+/.test(src)) return "snippet";
  if (/@(Test|ParameterizedTest|RepeatedTest)\b/.test(src)) return "test";
  return "pageObject";
}
