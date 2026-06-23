#!/usr/bin/env node

/**
 * HTTP API 冒烟测试
 * 启动 weread-challenge 子进程，轮询 /health 直到就绪，验证各端点。
 *
 * 用法:
 *   node tests/http-api-smoke.js                    # 默认端口 8788
 *   node tests/http-api-smoke.js --port 9090        # 自定义端口
 *   node tests/http-api-smoke.js --keep-running     # 测试后不 kill 子进程
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const SCRIPT_ENTRY = path.join(ROOT_DIR, 'src', 'weread-challenge.js');

// ---- 参数解析 ----
const args = process.argv.slice(2);
const flags = { port: 8788, 'keep-running': false };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    flags.port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--keep-running') {
    flags['keep-running'] = true;
  }
}

const PORT = flags.port;
const BASE = `http://localhost:${PORT}`;
const POLL_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 500;

let failures = 0;
let childProc = null;

// ---- 工具函数 ----
function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        timeout: 5000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const isJson = (res.headers['content-type'] || '').includes('json');
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: isJson ? JSON.parse(body.toString()) : body,
            rawBody: body,
          });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await request('GET', '/health');
      if (res.status === 200) return res;
    } catch (_) {}
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`/health 未在 ${timeoutMs}ms 内就绪`);
}

function assert(condition, message) {
  if (!condition) {
    failures++;
    console.error(`  ✕ FAIL: ${message}`);
  } else {
    console.log(`  ✓ PASS: ${message}`);
  }
}

async function assertStatus(pathname, expectedStatus, label) {
  try {
    const res = await request('GET', pathname);
    assert(
      res.status === expectedStatus,
      `${label || pathname}: 期望 ${expectedStatus} → 实际 ${res.status}`
    );
    if (res.status === 200 && typeof res.body === 'object') {
      console.log(`    body: ${JSON.stringify(res.body).slice(0, 200)}`);
    }
    return res;
  } catch (err) {
    failures++;
    console.error(`  ✕ FAIL: ${label || pathname}: 请求失败 — ${err.message}`);
    return null;
  }
}

// ---- 清理 ----
function cleanup(exitCode = 0) {
  if (childProc && !childProc.killed) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${childProc.pid} /T /F 2>nul`, { stdio: 'ignore' });
      } else {
        childProc.kill('SIGTERM');
      }
    } catch (_) {}
  }
  if (!flags['keep-running']) {
    process.exit(exitCode);
  }
}

function ensureDataDir() {
  const dirs = [path.join(ROOT_DIR, '.weread'), path.join(ROOT_DIR, 'data')];
  for (const d of dirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    // 清理上次运行的 login.png，避免干扰 /qr 测试
    const qr = path.join(d, 'login.png');
    if (fs.existsSync(qr)) fs.unlinkSync(qr);
  }
}

// ---- 主流程 ----
async function main() {
  console.log('=== HTTP API 冒烟测试 ===');
  console.log(`端口: ${PORT}\n`);

  ensureDataDir();

  console.log('1. 启动 weread-challenge 子进程...');
  childProc = spawn('node', [SCRIPT_ENTRY, 'run'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      WEREAD_API_PORT: String(PORT),
      WEREAD_DURATION: '1',
      WEREAD_REMOTE_BROWSER: '',
      WEREAD_BROWSER: 'chrome',
      WEREAD_SCREENSHOT: 'false',
      ENABLE_EMAIL: 'false',
      WEREAD_AGREE_TERMS: 'false',
      BARK_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = [];
  childProc.stderr.on('data', (c) => stderrBuf.push(c));
  childProc.on('exit', (code) => console.log(`\n子进程退出, code=${code}`));
  childProc.on('error', (err) => {
    console.error(`子进程启动失败: ${err.message}`);
    process.exit(1);
  });

  console.log('2. 等待 HTTP API 就绪...');
  try {
    await pollHealth(POLL_TIMEOUT_MS);
    console.log('   HTTP API 已就绪\n');
  } catch (err) {
    console.error(`   ✕ ${err.message}`);
    console.error(`   stderr: ${Buffer.concat(stderrBuf).toString().slice(0, 500)}`);
    cleanup(1);
    return;
  }

  console.log('3. 测试端点:');

  const health = await assertStatus('/health', 200, '/health');
  if (health?.body) {
    assert(typeof health.body.phase === 'string', '/health 含 phase 字段');
  }

  const config = await assertStatus('/config', 200, '/config');
  if (config?.body) {
    assert(typeof config.body.WEREAD_USER === 'string', '/config 含 WEREAD_USER');
    assert(typeof config.body.WEREAD_API_PORT === 'number', '/config 含 WEREAD_API_PORT');
    if (config.body.BARK_KEY !== undefined) {
      assert(config.body.BARK_KEY === '' || config.body.BARK_KEY.includes('****'), '/config BARK_KEY 脱敏');
    }
    if (config.body.EMAIL_PASS !== undefined) {
      assert(config.body.EMAIL_PASS === '' || config.body.EMAIL_PASS.includes('****'), '/config EMAIL_PASS 脱敏');
    }
  }

  const progress = await assertStatus('/progress', 200, '/progress');
  if (progress?.body) {
    assert(typeof progress.body.elapsedMinutes === 'number', '/progress 含 elapsedMinutes');
  }

  const book = await assertStatus('/book', 200, '/book');
  if (book?.body) {
    assert(typeof book.body.url === 'string', '/book 含 url');
  }

  await assertStatus('/qr', 404, '/qr (无登录 → 404)');

  // 过期二维码测试：创建一个 4 分钟前的 login.png，验证 /qr 返回 404
  console.log('\n4. 过期二维码测试:');
  const expiredQrPath = path.join(ROOT_DIR, '.weread', 'login.png');
  fs.writeFileSync(expiredQrPath, Buffer.from([0x89, 0x50, 0x4E, 0x47]));
  const expiredTime = new Date(Date.now() - 4 * 60 * 1000);
  fs.utimesSync(expiredQrPath, expiredTime, expiredTime);
  const qrExpired = await assertStatus('/qr', 404, '/qr (过期 → 404)');
  if (qrExpired?.body) {
    assert(qrExpired.body.error === 'QR code expired', '/qr 过期响应含 error');
    assert(typeof qrExpired.body.ageMinutes === 'number', '/qr 过期响应含 ageMinutes');
  }
  fs.unlinkSync(expiredQrPath);

  const unknown = await assertStatus('/unknown', 404, '/unknown → 404');
  if (unknown?.body) {
    assert(Array.isArray(unknown.body.endpoints), '404 含 endpoints 列表');
  }

  try {
    const corsRes = await request('OPTIONS', '/health');
    assert(corsRes.status === 204, 'OPTIONS /health → 204');
    assert(corsRes.headers['access-control-allow-origin'] === '*', 'Access-Control-Allow-Origin: *');
  } catch (err) {
    failures++;
    console.error(`  ✕ FAIL: CORS 预检 — ${err.message}`);
  }

  console.log(`\n=== 测试结果 ===`);
  console.log(failures === 0 ? '所有测试通过 ✓' : `${failures} 个测试失败 ✕`);
  cleanup(failures > 0 ? 1 : 0);
}

process.on('SIGINT', () => cleanup(1));
process.on('SIGTERM', () => cleanup(1));

main().catch((err) => {
  console.error('测试异常:', err.message);
  cleanup(1);
});