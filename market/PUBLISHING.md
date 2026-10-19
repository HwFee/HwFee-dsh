# 发布到 npm · Publishing to npm

逐步教程。每一步都写清了「怎么验证这一步成功了」，别只看命令回显。

## 0. 先看现状（30 秒）

```bash
npm --version                 # 本机 11.13.0
npm whoami --registry=https://registry.npmjs.org
npm profile get --registry=https://registry.npmjs.org | grep -i two-factor
```

本机实测结果：

| 项 | 值 |
|---|---|
| npm 版本 | 11.13.0 |
| 登录账号 | `hwfee` |
| 2FA | **disabled**（账号没开） |
| `.npmrc` 里的 token | `npm_` 开头、40 字符（granular 类型） |
| `~/.npmrc` 默认 registry | `registry.npmmirror.com`（**镜像，不能发布**） |

## 1. 为什么上次发布被拦

```
npm error 403 Two-factor authentication or granular access token with bypass 2fa is required
```

**这不是你没开 2FA 的问题。** npm 从 2025 年底起撤销了旧式 publish token，现在发布必须满足下面之一：

- **A. 会话式认证**：在**交互式终端**里 `npm login`，发布时 npm 打开浏览器让你确认。
- **B. granular token，且勾选 `bypass 2fa`**：可非交互发布。

你现在的 token 是 granular 但**没勾 bypass 2fa**，而 `npm publish` 又是在**非交互进程**里跑的，两条都不满足 → 403。

> 我这边是脚本化 shell，弹不出浏览器，所以 A 必须由你在真实终端里做。

---

## 路线 A：会话式发布（推荐，最省事）

### A1. 登录（在**你自己的终端**里，不是脚本里）

```bash
npm login --registry=https://registry.npmjs.org
```

它会问 username / password / 邮箱验证码，然后**打开浏览器**让你确认。邮箱验证码去 `1744567281@qq.com` 收。

验证：

```bash
npm whoami --registry=https://registry.npmjs.org     # 应输出 hwfee
```

### A2. 逐个发布

**顺序有讲究**：先发小的，确认整条链路通了再发 7.5 MB 的 cds-theme。失败了不用重传大包。

```bash
cd C:/Users/17445/Desktop/HwFee-dsh/plugins/system-fonts
npm publish
```

成功的样子：

```
npm notice Publishing to https://registry.npmjs.org with tag latest and public access
+ dsh-system-fonts@0.1.0
```

然后：

```bash
cd ../usage-stats && npm publish      # @hwfee/dsh-usage-stats@0.1.0
cd ../cds-theme  && npm publish       # dsh-cds-theme@0.1.0（7.5 MB，慢一点）
```

### A3. 每一步之后立刻验证

```bash
npm view dsh-system-fonts version --registry=https://registry.npmjs.org
npm view @hwfee/dsh-usage-stats version --registry=https://registry.npmjs.org
npm view dsh-cds-theme version --registry=https://registry.npmjs.org
```

三条都应输出 `0.1.0`。**没输出就是没发上去**，别继续下一个。

---

## 路线 B：用 bypass-2fa token（不想每次开浏览器）

### B1. 去网页建 token

打开 <https://www.npmjs.com/settings/hwfee/tokens> → **Generate New Token** → **Granular Access Token**：

| 选项 | 选什么 |
|---|---|
| Token name | 随便，例如 `hwfee-publish` |
| Expiration | 7 天（够用，安全） |
| **Packages and scopes** → Permissions | **Read and write** |
| **Packages** | 选 **All packages**（首次发布没有既有包可选） |
| **Organizations** | 不用选 |
| **⏱ 关键：2FA bypass** | **勾上 `bypass 2fa`**（这一项就是上次失败的原因） |

> 如果这版 npm 网页把 bypass 选项去掉了（npm 在 2026-07 收紧过），那就只能走路线 A。

### B2. 写进 `.npmrc`

```bash
npm config set //registry.npmjs.org/:_authToken=npm_你的新token --location=user
```

### B3. 发布 + 验证

和 A2、A3 完全一样。

---

## 2. 发布前必做的检查

### 2.1 产物必须是新的

`npm test` 第一项就是新鲜度检查，产物过期会直接失败：

```bash
cd plugins/cds-theme && npm run build && npm test
```

三个插件都要跑一遍。

### 2.2 检查包里到底有什么

```bash
npm pack --dry-run
```

本机实测的文件数（`files` 已收窄，源码不进包）：

| 包 | 文件数 | 包体积 |
|---|---|---|
| `dsh-cds-theme` | 20 | 7.5 MB（其中 6 个内联字体约 660 KB → base64 后更大） |
| `dsh-system-fonts` | 9 | 80 KB |
| `@hwfee/dsh-usage-stats` | 10 | 81 KB |

**不该出现的**：`client/src/`、`tools/`、`test/`。如果看到了，是 `files` 字段写宽了——本仓库已修好，`files` 里写的是 `client/client.js` 而不是 `client`。

### 2.3 确认名字没被占

```bash
npm view dsh-cds-theme        --registry=https://registry.npmjs.org
npm view dsh-system-fonts     --registry=https://registry.npmjs.org
npm view @hwfee/dsh-usage-stats --registry=https://registry.npmjs.org
```

**返回版本号 = 被占了。** 本机实测：前两个空闲，第三个（scoped）空闲。
`dsh-usage-stats`（无 scope）已被 `lanlandeni` 占用，所以本仓库改成了 `@hwfee/dsh-usage-stats`。

### 2.4 registry 指向

三个包的 `package.json` 里都有：

```json
"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org" }
```

**这一条很关键**：本机 `~/.npmrc` 默认 registry 是 `registry.npmmirror.com`（只读镜像，没有上传接口）。没有这个字段，`npm publish` 会往镜像站发，然后失败在一个看起来像权限问题的报错上。

---

## 3. 镜像站要不要管

**不用管，也管不了。**

- `registry.npmmirror.com` 是**单向只读镜像**，从官方 npm 同步，没有发布接口。
- 你的包一旦进了官方 npm，镜像会在几小时内自动收录。
- DSH 装包时的镜像支持在**读取侧**：`pluginManager.registries()` 返回「配置的首选源 + 按序回退源」，它自己会挑快的，不需要你配置任何东西。

实测：现在 `npm view dsh-cds-theme --registry=https://registry.npmmirror.com` 返回 **E404**，因为官方还没有。发布后自动出现。

---

## 4. 发布之后

### 4.1 装自己的包验一次

**别在 desktop profile 上试**，用一个临时 profile，试完删掉：

```bash
dsh plugin --profile _test add dsh-system-fonts
dsh plugin --profile _test remove dsh-system-fonts
rm -rf ~/.dsh/profiles/_test
```

`dsh plugin add <包名>` 会走 `pluginManager.installBundle`，和 GUI 是同一条路径。

### 4.2 GUI 里也能装了

装好之后在 **设置 → 插件 → 添加插件** 里直接填包名：

```
dsh-cds-theme
dsh-system-fonts
@hwfee/dsh-usage-stats
```

### 4.3 提交到市场

发布 npm 之后，`market/PUBLISHING.md` 里记的那些市场才走得通：

- `awesome-dsh-plugin/awesome-dsh-plugin`（19,420 star）：只需要 `dsh.bundle`，**本来就不要求 npm**，已排了定时任务明天提交。
- `2BingLing/dsh-market`（159 star）：打 `dsh-plugin` topic 自动扫描，已打。
- `polang233/dsh-plugin-index`（2 star）：**硬性要求公开 npm 版本**，现在才能提。

---

## 5. 常见报错对照

| 报错 | 原因 | 怎么办 |
|---|---|---|
| `403 ... 2FA ... required` | 非交互进程 + token 无 bypass | 走路线 A，或换 bypass token（路线 B） |
| `403 You do not have permission` | 包名属于别人 | 换名，或加 scope（`@hwfee/...`） |
| `402 Payment Required` | 想发私有包 | 加 `"access": "public"` |
| `EPUBLISHCONFLICT` | 版本号已存在 | 改 `version`，不能覆盖已发布版本 |
| `ERR_PNPM_...` / pnpm 报错 | 用了 `dsh plugin add` 而不是 `npm publish` | 两者别混用 |

---

## 命令速查

```bash
# 一次跑完（在能弹浏览器的终端里）
cd C:/Users/17445/Desktop/HwFee-dsh
(cd plugins/system-fonts && npm publish) && \
(cd plugins/usage-stats && npm publish) && \
(cd plugins/cds-theme   && npm publish)

# 验证
npm view dsh-system-fonts version        --registry=https://registry.npmjs.org
npm view @hwfee/dsh-usage-stats version  --registry=https://registry.npmjs.org
npm view dsh-cds-theme version           --registry=https://registry.npmjs.org
```
