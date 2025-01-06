/**
 * @license
 * Copyright (c) 2024 weread-challenge@techfetch.dev
 * All rights reserved.
 * Licensed under the MIT License.
 * For more information, contact: weread-challenge@techfetch.dev
 * 修改请保留统计代码
 */

const { By, Builder, Browser, until, Key } = require("selenium-webdriver");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const os = require("os");

const WEREAD_VERSION = "0.2.0";
const COOKIE_FILE = "./data/cookies.json"; // Path to save/load cookies
const LOGIN_QR_CODE = "./data/login.png"; // Path to save login QR code
const URL = "https://weread.qq.com/"; // Replace with the target URL
const DEBUG = process.env.DEBUG === "true" || false; // Enable debug mode
const WEREAD_USER = process.env.WEREAD_USER || "weread-default"; // User to use
const WEREAD_REMOTE_BROWSER = process.env.WEREAD_REMOTE_BROWSER;
const WEREAD_DURATION = process.env.WEREAD_DURATION || 10; // Reading duration in minutes
const WEREAD_SPEED = process.env.WEREAD_SPEED || "slow"; // Reading speed, slow | normal | fast
const WEREAD_SELECTION = process.env.WEREAD_SELECTION || 0; // Selection method
const WEREAD_BROWSER = process.env.WEREAD_BROWSER || Browser.CHROME; // Browser to use, chrome | MicrosoftEdge | firefox
const ENABLE_EMAIL = process.env.ENABLE_EMAIL === "true" || false; // Enable email notifications
const WEREAD_AGREE_TERMS = process.env.WEREAD_AGREE_TERMS === "true" || true; // Agree to terms
// env vars:
// WEREAD_REMOTE_BROWSER
// WEREAD_DURATION
// WEREAD_BROWSER
// ENABLE_EMAIL
// EMAIL_SMTP
// EMAIL_USER
// EMAIL_PASS
// EMAIL_FROM
// EMAIL_TO

// create /data directory if not exists
if (!fs.existsSync("./data")) {
  fs.mkdirSync("./data");
}

// override existing log file
const logStream = fs.createWriteStream("./data/output.log", { flags: "w" });

// Utility function to redirect logging
function redirectConsole(method) {
  const originalMethod = console[method];
  console[method] = function (...args) {
    let logstr =
      `[${method.toUpperCase()}][${new Date()
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")}]: ` + args.join(" ");

    // Write to the log file
    logStream.write(logstr + "\r\n");

    // Also log to the console
    console.log(logstr);
  };
}

// Redirect all major console methods
if (!DEBUG) {
  ["info", "warn", "error"].forEach(redirectConsole);
}

function getOSInfo() {
  const platform = os.platform();
  const release = os.release();

  switch (platform) {
    case "win32":
      return `Windows ${release}`;
    case "darwin":
      return `MacOS ${release}`;
    case "linux":
      return `Linux ${release}`;
    default:
      return `${platform} ${release}`;
  }
}
// post data to weread log
function logEventToWereadLog(err) {
  const url = DEBUG
    ? "http://127.0.0.1:8787/logs"
    : "https://weread-challenge.techfetch.dev/logs";
  const httpModule = DEBUG ? http : https;

  let userInfo = getUserInfo();
  let params = {
    os: getOSInfo(),
    browser: WEREAD_BROWSER,
    duration: parseInt(WEREAD_DURATION) || 0,
    enable_email: ENABLE_EMAIL,
    error: err,
    version: WEREAD_VERSION,
  };

  let data = { ...params, ...userInfo };

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "WeRead-Tracker/1.0",
    },
  };

  // log stringified data
  console.info("Logging to WeRead server:", JSON.stringify(data));

  const req = httpModule.request(url, options, (res) => {
    let responseData = "";

    res.on("data", (chunk) => {
      responseData += chunk;
    });

    res.on("end", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.info("Successfully logged to WeRead server");
      } else {
        console.error(
          `Failed to log to WeRead server: ${res.statusCode} - ${responseData}`
        );
      }
    });
  });

  req.on("error", (error) => {
    console.error("Error logging to WeRead server:", error.message);
  });

  req.write(JSON.stringify(data));
  req.end();
}

function getUserInfo() {
  // return empty object if cookies file not found
  if (!fs.existsSync(COOKIE_FILE)) {
    return {};
  }
  // read from cookies
  let cookiesFile = fs.readFileSync(COOKIE_FILE, "utf8");
  let cookies = JSON.parse(cookiesFile);
  let userInfo = {};
  for (const cookie of cookies) {
    if (cookie.secure == undefined) {
      continue;
    }
    switch (cookie.name) {
      case "wr_gid":
        if (cookie.secure == true) {
          userInfo.wr_gid_s = parseInt(cookie.value) || 0;
        } else {
          userInfo.wr_gid = parseInt(cookie.value) || 0;
        }
        break;
      case "wr_name":
        userInfo.wr_name = decodeURIComponent(cookie.value);
        break;
      case "wr_localvid":
        userInfo.wr_localvid = cookie.value;
        break;
      case "wr_gender":
        userInfo.wr_gender = parseInt(cookie.value) || 0;
        break;
      case "wr_avatar":
        userInfo.wr_avatar = decodeURIComponent(cookie.value);
        break;
      case "wr_rt":
        userInfo.wr_rt = cookie.value;
        break;
      case "wr_vid":
        userInfo.wr_vid = parseInt(cookie.value) || 0;
        break;
    }
  }

  return userInfo;
}

async function saveCookies(driver, filePath) {
  const cookies = await driver.manage().getCookies();
  fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
  console.info("Cookies saved successfully.");
}

async function loadCookies(driver, filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn("No cookies file found.");
    return;
  }

  const cookies = JSON.parse(fs.readFileSync(filePath, "utf8"));
  for (const cookie of cookies) {
    await driver.manage().addCookie(cookie);
  }
  console.info("Cookies loaded successfully.");
}

async function pressDownArrow(driver) {
  await driver.actions().sendKeys(Key.ARROW_DOWN).perform();
  // keep the key pressed for random time between 50ms to 500ms
  let randomTime = Math.floor(Math.random() * 450) + 50;
  await new Promise((resolve) => setTimeout(resolve, randomTime));
  // release the down arrow key
  await driver.actions().sendKeys(Key.NULL).perform();
}

// Function to check if element is in viewport
async function isElementInViewport(driver, element) {
  // Get viewport dimensions using JavaScript
  const viewport = await driver.executeScript(`
    return {
      height: window.innerHeight,
      width: window.innerWidth
    };
  `);

  // Get element position and size
  const rect = await driver.executeScript(
    `
    const rect = arguments[0].getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right
    };
  `,
    element
  );

  // Check if element is within viewport
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= viewport.height &&
    rect.right <= viewport.width &&
    (await element.isDisplayed())
  );
}

async function sendMail(subject, text, filePaths = []) {
  const nodemailer = require("nodemailer");
  // Create transporter object using SMTP transport
  let transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP,
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER, // Your email address
      pass: process.env.EMAIL_PASS, // Your email password or app-specific password
    },
  });

  // Convert image paths to attachments array
  const attachments = filePaths.map((filePath) => ({
    filename: path.basename(filePath),
    path: filePath,
    cid: path.basename(filePath), // Content ID for embedding in HTML
    contentType: `image/${path.extname(filePath).substring(1)}`, // Automatically detect image type
  }));

  // Use EMAIL_FROM if provided, otherwise fall back to EMAIL_USER
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  // Email options with updated from field
  let mailOptions = {
    from: fromAddress,
    to: process.env.EMAIL_TO,
    subject: subject,
    attachments: attachments,
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        </style>
    </head>
    <body>
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #2c3e50;">WeRead Challenge Daily Report</h2>
                <p style="color: #7f8c8d;">${new Date().toLocaleDateString()}</p>
            </div>
            
            <div style="background: #f9f9f9; border-left: 4px solid #2980b9; padding: 15px; margin: 20px 0;">
                <p>Dear User,</p>
                <p>${text}</p>
                <p>Here are your reading statistics and achievements for today.</p>
            </div>

            <div class="image-gallery">
                ${attachments
        .map(
          (att) => `
                    <img src="cid:${att.cid}" alt="Reading Progress" style="display: block; margin: 10px auto;"/>
                `
        )
        .join("")}
            </div>

            <div style="margin: 20px 0;">
                <p>Best regards,</p>
                <p style="color: #2980b9;">WeRead Challenge Team</p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            
            <div style="font-size: 12px; color: #7f8c8d; text-align: center;">
                <p>This is an automated message, please do not reply.</p>
            </div>
        </div>
    </body>
    </html>
`,
  };

  try {
    // Send mail with defined transport object
    let info = await transporter.sendMail(mailOptions);
    console.info("Email sent successfully");
    console.info("Message ID: ", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending email: ", error);
    return false;
  }
}

async function main() {
  console.info("Starting the script, datetime: ", new Date());
  let driver;
  try {
    const capabilities = {
      browserName: WEREAD_BROWSER,
    };

    var browser;
    switch (WEREAD_BROWSER) {
      case Browser.CHROME:
        browser = require("selenium-webdriver/chrome");
        break;
      case Browser.EDGE:
        browser = require("selenium-webdriver/edge");
        break;
      case Browser.FIREFOX:
        browser = require("selenium-webdriver/firefox");
        break;
      case Browser.SAFARI:
        browser = require("selenium-webdriver/safari");
        break;
      default:
        browser = require("selenium-webdriver/chrome");
        break;
    }

    let options = new browser.Options();
    switch (WEREAD_BROWSER) {
      case Browser.CHROME:
      case Browser.EDGE:
        options.addArguments("--no-sandbox");
        options.addArguments("--disable-gpu");
        options.addArguments("--disable-dev-shm-usage");
        options.addArguments("--profile-directory=" + WEREAD_USER);
        options.addArguments("--disable-infobars");
        options.addArguments("--disable-extensions");
        options.addArguments("--disable-notifications");
        options.addArguments("--disable-popup-blocking");
        // check if WEREAD_REMOTE_BROWSER is empty
        if (WEREAD_REMOTE_BROWSER) {
          console.info("WEREAD_REMOTE_BROWSER: ", WEREAD_REMOTE_BROWSER);
          driver = await new Builder()
            .usingServer(WEREAD_REMOTE_BROWSER)
            .forBrowser(WEREAD_BROWSER)
            .withCapabilities(capabilities)
            .setChromeOptions(options)
            .build();
        } else {
          console.info("WEREAD_REMOTE_BROWSER not found. Running locally.");
          driver = await new Builder()
            .forBrowser(WEREAD_BROWSER)
            .withCapabilities(capabilities)
            .setChromeOptions(options)
            .build();
        }
        break;
      case Browser.FIREFOX:
        driver = await new Builder().forBrowser(Browser.FIREFOX).build();
        break;
      case Browser.SAFARI:
        driver = await new Builder()
          .forBrowser(Browser.SAFARI)
          .setSafariOptions(options)
          .build();
        break;
      default:
        break;
    }

    console.info("Browser launched successfully.");

    // set screen size
    randomWidth = Math.floor(Math.random() * 1000) + 800;
    randomHeight = Math.floor(Math.random() * 800) + 700;
    await driver
      .manage()
      .window()
      .setRect({ width: randomWidth, height: randomHeight });

    await driver.get(URL);

    if (fs.existsSync(COOKIE_FILE)) {
      await loadCookies(driver, COOKIE_FILE);
      await driver.navigate().refresh(); // Refresh to apply cookies
    }

    console.info("Going to the URL:", URL);

    let title = await driver.getTitle();
    assert.equal("微信读书", title);
    console.info("Successfully opened the url:", URL);

    // create dir data if not exists
    if (!fs.existsSync("./data")) {
      fs.mkdirSync("./data");
    }

    // Check if "Login" hyperlink exists
    console.info("Find login links...");
    let loginLinks = await driver.findElements(
      By.xpath("//a[contains(text(), '登录')]"),
      10000
    );
    if (loginLinks.length > 0) {
      console.info("Login link found. Clicking...");
      // 避免点击不成功
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await loginLinks[0].click();
      // if div contains text "扫码登录微信读书" then get screenshot
      await driver.wait(
        until.elementLocated(
          By.xpath("//div[contains(text(), '扫码登录微信读书')]")
        ),
        10000
      );
      // 避免截图时二维码还未弹出
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // save screenshot of QR code
      await driver.takeScreenshot().then((image, err) => {
        fs.writeFileSync(LOGIN_QR_CODE, image, "base64");
      });
      console.info("QR code saved, datetime: ", new Date());
    }

    let locator1 = By.xpath(
      "//div[contains(text(), '点击刷新二维码') and @class='wr_login_modal_qr_overlay_text']"
    );
    let locator2 = By.xpath(
      "//div[contains(text(), '我的书架') and @class='wr_index_page_top_section_header_action_link']"
    );

    let maxRetries = 3;
    while (maxRetries-- > 0) {
      console.info("Waiting for login...");
      const element = await driver.wait(
        new Promise((resolve, reject) => {
          driver
            .wait(until.elementLocated(locator1), 300000)
            .then(resolve)
            .catch(() => { });
          driver
            .wait(until.elementLocated(locator2), 300000)
            .then(resolve)
            .catch(() => { });
        }),
        300000 // 5 minutes
      );

      if (element === undefined) {
        console.info("no element found");
        continue;
      }

      let text = await element.getText();
      // if text contains "我的书架", then login is successful
      if (text.includes("我的书架")) {
        console.info("Login completed.");
        break;
      }

      // if text contains "点击刷新二维码", then click on it
      if (text.includes("点击刷新二维码")) {
        console.info("Refreshing QR code...");
        await element.click();

        // if div contains text "扫码登录微信读书" then get screenshot
        await driver.wait(
          until.elementLocated(
            By.xpath("//div[contains(text(), '扫码登录微信读书')]")
          ),
          10000
        );

        // 避免截图时二维码还未弹出
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // save screenshot
        await driver.takeScreenshot().then((image, err) => {
          fs.writeFileSync(LOGIN_QR_CODE, image, "base64");
        });

        console.info("QR code refreshed, datetime: ", new Date());
        continue;
      }
    }

    if (maxRetries <= 0) {
      console.error("Failed to login.");
      if (ENABLE_EMAIL) {
        await sendMail("[项目进展--项目停滞]", "Failed to login.");
      }
      return;
    }

    console.info("Successfully logged in.");

    // If cookies exist, save them
    await saveCookies(driver, COOKIE_FILE);

    if (WEREAD_AGREE_TERMS) {
      logEventToWereadLog("");
    }

    // Find the first div with class "wr_index_mini_shelf_card"
    let selection = Number(WEREAD_SELECTION);
    if (selection === 0) {
      // random selection between 1 and 4
      selection = Math.floor(Math.random() * 4) + 1;
    }
    let books = await driver.findElements(
      // By.xpath("(//div[@class='wr_index_mini_shelf_card'])[" + selection + "]"),
      By.xpath("//div[@class='wr_index_mini_shelf_card']"),
      10000
    );
    if (books.length > 0 && books.length < selection) {
      await books[0].click();
      console.info("Clicked on the first book.");
    } else if (books.length >= selection) {
      await books[selection - 1].click();
      console.info("Clicked on the ", selection, "th book.");
    } else {
      console.error("Book not found.");
      return;
    }

    // get button with title equal to "目录"
    await driver.wait(
      until.elementLocated(By.xpath('//button[@title="目录"]')),
      10000
    );

    // get all buttons with title equal to "目录"
    let switchButton = await driver.findElements(
      By.xpath("//button[@title='切换到上下滚动阅读']")
    );
    if (switchButton.length > 0) {
      await switchButton[0].click();
      console.info("Switched to vertical scroll mode.");
    }

    // Wait for button with title "目录"
    await driver.wait(
      until.elementLocated(By.xpath('//button[@title="目录"]')),
      10000
    );
    console.info("Successfully switched to vertical scroll mode.");

    if (ENABLE_EMAIL) {
      await driver
        .takeScreenshot()
        .then((image, err) =>
          fs.writeFileSync("./data/screenshot.png", image, "base64")
        );
      await sendMail("[项目进展--项目启动]", "Login successful.", [
        "./data/screenshot.png",
      ]);
    }

    // run script to keep reading
    // let script = fs.readFileSync("./src/keep_reading.js", "utf8");
    // await driver.executeScript(script);
    console.info("Reading started...");

    // duration from environment variable, WEREAD_DURATION in minutes
    console.info("Reading duration: ", WEREAD_DURATION, " minutes");
    let startTime = new Date();
    console.info("Start time: ", startTime);
    let endTime = new Date(startTime.getTime() + WEREAD_DURATION * 60000);
    console.info("End time: ", endTime);
    let screenshotTime = startTime;
    // log last read time per minute
    while (new Date() < endTime) {
      let currentTime = new Date();
      // wait for random time between 300ms to 1s
      let randomTime = Math.floor(Math.random() * 700) + 300;
      if (WEREAD_SPEED === "fast") {
        randomTime = Math.floor(Math.random() * 100) + 100;
      } else if (WEREAD_SPEED === "normal") {
        randomTime = Math.floor(Math.random() * 400) + 200;
      }
      await new Promise((resolve) => setTimeout(resolve, randomTime));
      if (currentTime.getMinutes() !== screenshotTime.getMinutes()) {
        // take screenshot every minute, and get round index
        let screenshotIndex = Math.round((currentTime - startTime) / 60000);
        await driver.takeScreenshot().then((image, err) => {
          fs.writeFileSync(
            `./data/screenshot-${screenshotIndex}.png`,
            image,
            "base64"
          );
        });
        screenshotTime = currentTime;
        console.info("Reading minute: ", screenshotIndex);

        // if the screenshot png size is less than 100 KB, then refresh the page
        // continue if file not found
        if (!fs.existsSync(`./data/screenshot-${screenshotIndex}.png`)) {
          continue;
        }
        let stats = fs.statSync(`./data/screenshot-${screenshotIndex}.png`);
        let fileSizeInBytes = stats.size;
        let fileSizeInKB = fileSizeInBytes / 1024;
        console.debug("Screenshot size: ", fileSizeInKB, " KB");
        if (fileSizeInKB < 100) {
          await driver.navigate().refresh();
          console.info("Page refreshed.");
        }
      }

      // check if need to jump to the top
      // check if the doc title contains "已读完"
      let title = await driver.getTitle();
      let needToJump = title.includes("已读完");
      // check if got a "span" contains text "开通后即可阅读"
      let openBook = await driver.findElements(
        By.xpath("//span[contains(text(), '开通后即可阅读')]")
      );
      if (openBook.length > 0) {
        console.warn("Need to open the book.");
        needToJump = true;
      }

      // find element div with class "readerFooter_ending_title" and content contains "全 书 完"
      let readComplete = await driver.findElements(
        By.xpath("//div[contains(text(), '全 书 完')]")
      );
      if (readComplete.length > 0) {
        console.warn("Book completed.");
        needToJump = true;
      }

      if (needToJump) {
        console.warn("Book completed.");
        // jump to the top
        // click the buttion "目录"
        let catalogs = await driver.findElements(
          By.xpath('//button[@title="目录"]')
        );
        if (catalogs.length > 0) {
          await catalogs[0].click();
          console.info("Clicked on catalog button.");
        } else {
          console.error("Catalog button not found.");
        }

        // click the first "li" with class "readerCatalog_list_item"
        let chapters = await driver.findElements(
          By.xpath("//li[@class='readerCatalog_list_item']")
        );
        if (chapters.length > 0) {
          // scroll to the top
          await driver.executeScript(
            "arguments[0].scrollIntoView();",
            chapters[0]
          );
          await chapters[1].click();
          console.info("Clicked on first chapter.");
        } else {
          console.error("Chapters not found.");
        }
      }

      // find button with title "下一章" or "下一页"
      let nextChapter = await driver.findElements(
        By.xpath("//button[@title='下一章'] | //button[@title='下一页']")
      );
      if (nextChapter.length !== 0) {
        // check if the button is shown on the screen
        let isVisible = await isElementInViewport(driver, nextChapter[0]);
        if (isVisible) {
          await nextChapter[0].click();
          console.info("Clicked on next chapter button.");
          continue;
        }
      }

      // find div with content contains "点击重试", 未确认
      let retry = await driver.findElements(
        By.xpath("//div[contains(text(), '点击重试')]")
      );
      if (retry.length > 0) {
        console.warn("Retry button found.");
        await retry[0].click();
        console.info("Clicked on retry button.");
        continue;
      }

      // press down arrow key if position is greater than 99
      await pressDownArrow(driver);
      console.debug("Pressed down arrow key.");
    }
    console.info("Reading completed.");

    // save cookies after reading
    await saveCookies(driver, COOKIE_FILE);
    if (ENABLE_EMAIL) {
      await driver
        .takeScreenshot()
        .then((image, err) =>
          fs.writeFileSync("./data/screenshot.png", image, "base64")
        );
      await sendMail("[项目进展--项目完成]", "Reading completed.", [
        "./data/screenshot.png",
      ]);
    }
  } catch (e) {
    console.info(e);
    const errorMessage = String(e?.message || e || "Unknown error");
    if (ENABLE_EMAIL) {
      await sendMail("[项目进展--项目停滞]", "Error occurred: " + errorMessage);
    }

    if (WEREAD_AGREE_TERMS) {
      logEventToWereadLog(errorMessage);
    }

    // wait for 3 seconds before closing the browser
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } finally {
    // cleanup
    console.info("Quitting the browser...");
    if (driver != undefined && driver != null) {
      await driver.quit();
      console.info("Browser closed.");
    }
    process.exit(0);
  }
}

main();
