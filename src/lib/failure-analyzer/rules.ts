/**
 * Classification rules — edit this file to extend them. A failure gets the
 * first rule (in this order) whose pattern matches its exception type and
 * message. Order puts specific signals before generic ones, e.g. a RestAssured
 * status mismatch is an API error even though it's thrown as an AssertionError.
 */

export type CategoryId = "environment" | "locator" | "api" | "assertion" | "timing" | "data" | "unknown";

export type Category = {
  id: CategoryId;
  label: string;
  owner: string;
  /** Likely a real product bug — offers "Send to Bug Formatter". */
  productBug: boolean;
  fix: string;
};

/** Display order and metadata (legend, sections fall back to this order on ties). */
export const CATEGORIES: Record<CategoryId, Category> = {
  locator: {
    id: "locator",
    label: "Locator / element not found",
    owner: "Automation",
    productBug: false,
    fix: "Check the selector against the current page (Locator Helper can suggest a stable one); prefer test ids or role + name over long CSS/XPath, and make sure the element isn't inside a frame or shadow root.",
  },
  timing: {
    id: "timing",
    label: "Timing / synchronisation",
    owner: "Automation",
    productBug: false,
    fix: "Replace fixed sleeps with explicit waits (WebDriverWait / Playwright auto-waiting); check for overlays, spinners or animations before clicking, and re-find elements after the page re-renders.",
  },
  assertion: {
    id: "assertion",
    label: "Assertion / product behaviour",
    owner: "Product bug (verify)",
    productBug: true,
    fix: "Compare expected vs actual: if the app behaves wrongly, log a bug; if the requirement changed, update the expected value in the test.",
  },
  data: {
    id: "data",
    label: "Test data / setup",
    owner: "Automation / data",
    productBug: false,
    fix: "Check the test data and setup steps: the user/record exists, values are unique per run, files are where the test expects them, and the data provider returns what the test needs.",
  },
  environment: {
    id: "environment",
    label: "Environment / infrastructure",
    owner: "Environment",
    productBug: false,
    fix: "Check the environment: the app and its dependencies are up and reachable, the browser and driver versions match, and the runner has enough memory. Re-run once it's healthy.",
  },
  api: {
    id: "api",
    label: "API / backend error",
    owner: "Product bug (verify)",
    productBug: true,
    fix: "Look at the failing request's status and response body and the server logs around that time; a 5xx is usually a backend bug, a 4xx may be a contract change or bad test data.",
  },
  unknown: {
    id: "unknown",
    label: "Unknown",
    owner: "Needs triage",
    productBug: false,
    fix: "Read the stack trace from the top application frame; if it repeats, add a rule for it in src/lib/failure-analyzer/rules.ts.",
  },
};

export const CATEGORY_ORDER: CategoryId[] = ["locator", "timing", "assertion", "data", "environment", "api", "unknown"];

export const RULES: { category: CategoryId; patterns: RegExp[] }[] = [
  {
    category: "environment",
    patterns: [
      /SessionNotCreatedException/,
      /WebDriverException:\s*unknown error/i,
      /net::ERR_/,
      /ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/,
      // Connection-level Java / HTTP-client errors: the app or a dependency wasn't reachable.
      /java\.net\.(?:ConnectException|SocketTimeoutException|NoRouteToHostException|SocketException)|\bHttpHostConnectException\b|\bConnectTimeoutException\b/,
      /\bConnection (?:refused|reset|timed out)\b|\b(?:connect|read) timed out\b/i,
      /UnknownHostException|getaddrinfo|Name or service not known|DNS (?:lookup|resolution)/,
      /\b(502 Bad Gateway|503 Service Unavailable)\b|\bstatus(?:\s*code)?[\s:=<]*(502|503)\b/i,
      /browser has (?:crashed|disconnected)|Target (?:page, context or browser|closed)|chrome not reachable|session deleted because of page crash|Browser closed/i,
      /OutOfMemoryError|out of memory|JavaScript heap out of memory/i,
    ],
  },
  {
    category: "locator",
    patterns: [
      /NoSuchElementException/,
      /InvalidSelectorException/,
      /strict mode violation/i,
      /waiting for locator/i,
      /element\(s\) not found|Unable to locate element|no such element/i,
      /NoSuchFrameException/,
    ],
  },
  {
    category: "api",
    patterns: [/Expected status code <\d{3}> but was <\d{3}>/i, /\bexpected:?\s*<?2\d\d>? but (?:was|got):?\s*<?[45]\d\d>?/i],
  },
  {
    category: "assertion",
    patterns: [
      /AssertionError|AssertionFailedError|ComparisonFailure|AssertionFailedException/,
      /expected\b[\s\S]{0,200}\bbut (?:found|was)\b/i,
      /expect\(.*\)\.(?:not\.)?to[A-Z]\w*/,
      /^\s*Expected:|^\s*Received:/m,
    ],
  },
  {
    category: "timing",
    patterns: [
      /TimeoutException/,
      /Timeout \d+ms exceeded/i,
      /StaleElementReferenceException/,
      /ElementClickInterceptedException|ElementNotInteractableException|MoveTargetOutOfBoundsException/,
      /not visible|element is not attached|element is outside of the viewport|intercepts pointer events/i,
    ],
  },
  {
    category: "data",
    patterns: [
      /NullPointerException|IllegalArgumentException|IndexOutOfBoundsException|NumberFormatException|ClassCastException/,
      /no such user|user not found|record not found/i,
      /duplicate key|unique constraint|already exists/i,
      /FileNotFoundException|NoSuchFileException|ENOENT/,
      /data ?provider|DataProvider/i,
    ],
  },
  {
    category: "api",
    patterns: [
      /\b(500 Internal Server Error|504 Gateway Timeout|404 Not Found|400 Bad Request|401 Unauthorized|403 Forbidden|409 Conflict|422 Unprocessable)\b/i,
      /\b(?:status(?:\s*code)?|HTTP(?:\/\d(?:\.\d)?)?)[\s:=<]*([45]\d\d)\b/i,
      /RestAssured|io\.restassured/,
    ],
  },
];
