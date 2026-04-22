## Docker image 推送验收用例

| 场景 | 前置条件 / 输入 | 预期结果 |
| --- | --- | --- |
| 查看帮助 | 执行 `node scripts/docker-image.js` | 输出 `check`、`build`、`push` 的用法，不执行 Docker 构建或推送 |
| 查看默认配置 | 执行 `node scripts/docker-image.js check` | 输出默认镜像名 `docker.io/jqknono/weread-challenge`、默认 tag 为 `package.json` 中的版本号，并确认 `Dockerfile` 与构建上下文存在 |
| 自定义单 tag 构建 | 执行 `node scripts/docker-image.js build --tag latest` | 实际构建命令使用 `docker.io/jqknono/weread-challenge:latest` |
| 一次推送多个 tag | 执行 `node scripts/docker-image.js push --tag 0.18.0 --extra-tags latest` | 先构建 `0.18.0` 和 `latest` 两个 tag，再逐个执行 `docker push` |
| 缺少参数值 | 执行 `node scripts/docker-image.js build --tag` | 直接报错 `Missing value for --tag`，不执行 Docker 命令 |
| 不支持的参数 | 执行 `node scripts/docker-image.js build --unknown value` | 直接报错 `Unknown option: --unknown`，不执行 Docker 命令 |
