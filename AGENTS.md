# Repository Guidelines

## 项目结构与模块组织
- 主流程集中在 `src/weread-challenge.js`，覆盖 login flow、reading loop、telemetry push 等职责；文件内部按函数块划分，后续可按场景拆分成 modules。
- `data/` 在首次运行时生成 cookies.json、login.png、output.log；新增缓存文件时请同步更新 `.gitignore`，保持工作树 clean。
- `docker-compose.yml`、`Dockerfile` 负责 orchestrate Selenium standalone chrome，`README-dev.md` 概述 VS Code 调试；若需要自定义 remote browser，请在 compose 文件中调整 service name 与 network。

## 构建、测试与开发命令
- `npm install`：安装 `selenium-webdriver` 与 `nodemailer`，建议为每次依赖升级记录 package-lock 差异。
- `npm run start`：在 shell 里注入 `WEREAD_REMOTE_BROWSER=http://172.18.0.2:4444` 并执行脚本；若本地无远程节点，请改用 `WEREAD_REMOTE_BROWSER=` 覆盖。
- `node src/weread-challenge.js`：本地快速调试入口，可结合 `DEBUG=true`、`WEREAD_BROWSER=chrome`、`WEREAD_DURATION=68` 验证长时间阅读。
- `docker compose up -d`：拉起 `app` + `selenium`，常用于验收生产镜像；结束后执行 `docker compose down` 清理资源。

## 编码风格与命名约定
- 统一采用 2 space 缩进、单引号转义保持最小化；CommonJS `require` / `module.exports` 为默认模块规范。
- 常量使用 SCREAMING_SNAKE_CASE（如 `WEREAD_DURATION`），内部变量与函数沿用 camelCase；异步流程优先 async/await。
- 日志通过 `console.info|warn|error` 输出，文件句柄在顶部集中创建；新增监控点时复用 `redirectConsole` 逻辑，避免重复实现。

## 测试指南
- 目前不存在自动化单测，验证依赖真实浏览器运行；提交前至少执行一次 `npm run start` 或 `docker compose up -d`，确认登录、翻页、统计上报链路。
- 建议新增 `tests/` 目录，用 `selenium-webdriver` 编写 smoke case（命名示例：`tests/login-smoke.spec.js`），覆盖登录二维码刷新、章节跳转、通知推送开关。
- 若引入断言库，可选 `assert` 内置模块或 `mocha`，并在 README-dev.md 追加用法；同时为每个 case 描述期望阅读时长与触发条件。

## 提交与 Pull Request 指南
- Git 历史遵循 Conventional Commits，示例：`feat: implement QR code detection`、`ci: update docker image registry`、`feat(docker): add docker-compose setup`。
- Commit message 建议格式为 `type(scope?): subject`，subject 使用动词原形且描述业务成果；多文件变更时可以进一步拆分 commits，便于 review。
- Pull Request 描述需包含：背景、变更要点、运行命令、环境变量配置、截图或 `data/output.log` 片段；若关联 issue 请在描述结尾附 `Closes #id`。

## 配置与安全提示
- 所有敏感凭据通过环境变量传递，严禁在仓库中硬编码邮箱密码、Bark key；推荐使用 `.env.local` 并加入 `.gitignore`。
- 默认 `WEREAD_AGREE_TERMS=true`；若扩展统计字段，需在 PR 中说明 opt-out 流程并更新 README。
- 部署 Docker 方案时确认宿主机具备 `--shm-size 2gb` 以避免 Chrome crash；远程运行后及时清理 `data/login.png` 并轮换 cookies。
- 维护 `cron` 任务时可用 `docker run --rm` 方案，将 `-v $HOME/weread-challenge/<user>/data:/app/data` 挂载到宿主机，确保多账户日志与二维码清晰分层。
