## 如何参与开发

```bash
# 安装依赖
npm install selenium-webdriver
npm install nodemailer

# 查看 CLI 帮助
node src/weread-challenge.js -h

# 运行主流程
node src/weread-challenge.js run

# run 参数优先于同名环境变量
node src/weread-challenge.js run --weread-browser chrome --weread-duration 30

# 链接到全局命令
npm run link:global

# 兼容旧全局命令
weread-challenge

# 取消全局链接
npm run unlink:global

# 生成计划任务命令
node src/weread-challenge.js schedule --name weread-hourly --every 60 --workdir /absolute/path
```

本地 CLI 默认优先把 cookies、二维码、日志、截图写到当前工作目录下的 `.weread`；如果未设置 `WEREAD_DATA_DIR` 且当前目录下已存在旧版 `data/`，则继续沿用 `data/`。

`vscode` 内按 `F5` 运行, 选择 `node`, 开始调试, 默认使用 `chrome` 浏览器.

## 浏览器目录配置测试

```bash
node --test tests/browser-profile.test.js
```

使用 Node.js 内置测试运行器，验证固定临时目录的重复使用、显式路径覆盖、远程默认行为，以及 Chrome/Edge 的 WebDriver 会话参数。通过 `path.win32` / `path.posix` 覆盖 Windows、macOS、Linux 路径规则、相对路径解析，以及含空格和中文的路径；远端异构系统路径保持原样。测试使用本地模拟服务，不启动浏览器、不登录账号，也不产生阅读时长。

该命令可在 Windows、macOS、Linux 上执行。路径模型测试不等于三平台真实浏览器验证；发布前建议在三种系统分别运行此测试，再做浏览器启动冒烟，确认目录可写及退出后可复用。

### 真实浏览器冒烟

```bash
node tests/browser-profile-smoke.js
```

默认以 headless Chrome 连续启动两次，验证浏览器报告的真实配置路径、测试页面加载和 Local Storage 跨会话保留。使用隔离的临时根目录，不接触正式阅读配置；结束后关闭浏览器并删除测试目录。不访问微信读书、不发送通知或遥测。

Windows PowerShell 中测试 Edge：

```powershell
$env:SMOKE_BROWSER = 'MicrosoftEdge'
try { node tests/browser-profile-smoke.js } finally { Remove-Item Env:SMOKE_BROWSER }
```

本地测试需要已安装浏览器及可用的匹配驱动，Selenium Manager 可能需要联网下载驱动。针对独立 Linux Selenium 容器，可设置：

- `SMOKE_REMOTE`：Selenium URL。
- `SMOKE_PROFILE`：容器内专用测试目录（支持中文、空格），不可指向真实账号配置。
- `SMOKE_PAGE_HOST`：浏览器访问测试进程 HTTP 服务时使用的主机名，默认 `127.0.0.1`；Windows 宿主测试进程连接 Docker Desktop 浏览器时使用 `host.docker.internal`，并确保容器可访问该临时 HTTP 端口。

远端测试不会删除远端目录，应使用一次性容器并在测试结束后移除；Node 测试容器与 Selenium 容器共享网络命名空间时可保持默认的 `SMOKE_PAGE_HOST`。

## 已知问题

- [ ] `safari`的网页解析不同于`chrome`，暂未测试`safari`的兼容性。
