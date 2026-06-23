## HTTP API 验收用例

| 场景 | 前置条件 / 输入 | 预期结果 |
| --- | --- | --- |
| `/health` 返回启动阶段 | 脚本启动，未进入登录 | `{ phase: "starting", status: "ok" }` |
| `/health` 返回登录阶段 | 脚本进入登录二维码页面 | `{ phase: "login" }` |
| `/health` 返回阅读阶段 | 登录成功开始阅读 | `{ phase: "reading" }` |
| `/health` 返回完成阶段 | 阅读完成 | `{ phase: "completed" }` |
| `/health` 返回错误阶段 | 脚本运行出错 | `{ phase: "error", lastError: "..." }` |
| `/qr` 返回二维码图片 | 登录阶段 `login.png` 已生成 | 返回 `image/png`，HTTP 200 |
| `/qr` 返回 404 | 未进入登录阶段或二维码未生成 | `{ error: "QR code not available yet" }`，HTTP 404 |
| `/config` 返回脱敏配置 | 任意阶段 | `EMAIL_PASS`、`BARK_KEY` 脱敏为 `xx****xx` |
| `/config` 返回完整配置项 | 任意阶段 | 含 `WEREAD_USER`、`WEREAD_DURATION`、`DEFAULT_BOOK_URL` 等字段 |
| `/progress` 返回进度 | reading 阶段 | `elapsedMinutes + remainingMinutes = duration` |
| `/progress` 截图计数递增 | reading 阶段约 2 分钟后再次请求 | `screenshotCount >= 1` |
| `/book` 返回书本 URL | reading 阶段 | `url` 为 weread.qq.com 域名链接 |
| `/book` 返回书本标题 | reading 阶段且页面有标题元素 | `title` 非 null |
| 自定义端口 | 设置 `WEREAD_API_PORT=9090` 启动 | API 服务监听 `localhost:9090` |
| 禁用 API | 设置 `WEREAD_API_PORT=0` | 不启动 HTTP 服务，输出"已禁用"日志 |
| 未知路径返回 404 | 请求 `/unknown` | `{ error: "Not Found", endpoints: [...] }`，HTTP 404 |
| CORS 预检 | `OPTIONS` 请求任意端点 | HTTP 204，含 `Access-Control-Allow-Origin: *` |
