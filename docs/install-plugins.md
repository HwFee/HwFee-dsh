# 插件安装与验证 · Agent 执行手册

写给执行安装的 agent，不是写给人的教程。每一步给出**命令**、**通过判据**和**失败时唯一允许的动作**；判据之外的推断一律视为无证据。

范围：本仓库六个可装插件（`cds-theme`、`system-fonts`、`usage-stats`、`genui`、`git-bash`、`predict`）。`context-rail` 需从源码构建，默认不在范围内。

---

## 0. 触发条件

执行本手册：用户要求安装 / 升级 / 重装 / 核对插件版本，或要求确认某个插件是否生效。

不执行：只是改插件源码（走 `AGENTS.md` 的构建与发布流程）、要求发布到 npm（走 `market/SUBMISSION-FLOW.md`）。

---

## 1. 执行前必须读取的事实

**不要凭记忆填版本号，不要假设 registry，不要假设 `dsh` 在 PATH 里。** 先把这三件读出来：

```powershell
npm config get registry                                  # 期望 https://registry.npmjs.org
Get-Command dsh -ErrorAction SilentlyContinue            # 空则用下面的回退路径
Test-Path "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
```

判据与动作：

| 读到的状态 | 动作 |
|---|---|
| registry 是 `registry.npmmirror.com` 或别的镜像 | 先 `npm config set registry https://registry.npmjs.org`，再继续。镜像不是本仓库渠道 |
| `dsh` 不在 PATH | 把 `%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\cli\bin` 加进本次 shell 的 PATH |
| 两者都拿不到 | 停止，报告「找不到 dsh CLI」，不要尝试 `pnpm add` 代替 `dsh plugin add`——profile 层不会被组装 |

渠道只有两个：**官方 npm** 与 **GitHub Release 资产**。市场（dsh-market / awesome-dsh-plugin）只用于发现插件，不是安装源。

---

## 2. 标准流程

严格按序，前一步未通过就不要进入下一步。

| # | 动作 | 命令 | 通过判据 |
|---|---|---|---|
| 1 | 解析版本 | `node market/install-all.ps1 -Profile desktop -DryRun` | 每个包输出 `would install <pkg>@<semver>`，且版本等于 `npm view <pkg> version --registry=https://registry.npmjs.org` |
| 2 | 安装 | `pwsh market/install-all.ps1 -Profile desktop` | 退出码 0，且汇总里每个包都为 `OK`（`actual` 等于 `expected`）。`actual` 读自已安装清单，所以 `link:` 安装同样适用 |
| 3 | 层判定 | 见 §3 | 两个谓词都为 true |
| 4 | 挂载验证 | `pwsh market/verify-mount.ps1 -Package <包名>` | 末行 `ALL 1 PLUGIN(S) MOUNT CORRECTLY`，其中 `install+` 行显示目标版本 |
| 5 | 交由人重启 | —— | 见 §5：agent 不刷新页面 |

`-Only` 收窄范围：`pwsh market/install-all.ps1 -Profile desktop -Only cds-theme,usage-stats`。

**为什么不让 pnpm 解析版本。** `dsh plugin add <包名>` 把 `latest` 交给 pnpm，而 pnpm 会从本地状态给出旧答案：实测同一官方源上 `pnpm view` 报 `0.1.10`，`pnpm add` 装出 `0.1.8`。脚本先用 `npm view` 取版本，再装 `包名@版本`。

需要手工逐条装（脚本不可用、或只装一个）时，用写死版本的等价命令：

```powershell
dsh plugin --profile desktop add dsh-cds-theme@0.1.11 --registry=https://registry.npmjs.org
dsh plugin --profile desktop add dsh-system-fonts@0.1.3 --registry=https://registry.npmjs.org
dsh plugin --profile desktop add @hwfee/dsh-usage-stats@0.1.5 --registry=https://registry.npmjs.org
dsh plugin --profile desktop add @hwfee/dsh-genui@0.1.2 --registry=https://registry.npmjs.org
dsh plugin --profile desktop add @hwfee/dsh-git-bash@0.1.2 --registry=https://registry.npmjs.org
dsh plugin --profile desktop add @hwfee/dsh-predict@0.1.2 --registry=https://registry.npmjs.org
```

没有 npm 账号时用 Release 资产（资产名去 scope）：`https://github.com/HwFee/HwFee-dsh/releases/download/<plugin>-v<version>/<asset>.tgz`。

---

## 3. 层判定（两个谓词，缺一不可）

「命令没报错」不算装好。装好的定义是**成为 profile 层**：

```powershell
# 谓词 1：bundle 补丁存在
Test-Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-cds-theme\cordis.patch.yml"

# 谓词 2：包名出现在 dsh.profile.bundles 里
node -e "const j=require(process.env.USERPROFILE+'/.dsh/profiles/desktop/package.json');console.log(j.dsh.profile.bundles.includes('dsh-cds-theme'))"
```

两者都为 `True` 才算安装成立。只有 `dependencies` 一条、`bundles` 里没有，是**半安装**：pnpm 成功、插件不挂载、界面无声消失。

---

## 4. 失败 → 唯一允许的动作

| 现象 | 原因 | 动作 |
|---|---|---|
| 装到的版本比 `npm view` 报的旧 | pnpm 本地解析 `latest` | 改用 `market/install-all.ps1`，或手写 `包名@版本`；不要重试同一条不锁版本的命令 |
| `ERR_PNPM_TARBALL_EXTRACT` / 404 | 源不对或 tarball 未落地 | 带 `--registry=https://registry.npmjs.org` 重试；仍 404 则先用 Release 资产交付，不要换版本号试探 |
| 插件列表无条目 | 半安装 | 回到 §3；缺 `bundles` 就重跑安装，不要手改 profile |
| 启动报 `duplicate factory registration` | 产物 bundle id ≠ 包名 | 停止安装动作，按 `AGENTS.md` §4 的改名清单核对四处名字；这是产物问题，不是安装参数问题 |
| `npm test` 首项即报缺 `esbuild` | 插件依赖未装 | `node tools/install-deps.mjs` |
| 补丁 `status` 报 `unavailable` | 宿主构建不在登记表里 | 不要 `apply`；只装 `--patch hunk-lines`，或等工具更新 |
| 补丁 `status` 报 `partial` | 半装或被手工改过 | 先 `revert`，再重新 `apply`，不要连按 `apply` |

---

## 5. Agent 不得做的事

| 禁止 | 后果 |
|---|---|
| 不锁版本安装 | 装到旧版，且症状与「插件坏了」无法区分 |
| 使用 npmmirror 或其它镜像 | 版本落后，发布是否成立被误判 |
| 手改 `~/.dsh/profiles/*/package.json` | `bundles` 会被削，插件整批消失，应用起不来 |
| 重建 bundle 后刷新页面（F5） | 页面按旧 `rev` 取新产物 → `bundle script failed to load` → 应用无法启动 |
| 应用运行时 `apply` 宿主补丁 | Windows 锁住归档，替换失败或留下半装状态 |
| 猜测版本号或凭记忆填写 | 安装不存在的版本，404 被读成「包坏了」 |

**重启只能由人完成**：bundle 在页面启动时加载。agent 不刷新、不重启应用；交付时明确写「需要彻底退出并重开 DSH」。

---

## 6. 交付时必须给出的证据

只有这些字段算证据，缺一项就说明未验证：

1. 每个包**实际装到的版本**（来自 `package.json`，不是命令输出）；
2. §3 两个谓词的返回值；
3. `verify-mount.ps1` 的结论行；
4. 执行过的命令原文；
5. 是否仍需人重启。

---

## 7. 可选能力：编辑卡片的真实行号

宿主的文件工具在生成 diff 时丢掉每个 hunk 的起点，所以不打补丁时行号列显示 `—` 与「文件行号不可用」。补丁随主题包发布，不需要克隆仓库：

```powershell
node node_modules/dsh-cds-theme/host-patch/patch-asar.mjs status
node node_modules/dsh-cds-theme/host-patch/patch-asar.mjs apply --patch hunk-lines
node node_modules/dsh-cds-theme/host-patch/patch-asar.mjs revert
```

在仓库内工作时路径换成 `tools/patch-asar.mjs`；打包副本由 `tools/sync-host-patch.mjs` 生成，`npm run test:tools` 会在两者不一致时失败。

判据与边界：

- 执行前 DSH 必须已完全退出；`status` 的四种结论是 `patched` / `unpatched` / `unavailable` / `partial`，只有前两种可以 `apply`。
- `apply` 会先写 `app.asar.bak-<时间戳>`，重打包后校验 framing、偏移与逐成员 sha256；失败时必须 `revert`。
- **DSH 每次升级覆盖 `app.asar`**，升级后重新 `status` 再决定是否 `apply`。
- 旧会话不会变成有行号：它们的起点在记录时已丢失，卡片继续显示 `—`。

详见 [`../plugins/cds-theme/host-patch/README.md`](../plugins/cds-theme/host-patch/README.md)。
