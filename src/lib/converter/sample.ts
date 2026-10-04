/** A generic login test + page object, for "Load sample". */
export const SAMPLE_JAVA = `package com.example.tests;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;
import java.time.Duration;

public class LoginPage {
    private WebDriver driver;

    @FindBy(id = "username")
    private WebElement usernameField;

    @FindBy(name = "password")
    private WebElement passwordField;

    @FindBy(css = "button[type='submit']")
    private WebElement loginButton;

    private By errorMessage = By.className("error-message");

    public LoginPage(WebDriver driver) {
        this.driver = driver;
        PageFactory.initElements(driver, this);
    }

    public void login(String username, String password) {
        usernameField.clear();
        usernameField.sendKeys(username);
        passwordField.sendKeys(password);
        loginButton.click();
    }

    public String getErrorText() {
        return driver.findElement(errorMessage).getText();
    }
}

public class LoginTest {
    private WebDriver driver;
    private LoginPage loginPage;

    @BeforeMethod
    public void setUp() {
        driver = new ChromeDriver();
        driver.manage().window().maximize();
        driver.get("https://example.com/login");
        loginPage = new LoginPage(driver);
    }

    @Test(groups = {"smoke"})
    public void verifyLoginWithValidUser() throws InterruptedException {
        loginPage.login("demo.user", "Secret123");
        Thread.sleep(2000);
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        wait.until(ExpectedConditions.visibilityOfElementLocated(By.id("welcome-banner")));
        Assert.assertEquals(driver.getTitle(), "Dashboard");
        Assert.assertTrue(driver.findElement(By.linkText("Log out")).isDisplayed());
    }

    @Test
    public void showsErrorForWrongPassword() {
        loginPage.login("demo.user", "wrong-password");
        Assert.assertEquals(loginPage.getErrorText(), "Invalid username or password");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}
`;
