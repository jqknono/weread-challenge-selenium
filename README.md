# 微信读书挑战会员助手

只为便宜一点买微信读书会员.

![只为便宜一点买微信读书会员](https://img1.techfetch.dev/blog/202412261741639.gif)

## 微信读书规则

- 离线阅读计入总时长, 但需要联网上报
- 网页版, 墨水屏, 小程序, 听书, 有声书收听**都计入总时长**
- 对单次自动阅读或收听时长过长的行为, 平台将结合用户行为特征判断, **过长部分不计入总时长**
- 当日阅读超过**5 分钟**才算作有效阅读天数
- 付费 5 元立即获得 2 天会员, 后续 30 日内打卡 29 天, 读书时长超过 30 小时, 可获得 30 天会员和 30 书币
- 付费 50 元立即获得 30 天会员, 后续 365 日内打卡 360 天, 读书时长超过 300 小时, 可获得 365 天会员和 500 书币

根据实际操作, 还有如下未明确说明的特点:

- 第 29 日打卡后立即获得读书会员奖励, 并可立即开始下一轮挑战会员打卡, 无需等待第 31 日开始下一轮挑战, 第 29 日的打卡既算上一轮的打卡, 也算下一轮的打卡.
- 除第一轮需 29 日外, 后续每 28 日即可获得 32 日会员, 1+28\*13=365, 一年可完成 13 轮, 花费 65 元, 获得 32\*13=416 天会员和 390 书币.
- 更划算的仍然是年卡挑战会员, 但周期更长, 风险更大.

## 工具特性

- 使用有头浏览器
- 支持本地浏览器和远程浏览器
- 随机浏览器宽度和高度
- 支持等待登录
- 支持登录二维码刷新
- 支持保存 cookies
- 支持加载 cookies
- 支持选择最近阅读的第 X 本书开始阅读
- 默认随机选择一本书开始阅读
- 支持自动阅读
- 支持跳到下一章
- 支持读完跳回第一章继续阅读
- 随机单页阅读时间
- 随机翻页时间
- 每分钟截图当前界面
- 支持日志
- 支持定时任务
- 支持设置阅读时间
- 支持邮件通知
- 多平台支持: `linux | windows | macos`
- 多架构支持: `amd64 | arm64`
- 支持浏览器: `chrome | MicrosoftEdge | firefox | safari`
- 支持多用户
- 异常时强制刷新
- 使用统计

## Linux

### 直接运行

下载链接: [weread-challenge.js](https://storage1.techfetch.dev/weread-challenge/weread-challenge.js)

```bash
# 安装nodejs
sudo apt install nodejs
# 老旧版本的 nodejs 需要安装 npm
sudo apt install npm
# 创建运行文件夹
mkdir -p $HOME/Documents/weread-challenge
cd $HOME/Documents/weread-challenge
# 安装依赖
npm install selenium-webdriver
# 下载脚本
wget https://storage1.techfetch.dev/weread-challenge/weread-challenge.js -O weread-challenge.js
# 通过环境变量设置运行参数
export WEREAD_BROWSER="firefox"
# 运行
WEREAD_BROWSER="firefox" node weread-challenge.js
```

如需邮件通知, 需安装 _nodemailer_:
`npm install nodemailer`

### Docker Compose 运行

```yaml
services:
  app:
    image: jqknono/weread-challenge:latest
    pull_policy: always
    environment:
      - WEREAD_REMOTE_BROWSER=http://selenium:4444
      - WEREAD_DURATION=68
    volumes:
      - ./data:/app/data
    depends_on:
      selenium:
        condition: service_healthy

  selenium:
    image: selenium/standalone-chrome:4.26
    pull_policy: if_not_present
    shm_size: 2gb
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - SE_ENABLE_TRACING=false
      - SE_BIND_HOST=false
      - SE_JAVA_DISABLE_HOSTNAME_VERIFICATION=false
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4444/wd/hub/status"]
      interval: 5s
      timeout: 60s
      retries: 10
```

保存为 `docker-compose.yml`, 运行 `docker compose up -d`.

### Docker 运行

```bash
# run selenium standalone
docker run --restart always -d --name selenium-live \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --shm-size="2g" \
  -p 4444:4444 \
  -p 7900:7900 \
  -e SE_ENABLE_TRACING=false \
  -e SE_BIND_HOST=false \
  -e SE_JAVA_DISABLE_HOSTNAME_VERIFICATION=false \
  -e SE_NODE_MAX_INSTANCES=10 \
  -e SE_NODE_MAX_SESSIONS=10 \
  -e SE_NODE_OVERRIDE_MAX_SESSIONS=true \
  selenium/standalone-chrome:4.26

# run weread-challenge
docker run --rm --name user-read \
  -v $HOME/weread-challenge/user/data:/app/data \
  -e WEREAD_REMOTE_BROWSER=http://172.17.0.2:4444 \
  -e WEREAD_DURATION=68 \
  weread-challenge:latest

# add another user
docker run --rm --name user2-read \
  -v $HOME/weread-challenge/user2/data:/app/data \
  -e WEREAD_REMOTE_BROWSER=http://172.17.0.2:4444 \
  -e WEREAD_DURATION=68 \
  weread-challenge:latest
```

### 创建定时任务

#### docker-compose

```bash
WORKDIR=$HOME/weread-challenge
mkdir -p $WORKDIR
cd $WORKDIR
cat > $WORKDIR/docker-compose.yml <<EOF
services:
  app:
    image: jqknono/weread-challenge:latest
    pull_policy: always
    environment:
      - WEREAD_REMOTE_BROWSER=http://selenium:4444
      - WEREAD_DURATION=68
    volumes:
      - ./data:/app/data
    depends_on:
      selenium:
        condition: service_healthy

  selenium:
    image: selenium/standalone-chrome:4.26
    pull_policy: if_not_present
    shm_size: 2gb
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - SE_ENABLE_TRACING=false
      - SE_BIND_HOST=false
      - SE_JAVA_DISABLE_HOSTNAME_VERIFICATION=false
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4444/wd/hub/status"]
      interval: 5s
      timeout: 60s
      retries: 10
EOF
# 首次启动后, 需微信扫描二维码登录, 二维码保存在 $HOME/weread-challenge/data/login.png
# 每天早上 7 点启动, 阅读68分钟
(crontab -l 2>/dev/null; echo "00 07 * * *  cd $WORKDIR && docker compose up -d") | crontab -
```

#### docker

```bash
# 启动浏览器
docker run --restart always -d --name selenium-live \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --shm-size="2g" \
  -p 4444:4444 \
  -p 7900:7900 \
  -e SE_ENABLE_TRACING=false \
  -e SE_BIND_HOST=false \
  -e SE_JAVA_DISABLE_HOSTNAME_VERIFICATION=false \
  -e SE_NODE_MAX_INSTANCES=3 \
  -e SE_NODE_MAX_SESSIONS=3 \
  -e SE_NODE_OVERRIDE_MAX_SESSIONS=true \
  -e SE_SESSION_REQUEST_TIMEOUT=10 \
  -e SE_SESSION_RETRY_INTERVAL=3 \
  selenium/standalone-chrome:4.26

WEREAD_USER="user"
mkdir -p $HOME/weread-challenge/$WEREAD_USER/data

# Get container IP
Selenium_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' selenium-live)

# 首次启动后, 需微信扫描二维码登录, 二维码保存在 $HOME/weread-challenge/$WEREAD_USER/data/login.png
# 每天早上 7 点启动, 阅读68分钟
(crontab -l 2>/dev/null; echo "00 07 * * * docker run --rm --name ${WEREAD_USER}-read -v $HOME/weread-challenge/${WEREAD_USER}/data:/app/data -e WEREAD_REMOTE_BROWSER=http://${Selenium_IP}:4444 -e WEREAD_DURATION=68 -e WEREAD_USER=${WEREAD_USER} jqknono/weread-challenge:latest") | crontab -
```

## Windows

```ps1
# 安装nodejs
winget install -e --id Node.js.Node.js
# 创建运行文件夹
mkdir -p $HOME/Documents/weread-challenge
cd $HOME/Documents/weread-challenge
# 安装依赖
npm install selenium-webdriver
# 下载脚本powershell
Invoke-WebRequest -Uri https://storage1.techfetch.dev/weread-challenge/weread-challenge.js -OutFile weread-challenge.js
# 通过环境变量设置运行参数
$env:WEREAD_BROWSER="MicrosoftEdge"
# 运行
node weread-challenge.js
```

Docker 运行同 Linux.

## MacOS

```zsh
# 安装nodejs
brew install node
# 创建运行文件夹
mkdir -p $HOME/Documents/weread-challenge
cd $HOME/Documents/weread-challenge
# 安装依赖
npm install selenium-webdriver
# 使能safari driver(可选)
safaridriver --enable
# 下载脚本
wget https://storage1.techfetch.dev/weread-challenge/weread-challenge.js -O weread-challenge.js
# 通过环境变量设置运行参数
export WEREAD_BROWSER="safari"
# 运行
node weread-challenge.js
```

Docker 运行同 Linux.

## 多用户支持

```bash
# 启动浏览器
docker run --restart always -d --name selenium-live \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --shm-size="2g" \
  -p 4444:4444 \
  -p 7900:7900 \
  -e SE_ENABLE_TRACING=false \
  -e SE_BIND_HOST=false \
  -e SE_JAVA_DISABLE_HOSTNAME_VERIFICATION=false \
  -e SE_NODE_MAX_INSTANCES=10 \
  -e SE_NODE_MAX_SESSIONS=10 \
  -e SE_NODE_OVERRIDE_MAX_SESSIONS=true \
  selenium/standalone-chrome:4.26

WEREAD_USER1="user1"
WEREAD_USER2="user2"
mkdir -p $HOME/weread-challenge/$WEREAD_USER1/data
mkdir -p $HOME/weread-challenge/$WEREAD_USER2/data

# Get container IP
Selenium_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' selenium-live)

# 首次启动后, 需微信扫描二维码登录, 二维码保存在:
# /$HOME/weread-challenge/${WEREAD_USER1}/data/login.png
# /$HOME/weread-challenge/${WEREAD_USER2}/data/login.png
# 每天早上 7 点启动, 阅读68分钟
(crontab -l 2>/dev/null; echo "00 07 * * * docker run --rm --name ${WEREAD_USER1}-read -v $HOME/weread-challenge/${WEREAD_USER1}/data:/app/data -e WEREAD_REMOTE_BROWSER=http://${Selenium_IP}:4444 -e WEREAD_DURATION=68 -e WEREAD_USER=${WEREAD_USER1} jqknono/weread-challenge:latest") | crontab -
(crontab -l 2>/dev/null; echo "00 07 * * * docker run --rm --name ${WEREAD_USER2}-read -v $HOME/weread-challenge/${WEREAD_USER2}/data:/app/data -e WEREAD_REMOTE_BROWSER=http://${Selenium_IP}:4444 -e WEREAD_DURATION=68 -e WEREAD_USER=${WEREAD_USER2} jqknono/weread-challenge:latest") | crontab -
```

## 可配置项

| 环境变量                | 默认值           | 可选值                                | 说明             |
| ----------------------- | ---------------- | ------------------------------------- | ---------------- |
| `WEREAD_USER`           | `weread-default` | -                                     | 用户标识         |
| `WEREAD_REMOTE_BROWSER` | ""               | -                                     | 远程浏览器地址   |
| `WEREAD_DURATION`       | `10`             | -                                     | 阅读时长         |
| `WEREAD_SELECTION`      | `random`         | [0-4]                                 | 选择阅读的书籍   |
| `WEREAD_BROWSER`        | `chrome`         | `chrome,MicrosoftEdge,firefox,safari` | 浏览器           |
| `ENABLE_EMAIL`          | `false`          | `true,false`                          | 邮件通知         |
| `EMAIL_SMTP`            | ""               | -                                     | 邮箱 SMTP 服务器 |
| `EMAIL_USER`            | ""               | -                                     | 邮箱用户名       |
| `EMAIL_PASS`            | ""               | -                                     | 邮箱密码         |
| `EMAIL_TO`              | ""               | -                                     | 收件人           |
| `WEREAD_AGREE_TERMS`    | `true`           | `true,false`                          | 隐私同意条款     |

## 容器多架构支持

支持 linux/amd64,linux/arm64, 支持树莓派等开发板.

```bash
docker buildx create --name weread-challenge
docker buildx use weread-challenge
docker buildx inspect --bootstrap
docker buildx build --platform linux/amd64,linux/arm64 -t jqknono/weread-challenge:base -f Dockerfile.base --push .
docker buildx build --platform linux/amd64,linux/arm64 -t jqknono/weread-challenge:latest -f Dockerfile.quick --push .
```

## 注意事项

- 28 日刷满 30 小时, 需每日至少 65 分钟, 而不是每日 60 分钟.
- 微信读书统计可能会漏数分钟, 期望每日获得 65 分钟, 建议调整阅读时长到 68 分钟
- 网页扫码登录 cookies 有效期为 30 天, 30 天后需重新扫码登录, 适合月挑战会员
- 邮件通知可能被识别为垃圾邮件, 建议在收件方添加白名单
- 本项目仅供学习交流使用, 请勿用于商业用途, 请勿用于违法用途
- 如存在可能的侵权, 请联系 `weread-challenge@techfetch.dev`, 本项目会立即删除

## 隐私政策

- 隐私获取
  - 本项目搜集使用者的 `cookies` 部分信息, 以用于使用者统计和展示.
  - 搜集使用者的使用信息, 包含: `用户名称 | 首次使用时间 | 最近使用时间 | 总使用次数 | 浏览器类型 | 操作系统类别 | 阅读时长设置 | 异常退出原因`
  - 如不希望被搜集任何信息, 可设置启动参数`WEREAD_AGREE_TERMS=false`
- 风险提示
  - `cookies` 可用于微信读书网页登录, 登录后可以执行书架操作, 但**本工具不会使用搜集的信息进行登录操作**.
  - 腾讯保护机制确保异常登录时, 手机客户端将收到风险提示, 可在手机客户端`设置`->`登录设备`中确认登录设备.
  - 本工具纯 js 实现, 容易反混淆和扩展, 第三方可以继续开发. 即使信任本工具, 也应在使用自动化工具时, 经常确认登录设备, 避免书架被恶意操作.

## 参考

- 脚本下载链接: [weread-challenge.js](https://storage1.techfetch.dev/weread-challenge/weread-challenge.js)
- 文章来源: [https://blog.techfetch.dev](https://blog.techfetch.dev/blog/2024/12/05/%E5%BE%AE%E4%BF%A1%E8%AF%BB%E4%B9%A6%E8%87%AA%E5%8A%A8%E6%89%93%E5%8D%A1%E5%88%B7%E6%97%B6%E9%95%BF/)
- 统计: [https://weread-challenge.techfetch.dev](https://weread-challenge.techfetch.dev)
