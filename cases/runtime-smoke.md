## 运行 Smoke 验收用例

| 场景 | 前置条件 / 输入 | 预期结果 |
| --- | --- | --- |
| 查看 smoke 帮助 | 执行 `node scripts/runtime-smoke.js` 或 `node scripts/runtime-smoke.js help` | 输出 `npx`、`docker`、`all` 三个子命令说明，不执行打包或镜像构建 |
| `npx` 版 CLI 可运行 | 在仓库根目录执行 `node scripts/runtime-smoke.js npx` | 先基于当前仓库执行 `npm pack`，再通过 `npx` 调起打包后的 `weread-selenium-cli -h` 与 `weread-challenge -h`；两次输出都包含 `run`、`schedule`、`help` |
| 容器版 CLI 可运行 | 在仓库根目录执行 `node scripts/runtime-smoke.js docker`，且本机 Docker 可用 | 基于当前 `Dockerfile` 成功构建本地镜像，并通过 `docker run --rm <image> node app.js -h` 输出 CLI 帮助；输出包含 `run`、`schedule`、`help` |
| 一次性验证两条路径 | 在仓库根目录执行 `node scripts/runtime-smoke.js all` | 顺序通过 `npx` 与 `docker` 两个 smoke 场景；结束后清理临时打包目录与本地 smoke 镜像 |
