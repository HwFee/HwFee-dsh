# dsh-git-bash · Git Bash 默认 shell

在 Windows 上把 DeepSeek Harness 的命令解释器从 PowerShell 换成 **Git Bash**。

装好之后：模型跑的 `bash` 命令走 Git Bash，`grep`、`sed`、`find`、`&&`、`$VAR`、shebang 脚本都按 POSIX 语义工作，路径就是你项目所在的那个文件系统。

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

按顺序试四个来源，第一个成功的就算数：

1. **`DSH_GIT_BASH` 环境变量** —— 指向 `bash.exe` 的完整路径。非标准安装位置用这个。
2. **`git --exec-path`** —— 得到 `…/Git/mingw64/libexec/git-core`，往上两级就是 Git 根目录，取它自带的 `bin/bash.exe`。
3. **常见安装位置** —— `C:\Program Files\Git\bin\bash.exe` 等。
4. POSIX 上直接用 PATH 里的 `bash`。

**为什么不用 `where bash`。** Windows 上 `bash` 常常解析到 `C:\Windows\System32\bash.exe` —— WSL 的替身。它确实是 bash，但它是**另一个文件系统**（`/mnt/c/...`）、另一个用户、而且没有 Windows 那份 `git`。选错它之后每条命令都以一种看起来像"插件坏了"的方式失败，所以这里宁可找不到也不误选。

找不到时插件**不会消失**：设置里的那一行会显示「没找到 Git Bash」并告诉你怎么指定路径。

## 设置

设置 → 通用设置，多出一行 **默认 shell**：

- 上面显示**实际找到的路径**，一眼能看出用的是哪个 bash
- 下面一个开关 **保留系统 shell 工具**（默认开）—— 关掉后模型的工具列表里只剩 `run_shell`，不再有平台的 PowerShell 工具

## 它会给你什么

**`run_shell` 工具。** 参数 `command`（必填）和 `workdir`（可选，绝对路径）。返回运行它的 shell 路径、退出码、stdout 和 stderr。

**非零退出不是错误。** `grep` 没匹配到会退出 1，那是一个结果而不是故障，工具照常返回退出码和输出。只有"shell 根本起不来"才算错误。

**命令卡片。** `run_shell`、宿主的 `pwsh` 与 `bash` 三种命令行都渲染成同一张卡（`tool.call.toolview`，按 wire 名注册；宿主原有的 `bash` 视图用 `priority` 让位）：

```
Ran a command                       ← 描述（模型没写时用「已运行命令」）
┌──────────────────────────────┐
│ $ grep -rn "box-shadow" src  │   ← 带 $ 前缀的命令，命令/参数/字符串分色
└──────────────────────────────┘
输出的前几行直接流淌在卡片里……        ← 无标签、无第二个框
```

罐头输出（`[gitbash · …] exit 0 · direct` 那几行）保持原样，它是结果的一部分。卡片默认自动换行，长输出在 280px 后内部滚动，不会把对话撑高。

## 与宿主 shell 的关系

宿主的 shell 是 `ctx.shell` 能力接缝，**每个上下文只能有一个实现**。Windows 上基础 bundle 组装的是 `pwsh-sandbox`（PowerShell），POSIX 上是 `bash-sandbox`。

**`run_shell` 尽量走宿主的执行器，并在结果里说明走没走。** 选中的解释器作为命令交给 `ctx.shell`：PowerShell 模式下是 `& '<pwsh.exe>' -NoProfile -NonInteractive -Command '<command>'`，结果显示 `· host`，沙箱、取消、工作目录和进程生命周期都归宿主。**Git Bash 在 Windows 上是个例外**：沙箱里的 pwsh 无法创建 MSYS 进程（`NtCreateDirectoryObject 0xC0000022`，已实测），所以这一模式仍由插件直接启动，结果显示 `· direct` 并附一句「未经过沙箱」。这不是静默降级——每一条结果都会写清楚。代价是本工具**不能**替用户发起沙箱升级审批（那是原生 `pwsh` 工具的职责），被拒绝时会如实报错。

**模式的切换会真的到宿主。** 设置行在浏览器进程里，`run_shell` 在宿主进程里；两者之间有一条带同源头围栏的 `POST /dsh-git-bash/mode`（`GET` 可读回当前值）。只发 Cordis 事件是不够的——那个事件跨不过进程边界，宿主会永远停在 `auto`。

因此"让 Git Bash 成为默认"是 **profile 层**的决定，不是运行时劫持：本包的 `cordis.patch.yml` 只插入自己的行；要让 Git Bash 接管，需要在 profile 的 `cordis.patch.yml` 里用 `disabled:` 关掉平台默认的那一行。这样做的后果是**宿主的 PowerShell 执行器不再可用**——如果你需要它，别关那一行，改用 `run_shell` 与 `pwsh` 并存（即保留开关，让两个工具都在）。

## 开发者

```bash
cd plugins/git-bash
npm test        # 新鲜度 + 清单契约 + 解析 + 工具 + 状态 + 命令卡片，113 项
npm run build   # 重新生成 client/client.js（产物提交进 git）
```

目录职责、改包名的四个位置、发布流程见仓库根 [AGENTS.md](../../AGENTS.md)。
