# 参考仓库吸收台账 · Reference-repo absorption ledger

> **先读这篇：`docs/reference-next-wave.md`** —— 它是本台账的**前瞻版**，写于第一层验收之后，逐条对照**已安装宿主**重新核过钩子。它纠正了本文件 §3 的一批判断：`data-message-attachments`、`data-composer-placeholder`、`data-conversation-tabs`、`data-composer-stat`、`data-disclosure-*` 当年被记为"不可达"，实际上**可达并已交付**。本文件的 §3 保留原样作为历史记录，判断以下面的说明与 next-wave 为准。

参考仓库：`.reference/open-claude-ui`（MIT，只读）。**71 个文件 / 1.2 MB**，其中 8 篇 v1 文档共 **7,159 行** + 一篇 **4,510 行**总集（`docs/v1/Claude Design System (CDS).full.md`），另有 **26 个组件实现**（tsx）。

本台账记录：**哪些已经吸收进本仓库、哪些没有、为什么**。判断口径只有一条——宿主（DeepSeek Harness）是否给了**稳定的钩子**（`data-*` 属性、公开字面量类、主题令牌）；凡是必须命中盐化 CSS-Modules 类的，一律记为"不可达"，不硬做。

图例：✅ 已吸收　🟡 部分吸收　❌ 未吸收　🚫 不可达（宿主无钩子）

---

## 0. 2026-10-18 更新摘要

本台账初版写于第一层（令牌 + 排版 + 基础表面）交付前后，此后仓库发生了大量变化。以下是初版之后新增的事实，**逐条从代码核实**：

- **设置页结构重建**：`dsh-cds-theme` 注册了一个真正的 `settings.section`（id `appearance`、order 1、中英标签「主题定制」/「Theme」），导航里与「通用」同级，自带子账本与自绘图标（同心圆角双框）。宿主的 `settings.general.item` 里只留主开关 `enabled`。
- **新增 8 个逐项开关**（A 档六项 + B 档两项，全部带开关、全部可逆）见 `docs/replication-toggles.md` 的清单。
- **退役 2 项、删除 2 项**：`codeBlockDetails` 与 `markdownBody` 在用户验收后**删开关、规则常驻**；`segmentedThumb` 被用户否决，整项移除。
- **新插件 `dsh-reasoning-effort`**：思考强度滑块，档位数量来自提供商的 `reasoning.efforts`，不是参考仓库的五档硬编码。
- **`dsh-usage-stats`**：面板高度行迁到「主题定制」页（order 40），新增数字单位行（order 41：跟随语言 / K-M-B / 万-亿）；加载路径从"每次重启全量解压 50 MB"降到 ~20 ms（磁盘层解析缓存 + 热尾容错 + 客户端 TTL）。
- **`dsh-system-fonts`**：CSSOM 每轮重建的 `getPropertyValue` 从 **47,328 次降到 4 次**；删掉 89 KB 零引用工具；终端族名"重开恢复默认"的根因是**镜像无条件覆盖本地**（宿主报空串时把三个角色的选择全抹了），已修。

---

## 1. 按文档分篇


### 01 设计哲学与设计令牌体系（616 行）— ✅ 吸收最彻底
逐值对照过，是本仓库的底座。

- ✅ 颜色令牌：173 个配色 + 133 个排印 + 13 个圆角/阴影/缓动 = **319 项** `overrideTokens` 覆盖（表面阶梯、文字三阶、边框四档、品牌双轨、状态色、菜单/侧栏/气泡、滚动条、代码 diff、onboarding）。数字由 `buildTokens(DEFAULT_STATE)` 复现，四个强调色预设下都是 319；`node plugins/cds-theme/tools/verify.mjs` 会打印 `override map size`。（2026-10-22 更正：原记 316，是加入 UI 字号角色之前的计数。）
- ✅ 冷蓝灰静态阶（19 档）与中性阶（16 档）→ 参考 `--cds-gray-*` 暖灰（按亮度就近）
- ✅ 品牌蓝 10 档 → 陶土阶（保亮度换色相，锚点对上 `--cds-clay` / `--cds-clay-light`）
- ✅ 圆角六档、阴影三档（双层弥散，`!important` 样式表下发）
- ✅ 边框透明度四档（0.06 / 0.10 / 0.20 / 0.35）
- ✅ 7 阶字号阶梯 + 行高；13 档 UI 步进令牌（字重 400/360、500/460、580/550）
- ✅ 暗色字重减薄（400→360、500→460、580→550，bold 660 不减）
- ✅ 字体栈逐字复制（`--font-anthropic-sans/serif/mono` + CJK 回退链）
- ✅ 动效曲线：7 条中已用 3 条（snap / pulse / swift）
- 🚫 正文/标题字距：参考只对工件语言标签规定 `0.05em`，该元素宿主盐化 → 不可达（已在 README 限制）→ 后经 `[data-code-block-banner]` 钩子**已解锁**（代码块横幅已实现）

### 02 基础原子组件与交互控件（402 行）— 🟡 部分
- ✅ 按钮/开关/选择器的**令牌层**（颜色、圆角、边框、焦点环）
- ✅ 设置行体例（14/22 标题、12/18 描述、16px 内边距、`.5px` 发丝）
- ❌ 分段控件的滑动 thumb 动画
- ❌ CdsButton 的 5 种变体 × 7 种尺寸矩阵
- ❌ ConfirmationDialog 的进出场动效

### 03 会话核心流与指令交互引擎（392 行）— 🟡 部分
- ✅ 消息气泡、代码块表面（深色终端）、思考折叠区、滚动渐隐、悬停显现操作栏
- ✅ 内嵌嵌套时的"微缩进归零"（令牌层面）
- ❌ 工具调用三态授权卡（pending → running → success/error）
- ❌ MCP 决策卡
- ❌ 附件卡片
- ❌ 消息流虚拟化细节

### 04 动效物理学、着色器与环境光影（392 行）— ❌ 基本未做
- ✅ `--cds-ease-pulse` 已接入（思考微光、状态点呼吸）
- ❌ 15 阶弹簧 `linear(...)`（进行中：`buttonSpring`）
- ❌ 其余 4 条缓动曲线（overshoot / pop / rise / fall）
- ❌ `ReasoningAmbientGlow` 环境光晕
- ❌ 着色器背景

### 05 视听多媒体与产物交互物理学（690 行，最长）— ❌ 未做
- ❌ 媒体灯箱（MediaLightboxViewer：缩放/平移/手势）
- ❌ 音频可视化（LiveMicActivityBars、ClaudeAudioPlayer）
- ❌ 产物分栏拖拽（ArtifactsSplitPaneResizer）
- ❌ Epitaxy iframe 桥

### 06 系统级桌面架构与协作拓扑（538 行）— ❌ 未做
- 🚫 桌面标题栏：已实现又删除——底色本来就是 CDS（令牌），发丝线在 100% 缩放下不可见，唯一可感的是菜单字号；且菜单栏沉在开放 shadow root，收益极低
- ❌ 可拖拽会话列表（DraggableSessionList）
- ❌ 协作拓扑（CoworkAgentCanvas）

### 07 工程配置与资产代码库总览（365 行）— 🟡 只用了线索
- ✅ 字体资产线索（Anthropic 三族可变字体的轴范围、字体栈）
- ✅ 图标线索（Anthropicons 可变图标字体是参考的主要图标机制）
- ❌ 工程配置本身（构建、tailwind 覆盖、storybook 组织）

### 08 AI-Agent 前端 UI 与动效开发指南（254 行）— ❌ 未读

---

## 2. 按组件（26 个 tsx）

| 组件 | 状态 | 说明 |
|---|---|---|
| `CodeBlock.tsx` | ✅ | 横幅标签（大写/等宽/字距 .05em）、分隔、折叠行；行号不可达（宿主只在 `numbered` 变体挂钩子） |
| `ChatMessageBubbles.tsx` | 🟡 | 气泡令牌层与排版已对齐；悬浮态操作栏已做；其余结构差异大 |
| `ThinkingAccordion.tsx` | 🟡 | 折叠行为宿主自己实现，我们只对齐了排版与色 |
| `ScrollFadeContainer.tsx` | 🟡 | 已用 `data-scroll-up/-down` 重写 24px 七档 alpha 遮罩 |
| `ClaudeDesktopHeader.tsx` | 🚫 | 见 06：shadow root + 收益极低，已删除 |
| `StatusIndicators.tsx` | 🟡 | 令牌对齐；呼吸动画进行中 |
| `SegmentedControl.tsx` | ❌ | 滑动 thumb 未做 |
| `CdsButton.tsx` | ❌ | 变体矩阵未做 |
| `AttachmentCard.tsx` | ❌ | 未做 |
| `McpToolDecisionCard.tsx` | ❌ | 未做 |
| `ConfirmationDialog.tsx` | ❌ | 未做 |
| `ChatComposer.tsx` / `ChatComposerChin.tsx` | 🟡 | 输入框三态阴影/焦点环已做；chin 结构未复刻 |
| `RichComposerWithMentions.tsx` | ❌ | 未做 |
| `ModelSelectorEffort.tsx` / `ModelSwitcherWithTokenGauge.tsx` | ❌ | 未做（宿主用自家模型选择器） |
| `StreamingDiffViewer.tsx` | 🟡 | diff 颜色令牌已对齐；流式高亮引擎未做 |
| `ReasoningAmbientGlow.tsx` | ❌ | 未做 |
| `CoworkAgentCanvas.tsx` | ❌ | 未做 |
| `MediaLightboxViewer.tsx` | ❌ | 未做 |
| `LiveMicActivityBars.tsx` / `ClaudeAudioPlayer.ts` | ❌ | 未做 |
| `ArtifactsSplitPaneResizer.tsx` | ❌ | 未做 |
| `ContainerResponsiveBar.tsx` | ❌ | 未做 |
| `DraggableSessionList.tsx` | ❌ | 未做 |
| `EpitaxyIframeBridge.tsx` | ❌ | 未做 |
| `CdsMotionEngine.tsx` / `ClaudeMotionPresets.ts` | ❌ | 弹簧/预设未做 |
| `useClaude*`（4 个 hook） | ❌ | roving focus / scroll pinning / shared-element transition |

---

## 3. 宿主元素级"不可达"清单（17 项）

> **本节为初版记录，已被证伪一部分。** 保留原文以便追溯，但下列若干项**现在可达且已交付**，正确结论见 `docs/reference-next-wave.md`：
> - `data-message-attachments` → ✅ 附件卡（开关 `attachments`）
> - `data-conversation-tabs` → 曾是分段控件项，**用户否决已删除**（不是不可达，是做得不好）
> - `data-composer-placeholder` → ✅ 占位符颜色/字号可达（真正不可达的是 Lexical 的可编辑文本面本身）
> - `data-composer-stat` / `data-session-stats-details` / `data-turn-usage-details` → ✅ 用量数字排版（开关 `statTypography`）
> - `data-footnotes` → ✅ 脚注（开关 `footnotes`）
> - `data-disclosure-*` 五件套 → ✅ 统一折叠体例（开关 `disclosurePolish`）
> - `data-chat-running` → ✅ 状态点呼吸（开关 `statusPulse`）
>
> 仍然成立的部分：发送按钮、消息时间戳、模型版本微标、快捷键键帽、代码块行号、会话顶栏标题、助手身份名称、四色 token 仪表 SVG —— 这些确实只能等宿主暴露令牌或钩子。

参考矩阵里明确规定了规格、但宿主把值硬编码在盐化 CSS 里，既无令牌也无 `data-*` 钩子：


发送按钮、消息输入框与占位符、消息时间戳、模型版本微标、消息底部动作按钮（部分）、思考折叠触发器、弹窗主标题、分段选择器、快捷键键帽、附件文件名、附件文件大小、工件卡片标题、会话顶栏标题、代码块行号、助理身份名称（DSH 无此元素）、用户气泡内部结构、代码语言标签的字号字族（字重已对齐）。

> 结论：这 17 项**只能等宿主暴露令牌或钩子**，本仓库不伪造选择器。

---

## 4. 当前进度总评（2026-10-18 重估）

初版的比例是凭印象给的。这次逐项对着代码核，**区分"能核的"和"核不了的"**：

| 层 | 状态 | 依据 |
|---|---|---|
| 全局设计语言（令牌层） | **✅ 已吸收** | 319 项 `overrideTokens`（2026-10-22 复测；本文原记 316，为加入 UI 字号角色前的数字），全部 `{light,dark}` 对，两套配色下 WCAG AA 断言通过；圆角/阴影/边框/字重阶梯逐值对齐 |
| 排版 | **✅ 已吸收** | 133 个 `--dsw-font-*` 令牌对参考表逐行核对；2 个思源子集内联，6 个 Anthropic 面改为本机 `local()` |
| 骨架结构（设置页、导航） | **✅ 已吸收并重组** | 真 `settings.section` + 自绘图标 + 14 行开关，见 `replication-toggles.md` |
| 原子组件 | **🟡 部分** | 附件卡、脚注、折叠体例、状态点、同心圆角、弹簧已做；**CdsButton 的 5×7 变体矩阵、ConfirmationDialog 进出场、分段控件滑动**未做（分段控件用户否决） |
| 会话流组件 | **🟡 部分** | 气泡/代码块/思考区/滚动渐隐/悬停操作栏/表格/引用节奏已做；工具三态授权卡、MCP 决策卡未做 |
| 动效与物理 | **❌ 未核实** | 已用 6 条曲线（snap/pulse/swift/rise/fall/btn-spring）+ 呼吸动画；参考的 `ReasoningAmbientGlow` 环境光晕与着色器背景**无宿主挂点**，其余动效是否"吸收"我无法从代码判定 —— 标 **未核实** 而不是编一个百分比 |
| 视听/多媒体/协作类 | **🚫 不适用** | 媒体灯箱、音频可视化、iframe 桥、协作拓扑：宿主**没有对应组件**，不是钩子问题。硬做等于自己造一个新产品 |

未吸收的部分绝大多数的原因没变：**DSH 是另一套组件树，参考里的组件级实现没有对应钩子**。硬做只能命中盐化类，宿主升级即碎——所以选择"记账、不做"。第二波可做的项见 `docs/reference-next-wave.md`，并且那一波**已经做完**。

---

## 5. 维护方式

- 本文档随每次交付更新状态；**无法从代码判断的一律写「未核实」，不编百分比**。
- 由 `docs/replication-toggles.md` 约束交付方式：**一项一项做，每项自带开关，验完可删**。该约定现在由 `tools/audit.mjs` 的 `switches` 检查机械执行。
- 宿主每次升级后，可拿第 3 节的清单与 `docs/reference-next-wave.md` 去核对"哪些现在能做了"。
- **第 3 节的原文已被证伪一部分**，以上方说明为准；保留原文是为了让后来者看到"当时为什么判断错了"。

