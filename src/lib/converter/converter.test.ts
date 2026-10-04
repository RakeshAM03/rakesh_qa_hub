import { describe, expect, it } from "vitest";

import { convertJava } from "./convert";
import { detectFramework, detectInputType } from "./detect";
import { methodTitle } from "./java";
import { SAMPLE_JAVA } from "./sample";

/** Converts statements (snippet mode) and returns the body lines inside test(…). */
function body(java: string, opts: Parameters<typeof convertJava>[1] = {}) {
  const { code } = convertJava(java, opts);
  return code
    .split("\n")
    .filter((l) => l.startsWith("  "))
    .map((l) => l.trim());
}
const one = (java: string, opts?: Parameters<typeof convertJava>[1]) => body(java, opts).join("\n");

describe("detection", () => {
  it("detects the test framework from imports and annotations", () => {
    expect(detectFramework("import org.testng.annotations.Test;")).toBe("testng");
    expect(detectFramework("import org.junit.jupiter.api.Test;")).toBe("junit5");
    expect(detectFramework("import org.junit.Test;")).toBe("junit4");
    expect(detectFramework("@BeforeEach void x() {}")).toBe("junit5");
    expect(detectFramework("@Before public void x() {}")).toBe("junit4");
    expect(detectFramework("class X {}")).toBe("testng");
  });
  it("detects the input type", () => {
    expect(detectInputType("class A { @Test void t() {} }")).toBe("test");
    expect(detectInputType("class LoginPage { }")).toBe("pageObject");
    expect(detectInputType("driver.get(\"x\");")).toBe("snippet");
  });
  it("turns method names into test titles", () => {
    expect(methodTitle("verifyLoginWithValidUser")).toBe("verify login with valid user");
    expect(methodTitle("test_checkout_flow")).toBe("checkout flow");
    expect(methodTitle("testLogin")).toBe("login");
    expect(methodTitle("searchByURLParam")).toBe("search by url param");
  });
});

describe("navigation and locators", () => {
  it.each([
    [`driver.get("https://example.com");`, "await page.goto('https://example.com');"],
    [`driver.navigate().to(url);`, "await page.goto(url);"],
    [`driver.navigate().back();`, "await page.goBack();"],
    [`driver.findElement(By.id("x")).click();`, "await page.locator('#x').click();"],
    [`driver.findElement(By.cssSelector(".a > b")).click();`, "await page.locator('.a > b').click();"],
    [`driver.findElement(By.xpath("//div[@id='a']")).click();`, `await page.locator("xpath=//div[@id='a']").click();`],
    [`driver.findElement(By.name("q")).click();`, `await page.locator('[name="q"]').click();`],
    [`driver.findElement(By.className("btn")).click();`, "await page.locator('.btn').click();"],
    [`driver.findElement(By.linkText("Home")).click();`, "await page.getByRole('link', { name: 'Home', exact: true }).click();"],
    [`driver.findElement(By.partialLinkText("Ho")).click();`, "await page.getByRole('link', { name: 'Ho' }).click();"],
    [`driver.findElement(By.tagName("h1")).click();`, "await page.locator('h1').click();"],
  ])("%s", (java, ts) => expect(one(java)).toBe(ts));

  it("prefers semantic locators when asked", () => {
    const opts = { locatorPreference: "semantic" as const };
    expect(one(`driver.findElement(By.cssSelector("[data-testid='save']")).click();`, opts)).toBe("await page.getByTestId('save').click();");
    expect(one(`driver.findElement(By.xpath("//button[text()='Save']")).click();`, opts)).toBe(
      "await page.getByRole('button', { name: 'Save' }).click();",
    );
    expect(one(`driver.findElement(By.cssSelector("input[placeholder='Email']")).click();`, opts)).toBe("await page.getByPlaceholder('Email').click();");
  });

  it("converts element variables and findElements", () => {
    const out = body(`WebElement btn = driver.findElement(By.id("go"));
btn.click();
List<WebElement> rows = driver.findElements(By.cssSelector("tr"));
int n = rows.size();
rows.get(0).click();
for (WebElement row : rows) {
  row.click();
}`);
    expect(out).toEqual([
      "const btn = page.locator('#go');",
      "await btn.click();",
      "const rows = page.locator('tr');",
      "const n = await rows.count();",
      "await rows.nth(0).click();",
      "for (const row of await rows.all()) {",
      "await row.click();",
      "}",
    ]);
  });
});

describe("element actions", () => {
  it.each([
    [`el.sendKeys("text");`, "await el.fill('text');"],
    [`el.sendKeys(Keys.ENTER);`, "await el.press('Enter');"],
    [`el.sendKeys(Keys.chord(Keys.CONTROL, "a"));`, "await el.press('Control+a');"],
    [`el.clear();`, "await el.clear();"],
    [`String t = el.getText();`, "const t = await el.innerText();"],
    [`String v = el.getAttribute("href");`, "const v = await el.getAttribute('href');"],
    [`String v = el.getAttribute("value");`, "const v = await el.inputValue();"],
    [`boolean b = el.isDisplayed();`, "const b = await el.isVisible();"],
    [`boolean b = el.isEnabled();`, "const b = await el.isEnabled();"],
    [`boolean b = el.isSelected();`, "const b = await el.isChecked();"],
    [`new Select(el).selectByVisibleText("India");`, "await el.selectOption({ label: 'India' });"],
    [`new Select(el).selectByValue("in");`, "await el.selectOption('in');"],
    [`new Select(el).selectByIndex(2);`, "await el.selectOption({ index: 2 });"],
  ])("%s", (java, ts) => expect(one(`WebElement el = driver.findElement(By.id("e"));\n${java}`).split("\n")[1]).toBe(ts));

  it("converts page title and URL", () => {
    expect(one(`String t = driver.getTitle();`)).toBe("const t = await page.title();");
    expect(one(`String u = driver.getCurrentUrl();`)).toBe("const u = page.url();");
  });

  it("converts Actions hover, double-click and drag", () => {
    const out = body(`Actions actions = new Actions(driver);
actions.moveToElement(driver.findElement(By.id("menu"))).perform();
actions.doubleClick(driver.findElement(By.id("cell"))).perform();
new Actions(driver).dragAndDrop(driver.findElement(By.id("a")), driver.findElement(By.id("b"))).perform();`);
    expect(out).toEqual([
      "await page.locator('#menu').hover();",
      "await page.locator('#cell').dblclick();",
      "await page.locator('#a').dragTo(page.locator('#b'));",
    ]);
  });
});

describe("waits, sleeps, alerts, frames, scripts", () => {
  it("turns explicit waits into web-first assertions and removes elementToBeClickable", () => {
    const r = convertJava(`WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("x")));
wait.until(ExpectedConditions.elementToBeClickable(By.id("y")));
wait.until(ExpectedConditions.titleContains("Home"));`);
    const out = r.code.split("\n").map((l) => l.trim());
    expect(out).toContain("await expect(page.locator('#x')).toBeVisible();");
    expect(out).toContain("await expect(page).toHaveTitle(/Home/);");
    expect(r.code).not.toContain("#y");
    expect(r.notes.some((n) => /elementToBeClickable/.test(n.message))).toBe(true);
  });

  it("removes Thread.sleep with a review note, or keeps it when asked", () => {
    const r = convertJava(`Thread.sleep(3000);`);
    expect(r.code).not.toMatch(/sleep|waitForTimeout/);
    expect(r.notes[0]).toMatchObject({ severity: "warning", line: 1 });
    expect(r.notes[0].message).toMatch(/^Line 1: `Thread\.sleep\(3000\)` removed/);
    expect(r.stats.removedKinds).toContain("sleeps");
    expect(one(`Thread.sleep(500);`, { keepSleeps: true })).toBe("await page.waitForTimeout(500);");
  });

  it("flags alert handling and converts it to a dialog handler", () => {
    const r = convertJava(`driver.switchTo().alert().accept();`);
    expect(r.code).toContain("page.once('dialog', (dialog) => dialog.accept());");
    expect(r.notes.find((n) => n.severity === "attention")?.message).toMatch(/before the action/);
  });

  it("converts frames and executeScript, with notes", () => {
    expect(one(`driver.switchTo().frame("editor");`)).toBe(`const frame = page.frameLocator('iframe[name="editor"], iframe#editor');`);
    const r = convertJava(`JavascriptExecutor js = (JavascriptExecutor) driver;
js.executeScript("window.scrollTo(0, 0)");
WebElement b = driver.findElement(By.id("b"));
((JavascriptExecutor) driver).executeScript("arguments[0].click();", b);`);
    const out = r.code.split("\n").map((l) => l.trim());
    expect(out).toContain("await page.evaluate(() => { window.scrollTo(0, 0); });");
    expect(out).toContain("await b.evaluate((el) => el.click());");
    expect(r.notes.filter((n) => /executeScript/.test(n.message))).toHaveLength(2);
  });
});

describe("assertions", () => {
  it("maps TestNG assertions (actual, expected) to expect", () => {
    const out = body(`WebElement h = driver.findElement(By.id("h"));
Assert.assertEquals(h.getText(), "Welcome");
Assert.assertTrue(h.isDisplayed());
Assert.assertFalse(h.isDisplayed());
Assert.assertEquals(driver.getTitle(), "Home");
Assert.assertEquals(count, 3);
Assert.assertTrue(ok);
Assert.assertNotNull(user);
Assert.assertTrue(h.getText().contains("Wel"));`);
    expect(out.slice(1)).toEqual([
      "await expect(h).toHaveText('Welcome');",
      "await expect(h).toBeVisible();",
      "await expect(h).toBeHidden();",
      "await expect(page).toHaveTitle('Home');",
      "expect(count).toBe(3);",
      "expect(ok).toBeTruthy();",
      "expect(user).not.toBeNull();",
      "await expect(h).toContainText('Wel');",
    ]);
  });

  it("uses JUnit's (expected, actual) order", () => {
    expect(one(`assertEquals("Home", title);`, { framework: "junit5" })).toBe("expect(title).toBe('Home');");
    expect(one(`assertEquals("msg", 3, count);`, { framework: "junit4" })).toBe("expect(count, 'msg').toBe(3);");
  });

  it("converts SoftAssert to expect.soft", () => {
    expect(body(`SoftAssert sa = new SoftAssert();\nsa.assertEquals(a, 1);\nsa.assertAll();`)).toEqual(["expect.soft(a).toBe(1);"]);
  });
});

describe("test classes", () => {
  it("converts @Test, hooks, groups, skips and driver setup", () => {
    const r = convertJava(`import org.testng.annotations.*;
public class CheckoutTest {
  WebDriver driver;
  @BeforeMethod
  public void setUp() {
    driver = new ChromeDriver();
    driver.get("https://example.com");
  }
  @Test(groups = {"smoke", "regression"})
  public void placesAnOrder() {
    driver.findElement(By.id("buy")).click();
  }
  @Test(enabled = false, description = "Coupon code")
  public void coupon() {}
  @AfterMethod
  public void tearDown() { driver.quit(); }
}`);
    expect(r.code).toContain("test.describe('checkout', () => {");
    expect(r.code).toContain("test.beforeEach(async ({ page }) => {\n    await page.goto('https://example.com');\n  });");
    expect(r.code).toContain("test('places an order @smoke @regression', async ({ page }) => {");
    expect(r.code).toContain("test.skip('Coupon code', async ({ page }) => {");
    expect(r.code).not.toMatch(/afterEach|ChromeDriver|quit/);
    expect(r.files[0].name).toBe("CheckoutTest.spec.ts");
    expect(r.notes.some((n) => /Driver setup/.test(n.message))).toBe(true);
  });

  it("converts a TestNG data provider into a loop", () => {
    const r = convertJava(`public class LoginTest {
  @DataProvider(name = "users")
  public Object[][] users() {
    return new Object[][] { {"a", "1"}, {"b", "2"} };
  }
  @Test(dataProvider = "users")
  public void logsIn(String user, String pass) {
    driver.findElement(By.id("u")).sendKeys(user);
  }
}`);
    expect(r.code).toContain("const users = [ ['a', '1'], ['b', '2'] ];");
    expect(r.code).toContain("for (const [user, pass] of users) {");
    expect(r.code).toContain("test(`logs in ${user}`, async ({ page }) => {");
    expect(r.notes.some((n) => /Data-driven/.test(n.message))).toBe(true);
  });

  it("converts JUnit 5 @ParameterizedTest with @ValueSource and @DisplayName/@Tag", () => {
    const r = convertJava(`import org.junit.jupiter.api.*;
class SearchTest {
  @ParameterizedTest
  @ValueSource(strings = {"shoes", "hats"})
  void searches(String term) { driver.get("https://example.com/?q=" + term); }
  @Test
  @DisplayName("Opens the cart")
  @Tag("smoke")
  void cart() { driver.get("https://example.com/cart"); }
}`);
    expect(r.code).toContain("for (const term of ['shoes', 'hats']) {");
    expect(r.code).toContain("test('Opens the cart @smoke', async ({ page }) => {");
  });
});

describe("page objects", () => {
  it("converts @FindBy fields and By constants into constructor-initialised locators", () => {
    const r = convertJava(`public class SearchPage {
  private WebDriver driver;
  @FindBy(id = "q") private WebElement searchBox;
  @FindBy(how = How.CSS, using = ".result") private List<WebElement> results;
  private static final By SUBMIT = By.xpath("//button[@type='submit']");
  public SearchPage(WebDriver driver) { this.driver = driver; PageFactory.initElements(driver, this); }
  public int search(String term) {
    searchBox.sendKeys(term);
    driver.findElement(SUBMIT).click();
    return results.size();
  }
}`);
    expect(r.files[0]).toMatchObject({ name: "SearchPage.page.ts", kind: "pageObject" });
    const code = r.code;
    expect(code).toContain("readonly searchBox: Locator;");
    expect(code).toContain("this.searchBox = page.locator('#q');");
    expect(code).toContain("this.results = page.locator('.result');");
    expect(code).toContain(`this.SUBMIT = page.locator("xpath=//button[@type='submit']");`);
    expect(code).toContain("async search(term: string): Promise<number> {");
    expect(code).toContain("await this.searchBox.fill(term);");
    expect(code).toContain("await this.SUBMIT.click();");
    expect(code).toContain("return await this.results.count();");
    expect(code).not.toMatch(/PageFactory|driver/);
  });
});

describe("fallbacks and stats", () => {
  it("leaves unconvertible lines as TODO comments with a review note", () => {
    const r = convertJava(`Set<String> handles = driver.getWindowHandles();
driver.findElement(By.id("a")).click();`);
    expect(r.code).toContain("// TODO(convert): Set<String> handles = driver.getWindowHandles();");
    expect(r.notes.some((n) => n.severity === "attention" && /context\.waitForEvent\('page'\)/.test(n.message))).toBe(true);
    expect(r.code).toContain("await page.locator('#a').click();");
  });

  it("converts the sample into a spec and a page object with no Selenium left", () => {
    const r = convertJava(SAMPLE_JAVA);
    expect(r.files.map((f) => f.name)).toEqual(["LoginPage.page.ts", "LoginTest.spec.ts"]);
    expect(r.code).toContain("await page.goto('https://example.com/login');");
    expect(r.code).toContain("test('verify login with valid user @smoke'");
    expect(r.code).toContain("await loginPage.login('demo.user', 'Secret123');");
    expect(r.code).toContain("expect(await loginPage.getErrorText()).toBe('Invalid username or password');");
    expect(r.code).not.toMatch(/Thread\.sleep|driver|WebElement|By\.|TODO/);
    expect(r.stats.removedKinds).toEqual(expect.arrayContaining(["sleeps", "driver setup"]));
    expect(r.detected).toEqual({ inputType: "test", framework: "testng" });
    const sleep = r.notes.find((n) => /Thread\.sleep/.test(n.message));
    expect(sleep?.line).toBe(SAMPLE_JAVA.split("\n").findIndex((l) => l.includes("Thread.sleep")) + 1);
  });
});
