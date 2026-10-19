# 参考仓库下一波可借鉴项 · Next-wave absorption assessment

写于第一层（令牌 + 排版 + 基础表面）交付并验收之后。**本文件回答一个问题：剩下 1.2 MB 参考仓库里，还有哪些值得做、且宿主现在真的给了钩子。**

口径不变：能不能做，只看宿主有没有**稳定钩子**（`data-*`、公开字面量类、令牌）。凡必须命中盐化 CSS-Modules 类的，一律记"不可达"，不硬做。

---

## 0. 结论先说

第一层之后，"可借鉴"的剩余项比台账（`reference-absorption-ledger.md`）记录的**多**：那份台账写在更早，其中若干项被标为 ❌/🚫 是因为当时以为没有钩子；重新对着**已安装宿主**的 bundle 逐个核对后，**有 9 项其实可达**。

排成三档：

| 档 | 内容 | 为什么值得 |
|---|---|---|
| **A. 立即能做，纯 CSS，风险最低** | 分段控件滑动 thumb、附件卡、脚注、状态点呼吸、同心圆角、15 阶弹簧 | 全有 `data-*` 钩子，只改样式表，不碰行为 |
| **B. 有钩子但要写组件** | composer 占位符排版、统计 pill / 用量弹层的数字排版、队列 dock、thinking 折叠区、Tag/Pill | 需要小的行内组件或较多规则，收益中等 |
| **C. 确认不可达，别再试** | 发送按钮、时间戳、模型微标、快捷键键帽、代码行号、会话顶栏标题 | 宿主硬编码在盐化类里，升级即碎 |

---

## 1. 新确认可达的 9 项（含证据）

下面每条都是我在**已安装 app.asar** 里亲自 grep 到的，不是从文档抄的。

### 1.1 分段控件滑动 thumb —— 参考 `SegmentedControl.tsx` ✅ 可达
```js
// ui-conversation client.js，会话顶部的 Chat / Trajectory 切换
"data-conversation-tabs": "",  role: "tablist"
  → button role="tab" aria-selected={...}
```
参考实现：9999px 胶囊轨道、2px 几何内边距、`layoutId` 滑动指示块。
我们只做 CSS 部分：给选中态 thumb 一个 `transform` 过渡，用 `--cds-ease-snap`。
**注意**：真·共享元素滑动需要量测 DOM 位置，纯 CSS 只能做"淡入 + 位移"，够用。

### 1.2 附件卡 —— 参考 `AttachmentCard.tsx` ✅ 可达
```js
"data-message-attachments": true       // 用户消息的附件行
  → span.fileCard > FileTypeIcon + 文件名 + 大小
```
参考实现：10px 面板圆角、桌面卡片网格 128×96、composer 内联 pill 双形态。
**这是台账里标 ❌ 的一项，现在能做**，且是你日常最常看到的界面元素之一。

### 1.3 脚注区 —— 参考 01 篇的脚注规格 ✅ 可达
```js
"data-footnotes"                       // web-frontend-index.js
```
规格：12/18 正文、`.5px` 上发丝线、上标编号、tertiary 色。纯 CSS。

### 1.4 状态点呼吸 —— 参考 `StatusIndicators.tsx` ✅ 可达
```js
"data-chat-running"                    // chat.js，运行中指示行
```
参考：2.4s 陶土呼吸、1.2s 运行脉冲、三点波。
`--cds-ease-pulse` 已在令牌里。需尊重 `prefers-reduced-motion`。

### 1.5 同心圆角 —— 参考 02 篇「外圆角 = 内圆角 + padding」✅ 可达
```js
"data-composer-card" / "data-menu-material"   // 已知的两个闭合容器
```
`border-radius: calc(var(--dsw-radius-md) + <padding>)`，不动 padding 本身。

### 1.6 15 阶弹簧 —— 参考 `cds-theme.css` 的 `linear(...)` ✅ 可达
按钮按压过渡用 15-stop `linear()` 曲线替掉 `cubic-bezier`。
**范围限制**：宿主 markdown 里的按钮是盐化类，只能用在**我们自己的控件**和宿主暴露了 `data-*` 的按钮上（设置行、菜单项）。

### 1.7 统计 pill / 用量弹层 —— 参考 `ModelSwitcherWithTokenGauge.tsx` 🟡 部分可达
```js
"data-composer-stat"          x2   // composer 底部的统计 pill
"data-session-stats-details"       // 统计弹层 <dl>
"data-turn-usage-details"          // 单回合用量弹层 <dl>
```
参考实现是"四色记忆 SVG 仪表"——**仪表本身做不了**（宿主没有对应的 SVG 挂点），但**数字排版能做**：`tabular-nums`、单位与数值的字号阶梯、`<dt>/<dd>` 的行距与对齐。这是"观感提升"里性价比很高的一项，因为用量数字就在你眼前。

### 1.8 composer 占位符 —— 参考 `ChatComposer.tsx` 🟡 可达
```js
"data-composer-placeholder"        // 占位符 div
"data-placeholder"                 // 输入根，值 = 文案
```
台账第 3 节把"消息输入框与占位符"列为不可达——**占位符其实可达**，只是真正的 `div[contenteditable]` 文本面不可达（那是 Lexical 自己的渲染）。所以能做占位符的颜色/字号，做不了输入文本本身（那部分走排版令牌已覆盖）。

### 1.9 队列 dock + disclosure 行 —— 参考 `ThinkingAccordion.tsx` / 02 篇折叠体例 🟡 可达
```js
"data-queue-dock"                  // 排队消息面板外层
"data-disclosure-header" / "-row" / "-expandable" / "-open" / "-has-accessory"   // 通用折叠组件
"data-tone"                        // Tag / Pill，值 = tone
```
`data-disclosure-*` 是宿主**对所有折叠控件**统一暴露的一组钩子，一处改、处处生效——比我原先按组件逐个改更划算。

---

## 2. 确认仍不可达（别浪费工时）

| 元素 | 为什么 |
|---|---|
| 发送按钮 | 盐化类，无 `data-*`；只能是令牌层的颜色/圆角间接影响 |
| 消息时间戳 | 同上 |
| 模型版本微标 | 同上 |
| 快捷键键帽 `kbd` | 同上（`--cds-font-size-*` 也够不到） |
| 代码块行号 | 宿主只在 `numbered` 变体挂 `data-line-numbers`，聊天里的 markdown 从不渲染它们 |
| 会话顶栏标题 | 盐化类 |
| 助手身份名称 | DSH 无此元素 |
| 四色 token 仪表 SVG | 无挂点 |
| 媒体灯箱 / 音频可视化 / iframe 桥 | 宿主根本没有对应组件（不是钩子问题，是元素不存在） |

---

## 3. 参考仓库里"不是照着做"的部分

### 04 篇 动效物理学 —— 再读一遍的实际结论
除了已经用的 3 条曲线（snap / pulse / swift），剩下可用的只有：
- 另外 4 条缓动曲线 → **建议只加进令牌表**（`--cds-ease-*`），不要为它们找地方用；
- `ReasoningAmbientGlow` 环境光晕 → **做不了**（需要宿主的 canvas/着色器挂点，没有）；
- 阴影/模糊参数 → 已在第一层吸收。

### 05 / 06 篇 —— 结论：跳过
05 是媒体系（灯箱、音频、分栏拖拽），06 是桌面外壳（窗口、协作拓扑）。宿主里没有对应组件，硬做的唯一方式是**自己造一个完整功能**——那是新产品，不是"复刻参考"。
`ClaudeDesktopHeader.tsx` 已经试过又删除（shadow root + 100% 缩放下发丝线不可见），结论仍然成立。

### 08 篇 —— 是给 Agent 的规范文件，不是 UI 规格
读完 208 行：全是"Agent 应该遵守什么"（令牌引用契约、四条弹簧决策树、单闭合边框、IME 守卫、质量门禁）。**没有新的界面规格**，但它确认了两条我们已经遵守的纪律（单闭合边框、禁 linear 动画），并给出了一份**自检清单**——这个可以用来补 `tools/audit.mjs` 的检查项。

---

## 4. 建议的执行顺序

按"用户能立刻看到 / 成本"排序：

1. **附件卡 + 分段控件 thumb**（A 档，最显眼，都是纯 CSS）
2. **脚注 + 状态点呼吸 + 同心圆角 + 弹簧**（A 档，一次交付四项）
3. **用量数字排版**（B 档，`tabular-nums` + `<dl>` 阶梯，天天看得到）
4. **`data-disclosure-*` 统一折叠体例**（B 档，一处改处处生效）
5. 剩下的（队列 dock、Tag/Pill、占位符）视情况。

**不做**：05/06 全部、四色仪表、灯箱、音频、iframe 桥。

---

## 5. 这份评估的局限

- 钩子是我在**当前这版**宿主（`app.asar` 2026-10-18）里 grep 到的，宿主升级后可能变——`docs/host-hooks.md` 是同一批证据的长期台账，以它为准。
- "可达"只代表**选择器能命中**，不代表能做出参考实现 100% 的效果：参考里有相当一部分是 React 组件行为（拖拽、手势、共享元素过渡），那些宿主不给我们实现位置。
- 上面 A 档六项的**参考数值**还没逐个取证，动手前仍要按 `docs/cds-spec.md` 的口径补 citation。
