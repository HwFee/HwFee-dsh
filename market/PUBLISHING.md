# 发布到 npm · Publishing to npm

逐步教程。每一步都写清了「怎么验证这一步成功了」，别只看命令回显。

**本文是发布操作手册**：怎么把仓库里的六个包发到 npm、怎么确认真的发出去了、以及 `dsh-cds-theme` 的字体授权问题怎么处理。仓库构建规则见 [`AGENTS.md`](../AGENTS.md)；市场提交流程见 [`SUBMISSION-FLOW.md`](SUBMISSION-FLOW.md)；条目内容见 [`SUBMISSION.md`](SUBMISSION.md)。

---

## 0. 现状（2026-10-22 实测）

六个包都已上线。下表是**核对用**的当日快照，不是权威数据；版本以 npm 页面为准，tag 以 Release 页面为准：

| 包 | npm `latest` | 发布时间 | Release tag 规则 | 资产名 |
|---|---|---|---|---|
| `dsh-cds-theme` | `0.1.5` | 2026-10-21 | `cds-theme-v<version>` | `dsh-cds-theme-<version>.tgz` |
| `dsh-system-fonts` | `0.1.2` | 2026-10-21 | `system-fonts-v<version>` | `dsh-system-fonts-<version>.tgz` |
| `@hwfee/dsh-usage-stats` | `0.1.2` | 2026-10-20 | `usage-stats-v<version>` | `hwfee-dsh-usage-stats-<version>.tgz` |
| `@hwfee/dsh-genui` | `0.1.0` | 2026-10-21 | `genui-v<version>` | `hwfee-dsh-genui-<version>.tgz` |
| `@hwfee/dsh-git-bash` | `0.1.0` | 2026-10-21 | `git-bash-v<version>` | `hwfee-dsh-git-bash-<version>.tgz` |
| `@hwfee/dsh-predict` | `0.1.0` | 2026-10-21 | `predict-v<version>` | `hwfee-dsh-predict-<version>.tgz` |

两个必须知道的现状：

- **Releases 按包分 tag**，规则 `<plugin>-v<version>`；scoped 包的资产名要去掉 scope。旧的共享 tag `v0.1.0` 还在，但里面只有首发那三个包（主题是 `0.1.0`）；`v0.1.1` 没有 Release，那些地址是 404。
- **已发布的 `dsh-cds-theme@0.1.5` 内含 6 个无再分发授权的 Anthropic 字体**（见第 5 节）。工作区里的构建已经修好，但那版 tarball 不会追溯修改，所以下一次发主题必须是新版本号。

想自己复核，别信这张表，跑一遍：

```powershell
foreach ($p in 'dsh-cds-theme','dsh-system-fonts','@hwfee/dsh-usage-stats','@hwfee/dsh-genui','@hwfee/dsh-git-bash','@hwfee/dsh-predict') {
  $enc = $p.Replace('/','%2F')
  $r = Invoke-RestMethod "https://registry.npmjs.org/$enc"
  "$p latest=$($r.'dist-tags'.latest)"
}
```

---

## 1. 凭据：只从环境变量读，不写进 npmrc

**token 只放在环境变量里，由发布命令在调用时注入。** 不要 `npm config set`、不要写进 `~/.npmrc`、更不要进仓库或脚本参数。

```powershell
# 三个候选名，按顺序取第一个非空的（market/publish-pending.ps1 就是这么读的）
$env:NPM_TOKEN   # 首选
$env:NODE_AUTH_TOKEN
$env:NPM_AUTH_TOKEN
```

发布时用「本次命令专用」的配置键注入：

```powershell
npm publish --//registry.npmjs.org/:_authToken=$env:NPM_TOKEN
```

**为什么不能靠 `~/.npmrc` 里那一条。** 本机 `~/.npmrc` 确实有一个 `//registry.npmjs.org/:_authToken`，但 2026-10-21 实测它已失效：`npm publish` 返回 `PUT … E404`。而粒度 token **本来就不支持 `npm whoami`**，所以 `whoami` 报 401 不能单独当作失效证据——判据是 publish 的实际返回。

**环境变量必须在启动 DSH 的那个进程里可见。** `setx` / `$env:NPM_TOKEN=…` 之后，**已经在跑的 DSH 进程看不到新值**（子进程继承的是启动时的环境快照）。要么重启应用，要么让一个能读到它的终端来发布。

**token 需要勾 `bypass 2fa`。** 普通的 granular token 在非交互进程里会得到：

```
npm error 403 Two-factor authentication or granular access token with bypass 2fa is required
```

这不是「账号没开 2FA」——2FA 在账号上是 disabled。要么在交互式终端 `npm login`，要么建一个带 bypass 2fa 的 granular token。网页若已去掉 bypass 选项（npm 在 2026 年收紧过），只能走交互式登录。

---

## 2. 发布前必做的检查

### 2.1 产物必须是新的

`npm test` 第一项就是新鲜度检查，产物过期会直接失败。**六个目录都要跑**，改了哪个插件就先跑哪个：

```powershell
foreach ($d in 'cds-theme','system-fonts','usage-stats','genui','git-bash','predict') {
  Push-Location "plugins/$d"; npm test; $ok = $LASTEXITCODE -eq 0; Pop-Location
  if (-not $ok) { "FAILED: $d"; break }
}
```

### 2.2 检查包里到底有什么

```powershell
npm pack --dry-run
```

2026-10-22 从 npm 读到的实际数据（`files` 已收窄，源码不进包）：

| 包 | 文件数 | 解包体积 |
|---|---|---|
| `dsh-cds-theme` | 12 | ~5.2 MB（几乎全是内联字体的 base64，见第 5 节） |
| `dsh-system-fonts` | 9 | ~134 KB |
| `@hwfee/dsh-usage-stats` | 11 | ~125 KB |
| `@hwfee/dsh-genui` | 10 | ~125 KB |
| `@hwfee/dsh-git-bash` | 11 | ~71 KB |
| `@hwfee/dsh-predict` | 12 | ~79 KB |

**不该出现的**：`client/src/`、`tools/`、`test/`、`fonts/`。`files` 里写的是 `client/client.js` 而不是 `client`。主题包体积大是因为字体被内联进了 `client.js`，`fonts/` 目录本身不进包。

### 2.3 registry 指向

六个包的 `package.json` 里都有：

```json
"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org" }
```

**这一条很关键**：本机 `~/.npmrc` 默认 registry 是 `registry.npmmirror.com`（只读镜像，没有上传接口）。没有这个字段，`npm publish` 会往镜像站发，然后失败在一个看起来像权限问题的报错上。

### 2.4 名字与版本

**不要再假设包名空闲。** 六个名字都已发布，`npm view <name>` 会返回版本号——那是「已被占用」的标志，也就是本仓库自己的包。要发的是新版本号，`npm version patch --no-git-tag-version`，`publish` 不允许覆盖已发布版本。

历史上 `dsh-usage-stats`（无 scope）被别的作者占用，所以本仓库用的是 `@hwfee/dsh-usage-stats`。

---

## 3. 发布

```powershell
cd plugins/<name>
npm version patch --no-git-tag-version   # 版本号只能往上走
npm run build && npm test
npm publish --//registry.npmjs.org/:_authToken=$env:NPM_TOKEN
```

一次发全部未发布的包（脚本自己发现「哪些版本不在 registry 上」，不会重发已存在的、也不会烧版本号）：

```powershell
$env:NPM_TOKEN = '<your token>'      # 只在这个 shell 里
pwsh market/publish-pending.ps1            # build + test + publish + 校验
pwsh market/publish-pending.ps1 -WhatIf    # 只看会发什么
```

### 验证只有两条命令算数

```powershell
npm view <name> versions --registry=https://registry.npmjs.org        # 版本出现在列表里
Invoke-WebRequest "https://registry.npmjs.org/<name>/-/<file>-<version>.tgz" -Method Head   # 200
```

scoped 包的 tarball 路径保留 scope，**文件名去掉 scope**：

```
https://registry.npmjs.org/@hwfee/dsh-genui/-/dsh-genui-0.1.0.tgz
```

`npm publish` 打印的 `+ name@version` 和 "being processed" **只代表客户端接受了上传**，不代表 registry 已提交。只看这两行会误判成「发成功了」。

---

## 4. Release 与镜像

### 4.1 每个包一个 tag

六个包版本独立演进，共用一个 tag 表达不了。规则是 `<plugin>-v<version>`，例如 `cds-theme-v0.1.5`、`genui-v0.1.0`、`git-bash-v0.1.0`。

资产名 = `npm pack` 产出的文件名，scoped 包去掉 scope，例如 `dsh-cds-theme-0.1.5.tgz`、`hwfee-dsh-genui-0.1.0.tgz`、`hwfee-dsh-predict-0.1.0.tgz`。

**不要复用旧的共享 tag `v0.1.0`。** 它还在，但装上去的是首发版本；`v0.1.1` 根本没有 Release。README 里的下载地址必须指到按包分的 tag。

发完 Release 立刻核对（六个都要 200）。把 `$map` 换成这次的版本：

```powershell
$map = @(
  @{tag='cds-theme-v0.1.5'; asset='dsh-cds-theme-0.1.5.tgz'},
  @{tag='system-fonts-v0.1.2'; asset='dsh-system-fonts-0.1.2.tgz'},
  @{tag='usage-stats-v0.1.2'; asset='hwfee-dsh-usage-stats-0.1.2.tgz'},
  @{tag='genui-v0.1.0'; asset='hwfee-dsh-genui-0.1.0.tgz'},
  @{tag='git-bash-v0.1.0'; asset='hwfee-dsh-git-bash-0.1.0.tgz'},
  @{tag='predict-v0.1.0'; asset='hwfee-dsh-predict-0.1.0.tgz'})
foreach ($m in $map) {
  $u = "https://github.com/HwFee/HwFee-dsh/releases/download/$($m.tag)/$($m.asset)"
  try { "OK $($m.tag) $((Invoke-WebRequest $u -Method Head).StatusCode)" } catch { "FAIL $u" }
}
```

（表里是 2026-10-22 那批的实测值，全部 200。下一次发布请改版本号后重跑。）

### 4.2 镜像站不用管，但要会解释

- `registry.npmmirror.com` 是**单向只读镜像**，从官方 npm 同步，没有发布接口。
- 包进了官方 npm 后，镜像会在几小时内自动收录。2026-10-22 实测镜像上 `dsh-cds-theme` 与 `dsh-system-fonts` 已经是 `0.1.5` / `0.1.2`。
- 镜像慢一步时的症状是 `Unexpected end of TAR archive` 或「找不到版本」。加官方源再装：`--config.registry=https://registry.npmjs.org`。
- **`minimumReleaseAge` 会让不锁版本的安装落后一版。** 这不是发布失败；`add <name>@<version>` 不受影响。但如果回落到的旧版本本身有缺陷，用户装到的就是坏的。

---

## 5. 字体授权

**事实。** `plugins/cds-theme/fonts/` 里曾有 6 个 **Anthropic** 网页可变字体（Sans / Serif / Mono × Roman / Italic）。它们是商业字体，**本项目没有拿到再分发授权**。修复前的构建把它们内联成 `data:font/woff2` 写进 `client/client.js`，所以 npm 上的 `dsh-cds-theme@0.1.5` tarball 里就带着它们——安装即分发。

**现状（2026-10-22 已在工作区落地，未发布）。** 公开构建只内联 2 个自制思源子集（SIL OFL）；6 个 Anthropic 面改成 `local()` 引用，**并且已从 git 取消跟踪**：它们只作为开发者本机的工作副本存在，`.gitignore` 精确列了这 6 个文件名，fresh clone 里没有这些文件，发布包里也是零字节。

| | 修复前 | 现在 |
|---|---|---|
| `client/client.js` 里的 `data:font/woff2` | 8 | **2** |
| Anthropic 面怎么解析 | 内联 data URL | `local("Anthropic Sans" / "Anthropic Serif" / "Anthropic Mono")` |
| 6 个商业源文件的 git 状态 | tracked（公开仓库） | **untracked + gitignored，仅本机副本** |
| 产物体积 | 5,300,843 B | 4,447,515 B |
| 谁守着 | 无 | build licence gate / `test/fonts.test.mjs` / `tools/audit.mjs` / `market/check-release-assets.mjs` |

**字形识别靠静态指纹，不靠源文件。** 四道闸门都读 [`tools/font-licences.mjs`](../tools/font-licences.mjs)：每个字面一条 `sha256` 加「前 96 字节的 base64」（`prefix96`）。所以**在没有那 6 个商业源的 fresh clone 上闸门照样生效**，而且能指名道姓报出「这是 AnthropicSerif-Roman-Web.woff2，商业字体，无再分发授权」，而不是含糊的「未知字体」。本机副本存在时会重算哈希与指纹对照，**不一致即 FAIL（drift），不降级放行**。模块里只有哈希与 96 字节头部，没有完整字体。

**npm 上的 `dsh-cds-theme@0.1.5` 不会追溯修改**：那个 tarball 里仍有 8 个内联字面。要修只能发新版本。

### 5.1 发主题前每次都复核

```powershell
# 1) 产物里只剩 2 个内联字面（两个思源子集）
(Select-String -Path plugins/cds-theme/client/client.js -Pattern 'data:font/woff2;base64,' -AllMatches).Matches.Count

# 2) 源码里没有 Anthropic import；字体表/指纹表/未跟踪契约一起验
Select-String -Path plugins/cds-theme/client/src/font-assets.js -Pattern 'Anthropic'
cd plugins/cds-theme; node test/fonts.test.mjs

# 3) 主题核验报告（本机没有商业源也照跑，缺失会标 (registry)）
cd plugins/cds-theme; node tools/verify.mjs | Select-String 'inlined faces|restricted faces|local anthropic'

# 4) 仓库级闸门 + 发布级闸门（都不需要那 6 个商业源文件）
cd plugins/cds-theme; node tools/audit.mjs | Select-String 'font-licence|font-fingerprint'
node market/check-release-assets.mjs --only cds-theme
```

期望：1 → `2`；2 → 0 条 Anthropic import、测试全绿（`.reference` 不存在时有一条 skip）；3 → `inlined faces 2 / 2 shippable`、`restricted faces (local() only) 6`，六行 `local anthropic-*` 末尾是 `(verified)`（本机有文件且匹配）或 `(registry)`（fresh clone 无文件）；4 → 两个 `ok font-licence`，发布闸门 `PASS` 并列出两个 `ships Noto… (open licence)`。

注意产物里 `local()` 的实参是运行时由 `FONT_FACES[].local` 拼出来的（`local("' + localName + '"`），所以**不要**指望在 `client.js` 里搜到字面量 `local("Anthropic Sans")`——那会搜到 0 条，看起来像没生效。第 2、3 步才是这件事的证据。

### 5.2 这套规则靠什么成立

| 位置 | 做什么 | 破了会怎样 |
|---|---|---|
| `tools/font-licences.mjs` | 8 个字面的 `sha256` + `prefix96`，四道闸门共用的唯一真相 | 各存一份名单 → 某一道悄悄放过；或本机副本换了字节而无人发现 |
| `client/src/fonts.js` | 每个字面带 `redistributable` 标记；`fontSourcesFor()` 对非可再分发的面**只返回 `local()`**，即使内联表里有值也不用 | 受限字节被内联，等于再次分发 |
| `client/src/font-assets.js` | 只 import 两个思源子集 | 有人加回一个 Anthropic import，构建就会把它打进去 |
| `tools/build-client.mjs` | licence gate：产物里出现受限字面的 base64 前缀就 `exit 1`；前缀来自指纹表，**不要求本机有源文件** | 构建能过，问题只在发布后才被发现 |
| `test/fonts.test.mjs` | 对**提交进 git 的产物**再查一遍；断言 import 表与 `redistributable` 一致；断言 6 个商业面**没有被 git 跟踪**（`git ls-files`），两个 Noto 仍 tracked | 不重建就提交时，产物测试成了唯一拦截点；或有人 `git add` 回商业源，公开仓库再次分发 |
| `tools/audit.mjs` | 仓库级 `font-licence`：每个产物搜指纹；`font-fingerprint`：本机副本与指纹表不一致即 FAIL | 别的插件把同一批字节内联进来，插件自己的测试看不见 |
| `market/check-release-assets.mjs` | 打开真实 tarball 按 sha256 认字：商业面 FAIL、未知 FAIL、松散字体文件 FAIL；指纹 drift 也 FAIL | 发出去的包里带着商业字节，而 `files` 列表是干净的 |

**改动顺序**：源码 → `npm run build` → `npm test` → 再动文档。产物是提交进 git 的发布物，`npm test` 第一项就是新鲜度检查。

**换字面时**：先放好本机文件，重算 `tools/font-licences.mjs` 里那一行（`sha256` 与 `prefix96`），再跑 `node tools/audit.mjs`。**不要**为了让闸门通过就把指纹改成手上那份的哈希——指纹表记录的是「这份字节经过授权判断」，改它等于把未经判断的字节纳入豁免。

### 5.3 用户会看到什么变化

- **本机装了 Anthropic Sans / Serif / Mono 的机器**：`local()` 命中，`@font-face` 仍由同样的字族名解析，理论上与修复前一致——**这一条没有做过视觉比对**，发布前应以真机截图确认，不能当成已验收结论。
- **没装的机器**：拉丁字面回落到 `system-ui` / `Segoe UI` / `Arial` …。行宽和字重密度会变，8 档字重在静态系统字重上塌缩成 2–4 档，暗色减薄的视觉效果变弱。**这是授权的代价，不是 bug。**
- **中文**：思源子集仍在，`avar` 校准仍成立；中文行不经过被移除的那 6 个面，所以这次改动**不应该**改变中文的渲染——同样属于推断，发布前用截图核对。
- **装过旧版本的机器**：npm 缓存与已安装 `node_modules` 里仍有旧字节，卸载重装不回收磁盘上的旧 tarball。

### 5.4 发版口径

- 主题这次改动需要**新版本号**（不能覆盖 `0.1.5`），Release 说明写清「只内联 OFL 字面，Anthropic 面改为本机 `local()`」。
- 版本号、tag、Release 由发布组统一确定；本文与各 README 不预先写死，以 npm 页面与 Release 页为准。

---

## 6. 版本被 npm 卡死

`409 Cannot publish over previously staged version "<v>"` 意味着该版本进了 npm 暂存区且**无法清除**：`npm stage` 在 npm 11 不存在，registry 也没有对应接口（[npm/cli#9889](https://github.com/npm/cli/issues/9889)）。

- 这不是「还在扫描」，等待无效。
- 卡死**按版本**而不是按包：换一个新版本号通常能过。
- 一次失败不代表包坏了：换号后用 tarball URL 确认，再决定下一步。不要连着烧掉一串版本号。

已知台账：

| 包 | 版本 | 首次出现 | 结果 |
|---|---|---|---|
| `dsh-cds-theme` | `0.1.2` | 2026-10-20 | 当天数百分钟级未落地；2026-10-22 实测 tarball 200 且在 packument 里，**已可用** |
| `dsh-cds-theme` | `0.1.3` | 2026-10-20 | 同上：当天长时间未落地；2026-10-22 实测 tarball 200 且在 packument 里，**已可用** |
| `dsh-cds-theme` | `0.1.4` | 2026-10-20 | 已发布，两分钟上线 |
| `dsh-cds-theme` | `0.1.6` | 2026-10-22 | 已上传未见版本，观察窗口内未落地（`+ dsh-cds-theme@0.1.6`、日志 "being processed"；官方 packument 无 0.1.6、tarball 404） |
| `dsh-cds-theme` | `0.1.7` | 2026-10-22 | 已上传未见版本，观察窗口内未落地；同日已建 `cds-theme-v0.1.7` Release，资产实测可装 |

**结论修正（2026-10-22 实测）**：这个包上「长时间 pending」与「永久卡死」在短窗口内**不可区分**。0.1.2 / 0.1.3 曾按 404 判死、记作「从未恢复」，两天后两者 tarball 都是 200、都在 packument 里——当时只是当天没等到。所以判死需要更长窗口；在交付层面，Release 资产（`<plugin>-v<version>` tag 的 tgz）是可用的独立通道，实测 `dsh plugin add <release-url>` 落到目标版本，不依赖 npm。

---

## 7. 常见报错对照

| 报错 | 原因 | 怎么办 |
|---|---|---|
| `403 ... 2FA ... required` | 非交互进程 + token 无 bypass 2fa | 交互式 `npm login`，或换带 bypass 的 granular token |
| `403 You do not have permission` | 包名属于别人 | 换名，或加 scope（`@hwfee/...`） |
| `PUT … E404` | token 没到进程里，或已失效 | 确认环境变量在**发起命令的进程**里可见；判据是 publish 返回，不是 `whoami` |
| `402 Payment Required` | 想发私有包 | 加 `"access": "public"` |
| `EPUBLISHCONFLICT` | 版本号已存在 | 改 `version`，不能覆盖已发布版本 |
| `409 Cannot publish over previously staged version` | 该版本卡在暂存区 | 换新版本号（见第 6 节） |
| `ERR_PNPM_...` / pnpm 报错 | 用了 `dsh plugin add` 而不是 `npm publish` | 两者别混用 |

---

## 命令速查

```powershell
# 0) 凭据只在这个 shell 里
$env:NPM_TOKEN = '<bypass-2fa token>'

# 1) 测试六个包
foreach ($d in 'cds-theme','system-fonts','usage-stats','genui','git-bash','predict') {
  Push-Location "plugins/$d"; npm test; Pop-Location
}

# 2) 发未发布的版本（自动跳过已存在的）
pwsh market/publish-pending.ps1

# 3) 验证：版本在列表里 + tarball 200
npm view dsh-cds-theme versions --registry=https://registry.npmjs.org
Invoke-WebRequest 'https://registry.npmjs.org/dsh-cds-theme/-/dsh-cds-theme-<version>.tgz' -Method Head

# 4) 发完跑安装矩阵并提交报告
pwsh market/test-install-paths.ps1
pwsh market/verify-mount.ps1
```
