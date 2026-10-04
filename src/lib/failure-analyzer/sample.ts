/** Made-up Selenium/TestNG console output with mixed failures, for "Load sample" (same as tests/fixtures/failure-analyzer/selenium-console.log). */
export const SAMPLE_LOG = `[INFO] Running com.example.tests.ProfileTest
FAILED: updatesDisplayName
org.openqa.selenium.NoSuchElementException: no such element: Unable to locate element: {"method":"css selector","selector":"#display-name"}
  (Session info: chrome=128.0.6613.84)
For documentation on this error, please visit: https://www.selenium.dev/documentation/webdriver/troubleshooting/errors#no-such-element-exception
	at org.openqa.selenium.remote.RemoteWebDriver.findElement(RemoteWebDriver.java:350)
	at com.example.pages.ProfilePage.setName(ProfilePage.java:31)
	at com.example.tests.ProfileTest.updatesDisplayName(ProfileTest.java:27)

FAILED: updatesAvatar
org.openqa.selenium.NoSuchElementException: no such element: Unable to locate element: {"method":"css selector","selector":"#avatar-upload"}
  (Session info: chrome=128.0.6613.84)
	at org.openqa.selenium.remote.RemoteWebDriver.findElement(RemoteWebDriver.java:350)
	at com.example.pages.ProfilePage.setName(ProfilePage.java:31)
	at com.example.tests.ProfileTest.updatesAvatar(ProfileTest.java:41)

FAILED: savesPreferences
org.openqa.selenium.ElementClickInterceptedException: element click intercepted: Element <button id="save">...</button> is not clickable at point (412, 630). Other element would receive the click: <div class="spinner-overlay"></div>
	at org.openqa.selenium.remote.RemoteWebDriver.execute(RemoteWebDriver.java:597)
	at com.example.tests.ProfileTest.savesPreferences(ProfileTest.java:58)

FAILED: showsOrderHistory
java.lang.AssertionError: expected [3] but found [2]
	at org.testng.Assert.fail(Assert.java:110)
	at com.example.tests.ProfileTest.showsOrderHistory(ProfileTest.java:72)

FAILED: loadsProfileApi
java.lang.AssertionError: 1 expectation failed.
Expected status code <200> but was <500>.
	at io.restassured.internal.ValidatableResponseImpl.statusCode(ValidatableResponseImpl.groovy:95)
	at com.example.tests.ProfileTest.loadsProfileApi(ProfileTest.java:88)

FAILED: opensSettings
org.openqa.selenium.SessionNotCreatedException: Could not start a new session. Response code 500. Message: session not created: This version of ChromeDriver only supports Chrome version 126
	at org.openqa.selenium.remote.ProtocolHandshake.createSession(ProtocolHandshake.java:140)
	at com.example.tests.BaseTest.setUp(BaseTest.java:22)

===============================================
Tests run: 9, Failures: 6, Skips: 0
===============================================
`;
