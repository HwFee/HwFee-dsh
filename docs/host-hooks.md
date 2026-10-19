# Host Hooks — DeepSeek Harness Web UI 主题可挂载点勘察

*A DOM/CSS survey of the packaged client in the running Electron app, to find **stable** selector mount points for a theme plugin. Every conclusion carries a `file:line` citation.*

本文是对运行中 Electron 应用打包后客户端代码的 DOM/CSS 勘察结果，目的是给主题插件找出**稳定**的选择器挂载点。所有结论都带 `文件:行号` 证据。

- 提取物位置：`.repro/asar/`（`theme-client.js`、`layout-client.js`、`preload-app.cjs`）、`.repro/bundles/`（各 `dsh-client-ui-*` 包）、`.repro/css/`（从中还原出的 CSS Modules 明文）。
  *Sources: `.repro/asar/`, `.repro/bundles/`, `.repro/css/`.*
- 行号均为**该提取文件内的 1-based 行号**。压缩后的 bundle 一行可能上万字符，此时同时给出 `col`（列偏移）。
  *Line numbers are 1-based inside the extracted file; a minified bundle line can be tens of thousands of chars, so `col` is also given.*
- 提取到的 CSS Modules 原文已按 `.repro/css/<package>/<序号>-<模块名>.pretty.css` 保存，便于对照。
  *Recovered CSS Modules are saved per-package as `.pretty.css` for cross-checking.*

---

## 0. 先读这一节：三条最容易踩的坑 · Read first — three traps

1. **宿主 CSS Modules 类名是 hash，不可依赖**。例如 composer 卡片是 `.RlGAzG_card`（`conversation.js:18703` col 605），侧栏根是 `._2H3hWW_root`（`sidebar.js:90`），markdown 根是 `._markdown_1ypvv_5`（`.repro/css/web-frontend-index.pretty.css:1461`）。hash 随构建变化，**升级即失效**。
   *Host CSS-Modules class names are hashed and change per build — never depend on them.*
2. **`--dsw-elevation-*` 声明在 `body, body *` 上，不是 `body` 上**。这直接决定了 inline body style 能不能覆盖它 —— 见第 7 节，这是本文最关键的一条。
   *`--dsw-elevation-*` is declared on `body, body *`, not `body` alone — that decides whether an inline body style can override it (§7, the single most important point here).*
3. **`data-*` 属性是可靠的，但要区分「渲染到 DOM」和「只在逻辑里被读取」**。第 1 节逐条标注。
   *`data-*` attributes are reliable, but distinguish "rendered to the DOM" from "read only by logic" — §1 marks each.*

---

## 1. 稳定选择器清单 · Stable selector inventory

### 1.1 判定口径 · Verdict criteria

- **✅ 可样式化 / styleable**：属性由 JSX 直接写在元素上（或 `setAttribute`），主题可用 `[data-x]` 命中。
- **⚠️ 逻辑专用 / logic-only**：属性确实存在，但只在 JS 里被 `querySelector` / `dataset` 读取用于行为判断，样式上依赖它属于"能选中但语义是给逻辑用的"，宿主升级时可能被删。
- **❌ 未渲染 / never rendered**：只在 CSS 里被引用、或只在读取侧出现，代码里没有任何地方写它。**不可依赖**。

### 1.2 App Frame（`dsh-client-ui-layout`）

| 属性 | 落点元素 | 声明处 | 判定 |
|---|---|---|---|
| `data-sidebar-collapsed` | 三列 frame 根 `div`（`.BynINW_frame`），值为 `"true"` | `layout-client.js:323` | ✅ 可靠；侧栏 CSS 已用 `html[data-windows-titlebar]:has([data-sidebar-collapsed=true])`（`sidebar.js:91`） |
| `data-rightbar-collapsed` | 同上 frame 根 | `layout-client.js:324` | ✅ |
| `data-rightbar-fullscreen` | 同上 frame 根 | `layout-client.js:325` | ✅ |
| `data-rightbar-instant` | 同上 frame 根 | `layout-client.js:326` | ✅ |
| `data-dragging` | 同上 frame 根（拖拽中） | `layout-client.js:327` | ✅ |
| `data-animating` | 同上 frame 根（列宽过渡中） | `layout-client.js:328` | ✅ |
| `data-rightbar-col` | 右栏 grid item `div`（`.BynINW_rightbarCol`） | `layout-client.js:129` | ✅ |
| `data-shell-bottom` | 底部行 `div`（`.BynINW_bottomRow`） | `layout-client.js:346` | ✅ |
| `data-shell-overlay` | 覆盖层 `div`（`.BynINW_overlayLayer`） | `layout-client.js:351` | ✅ |
| `data-shell-leading` | macOS 且侧栏收起时才挂载的 `div` | `layout-client.js:356` | ✅（但仅在 `darwin && sidebarCollapsed` 时存在，`layout-client.js:315`） |
| `data-side`（`sidebar`/`rightbar`） | 拖拽把手 `div`（`.BynINW_handle`） | `layout-client.js:198` | ✅ |
| `data-dragging` | 拖拽把手自身（布尔 attribute，`toggleAttribute`） | `layout-client.js:199` | ✅ |

**文档根 `<html>` 上的属性（不是插件 bundle 写的，是 preload 写的）：**
*Attributes on the document root — written by preload, not a plugin bundle:*

| 属性 | 值 | 写入处 | 判定 |
|---|---|---|---|
| `data-platform` | `process.platform`（`win32` / `darwin`） | `preload-app.cjs:52`（`markDocumentPlatform`） | ✅ 极稳定，宿主自己大量用它做平台分支 |
| `data-windows-titlebar` | 空串，仅 win32 | `preload-app.cjs:577` | ✅ 稳定 |
| `data-fullscreen` | `"true"` / 删除 | `preload-app.cjs:67` | ✅ |
| `data-ds-theme-source` | `light` / `dark` / `system` | `layout-client.js:551`（`THEME_SOURCE_ATTRIBUTE`，常量定义在 `:515`） | ✅ |
| `data-input-modality` | `pointer` / 键盘 | 由 primitives 写入（`web-frontend-index.js:129` 有读取侧 `html[data-input-modality=pointer]` 样式） | ✅ 读侧确认存在，写侧在 primitives 内 |

**`<body>` 上的属性 · Attributes on `<body>`：**

| 属性 | 值 | 写入处 | 判定 |
|---|---|---|---|
| `data-ds-dark-theme` | 空串（暗色）/ 移除（亮色） | `layout-client.js:553`，常量 `DARK_ATTRIBUTE` 定义在 `:505` | ✅ **这是暗色模式的总开关**，所有 `--dsw-*` 暗色 token 都挂在 `body[data-ds-dark-theme]` 上（`theme-client.js:1413` 的 RULE 1/3/5） |

> 补充：`--dsh-windows-titlebar-height` 由 preload 内联设在 `<html>` 上，值固定 `40px`（`preload-app.cjs:578`）。

### 1.3 Sidebar（`dsh-client-ui-sidebar`）

| 属性 | 落点元素 | 声明处 | 判定 |
|---|---|---|---|
| `data-window-drag` | 侧栏 `topStrip` / `logoRow` 两个 `div` | `sidebar.js:303`、`sidebar.js:308` | ✅（但仅 macOS 桌面端渲染 `topStrip`，`sidebar.js:301`） |

> 侧栏根 `div` 本身**没有** `data-*` 属性（`sidebar.js:289-292`），只有 CSS Module 类 `_2H3hWW_root`。要样式化侧栏面板，应使用父级 `.BynINW_sidebarCol`（`layout-client.js:335-338`，同样无 data 属性）或改用 token —— 见第 3 节与第 6 节。

### 1.4 Conversation（`dsh-client-ui-conversation`）

| 属性 | 落点元素 | 声明处 | 判定 |
|---|---|---|---|
| `data-conversation-content` | conversation body `div`（`.Dc7zOa_body`） | `conversation.js:17865` | ✅ |
| `data-conversation-session` | 同上（值 = sessionId） | `conversation.js:17866` | ✅ |
| `data-conversation-region` | 同上，值 `"chat"` | `conversation.js:17867` | ✅ |
| `data-content-phase` | 同上，值 `hero`/`active`/`settling` | `conversation.js:17868` | ✅ |
| `data-conversation-scroll` | 滚动容器 `div`（`.Dc7zOa_scrollBody`） | `conversation.js:17871` | ✅ |
| `data-phase` | conversation 根 `div`（`.Dc7zOa_root`），值同上 | `conversation.js:17549` | ✅ |
| `data-conversation-region`（值 `"composer"`） | composer 座位 `div` | `conversation.js:17859` | ✅ |
| `data-window-drag` | header `<header>` | `conversation.js:17903` | ✅ |
| `data-conversation-header-leading` | header 左侧槽位 `div` | `conversation.js:17906` | ✅ |
| `data-conversation-header-corner` | header 右上角槽位 `div` | `conversation.js:18040` | ✅ |
| `data-conversation-tabs` | tablist `div` | `conversation.js:18046` | ✅ |
| `data-width-handle`（值 `left`/`right`） | 内容宽度拖拽把手 `div` | `conversation.js:17470` | ✅ |
| `data-queue-dock` | 队列面板外层 `div`（`.v1kfCW_dock`） | `conversation.js:16950` | ✅ |
| `data-status` | Todo 面板每个 `<li>`，值 = todo status | `conversation.js:19274` | ✅ |
| `data-testid`（值 `"todo-panel"`） | Todo 面板 `<section>` | `conversation.js:19239` | ⚠️ testid 语义，能选中但不建议用于主题 |

**Composer 专属属性见第 2 节。**

### 1.5 Chat rows（`dsh-client-ui-chat`）

| 属性 | 落点元素 | 声明处 | 判定 |
|---|---|---|---|
| `data-chat-flow` | 消息流列容器 `div`（`.xz4KEq_column`） | `chat.js:2886` | ✅ |
| `data-chat-motion` | 同上（仅在 `deferCompletedTurns && initialized && (running \|\| motionTail \|\| pendingInputs.length > 0)` 时存在） | `chat.js:2887` | ✅（条件性） |
| `data-chat-following-tail` | 消息流根 `div`（`.xz4KEq_root`） | `chat.js:2879` | ✅ |
| `data-chat-turn-spacer` | 尾部占位 `div`（`.xz4KEq_turnSpacer`，`height:0`） | `chat.js:2929` | ✅ |
| `data-chat-anchor-key` | 每条 flow item `div`（`.xz4KEq_flowItem`） | `chat.js:3805` | ✅ |
| `data-chat-flow-key` | 同上 | `chat.js:3806` | ✅ |
| `data-chat-paging-anchor` | 同上（`kind !== "turn-process"` 时） | `chat.js:3807` | ✅ |
| `data-chat-node-key` | 同上 | `chat.js:3808` | ✅ |
| `data-chat-group-part` | 同上，值 `response` / `reasoning` | `chat.js:3809`（值域见 `chat.js:6268-6269`、`chat.js:3801`） | ✅ |
| `data-chat-flow-kind` | 同上，值 = 节点 kind | `chat.js:3810` | ✅ **最有用的行类型钩子** |
| `data-chat-turn` | 同上，值 = turn 序号 | `chat.js:3811` | ✅ |
| `data-chat-group-key` | 分组容器 `div` | `chat.js:4209` | ✅ |
| `data-step-process` | 分组容器 `div` | `chat.js:4214` | ✅ |
| `data-group-expanded-mode` | 同上 | `chat.js:4215` | ✅ |
| `data-step-process-body` | 分组可滚动 body `div` | `chat.js:4231` | ✅ |
| `data-scroll-up` / `data-scroll-down` | 同上（边界可滚动性） | `chat.js:4232`、`chat.js:4233` | ✅ |
| `data-step-process-icon` | 分组前导图标 `span` | `chat.js:4127` | ✅ |
| `data-step-process-chevron` | 分组 chevron `span` | `chat.js:4131` | ✅ |
| `data-chat-running` | 运行中指示行 `div`（`.xz4KEq_running`） | `chat.js:5614` | ✅ |
| `data-pending-steering` | 用户消息行 `div`（`.cJsG2q_userRow`） | `chat.js:5415` | ✅ |
| `data-submission-echo` | 同上 | `chat.js:5416` | ✅ |
| `data-message-attachments` | 附件行 `div` | `chat.js:7307` | ✅ |
| `data-turn-tail` | 回合尾 `div`（`.X..._root`，值 = turn） | `chat.js:6984`、`chat.js:6991` | ✅ |
| `data-actions-reveal` | 同上，值 `always` / `hover` | `chat.js:6992` | ✅ |
| `data-turn-trigger` | 回合触发器 `<section>` | `chat.js:7119` | ✅ |
| `data-turn-process` | 过程折叠 `<button>`（值 = turn） | `chat.js:6641` | ✅ |
| `data-turn-process-messages` / `-tool-calls` / `-subagents` | 同上（计数） | `chat.js:6642-6644` | ✅ |
| `data-turn-process-member` / `-hidden` / `-answer` | flow item 上的过程归属标记 | `chat.js:3812-3814` | ✅ |
| `data-turn-process-inline` | 内联过程容器 `div` | `chat.js:6335` | ✅ |
| `data-open` | 各类折叠控件（如过程 `<button>`） | `chat.js:6640`；primitives 侧 `web-frontend-index.js:129` | ✅ |
| `data-composer-stat` | composer 统计 pill 锚点 `span`（值 = stat id） | `chat.js:7501`、`chat.js:7521` | ✅ |
| `data-session-stats-details` | 统计弹层 `<dl>` | `chat.js:7592` | ✅ |
| `data-session-stats-usage` | 统计弹层 `<dl>` | `chat.js:7626` | ✅ |
| `data-turn-usage-details` | 用量弹层 `<dl>` | `chat.js:6890` | ✅ |

**Reasoning / 命令卡片（同样是 chat 包，但走 primitives 的 Disclosure）：**

| 属性 | 落点 | 声明处 | 判定 |
|---|---|---|---|
| `data-variant` | reasoning 根 `div`，值 `"think"`；命令卡片值 `"others"` | `chat.js:6195`、`chat.js:6450` | ✅ |
| `data-state` | 同上，值 `running` / `ok` / `error` | `chat.js:6196`、`chat.js:6450` | ✅ |
| `data-expanded` | reasoning 根 `div`（展开时） | `chat.js:6197` | ✅ |
| `data-preview` | 同上 | `chat.js:6198` | ✅ |
| `data-streaming` | reasoning summary `span`；assistant markdown 根 `div` | `chat.js:6175`、`chat.js:6322` | ✅ |
| `data-shimmer-decoration` | 装饰分隔符 `span` | `chat.js:6171`、`chat.js:6428` | ✅ |

### 1.6 Composer（`dsh-client-ui-conversation`）

| 属性 | 落点元素 | 声明处 | 语义 |
|---|---|---|---|
| `data-composer-card` | composer 卡片根 `div`（`.RlGAzG_card`） | `conversation.js:18990` | **输入框卡片的唯一稳定钩子**。无 session 时该卡片是 Workspace 选择触发器，额外带 `.RlGAzG_cardWorkspaceTrigger` 类（`conversation.js:18989`） |
| `data-composer-overlay` | 卡片内零高覆盖锚点 `div`（`.RlGAzG_overlayAnchor`，`height:0; position:absolute; inset:0 0 auto`），承载 `conversation.input.overlay` 槽 | `conversation.js:18999` | 槽位挂载点，不是视觉区域。仅在 `sessionId !== void 0` 时渲染（`conversation.js:18997`） |
| `data-composer-input` | Lexical contenteditable `div`（`role="textbox"`、`aria-multiline="true"`） | `conversation.js:18102` | 真正的文本输入面 |
| `data-composer-seat` | composer 座位 `div`（`.Dc7zOa_composerSeat`，`position:sticky; bottom:0`），同时带 `data-conversation-region="composer"` | `conversation.js:17858` | 底部停靠区域 |
| `data-composer-dock` | 卡片下方 dock 行 `div`（`.RlGAzG_dock`） | `conversation.js:19163` | 承载 `conversation.composer.dock` 槽 + ContextMeter |
| `data-composer-chip` | Lexical decorator 宿主 `span`，值 = `insert.source` | `conversation.js:13729` | 引用 chip 宿主（`contenteditable="false"`） |
| `data-composer-command` | 命令 chip 宿主 `span`，值 = claim name | `conversation.js:14121` | 命令 chip |
| `data-composer-text-ref` | 文本引用节点 `span`（空值） | `conversation.js:13985` | 文本引用 |
| `data-composer-placeholder` | 占位符 `div`（`.RlGAzG_placeholder`） | `conversation.js:18166` | |
| `data-composer-composing` | 输入根 `div`（IME 合成中，`toggleAttribute`） | `conversation.js:18191` | 由 keymap 动态增删 |
| `data-composer-chip-selected` | 输入根 `div`（chip 键盘选中，`toggleAttribute`） | `conversation.js:14231` | |
| `data-input-scroll` | 输入滚动容器 `div`（`.RlGAzG_scroll`） | `conversation.js:18145` | |
| `data-placeholder` | 输入根 `div`（值 = 占位文案） | `conversation.js:18155` | |
| `data-phase` | 输入根 `div`（值 = input phase） | `conversation.js:18153` | |
| `data-model-compact` | 卡片底部控制行 `div`（`.RlGAzG_row`，`toggleAttribute`） | `conversation.js:18679` | 由 `observeControlRow` 的 ResizeObserver 动态决定 |

### 1.7 Markdown / 代码块（`dsh-web-frontend` primitives 包）

> 注意：markdown 渲染器**不在**任何 `dsh-client-ui-*` 包里，而在 `dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-CN7NIWNw.js`（下文记作 `web-frontend-index.js`）及其配套 `index-BxpfOGf3.css`（记作 `web-frontend-index.css`）。

| 属性 | 落点元素 | 声明处 | 判定 |
|---|---|---|---|
| `data-markdown-variant` | markdown 根 `div`，值 `"compact"`（正文时不渲染该属性） | `web-frontend-index.js:176` | ✅ **markdown 根的稳定钩子** |
| `data-code-block-banner` | 代码块 banner `div`（有 labels 时是带 `heading`/`language`/`title` 的版本，否则是 `infostring`/`action` 版本） | `web-frontend-index.js:140`、`web-frontend-index.js:165` | ✅ |
| `data-code-block-content` | 代码块内容包裹 `div`（`.W..._content`，`display:contents`） | `web-frontend-index.js:165` | ✅ |
| `data-code-wrap` | 代码块根 `div`（`.md-code-block`，值 = 是否换行） | `web-frontend-index.js:165` | ✅ |
| `data-line-numbers` | 同上（行号开关） | `web-frontend-index.js:165` | ✅ |
| `data-footnotes` | 脚注区 | `web-frontend-index.js:172` | ✅ |
| `data-ref-chip` | 引用 chip | `web-frontend-index.js:134` | ✅ |
| `data-file-type-mark` | 文件类型图标 | `web-frontend-index.js:134` | ✅ |
| `data-path-label` / `data-path-clipped` | 路径标签 | `web-frontend-index.js:129` | ✅ |
| `data-disclosure-header` / `data-disclosure-row` / `data-expandable` / `data-open` / `data-has-accessory` | 通用折叠组件 | `web-frontend-index.js:129` | ✅ |
| `data-shimmer` / `data-shimmer-text` | 微光文本 | `web-frontend-index.js:129` | ✅ |
| `data-tone` | Tag / Pill，值 = tone | `web-frontend-index.js:129` | ✅ |
| `data-state` | 状态点 / spinner，值 `ongoing`/`done`/`idle` | `web-frontend-index.js:129` | ✅ |
| `data-expanded` | 折叠态 | `web-frontend-index.js:135` | ✅ |

**`data-*` 之外的稳定类名（少数几个字面量类名，不是 CSS Modules hash）：**

- `md-code-block` —— 代码块根 `div` 上**额外**拼了这个字面量类（`web-frontend-index.js:165`：`className: de(Mn.block, "md-code-block", ...)`），CSS 里确实有 `._markdown_1ypvv_5._compact_1ypvv_331 .md-code-block`（`.repro/css/web-frontend-index.pretty.css:1743`）与 `._markdown_1ypvv_5 li>*:last-child:not(.md-code-block)`（`:1557`）两处消费。**这是宿主有意暴露的公共类名，相对安全**。
- `md-table-wide` —— 宽表格（`web-frontend-index.js:172`；`AssistantMarkdown.module.css` 里 `._v5IAXa_body .md-table-wide` 也在用，`chat.js:6219`）。同上，安全。
- `md-table-fill` —— 与 `md-table-wide` 互斥的表格变体（`web-frontend-index.js:172`）。

### 1.8 Menus / Dialogs / Toasts

| 属性 | 落点元素 | 声明处 | 判定 |
|---|---|---|---|
| `data-menu-material` | 菜单 surface `div`，值 `"translucent"` | `web-frontend-index.js:129` | ✅ **菜单面板主钩子**；主题 token 已在用：`body[data-ds-dark-theme] [data-menu-material]{--dsw-elevation-stroke-color:...}`（`theme-client.js:1425` col 562） |
| `data-menu-backing` | 菜单 backdrop（portal 到 `body`，仅 macOS 显示） | `web-frontend-index.js:129` | ✅ |
| `data-menu-group` | 菜单分组 `<section role="group">` | `web-frontend-index.js:129` | ✅ |
| `data-menu-group-heading` | 分组标题 `div` | `web-frontend-index.js:129` | ✅ |
| `data-menu-group-start` | 分组起始标记 `span` | `web-frontend-index.js:129` | ✅ |
| `data-shortcut-modal` | 模态 `div`，值 = modal id（如 `"settings"`） | primitives：`web-frontend-index.js:129`；settings 页：`settings-general.js:290` | ✅ **弹窗主钩子** |
| `data-modal-autofocus` | 模态内自动聚焦元素 | `settings-general.js:301`、`web-frontend-index.js:129` | ⚠️ 语义是聚焦控制，主题不应改它 |
| `data-dsh-automatic-focus` | 由 focus 工具运行时 `setAttribute` 的元素 | 写入 `web-frontend-index.js:129`；样式 `theme-client.js:1407` col 1182 | ✅ 但语义是"抑制 outline"，主题改它等于改焦点行为 |
| `data-trigger-menu` | composer 触发菜单 surface（`.Z9Jnlq_menu`） | `input-trigger.js:1734` | ✅ |
| `data-overflow-below` | 同上（向下溢出） | `input-trigger.js:1735` | ✅ |
| `data-source` | 菜单分组标题 / 加载态，值 = 触发源 | `input-trigger.js:1767`、`input-trigger.js:1772` | ✅ |
| `data-dsh-boot` | boot 占位 `div`（React 挂载前的首屏 HTML） | `renderer.js:1843` | ✅（但只在首帧存在） |
| `data-slot` | 每个 slot outlet 包裹元素（`display:contents`） | `renderer.js:1124` | ✅ **非常有价值**：值是 slot key，如 `conversation.chat.flow`、`settings.general.item`、`conversation\.session` |
| `data-slot-error` | slot 崩溃时的替代元素 | `renderer.js:643`、`renderer.js:1172` | ⚠️ 错误态 |
| `data-chain-overlay-fallback` | chain 槽的 fallback 锚点 | `renderer.js:1227` | ✅ |
| `data-factory-error` | Factory 崩溃替代元素 | `renderer.js:659` | ⚠️ 错误态 |

> `data-slot` 的机制见 `renderer.js:1116-1125`：`ANCHOR_STYLE = { display: "contents" }`（`renderer.js:1116`），所以 `data-slot` 元素本身不产生盒子，**不能给它设 background/padding**，只能用作后代选择器前缀（`:has()` / 后代组合）。这一点在写主题时非常重要。

### 1.9 Settings（`dsh-client-ui-settings-general`）· 设置页

| 属性 | 落点元素 | 声明处 | 判定 |
|---|---|---|---|
| `data-shortcut-modal="settings"` | 设置面板 `div`（`.wCInkW_panel`，`role="dialog"`） | `settings-general.js:290` | ✅ **设置面板主钩子** |
| `data-modal-autofocus` | 导航标题 / 当前导航项 | `settings-general.js:301`、`settings-general.js:309` | ⚠️ |
| `data-slot="settings.general.item"` | 每个 General 行的 slot 包裹（`display:contents`） | 由 renderer 统一写（`renderer.js:1124`），行本身注册在 `settings-general.js:638` 的 `renderSlot("settings.general.item", {})` | ✅ **这是给"我们自己的设置行"对齐样式的最佳锚点** |
| （字体组）无稳定属性 | 宿主的「字号 + 字体族」组**没有** `data-*`、也没有字面量类可依赖，只有结构特征：字号行 = `button[aria-expanded][aria-controls]` 且同级有 `px` 单位文本；字体族输入框 = `input[maxlength=200]`，placeholder / aria-label 取自宿主字典（`默认`/`Default`、`正文字体`/`Text font` 等） | `theme-client.js` 的 `FontSizeRow` / `FontFamilyRow`（见 §5.4） | ⚠️ 只能结构化定位；改版会失效但**天然降级**（找不到就不动 DOM） |

### 1.10 ❌ 只在逻辑里出现 / 完全没渲染的（不可依赖）· logic-only / never rendered (unreliable)

| 属性 | 情况 | 证据 |
|---|---|---|
| `data-conversation-composer-overlay` | **conversation 包只在 CSS 里引用，从不写**。真正的写入方是 `dsh-client-ui-trajectory` 包。 | conversation 包 4 处全在 `conversation.js:17325` 的 CSS 字符串内；写入在 `trajectory.js:8087` |
| `data-input-fold` | 只在 CSS 里被引用（`chat.js:2679` col 1921/1978）；JS 侧用 `dataset.inputFold` 动态增删（`chat.js:1965`、`chat.js:2032`），所以**运行时确实存在**，但它是滚动引擎的临时标记 | `chat.js:1965`、`chat.js:2032` |
| `data-testid` | 语义是测试锚点，只有 Todo 面板一处（`conversation.js:19239`） | 不建议主题使用 |
| `data-composer-hint` | 不是属性，是 **inline style 上的自定义属性** `--dsh-composer-hint`（`conversation.js:18161`） | 见第 2 节 |

---

## 2. Composer（输入框）· The composer (input box)

### 2.1 当前 CSS（原文）· Current CSS, verbatim

来源：`conversation.js:18703`，`InputBar.module.css`，变量名 `css$1`，CSS 字面量从该行 col 42 开始。

**卡片 `.RlGAzG_card`（col 605）：**

```
.RlGAzG_card{
  box-sizing:border-box;
  width:100%;
  max-width:var(--dsh-composer-card-max-width);
  --dsw-elevation-stroke-color:var(--dsw-alias-border-l2);
  border-radius:var(--dsw-radius-panel);
  background:var(--dsw-specific-input-major);
  box-shadow:var(--dsw-elevation-soft);
  font-size:var(--dsh-content-font-size,14px);
  line-height:calc(24px + var(--dsh-content-font-delta,0px));
  --dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);
  border:0;
  flex-direction:column;
  gap:12px;
  padding-top:8px;
  display:flex;
  position:relative
}
```

| 项目 | 当前值 | 解析 | 位置 |
|---|---|---|---|
| `border-radius` | `var(--dsw-radius-panel)` | → `28px`（`:root` 定义，`theme-client.js:1407` col 792） | `conversation.js:18703` col 752 |
| `background` | `var(--dsw-specific-input-major)` | 亮色 `#fff`，暗色 `neutral-bluish-850` = `#2c2c2e`（`theme-client.js:1413` RULE 2/3） | col 790 |
| `box-shadow` | `var(--dsw-elevation-soft)` | = `0 0 0 .5px <stroke-color>, 0 4px 16px 0 #00000008, 0 0 24px 0 #00000008`，其中 stroke-color 被卡片局部覆盖为 `var(--dsw-alias-border-l2)` | col 833 |
| `padding` | 只有 `padding-top:8px` | 左/右/下无 padding；左右由父级 `.RlGAzG_root` 的 `padding:0 var(--dsh-composer-side-clearance) 4px` 提供 | col 1132 / col 31 |
| `max-width` | `var(--dsh-composer-card-max-width)` | 见 2.2 | col 651 |
| `border` | `0` | 描边由 `--dsw-elevation-stroke`（0.5px 内阴影环）实现，不是真 border | — |
| `gap` | `12px`（纵向 flex 间距） | | — |

**内部关键元素：**

| 类名 | 作用 | 关键声明 | 位置（同 L18703） |
|---|---|---|---|
| `.RlGAzG_root` | composer 根 | `padding:0 var(--dsh-composer-side-clearance) 4px` | col 18 |
| `.RlGAzG_dock` | 卡片下 dock 行 | `gap:12px; padding-top:4px` | col 134 |
| `.RlGAzG_input` | 文本输入面 | `min-height:36px; padding:4px 8px 0 14px; color:var(--dsw-alias-label-primary); caret-color:var(--dsw-alias-state-business-primary); font-family:var(--dsw-font-family)` | col 2210 |
| `.RlGAzG_placeholder` | 占位符 | `position:absolute; inset:4px 8px auto 14px` | — |
| `.RlGAzG_row` | 底部控制行 | `padding:2px 8px 6px; container-type:inline-size` | — |
| `.RlGAzG_primary` | 发送按钮 | `background:var(--dsw-alias-button-info-fill); border-radius:999px; width/height:34px` | — |
| `.RlGAzG_add` | 加号按钮 | `background:var(--dsw-specific-selector); 28×28; border-radius:999px` | — |
| `.RlGAzG_notice` | 提示条 | `background:var(--dsw-alias-interactive-bg-hover); border-radius:var(--dsw-radius-md)` | — |

### 2.2 它消费的全部 `--dsh-composer-*` 自定义属性 · Every `--dsh-composer-*` custom property it consumes

这些是宿主自己定义的**布局契约变量**（不是 `--dsw-*` token），声明点如下：

| 属性 | 声明处（选择器） | 值 | 消费处 |
|---|---|---|---|
| `--dsh-composer-card-max-width` | `.Dc7zOa_body`（`conversation.js:17325`） | `calc(var(--dsh-chat-content-width) + 32px)` | InputBar `max-width`（col 371/651）、QueueDock、HeroShell、TodoPanel |
| 〃 | `.Dc7zOa_embeddedBody`（`conversation.js:17325`） | `min(calc(100% - 16px), 952px)` | 同上（embedded 变体） |
| `--dsh-composer-side-clearance` | `.Dc7zOa_body`（`conversation.js:17325`） | `16px` | `.RlGAzG_root` padding、`.RlGAzG_hero` padding、ChatView `.xz4KEq_scroll` padding、TurnNavigator |
| 〃 | `.Dc7zOa_embeddedBody` | `8px` | 同上 |
| `--dsh-composer-dock-inset` | `.Dc7zOa_body` / `.Dc7zOa_embeddedBody`（`conversation.js:17325`） | `8px` | QueueDock dock 宽度、TodoPanel 宽度 |
| `--dsh-composer-stack-gap` | `.Dc7zOa_composerStack`（`conversation.js:17325`） | `6px` | QueueDock 外边距、composerStack gap |
| `--dsh-composer-text-max-height` | `.Dc7zOa_composerSeat`（`conversation.js:17325`） | `336px` | `.RlGAzG_scroll` max-height |
| `--dsh-composer-height` | **运行时 inline style**，写在 `data-composer-seat` 的父元素上（`conversation.js:17762`） | `<seat.offsetHeight>px` | TurnNavigator 轨道带计算（`chat.js:192` col 345、`chat.js:2679`） |
| `--dsh-composer-hint` | **运行时 inline style**，写在输入根元素上（`conversation.js:18161`） | `JSON.stringify(hint)`，供 `content:` 使用 | `.RlGAzG_input p:last-child:after` |
| `--dsh-composer-model-text-display` / `--dsh-composer-model-icon-display` | `.RlGAzG_row[data-model-compact]`（`conversation.js:18703`） | `none` / `block` | model-selection 包的模型选择器（`model-selection.js:1060`） |

> **重要**：`--dsh-composer-*` 系列**全部声明在 conversation 包自己的组件选择器上**，`theme-client.js` 里一个都没有（grep `--dsh-composer` 在 theme 包命中 0 次）。所以要改 composer 尺寸，必须用 `[data-composer-card]` 这类选择器规则去覆盖，或者改 `.Dc7zOa_body` 上继承下来的 `--dsh-chat-content-width` / `--dsh-chat-user-width`。
> *Important: every `--dsh-composer-*` is declared on the conversation package's own component selectors — the theme package has zero hits. To resize the composer you must override via a `[data-composer-card]` selector or change the inherited `--dsh-chat-content-width` / `--dsh-chat-user-width`.*

### 2.3 六个 `data-composer-*` 的语义汇总 · Semantics of the six `data-composer-*` attrs

| 属性 | 语义 | 元素 | 是否渲染 |
|---|---|---|---|
| `data-composer-card` | 输入框卡片本体（背景、圆角、阴影、最大宽度都在这一层） | `div.RlGAzG_card` | ✅ `conversation.js:18990` |
| `data-composer-input` | 可编辑文本面（Lexical contenteditable，`role="textbox"`） | `div[contenteditable]` | ✅ `conversation.js:18102` |
| `data-composer-seat` | 底部停靠座位（sticky bottom，承载整个 composer 子树，含渐变遮罩） | `div.Dc7zOa_composerSeat` | ✅ `conversation.js:17858` |
| `data-composer-chip` | 引用 chip 的 Lexical 宿主 `span`，值 = chip source（`contenteditable="false"`） | `span` | ✅ `conversation.js:13729` |
| `data-composer-dock` | 卡片下方 dock 行（槽位 + ContextMeter） | `div.RlGAzG_dock` | ✅ `conversation.js:19163` |
| `data-composer-overlay` | 卡片内零高覆盖锚点，承载 `conversation.input.overlay` 槽 | `div.RlGAzG_overlayAnchor` | ✅ `conversation.js:18999`（仅 `sessionId !== void 0`） |

---

## 3. 侧栏 · The sidebar

### 3.1 当前背景 / padding / 宽度 · Current background / padding / width

**侧栏根 `. _2H3hWW_root`**（`sidebar.js:90`，CSS 从该行 col 12 起）：

```
._2H3hWW_root{
  --dsh-sidebar-inline-padding:12px;
  height:100%;
  padding:6px var(--dsh-sidebar-inline-padding);
  box-sizing:border-box;
  background:var(--dsw-specific-sidebar-fill);
  color:var(--dsw-alias-label-primary);
  --dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);
  flex-direction:column;
  font-size:14px;
  display:flex
}
```

| 项目 | 值 | 说明 |
|---|---|---|
| `background` | `var(--dsw-specific-sidebar-fill)` | 亮色 `neutral-bluish-50` = `#f9fafb`，暗色 `neutral-bluish-900` = `#1b1b1c`（`theme-client.js:1413` RULE 2/3，abs-col 11716 / 18619） |
| `padding` | `6px var(--dsh-sidebar-inline-padding)`，其中 inline-padding = `12px` | 收起态被覆盖为 `padding:18px 10px 6px`（`sidebar.js:91`） |
| 宽度 | **不在 CSS 里**，由 JSX inline style 写死：`style: wide ? { width: collapsed ? lastWideWidth.current : width } : void 0`（`sidebar.js:292`）。宽度值来自 layout 的 `cols.sidebar`（默认 280，`layout-client.js:396`） | 主题**不能**用 CSS 改宽度，会与 grid `gridTemplateColumns` 冲突（`layout-client.js:321`） |

**父级列 `.BynINW_sidebarCol`**（`layout-client.js:73`，AppFrame CSS）：

```
.BynINW_sidebarCol{
  background:var(--dsw-specific-sidebar-fill);
  border-right:.5px solid var(--dsw-alias-border-l3);
  min-width:0;
  overflow:hidden
}
```

macOS 下额外有渐变叠加（`layout-client.js:73`）：
```
[data-platform=darwin] .BynINW_sidebarCol{background:linear-gradient(...), color-mix(...)}
```
Windows 下 frame 本身背景改为 `var(--dsw-specific-sidebar-fill)`，并给 `--dsh-windows-content-radius:16px`（`layout-client.js:73`）。

### 3.2 `data-sidebar-collapsed`

- 声明：`layout-client.js:323`，写在 **AppFrame 的 frame 根 `div`**（`.BynINW_frame`）上，不是侧栏根上。
- 值：`sidebarCollapsed || void 0` —— 即展开时属性**不存在**，收起时值为 `"true"`。
- `sidebarCollapsed` 的计算：`layout-client.js:238`（窄屏取反 `narrowExpanded`，宽屏取 `layoutInfo.sidebar === 0`）。
- 宿主自己怎么用它：`sidebar.js:91` 有 `html[data-windows-titlebar]:has([data-sidebar-collapsed=true]){--dsh-windows-menu-start:84px}`；`layout-client.js:73` 有 `[data-platform=darwin] .BynINW_frame[data-sidebar-collapsed]{--dsh-frame-leading-clearance:160px}`。
- 侧栏组件内部另有 `. _2H3hWW_collapsed` 类（`sidebar.js:291` 的 clsx），但那是 hash 类，不可依赖。

---

## 4. 消息行与 Markdown · Message rows and Markdown

### 4.1 Markdown 根类名模式（已确认）· Markdown root class pattern (confirmed)

- **根元素**：`<div class="_markdown_1ypvv_5">`，正文时**不带** `data-markdown-variant`；compact 变体额外加 `_compact_1ypvv_331` 类并带 `data-markdown-variant="compact"`。
- 证据：`web-frontend-index.js:176`
  ```js
  u.jsx("div",{className:de(St.markdown,l==="compact"&&St.compact),
                "data-markdown-variant":l==="compact"?l:void 0, children:m})
  ```
- 类名常量表：`web-frontend-index.js:120` —— `MO="_markdown_1ypvv_5"`, `UO="_compact_1ypvv_331"`, `St={markdown:MO, ..., compact:UO, ...}`。
- CSS 规则位置：`.repro/css/web-frontend-index.pretty.css:1461`（`._markdown_1ypvv_5 {`），compact 变体在 `:1695`。原始单行文件为 `dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-BxpfOGf3.css:1`（压缩成一行，字符偏移 29595 / 34739）。
- 规则形态：`._markdown_1ypvv_5{min-width:0;overflow-wrap:anywhere;font:var(--dsw-font-markdown-base);color:var(--dsw-alias-label-primary)}`，其后是对 `h1`~`h6`、`p`、`ul/ol`、`li`、`blockquote`、`hr`、`pre`、`:not(pre)>code`、`table`、`.katex` 等的后代规则。

> **hash 模式确认**：`_markdown_<hash5>_<序号>`，hash 是 `1ypvv`，序号是该类在模块内的声明序（`_markdown_1ypvv_5` 表示模块内第 5 条）。同一模块内其它类：`_fileLink_1ypvv_59`、`_fileMention_1ypvv_85`、`_linkIcon_1ypvv_94`、`_tableScroll_1ypvv_192`、`_tableFill_1ypvv_239`、`_image_1ypvv_287`、`_compact_1ypvv_331`、`_imageButton_1ypvv_446`、`_previewName_1ypvv_458`。**hash 与序号都随构建改变**。

### 4.2 `data-chat-*` 属性族 · The `data-chat-*` attribute family

见 1.5 节的完整表。层级关系：

```
div[data-conversation-scroll]                       ← conversation.js:17871
 └ div[data-slot="conversation\.session"]           ← renderer.js:1124 (display:contents)
    └ div[data-chat-following-tail]?                 ← chat.js:2879
       └ div[data-chat-flow][data-chat-motion]?      ← chat.js:2886-2887  (.xz4KEq_column)
          ├ div[data-chat-group-key][data-step-process]?   ← chat.js:4209/4214
          │  └ div[data-step-process-body]                  ← chat.js:4231
          └ div[data-chat-flow-key][data-chat-node-key]
             [data-chat-flow-kind][data-chat-turn]
             [data-chat-group-part]                        ← chat.js:3805-3811
                └ div[data-slot="conversation.chat.node"]  ← renderer.js:1124
                   └ <实际行组件>
```

`data-chat-flow-kind` 的取值（注册表在 `chat.js:7186-7282`）：`user`、`steering`、`context`、`turn-trigger`、`system-prompt`、`assistant-step`、`command`、`manual-compaction`、`compaction`、`model-retry`、`turn-error`、`turn-max-tokens`、`turn-process`、`turn-tail`、`unknown`。

`data-chat-group-part` 取值：`response`、`reasoning`（`chat.js:6268-6269`、`chat.js:3801`）。

### 4.3 代码块结构 · Code-block structure

```
div.md-code-block[data-code-wrap][data-line-numbers]      ← web-frontend-index.js:165
 ├ div._bannerWrap_7gxqk_24                              (sticky top:0, z-index:6)
 │  └ div[data-code-block-banner]                         ← web-frontend-index.js:140 或 :165
 │     ├ div._heading_1pq26_23 → span._language / span._title    (有 labels 时)
 │     └ div._actions_1pq26_43 → button._action                 (copy / wrap)
 └ div._content_7gxqk_74[data-code-block-content]         ← web-frontend-index.js:165
    └ pre > code > span.line*
```

CSS 变量族（`.repro/css/web-frontend-index.pretty.css:2796`，`._block_7gxqk_4`）：

```
._block_7gxqk_4{
  --dsl-code-block-banner-background-color: var(--dsw-alias-markdown-code-block-banner);
  --dsl-code-block-border-radius: var(--dsw-radius-lg);
  --dsl-code-block-banner-font: 11px/18px var(--dsw-font-family);
  --dsl-code-block-content-font: var(--dsw-font-markdown-code-block);
  --dsl-code-block-background: var(--dsw-alias-markdown-code-block);
  position:relative; margin:16px 0;
  color:var(--dsw-alias-label-primary);
  background:var(--dsl-code-block-background);
  border-radius:var(--dsl-code-block-border-radius)
}
```

- `._banner_7gxqk_24`（`.repro/css/web-frontend-index.pretty.css:2819`）：`background:var(--dsl-code-block-banner-background-color); padding:9px 14px; font:var(--dsl-code-block-banner-font); border-top-left/right-radius:var(--dsl-code-block-border-radius)`
- `._bannerWrap_7gxqk_24`（`:2811`）：`position:sticky; top:0; z-index:6; background-color:var(--dsw-alias-bg-base)`
- `._block_7gxqk_4 :where(pre)`（`:2857`）：`font:var(--dsl-code-block-content-font); padding:16px; background:var(--dsl-code-block-background); border-bottom-left/right-radius:var(--dsl-code-block-border-radius)`
- `._content_7gxqk_74`（`:2854`）：`display:contents`

**这些 `--dsl-code-block-*` 是宿主自己暴露的、语义化的中间变量 —— 主题可以放心覆盖它们，比改 hash 类安全得多。**

### 4.4 各区域消费的 token · Tokens consumed per region

| 区域 | 主要 token | 位置 |
|---|---|---|
| Markdown 正文 | `--dsw-font-markdown-base/-h1..h4/-code/-table`、`--dsw-alias-label-primary`、`--dsw-alias-link`、`--dsw-alias-markdown-inline-code`、`--dsw-alias-border-l1/-l2`、`--dsw-alias-label-caption` | `theme-client.js:1425` RULE 4（字体族，abs-col 1224）；`web-frontend-index.css:1` 偏移 29595+ |
| 代码块 | `--dsw-alias-markdown-code-block`、`--dsw-alias-markdown-code-block-banner`、`--dsw-radius-lg`、`--dsw-font-markdown-code-block`、`--dsw-alias-markdown-code-segment-*` | `theme-client.js:1413` RULE 2/3 abs-col 9053/15931（code-block）、8978/15855（banner） |
| Shiki 语法高亮 | `--shiki-foreground`、`--shiki-background`、`--shiki-token-*` | `theme-client.js:1428`（`:root` + `body[data-ds-dark-theme]`） |
| 用户气泡 | `--dsw-specific-bubble`、`--dsw-radius-xl`、`--dsh-content-font-size`、`--dsh-content-font-delta` | `chat.js:4271`（MessageItem CSS） |
| reasoning / 命令卡片 | `--dsw-alias-label-caption`、`--dsw-alias-label-secondary`、`--dsh-content-font-size-secondary` | `chat.js:6106`、`chat.js:6383` |
| 聊天列宽 | `--dsh-chat-content-width`（= `--dsh-chat-user-width` 或 `clamp(680px, column*0.64, 920px)`）、`--dsh-chat-flow-gap` | `conversation.js:17325`（`.Dc7zOa_body`）、`chat.js:2679` |

---

## 5. 设置页 · The settings page

### 5.1 面板结构 · Panel structure

```
div._wCInkW_overlay (position:fixed; z-index:1000)          ← settings-general.js:59 (SettingsRoot.module.css)
 ├ div._wCInkW_mask                                          (background:var(--dsw-alias-bg-mask-1))
 └ div[data-shortcut-modal="settings"]._wCInkW_panel         ← settings-general.js:290-291
    (width:800px; height:min(800px, 100vh-…); border-radius:var(--dsw-radius-panel);
     background:var(--dsw-alias-bg-layer-2); box-shadow:var(--dsw-elevation-prominent))
    ├ nav._wCInkW_nav  (width:188px; padding:22px 12px 0)
    │  ├ div._wCInkW_navTitle   [data-modal-autofocus?]
    │  └ div._wCInkW_navList → button._wCInkW_navCell(+._wCInkW_active)
    └ div._wCInkW_content
       ├ div._wCInkW_header → div._wCInkW_actions + button._wCInkW_close
       └ div._wCInkW_options (padding:0 24px 24px; overflow-y:auto)
          └ div[data-slot="settings.section"]              ← display:contents
             └ div._zZnCHW_section                          ← GeneralSection, settings-general.js:638
                └ div[data-slot="settings.general.item"]    ← display:contents, 每行一个
                   └ <行组件>
```

`data-slot="settings.general.item"` 的 `display:contents` 由 `renderer.js:1116` 的 `ANCHOR_STYLE` 保证。

### 5.2 `--dsw-alias-settings-card-*` 用法 · `--dsw-alias-settings-card-*` usage

**声明**（`theme-client.js:1407` col 1063 / col 1122，`body` 选择器）：

```
--dsw-alias-settings-card-fill:   var(--dsw-alias-bg-layer-2);
--dsw-alias-settings-card-stroke: var(--dsw-alias-border-l4);
```

**消费者**（全仓只有 3 处，且都不是 General 区的普通行）：

| 消费者 | 形态 | 证据 |
|---|---|---|
| `dsh-client-ui-agent-preset` | `.KZf9OG_card{border:.5px solid var(--dsw-alias-settings-card-stroke); border-radius:var(--dsw-radius-xl); background:var(--dsw-alias-settings-card-fill)}` | `agent-preset.js:1614` |
| `dsh-client-ui-settings-models` | `._3nPmjq_rowCard{border:.5px solid …-stroke; background:…-fill; border-radius:var(--dsw-radius-xl); padding:12px 14px}` | `settings-models.js:58` |
| `dsh-client-ui-settings-plugin-inventory` | `.RotMhW_card{…}` | `plugin-inventory/lib/client.js:57` |

> **注意**：`dsh-client-ui-settings-general` 与 `dsh-client-ui-theme` **都不使用** `--dsw-alias-settings-card-*`。General 区的行是"分隔线式行"，不是卡片。

### 5.3 General 区行模式（我们自己的设置行必须视觉匹配的）· The General-section row pattern our own rows must match

**标准分隔线行**（两栏：文案 + 控件）—— `dsh-client-ui-theme` 的 FontSizeRow（`theme-client.js:1133`）：

```
._0Fr0Ha_row{
  border-bottom:.5px solid var(--dsw-alias-border-l2);
  align-items:center;
  gap:8px;
  padding:16px 0;
  display:flex
}
._0Fr0Ha_rowText{flex-direction:column; flex:1; gap:4px; min-width:0; padding-right:48px; display:flex}
._0Fr0Ha_title{color:var(--dsw-alias-label-primary); font-size:14px; font-weight:400; line-height:22px}
._0Fr0Ha_desc{color:var(--dsw-alias-label-tertiary); font-size:12px; font-weight:400; line-height:18px}
._0Fr0Ha_control{align-items:center; gap:8px; display:inline-flex}
```

`dsh-client-ui-chat` 的 PreferenceRow 与之几乎逐值相同（`chat.js:12745`）：

```
.XZcbxG_row{border-bottom:.5px solid var(--dsw-alias-border-l2); align-items:center; gap:8px; padding:16px 0; display:flex}
.XZcbxG_rowText{flex-direction:column; flex:1; gap:4px; min-width:0; padding-right:48px; display:flex}
.XZcbxG_title{color:var(--dsw-alias-label-primary); font-size:14px; font-weight:400; line-height:22px}
.XZcbxG_desc{color:var(--dsw-alias-label-tertiary); font-size:12px; font-weight:400; line-height:18px}
.XZcbxG_selector{border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-module-platform); height:36px; padding:0 14px; font-size:14px; line-height:22px}
```

**其它两种行形态：**

1. **左文右开关行** —— `DeveloperToolsRow`（`settings-general.js:667`）：
   ```
   .PgWN5G_row{border-bottom:.5px solid var(--dsw-alias-border-l2); justify-content:space-between; align-items:center; gap:24px; padding:16px 0; display:flex}
   .PgWN5G_title{font-size:14px; line-height:20px}
   .PgWN5G_description{color:var(--dsw-alias-label-secondary); margin-top:4px; font-size:12px; line-height:18px}
   ```
   注意 `gap:24px` 与 `justify-content:space-between`，`title` **没有** color（继承面板色）。

2. **纯文本行** —— `CurrentVersionRow`（`settings-general.js:642`）：
   ```
   .mY-j6a_row{color:var(--dsw-alias-label-primary); overflow-wrap:anywhere; padding:16px 0; font-size:14px; line-height:22px}
   ```

3. **卡片组行**（Appearance，`theme-client.js:27`）：
   ```
   .v01cdW_group{border-bottom:.5px solid var(--dsw-alias-border-l2); flex-direction:column; gap:8px; padding:16px 0; display:flex}
   .v01cdW_title{color:var(--dsw-alias-label-primary); font-size:14px; font-weight:400; line-height:22px}
   .v01cdW_themeCube{border:.5px solid var(--dsw-alias-border-l4); border-radius:var(--dsw-radius-xl); padding:20px 32px; flex:180px; font-size:14px; line-height:22px}
   .v01cdW_selected{background:var(--dsw-alias-bg-module-platform); border-color:var(--dsw-static-neutral-bluish-400)}
   ```

**General 区"最后一行去边框"规则**（`settings-general.js:617`）：

```
.zZnCHW_section>[data-slot="settings.general.item"]>:last-child{border-bottom:none}
```

> 我们自己的设置行如果注册到 `settings.general.item` 槽，会被包进 `[data-slot="settings.general.item"]`，**这条规则会自动作用于我们的行**——只要我们的行根元素是该 slot 包裹的最后一个子元素。行的边框应由我们自己的样式提供，否则最后一行会出现"无边框"与"有边框"的错位。

**推荐对齐参数（三条一致的行定义）：**

| 项 | 值 |
|---|---|
| 行底边框 | `0.5px solid var(--dsw-alias-border-l2)` |
| 行内边距 | `16px 0` |
| 标题 | `font-size:14px; line-height:22px; color:var(--dsw-alias-label-primary); font-weight:400` |
| 描述 | `font-size:12px; line-height:18px; color:var(--dsw-alias-label-tertiary)`（DeveloperTools 用 `label-secondary`） |
| 文案列 | `flex:1; gap:4px; padding-right:48px` |
| 控件 | `height:36px; border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-module-platform); padding:0 14px` |

---

### 5.4 宿主官方「字体族」设置与行合并机制 · The host's official font-family settings & how our rows join that group

**宿主提供什么**（`dsh-client-ui-theme`，提取物里搜 `FontFamilyRow`）：

- `FontFamilyRow` —— 三个族角色 `text` / `code` / `terminal`，每个是一个纯文本输入框（`maxlength=200`）；文案键 `fontFamily.<role>.title` / `.description`（宿主字典：`正文字体` / `代码字体` / `终端字体`，英文 `Text font` / `Code font` / `Terminal font` …）。
- 写入 API：`theme.setFontFamily(role, value)`；宿主自带 `normalizeFontFamily()`（逗号切分、去引号/反斜杠/尖括号/控制字符、非通用名加引号）。
- 渲染位置：**在「字号大小」组内、字号控件行之下**——即用户说的"字体选项就在字号下拉栏下面"。
- 视觉体例与 FontSizeRow 同一套行模式（见 §5.3）。

**槽不能嵌套 → 行合并只能做 DOM**：`settings.general.item` 只能贡献平铺兄弟行，官方字体行在宿主组件内部，槽注不进去。可行做法（实现见 `plugins/system-fonts/client/src/merge.js`）：

1. **定位出口**：从自己的行向上找 `div[data-slot="settings.general.item"]`（`display:contents`）。
2. **定位字体组**：出口的直接子元素中，子树含"字号行特征"的那个 —— `button[aria-expanded][aria-controls]` 且同级有 `px` 单位文本；回退特征为官方族名输入框（`input[maxlength=200]` / placeholder `默认`/`Default` / aria-label `正文字体|代码字体|终端字体|Text font|…`）。
3. **落座**：`insertBefore` 到字号控件行之后，按自身 slot order 排序。
4. **覆盖官方行**：只含一个族名输入框、无展开按钮、无 `px` 单位文本的行 → 打自己的 `data-*` 标记 + `display:none`（**隐藏不删除**；字号展开区里的 code/terminal 字号步进器仍可用）。

**四条硬要求**（缺一条都会在真实宿主里翻车）：

| 要求 | 原因 |
|---|---|
| **幂等** | `insertBefore` 对"已在正确位置"的节点同样会触发 DOM 变更，MutationObserver 会自激；必须"先判断位置，再决定移动" |
| **可回收** | React 按自己记录的父子关系 `removeChild`，行若还留在组内会抛错；回收时要在 ref cleanup 里先把行放回 slot 出口 |
| **优雅降级** | 找不到出口/组就一次都不动 DOM，只 `console.warn` 一次，行停在原 slot 位置、不隐藏任何宿主元素 |
| **单一状态源** | 族名写入只走 `setFontFamily(role, normalizeFontFamily(value))`；官方输入框被隐藏后，任何绕过该管线的本地写入（如只写 `localStorage` 的"恢复默认"）都会让隐藏控件与真实状态分叉 |

**残余风险**：设置页挂载期间若再注册新的 `settings.general.item` 行，React 可能相对"已被移动的行"计算插入点。宿主当前设置在启动即固定、无运行时注册；注销路径已被 `plugins/system-fonts/test` 覆盖。

---

## 6. 可覆写性判定 · Overridability verdicts

### 6.1 逐区域结论 · Region-by-region conclusions

| 区域 | 推荐方式 | 理由 / 风险 |
|---|---|---|
| **App 框架底色** | (a) token only | `.BynINW_frame{background:var(--dsw-alias-bg-base)}`（`layout-client.js:73`）。改 `--dsw-alias-bg-base` 即可，无需选择器。 |
| **App 框架结构（列宽/圆角）** | (c) 不要动 | `gridTemplateColumns` 是 inline style（`layout-client.js:321`），与 `--dsh-windows-sidebar-width` 耦合。CSS 强改会破坏拖拽与动画。 |
| **Windows 标题栏区域** | (a) token + (b) `html[data-windows-titlebar]` | `--dsh-windows-titlebar-height` 由 preload 内联设为 `40px`（`preload-app.cjs:578`）。若要改高度，必须 `!important` 覆盖 `html` 上的 inline 值。背景走 `--dsw-specific-sidebar-fill`。 |
| **侧栏背景** | (a) token only：`--dsw-specific-sidebar-fill` | 同时作用于 `.BynINW_sidebarCol` 与 `._2H3hWW_root`，以及 Windows frame 背景。**一处改，三处同步**，这是最干净的路径。 |
| **侧栏 padding** | (b) `[data-sidebar-collapsed]` 祖先 + 不能命中根 | 根元素无 `data-*`，只有 hash 类 `._2H3hWW_root`。若必须改 padding，只能写 `html[data-windows-titlebar] .BynINW_sidebarCol > div { … }` 这种结构选择器（脆弱）或接受 hash 类（升级即断）。**建议 (c)：不改。** |
| **侧栏宽度** | (c) 不要动 | 宽度是 JSX inline style（`sidebar.js:292`）+ grid 列宽（`layout-client.js:321`），CSS 无法干净覆盖。 |
| **Composer 卡片外观（圆角/背景/阴影）** | (b) `[data-composer-card]` | 稳定且语义明确。若要改圆角，`[data-composer-card]{border-radius:…}` 即可；注意 `.RlGAzG_cardWorkspaceTrigger:after` 也用 `var(--dsw-radius-panel)` 画虚线描边（`conversation.js:18703` col 1334），改圆角需同步。**更稳的做法**：只覆盖 `--dsw-radius-panel`（token），全站面板圆角一起变。 |
| **Composer 背景** | (a) token：`--dsw-specific-input-major` | 亮 `#fff` / 暗 `#2c2c2e`。改 token 比 `[data-composer-card]{background:…}` 更好，因为后者会与 `.RlGAzG_cardWorkspaceTrigger` 的 hover/active 态打架。 |
| **Composer 阴影** | (a) token：`--dsw-elevation-soft`（见第 7 节，需 `!important`） | 卡片局部覆盖了 `--dsw-elevation-stroke-color`（`conversation.js:18703` col 696），所以想彻底改阴影需要同时处理 stroke-color。 |
| **Composer 尺寸/宽度** | (b) `[data-composer-card]` 或改 `--dsh-chat-content-width` | `max-width` 来自 `--dsh-composer-card-max-width`（声明在 `.Dc7zOa_body`）。改 `.Dc7zOa_body` 上的 `--dsh-chat-content-width` 会连带改聊天列宽——通常这是想要的效果。 |
| **消息行类型区分** | (b) `[data-chat-flow-kind="user"]` 等 | ✅ 最稳。注意 `data-chat-flow-kind` 的值域是 15 个已知 kind（`chat.js:7186-7282`），新增 kind 时我们的规则会静默失效（可接受）。 |
| **用户气泡** | (a) token：`--dsw-specific-bubble` + `--dsw-radius-xl` | 气泡是 `.cJsG2q_bubble`（`chat.js:4271`），hash 类。token 路径干净。 |
| **Markdown 正文** | (a) token：`--dsw-font-markdown-*` + `--dsw-alias-label-primary` | markdown 根是 hash 类 `._markdown_1ypvv_5`。**但**可以用 `[data-markdown-variant="compact"]` 命中 compact 变体；正文变体没有 data 属性，只能靠 token 或 hash 类。 |
| **代码块** | (a) token：`--dsw-alias-markdown-code-block` / `-banner`，或 (b) 覆盖 `--dsl-code-block-*` | `--dsl-code-block-*` 声明在 `.md-code-block`（hash 类 `_block_7gxqk_4`）上，主题可在**祖先**（如 `[data-conversation-scroll]` 或 `body`）上重设这些变量实现继承覆盖 —— 因为 `--dsl-code-block-*` 的声明在 `._block_7gxqk_4` 自身，**后代选择器无法从外部覆盖**，必须用同等或更高特异性的选择器（`.md-code-block` 字面量类可用，或 `!important`）。 |
| **菜单面板** | (b) `[data-menu-material]` + (a) token | `--dsw-menu-surface-fill`、`--dsw-menu-backdrop-filter`、`--dsw-elevation-*` 都在 `body` / `body,body *` 上。宿主自己已用 `body[data-ds-dark-theme] [data-menu-material]{--dsw-elevation-stroke-color:…}`（`theme-client.js:1425` col 562），说明 `[data-menu-material]` 是官方认可的样式锚点。 |
| **弹窗（Modal）** | (b) `[data-shortcut-modal]` + (a) token | 通用 modal 有 `[data-shortcut-modal]`（`web-frontend-index.js:129`），设置面板是 `[data-shortcut-modal="settings"]`（`settings-general.js:290`）。背景 `--dsw-alias-bg-layer-2`，阴影 `--dsw-elevation-prominent`。 |
| **设置面板** | (b) `[data-shortcut-modal="settings"]` + (a) token | 面板背景/圆角/阴影全走 token（`settings-general.js:59`）。导航项用 `--dsw-specific-sidebar-nav-item-*`。 |
| **我们自己的设置行** | (b) `[data-slot="settings.general.item"]` 作用域 + 自有类名 | 见 5.3。**绝不要**去匹配宿主的 hash 行类。 |
| **Toast / Tooltip** | (a) token：`--dsw-alias-toast-bg`、`-toast-label`、`--dsw-alias-tooltip-bg`、`--dsw-alias-tooltip-key-bg` | Toast 用 `--dsw-shadow-lv3`（`.repro/css/web-frontend-index.pretty.css:1885`），**不在** `--dsw-elevation-*` 体系里 —— 两套变量互不相干。 |
| **slot 包裹元素** | (b) 仅作选择器前缀 | `display:contents`（`renderer.js:1116`），**不可**设背景/边框/padding，也不产生盒模型。 |

### 6.2 风险声明：hash 类目标会在升级时静默失效 · Risk note: hashed-class targets silently die on upgrade

以下 hash 类**已经出现在我们可能想写的地方**，列出供明确规避：

| hash 类 | 模块 | 会怎样坏 |
|---|---|---|
| `_markdown_1ypvv_5` | primitives markdown | 升级后类名变 `_markdown_xxxxx_N`，规则**完全不生效且无报错** |
| `_compact_1ypvv_331` | primitives markdown | 同上 |
| `_block_7gxqk_4` / `_banner_7gxqk_24` | primitives code block | 同上；且这些类**同时**是 `--dsl-code-block-*` 的声明处 |
| `RlGAzG_card` / `RlGAzG_input` | conversation InputBar | 同上（但已有 `data-composer-*` 替代） |
| `_2H3hWW_root` | sidebar | 同上（无替代，只能不改） |
| `Dc7zOa_body` / `Dc7zOa_composerSeat` | conversation root | 同上（但有 `data-conversation-*` / `data-composer-seat` 替代） |
| `xz4KEq_column` / `xz4KEq_flowItem` | chat view | 同上（但有 `data-chat-*` 替代） |
| `cJsG2q_bubble` / `cJsG2q_userRow` | chat message item | 同上（气泡走 token） |
| `wCInkW_panel` / `wCInkW_navCell` | settings root | 同上（有 `data-shortcut-modal="settings"` 替代） |

**判定原则**：能用 token 就不要用选择器；能用 `data-*` 就不要用 hash 类；`md-code-block` / `md-table-wide` 这两个字面量类名是例外（宿主有意暴露，`web-frontend-index.js:165`、`:172`），可用但仍应作为 fallback 而非主路径。

---

## 7. `--dsw-elevation-*` 与 `--dsw-shadow-*` 的声明位置（决策关键）· Where `--dsw-elevation-*` / `--dsw-shadow-*` are declared (decision-critical)

### 7.1 精确证据 · Exact evidence

全部来自 `theme-client.js` **第 1425 行**（`gradient_shadow_text_css_default`，CSS 字面量从该行 **col 42** 开始，长度 12175）。

**RULE 0 —— 选择器 `body`（abs-col 42）：**

```
body{
  --dsw-linear-gradient-think:linear-gradient(180deg, #fff 20.19%, #fff0 100%);
  --dsw-linear-think-select:linear-gradient(180deg, #f5f6f7 20.19%, #f5f6f700 100%);
  --dsw-shadow-lv1:0 2px 4px 0 #0000000d;            ← abs-col 206
  --dsw-shadow-lv1-blur:0 4px 12px 0 #00000005;      ← abs-col 245
  --dsw-shadow-lv2:0 4px 12px 0 #00000005, 0 2px 8px 0 #0000000a;   ← abs-col 290
  --dsw-shadow-lv3:0 0 1px 0 #0003, 0 0 4px 0 #00000005, 0 12px 32px 0 #00000014;  ← abs-col 353
  --dsw-elevation-stroke-color:var(--dsw-alias-border-l4);          ← abs-col 432
  --dsw-mask-blur:none;                                             ← abs-col 488
  --dsw-menu-backdrop-filter:blur(40px) saturate(150%)
}
```

**RULE 1 —— 选择器 `body[data-ds-dark-theme] [data-menu-material]`（abs-col 562）：**

```
body[data-ds-dark-theme] [data-menu-material]{
  --dsw-elevation-stroke-color:var(--dsw-alias-border-l3)
}
```

**RULE 2 —— 选择器 `body,body *`（abs-col 664）：**

```
body,body *{
  --dsw-elevation-stroke:0 0 0 .5px var(--dsw-elevation-stroke-color);                                    ← abs-col 676
  --dsw-elevation-panel:var(--dsw-elevation-stroke), 0 3px 8px 0 #00000008, 0 0 16px 0 #00000005;          ← abs-col 744
  --dsw-elevation-prominent:var(--dsw-elevation-stroke), 0 3px 8px 0 #0000000a, 0 0 20px 0 #0000000d;      ← abs-col 839
  --dsw-elevation-soft:var(--dsw-elevation-stroke), 0 4px 16px 0 #00000008, 0 0 24px 0 #00000008          ← abs-col 938
}
```

（后续 RULE 3 `body[data-ds-dark-theme]` abs-col 1033、RULE 4 `body{--dsh-content-font-delta…}` abs-col 1224，与本题无关。）

### 7.2 结论（三问三答）· Verdict (Q&A)

**问：`--dsw-elevation-*` 声明在哪个选择器上？**
*Where is `--dsw-elevation-*` declared?*

答：**`body, body *`**（`theme-client.js:1425` abs-col 664）。这是通配后代选择器 —— 意味着**页面上每一个元素都各自持有一份 `--dsw-elevation-*` 的声明值**。
*A universal descendant selector — every element on the page holds its own `--dsw-elevation-*` declaration.*

**问：`--dsw-shadow-*` 声明在哪个选择器上？**
*Where is `--dsw-shadow-*` declared?*

答：**`body`**（`theme-client.js:1425` RULE 0，abs-col 42 起；`--dsw-shadow-lv1/lv1-blur/lv2/lv3` 分别在 abs-col 206/245/290/353）。`--dsw-elevation-stroke-color` 也在 `body` 上（abs-col 432），但被 `body[data-ds-dark-theme] [data-menu-material]` 局部覆盖（abs-col 562）。
*On `body` alone.*

**问：inline body style 能不能覆盖它们？**
*Can an inline body style override them?*

答：**分两种情况，结论不同 ——**
*It depends on which family:*

| 目标 | inline `body.style.setProperty(...)` 是否有效 | 原因 |
|---|---|---|
| `--dsw-shadow-lv1` / `-lv1-blur` / `-lv2` / `-lv3` | ✅ **有效** | 它们只声明在 `body` 上（RULE 0）。inline style 是 `body` 元素自身声明中特异性最高的，能覆盖 `body{...}` 规则；且后代元素没有自己的 `--dsw-shadow-*` 声明，会继承 body 的值。 |
| `--dsw-elevation-stroke-color` | ✅ **有效（但会被菜单覆盖）** | 声明在 `body`（RULE 0）。inline 可覆盖。**但** `body[data-ds-dark-theme] [data-menu-material]` 这条规则（RULE 1）在 `[data-menu-material]` 元素上重新声明了它 —— 那是**另一个元素**，body 的 inline 值影响不到它。 |
| `--dsw-elevation-stroke` / `-panel` / `-prominent` / `-soft` | ❌ **无效** | 它们声明在 `body, body *`（RULE 2）。虽然 body 自身的 inline 能覆盖 `body` 那一半，但**每个后代元素**都因 `body *` 匹配而持有自己的声明值，inline 在 body 上无法影响子元素自身的声明。子元素用自己的声明值，不会回退到继承。 |

**因此：**
*Therefore:*

- 想改**阴影层级**（`--dsw-shadow-lv1/2/3`，只用于 toast 与 hovercard）→ **inline body style 足够**。
  *For shadow levels (toast & hovercard only) → an inline body style suffices.*
- 想改**海拔/面板阴影**（`--dsw-elevation-panel` / `-prominent` / `-soft`）→ **必须用带 `!important` 的样式表规则**，且必须命中 `body, body *` 同等或更高特异性，例如：
  *For elevation/panel shadows → a stylesheet rule with `!important`, at `body, body *`-equal-or-higher specificity:*
  ```css
  body, body * { --dsw-elevation-soft: 0 8px 32px rgba(0,0,0,.12) !important; }
  ```
  或只针对具体区域（更安全，避免影响全站）：
  ```css
  [data-composer-card] { --dsw-elevation-soft: … !important; }
  ```
  注意 `!important` 在这里是**必需的**，因为该变量的声明本身就落在每个元素上，普通规则无法从祖先"覆盖"后代的自身声明。
  *`!important` is required here — the variable is declared on every element, so a normal rule on an ancestor cannot override a descendant's own declaration.*

  三者影响范围差别很大（见 7.3 全量清单）：
  *The three differ greatly in blast radius (see 7.3):*
  - `-soft` 几乎只影响 **composer 卡片**（另加一个分段控件指示器）→ 可以放心全局改。
    *`-soft` affects almost only the composer card → safe to change globally.*
  - `-panel` 影响 7 处（回合导航预览、回到底部按钮、Todo 面板、计划评审卡、提问输入卡、hovercard 预览/媒体）。
    *`-panel` touches 7 places.*
  - `-prominent` 影响 8 处（统计弹层、ContextMeter、composer 菜单、**设置面板**、通用菜单、通用 Modal、图片预览、dockkit 浮动面板）→ 全局改会波及所有浮层。
    *`-prominent` touches 8 places — a global change hits every overlay.*

- 另一个可用但更粗暴的路径：直接覆盖消费端的 `box-shadow` 属性（如 `[data-composer-card]{box-shadow:…}`）。这样绕开变量体系，但会同时丢掉 `--dsw-elevation-stroke`（0.5px 描边环），视觉上会变"没边"。
  *A coarser path: override `box-shadow` at the consumer directly — bypasses the variable system but also drops `--dsw-elevation-stroke` (the 0.5px ring), making it look borderless.*

### 7.3 同一体系中的其它声明点（避免误判）· Other declaration points in the same system (avoid misreading)

- `--dsw-elevation-stroke-color` 还被这些**组件局部**覆盖（都是"提高特异性"的正确示范，主题若要改这些区域的描边需同等特异性）：
  - `.xz4KEq_toBottom` → `var(--dsw-alias-border-l3)`（`chat.js:2679`）
  - `.Xt1eiG_panel` → `var(--dsw-alias-border-l1)`（`chat.js:6814`）
  - `.RlGAzG_card` → `var(--dsw-alias-border-l2)`（`conversation.js:18703` col 696）
  - `.RlGAzG_cardWorkspaceTrigger` → `transparent`（`conversation.js:18703`）
  - `._2WTFBq_panel` → `var(--dsw-alias-border-l1)`（`conversation.js:18454`）
  - `.aSus8q_root` → `var(--dsw-alias-border-l1)`（`conversation.js:19174`）
  - `.Z9Jnlq_menu` → `var(--dsw-alias-border-l1)`（`input-trigger.js:1628`）
  - `.wq12jW_menu` → `var(--dsw-alias-border-l1)`（`model-selection.js:1060`）
  - `.EhuiKa_card` → `var(--dsw-alias-border-l1)`（`commands.js:1815`）
  - `._list_4ub78_7,._submenu_4ub78_8` → `var(--dsw-alias-border-l1)`（`web-frontend-index.js` 对应 CSS `.repro/css/web-frontend-index.pretty.css:829`）
  - `._float_6nhg2_156` → `var(--dsw-alias-border-l2)`（`.repro/css/web-frontend-index.pretty.css:3613`）
**全量消费者清单**（对 `.repro/css/` 下全部 45 个 `.pretty.css` 逐条扫描得出，含各自所属选择器）：
*Full consumer list (scanned across all 45 `.pretty.css`, with owning selectors):*

`--dsw-elevation-soft` —— **只有 2 处 · only 2 hits**：

| 选择器 | 文件:行 |
|---|---|
| `.RlGAzG_card`（**composer 卡片**） | `.repro/css/conversation/08-InputBar.module.pretty.css:40`（源 `conversation.js:18703` col 833） |
| `._indicator_d62eq_22`（分段控件滑动指示器） | `.repro/css/web-frontend-index.pretty.css:614` |

> 也就是说，改 `--dsw-elevation-soft` 在视觉上**几乎只影响 composer 卡片**。这是主题最想要的效果，也说明它很安全。
> *So changing `--dsw-elevation-soft` visually affects almost only the composer card — exactly what a theme wants, and safe.*

`--dsw-elevation-panel` —— **7 处 · 7 hits**：

| 选择器 | 文件:行 |
|---|---|
| `.xpvNua_preview`（回合导航预览卡） | `.repro/css/chat/00-TurnNavigator.module.pretty.css:115` |
| `.xz4KEq_toBottom`（回到底部按钮） | `.repro/css/chat/01-ChatView.module.pretty.css:189` |
| `.aSus8q_root`（Todo 面板） | `.repro/css/conversation/09-TodoPanel.module.pretty.css:10` |
| `.P2izSq_card`（计划评审卡片） | `.repro/css/user-questions/00-PlanReviewPanel.module.pretty.css:13` |
| `.mAtvLq_card`（提问输入卡片） | `.repro/css/user-questions/01-QuestionComposer.module.pretty.css:14` |
| `._preview_38jqx_52` / `._media_38jqx_80`（hovercard 预览/媒体） | `.repro/css/web-frontend-index.pretty.css:1101`、`:1131` |

`--dsw-elevation-prominent` —— **8 处 · 8 hits**：

| 选择器 | 文件:行 |
|---|---|
| `.Xt1eiG_panel`（统计弹层） | `.repro/css/chat/13-stat-dialog.module.pretty.css:12` |
| `._2WTFBq_panel`（ContextMeter 面板） | `.repro/css/conversation/07-ContextMeter.module.pretty.css:46` |
| `.Z9Jnlq_menu`（composer 触发菜单） | `.repro/css/input-trigger/00-MenuView.module.pretty.css:12` |
| `.wCInkW_panel`（**设置面板**） | `.repro/css/settings-general/00-SettingsRoot.module.pretty.css:73` |
| `._list_4ub78_7,._submenu_4ub78_8`（通用菜单） | `.repro/css/web-frontend-index.pretty.css:830` |
| `._dialog_o6lrb_33`（通用 Modal） | `.repro/css/web-frontend-index.pretty.css:1168` |
| `._image_19zw2_26`（图片预览） | `.repro/css/web-frontend-index.pretty.css:2940` |
| `._float_6nhg2_156`（dockkit 浮动面板） | `.repro/css/web-frontend-index.pretty.css:3614` |

`--dsw-shadow-lv3` —— **只有 2 处 · only 2 hits**：

| 选择器 | 文件:行 |
|---|---|
| `._card_38jqx_9`（hovercard） | `.repro/css/web-frontend-index.pretty.css:1064` |
| `._toast_l6cvn_6`（toast） | `.repro/css/web-frontend-index.pretty.css:1885` |

> 关键推论：**`--dsw-shadow-*` 体系只服务 hovercard 与 toast**，绝大多数面板走的是 `--dsw-elevation-*`。如果只改 `--dsw-shadow-lv*`（inline 就能改），视觉上几乎看不出变化 —— 这大概是最容易让人误判"token 覆盖没生效"的陷阱。
> *Key takeaway: `--dsw-shadow-*` serves only hovercard & toast; most panels use `--dsw-elevation-*`. Changing only `--dsw-shadow-lv*` (which inline can do) is nearly invisible — the classic "my token override did nothing" trap.*

> 附注：`lib/welcome/welcome.css` 里另有一份 `--dsw-elevation-*` / `--dsw-shadow-*` 声明（同一套值，CSS 写法不同），但它只被 `renderer/welcome.html` 加载，**不参与主应用**，与主题插件无关。
> *Note: `lib/welcome/welcome.css` has a duplicate `--dsw-elevation-*`/`--dsw-shadow-*` declaration (same values, different CSS), but it loads only in `welcome.html` — not part of the main app.*

---

## 8. 附：本次勘察用到的提取脚本与产物 · Appendix — extraction scripts & artifacts

| 产物 | 说明 |
|---|---|
| `.repro/css/AppFrame.module.css` | layout 包 AppFrame CSS |
| `.repro/css/conversation/*.pretty.css` | conversation 包 10 个 CSS Modules（含 `08-InputBar.module.pretty.css`） |
| `.repro/css/chat/*.pretty.css` | chat 包 18 个 CSS Modules |
| `.repro/css/sidebar/*.pretty.css` | sidebar 包 2 个 |
| `.repro/css/settings-general/*.pretty.css` | settings-general 包 8 个 |
| `.repro/css/web-frontend-index.pretty.css` | primitives/markdown/code-block/menu/dialog 全部样式（3702 行） |
| `.repro/data-attrs.txt` | 全量 `data-*` 属性清单（152 条，含文件:行号） |
| `.repro/asar/preload-app.cjs` | preload，确认 `data-platform` / `data-windows-titlebar` / `data-fullscreen` 来源 |

**未确认事项（诚实声明）· Unverified items (honest note)：**

1. `data-input-modality` 的**写入侧**未在主应用 bundle 中直接定位到（只在 `web-frontend-index.js:129` 看到读侧 `html[data-input-modality=pointer]` 样式规则与 `data-dsh-automatic-focus` 的 setter 同处）。该属性确实存在（读侧样式可证），但写入代码在 primitives 内部某处，未逐行定位。
2. `--dsh-composer-*` 之外，宿主的 `--dsh-*` 布局变量（`--dsh-frame-*`、`--dsh-windows-*`）分散在 layout CSS、preload 与 sidebar CSS 中，本文只覆盖与任务相关的部分。
3. 侧栏根元素**确实没有** `data-*` 钩子（`sidebar.js:289-292` 逐字段确认），这是本文给出的"不要改侧栏 padding"结论的直接依据。
