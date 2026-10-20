const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { Browser } = require('selenium-webdriver');
const app = require('../src/weread-challenge');

// Configuration only: no browser, account, or reading session is needed.
test('Windows, macOS and Linux resolve stable native paths', () => {
  const platforms = [
    { pathApi: path.win32, tempDir: 'C:\\Users\\读者 Name\\AppData\\Local\\Temp', cwd: 'D:\\阅读 workspace' },
    { pathApi: path.posix, tempDir: '/var/folders/user/T', cwd: '/Users/读者 Name/workspace' },
    { pathApi: path.posix, tempDir: '/tmp', cwd: '/home/读者 Name/workspace' },
  ];
  for (const runtime of platforms) {
    const { pathApi, tempDir, cwd } = runtime;
    for (const browser of [Browser.CHROME, Browser.EDGE]) {
      const env = { WEREAD_BROWSER: browser };
      assert.equal(app.resolveBrowserUserDataDir(env, runtime),
        pathApi.join(tempDir, 'weread-challenge', browser));
      assert.equal(app.resolveBrowserUserDataDir({ ...env, WEREAD_USER_DATA_DIR: 'profiles/读者 Name' }, runtime),
        pathApi.join(cwd, 'profiles', '读者 Name'));
      const absolute = pathApi.join(tempDir, '专用 profile');
      assert.equal(app.resolveBrowserUserDataDir({ ...env, WEREAD_USER_DATA_DIR: absolute }, runtime), absolute);
    }
    // A remote host may use a different OS; never normalize its paths locally.
    for (const remotePath of ['/profiles/读者 Name', 'E:\\profiles\\读者 Name']) {
      assert.equal(app.resolveBrowserUserDataDir({
        WEREAD_REMOTE_BROWSER: 'http://selenium:4444',
        WEREAD_USER_DATA_DIR: remotePath,
      }, runtime), remotePath);
    }
  }
});

test('local Chromium runs reuse a fixed temporary user data directory', () => {
  for (const browser of [Browser.CHROME, Browser.EDGE]) {
    const env = { WEREAD_BROWSER: browser, WEREAD_USER_DATA_DIR: '' };
    app.setRuntimeConfigFromEnv(env);
    const expected = path.join(os.tmpdir(), 'weread-challenge', browser);
    assert.equal(app.getRuntimeConfigSnapshot().WEREAD_USER_DATA_DIR, expected);
    app.setRuntimeConfigFromEnv(env);
    assert.equal(app.getRuntimeConfigSnapshot().WEREAD_USER_DATA_DIR, expected);
  }
});

test('remote and non-Chromium runs do not inherit a local temporary path', () => {
  for (const env of [
    { WEREAD_REMOTE_BROWSER: 'http://selenium:4444' },
    { WEREAD_BROWSER: Browser.FIREFOX },
    { WEREAD_BROWSER: Browser.SAFARI },
  ]) {
    app.setRuntimeConfigFromEnv(env);
    assert.equal(app.getRuntimeConfigSnapshot().WEREAD_USER_DATA_DIR, '');
  }
  app.setRuntimeConfigFromEnv({
    WEREAD_REMOTE_BROWSER: 'http://selenium:4444',
    WEREAD_USER_DATA_DIR: '/profiles/account-1',
  });
  assert.equal(app.getRuntimeConfigSnapshot().WEREAD_USER_DATA_DIR, '/profiles/account-1');
});

test('explicit directory overrides the default through environment and CLI', () => {
  const directory = path.join(os.tmpdir(), 'weread custom profile');
  app.setRuntimeConfigFromEnv({ WEREAD_USER_DATA_DIR: directory });
  assert.equal(app.getRuntimeConfigSnapshot().WEREAD_USER_DATA_DIR, directory);

  const previous = process.env.WEREAD_USER_DATA_DIR;
  try {
    const cliDirectory = path.join(os.tmpdir(), 'weread cli profile');
    const { flags } = app.parseCliArgs(['--weread-user-data-dir', cliDirectory]);
    app.applyRunCliOverrides(flags);
    assert.equal(app.getRuntimeConfigSnapshot().WEREAD_USER_DATA_DIR, cliDirectory);
  } finally {
    if (previous === undefined) delete process.env.WEREAD_USER_DATA_DIR;
    else process.env.WEREAD_USER_DATA_DIR = previous;
    app.setRuntimeConfigFromEnv();
  }
});

test('Chrome and Edge send user data arguments in their browser capabilities', async () => {
  let sessionRequest;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && req.url === '/session') {
        sessionRequest = JSON.parse(body);
        res.end(JSON.stringify({ value: { sessionId: 'profile-test', capabilities: {} } }));
      } else {
        res.end(JSON.stringify({ value: null }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const [browser, moduleName, capabilityKey] of [
      [Browser.CHROME, 'chrome', 'goog:chromeOptions'],
      [Browser.EDGE, 'edge', 'ms:edgeOptions'],
    ]) {
      app.setRuntimeConfigFromEnv({
        WEREAD_BROWSER: browser,
        WEREAD_USER_DATA_DIR: path.join(os.tmpdir(), '读者 profile'),
      });
      const directory = app.getRuntimeConfigSnapshot().WEREAD_USER_DATA_DIR;
      const { Options } = require(`selenium-webdriver/${moduleName}`);
      const argument = `--user-data-dir=${directory}`;
      const options = new Options().addArguments(argument);
      const driver = await app.createChromiumBuilder(options, { browserName: browser })
        .usingServer(`http://127.0.0.1:${server.address().port}`)
        .build();
      try {
        assert.ok(sessionRequest.capabilities.alwaysMatch[capabilityKey].args.includes(argument));
      } finally {
        await driver.quit();
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    app.setRuntimeConfigFromEnv();
  }
});
