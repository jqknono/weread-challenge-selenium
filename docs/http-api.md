# HTTP API 实现文档

## 概述

`weread-challenge.js` 启动时同时监听本地端口（默认 `8788`），提供只读 HTTP API 供外部查看运行状态。
纯 Node.js 内置 `http` 模块实现，零额外依赖。通过 `WEREAD_API_PORT` 配置端口，设为 `0` 可禁用。

## 端点

| 方法 | 路径 | 返回类型 | 说明 |
|------|------|---------|------|
| GET | `/health` | `application/json` | `{ status, phase, uptime }` |
| GET | `/qr` | `image/png` | 当前登录二维码图片（`login.png`） |
| GET | `/config` | `application/json` | 运行时配置快照，敏感值脱敏 |
| GET | `/progress` | `application/json` | `{ phase, duration, elapsedMinutes, remainingMinutes, screenshotCount, startTime, endTime }` |
| GET | `/book` | `application/json` | `{ phase, url, title, author }` |

所有 GET 端点均返回 `Access-Control-Allow-Origin: *`，OPTIONS 预检返回 204。

## 阶段 (phase)

| 阶段 | 含义 |
|------|------|
| `idle` | 尚未启动 |
| `starting` | 脚本启动，正在初始化 |
| `login` | 等待扫码登录 |
| `reading` | 正在自动阅读 |
| `completed` | 阅读完成 |
| `error` | 运行出错 |

## 脱敏规则

配置端点 `/config` 对以下字段自动脱敏：
- `EMAIL_PASS`：保留首尾各 2 字符，中间替换为 `****`
- `BARK_KEY`：同上

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WEREAD_API_PORT` | `8788` | API 监听端口。设为 `0` 禁用 HTTP API。 |

## 手动验证

```bash
# 终端 1：启动脚本
node src/weread-challenge.js run

# 终端 2：验证 API
curl http://localhost:8788/health
curl http://localhost:8788/config | jq .
curl http://localhost:8788/progress
curl http://localhost:8788/book
curl -o login.png http://localhost:8788/qr
```
