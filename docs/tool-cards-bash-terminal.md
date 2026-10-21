# 工具卡片逆向 · Bash / 终端 / 命令执行

> **性质**：新增的独立条目。补参考仓库 `.reference/open-claude-ui` 未覆盖的一块 ——
> Bash 工具卡（终端视图）、聊天内联 bash 块、真实终端面板（xterm）、后台任务呈现。
>
> **版本**：本机 Claude Desktop **2.42304.2**（参考仓库针对 v2.37337.1）。
>
> **核心结论**：
> 1. **命令压平即截断**：`replace(/\s+/g," ").trim()` → `slice(0,95)+"…"`（`D=96`）。多行命令一律变单行。
>    聊天里的 Bash 卡更极端 —— 头部**完全不显示命令**，只有动作词（Ran / Running / Failed to run）。
> 2. **状态点无动画**：整块终端视图 CSS **26 条规则，`animation`/`transition`/`@keyframes` 计数全为 0**。
>    只有颜色静态切换：`completed #4caf7d` / `running #d9a15c` / `error #e5645f` / `neutral #8a8782`。
> 3. **stdout/stderr 不做行级切分**，整块变色。但内联 `!` 命令在**数据层**就把 stderr 拼进 output
>    （`output = stdout + "\n" + stderr`），那条路径**丢失了 stderr 区分**。
> 4. **`--cds-font-mono` 最终解析到 `anthropic-mono`**（`.cds-root` 覆盖 `:root`），字体文件随包分发。
>    这一条与 `typography-cross-check.md` §2.8 / §1.4 一致，且**无 CJK 回退** —— 终端里中文会掉到系统字体。
> 5. **`.epitaxy-terminal-view` 的 `line-height: 1.55` 是硬编码**，不受 `--cds-leading-code`（19px）约束。
>    这是全部工具卡片中**唯一一处故意脱离设计令牌**的地方。
>
> **本文与 `typography-cross-check.md` §5.4 的关系**：
> §5.4 已记录终端卡用独立行高倍数；本文 §6 是逐元素明细，两者数值一致（13px × 1.55 = 20.15px）。
>
> **证据约定**：`<chunk>.pretty.js:N` 指 `C:\Users\17445\Desktop\rea\claude-ui-re\pretty\` 下格式化后的行号。

---
# 05 · Bash / 终端 / 命令执行 UI 逆向

范围：**Bash 工具卡（epitaxy 终端视图）**、**聊天内联 bash 块**、**真实终端面板（xterm）** 三类。不含审批卡。

证据约定：`文件:行号` 全部指 `C:\Users\17445\Desktop\rea\claude-ui-re\pretty\` 下 pretty 后的文件（除注明 `ion-dist/…` 或 `asar/…` 为原始打包文件）。标注「**确证**」= 代码/字符串直读；「**推断**」= 由相邻关系或运行时语义推出。

## 0. 结论速览

| 问题 | 答案 |
| --- | --- |
| Bash 卡头部显示什么 | 聊天里的 Bash 卡头部**不显示命令**，只显示动作词（Ran / Running / Failed to run）+ description；命令在展开体里以代码块呈现。另一条 `bash_tool` 卡片头部显示「动词 + 命令 chip」，多行被压成单行并 CSS 省略号截断。终端视图（epitaxy）里命令被**压平空白 + 截断到 96 字符**。 |
| 状态点颜色 | neutral `#8a8782` / running `#d9a15c` / completed `#4caf7d` / error `#e5645f`，字形是 `⏺`（U+23FA），**无动画**（颜色静态切换）。 |
| stdout/stderr 区分 | 终端视图：stderr 整块走 `.terminal-error`（`#e5645f`）。聊天卡：stderr 走 `text-danger` + `!bg-danger` 背景。真实终端：交给 xterm ANSI 16 色。 |
| 折叠阈值 | 终端视图：**超过 1 个非空行**（或首行 >200 字符）就折叠成一行摘要 + 展开按钮。聊天卡/内联块**没有折叠**，只有 `max-height` + 纵向滚动（160px / 200px）。 |
| max height + 滚动 | 内联 bash 输出 `max-h-[160px]`；工具卡展开体 `max-h-[200px]`（聚焦模式 `max-h-[4000px]`）；任务输出 `max-h-[200px]`；终端视图整页滚动。 |
| `terminal-todo-done` | 终端视图把 `TodoWrite / TaskCreate / TaskUpdate` 渲染成待办行，completed 用 `☒` + 删除线 `#6e6b64`。 |
| 真实终端库 | xterm.js（`c788b5dbe-aTpk2pXo.js`，475KB，`Terminal` 类，`allowProposedApi`、`registerDecoration`、`xterm-*` CSS 全在里面）；另有一份 headless 实例做输出捕获（`ca41b3815-B-9GCr8Y.js`）。 |
| 支持的 shell | Windows 只有 3 个：`pwsh`（PowerShell 7）、`powershell`（Windows PowerShell）、`gitbash`（Git Bash）。 |
| 终端主题 | Claude Light / Claude Dark 两套，ANSI 16 色见 §7.2。 |

---

## 1. 三类界面总览

```
① 终端视图 / "Bash 工具卡"  —— EpitaxyTerminalView（整页替代普通 transcript）
   cf6989767-CXXjtvjM.js:591  export { de as EpitaxyTerminalView }
   cc43287c9-DJ31ir0Z.js:40446-40456  entry.id = "epitaxy_terminal_view", tier T3, pick: e.EpitaxyTerminalView
   └ .epitaxy-terminal-view (role=region, h-full overflow-y-auto overflow-x-hidden)
      └ .epitaxy-terminal-view-column (max-width 960px, padding 24px 20px 40px, gap 6px)
         ├ button.terminal-line.terminal-dim.terminal-expand  ← "加载更早" 行
         ├ [line] .terminal-line ...  （prompt / assistant / thinking / tool / todos / error / event / chapter）
         ├ 失败待发送行 → .terminal-line.terminal-error + "Open in terminal" 链
         ├ 工作指示器（.terminal-spinner 或 .terminal-done）
         └ 运行中提示行（.terminal-dot-running + Open in terminal）
   └ 加载态 I9: .epitaxy-terminal-hold（bg #101010）+ .epitaxy-terminal-hold-exit

② 聊天内联 bash —— 三种不同实现
   ②a 可执行 fence（新）：c19e90103-VYuLVu9R.js:4610 Bg → Lg(输出) → Vg(历史 ! 命令)
   ②b Bash/PowerShell 工具卡：cc1aae219-Bd1YvDXP.js:13590 nU
   ②c bash_tool 卡（带命令 chip）：cc1aae219-Bd1YvDXP.js:27051 Z$ → W$ (chip)
   解析层：c7d4a4512-Cna5tt7o.js:2553 Z() / 2595 Q()  —— <bash-input>/<bash-stdout>/<bash-stderr>
           c5b9e310e-BY0LEcyp.js:4-38 标签白名单

③ 真实终端面板（xterm）
   cccc2cf0a-JnTR9JZB.pretty.js:1776-1857  My → 面板容器（多 tab）
   c6bf19e8f-BRkhh_Re.pretty.js:3033-3587  ShellTerminal（xterm 实例 + 装饰 + 空态 + 退出态）
   c788b5dbe-aTpk2pXo.pretty.js             xterm.js 本体
   ca41b3815-B-9GCr8Y.pretty.js:250-262     headless Terminal（输出捕获）
   cf718f694-r73RXp0X.pretty.js            终端设置项 + 主题合并 + 空闲光标
```

---

## 2. Bash 工具卡（终端视图 `EpitaxyTerminalView`）

### 2.1 头部显示什么

工具行结构（`cf6989767-CXXjtvjM.pretty.js:364-424`，组件 `ce`）：

```
div.terminal-line
├ span.terminal-dot-{neutral|running|completed|error}  → "⏺ "（U+23FA + 空格）
├ span.terminal-tool-name[font-variation-settings:normal] → 工具名（Bash / PowerShell / 任意 tool name）
│      · MC 前缀改写：mcp__x__y → "x:y (MCP)"            (:73-75)
├ span.terminal-dim  → "(<arg>)"                           (:380)
└ div.terminal-result …                                  (见 §2.2)
```

- **命令文本**：`arg` 不是原文，而是 `P()` 处理过的（`:60-65`、`:63-65`）：
  ```js
  M = e => e.replace(/\s+/g, " ").trim()   // 所有空白压成单空格 → 多行命令变一行
  N = (e,t) => e.length > t ? e.slice(0,t-1)+"…" : e
  P = e => N(M(d(e)), 96)                  // D = 96 (:38)
  ```
  → **多行命令被压平为单行；超过 96 字符截断并以 `…` 结尾**（确证）。
- **参数取值优先级**（`:42-56`）：`command → file_path → notebook_path → pattern → path → url → query → description → prompt → skill → title → name → message`，都没有则取 `input` 里第一个非空字符串（`:71`）。
- 状态三元组：`status: n.error ? "error" : n.output === void 0 ? "running" : "completed"`（`:182`）。
- 工具行状态 → 点的映射（`:367-374`）：
  ```js
  r.interrupted || r.rejected ? "terminal-dot-neutral"
  : status === "error"      ? "terminal-dot-error"
  : status === "completed"  ? "terminal-dot-completed"
  :                           "terminal-dot-running"
  ```
  `rejected` 同时含 `policyDenied`（`:105`）。

### 2.2 状态点颜色与动画（确证，`cf6989767…pretty.js:36` 内联 CSS）

| 类 | 值 |
| --- | --- |
| `.terminal-dot-completed` | `color:#4caf7d` |
| `.terminal-dot-running` | `color:#d9a15c` |
| `.terminal-dot-error` | `color:#e5645f` |
| `.terminal-dot-neutral` | `color:#8a8782` |

- **没有动画**：这四个类只改 `color`。整个 `.epitaxy-terminal-view` 的 CSS 里**没有任何 `@keyframes` / `animation` / `transition`**（内联 CSS 共 **26 条规则**，加 `transition`/`animation` 计数 = 0，已逐条核过）。
- 唯一的「动」是 spinner 的逐帧换字（§2.6），不是 CSS 动画。

### 2.3 输出渲染：stdout / stderr 与四层结构

**摘要生成**（`cf6989767…pretty.js:82-92`）：

```js
R(output):
  t = 清洗后 trimEnd
  n = 第一条非空行
  r = 该行 trim
  i = t.slice(n.start) 再截到 k = 20000 字符         // :39
  a = 总行数 - 1
  o = a > 0 || r.length > 200                        // O = 200 (:39)
  → { resultSummary: 首行≤200字符, resultExtraLineCount: a, resultFullText: o ? i : undefined }
```

即：**折叠阈值 = 输出非空行数 > 1，或首行长度 > 200 字符**（确证）。

**DOM 四层**（`:385-421`）：

```
div.terminal-result [.terminal-error] [.terminal-result-expanded]
├ 折叠态（display:block，继承 .terminal-line 的 pre-wrap）
│  ├ "⏿ " + resultSummary
│  └ button.terminal-expand  →  "{count} more lines" | "Show more"
└ 展开态（.terminal-result-expanded → display:flex）
   ├ span.terminal-result-glyph  "⏿ "      white-space:pre; flex:none
   └ div.terminal-result-full              white-space:pre; flex:1; min-width:0; overflow-x:auto
```

CSS（`:36`）：

```css
.epitaxy-terminal-view .terminal-result{color:#8a8782;padding-left:2ch}
.epitaxy-terminal-view .terminal-result.terminal-error{color:#e5645f}
.epitaxy-terminal-view .terminal-result-expanded{display:flex}
.epitaxy-terminal-view .terminal-result-glyph{white-space:pre;flex:none}
.epitaxy-terminal-view .terminal-result-full{color:#a8a59e;white-space:pre;
  unicode-bidi:plaintext;flex:1;min-width:0;overflow-x:auto}
```

- **stderr 的区分方式：整块变色，不做行级切分。** 判定链：`isError = status==="error" && !interrupted`（`:106`），然后 `className: "terminal-result " + (isError?"terminal-error":"")`（`:387`）。所以 stdout 走 `#8a8782`（折叠）/ `#a8a59e`（展开全文），stderr 整块 `#e5645f`。**没有** stdout/stderr 双栏或前缀标记。
- 结果前缀字形统一是 `⏿`（U+23BF，`:391`/`:397`）。
- rejected / interrupted 不显示输出，直接给一行（`:381-384`）：`"⏿ " + 门控文案（id 191utrp / zfxffc）`。

### 2.4 展开/收起按钮：文案与阈值

按钮（`:403-417`）：

```js
i("button", { type:"button", className:"terminal-expand",
  onClick: () => { s(!0); a?.() },          // 单向：只展开，不能收起
  children: r.resultExtraLineCount > 0
    ? i(p, { id:"qp71rz", dangerouslyVisiblePublicValues:{ count: r.resultExtraLineCount } })
    : i(p, { id:"1ddkkj1" }) })
```

- **单向展开**，没有「收起」，展开后原按钮消失（`s` 一旦 true 不再回退）。
- 文案是**门控消息**（gated message，`p` = `Mp` = `shared-104-A_oIUFQK.pretty.js:3074 $l`）：先查运行期门控目录，查不到就渲染 `defaultMessage: " "`（`shared-104…:3080`）。
  → **在静态 `i18n/en-US.json` 里 `qp71rz` / `1ddkkj1` 均不存在**（全量 grep 只命中 `cf6989767` 自身），因此离线包里这两个按钮文字实际是**空白**。（确证：key 缺失；推断：线上由门控目录注入，语义按命名与参数判断为「+N 行 / 展开显示」。）
- 展开时向上通知父组件 `onUserExpand`（`a`）→ 父层 `A()` 把「是否贴底」置为 false（`cf6989767…:510-512`），防止自动滚动把用户位置抢走。

### 2.5 长输出：max height 与滚动

- 终端视图**没有 max-height**，是整个 `.epitaxy-terminal-view` 容器自己 `h-full overflow-y-auto overflow-x-hidden`（`:542`），列容器 `max-width:960px; padding:24px 20px 40px; gap:6px`（`:36`）。
- 自动贴底逻辑（`:520-528`、`:531-538`）：
  ```js
  贴底判定：scrollHeight - scrollTop - clientHeight < oe(=48)   // :317
  贴底 → 滚到底；不贴底 → 保持相对位置
  不贴底 && scrollTop < ue(=200) && hasEarlier → 触发 loadEarlier("near_top")   // :490
  ```
- `.terminal-result-full` 单独 `overflow-x:auto` → 展开后的超长单行**横向滚动**（因为 `white-space:pre`）。

### 2.6 工作指示器（spinner）与「完成」行

`cf6989767…pretty.js:314-363`：

```js
ie = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"      // Braille 10 帧（\u280B…\u280F）
X  = 100                      // 每 100ms 换一帧
ae = 4e3                      // 每 4s 换一条动词短语（6 条：Z 数组 :318）
填字 div.terminal-line.terminal-spinner
   ├ span[aria-hidden] "⠋ "
   ├ span[role=status] → 门控动词（id 1vytzaz/1t729ny/o26n5u/h7vg4q/gxggi2/z5k9nl）
   └ span[aria-hidden] " " + 门控 "…{seconds}s"（id azaocy）
完成：div.terminal-line.terminal-done, role=status
   "⏺ " + 门控 "Done in {seconds}s"（id 13vgc4s）
```

CSS：`.terminal-spinner{color:#d9a15c}`、`.terminal-done{color:#4caf7d}`（`:36`）。这 9 个门控 id 同样不在静态目录里（确证缺失）。

### 2.7 行级 dispatch（`Q`，`:425-480`）

| `line.kind` | 渲染 | 类 / 颜色 |
| --- | --- | --- |
| `prompt` | 用户输入文本 | `.terminal-prompt` `#b8b5ae`，`:before` 加 `"> "` `#6e6b64` |
| `assistant` | 正文 | `.terminal-line` |
| `thinking` | 斜体 | `.terminal-thinking` `#8a8782` + `font-style:italic` |
| `tool` | 见 §2.1 | 点 + 名 + (arg) + result |
| `todos` | 待办列表 | `☒`/`☐` + `.terminal-todo-done` / `.terminal-todo-active` |
| `error` / `stop_warning` / `stats_failed` / `prompt_blocked` | 红字 | `.terminal-error` `#e5645f` |
| `event` | `"◈ "` + 文本 | `.terminal-dim` `#8a8782` |
| `chapter` | `"── "` + 标题 | `.terminal-chapter` `#6e6b64` |
| `remote_control_notice` | 标题 + 缩进正文 | 有 warning 时 `.terminal-error`（`:481-489`） |

### 2.8 `terminal-todo-done` 的触发场景（问题 4）

`cf6989767…pretty.js:41`：

```js
A = new Set(["TodoWrite", "TaskCreate", "TaskUpdate"]);
```

`z(e)`（`:93-97`）：工具名命中这个集合 → 不再当普通工具行，而是转成 `{kind:"todos", items}`；items 由 `S(e.name, e.input)`（`c21994603-CxueZ2_E.js` 的 `t`）产生。

渲染（`:436-448`）：

```js
div.terminal-line
└ items.map(item => div(
    className: item.status === "completed" ? "terminal-todo-done" : "terminal-todo-active",
    children: [ item.status === "completed" ? "☒ " : "☐ ", item.content ]))
```

CSS：`.terminal-todo-done{color:#6e6b64;text-decoration:line-through}`、`.terminal-todo-active{color:#e8e6e3}`。

→ **场景：终端视图里 Claude 调 `TodoWrite` / `TaskCreate` / `TaskUpdate` 时，那条工具调用不显示成 Bash 风格行，而显示成待办清单；已完成项变灰 + 删除线。**

---

## 3. 聊天内联 bash 块

### 3.1 `!command` 的历史记录解析（`<bash-input>/<bash-stdout>/<bash-stderr>`）

**标签白名单**（`c5b9e310e-BY0LEcyp.pretty.js:4-38`）：

```js
a = ["command-name","command-message","command-args",
     "local-command-stdout","local-command-stderr","local-command-caveat",
     "bash-input","bash-stdout","bash-stderr"]
c = ["bash-notification", …]                 // :29 —— 只用于从正文里剥掉
```

**解析函数**（`c7d4a4512-Cna5tt7o.pretty.js:2553-2590`，函数 `Z`）：

```js
r = /<(bash-input|bash-stdout|bash-stderr|local-command-stdout|local-command-stderr
      |command-name|command-args|command-message)>([\s\S]*?)<\/\1>/g
// 每个标签只取第一次出现；剩余文本 a 必须为空才认作 bash 块
u = local-command-stdout ?? decode(bash-stdout)    // stdout
d = local-command-stderr ?? decode(bash-stderr)    // stderr
f = bash-input
p = command-name ?? bash-input
m = command-args
→ { command: (p ?? "") + (m ? " " + m : ""),
    output:  (u ?? "") + (d ? "\n" + d : "") }     // :2589
```

→ **stdout 与 stderr 在数据层就被拼成同一个 `output` 字符串（stderr 追加在后面，换行分隔）**，所以历史记录渲染里**无法再区分 stderr**（确证）。这与 §2.3 的整块变色不同 —— 那条路径靠 tool_result 的 `is_error`，不靠这两个标签。

多轮 `!` 会话由 `Q()` 解析（`:2595-2643`），扫 `<bash-input>` 出现位置并用 `Zs = /(?:^|\n)<bash-input>/g` 分段，产出 `{turns[], prose, proseLeads}`。

### 3.2 历史 bash 块的 DOM 结构与样式（`Vg`，`c19e90103-VYuLVu9R.pretty.js:4895-4977`）

```
div.relative.max-w-full.w-full.select-text
├ div.relative.epitaxy-diff.epitaxy-fence.rounded-lg.overflow-clip      ← 命令本体（只读代码围栏）
│  ├ el{file:{name:"cmd", contents:command, lang: "bash" | "text"}}     // 以 / 开头的单段斜杠命令降级为 text(:4918-4921)
│  └ [tracked] button(ghost, icon=CommandLinePrompt, aria-label="Open in terminal")
│        绝对定位 right-1.75；单行命令用 mt-[calc(var(--cds-pad-md)+var(--cds-leading-code)/2-var(--cds-h-control)/2)]
│        多行命令用 mt-1.25                                              (:4931-4948)
└ div[ref][onScroll]  className="mt-1.25 rounded-lg epitaxy-card-outline-overlay
                       overflow-clip max-h-[160px] overflow-y-auto px-md py-1.25"
   └ pre.text-code.text-secondary.whitespace-pre-wrap.break-all
      ├ error 存在  → span.text-danger {error}          // 只有 error 时才是红
      ├ output 存在 → <oc diff> {output}                // ANSI/diff 着色渲染器
      ├ 已完成无输出 → "(no output)"                     // :4887
      └ 未完成无输出 → "Running…"                        // :4969
```

**关键度量（确证）**：输出区 `max-h-[160px]`（=160px）+ `overflow-y-auto`；内边距 `px-md`（`--cds-pad-md`，默认 8px / comfortable 12px）+ `py-1.25`（`--spacing×1.25` = 5px）；字号 `text-code`；颜色 `--cds-text-secondary`。

### 3.3 可执行 fence（新内联命令块，`Bg`，`:4610-4977`）

这是「聊天里出现 ```bash 围栏且允许执行」的形态。按钮栏（`:4828-4877`）：

```
button(ghost,base,iconOnly) 三态：
├ 运行中（de）→ icon=Mg，tooltip "Running — click to cancel"，onClick=cancel   // :4831-4844
├ 空闲      → icon="Play"，aria-label = "Run in terminal" | "Run in terminal and send
│               output to Claude" | "Run in PowerShell"                          // :4565-4569
└ Copy      → icon=Copy/Check，aria-label "Copy code"/"Copied"（1.2s 后回退）    // :4862-4872
另外 W>0 时先出现「眼」按钮：Reveal {count} secrets / Hide {count} secrets
   （cbb72cde9-C55JFDVD.pretty.js:221-243，Fo=It）
```

- **注意**：那个眼睛按钮是**密钥打码的显示/隐藏**（`Reveal {count} secrets`），**不是**「展开更多行」。本 chunk 里没有输出折叠控件。
- 命令块的输出也走 `Lg`（`:4571-4607`）：`rounded-lg epitaxy-card-outline-overlay text-code max-h-[160px] overflow-y-auto px-[calc(10px+1ch)] py-1.25`，`pre` 为 `whitespace-pre-wrap break-all`，error → `span.text-danger`。

### 3.4 聊天里的 Bash / PowerShell 工具卡（`nU`，`cc1aae219-Bd1YvDXP.pretty.js:13590-13677`）

```
XH = YH（工具行外壳）
├ icon: CommandLine (sm|md), className "text-text-500"        // :13549-13550
├ text: 三级优先级（:13615-13622）
│   ├ 被取消  → "Stopped running the command"   (id hKfea45aHT)
│   ├ 有 description → description
│   ├ 已完成  → "Ran a command"                  (id cv9VNYMHXY)
│   └ 运行中  → "Running a command"              (id +B6q99cXCl)
└ children: 展开体（JH，:13326-13348）
   div.overflow-hidden
   └ div.mx-2.5.mt-1.mb-2.rounded-lg.border-[0.5px].border-border-300.bg-bg-000
      └ div.flex.flex-col.gap-2
           · [&_code]:!text-code [&_pre]:!text-code   （聚焦/放大模式）
             或 [&_code]:!text-xs [&_pre]:!text-xs     （常规）
           · max-h-[200px] overflow-y-auto
           · 聚焦模式改 max-h-[4000px] overflow-y-auto
        ├ 命令代码块（language = "bash" | "powershell"，:18222）
        ├ 输出块（title "Output"）：isError → bg-danger-900 / text-danger-000
        └ is_truncated → Dw 截断提示（:13671）
```

- **头部不显示命令**，命令只在展开体里（`L(C, {language, section:"command"})`，`:13663`）。
- stderr 判定（`:13624`）：`N = is_error || (!cancelled && result.isStderr)`；`F = is_error || result.failed`。

### 3.5 `bash_tool` 卡：头部带命令 chip（`Z$` + `W$`，`cc1aae219…:26991-27159`）

```
span.flex.items-center.min-w-0.text-secondary
├ span.whitespace-nowrap.me-1.text-secondary  → 动作词
│     streaming "Running" / error "Failed to run" / success "Ran"     (:27074-27076)
└ span.bg-gradient-to-b.from-neutral-30.via-neutral-30/80.to-neutral-30
      .shadow-xs.rounded.px-1.py-0.5.font-mono
      .truncate.overflow-hidden.text-ellipsis.min-w-0.text-secondary
      title={command}                                                 (:27008-27013)
```

**多行命令处理**：父级带 `whitespace-nowrap`（`:27005` 的 `min-w-0` + `truncate`），HTML 里 `\n` 在 nowrap 下折叠为空格，再由 `text-overflow:ellipsis` 单行省略 → **多行命令显示成一行 + 省略号，完整命令进 `title` 原生 tooltip**。

展开体（`:27087-27156`）`data-testid="repl-output"`，`flex flex-col gap-3 p-3 pt-1`：

| 内容 | 标题 | 样式 |
| --- | --- | --- |
| 命令 | 无 | `language:"bash"` 代码块 |
| stdout | `Output` (98/B4gW/HL) | `language:"bash"`，`[unicode-bidi:plaintext]` |
| stderr | `Error` (96iMiC11cz) | `text-danger` 文本色 + `!bg-danger` 背景 |
| 无输出 | `Output` | `"exit code {returncode}"` (Uoe/PEvNYN) |
| 整体失败 | `Command failed` (REMG+p+ZiU) | 原始内容 + `text-danger`/`!bg-danger` |
| 解析失败 | `Output` | 原始内容 + 红 |
| 空结果 | `No output` (DyoXiEr2fN) | `"Command completed with no output"` (TRBc7KuuG+) |

- 滚动：这里用 `ow`（`se`，`c5ac695a3-CqnCpnMn.pretty.js:199-288`）的 `isScrollable` → `!max-h-[238px]`（**238px**，`:241`/`:276`）。这是本范围内第四个不同的高度上限。

---

## 4. 真实终端面板（xterm）

### 4.1 用的什么库

- **xterm.js 本体**打包为 `c788b5dbe-aTpk2pXo.pretty.js`（475KB）。导出 `Terminal`（`c6bf19e8f…:38` `import { Terminal as ve }`）。
- 内部自证：`"horizontalHasArrows is not supported in xterm.js"`（`c788b5dbe…:3582`、`:3649`）、`.xterm-viewport` / `.xterm-screen` / `.xterm-decoration-container` 全套 CSS（`c788b5dbe…:1733` 附近一大段）、默认选项对象含 `allowProposedApi`、`windowsPty`、`rescaleOverlappingGlyphs`（`:8190-8229`）。
- **渲染后端是 WebGL**（懒加载）：`c6bf19e8f-BRkhh_Re.pretty.js:2423-2425` `sr = f({origin:"background", tag:"xterm_addon_webgl"}, () => import("./c7c73ad28-DGVd537-.js"))`；`xr()`（`:2515-2534`）`new br.WebglAddon()` → `terminal.loadAddon(t)`，失败/上下文丢失时 `webglState="failed"` 回退 DOM 渲染并 `console.warn("WebGL terminal renderer unavailable, using DOM")`。
- **另一份 headless 实例**用于捕获输出做「命令结果」：`ca41b3815-B-9GCr8Y.pretty.js:250-262`
  ```js
  new Terminal({ cols: 80, rows: 24, scrollback: 400,
                 windowsPty: isWindows ? {backend:"conpty", buildNumber} : undefined,
                 scrollOnEraseInDisplay: true, allowProposedApi: false })
  ```
  它注册 `registerMarker` / CSI/OSC handler 追踪 prompt、命令回显、清屏、alt-screen，把结果抽成纯文本（`Me()`，`:489-548`）。输出超过 512KiB 保留尾部并插入 `"[earlier output truncated]"`（`:182-193`）；积压 >4MiB 丢帧插 `"[output dropped—terminal fell behind]"`（`:194-229`）。
- **没有** `@xterm/headless` 这个包名字符串出现在产物里（全量 grep 无命中）；headless 复用同一个 `Terminal` 类，只是 `allowProposedApi:false` 且不 `open()` 到 DOM。

### 4.2 xterm 实例的构造参数（`c6bf19e8f-BRkhh_Re.pretty.js:2713-2726`，确证）

```js
new Terminal({
  cursorStyle: c.cursorStyle,        // 默认 "block"
  cursorBlink: c.cursorBlink,        // 默认 true
  fontSize: i ?? 13,                 // ur = 13（:2428），仅当调用方不传时生效
  fontFamily: r ?? 'Menlo, Monaco, "Courier New", monospace',
  theme: n,                          // §7.2
  scrollback: c.scrollback,          // 默认 10000
  minimumContrastRatio: 3,           // dr = 3（:2429，xterm 默认是 1）
  allowProposedApi: true,
  windowOptions: { pushTitle: true, popTitle: true },
})
```

- `lineHeight` / `letterSpacing` **未传** → 取 xterm 默认 `lineHeight: 1`、`letterSpacing: 0`（`c788b5dbe…:8204-8205`）。
- 额外固定：`scrollOnEraseInDisplay: !1`（xterm 默认），`drawBoldTextInBrightColors: !0`，`tabStopWidth: 8`（`c788b5dbe…:8195/8221`）。
- 注册的 addon：search（`loadAddon`，`:2737` 附近 + `c6bf19e8f…:1630` 区域）、fit（`ze` 类，`c6bf19e8f…:39-80`）。

### 4.3 支持的 shell 列表（问题 6）

两层。

**渲染层的取值来源**（`cccc2cf0a-JnTR9JZB.pretty.js:1548-1591`）：
```js
queryKey = ["epitaxy", "terminal-shells"]        // :1574
queryFn = () => desktopApi.getTerminalShells()   // :1581
启用条件：非 remote && 非 web-hosted && 非 shared   // :1582
staleTime 60_000                                  // :1588
返回 null（列表为空）就不显示「Choose shell」菜单（:1947 长度 <2 不显示）
```

**主进程给出的实际列表**（`asar/.vite/build/index.chunk-Cr7_e8i1.js`，字体文件 offset ~12900）：
```js
xe = ["pwsh", "powershell", "gitbash"]
Se = { pwsh: "PowerShell 7", powershell: "Windows PowerShell", gitbash: "Git Bash" }
Fe() = (await Promise.all(xe.map(Pe))).filter(Boolean)      // 逐个探测，装不上就不返回
```
- `pwsh` → 必须是 `CLI powershell_path` 配置指向的 `pwsh.exe`（否则该项不出现）；
- `gitbash` → 从 `CLAUDE_CODE_GIT_BASH_PATH` 或 `C:\Program Files\Git[/usr/bin|/bin]/bash.exe` 探测；
- 另有环境变量 `CLAUDE_DESKTOP_TERMINAL_SHELL` 覆盖默认 shell（值必须是 `pwsh.exe`/`powershell.exe` 的全路径）。
- `terminalShellsOffered()` = 平台开关 && 没有设置覆盖。**非 Windows 平台不走这个列表**（macOS/Linux 用系统默认 shell）。

**UI 文案**（`cccc2cf0a…:1949-1969`）：菜单 label `Choose shell` (Q2jUneEhyD)，每项 hint `default` (GTxe9Btumc)，底部子菜单 `Default shell` (EylgvFSXJc) 用 radio 选默认。

### 4.4 `terminal-attach-status` / `terminal-pane-placeholder`

**`terminal-attach-status`**（`cccc2cf0a…:1682-1693`）—— 不是可见面板，是**无障碍播报器**：

```js
span[role="status"].sr-only.select-none[data-testid="terminal-attach-status"]
文案："Terminal output attached to chat" (bZ2we54tf0)
时序：先清空 → 50ms 后写入文案 → 5000ms（by=5e3）后清空
```

→ **场景：终端里选中文本 → 「Attach as context」把选区附到 chat 时，给屏幕阅读器播报一次。**

**`terminal-pane-placeholder`**（`cccc2cf0a…:1695-1708`）—— 面板加载空态：

```js
div[role="status"][aria-label="Loading"][data-testid="terminal-pane-placeholder"]
    .relative.h-full.w-full
    style = { backgroundColor: theme.background, padding: var(--cds-pad-md) }
└ Id = 闪烁的空闲光标块（color = theme.cursor ?? theme.foreground, fontFamily, fontSize）
```

光标块本体（`cf718f694-r73RXp0X.pretty.js:83-96`）：

```js
span[aria-hidden][data-testid=...][data-blink]
  .pointer-events-none.block.h-[1lh].w-[1ch].opacity-50
  style { fontFamily, fontSize, lineHeight:"normal" }
└ span.block.h-full.w-full[.motion-safe:animate-blink]  style{backgroundColor}
```

- 闪烁：`@keyframes blink{0%,to{opacity:1}50%{opacity:0}}`，`animation: 1s linear infinite blink`（`ion-dist/assets/v1/c6a992d55-sXiDGMFQ.css:940829`、`:1778692`），且被 `:not(:where([data-reduce-motion=true],…))` 包住 → **尊重「减少动态效果」**。
- 真实终端里同一光标块的 testid 是 `terminal-idle-cursor`（`c6bf19e8f…:3534`），`className` 还加 `absolute group-has-[[data-ccd-terminal]]/terminal:hidden`，`style:{top: gutter, left: gutter}`。

**其他空/错态**：
| testid / 类 | 内容 | 证据 |
| --- | --- | --- |
| （overlay） | `Couldn't load the terminal` + `Reload the page to try again.` + `Reload`（chunk 加载失败兜底） | `cccc2cf0a…:1748-1763` |
| （overlay） | `Shell disconnected: {reason}` → `Reconnect`；否则 `Shell exited` → `Restart shell` | `c6bf19e8f…:3554-3581` |
| （overlay） | `Try again`（PTY 启动错误） | `c6bf19e8f…:3536-3553` |
| `.epitaxy-terminal-hold` + `.epitaxy-terminal-hold-exit` | 终端视图加载态（bg `#101010`，底部居中下划线链接 `Open the normal view`，`bottom:24px`） | `cc43287c9…:40413-40414`、`:40429-40448` |

### 4.5 终端设置项（`terminal-cursor-style` / `-cursor-blink` / `-copy-on-select` / `-scrollback`）

菜单构建（`cccc2cf0a-JnTR9JZB.pretty.js:12441-12509`，函数 `HO`）：

| key | label (id) | 控件 | 取值 |
| --- | --- | --- | --- |
| `terminal-view` | — | 分组标题 | — |
| `terminal-cursor-style` | `Cursor style` (t1sw8xMIhx) | radio，hint 显示当前值 | `block` / `bar` / `underline`（`cf718f694…:47`），文案 `Block`(BsMfpVggru) `Bar`(re3TLls3L0) `Underline`(zf8FFn+DIO) |
| `terminal-cursor-blink` | `Blink cursor` (UfjBKbbwXY) | checkbox（keepOpen） | 布尔 |
| `terminal-copy-on-select` | `Copy on select` (r2FytTWgGB) | checkbox（keepOpen） | 布尔 |
| `terminal-scrollback` | `Scrollback` (NHZrLm6dLP) | radio，hint 显示 `{n} lines` (b5SSWFxh30) | `1000 / 5000 / 10000`（`A = [1e3, 5e3, 1e4]`，`cf718f694…:48`） |

默认值与持久化（`cf718f694-r73RXp0X.pretty.js:42-77`，确证）：

```js
存储键： epitaxy-terminal-cursor-style / -cursor-blink / -copy-on-select / -scrollback
默认值： { cursorStyle:"block", cursorBlink:true, copyOnSelect:false, scrollback:10000 }
总开关： __gb__2265785636（关闭则整体回默认）
```

`copyOnSelect` 的落地（`c6bf19e8f…:2700-2704`）：`hasSelection() && copyOnSelect` → 取选区、trim 非空则写剪贴板。

### 4.6 `terminal-decoration-*` 是什么机制（问题 7）

**它们是 codicon 图标名，不是 CSS 类**（`c0c1c41fc-UusIIGu7.pretty.js:7011/7133/7344/7465`）：

```js
terminalDecorationSuccess:    P("terminal-decoration-success",    60017)  // U+EA71 ●
terminalDecorationIncomplete: P("terminal-decoration-incomplete", 60092)  // U+EABC ○
terminalDecorationMark:       P("terminal-decoration-mark",       60298)  // U+EB8A ·
terminalDecorationError:      P("terminal-decoration-error",      60411)  // U+EBFB ⊗
```
（`P()` 的第二个参数是 codicon 字体码位，`c0c1c41fc…:6948-6955`）

**机制：shell 集成装饰（OSC 133），画在 xterm 的 gutter 上作为「命令状态点」。** 实现在 `c6bf19e8f-BRkhh_Re.pretty.js:1822-1899`（`Gt`）+ `:1801-1821`（`Wt` 上色）：

```js
parser.registerOscHandler(133, payload)        // :1873-1884
  "A"          → 新 prompt 开始，registerMarker
  "P;k=i"      → 标记「命令输入开始」
  "B"          → 命令回显开始
  "C"          → 命令输出开始（记录 marker）
  "D;<exit>"   → 命令结束；exitCode 解析 /^-?\d{1,10}$/

renderDecoration({ marker, x:0, width:1 }).onRender(el => …)   // :1868
Wt(term, rec):                                  // :1801-1821
  isErr = exitCode !== undefined && exitCode !== 0
  color = (isErr ? theme.red : theme.foreground) ?? "currentColor"
  width  = isErr ? 3px : 5px
  radius = isErr ? 1px : 50%
  finished ? backgroundColor = color : border = 1px solid color
  opacity = isErr ? 1 : 0.5
  marginLeft = calc(var(--terminal-gutter,0px) / -2 - width/2)
```

→ **语义**：一个 5px 圆点画在每条命令的行首（未完成 = 空心描边、50% 透明；完成 = 实心）；命令以非 0 退出码结束时变成 3px 的实心小方块/圆角块（`border-radius:1px`），全不透明，颜色用主题 `red`。

配套 `scrollToCommand`（`:1890-1896`）：`Cmd/Ctrl+↑`、`Cmd/Ctrl+↓` 在命令之间跳转（`c6bf19e8f…:2806-2814`）。

**另外**：`xterm-find-result-decoration` / `xterm-find-active-result-decoration` 是搜索高亮用的另一套 class（`c6bf19e8f…:1534-1536`），与命令装饰无关。

---

## 5. 后台任务 / 长跑命令的 UI 呈现（问题 8）

### 5.1 侧栏「后台任务」列表（`cccc2cf0a-JnTR9JZB.pretty.js:10596-10840`）

```
空态： icon=AgentsSimple, "Background tasks appear here" (y+3yULewki)     // :10596-10599
状态文案： Running / Completed / Stopped / Failed                        // :10602-10607
         （id nDyaq/M7Oj, 95stPqCnfu, 1LBny5MvRa, vXCeIi67rj）
运行中计时： span.tabular-nums → Yo(intl, now - startedAt)                // :10608-10612
停止倒计时： "Stops in {duration}" (azulzVdSo+)，span.tabular-nums        // :10613-10622
停止按钮：   Go(quiet, busy=stopping, busyLabel="Stopping…"(NACfNicI6z),
             ariaLabel="Stop this task"(+ZLTl3VMv+))                      // :10766-10776
行内状态：   running→计时 / stopped→Stopped / stopping→Stopping…
副信息行：   flex.flex-wrap.items-baseline.gap-x-sm.text-footnote.text-muted-as-secondary
             "<v>{n}</v> tokens" (q8yC2bH6mD)、"{n} tool use(s)" (D1S12O0SBS)   // :10689-10697
子任务汇总： "{count} task(s)" / "{count} running" / "{count} failed"(text-danger)  // :10804-10829
```

→ **有 running 计时（tabular-nums）、有 kill 按钮（Stop this task），有失败红字。**

### 5.2 终端视图里的长跑提示

- **运行中**：`div.terminal-line` → `span.terminal-dot-running "⏺ "` + 门控文案（id `1l30fsc`）+ `Open in terminal` 链接（`cf6989767…:576-585`）。
- **失败待发送**：`div.terminal-line.terminal-error` → `"⏿ "` + 门控文案（`d7m08e`）+ `Open in terminal`（`:555-574`）。
- **`run_in_background` 的信息在审批卡里**：「Keeps running in the background.」(LjNt2jSMYO)，`c96d752d0-lrmpAk66.pretty.js:9025`；「Runs outside Claude's sandbox.」(BSpBd+pMe+) 同组 `:9024`。（审批卡本体不在本文范围，仅记录该字符串位置。）

### 5.3 终端面板的「仍在运行」确认

关闭终端前的拦截（`cccc2cf0a…:2127-2145`）：
```
"Close terminal?" / "Close other terminals?"                       (n6kL6t0goq / VFu34h7wUm)
"A command is still running in {name}. Closing the terminal stops it."
"{count, plural, one {A command is still running in one of the other terminals. Closing them stops it.} other {Commands are still running in # of the other terminals. Closing them stops it.}}"
按钮 "Close terminal" / "Close other terminals"
```

### 5.4 标签页与快捷键（`cccc2cf0a…:2070-2082`）
```
New terminal (EmFCpBoR7n) · More terminals (4wkfFQ0gI1) · Close terminal (gO6Ri0QD54)
Rename terminal (EcAvDUnycA) · Close other terminals (H5+gMSkrHn)
"Press Delete or Backspace to close the terminal"
"Press Control+Shift+Left Arrow or Right Arrow to move the terminal"
```

---

## 6. 排版度量 / Typography

> 本节按要求逐个元素给「字体族 / 字号 / 字重 / 字距」，Tailwind 类名一律换算成实际值。

### 6.1 三个关键 CSS 变量的真实值

**`--cds-font-mono`**（`ion-dist/assets/v1/c6a992d55-sXiDGMFQ.css`，两个作用域，确证）：

```css
/* :root —— 1661616 处 */
--cds-font-mono: var(--cds-font-mono-override,)
                 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
                 "Liberation Mono", "Courier New", monospace;

/* .cds-root —— 1678847 处（应用内实际生效的那条） */
--cds-font-mono: var(--cds-font-mono-override,)
                 var(--font-anthropic-mono, "SF Mono"), "SF Mono",
                 ui-monospace, Menlo, Consolas, monospace;

--font-anthropic-mono: "anthropic-mono", ui-monospace, monospace;   /* :root 附近 */
```

→ 展开后的实际栈（`.cds-root` 内）：
`[用户覆盖], anthropic-mono, "SF Mono", ui-monospace, Menlo, Consolas, monospace`
—— **注意没有中文回退字体**，终端里的 CJK 走系统默认。

**`--cds-font-size-code`**（确证，两个作用域）：

| 作用域 | 值 | 6.1 实际 px（`--cds-rem-scale` 默认 1，即 1rem=16px） |
| --- | --- | --- |
| `.cds-root`（默认紧凑） | `calc(.75rem * var(--cds-rem-scale,1))` | **12px** |
| `.cds-root[data-density=comfortable]` | `calc(.8125rem * var(--cds-rem-scale,1))` | **13px** |

**`--cds-leading-code`**：默认 `calc(1.0625rem * …)` = **17px**；comfortable `calc(1.1875rem * …)` = **19px**。

**⚠ 密度默认值**：`shared-frame-BfjMqbuN.pretty.js:1125` `var la = G("comfortable")` → Context 默认 **comfortable**；但渲染时 `w = S ?? (C ? "comfortable" : (e ?? h))`（`:1330`），`C = yt(ia, Un, ra)`，`ra = () => !1`（`:1111`）→ `C` 恒 false，`h` 即 Context 值。**结论：桌面端默认 `data-density="comfortable"`，所以终端视图与 `text-code` 的实际字号是 13px**（若某处显式传 `density:"compact"` 才是 12px；`cccc2cf0a…:13758` 的侧聊面板就是显式 compact）。推断链路已标注：Context 默认 comfortable 是确证，桌面根节点是否覆盖需运行时确认。

`--cds-rem-scale`：仅在 `@supports (font:-apple-system-body)`（iOS 动态字体）下被设为 `calc(16/17)`，桌面 Electron 不满足 → 恒 `1`。

### 6.2 元素逐项度量表

#### A. 终端视图 `.epitaxy-terminal-view`（`cf6989767-CXXjtvjM.pretty.js:36`）

| 元素 | 字体族 | 字号 | 字重 | 字距 | 行高 | 颜色 |
| --- | --- | --- | --- | --- | --- | --- |
| `.epitaxy-terminal-view`（根） | `var(--cds-font-mono)`（§6.1 栈） | `var(--cds-font-size-code, .75rem)` → **13px**（回退 12px） | 400（继承，未声明） | **0 / normal（未声明）** | **1.55** → 13×1.55 = **20.15px**（12px 时 18.6px） | `#e8e6e3` |
| `.terminal-line` | 继承 | 继承 13px | 400 | 0 | 继承 1.55 | 继承 `#e8e6e3` |
| `.terminal-prompt` | 继承 | 13px | 400 | 0 | 1.55 | `#b8b5ae` |
| `.terminal-prompt::before`（`"> "`） | 继承 | 13px | 400 | 0 | 1.55 | `#6e6b64` |
| `.terminal-thinking` | 继承 | 13px | 400 + `font-style:italic` | 0 | 1.55 | `#8a8782` |
| `.terminal-dim` | 继承 | 13px | 400 | 0 | 1.55 | `#8a8782` |
| `.terminal-tool-name` | 继承（另有内联类 `[font-variation-settings:normal]` 关掉可变字重轴） | 13px | **600**（CSS 显式） | 0 | 1.55 | `#fff` |
| `.terminal-result` | 继承 | 13px | 400 | 0 | 1.55 | `#8a8782`，`padding-left:2ch` |
| `.terminal-result.terminal-error` | 继承 | 13px | 400 | 0 | 1.55 | `#e5645f` |
| `.terminal-result-glyph` | 继承 | 13px | 400 | 0 | 1.55 | 继承；`white-space:pre; flex:none` |
| `.terminal-result-full` | 继承 | 13px | 400 | 0 | 1.55 | `#a8a59e`；`white-space:pre` |
| `.terminal-todo-done` | 继承 | 13px | 400 + `line-through` | 0 | 1.55 | `#6e6b64` |
| `.terminal-todo-active` | 继承 | 13px | 400 | 0 | 1.55 | `#e8e6e3` |
| `.terminal-chapter` | 继承 | 13px | 400 | 0 | 1.55 | `#6e6b64` |
| `.terminal-spinner` | 继承 | 13px | 400 | 0 | 1.55 | `#d9a15c` |
| `.terminal-done` | 继承 | 13px | 400 | 0 | 1.55 | `#4caf7d` |
| `.terminal-expand`（button） | **`font: inherit`**（显式） | 13px | 400 | 0 | 1.55 | `#8a8782`；hover `#b8b5ae` + underline |

**逐条确认**：
- `.terminal-tool-name{color:#fff;font-weight:600}` —— CSS 原文，**确证 600**。
- `terminal-result` / `terminal-dim` / `terminal-thinking` / `.terminal-line`：**CSS 里没有任何 `font-weight` 声明** → 全部继承根节点的默认 400（`terminal-thinking` 只加 italic）。**确证**（内联 CSS 26 条规则里 `font-weight` 只出现 1 次，就是 `.terminal-tool-name` 的 600）。
- **字距**：CSS 全文**无 `letter-spacing`**（grep 空）→ 0/normal。**确证**。
- **没有 `tabular-nums`**：`.epitaxy-terminal-view` 的 JSX 与 CSS 里都不出现该 class（grep `tabular` 在 `cf6989767` 无命中）。→ 终端视图的秒数/行数**不用等宽数字**。对比：后台任务面板**明确用** `tabular-nums`（`cccc2cf0a…:10611/10619/10634`）。

**尺寸/间距（确证）**：

```css
.epitaxy-terminal-view-column{
  flex-direction:column; gap:6px;
  max-width:960px; margin-inline:auto;
  padding:24px 20px 40px; display:flex;
}
```

**`2ch` 与 `"> "` 的实际像素（推断，依赖字体度量）**：`ch` = 数字 `0` 的推进宽度。SF Mono / Anthropic Mono / Menlo 均为 0.6em：

| 场景 | 13px（comfortable） | 12px（compact/回退） |
| --- | --- | --- |
| `1ch` | 7.8px | 7.2px |
| `.terminal-result` `padding-left:2ch` | **≈15.6px** | ≈14.4px |
| `.terminal-prompt::before` `"> "`（2 字符） | **≈15.6px** | ≈14.4px |

若字体回退到 `ui-monospace`（如 Windows 上的 Consolas，推进 0.55em）则 ≈14.3px / 13.2px。

**`white-space: pre-wrap` + `overflow-wrap: anywhere` + `unicode-bidi: plaintext` 的组合意义**（`.terminal-line`）：
1. `pre-wrap` —— 保留连续空格与换行（终端对齐靠空格），但允许在必要时换行，避免溢出；
2. `overflow-wrap: anywhere` —— 遇到超长无分隔 token（URL、base64、长路径）**允许在任意字符处断行**，且断行后行宽计算按此收缩，保证不会出现横向溢出（配合父级 `overflow-x:hidden`）；
3. `unicode-bidi: plaintext` —— 每个段落的书写方向按**自身首强字符**决定（类似 `<bdi>`），这样阿拉伯语/希伯来语输出在 LTR 界面里不会错排，也不污染相邻行。
而**展开态**的 `.terminal-result-full` 反过来用 `white-space:pre`（不换行）+ `overflow-x:auto`（横向滚动）——展开后就是要看原始排版，不做软换行。这是个有意的对照设计。

#### B. 内联 bash 块（聊天）

统一基准：`text-code` = `font-size:var(--cds-font-size-code)`（13px）+ `line-height:var(--cds-leading-code)`（19px）+ `font-family:var(--cds-font-mono)`（`c6a992d55…css:438062`）。

| 元素 | 字体族 | 字号 | 行高 | 字重 | 字距 | 颜色 |
| --- | --- | --- | --- | --- | --- | --- |
| 命令围栏（`epitaxy-fence`） | `--diffs-font-family` → 回退 `"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace`（`c19e90103…:4404`） | `--diffs-font-size` 回退 **13px**（`:4402`） | `--diffs-line-height` 回退 **20px**（`:4403`） | 400 | 0 | 主题语法色（claude-chat-dark/light） |
| 输出 `pre.text-code.text-secondary`（`c19e90103…:4956`） | `--cds-font-mono` | **13px** | **19px** | 400 | 0 | `--cds-text-secondary`：亮色 = `--cds-neutral-600` = `--cds-gray-600` = **`#52514e`**；暗色 = `--cds-gray-200` = **`#c3c2b7`**（`c6a992d55…css` 中 `[data-mode=dark] .cds-root` 覆盖） |
| 输出错误 `span.text-danger` | 继承 | 13px | 19px | 400 | 0 | `--cds-text-danger` |
| `(no output)` / `Running…` | 继承 | 13px | 19px | 400 | 0 | `--cds-text-secondary` |
| 工具卡代码面板（`!text-xs` 分支，`cc1aae219…:13330`） | 继承 `--cds-font-mono` | `--text-xs` = `.75rem` = **12px** | `calc(1/.75)`×12 = **16px** | 400 | 0 | `text-text-300` / `text-danger-000` |
| 工具卡代码面板（`!text-code` 聚焦分支） | 同上 | 13px | 19px | 400 | 0 | 同上 |
| 命令 chip（`cc1aae219…:27010`） | `font-mono` = `--cds-font-mono` | 继承工具行（`font-base` → `--cds-font-size-body`，**14px** comfortable / 13px compact） | `--cds-leading-body` **20px**/19px | 400 | 0 | `--cds-text-secondary`；`px-1 py-0.5`(4px/2px)、`rounded`(4px)、`shadow-xs` |
| `bash-stdout` / `bash-stderr` 字重 | — | — | — | **无独立字重**；两者都只是同一个 `pre` 里的文本/`span`，**没有字体差异，只有颜色差异** | — | stdout `--cds-text-secondary`；stderr `--cds-text-danger` + `!bg-danger` |

**头部动作词**：`span.whitespace-nowrap.me-1.text-secondary`（`:27007`），字号继承 `font-base` = `--cds-font-size-body` = **14px comfortable / 13px compact**，行高 `--cds-leading-body` = 20px / 19px，字重 400，颜色 `--cds-text-secondary`（亮 `#52514e` / 暗 `#c3c2b7`）。

#### C. 真实终端面板（xterm）

| 项 | 值 | 证据 |
| --- | --- | --- |
| 字体族默认 | `'"anthropic-mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace'` | `cccc2cf0a…:1646` `dy` |
| 字体族可自定义 | 是。`editorFont` 设置（键 `LSS-epitaxy:editorFont`），经 `vy()` 转义后拼成 `"<user>", ui-monospace, Menlo, Consolas, monospace` | `cccc2cf0a…:1655-1658`、`:1501` `Bv`；`shared-14-VEghfqC2.pretty.js:66` |
| 回退栈（设置模块里另一处） | `'Menlo, Monaco, "Courier New", monospace'`（`lr`，`c6bf19e8f…:2427`） | 当未传 `fontFamily` 时用 |
| 字号默认 | `Math.round((12 * rootFontPx) / 16)` → 根字号 16px 时 **12px** | `cccc2cf0a…:1647-1651`（`py=12`、`my()`；`wi()` 为根字号 hook，身份由命名推断） |
| 字号可自定义 | **否**（没有字号设置项）；随根字号缩放 | 设置菜单只有 4 项（`:12463-12504`） |
| 字重 | 不传 → xterm 默认 `fontWeight:"normal"`、`fontWeightBold:"bold"` | `c788b5dbe…:8201-8202` |
| 字距 | 不传 → `letterSpacing: 0` | `c788b5dbe…:8205` |
| 行高 | 不传 → `lineHeight: 1`（行高 = 单元格高，整数像素） | `c788b5dbe…:8204`、单元格高计算 `:5432` |
| 最小对比度 | `minimumContrastRatio: 3`（覆盖 xterm 默认 1） | `c6bf19e8f…:2723`、`:2429` |
| 内容 padding | `var(--cds-pad-md)`（8px / 12px），通过 `contentPadding` 传，落到 `padding: <gutter> 0` + CSS 变量 `--terminal-gutter` | `cccc2cf0a…:1652` `hy`；`c6bf19e8f…:3510-3511` |
| 空闲光标块 | `h-[1lh] w-[1ch] opacity-50`，`line-height:normal` | `cf718f694…:89-90` |

xterm 自身默认值（用于说明「哪些是我们改的」）：`fontFamily:"monospace"`、`fontSize:15`、`lineHeight:1`、`letterSpacing:0`、`scrollback:1e3`、`minimumContrastRatio:1`、`cursorBlink:false`、`cursorStyle:"block"`（`c788b5dbe…:8190-8222`）。**应用覆盖了 fontSize(→12)、scrollback(→1e4)、minimumContrastRatio(→3)、cursorBlink(→true)、allowProposedApi(→true)**。

#### D. 后台任务面板（相关元素）

`text-footnote` = `--cds-font-size-footnote`：**13px** comfortable / 12px compact，行高 `--cds-leading-footnote` 17px / 15px（`c6a992d55…css`）。计时/停止倒计时明确加 `tabular-nums`（`font-variant-numeric: tabular-nums`，`c6a992d55…css:470785`）。

---

## 7. 颜色层级总表

### 7.1 终端视图（`.epitaxy-terminal-view`，全部确证，`cf6989767-CXXjtvjM.pretty.js:36`）

| 语义 | 选择器 | 值 |
| --- | --- | --- |
| 背景 | `.epitaxy-terminal-view` | `#101010` |
| 前景 | `.epitaxy-terminal-view` | `#e8e6e3` |
| 焦点环 | `:focus-visible` | `outline:1px solid #ffffff40`，`outline-offset:-1px` |
| 用户输入 | `.terminal-prompt` | `#b8b5ae` |
| 输入前缀 `"> "` | `.terminal-prompt::before` | `#6e6b64` |
| 思考（斜体） | `.terminal-thinking` | `#8a8782` |
| 弱化 | `.terminal-dim` | `#8a8782` |
| 工具名 | `.terminal-tool-name` | `#fff`（+ 600） |
| 状态点·完成 | `.terminal-dot-completed` / `.terminal-done` | `#4caf7d` |
| 状态点·运行中 / spinner | `.terminal-dot-running` / `.terminal-spinner` | `#d9a15c` |
| 状态点·错误 / 错误文本 / 错误输出 | `.terminal-dot-error` / `.terminal-error` / `.terminal-result.terminal-error` | `#e5645f` |
| 状态点·中性（中断/拒绝） | `.terminal-dot-neutral` | `#8a8782` |
| 输出摘要 | `.terminal-result` | `#8a8782` |
| 输出全文（展开） | `.terminal-result-full` | `#a8a59e` |
| 展开按钮 | `.terminal-expand` → hover | `#8a8782` → `#b8b5ae` + underline |
| 待办·已完成 | `.terminal-todo-done` | `#6e6b64` + line-through |
| 待办·未完成 | `.terminal-todo-active` | `#e8e6e3` |
| 章节分隔 | `.terminal-chapter` | `#6e6b64` |
| 加载占位背景 | `.epitaxy-terminal-hold` | `#101010`（`cc43287c9…:40414`） |
| 退出链接 | `.epitaxy-terminal-hold-exit` | `#8a8782` + underline |

**层级关系（3 档亮度）**：`#fff`（工具名）> `#e8e6e3`（正文/当前待办）> `#b8b5ae`（用户输入）> `#a8a59e`（输出全文）> `#8a8782`（弱化/输出摘要/思考/中性点）> `#6e6b64`(前缀/已完成待办/章节) 。语义色 `#4caf7d` / `#d9a15c` / `#e5645f` 独立于亮度阶梯。

### 7.2 真实终端主题（xterm ANSI 16 色）

主题来源：`c5d464fa3-Dlv8sG-j.js` 定义 `claude-light` / `claude-dark` 两套（`y`/`b` 变量 + `x`/`C` 调色板），经 `w(e)` 映射为 VS Code 风格 `terminal.*` 键（`:4761` 附近的 `w()`），再由 `cf718f694-r73RXp0X.pretty.js:189-242` 的 `xe` 表把 `terminal.ansiXxx` 反解成 xterm 的 `ITheme` 字段。

映射表（`cf718f694…:189-211`，确证）：

```js
"terminal.background"          → background
"terminal.foreground"          → foreground
"terminalCursor.foreground"    → cursor
"terminalCursor.background"    → cursorAccent
"terminal.selectionBackground" → selectionBackground
"terminal.ansiBlack"           → black          … ansiBrightWhite → brightWhite
```

**Claude Dark**（`c5d464fa3…`，变量 `C`）：

| xterm 字段 | 值 |
| --- | --- |
| background | `#1a1a19`（`r.dark`，`r = pk = {cssVar:"var(--surface-2)", value:"#ffffff", dark:"#1a1a19"}`，`shared-26-BTkCzGJl.pretty.js:9174`） |
| foreground | `#eaecf0`（`hsl(220,15%,93%)` 转 hex；`shared-10-BduvWhe8.pretty.js:3405`） |
| cursor | `#0099ff`（取 `blue`） |
| cursorAccent | `#1a1a19`（取 `background`） |
| selectionBackground | `#0099ff4d` |
| black | `#262626` |
| red | `#ff3a30` |
| green | `#32d74b` |
| yellow | `#ffd014` |
| blue | `#0099ff` |
| magenta | `#ff2c56`（源字段名 `pink`） |
| cyan | `#b796ff`（源字段名 `purple`） |
| white | `#a6a6a6` |
| brightBlack | `#525252` |
| brightRed | `#ff5047` |
| brightGreen | `#32d74b`（与 green 相同） |
| brightYellow | `#ffd014`（与 yellow 相同） |
| brightBlue | `#0087ee` |
| brightMagenta | `#ff2c56` |
| brightCyan | `#b796ff` |
| brightWhite | `#ededed` |

**Claude Light**（`c5d464fa3…`，变量 `x`）：`background #ffffff`、`selectionBackground #0073e640`、`black #1a1a1a`、`red #ff3a30`、`brightRed #ff5047`、`green #1e9e3c`、`yellow #98801f`、`blue #0073e6`、`brightBlue #0078f0`、`magenta #cd2054`、`cyan #8e6bd9`、`white #999999`、`brightBlack #666666`、`brightWhite #d6d6d6`、`cursor #0073e6`。其 `foreground` 走 `S(o.fg ?? n.dark)`，而 `o.fg` 恒为 `hsl(220,15%,93%)` → 计算得 `#eaecf0`；这在浅色底上明显不可读，**推断**实际运行时该值会被用户编辑器主题（默认 pierre/github 系）经 `we()` 合并覆盖（`cf718f694…:232-242` 的 `we()` 会优先用 `e["terminal.foreground"]`）。**此处标为推断，未在运行时验证。**

**滚动条滑块**（`cf718f694…:220-231`）：暗色 `Se` / 亮色 `Ce`，分别取 `f.dark/u.dark/d.dark`、`f.value/u.value/d.value`（`f/u/d` = `Br/Vr/zr`，即 scrollbar slider 三态色），作为 `scrollbarSliderBackground / HoverBackground / ActiveBackground`。

**合并优先级**（`cf718f694…:255-274` `Te()`）：
```
Q 缓存（某个主题名 → 已解析 ITheme）
 → 未命中则用基础板 Se(暗)/Ce(亮)（由 github-dark / github-light 的 colors 推出）
 → 异步解析当前编辑器主题，成功后 we(theme.colors, base) 写入缓存
```

### 7.3 与终端视图配色的一致性判断

**不一致，是两套独立体系**（确证）：

| | 终端视图 | xterm 面板 |
| --- | --- | --- |
| 背景 | `#101010`（写死） | `#1a1a19`（当前编辑器主题推出） |
| 主前景 | `#e8e6e3`（写死） | `#eaecf0` |
| 错误色 | `#e5645f` | `#ff3a30` |
| 成功色 | `#4caf7d` | `#32d74b` |
| 运行中 | `#d9a15c` | （无对应语义） |
| 弱化 | `#8a8782` | `brightBlack #525252` |

→ 终端视图是**固定的暖灰单色系**（跟随不了主题）；xterm 面板**跟随用户代码主题**（默认 Claude Dark/Light，可换 25 套）。两者色值没有任何共享变量。

---

## 8. 交互清单（复制 / 重跑 / 快捷键）

| 位置 | 交互 | 证据 |
| --- | --- | --- |
| 内联 bash 块 | Copy code（图标 Copy→Check，2s? 实为 1200ms 回退） | `c19e90103…:4669-4677`（`window.setTimeout(...,1200)`） |
| 内联 bash 块 | Run in terminal / Run in PowerShell / Run in terminal and send output to Claude（依 `powerShell` 与是否订阅 bashTurn） | `c19e90103…:4654-4660`、`:4565-4569` |
| 内联 bash 块 | 运行中变为 Cancel（tooltip `Running — click to cancel`） | `:4831-4844` |
| 内联 bash 块 | Reveal/Hide {count} secrets（密钥打码） | `cbb72cde9…:221-243` |
| 历史 `!` 块 | Open in terminal（`CommandLinePrompt` 图标，仅 `tracked` 时有） | `c19e90103…:4904-4948` |
| 终端视图 | 展开输出（单向） | `cf6989767…:403-417` |
| 终端视图 | 加载更早输出（按钮在顶部，`silent:false`，`trigger:"near_top"`） | `cf6989767…:546-553`、`:531-537` |
| 终端视图 | 顶部/底部 · 键盘：`tabIndex=0`、`role=region` | `cf6989767…:539-541` |
| xterm 面板 | 选中 → 「Attach as context」浮动 pill（快捷键 `cmd+shift+l`） | `c6bf19e8f…:2995-3011`、`:3582` |
| xterm 面板 | 复制：`Meta+C` / `Ctrl+Shift+C`（无选区则透传给 shell）；粘贴 `Ctrl+V`(mac) 透传 | `c6bf19e8f…:2792-2805` |
| xterm 面板 | `copyOnSelect` 开启时选中即复制 | `c6bf19e8f…:2700-2704` |
| xterm 面板 | `Cmd/Ctrl+↑↓` 在命令间跳转 | `c6bf19e8f…:2806-2814` |
| xterm 面板 | `Cmd/Ctrl+←→`（行首行尾）、`Alt+←→`（按词） | `:2816-2823` |
| xterm 面板 | Find in terminal（`Cmd+F`），`Cmd+G`/`Cmd+Shift+G` 下一个/上一个 | `:2759-2760`、`:1907-1909` |
| xterm 面板 | 右键菜单（有鼠标跟踪时才拦） | `:2692-2699`、`:3013-3015` |
| 终端视图 | 拖入路径 → 插入到 PTY（拒绝时 toast `Can't insert this path…`） | `cccc2cf0a…:1506-1572` |
| 终端面板 | Clear terminal（菜单项 + 命令） | `cccc2cf0a…:2425-2431`、`:2477` |

---

## 9. 数据契约（Bash 工具结果）

`cc1aae219-Bd1YvDXP.pretty.js:27029`：

```js
q$ = z.object({ returncode: z.number().int(), stdout: z.string(), stderr: z.string() })
```
兼容两种包裹（`:27036-27049`）：直接 JSON；或 `[{type:"text", text:"<json>"}]`。失败 → `{type:"error", rawContent}`；解析不出 → `{type:"parse-error", rawContent}`；无内容 → `{type:"empty"}`。

---

## 10. 未确认项

1. **门控文案**：`cf6989767` 里 9 个消息 id（`qp71rz`「+N 行」、`1ddkkj1`「展开」、`13vgc4s`「Done in Ns」、`azaocy`「…Ns」、`1vytzaz`/`1t729ny`/`o26n5u`/`h7vg4q`/`gxggi2`/`z5k9nl` 六条动词、`17nkhgv` region aria-label、`yvkvv7`/`1s01zm9` 加载更早、`1l30fsc`/`16u3m7m` 运行中+打开终端、`d7m08e` 失败、`191utrp` 拒绝、`zfxffc` 中断、`1yryryo` 事件、`1bljfaz` prompt 阻塞、`3fx2ix` 停止警告）**都不在静态 `i18n/*.json`**，全产物 grep 只命中 `cf6989767` 自身。运行期由门控目录（`shared-104-A_oIUFQK.pretty.js:3074` `$l`）注入；离线时按钮文字为单个空格。**具体英文串无法从静态产物恢复。**
2. **`--cds-font-mono` 的用户覆盖来源**：`--cds-font-mono-override` 由哪个设置写入（疑似 `editorFont`）未定位到赋值点。
3. **Claude Light 终端前景 `#eaecf0` 明显不可读**，推断被编辑器主题覆盖，未运行时验证（见 §7.2 末尾）。
4. **`terminal-decoration-*` 四个图标在渲染层（`ion-dist`）只有定义、无调用点**（grep 仅命中 `c0c1c41fc` 的 codicon 表）。实际绘制走的是 `registerDecoration` + 手写样式（`c6bf19e8f…:1801-1821`），未使用这四个 codicon。它们可能是主进程/CLI 侧的 shell-integration 脚本用同一码位，未在渲染层证实。
5. **`bash-notification` 的专用 UI**：只出现在两个「从正文剥离的标签」名单里（`c5b9e310e…:29`、`ce311b43f…:556`），**没有找到它的渲染组件**；推断为纯数据层标签（可能在别的入口渲染）。
6. **xterm.js 精确版本号**：产物里没有 `package.json`/版本字符串；按 API 面（`reflowCursorLine`、`rescaleOverlappingGlyphs`、`windowOptions.pushTitle`、`scrollOnEraseInDisplay`）推断为 **5.5.x**，未见确证。
7. **桌面端根节点 `data-density` 的实际取值**：Context 默认 `comfortable`（`shared-frame-BfjMqbuN.pretty.js:1125`），但桌面根是否显式传 `compact` 未追踪到（这决定终端文字是 13px 还是 12px）。
8. **`.epitaxy-terminal-view` 是否在 `.cds-root` 内**：决定 `--cds-font-size-code` 是 13px（comfortable）还是回退 `.75rem`=12px、以及 `--cds-font-mono` 用哪条栈。未在运行时验证 DOM 祖先。

