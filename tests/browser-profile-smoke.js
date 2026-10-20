#!/usr/bin/env node

// Real-browser smoke: two sequential sessions, no WeRead login or telemetry.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { Browser, By } = require('selenium-webdriver');
const app = require('../src/weread-challenge');

async function main() {
  const browser = process.env.SMOKE_BROWSER || Browser.CHROME;
  assert.ok([Browser.CHROME, Browser.EDGE].includes(browser));
  const remote = process.env.SMOKE_REMOTE || '';
  // Isolate the test from real reading profiles; the name is stable across sessions.
  const testRoot = remote ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'weread-profile-smoke-'));
  const directory = remote
    ? process.env.SMOKE_PROFILE
    : app.resolveBrowserUserDataDir({ WEREAD_BROWSER: browser }, { tempDir: testRoot });
  assert.ok(directory, 'Remote smoke requires SMOKE_PROFILE on the browser host');
  app.setRuntimeConfigFromEnv({
    WEREAD_BROWSER: browser,
    WEREAD_REMOTE_BROWSER: remote,
    WEREAD_USER_DATA_DIR: directory,
  });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<title>Profile smoke</title><p>Local test page</p>');
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, remote ? '0.0.0.0' : '127.0.0.1', resolve);
    });
    const host = process.env.SMOKE_PAGE_HOST || '127.0.0.1';
    const url = `http://${host}:${server.address().port}/`;
    const marker = `profile-${Date.now()}`;
    const { Options } = require(`selenium-webdriver/${browser === Browser.EDGE ? 'edge' : 'chrome'}`);
    for (let session = 1; session <= 2; session += 1) {
      const options = new Options().addArguments(
        '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
        '--no-proxy-server', '--profile-directory=weread-smoke',
        `--user-data-dir=${app.getRuntimeConfigSnapshot().WEREAD_USER_DATA_DIR}`,
      );
      const builder = app.createChromiumBuilder(options, { browserName: browser });
      if (remote) builder.usingServer(remote);
      const driver = await builder.build();
      try {
        await driver.manage().setTimeouts({ pageLoad: 30000, script: 10000 });
        await driver.get(browser === Browser.EDGE ? 'edge://version/' : 'chrome://version/');
        const profile = await driver.findElement(By.id('profile_path')).getText();
        const pathApi = remote ? path.posix : path;
        assert.equal(pathApi.normalize(profile), pathApi.join(directory, 'weread-smoke'));
        await driver.get(url);
        assert.equal(await driver.getTitle(), 'Profile smoke');
        if (session === 1) {
          await driver.executeScript('localStorage.setItem("weread-smoke", arguments[0])', marker);
        } else {
          assert.equal(await driver.executeScript('return localStorage.getItem("weread-smoke")'), marker);
        }
        console.log(`PASS ${browser} session ${session}: ${profile}`);
        console.log(`Browser version: ${(await driver.getCapabilities()).get('browserVersion')}`);
      } finally {
        await driver.quit();
      }
    }
    console.log('PASS: browser launch, actual profile path, persistent storage and sequential reuse');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (testRoot) fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
