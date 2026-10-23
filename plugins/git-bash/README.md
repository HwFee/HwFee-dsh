# @hwfee/dsh-git-bash · Git Bash 默认 shell

在 Windows 上把 DeepSeek Harness 的 shell 命令交给 **Git Bash** 跑，并提供一个 `run_shell` 工具。

装好之后：模型跑的 `run_shell` 走 Git Bash，`grep`、`sed`、`find`、`&&`、`$VAR`、shebang 脚本都按 POSIX 语义工作，路径就是你项目所在的那个文件系统。

**前提是会话允许（Windows）。** 在 Windows 上 Git Bash 进不了宿主沙箱，所以只在 `danger-full-access` 会话里执行；只读或 `workspace-write` 会话会被拒绝，并提示改用 Windows PowerShell。POSIX 上 bash 就是宿主自己的 shell，没有这个限制。见下文「设置」与「它会给你什么」。

## 安装

```bash
dsh plugin --profile desktop add @hwfee/dsh-git-bash
```

**装完必须彻底退出并重开 DSH。**

卸载：

```bash
dsh plugin --profile desktop remove @hwfee/dsh-git-bash
```

## 它怎么找到 Git Bash

按顺序试三个来源，第一个成功的就算数：

1. **`DSH_GIT_BASH` 环境变量** —— 指向 `bash.exe` 的完整路径。非标准安装位置用这个。
2. **`git --exec-path`** —— 得到 `…/Git/mingw64/libexec/git-core`，往上三级就是 Git 根目录，取它自带的 `bin/bash.exe`。
3. **常见安装位置** —— `C:/Program Files/Git/bin/bash.exe`、`C:/Program Files/Git/usr/bin/bash.exe`、`C:/Program Files (x86)/Git/bin/bash.exe`。

POSIX 上不找 Git for Windows，直接取 PATH 里的 `bash`。

**为什么不用 `where bash`。** Windows 上 `bash` 常常解析到 `C:\Windows\System32\bash.exe` —— WSL 的替身。它确实是 bash，但它是**另一个文件系统**（`/mnt/c/...`）、另一个用户、而且没有 Windows 那份 `git`。选错它之后每条命令都以一种看起来像「插件坏了」的方式失败，所以这里宁可找不到也不误选。

找不到时插件**不会消失**：设置里那一行会说明是哪一项配置不对（例如「没找到 Git Bash。请安装 Git for Windows，或设置 DSH_GIT_BASH。」）。

## 设置

设置 → 通用设置，多出一行 **默认 shell**，一个三值菜单：

| 模式 | 行为 |
|---|---|
| **自动**（默认） | 沿用原来的选 shell 规则：能解析到 Git Bash 就用它，否则用 PowerShell。每次解析结果都写明走的是哪条分支（`DSH_GIT_BASH` / `git --exec-path` / known path） |
| **Windows PowerShell** | 只用 pwsh，找不到也不回落 Git Bash |
| **Git Bash** | 只用 Git Bash，找不到也不回落 PowerShell |

同一处还有第二行 **显示沙箱提示**（开关，**默认开**）：控制命令结果下那行「这条命令没走沙箱」的说明是否显示。

**它只影响界面，不影响模型。** 工具结果内容里的 `· direct (unsandboxed)` 标记由宿主侧无条件写出，和这个开关没有任何连接——关掉之后界面少一行字，但模型仍然知道命令没走沙箱。默认开，是因为这行是安全披露：升级上来的用户不会突然看不见它。

**「选中了某个 shell」和「这次会话能不能跑它」是两件事。** 自动模式不会因为沙箱策略临时换解释器——那会让同一个设置在不同会话里跑出不同 shell，看起来像工具坏了。Windows 上的对应关系：

| 会话策略（Windows） | Git Bash | Windows PowerShell |
|---|---|---|
| `read-only` / `workspace-write` | **拒绝**，spawn 之前报错 | 正常执行：交给宿主执行器，在该模式下运行 |
| 判定不出策略（服务缺失、取不到会话、模式不认识） | **拒绝**（fail closed，不猜） | **同样拒绝**：连交给执行器时该带哪个模式都不知道，宁可不跑 |
| `danger-full-access` | 允许，直接运行（不经过沙箱） | 正常执行 |

被拒绝时的提示不会建议放宽会话权限，它给出的出路是：**切到 Windows PowerShell 模式**跑（沙箱生效）、**改写成等价的 PowerShell 命令**，或者**把「这条命令需要 POSIX shell」告诉用户、由用户决定**。插件不会暗中替换解释器。

POSIX 上不存在这一列的差异：`bash` 就是宿主自己的 shell，命令交给 `ctx.shell` 执行，沙箱照常生效。

**这一行不显示可执行文件路径。** 路径属于「结果里说一次就够」的细节：`run_shell` 的每条返回都会带上它，而设置行只回答「用哪个 shell」。

## 它会给你什么

**`run_shell` 工具。** 参数 `command`（必填）和 `workdir`（可选，绝对路径）。返回退出码、stdout、stderr，以及这次命令**在哪跑的**。

**非零退出不是错误。** `grep` 没匹配到会退出 1，那是一个结果而不是故障，工具照常返回退出码和输出。只有「shell 根本起不来」才算错误。

**每条结果都标明路径：`· host` 还是 `· direct (unsandboxed)`，而且能不能走 `· direct` 由会话的沙箱策略决定。**

- `· host`：命令交给了宿主的 `ctx.shell`（Windows 上是 `pwsh-sandbox`），沙箱、取消、工作目录、进程生命周期都归宿主。会话的沙箱模式会随请求一起交给执行器，不会被丢掉。
- `· direct (unsandboxed)`：插件自己 spawn。**Git Bash 在 Windows 上只能走这条**——沙箱里的 pwsh 无法创建 MSYS 进程（`NtCreateDirectoryObject 0xC0000022`，已实测）。而它是**没有沙箱**的，所以只在会话明确是 `danger-full-access` 时才允许。括号里的一个词就是全部安全语义：这句文本每次请求都进模型上下文，所以完整说明放在 `presentationMeta` 里给界面，内容里只留标记。

> 完整说明改成**界面文字**：`Ran directly: the session grants danger-full-access, so this command did not cross the sandbox.` 以前它是结果的第二行，约 39 token/次、常驻上下文；现在它走 `data.meta`，界面照样显示，模型只看到 `(unsandboxed)`。设置里可以关掉这行显示，**但模型侧的标记不受影响**。

**受限会话里 Git Bash 会被拒绝，这是刻意的（fail closed）。** 只读、`workspace-write`、以及任何无法判定模式的会话，`run_shell` 会在**启动任何进程之前**报错并说明原因，什么也不执行。提示给出的是「改用 Windows PowerShell」——它能在沙箱内跑；插件不会替你换解释器，也不会劝你提权。

> 这条以前是 fail-open：旧版本会在未沙箱的情况下直接 spawn，只在结果里事后声明一句。事后的声明不是控制手段——一个只读会话仍然能写盘。现在的判据在 `lib/index.js` 的 `resolveSandboxDecision()`：策略服务缺失、取不到会话、模式不认识，一律拒绝；只有明确的 `danger-full-access` 才放行 direct 路径。

**取消会被传播。** 工具调用被取消时，中止信号会交给实际执行命令的那条路径（宿主执行器或插件的直接 spawn），已经取消的调用不会再启动进程。取消之后子进程树是否随之全部结束，取决于该平台的执行器实现，本文不把它写成跨平台保证。

**命令卡片。** `run_shell`、宿主的 `pwsh` 与 `bash` 三种命令行都渲染成同一张卡（`tool.call.toolview`，按 wire 名注册；宿主原有的 `bash` 视图用 `priority` 让位）：

```
Ran a command                       ← 描述（模型没写时用「已运行命令」）
┌──────────────────────────────┐
│ $ grep -rn "box-shadow" src  │   ← 带 $ 前缀的命令，命令/参数/字符串分色
└──────────────────────────────┘
输出的前几行直接流淌在卡片里……        ← 无标签、无第二个框
Ran directly: the session grants danger-full-access, so this command did not cross the sandbox.  ← 沙箱说明（来自 data.meta，可在设置里关闭）
```

罐头输出（`[gitbash · …] exit 0 · direct (unsandboxed)` 那一行）保持原样，它是结果的一部分。卡片默认自动换行，长输出在 280px 后内部滚动，不会把对话撑高。

## 与宿主 shell 的关系

宿主的 shell 是 `ctx.shell` 能力接缝，**每个上下文只能有一个实现**。Windows 上基础 bundle 组装的是 `pwsh-sandbox`（PowerShell），POSIX 上是 `bash-sandbox`。

所以「让 Git Bash 成为默认」是 **profile 层**的决定，不是运行时劫持：本包的 `cordis.patch.yml` 只插入自己的行。真正的接管路径是在 profile 的 `cordis.patch.yml` 里用 `disabled:` 关掉平台默认那一行——代价是**宿主的 PowerShell 执行器不再可用**。不想付这个代价，就保留开关，让 `run_shell` 与原生 `pwsh` 并存。

**模式的切换会真的到宿主。** 设置行在浏览器进程里，`run_shell` 在宿主进程里；两者之间有一条带同源头围栏的 `POST /dsh-git-bash/mode`（`GET` 可读回当前值）。只发 Cordis 事件是不够的——那个事件跨不过进程边界，宿主会永远停在 `auto`。

## 开发者

```bash
cd plugins/git-bash
npm test        # 新鲜度 + 清单契约 + 解析 + 工具 + 状态 + 命令卡片（数字以输出为准）
npm run build   # 重新生成 client/client.js（产物提交进 git）
```

目录职责、改包名的四个位置、发布流程见仓库根 [AGENTS.md](../../AGENTS.md)。
