# CDS 权威规范 (Claude Design System — Authoritative Spec)

> 用途：DeepSeek Harness Web UI 主题插件的**唯一实现依据**。
> 来源仓库：`.reference/open-claude-ui`（clean-room 逆向，目标 `@ant/desktop v2.37337.1`）。
> 所有数值均可追溯到 `文件:行号`。**禁止臆造**：仓库内确实不存在的写 `未定义`，并给出最近的已记录值。

## 0. 取证优先级与阅读约定

当多处来源冲突时，按以下优先级裁定（本文件已按此顺序取值，冲突处另行标注 ⚠️ 并给出裁定理由）：

| 优先级 | 来源 | 性质 |
| :--- | :--- | :--- |
| **P0** | `code-examples/cds-theme.css` | 唯一真实令牌表（789 行），实际 CSS 值 |
| **P1** | `code-examples/ClaudeMotionPresets.ts`、`code-examples/tailwind.config.js` | 可 import 的代码常量 / 令牌到类的映射 |
| **P2** | `docs/v1/01-设计哲学与设计令牌体系.md`、`docs/v1/02-基础原子组件与交互控件.md`、`docs/v2/03`、`docs/v2/04` | 带 REA 取证说明的规范化文档 |
| **P3** | `AGENTS.md` | Agent 面向速查表（**存在多处与 P0 不一致的数值**） |
| **P4** | `docs/claude-components-storybook.html` | 交互演示页，仅用于澄清语义，不作为取值依据 |

**行号简写**：
`css:N` = `.reference/open-claude-ui/code-examples/cds-theme.css:N`
`tw:N` = `.reference/open-claude-ui/code-examples/tailwind.config.js:N`
`motion:N` = `.reference/open-claude-ui/code-examples/ClaudeMotionPresets.ts:N`
`agents:N` = `.reference/open-claude-ui/AGENTS.md:N`
`v1-01:N` = `.reference/open-claude-ui/docs/v1/01-设计哲学与设计令牌体系.md:N`
`v1-02:N` = `.reference/open-claude-ui/docs/v1/02-基础原子组件与交互控件.md:N`
`v2-02:N` = `.reference/open-claude-ui/docs/v2/02-新增特性深度逆向.md:N`
`v2-03:N` = `.reference/open-claude-ui/docs/v2/03-架构重构与对比分析.md:N`
`v2-04:N` = `.reference/open-claude-ui/docs/v2/04-系统底座全景解密.md:N`
`sbook:N` = `.reference/open-claude-ui/docs/claude-components-storybook.html:N`
组件实现：`CdsButton.tsx:N`、`ChatComposer.tsx:N`、`CodeBlock.tsx:N`、`SegmentedControl.tsx:N`、`StatusIndicators.tsx:N`、`AttachmentCard.tsx:N`、`ConfirmationDialog.tsx:N`、`ChatMessageBubbles.tsx:N`、`McpToolDecisionCard.tsx:N`、`ChatComposerChin.tsx:N`、`ModelSelectorEffort.tsx:N`（均在 `code-examples/` 下）

---

## 1. 色彩阶梯 (Color Ramps)

两套阶梯均定义在 `:root` 中，**不随明暗模式重载**（`css:16-87`）。因此同一 hex 在 light/dark 下含义相同，切换模式靠语义令牌重新绑定（§2），而不是改阶梯。

### 1.1 灰度阶梯 `--cds-gray-*`（35 阶，`css:16-50`）

| Step | Hex | Step | Hex | Step | Hex |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `0` | `#fff` | `150` | `#d2d1c7` | `450` | `#7b7974` |
| `10` | `#fcfcfb` | `200` | `#c3c2b7` | `500` | `#6d6b67` |
| `20` | `#f9f9f7` | `250` | `#b4b3a8` | `550` | `#5f5e5a` |
| `30` | `#f6f6f4` | `300` | `#a5a49a` | `600` | `#52514e` |
| `40` | `#f3f3f0` | `350` | `#97958d` | `650` | `#454442` |
| `50` | `#f0efec` | `400` | `#898781` | `700` | `#383835` |
| `60` | `#edece8` | | | `750` | `#2c2c2a` |
| `70` | `#eae9e4` | | | `800` | `#20201f` |
| `80` | `#e7e6e1` | | | `810` | `#1e1e1d` |
| `90` | `#e4e3dd` | | | `820` | `#1c1c1b` |
| `100` | `#e1e0d9` | | | `830` | `#1a1a19` |
| | | | | `840` | `#181817` |
| | | | | `850` | `#151515` |
| | | | | `860` | `#131313` |
| | | | | `870` | `#111111` |
| | | | | `880` | `#0f0f0f` |
| | | | | `890` | `#0d0d0d` |
| | | | | `900` | `#0b0b0b` |

**暗部等距步进律（OLED Anti-Banding）**：`800 → 900` 绝大多数台阶下沉 2 个 HEX 单位（`#20201f → #1e1e1d → #1c1c1b → #1a1a19 → #181817 → #151515 → #131313 → #111111 → #0f0f0f → #0d0d0d → #0b0b0b`），用于消除 OLED 灰阶断层（`v1-01:59-63`）。⚠️ **例外**：`gray-840 #181817 → gray-850 #151515` 是 **3** 个单位，不是 2；"每阶都是 2"不成立。主题重算暗色层级时按实际 ramp 取值，不要假设严格的 2 单位。

阶梯整体是**暖调**（每个 step 都带轻微黄绿偏移，如 `#fcfcfb`、`#1a1a19`）。但语义文本令牌却是**冷中性灰**（`#151515`/`#525252`/`#8a8a8a`，`css:139-141`），不在阶梯上 —— 这是有意为之：正文用中性灰保证代码语法高亮的色相纯净，表面用暖灰提供编辑质感（`v2-03:66-73`）。

### 1.2 陶土/橙色阶梯 `--cds-orange-*`（35 阶，`css:53-87`）

| Step | Hex | Step | Hex | Step | Hex |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `0` | `#fff` | `150` | `#f3c5b2` | `450` | `#c25124` |
| `10` | `#fefbfa` | `200` | `#f4ae94` | `500` | `#ae461c` |
| `20` | `#fdf7f5` | `250` | `#f09978` | `550` | `#993d19` |
| `30` | `#fcf4f0` | `300` | `#ec835a` | `600` | `#863311` |
| `40` | `#faf0ec` | `350` | `#eb6834` | `650` | `#712b0f` |
| `50` | `#f9ece7` | `400` | `#d95926` | `700` | `#5d230b` |
| `60` | `#f8e9e2` | | | `750` | `#4b1b08` |
| `70` | `#f7e5dd` | | | `800` | `#371407` |
| `80` | `#f7e1d7` | | | `810` | `#341307` |
| `90` | `#f7dcd1` | | | `820` | `#301106` |
| `100` | `#f7d8cb` | | | `830` | `#2d1006` |
| | | | | `840` | `#290f06` |
| | | | | `850` | `#240e07` |
| | | | | `860` | `#1f0e08` |
| | | | | `870` | `#1a0e09` |
| | | | | `880` | `#150d0a` |
| | | | | `890` | `#100c0b` |
| | | | | `900` | `#0b0b0b` |

⚠️ **关键事实**：品牌色 `#d97757` **不在这条 35 阶 ramp 上**。它位于 `orange-300 (#ec835a)` 与 `orange-350 (#eb6834)` 之间的明度带，但饱和度明显更低（更"陶土"、更少"橙"）。`--brand: #c6613f` 同样不在 ramp 上。**不要用 ramp 的 `orange-*` 去替代品牌色**，二者色相不同（`css:10-13`）。

### 1.3 品牌与辅助色（不随 ramp，独立定义）

| 令牌 | Light | Dark | 出处 |
| :--- | :--- | :--- | :--- |
| `--brand` | `#c6613f` | `#c6613f`（未重载） | `css:10`；dark 块 `css:284-369` 未覆盖 |
| `--cds-clay` | `#d97757` | `#d97757` | `css:11`；`css:292` |
| `--cds-clay-hover` | `#cc5a36` | `#e08264` | `css:12`；`css:293` |
| `--cds-clay-light` | `#fbf3ef` | 未重载（见 §2.4） | `css:13` |
| `--cds-bg-tint-blue` | `#f0f4f8` | `rgba(255,255,255,0.06)` | `css:142`；`css:351` |
| `--cds-fill-danger` | `#ef4444` | `#f87171` | `css:248`；`css:367` |
| `--cds-segmented-track` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.08)` | `css:143`；`css:352` |
| `--cds-segmented-thumb` | `#ffffff` | `#2c2c2a` | `css:144`；`css:353` |

⚠️ **暗色 clay 不减淡反增亮**：dark 下 `--cds-clay` 仍为 `#d97757`，`--cds-clay-hover` 变为 **更亮**的 `#e08264`（`css:292-293`）——这是暗底上的"悬停提亮"逻辑，与浅色模式的"悬停加深"（`#cc5a36`）方向相反。**实现 hover 时不能只写一个 `filter: brightness()`**，必须按模式取不同值。

**实现裁定（Harness Web UI，2026-10-21）— 实色填充的 hover 在两种模式下都加深。** 参考本身把提亮规则用在**带白字的 fill** 上（`css:246/310` 的 `--cds-fill-brand-hover` 被 `CdsButton.tsx:60-61` 的 `brand` 变体直接使用），所以这不是"accent 专属"规则。白字在提亮后的暗色 fill 上对比度不足：白字在 `#e08264` 上只有 **2.78:1**（不是旧稿写的 3.96:1；3.96 属于 `#c56445` 一档），远低于 AA。因此 `fill` 与 `accent` 在这里有意分叉：hover 用 `mix(fill, #000, 10%)`，ring / border / 呼吸灯仍按 CDS 提亮。见 §9.3 D6。

---

## 2. 语义令牌表 (Semantic Tokens)

所有语义令牌通过 `var()` 间接绑定到阶梯，切换模式只重绑语义层。

### 2.1 表面分层 (Surface Layering)

| Token | Light | Dark | 绑定（Light / Dark） | 用途 | 出处 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--cds-surface-0` | `#f9f9f7` | `#0b0b0b` | `gray-20` / `gray-900` | 最底层 canvas、侧边栏底色 | `css:90`；`css:285` |
| `--cds-surface-1` | `#fcfcfb` | `#151515` | `gray-10` / `gray-850` | 页面主画布（主会话区） | `css:91`；`css:286` |
| `--cds-surface-2` | `#ffffff` | `#1a1a19` | `gray-0` / `gray-830` | 消息卡片、独立面板 | `css:92`；`css:287` |
| `--cds-surface-3` | `#ffffff` | `#20201f` | `gray-0` / `gray-800` | 输入框容器、高层浮层 | `css:93`；`css:288` |
| `--cds-surface-popover` | `#ffffff` | `#2c2c2a` | `gray-0` / `gray-750` | Popover / 下拉菜单表面 | `css:94`；`css:289` |
| `--cds-bg-input` | **未定义** | **未定义** | — | 输入框底色 | 仅 `agents:41` |

**方向律（必须记住）**：浅色模式下 `surface-0` 是**最暗**的（`#f9f9f7`），`surface-2/3` 是**纯白**——层级越高越亮；暗色模式**方向相同**（`surface-0` 最暗 `#0b0b0b`，越往上越亮直到 `popover #2c2c2a`），只是每阶的差值更大（浅色约 2–4 个 HEX 单位，暗色 5–12 个）。两种模式都是"数值越大越靠近观察者"（`v1-01:47-52`）；旧稿写"暗色正好相反"是错的。

**实现裁定（Harness Web UI，2026-10-21）— 暗色地板与参考一致。** 主题的暗色 surface-0（sidebar）用 `#0b0b0b`，surface-1（主会话画布）用 `#151515`，随后沿参考阶梯 `#1a1a19 → #20201f → #2c2c2a`（各阶 R 差为 5/6/12，不是 2）。此前一版把地板抬到 `#151515`（sidebar `#121211`）以减轻近黑工作区的沉重感；用户选择优先还原参考，已回退。`warmth: 0` 时仍回落宿主原色，便于对照。

⚠️ **冲突 C1 — Surface 取值**：`agents:37-41` 给出的是**另一套数值且方向相反**：

| Token | AGENTS.md | cds-theme.css | 是否在 35 阶 ramp 上 |
| :--- | :--- | :--- | :--- |
| `--cds-bg-surface-0` | `#fcfcfb` / `#1b1b19` | `#f9f9f7` / `#0b0b0b` | `#fcfcfb` = `gray-10`（但 CSS 里它是 surface-1）；`#1b1b19` 不在 ramp |
| `--cds-bg-surface-1` | `#fbfbfa` / `#21211e` | `#fcfcfb` / `#151515` | 两者均不在 ramp |
| `--cds-bg-surface-2` | `#f7f7f5` / `#282824` | `#ffffff` / `#1a1a19` | 两者均不在 ramp |
| `--cds-bg-surface-3` | `#efeee9` / `#32322d` | `#ffffff` / `#20201f` | 两者均不在 ramp |
| `--cds-bg-input` | `#fdfdfc` / `#1e1e1b` | 不存在 | 两者均不在 ramp |

**裁定：采用 `cds-theme.css`（P0）**。理由三条：
1. AGENTS 的 10 个值中有 9 个无法在 35 阶 ramp 中找到对应项，说明它们来自更早的调色板（近似 v1.0 暖羊皮纸期），与 v2.0「冷雪花白 + 石墨黑」的官方演进结论（`v2-03:66-73`）直接矛盾；
2. AGENTS 的层级方向是「索引越大越暗」，与 CSS 相反，若照抄会导致整个 surface 栈反向；
3. `v1-01:47-52` 与 `css:90-94` 完全一致（`#f9f9f7`/`#fcfcfb`/`#ffffff`/`#ffffff`；暗色 `#0b0b0b`/`#151515`/`#1a1a19`/`#20201f`），二比一。
另：`--cds-bg-input` 在 CSS 中确实不存在，**最近文档值是 `--cds-surface-3`**（输入框容器语义，`css:93`），Harness 主题请直接用 `surface-3`，不要新增 input 令牌。

⚠️ **冲突 C2 — popover 暗色**：`css:289` 为 `#2c2c2a`（`gray-750`），但 `ChatComposer.tsx:169,208` 的菜单实写 `dark:bg-[#222220]`，`sbook:174` 也是 `#222220`。`#222220` **不在 ramp 上**。**裁定：用 `#2c2c2a`**（P0），`#222220` 视为组件实现的近似偏差。

### 2.2 文本 (Text)

| Token | Light | Dark | 用途 | 出处 |
| :--- | :--- | :--- | :--- | :--- |
| `--cds-text-primary` | `#151515` | `#f5f5f5` | 标题、正文、激活标签 | `css:139`；`css:348` |
| `--cds-text-secondary` | `#525252` | `#a3a3a3` | 时间戳、副标题、次级动作 | `css:140`；`css:349` |
| `--cds-text-muted` | `#8a8a8a` | `#666666` | 占位符、禁用、弱提示 | `css:141`；`css:350` |
| `--cds-text-tertiary` | **未定义** | **未定义** | 占位符/禁用/快捷键提示 | 仅 `agents:48` |
| `--cds-text-accent` | `var(--cds-clay)` = `#d97757` | 同 | 品牌色文本 | `css:249`；`css:368` |

**`--cds-text-tertiary` 在 `cds-theme.css` 中不存在**（全文仅 `agents:48` 提及）。CSS 里与之同位的是 `--cds-text-muted`。**裁定：用 `--cds-text-muted`（`#8a8a8a`/`#666666`）作为 tertiary 语义的实现值**，不要新增第三个文本层级 —— 否则会出现 secondary 与 tertiary 之间 0.5 级灰的伪层级。

⚠️ **冲突 C3 — 文本取值**：`agents:46-48` 给的是暖灰且与 ramp 只差 1~3 个单位：

| Token | AGENTS.md | cds-theme.css | 最近的 ramp 项（不相等） |
| :--- | :--- | :--- | :--- |
| primary | `#1f1e1d` / `#eeede8` | `#151515` / `#f5f5f5` | `gray-810 #1e1e1d`；`gray-60 #edece8` |
| secondary | `#6b6966` / `#b4b2ac` | `#525252` / `#a3a3a3` | `gray-500 #6d6b67`；`gray-250 #b4b3a8` |
| tertiary/muted | `#999793` / `#7d7b76` | `#8a8a8a` / `#666666` | `gray-350 #97958d`；`gray-450 #7b7974` |

**裁定：采用 `cds-theme.css`**。AGENTS 的文本色是**暖灰**（带黄绿偏移），CSS 的是**纯中性灰**。正文用中性灰是 CDS 的明确设计决策（`v2-03:72`：暖底会与语法高亮冷色混色导致"发脏发糊"）。Harness 主题若要贴合代码密集场景，必须走中性灰。
**注意**：`#151515` 恰好 = `gray-850`（`css:45`），这是文本色中唯一落在 ramp 上的值；`#525252`、`#8a8a8a`、`#f5f5f5`、`#a3a3a3`、`#666666` 均**不在 ramp 上**（纯中性，`css:139-141`、`css:348-350`）。

**实现裁定（Harness Web UI，2026-10-21）— muted 比参考深一档。** 参考的 `#8a8a8a` 在 `#ffffff` 上是 3.45:1，暗色 `#666666` 在 `#1a1a19` 上只有 **3.03:1**（旧稿的 4.12:1 是 AGENTS 的 `#7d7b76`，两张表被混用了）。占位符与设置项描述都是正文尺寸，需要 4.5:1。主题落成 `#767676` / `#85837e`（4.54:1 / 4.60:1），这是**唯一有意偏离参考的文本颜色**；primary / secondary 未改。证据：`client/src/palette.js` 的 `LIGHT_TEXT` / `DARK_TEXT` 注释，以及 §9.3 的 D2。

### 2.3 边框 (Borders)

Alpha 阶梯是全部边框的唯一来源（`css:97-105`；dark `css:302-319`）：

| Token | Light | Dark | 出处 |
| :--- | :--- | :--- | :--- |
| `--cds-alpha-0` | `hsla(0, 0%, 8%, 0)` | `hsla(0, 0%, 100%, 0)` | `css:97`；`css:302` |
| `--cds-alpha-1` | `hsla(0, 0%, 8%, 0.05)` | `hsla(0, 0%, 100%, 0.05)` | `css:98`；`css:303` |
| `--cds-alpha-2` | `hsla(0, 0%, 8%, 0.10)` | `hsla(0, 0%, 100%, 0.09)` | `css:99`；`css:304` |
| `--cds-alpha-3` | `hsla(0, 0%, 8%, 0.20)` | `hsla(0, 0%, 100%, 0.18)` | `css:100`；`css:305` |
| `--cds-alpha-4` | `hsla(0, 0%, 8%, 0.35)` | `hsla(0, 0%, 100%, 0.30)` | `css:101`；`css:306` |
| `--cds-border` | `= alpha-2` | `= alpha-2` | `css:103`；`css:318` |
| `--cds-border-strong` | `= alpha-3` | `= alpha-3` | `css:104`；`css:319` |
| `--cds-border-subtle` | `= alpha-2` | `= alpha-2` | `css:243`；`css:362` |
| `--cds-border-accent` | `= var(--cds-clay)` | 同 | `css:244`；`css:363` |
| `--cds-border-card` | **未定义** | **未定义** | 仅 `agents:50` |
| `--cds-ring-hairline` | `1px` → `0.5px`(@2x) → `calc(1px/3)`(@3x) | 同 | `css:105`、`css:270-279` |

**注意 `hsla(0,0%,8%,…)` ≠ `rgba(0,0,0,…)`**：`0%` 饱和度 `8%` 明度 = `#141414`（8% × 255 ≈ 20.4）。因此 `hsla(0,0%,8%,0.10)` 叠加在 `#ffffff` 上得 `≈#e8e8e8`，而 `rgba(0,0,0,0.10)` 得 `≈#e6e6e6` —— 前者**浅 2 个 HEX 单位**。这是有意的"软化"手法（避免纯黑半透明叠加产生的"脏灰"），实现时**不要**改写成 `rgba(0,0,0,0.1)`。

⚠️ **冲突 C4 — 边框透明度**：`agents:49-50` 给 `border-subtle: rgba(0,0,0,0.06)/rgba(255,255,255,0.08)`、`border-card: rgba(0,0,0,0.08)/rgba(255,255,255,0.12)`。CSS 只有 `0.10/0.09`（`border`）与 `0.20/0.18`（`border-strong`）。`0.06`、`0.08`、`0.12` **在 CSS 中均不存在**。**裁定：用 `--cds-border`(alpha-2) 实现 subtle/card 两种语义**（CSS 把二者合并了：`--cds-border-subtle: var(--cds-alpha-2)`，`css:243`），需要更强时才用 `border-strong`。理由：AGENTS 的 0.06 与 0.08 之间只差 2%，肉眼不可分辨，却会让实现出现两个几乎相同的令牌 —— 这正是"边界防臃肿"要消除的伪层级。

### 2.4 品牌陶土 (Brand Clay)

| Token | Light | Dark | 出处 |
| :--- | :--- | :--- | :--- |
| `--brand` | `#c6613f` | `#c6613f` | `css:10`（未在 dark 重载） |
| `--cds-clay` | `#d97757` | `#d97757` | `css:11`；`css:292` |
| `--cds-clay-hover` | `#cc5a36` | `#e08264` | `css:12`；`css:293` |
| `--cds-clay-light` | `#fbf3ef` | 未重载 | `css:13` |
| `--cds-fill-brand` | `= var(--brand)` = `#c6613f` | 同 | `css:245`；`css:364` |
| `--cds-fill-brand-hover` | `= var(--cds-clay-hover)` = `#cc5a36` | `#e08264` | `css:246`；`css:365` |
| `--cds-fill-brand-subtle` | `= var(--cds-clay-light)` = `#fbf3ef` | `rgba(217,119,87,0.15)` | `css:247`；`css:366` |
| `--cds-border-accent` / `--cds-text-accent` | `#d97757` | `#d97757` | `css:244,228`；`css:363,313` |

**双轨制（必须区分）**：
- `--brand: #c6613f` —— **官方桌面端主品牌色**，用于「品牌/主 CTA 实色填充」（`CdsButton.tsx:61` 的 `brand` 变体：`bg-[var(--brand,#c6613f)] hover:bg-clay-hover`）。
- `--cds-clay: #d97757` —— **经典陶土橙**，用于「强调/状态/微标/呼吸灯/焦点环」（`css:502-513` 的 status-dot、`css:130` 焦点环、`css:604` 思考三点）。
二者**不可互换**：`#c6613f` 更深更沉（用于大面积实色），`#d97757` 更亮更暖（用于小面积强调与发光）。

⚠️ **冲突 C5 — Clay 三级阶梯**：`agents:53-55` 定义 `clay-500/600/700` 为：
- `clay-500`: `#d97757` / `#cc6b49`
- `clay-600`: `#c56445` / `#e07a58`
- `clay-700`: `#b2563a` / `#b55a3d`

而 `css:11-12` + `tw:14-17` 只有 `clay.DEFAULT #d97757`、`clay.hover #cc5a36`、`clay.light #fbf3ef`、`clay.dark #e08264`。**AGENTS 的 `clay-600`/`clay-700` 在仓库任何文件中都不存在**，暗色 `#cc6b49`、`#e07a58`、`#b55a3d` 也均无对应。

**裁定：采用 CSS 的 4 值体系（`clay` / `clay-hover` / `clay-light` / `clay-dark`），并补上 `--brand` 作为第 5 值。** 理由：
1. `tw:13-18` 是唯一的"令牌 → 类名"权威映射，它只暴露 4 个 clay 键；
2. AGENTS 的暗色 `clay-500 #cc6b49` 比浅色 `#d97757` **更暗**，而 CSS 暗色保持 `#d97757` 不变、只提亮 hover —— AGENTS 的暗色方向与 CSS 相反；
3. 若按 AGENTS 实现 `clay-600/700` 的 hover/active 阶梯，会与 `--cds-clay-hover` 在浅色下冲突（`#c56445` vs `#cc5a36`，肉眼可辨的色差）。

**实现建议**：主 CTA 用 `--brand`，hover 用 `--cds-clay-hover`，active 用「`--cds-clay-hover` + `filter: brightness(0.92)`」或直接复用 `#b2563a`（AGENTS 唯一有价值的部分：它是 `--brand` 的合理 active 深色，因为 `#c6613f → #b2563a` 是自然的同色相下沉）。

### 2.5 状态色 (State Colors)

CDS **没有** success / warning 语义令牌。全仓库只有 danger 一个真实状态令牌，其余状态色均以 Tailwind 调色板类名硬编码在组件里。

| 状态 | Token | Light | Dark | 出处 |
| :--- | :--- | :--- | :--- | :--- |
| **error / danger** | `--cds-fill-danger` | `#ef4444` | `#f87171` | `css:248`；`css:367` |
| **success** | **未定义** | 未定义 | 未定义 | — |
| **warn** | **未定义** | 未定义 | 未定义 | — |
| **idle** | **未定义** | 未定义 | 未定义 | — |

**success 的最近已记录值**：组件统一使用 Tailwind `emerald` 系 —— `emerald-500`（`AttachmentCard.tsx:76`、`ThinkingAccordion.tsx:110`）、`emerald-600 dark:emerald-400`（`McpToolDecisionCard.tsx:123`）、`emerald-400`（`CodeBlock.tsx:73`、深底上使用）。这些是 **Tailwind 类名，hex 值不在本仓库任何文件中**（`#10b981` 等属 Tailwind v3 默认调色板，非 CDS 令牌）。**实现时必须自建 `--cds-fill-success`，建议取 `emerald-500 #10b981` 的浅色版 + `emerald-400` 的暗色版**，并在文档中标注为"CDS 未定义，本项目扩展"。

**warn 的最近已记录值**：`amber` 系 —— `ChatComposerChin.tsx:26`（`bg-amber-50 text-amber-800 border-amber-200`，离线队列横幅）、`ChatComposerChin.tsx:29`（`bg-amber-500` 点）、`ModelSelectorEffort.tsx:100`（`text-amber-700 bg-amber-50 border-amber-200`）、`CoworkAgentCanvas.tsx:167`（`text-amber-500` 表示 idle）。同样只有类名无 hex。

**idle 的最近已记录值**：`.status-dot` 的 4 个 kind 中**没有 `idle`**（`css:501-514`：`ready` / `running` / `error` / `clay`）。`ready` 与 `running` 都用 `--cds-fill-brand`。因此 idle 的最近文档值是 `--cds-text-muted`（`#8a8a8a` / `#666666`）或 `--cds-alpha-2` 的灰点。`CoworkAgentCanvas.tsx:167` 用 `text-amber-500` 表示 `idle` —— 这是**局部约定，与 CDS 令牌体系无关**，不要照抄。

**状态灯权威实现**（`css:494-514`，逐字）：

```css
.status-dot { width: 6px; height: 6px; border-radius: 50%; display: block; position: relative; }
.status-dot[data-kind="ready"]   { background: var(--cds-fill-brand, var(--cds-clay)); }
.status-dot[data-kind="running"] { background: var(--cds-fill-brand, var(--cds-clay)); animation: 1.2s ease-in-out infinite dframe-dot-blink; }
.status-dot[data-kind="error"]   { background: var(--cds-fill-danger); }
.status-dot[data-kind="clay"]    { background: var(--cds-clay); animation: 3s ease-in-out infinite dframe-clay-breathe; }
```

注意 `ready`/`running` 用的是 **`--cds-fill-brand`（`#c6613f`）而非 `--cds-clay`**，`clay` kind 才用 `--cds-clay`（`#d97757`）。这两个 hex 差 10% 明度，在 6px 圆点上仍可辨。

### 2.6 交互填充 (Fills)

| Token | Light | Dark | 用途 | 出处 |
| :--- | :--- | :--- | :--- | :--- |
| `--cds-fill-ghost-hover` | `hsla(0,0%,8%,0.05)` | `hsla(0,0%,100%,0.05)` | Ghost 按钮 hover 底衬 | `css:134`；`css:343` |
| `--cds-fill-ghost-selected` | `hsla(0,0%,8%,0.10)` | `hsla(0,0%,100%,0.09)` | Ghost 按下 / 选中 | `css:135`；`css:344` |
| `--cds-fill-secondary` | `hsla(0,0%,8%,0.10)` | `hsla(0,0%,100%,0.09)` | Secondary 按钮底衬 | `css:136`；`css:345` |
| `--cds-fill-secondary-hover` | `rgba(21,21,21,0.14)` | `rgba(255,255,255,0.14)` | Secondary 按钮 hover | `css:137`；`css:346` |
| `--cds-bg-hover` | `= fill-ghost-hover` | 同 | 别名 | `css:241`；`css:360` |
| `--cds-bg-selected` | `= fill-ghost-selected` | 同 | 别名 | `css:242`；`css:361` |

**注意**：`--cds-fill-secondary` **与 `--cds-border` 数值完全相同**（都 = alpha-2）。这是刻意的：Secondary 按钮用「与边框同浓度的填充」代替边框，从而在视觉上不增加第二条线（`v1-02:64`）。实现时不要把二者分别硬编码成不同值。

`--cds-fill-secondary-hover` 是**唯一不用 `hsla(0,0%,8%)` 而用 `rgba(21,21,21,…)` 的填充**（`css:137`）—— 因为它是"加深"，需要更重的黑。`#151515` 恰好 = `gray-850`。

### 2.7 双环架构变量 (Dual-Ring)

| Token | Light | Dark | 出处 |
| :--- | :--- | :--- | :--- |
| `--cds-ring-inner` | `0px` | `1px` | `css:108`；`css:322` |
| `--cds-ring-outer` | `1px` | `0px` | `css:109`；`css:323` |
| `--cds-ring-color` | `var(--cds-border)` = `hsla(0,0%,8%,0.10)` | `rgba(255,255,255,0.10)` | `css:110`；`css:324` |

**光学原理（必须理解，否则会做错暗色浮层）**：浅色浮层用**外环** 1px 描边包裹（白底需要一条细线界定边界）；暗色浮层把外环归零、改用**内环** 1px 高光（模拟倒角捕捉顶光），因为黑底上的白色外框会显得刺眼荧光（`v1-01:174-176`）。这就是 `--cds-shadow-popover` 在两个模式下结构不同却共用同一表达式的原因。

### 2.8 语义别名映射表（`css:237-249`，dark 重载 `css:356-368`）

| 别名 | 绑定 | 语义 |
| :--- | :--- | :--- |
| `--cds-bg-surface` | `var(--cds-surface-2)` | 通用卡片/面板表面 |
| `--cds-bg-surface-elevated` | `var(--cds-surface-3)` | 抬升表面 |
| `--cds-bg-primary` | `var(--cds-surface-0)` | 应用主背景 |
| `--cds-bg-secondary` | `var(--cds-surface-1)` | 次级背景 |
| `--cds-bg-hover` | `var(--cds-fill-ghost-hover)` | 悬浮填充 |
| `--cds-bg-selected` | `var(--cds-fill-ghost-selected)` | 选中填充 |
| `--cds-border-subtle` | `var(--cds-alpha-2)` | 细分隔线 |
| `--cds-border-accent` | `var(--cds-clay)` | 品牌色边框 |
| `--cds-fill-brand` | `var(--brand)` | 品牌填充 |
| `--cds-fill-brand-hover` | `var(--cds-clay-hover)` | 品牌填充 hover |
| `--cds-fill-brand-subtle` | `var(--cds-clay-light)` / `rgba(217,119,87,0.15)` | 品牌浅底衬 |
| `--cds-fill-danger` | `#ef4444` / `#f87171` | 危险填充 |
| `--cds-text-accent` | `var(--cds-clay)` | 品牌色文本 |

**反直觉点**：`--cds-bg-surface` 绑的是 `surface-**2**`，而 `--cds-bg-primary` 绑的是 `surface-**0**`。"primary" 在这里指"最底层画布"，不是"最重要的卡片"。照抄时极易搞反（`css:237-239`）。

### 2.9 会话气泡专用令牌（`css:173-186`，`[data-cds]` 作用域 `css:648-663`）

| Token | 值 | 出处 |
| :--- | :--- | :--- |
| `--cds-message-bubble-radius` | `calc(var(--cds-radius, 8px) + calc(.25rem * var(--cds-rem-scale, 1)))` | `css:176`；`css:649` |
| `--cds-message-bubble-pad-x` | `var(--cds-pad-lg, 16px)` | `css:177` |
| `--cds-message-bubble-pad-y` | `var(--cds-pad-md, 12px)` | `css:178` |
| `--cds-message-bubble-measure` | `85%` | `css:179` |
| `--cds-message-bubble-stack-gap` | `4px` | `css:180` |
| `--cds-message-bubble-radius-meeting` | `4px` | `css:181` |
| `--cds-message-bubble-radius-head` / `-foot` | `= var(--cds-message-bubble-radius)` | `css:182-183` |
| `--cds-message-bubble-join-gap` | `min(8px, var(--cds-message-bubble-pad-y))` | `css:184` |
| `--cds-bg-user-message` | `var(--cds-bg-neutral)` ← **`--cds-bg-neutral` 未定义** | `css:173` |
| `--cds-bg-user-message-personal` | `var(--cds-bg-tint-blue)` | `css:174` |
| `--cds-text-user-message-personal` | `var(--cds-text-tint-blue, #193c5f)` ← **`--cds-text-tint-blue` 未定义**，回退 `#193c5f` | `css:175` |
| `--cds-assistant-message-text-inset` | `4px`（内嵌卡片时归零） | `css:185`；`css:661` |
| `--cds-assistant-message-text-stop` | `clamp(0px, (100% - 384px) * .175, 56px)` | `css:186`；`css:657` |

**气泡圆角是计算值，不是字面 18px**。以 `--cds-radius: 8px`、`--cds-rem-scale: calc(16/17) ≈ 0.941176` 代入：
`8px + (4px × 0.941176) = 11.76px ≈ 12px`，**不是 18px**。
⚠️ **冲突 C6 — 气泡 18px**：`agents:61`、`tw:62`（`'bubble': 'var(--cds-message-bubble-radius, 18px)'`）、`v1-01:83` 都声称 18px。但 `v1-03:61` 自己承认："在默认 `--cds-radius: 8px`、`--cds-rem-scale: 1` 基础下 `calc(8px + 4px) = 12px`；在桌面加大模式下扩展至 `18px`"。
**裁定**：18px 要求 `--cds-radius: 14px`（14 + 4×0.941 = 17.76 ≈ 18）。而 `--cds-radius` 在 `cds-theme.css` 中**从未定义**（仅 `css:157` 以 `var(--cds-radius, 8px)` 形式引用）。因此：
- 若 Harness 主题要**字面 18px**：写 `--cds-radius: 14px`（或直接 `border-radius: 18px`）；
- 若要保持公式的自适应同心性（`v1-01:88-93` 的核心理由）：写 `--cds-radius: 14px` 并保留 calc 表达式；
- **推荐**：保留 calc 公式 + 显式设 `--cds-radius: 14px`。这样页面缩放/大字号时内外曲率仍同心，同时视觉等于 18px。`--cds-radius` 未定义是 P0 的一个真实空洞，必须由主题补齐（`v2-03:96-111` 给出了官方 6px/8px 两档密度值，作为参考基线）。

`--cds-bg-neutral` 与 `--cds-text-tint-blue` **均未在 `cds-theme.css` 中定义**。用户气泡的实际填充应取 `--cds-bg-tint-blue`（`#f0f4f8` light / `rgba(255,255,255,0.06)` dark，`css:142,296`）。`CHANGELOG.md:76` 另记 personal 模式为 `#dde8f7`(Light) / `#193c5f`(Dark)，与 `css:142` 的 `#f0f4f8` 不一致 —— **裁定用 `css:142`**（P0），`#dde8f7` 视为早期草案。

---

## 3. 圆角 (Radii)

### 3.1 权威阶梯（`css:147-158`）

| Token | 字面值 | 计算 px | 承载组件 | 出处 |
| :--- | :--- | :--- | :--- | :--- |
| `--radius-xs` | `.125rem` | **2px** | 微型角标、聚焦内衬点 | `css:147` |
| `--radius-sm` | `.25rem` | **4px** | Kbd 键帽、复选框、行内代码微标、下拉行高亮 | `css:148` |
| `--radius-md` | `.375rem` | **6px** | XS 按钮（24px）、紧凑 chip、Prompt 建议胶囊 | `css:149` |
| `--radius-lg` | `.5rem` | **8px** | SM/MD 按钮、输入框、下拉菜单项、`--cds-h-control` 控件 | `css:150` |
| `--cds-panel-radius` | `10px` | **10px** | 附件磁贴、子面板卡片、工具栏面板 | `css:151` |
| `--radius-xl` | `.75rem` | **12px** | 代码块、LG 按钮（40px）、Artifact 卡片、抽屉 | `css:152` |
| `--radius-2xl` | `1rem` | **16px** | 模态弹窗（ConfirmationDialog）、设置卡片 | `css:153` |
| `--radius-3xl` | `1.5rem` | **24px** | 大容器（极少用） | `css:154` |
| `--cds-radius-composer` | `20px` | **20px** | 主聊天输入终端 | `css:155` |
| `--df-radius-pill` | `999px` | **999px** | 分段控制轨道、状态呼吸点、头像、药丸胶囊 | `css:156` |
| `--radius` | `var(--cds-radius, 8px)` | 8px（默认） | 基准控件圆角（`--cds-radius` 未定义，见 C6） | `css:157` |
| `--radius-card` | `calc(var(--cds-radius,8px) + calc(.25rem * var(--cds-rem-scale,1)))` | **≈11.76px（≈12px）** | 自适应同心卡片外圈 | `css:158` |
| `--cds-message-bubble-radius` | 同 `--radius-card` 公式 | ≈12px（18px 需 `--cds-radius:14px`，见 C6） | 用户消息气泡 | `css:176` |

### 3.2 组件级圆角归属（不可互换）

| 组件 | 圆角 | 出处 |
| :--- | :--- | :--- |
| Chat Composer 外壳 | `--cds-radius-composer` = 20px | `css:155`；`ChatComposer.tsx:102` |
| 用户消息气泡 | 18px（公式 + `--cds-radius:14px`） | `css:176`；`ChatMessageBubbles.tsx:10` |
| 模态弹窗 | `--radius-2xl` = 16px | `ConfirmationDialog.tsx:91` |
| 代码块 | `--radius-xl` = 12px | `CodeBlock.tsx:43` |
| LG 按钮（40px 高） | `--radius-xl` = 12px | `CdsButton.tsx:33` |
| 附件磁贴 / chip | `--cds-panel-radius` = 10px | `AttachmentCard.tsx:96`；`CdsButton.tsx` 注释 `:9` |
| MD/SM 按钮（32/28px 高） | `--radius-lg` = 8px | `CdsButton.tsx:31-32` |
| XS 按钮（24px 高） | `--radius-md` = 6px | `CdsButton.tsx:30` |
| XXS 按钮（20px 高） | `--radius-sm` = 4px | `CdsButton.tsx:29` |
| 分段控制轨道 / 药丸胶囊 / 状态点 | `--df-radius-pill` = 999px | `SegmentedControl.tsx:81`；`css:497` |
| Popover / 下拉菜单 | `--radius-xl` = 12px（`rounded-xl`） | `ChatComposer.tsx:169,208` |
| 模型选择器胶囊（composer 内） | `--radius-lg` = 8px | `ChatComposer.tsx:199` |
| 工具决策卡片 | `--radius-lg` = 8px | `agents:65` |

### 3.3 自适应同心圆角公式（`css:158`，`v1-01:88-93`）

```css
--radius-card: calc(var(--cds-radius, 8px) + calc(.25rem * var(--cds-rem-scale, 1)));
```

**规则**：任何"容器 + 内嵌子卡"的同心结构，外圈 = 内圈基准 + `.25rem × rem-scale`（≈3.76px）。这保证缩放时内外曲率始终平行。**不要**给内外层写同一个圆角值 —— 那会产生视觉上的"角部不平行"。

⚠️ **冲突 C7 — card 是 10px 还是 12px**：`agents:64` 说 `10px (--cds-radius-card)`，`css:151` 的 `--cds-panel-radius` 是 10px，但 `css:158` 的 `--radius-card` 是公式 ≈12px。**裁定：这是两个不同令牌，AGENTS 混淆了** —— `--cds-panel-radius` = 10px（固定，用于磁贴/面板）；`--radius-card` = 公式 ≈12px（用于自适应卡片）。两者都要实现，别合并。

⚠️ **冲突 C8 — composer 20px vs 12/14px**：`css:155` 与 `ChatComposer.tsx:102` 都是 20px；但 `v2-03:83` 明确写"2.0 把 `--cds-radius-composer` 从 20px 降为 12px（紧凑）/ 14px（舒适）"，`sbook:150` 另加 `--cds-radius-composer-v2: 12px`、`--cds-radius-chin: 12px`。
**裁定：Harness 主题用 20px**。理由：(1) `cds-theme.css` 与参考实现 `ChatComposer.tsx` 都是 20px，二者一致；(2) 20px 是 CDS 最具辨识度的签名几何，12px 会与 `--radius-xl` 的代码块/按钮撞形，失去层级区分；(3) v2 的 12px 是为承载 Worktree/算力调节器等复合底栏而做的密度取舍，Harness Web UI 没有同等密度压力。**若将来需要紧凑档**，按 `v2-03:96-111` 的 `[data-density=comfortable]` 双档实现，不要全局改 12px。

---

## 4. 阴影 (Shadows)

逐字取自 `css:113-131`（light）与 `css:326-341`（dark）。

### 4.1 Light

```css
--cds-shadow-color: rgba(0, 0, 0, 0.08);

--cds-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 2px 8px 0 var(--cds-shadow-color);
--cds-shadow-md: 0 2px 4px 0 rgba(0, 0, 0, 0.05), 0 6px 16px 0 var(--cds-shadow-color);
--cds-shadow-lg: 0 4px 8px 0 rgba(0, 0, 0, 0.06), 0 12px 28px -2px var(--cds-shadow-color);

--cds-shadow-popover: inset 0 0 0 var(--cds-ring-inner) var(--cds-ring-color),
                      0 0 0 var(--cds-ring-outer) var(--cds-ring-color),
                      0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08);

--cds-panel-shadow: 0 0 0 1px var(--cds-border), var(--cds-shadow-sm);
--cds-panel-shadow-hover: 0 0 0 1px var(--cds-border-strong), 0 4px 16px -2px rgba(0, 0, 0, 0.09);

--cds-shadow-composer: 0 4px 20px rgba(0, 0, 0, 0.035), inset 0 0 0 1px var(--cds-border);
--cds-shadow-composer-hover: 0 4px 24px rgba(0, 0, 0, 0.06), inset 0 0 0 1px var(--cds-border-strong);
--cds-shadow-composer-focus: 0 4px 24px rgba(0, 0, 0, 0.08), inset 0 0 0 1px var(--cds-border-strong), 0 0 0 1px var(--cds-border-strong);

--cds-focus-shadow: inset 0 0 0 1px var(--cds-surface-1), 0 0 0 1.5px var(--cds-clay), 0 0 6px 1px rgba(217, 119, 87, 0.25);
--cds-shadow-drop-glow: inset 0 0 24px -2px rgba(217, 119, 87, 0.20), inset 0 0 0 2px var(--cds-clay);
```

`--cds-shadow-popover` 展开后（light，`ring-inner:0px` / `ring-outer:1px` / `ring-color: hsla(0,0%,8%,0.10)`）：

```css
inset 0 0 0 0px hsla(0,0%,8%,0.10),
0 0 0 1px hsla(0,0%,8%,0.10),
0 8px 24px rgba(0,0,0,0.12),
0 2px 6px rgba(0,0,0,0.08)
```

### 4.2 Dark（`css:326-341`）

```css
--cds-shadow-color: rgba(0, 0, 0, 0.40);

--cds-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4), 0 2px 8px 0 var(--cds-shadow-color);
--cds-shadow-md: 0 2px 4px 0 rgba(0, 0, 0, 0.4), 0 6px 16px 0 var(--cds-shadow-color);
--cds-shadow-lg: 0 4px 8px 0 rgba(0, 0, 0, 0.5), 0 16px 36px -2px var(--cds-shadow-color);

--cds-shadow-popover: inset 0 0 0 1px rgba(255, 255, 255, 0.10),
                      0 8px 28px rgba(0, 0, 0, 0.65), 0 2px 8px rgba(0, 0, 0, 0.45);

--cds-panel-shadow: 0 0 0 1px var(--cds-border), var(--cds-shadow-sm);
--cds-panel-shadow-hover: 0 0 0 1px var(--cds-border-strong), 0 6px 20px rgba(0, 0, 0, 0.6);

--cds-shadow-composer: 0 4px 20px rgba(0, 0, 0, 0.4), inset 0 0 0 1px var(--cds-border);
--cds-shadow-composer-hover: 0 4px 24px rgba(0, 0, 0, 0.55), inset 0 0 0 1px var(--cds-border-strong);
--cds-shadow-composer-focus: 0 4px 24px rgba(0, 0, 0, 0.65), inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 0 0 1px rgba(255, 255, 255, 0.22);

--cds-focus-shadow: inset 0 0 0 1px var(--cds-surface-1), 0 0 0 1.5px var(--cds-clay), 0 0 8px 2px rgba(217, 119, 87, 0.35);
--cds-shadow-drop-glow: inset 0 0 24px -2px rgba(217, 119, 87, 0.30), inset 0 0 0 2px var(--cds-clay);
```

### 4.3 阴影使用规则

- **双层结构**：所有 elevation 阴影都是「近距微遮蔽（ambient occlusion，高 alpha 小 blur）+ 远距漫反射（elevation diffusion，低 alpha 大 blur）」。**禁止单层死黑阴影**（`v1-01:160-170`）。
- **`--cds-shadow-lg` 暗色不是简单加深**：light 第二层是 `12px 28px -2px`，dark 变成 `16px 36px -2px` —— blur 与 offset 都变大，因为黑底上需要更大的扩散半径才可感知（`css:116` vs `css:329`）。
- **`--cds-panel-shadow` 自带 1px 环**：`0 0 0 1px var(--cds-border)` 是阴影而非 `border`，因此**不占盒模型尺寸**，切换状态时零重排（`v1-01:155-156`）。这是 CDS 最重要的工程手法之一。
- **`--cds-shadow-drop-glow` 是拖拽吸附态**：仅在文件拖到 composer 上方时启用（`v1-01:227-228`）。
- Tailwind 映射见 `tw:67-79`（`shadow-sm/md/lg/popover/composer/composer-hover/composer-focus/focus-glow/drop-glow/panel/panel-hover`）。

---

## 5. 焦点环 (Focus Ring)

### 5.1 权威配方：三层陶土环（`css:130`；dark `css:340`）

```css
/* Light */
--cds-focus-shadow:
  inset 0 0 0 1px var(--cds-surface-1),          /* 第 1 层：1px 隔离垫片，用背景色隔开控件与光晕 */
  0 0 0 1.5px var(--cds-clay),                   /* 第 2 层：1.5px 陶土品牌主环 */
  0 0 6px 1px rgba(217, 119, 87, 0.25);          /* 第 3 层：柔和外扩环境漫射光晕 */

/* Dark */
--cds-focus-shadow:
  inset 0 0 0 1px var(--cds-surface-1),
  0 0 0 1.5px var(--cds-clay),
  0 0 8px 2px rgba(217, 119, 87, 0.35);          /* 暗底需要更大更亮的光晕 */
```

**三层各自的作用（缺一不可）**：
1. `inset 0 0 0 1px var(--cds-surface-1)` —— 垫片。没有它，1.5px 陶土环会直接贴着控件边缘，在小控件上显得脏；
2. `0 0 0 1.5px var(--cds-clay)` —— 主环。用 `box-shadow` 而非 `outline`，因为 `outline` 无法跟随 `border-radius` 在旧浏览器上表现一致；
3. `0 0 6px 1px rgba(217,119,87,0.25)` —— 环境光。让焦点环"发光"而不是"贴纸"，暗色升为 `8px 2px / 0.35`。

**关键细节**：第 2 层是 **1.5px** 而不是 2px，第 3 层是 **6px blur + 1px spread**。这两个小数是"不刺眼但清晰"的临界值，不要取整。

### 5.2 使用场景（`v1-01:201-209`）

- 所有键盘可聚焦控件（按钮、Tab、输入、下拉触发器）统一使用 `--cds-focus-shadow`；
- Tailwind 类：`shadow-focus-glow`（`tw:75` → `var(--cds-focus-shadow)`）；
- 组件内实际写法：`CdsButton.tsx:99` 用 `focus-visible:ring-2 focus-visible:ring-clay/50`（Tailwind ring 版），`v1-02:59` 的官方 reset 用 `focus-visible:outline-hidden`。**两版并存**：参考实现偏 `ring-2 ring-clay/50`，令牌表偏三层 shadow。**推荐令牌表版**（视觉更接近真实 CDS，且有垫片层）。
- `--cds-ring-hairline` 提供高分屏 0.5px / 0.333px 的发丝边框（`css:270-279`），与焦点环配合用于 `border-hairline` 类（`css:563-565`）。

### 5.3 Composer 的"焦点"是另一套（`css:127`）

⚠️ 不要混淆：**输入框聚焦用 `--cds-shadow-composer-focus`**（灰环 + 大投影），**不是**陶土焦点环：

```css
--cds-shadow-composer-focus: 0 4px 24px rgba(0,0,0,0.08), inset 0 0 0 1px var(--cds-border-strong), 0 0 0 1px var(--cds-border-strong);
```

区别：composer 聚焦是**中性灰**（`--cds-border-strong`）双环，因为它体积大、常驻，陶土环会造成持续视觉噪声；而按钮/Tab 等小控件的聚焦才用陶土环。

⚠️ **冲突 C9 — AGENTS 的双环焦点配方**：`agents:56` 给
`box-shadow: 0 0 0 2px var(--cds-bg-surface-0), 0 0 0 4px rgba(217, 119, 87, 0.4)`。

这是**完全不同的另一套**：2px 实色垫片（用 surface-0 硬色）+ 4px 半透明陶土外环，且**没有 1.5px 实色主环**。
**裁定：采用 `css:130` 的三层配方**。理由：
1. 2px+4px 方案在浅色下产生 4px 的彩色环，视觉重量远超 CDS 克制的"微光环"调性（`v1-01:205-209` 明确称之为"三层陶土高亮环"）；
2. 它引用 `--cds-bg-surface-0`（AGENTS 独有令牌，见 C1），在 CSS 体系里无法解析；
3. 半透明 `rgba(217,119,87,0.4)` 叠加在任意背景上会变色（在 clay 底上完全消失），而 CSS 方案有实色 1.5px 主环保证可见性。
**若确实需要更粗的环**（如表格行选中、拖拽目标），用 `--cds-shadow-drop-glow` 的 `inset 0 0 0 2px var(--cds-clay)`，那才是官方的 2px 硬环场景（`css:131`、`v1-01:129`）。

---

## 6. 动效 (Motion)

### 6.1 四组校准弹簧预设（`motion:64-120`，逐字）

| 常量 | stiffness (k) | damping (c) | mass (m) | 阻尼比 ζ = c/(2√(mk)) | 超调量 | 收敛时间 | 用途（`motion` 注释原文） |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `SPRING_BOUNCY` | **600** | **30** | **1.0** | **0.612**（欠阻尼） | **+8.8%** | **~0.22s** | 按钮点击、开关切换、图标按压（`motion:57-69`） |
| `SPRING_SNAPPY` | **320** | **28** | **1.0** | **0.783**（欠阻尼） | **+1.8%** | **~0.35s** | 气泡上浮、卡片展开、Popover 唤起（`motion:71-84`） |
| `SPRING_GENTLE` | **380** | **18** | **1.0** | **0.462**（明显欠阻尼） | **+19.4%** | **~0.58s** | 点赞、复制成功勾选、新消息微提示（`motion:86-105`） |
| `SPRING_HEAVY_SNAP` | **1200** | **80** | **0.1** | **3.650**（过阻尼） | **0%** | **~0.14s** | 抽屉/侧边栏手势吸附、面板分割拖拽（`motion:107-120`） |

ζ 与超调量已复核：`ζ = c / (2√(m·k))`，`overshoot = exp(-πζ/√(1-ζ²))`（`motion:16-51` 提供了解析解 `calcDampedHarmonicOscillator`）。`v1-04:156-161` 的表格与本表完全一致，可交叉验证。

⚠️ **冲突 C10 — 弹簧参数与命名双重错位（本规范最重要的冲突）**：`agents:84-95` 给出另一套：

| AGENTS 名称 | AGENTS 参数 | AGENTS 声称 ζ | 实际 ζ（按 AGENTS 参数算） | 文件 `motion` 中同名常量的参数 |
| :--- | :--- | :--- | :--- | :--- |
| `SPRING_SNAPPY` | 600 / 30 / **0.6** | 0.791 | 0.791 ✓ 自洽 | 320 / 28 / 1.0 |
| `SPRING_BOUNCY` | 400 / 25 / **0.8** | 0.612 | 0.612 ✓ 自洽 | 600 / 30 / 1.0 |
| `SPRING_GENTLE` | 220 / 24 / **1.0** | 0.809 | 0.809 ✓ 自洽 | 380 / 18 / 1.0 |
| `SPRING_HEAVY_SNAP` | 1200 / 80 / 0.1 | 1.826 | **3.650** ✗ | 1200 / 80 / 0.1 |

两套参数**并非各自内部自洽**：AGENTS 的 `SPRING_BOUNCY` 写 ζ=0.612 / +8.8%，但按 400/25/0.8 计算 ζ=0.699、超调 +4.7%（0.612 与 8.8% 属于 600/30/1.0 那一行，被串行了）；SNAPPY/GENTLE 两行自洽。其余问题：(a) 四个名字对应的数值完全不同；(b) AGENTS 把 `SPRING_HEAVY_SNAP` 的 ζ 算错成 1.826（正确 3.650，`v1-04:161` 也写 3.650）；(c) AGENTS 的语义映射（"SNAPPY 用于按钮"）与 `motion:57-69` 的映射（"BOUNCY 用于按钮"）**正好相反**。

**裁定：采用 `ClaudeMotionPresets.ts`（P1）的数值与语义映射。** 理由：
1. 它是**可 import 的代码常量**，是唯一能被 `import { SPRING_BOUNCY } from './ClaudeMotionPresets'` 直接消费的真值源（`agents:76-83` 自己也要求从该文件 import）；
2. `v1-04:156-161` 的独立取证表格与之一致（600/30/1.0 = Button、320/28/1.0 = Card/Popover、380/18/1.0 = Bouncy Feedback、1200/80/0.1 = Panel Drag），二比一；
3. AGENTS 的 `mass: 0.6 / 0.8` 在任何代码文件中都不存在。
**实现警告**：若照抄 AGENTS 的 `SPRING_SNAPPY = 600/30/0.6`，得到的动效会与官方**明显不同**（0.791 ζ 的高刚度短收敛 vs 0.783 ζ 的低刚度长收敛，虽然 ζ 接近但 ω₀ 相差 1.4 倍，手感是"弹射"而非"滑入"）。

**另注**：`SegmentedControl.tsx:130-134` 的分段滑块用了一组**第五套**参数 `stiffness: 500, damping: 35`（ζ = 0.783）—— 与 `SPRING_SNAPPY` 同 ζ 但更高刚度。这是该组件的局部最优，非全局预设，**不要推广**。

### 6.2 变体常量（`motion:141-217`）

| 变体 | initial → animate | transition | 出处 |
| :--- | :--- | :--- | :--- |
| `motionMessageFadeUp` | `{opacity:0, y:12}` → `{opacity:1, y:0}` | `SPRING_SNAPPY`；exit `{opacity:0,y:-8}` `duration:.18 easeIn` | `motion:142-154` |
| `motionUserBubbleEnter` | `{opacity:0, scale:.94, y:8}` → `{1, 1, 0}` | `spring 450/24`（ζ=0.566，+12.3%） | `motion:157-169` |
| `motionPopover` | `{opacity:0, scale:.95, y:4}` → `{1,1,0}` | `SPRING_SNAPPY`；exit `{scale:.96,y:2}` `duration:.12 easeOut` | `motion:172-186` |
| `motionModalDialog` | `{opacity:0, scale:.96, y:10}` → `{1,1,0}` | `spring 400/32`（ζ=0.8）；exit `duration:.15 easeInOut` | `motion:189-207` |
| `motionGraphemeReveal` | `{opacity:0, filter:blur(6px)}` → `{1, blur(0)}` | `duration:.35 easeOut` | `motion:210-217` |

### 6.3 时长令牌（5 阶）

⚠️ **重要事实：这 5 个令牌在 `cds-theme.css` 中从未定义，只被引用**（`css:486`、`css:490` 用 `var(--cds-dur-slow)` / `var(--cds-dur-fast)`，但 `:root` 里没有声明）。值取自 `v2-04:52-58`（与 `v2-02`、`v1-01:592-596` 一致）：

```css
--cds-dur-fast: 60ms;   /* 瞬态：按压塌陷、Focus 环显现、Checkbox 勾选 */
--cds-dur-snap: .12s;   /* 利落转场（120ms）：Pill 收缩、标签关闭、微图标翻转 */
--cds-dur-base: .2s;    /* 标准交互（200ms）：模态展开、卡片悬停上浮、下拉菜单 */
--cds-dur-sheet: .3s;   /* 抽屉面板（300ms）：NewSessionDrawer 滑出、文件侧栏 */
--cds-dur-slow: .45s;   /* 页面级大转场（450ms）：弹射窗口初始化、全屏遮罩 */
```

**Harness 主题必须自行声明这 5 个令牌**，否则 `css:486`/`css:490` 的按钮弹性动画会因变量缺失而失效（回退到 `initial`，即无过渡）。

### 6.4 贝塞尔曲线全集（`css:204-223`）

| Token | 值 | 承载场景 |
| :--- | :--- | :--- |
| `--cds-ease-swift` | `cubic-bezier(.16, 1, .3, 1)` | 幽灵按钮、卡片悬停抬升、阴影/焦点渐变（150ms） |
| `--cds-ease-expand` | `cubic-bezier(.19, 1, .22, 1)` | Grid `0fr → 1fr` 展开（思考链折叠） |
| `--cds-ease-enter` | `cubic-bezier(.22, 1, .36, 1)` | 消息块入场消融 |
| `--cds-ease-out` | `cubic-bezier(.165, .84, .44, 1)` | 标准平滑出场 |
| `--cds-ease-snap` | `cubic-bezier(.32, .72, 0, 1)` | 磁吸快速对齐（分段滑块 120ms） |
| `--cds-ease-overshoot` | `cubic-bezier(.34, 1.3, .64, 1)` | 经典机械果冻过冲（+30%） |
| `--cds-ease-pop` | `cubic-bezier(.34, 1.56, .64, 1)` | 弹窗/重图标回弹（+56%） |
| `--cds-ease-pulse` | `cubic-bezier(.4, 0, .2, 1)` | 思考三点跳动呼吸脉冲（1.9s） |
| `--cds-ease-rise` | `cubic-bezier(.3, .7, .4, 1)` | 状态条平滑抬升 |
| `--cds-ease-fall` | `cubic-bezier(0, 0, .2, 1)` | 状态条平滑下落 |

`motion:126-135` 的 `CDS_EASING` 常量给出 4 个 TS 别名：`OVERSHOOT`（= overshoot）、`EASE_OUT_EXPO`（= `.16,1,.3,1`，即 swift）、`DECEL`（= `.165,.84,.44,1`，即 out）、`SHARP_PRESS`（= `.32,.72,0,1`，即 snap）。

⚠️ **冲突 C11 — 曲线数量**：`v2-04:61-73` 声称"3 大精确贝塞尔控制点"（只有 out / snap / overshoot），而 `css:204-223` 有 10 条。**裁定：用 CSS 的 10 条**（v2-04 是"底座解密"章节的简化摘要，CSS 是完整表）。

### 6.5 15 阶物理弹簧（按钮按压，`css:223`）

```css
--cds-btn-spring: linear(0, .2459, .6526, .9468, 1.0764, 1.0915, 1.0585, 1.0219, .9993, .9914, .9921, .9957, .9988, 1.0004, 1);
```

物理含义（`v1-02:100-102`）：在 40% 时间点冲出至 `1.0915`（**+9.15% 过冲**），回弹至 `0.9914`，在 `1.0004` 处收敛。

配套 `.cds-btn-squish`（`css:482-491`）：
```css
.cds-btn-squish { --cds-btn-press-sx: 0.975; --cds-btn-press-sy: 0.975; transform-origin: 50%; transition: transform var(--cds-dur-slow) var(--cds-btn-spring); }
.cds-btn-squish:active, :active > .cds-btn-squish { transform: scale(var(--cds-btn-press-sx), var(--cds-btn-press-sy)); transition: transform var(--cds-dur-fast) ease-out; }
```

### 6.6 关键帧清单（`css:408-514`，实现必备）

| 关键帧 | 参数 | 出处 |
| :--- | :--- | :--- |
| `_grapheme-reveal_1plog_1` | `opacity 0→1`, `blur(6px)→blur(0)` | `css:408-411` |
| `timeline-quiet-dot` | `1.9s cubic-bezier(.4,0,.2,1) infinite`，`translateY(2px→-2.5px→0)`，阶梯延迟 0 / .15s / .3s | `css:414-419`；`css:597-612` |
| `timeline-expand` | `grid-template-rows: 0fr→1fr`（消除高度抖动） | `css:422-425` |
| `timeline-status-rise` | `.24s cubic-bezier(.3,.7,.4,1)`，`y:6px→0` | `css:428-431`；`css:581` |
| `timeline-status-fall` | `.18s ease-out`，`y:0→-4px` | `css:434-437`；`css:582` |
| `message-fade-up` | `y:12px→0`，`opacity 0→1` | `css:440-443` |
| `saved-check-decay` | `0%,75%` 全显 → `100%` `opacity:0 scale(.92)` | `css:446-449` |
| `cds-skeleton-sweep` | `2s linear 105deg`，`translate(-100%)→translate(100%)` | `css:452-455` |
| `dframe-clay-breathe` | `3s ease-in-out`，`scale(.86→1)`，`brightness(.96→1.06)` | `css:458-461` |
| `cds-dot-pulse` | `1.8s`，`opacity .2857→1→.2857` | `css:464-468` |
| `dframe-dot-blink` | `1.2s`，`opacity .3↔1` | `css:470-473` |
| `file-thumbnail-grow-in` | `250ms`，`scale(.85)→1` | `css:476-479` |
| `timeline-block-enter` | `.3s cubic-bezier(.22,1,.36,1)`，`blur(4px) + translateY(5px) scale(.9)` | `css:614-633` |
| `wl-glow` / `wl-halo` | `1.8s` / `2.2s ease-in-out infinite`，clay 光晕 60%↔85% | `css:716-735` |
| `cds-shimmer-text-shine` | `background-position: 83.333%→16.667%` | `css:738-746` |
| `epitaxy-linear-sweep` | `1.1s cubic-bezier(.45,0,.55,1) infinite`，`translate(-100%)→(350%)` | `css:759-786` |

⚠️ **冲突 C12 — 滚动遮罩宽度与配方**：`css:196` 定 `--cds-scroll-fade-size: 28px`，`v2-02:139` 却写"自动展开为 `24px`"。同时存在两套 mask 配方：
- `agents:154-165` 的**静态 7 档**：`transparent 0% → .05 15% → .18 32% → .38 50% → .64 68% → .88 85% → black 100%`；
- `css:820-821` 的**滚动驱动 8 档**（含 `#0000000d/.15`、`#00000026/.3`、`#0000004d/.45`、`#00000080/.6`、`#000000b3/.75`、`#000000d9/.87`、`#000`），由 `animation-timeline: scroll(self)` 驱动，四边同时生效（`css:812-831`）。

**裁定**：`--cds-scroll-fade-size` 用 **28px**（P0，且 `v1-01:284` 也强调"严格 28px，非近似的 24px 或 32px"）。配方二选一：纯 CSS 环境用 `agents:154-165` 的 7 档（无 `@supports` 依赖，通用性最好）；Chromium 115+ 用 `css:812-831` 的滚动驱动版（零主线程开销）。两者档位不同（7 档 vs 8 档），**不要混用**。

---

## 7. 排印 (Typography)

### 7.1 光学缩放基准（`css:9`）

```css
--cds-rem-scale: calc(16 / 17);  /* ≈ 0.94117647，把 Web 17px 基准压到视网膜 16px */
```
所有字号/间距令牌都乘这个系数（`v1-01:343`）。Harness 主题必须声明它，否则所有 `calc(... * var(--cds-rem-scale, 1))` 会静默退化。

### 7.2 字体栈（`css:226-234`，逐字）

```css
--font-cjk-sans-sc: "PingFang SC";
--font-cjk-sans-tc: "PingFang TC";
--font-cjk-sans-jp: "Hiragino Sans";
--font-cjk-sans-kr: "Apple SD Gothic Neo";
--font-cjk-sans-fallback: var(--font-cjk-sans-sc), var(--font-cjk-sans-tc), var(--font-cjk-sans-jp), var(--font-cjk-sans-kr);
--font-sans-fallbacks: system-ui, "Segoe UI", Roboto, Helvetica, Arial, var(--font-cjk-sans-fallback), sans-serif;
--font-anthropic-sans: "anthropic-sans", var(--font-sans-fallbacks);
--font-anthropic-serif: "anthropic-serif", ui-serif, Georgia, "Times New Roman", var(--font-cjk-sans-fallback), serif;
--font-anthropic-mono: "anthropic-mono", ui-monospace, monospace;
```

**CJK 回退链是硬要求**：`PingFang SC → TC → Hiragino Sans → Apple SD Gothic Neo`，覆盖简/繁/日/韩。Harness Web UI 若渲染中文，必须保留完整链，否则日文假名会落到 `Hiragino` 缺失后的系统默认字体上，出现字重跳变。

⚠️ **冲突 C13 — 三套字体栈**：

| 来源 | Sans | Mono |
| :--- | :--- | :--- |
| `css:231-234`（P0） | `"anthropic-sans", system-ui, "Segoe UI", Roboto, Helvetica, Arial, <CJK>, sans-serif` | `"anthropic-mono", ui-monospace, monospace` |
| `tw:28-52`（P1） | `AnthropicSans, Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, sans-serif` | `JetBrains Mono, ui-monospace, SF Mono, Menlo, monospace` |
| `v1-01:331`（P2） | 同 CSS | `"anthropic-mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace` |

**实现裁定（2026-10-21）— 原版 Anthropic 字体，不做降级回退。**

参考仓库的 `agents:21-23` 禁止二进制字体，所以它只能用系统回退。本主题按用户要求直接内联 **6 个原版 Anthropic Web 可变字体**（Sans / Serif / Mono × Roman / Italic）：文件在 `plugins/cds-theme/fonts/`，字体名表为 `Anthropic Sans Web Text` / `Anthropic Serif Web Text Light` / `Anthropic Mono Web`，版本 `26.043.1`，厂商 `BSPK x Geist x Anthropic`；构建时由 `client/src/fonts.js` 转成 `data:font/woff2` 内联进 `client.js`（宿主 CSP 含 `font-src data:`，无需网络）。

所以字体栈以 CSS 的 `"anthropic-sans" / "anthropic-serif" / "anthropic-mono"` 开头，Inter / JetBrains Mono **不参与**：

```
sans:  "anthropic-sans", system-ui, "Segoe UI", Roboto, Helvetica, Arial, var(--font-cjk-sans-fallback), sans-serif
serif: "anthropic-serif", ui-serif, Georgia, "Times New Roman", var(--font-cjk-serif), serif
mono:  "anthropic-mono", ui-monospace, "Cascadia Mono", Consolas, var(--font-cjk-sans), monospace
```

**中文不是降级，也无法用 Anthropic 字体**：三个 Anthropic 字体合计 0 个 CJK 码位（README 实测 625 个码位、CJK 为 0），中文必须走思源黑体/宋体子集；主题对它们做了 `avar` 轴偏移，使同名义字重下的竖干粗细与 Anthropic 一致（`NotoSansSC-Shifted-VF.woff2` / `NotoSerifSC-Shifted-330.woff2`）。手动选过字体时，以 `dsh-system-fonts` 的选择为准。

**授权提示**：原版字体没有公开再分发授权，内联进发布包等于向用户分发；这一点记录在 `market/PUBLISHING.md`，是本仓库已知的风险，不是遗漏。

### 7.3 7 阶字号阶梯

⚠️ **这些 `--cds-font-size-*` 令牌在 `cds-theme.css` 中完全不存在**（全文无 `--cds-font-size`），仅见于 `v1-01:355-381`。Harness 主题需自行声明。以下为 `v1-01:345-353` 的表格（P2，唯一来源）：

| 阶梯 | CSS 表达式 | 换算 px | 行高 | 行高比 | 用途 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `caption` | `calc(0.6875rem * scale)` | ≈10.35px | `1rem` | 1.55 | Kbd、时间戳、模型版本、Token 统计 |
| `footnote` | `calc(0.75rem * scale)` | ≈11.29px | `calc(0.9375rem * scale)` | 1.25 | 附件体积、图片元数据、次级说明 |
| `code` | `calc(0.75rem * scale)` | ≈11.29px | `1rem` | 1.42 | 代码块、行内代码、Diff（**不含思考日志**） |
| `body` | `calc(0.8125rem * scale)` | ≈12.24px | `1.125rem` | 1.46 | 对话正文、气泡、Composer 文本 |
| `prose` | `0.875rem - 1rem` | 14–16px | `1.25rem - 1.5rem` | 1.43–1.50 | 长文 Artifact、Markdown 深读 |
| `heading` | `calc(0.875rem * scale)` | ≈13.18px | `calc(1.125rem * scale)` | 1.29 | 弹窗标题、卡片小标题、分组头 |
| `title` | `calc(1.25rem * scale)` | ≈18.82px | `calc(1.5rem * scale)` | 1.25 | 顶栏标题、Project 名、工作区头部 |

**注意**：思考日志（reasoning body）不是 code 阶梯。宿主把它渲染成 compact Markdown，实测 **13px / 20px 比例字体**（`--dsh-content-font-size-secondary`），不走 `--dsw-font-markdown-code-block-small`；后者驱动的是工具行 terminal / command card（token 11.5，宿主行高 18）与聊天命令块（token 12，宿主行高 22）。主题把两处宿主行高都加上代码字号 delta，避免放大代码字号时行距被钉死（`styles.js` 的 `[data-terminal]` / `[class*="terminalBody"]`）。

**唯一在 `cds-theme.css` 中真实存在的排印令牌**（`css:189-193`）：
```css
--chat-gutter: 32px;
--chat-body: calc(.875rem * var(--cds-rem-scale, 1));   /* ≈13.18px */
--chat-leading: 1.42857;
--chat-turn-gap: calc(var(--chat-body) * var(--chat-leading) * .75);
--chat-item-gap: calc(var(--chat-body) * var(--chat-leading) * .5);
```
注意 `--chat-body` 用 `.875rem × rem-scale`（缩放后 ≈13.18px），而 `v1-01` 的 `body` 档用 `.8125rem`。**裁定：正文以 14px 为基准**（`sbook` 与 `.text-body-regular` 未缩放值），随内容字号 delta 缩放；`--chat-body` 的 13.18px 是 rem-scale 后的表达式结果，不是另一个设计档（C14）。

⚠️ **冲突 C14 — body 字号**：`v1-01:350` 说 body ≈12.24px，但同文件 `:540` 的 `.text-body-regular` 用 `calc(0.875rem * scale)`（缩放下 ≈13.18px，未缩放 14px），`sbook:663` 也说 body 计算值 14px / 行高 20px。**裁定：正文 14px、行高 20px** —— 主题的 `content(14)` 以 14px 为基准，随内容字号 delta 缩放；`13.18px` 是 `.875rem × 0.941` 的结果，不是另一个设计值。旧稿把两个数混写成「14px（≈13.18px）」，已拆开。

### 7.4 字重与暗色光学补偿

**浅色基准字重**（`v1-01:389-394`）：Regular `400`、Medium `500`、Semibold `580`、Bold `600`。

**暗色逆补偿（`css:376-385`，P0，逐字）**：
```css
.dark .font-medium, [data-mode="dark"] .font-medium,
.dark [data-optical-compensate], [data-mode="dark"] [data-optical-compensate] {
  font-variation-settings: "wght" 465;
}
.dark .font-semibold, [data-mode="dark"] .font-semibold {
  font-variation-settings: "wght" 560;
}
.dark .font-bold, [data-mode="dark"] .font-bold {
  font-variation-settings: "wght" 660;
}
```

**原理**（`v1-01:383-387`）：高对比白字在黑底上因视网膜光渗（Irradiation）显得比实际粗 10–15%。CDS 通过 Variable Font 轴主动下调 30–40 个刻度来抵消。

⚠️ **冲突 C15 — 补偿数值**：`v1-01:391-394` 的表格写 Regular `360` / Medium `460` / Semibold `550` / Bold `660`；`css:376-385` 写 Medium `465` / Semibold `560` / Bold `660`（**没有 Regular 的 360**）。

**裁定：实现用 460 / 550 / 660 + Regular 360。** `css:376-385` 的 465 / 560 是暗色减薄值，但宿主只接受静态字重，5–10 个刻度在 500/580 基准上不可辨；真实 Claude 桌面端本身用的是可变字重（提取到的值包括 450/451/533/550/650），没有单一的 465/560。为与宿主渲染一致，取 460/550，并保留 Regular 360 作为暗色正文的回退。

**实现警告**：这套补偿依赖 `font-variation-settings: "wght"`，只对**可变字体**生效。若 Harness 主题使用静态字重字体（如系统 `Segoe UI`），`font-variation-settings` 会被忽略，必须改用 `font-weight: 460`（浏览器会做插值或就近取整）。这是 Web 环境下最容易被漏掉的一点 —— 建议同时写 `font-weight` 数值作为回退。

### 7.5 行内图标光学基线（`css:388-390`，逐字）

```css
.align-neg-125 { vertical-align: -0.125em; }   /* 14–16px 正文/标题内的行内图标 */
.align-neg-075 { vertical-align: -0.075em; }   /* 11–12px caption/说明小字 */
.align-neg-1px  { vertical-align: -1px; }      /* 固定高度工具栏/标题栏徽章 */
```
原理（`v1-01:460-467`）：默认 `vertical-align: baseline` 会让 SVG 的视觉重心高于 x-height / cap-height，产生"图标浮在上空"的脱节感。`-0.125em` 恰好下沉 1/8em（14px 字号下 ≈1.75px），使图标几何中心与字母重心重合。
`CodeBlock.tsx:51` 的用法可作范例：`style={{ verticalAlign: "-0.125em" }}` 用于语言图标。

### 7.6 换行与数字锁定（`css:393-401`）

```css
.text-balance-native { text-wrap: balance; }        /* 标题：多行均衡，消除孤词末行 */
.text-pretty-native  { text-wrap: pretty; }         /* 正文：消除段落末行单字 (runts) */
.overflow-wrap-anywhere { overflow-wrap: anywhere; word-break: normal; }  /* 超长 ID/hash 安全折行 */
.tabular-nums { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
```
**硬规则**（`agents:220`）：所有动态数字（计时器、Token 计数、行号、音频频率）**必须** `tabular-nums`，否则递增时整行抖动。

### 7.7 移动端输入防缩放（`v1-01:489-495`）

```css
input, textarea, select { font-size: max(16px, var(--cds-font-size-body)); }
```
iOS WebKit 下 `font-size < 16px` 的输入框聚焦会强制页面缩放。这是 CDS 的硬地板。

---

## 8. 组件级视觉约定

### 8.1 单笔触边框纪律（The 1-Border Rule）——最高优先级

**核心准则**：从画布向内穿透的任何一条视线路径上，**至多穿过 1 层闭合矩形边框**（`v1-01:237-238`）。

| 授权等级 | 判定条件 | 典型组件 | 实现 |
| :--- | :--- | :--- | :--- |
| **🚫 严格无边框** | 依靠留白/文字层级/纯背景色聚合 | 助手回复正文、用户气泡、容器内所有次级按钮、侧边栏条目、消息底部操作栏、思考链文本 | `border: 0; background: transparent`（或 `bg-tint-blue + radius`） |
| **📦 必须有闭合外框** | 自成一体、独立交互沙盒、跨 Z 轴浮层 | Composer、代码块、附件卡片、Artifact 卡片、模态弹窗、右键菜单 | 1px 边框 + 双层弥散投影 |
| **➖ 单向细线替代** | 容器内部结构划分，**严禁闭合套娃** | 代码块头部/代码区中缝（`border-b`）、菜单功能组隔离（`border-t`）、左右分栏（`border-r`）、Composer 输入区与底栏中缝（`border-t`） | 单边 1px |
| **🌓 暗色倒角** | 暗底上 1px 白线会刺眼荧光 | 所有暗色卡片/代码块/浮层外缘 | `box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08)` 代替 `border` |

**容器内自动降级协议**（`v1-01:239-242`）：
- 容器已带边框（Composer / Modal / CodeBlock）时，其内部 **Secondary 按钮严禁带边框**，改用 `--cds-fill-secondary` 柔和填充（`css:136`）；
- 工具栏按钮/内联操作一律降级为 **Ghost**（`bg-transparent` + hover 时 `--cds-fill-ghost-hover`）；
- 内部输入域彻底去掉原生边框与环：`border-0 outline-none ring-0 bg-transparent`。

**反模式示例**（`v1-01:256-265`，务必避免）：
```html
<div class="border">          <!-- 框1 外卡片 -->
  <div class="border">        <!-- 框2 助手气泡 -->
    <div class="border">      <!-- 框3 操作栏 -->
      <button class="border"> <!-- 框4 按钮 -->
```
**正模式**：外层无框（Surface 0 画布）→ 助手消息无框无底 → 操作栏无框 → 按钮纯 Ghost hover。

⚠️ **参考实现自身的违规**：`ChatComposer.tsx:199` 的模型选择器胶囊写了 `border border-neutral-200/60` —— 它位于**已带 1px 内环的 Composer 内部**，构成双层边框，直接违反本条纪律。**裁定：Harness 主题实现时去掉该 border**，改用 `--cds-fill-secondary` 或纯 hover 底衬。同理 `ChatComposer.tsx:244` 的 Thinking 开关 `border border-clay/30` 也应改为 `bg-clay/15 text-clay` 无边框。这是参考实现与设计纪律的已知偏差，不要照抄。

### 8.2 低对比表面分层

- 用 `surface-0 → 1 → 2 → 3` 的**微小明度差**（浅色下相邻两阶只差 1–3 个 HEX 单位，见 §1.1）建立空间感，而不是靠边框或阴影（`agents:15-16`）；
- 边框只出现在"必须有外框"的 4 类组件上（§8.1）；
- 暗色相邻阶差同样是 2 单位（`#151515 → #1a1a19 → #20201f → #2c2c2a`），保证 OLED 上无色带。

### 8.3 Composer（输入终端）

| 属性 | 值 | 出处 |
| :--- | :--- | :--- |
| 圆角 | `--cds-radius-composer` = 20px | `css:155`；`ChatComposer.tsx:102` |
| 底色 | `surface-3`（`#ffffff` / `#20201f`） | `css:93,250` |
| 内边距 | `0.875rem`（14px） | `ChatComposer.tsx:102` |
| 三态阴影 | `--cds-shadow-composer` / `-hover` / `-focus` | `css:125-127` |
| 阴影过渡 | `box-shadow 220ms var(--cds-ease-swift)` | `css:528` |
| 自动伸缩 | `field-sizing: content`，`min-height: 3rem (48px)`，`max-height: 24rem (384px)` | `ChatComposer.tsx:145`；`v1-01:107` |
| 内部 textarea | `border-none outline-none ring-0 bg-transparent resize-none` | `ChatComposer.tsx:145` |
| 发送按钮 | `bg-clay hover:bg-clay-hover`，`active:scale-95`，禁用 `opacity-30` | `ChatComposer.tsx:258` |
| 底栏行高 | `--cds-h-control`（紧凑 24px / 舒适 32px） | `v2-03:99,108` |
| 触控补偿 | `--cmp-chin-touch-grow: calc((var(--cds-h-control) - var(--cmp-chin-row-h)) / 2)`，配合 `margin-block: calc(... * -1)` 外扩命中区 | `v2-02:199-207`；`sbook:152` |

**触控负边距补偿（易漏）**：桌面端视觉行高可压到 28px 以内，但触控目标必须 ≥44×44px（WCAG 2.1 AA）。CDS 的解法是保持视觉矮行高，同时用负 `margin-block` 把不可见 hit-box 向外扩张（`v2-02:210-213`）。Harness 若有触控场景，必须实现。

**实现（2026-10-21）**：暗色 composer 实测 **`#1a1a19`**（surface-2，与真实 Claude 输入卡一致），不是表里的 surface-3 `#20201f`；过渡为 **220ms** swift（已实现）。三态阴影没有逐态换 blur——主题用 `--dsw-elevation-soft`，hover/focus 只提升 `--dsw-elevation-stroke-color`；`--cds-h-control` 与触控补偿未发射（由宿主底栏自行处理）。

### 8.4 Chip / Segmented Control

**分段控制轨道**（`SegmentedControl.tsx:81-88`；`v1-02:127-142`）：
```css
padding: 1px;                     /* 严格 1px 环绕间距，不用 2px */
border-radius: 999px;
background: var(--cds-segmented-track);   /* rgba(0,0,0,0.06) / rgba(255,255,255,0.08) */
container-type: inline-size;
```
**滑块纯几何定位**（`SegmentedControl.tsx:95-96`）：
```css
left:  calc(1px + <activeIndex> * (100% - 2px) / <total>);
width: calc((100% - 2px) / <total>);
```
**滑块双层弥散投影**（`SegmentedControl.tsx:97-98`）：
```css
background: var(--cds-segmented-thumb);   /* #ffffff / #2c2c2a */
box-shadow: inset 0 0 0 0.5px var(--cds-border),
            0 1px 2px rgba(0,0,0,0.06),
            0 2px 6px -1px rgba(0,0,0,0.05);
```
注意 `0.5px` 内环 —— 这是发丝环（`css:270-279` 的 `--cds-ring-hairline` 思想），不是 1px。

**双断点容器查询折叠**（`v1-02:164-192`）：
- `@container (width <= 180px)` → 2 项分段控制折叠未激活项文本，激活项 `flex: none; padding: 0 16px`；
- `@container (width <= 254px)` → 3 项同理。
**规则**：绝不换行、绝不截断成省略号，而是**折叠未激活标签、只留图标**。

**磁吸时序**：`transform var(--cds-dur-snap) var(--cds-ease-snap)` = 120ms + `cubic-bezier(.32,.72,0,1)`（`v1-02:140`；`SegmentedControl.tsx:93` 的 `duration-120 ease-[cubic-bezier(0.32,0.72,0,1)]`）。Framer Motion 模式用 `layoutId` + `spring 500/35`（`SegmentedControl.tsx:130-134`）。

**Chip（胶囊标签）规则**：
- 圆角：`--radius-md`(6px) 或 `--radius-lg`(8px)，取决于高度档位（§3.2）；
- **位于已带边框容器内时 `border: none`**，靠 `--cds-fill-secondary` 或 `bg-clay/10` 区分（§8.1）；
- 徽标/微标用等宽 + 大写字距：`font-mono text-[9px] font-bold tracking-wide`（`AttachmentCard.tsx:101`）；
- 入场动画：`cds-chip-in`，`var(--cds-dur-base)` + `var(--cds-ease-out)`，`animation-delay: calc(50ms + min(sibling-index() - 1, 8) * 30ms)`，关键帧 `opacity 0→1, blur(2px)→0, scale(.8)→1`（`v2-02:107-116`）。**这是原生 CSS 级联交错，不需要 JS 循环**。

### 8.5 代码块

| 属性 | 值 | 出处 |
| :--- | :--- | :--- |
| 圆角 | `--radius-xl` = 12px | `CodeBlock.tsx:43` |
| 底色 | `#0d0d0c`（**唯一的纯黑场景**） | `CodeBlock.tsx:43`；`agents:13,147` |
| 边框 | `1px solid` 深色系（`border-neutral-800`） | `CodeBlock.tsx:43` |
| 头部栏 | `px-3.5 py-2`，`text-[11px]`，底部 `border-b`，语言标签小写 | `CodeBlock.tsx:46,55` |
| 正文 | `font-mono text-[13px] leading-relaxed`，`overflow-x-auto` | `CodeBlock.tsx:91` |
| 行号 | `tabular-nums`，右对齐，`text-neutral-600` 弱化，`select-none` | `CodeBlock.tsx:97` |
| 复制反馈 | 变绿 + 勾选，**2.5s 后** `saved-check-decay` 平滑淡退 | `CodeBlock.tsx:34-36,75` |
| 图标对齐 | `vertical-align: -0.125em` | `CodeBlock.tsx:51` |

> 上表来自**参考仓库的 `CodeBlock.tsx`**（逆向重建，只还原了暗色示例）。下面是安装的 Claude 桌面端 2.42304.2 的实测值；代码块以它为准。

**真实应用取证（2026-10-21）**：`app/resources/ion-dist/js/c5d464fa3-Dlv8sG-j.js` 定义 `claude-light` / `claude-dark` 两个 Shiki 主题。截图逐像素核对：浅色下 7 个颜色完全一致（距离 0），因此这些值不是推测。

| 项 | 浅色 | 暗色 | 证据 |
| :--- | :--- | :--- | :--- |
| 代码块底 | `#ffffff`（聊天画布上合成 `#fefefd`） | `#1a1a19` | 主题 `bg`（`c5d464fa3:2753`） |
| 前景（普通文本） | `#1a1a1a` | `#eaecf0` | 主题 `fg` |
| 边框 | `#e4e4e3` | `#141414` | border 10% 合成 |
| 头部栏 | 无（复制按钮悬浮） | 无 | 实际截图 |
| 展开的工具行 / 命令行 | 底 `#fcfcfb`，文字 `#52514e` | 底 `#151515`，文字 `#c3c2b7` | tool-row CSS |

语法色（Shiki `tokenColors`，scope → 颜色）：

| 角色 | 浅色 | 暗色 | scope |
| :--- | :--- | :--- | :--- |
| 注释（斜体） | `#999999` | `#818898` | comment |
| 字符串 | `#1e9e3c` | `#9be963` | string |
| 数字 / 常量 | `#cd2054` | `#5eeded` | constant.numeric / constant.language |
| 关键字 / 标签 | `#c5621b` | `#cc7bf4` | keyword / entity.name.tag |
| 函数 / 属性名 | `#0073e6` | `#70b8ff` | entity.name.function / entity.other.attribute-name |
| 类型 / 类 | `#8e6bd9` | `#fbad60` | entity.name.type |
| 变量 / 属性 | `#1a1a1a` | `#eaecf0` | variable / variable.other.property |
| 标点 / 运算符 | `#737373` | `#d3d7de` | punctuation / keyword.operator |
| 正则 / 转义 | `#98801f` | `#ffd014` | string.regexp / constant.character.escape |

**实现映射的限制**：宿主用 `css-variables` 主题，只暴露 9 个 `--shiki-token-*`；`entity.name.type` 被折叠进 `token-function`，所以类型会显示成函数蓝，而不是 `#8e6bd9` / `#fbad60`；`variable.parameter` 用前景色。要逐 scope 分辨，只能替换宿主的 Shiki 主题，纯 CSS 做不到。

主题实现：`CODE_TOKENS`（`palette.js`）保存上表；`codeRules()`（`styles.js`）在 `.md-code-block` 上声明这些变量，作用域只在代码块内，不影响行内代码与工具行。工具行走 `--dsw-alias-markdown-code-block` = `#fcfcfb` / `#151515`。

**头部栏（2026-10-21）**：真实应用没有头部栏，复制是悬浮控件。宿主强制渲染 `[data-code-block-banner]`，主题把它折叠成悬浮层——`bannerWrap` 归零、banner 绝对定位到右上、语言标签（第一个子节点）隐藏、hover / focus-within 时淡入；复制与换行按钮保留。不再画头部分隔线。见 `test/css.test.mjs` 的 “the code banner is a floating copy control”。

**实机验证（2026-10-21，`desktop` profile，CDP）**：`.md-code-block` 计算值为背景 `rgb(255,255,255)`、内描边 `rgb(228,228,227)`、圆角 12px；`--shiki-token-keyword` 浅色 `#c5621b` / 暗色 `#cc7bf4`；banner `position: absolute`、默认 `opacity: 0`、悬停 `1`；`document.fonts.check('12px anthropic-sans')` 为 `true`。宿主 pre 的内边距是 `6px 22px 20px`（代码贴顶），主题改为 `14px 18px`；实测文字距块顶 **14.7px**、距块底 **15.5px**，视为居中。截图：`.work/shots/codeblock/01-light.png`（无头部）、`02-light-hover.png`（悬浮复制）、`03-dark.png`、`04-dark-hover.png`。暗色截图通过给 `body` 加 `data-ds-dark-theme` 验证代码块本身，不是整套暗色 UI 的切换。

**C18 更新**：参考仓库的 `#0d0d0c` 与当前 Claude 不符——真实应用暗色底是 `#1a1a19`，浅色是白。本主题采用实测值，§9.3 D1 记录这一偏离。

圆角与字号不受此影响：`--radius-xl` 12px；代码 12px / 17.5px（§7.3）。§8.5 上表的 `text-[13px]` 是 `CodeBlock.tsx` 的 Tailwind 字面值，与字体表冲突，**裁定用字体表的 12px**（§9.3 D4）。

**行内代码微标（真实应用实测，2026-10-21）**：字号用代码 token（默认 12px，随代码字号缩放；宿主原本的 `.875em !important` 会把它变成 12.25px）；chip 填充 `#f0f0ef`（暗色 `#262625`，即 alpha-1 合成）、`.5px` 的 alpha-10 边、**4px 圆角**、内边距 1px 4px；**文字是砖红色**——浅色 `#8e2626`（red-600）、暗色 `#ec7e7e`（red-300）。参考排版表写 3px 圆角 / 1px 细线，那是编辑器变体；聊天 markdown 的实际规则是 4px / `.5px` / alpha-1 填充，按真实应用取后者（§9.3 D3）。旧实现的 1px 内描边在暖色画布上几乎不可见，已移除。

**chip 的红字（2026-10-21，用户指出后更正）**：真实应用的行内代码文字不是正文墨色。Claude 的散文规则是

```
code:not(pre code){ color: var(--cds-prose-code-color,
                           var(--cds-text-danger, currentColor)); … }
```

`--cds-text-danger` 在浅色解析到 `--cds-role-danger-600` = red-600 `#8e2626`，暗色解析到 `--cds-role-danger-300` = red-300 `#ec7e7e`（`app/resources/ion-dist/css/c6a992d55-*.css`；`--cds-red-600:#8e2626` 见 `src-decompressed/tokens.css` 第 136 行）。同一归属还出现在 `.ReactMarkdown code`、`.tiptap.ProseMirror>p>code` 与编辑器提示区，所以这是**系统的 chip 墨色**，不是某一个界面的偶然。

截图逐像素核对：真实应用正文 `#0b0b0b`（= `--cds-gray-900`），而 28 个 chip 中所有宽 chip 都恰为 `rgb(142,38,38)` = `#8e2626`。主题早前只设了填充与边框、**没设 `color`**，chip 于是继承正文墨色，看起来是纯黑——这正是用户看到的差异。现在 `INLINE_CODE` 的 `light.ink` / `dark.ink` 承载这两个值，`codeRules()` 显式声明 `color`，`test/css.test.mjs` 的 “inline code letters are the app code-chip ink, not body ink” 钉死它（删掉声明该测试即红）。实机 CDP 计算值：浅色 `rgb(142,38,38)`、暗色 `rgb(236,126,126)`。

**链接/按钮内嵌的 code 是唯一例外**：Claude 给它 `--code-chip-ink: var(--cds-text-accent)` 且填充透明。主题没有单独复刻——宿主 markdown 极少这样嵌套，多一条规则换不来可见差异，记在这里以免下次当成遗漏。

**唯一允许纯黑/纯白的位置**：参考只允许代码块用 `#0d0d0c`；真实 Claude 的浅色代码块是**白**、暗色是 `#1a1a19`，主题按后者实现，因此不再使用纯黑。其余任何表面仍**禁止** `#000` 与 `#fff` 硬色（`agents:13`）；纯白只作为 `gray-0` 阶梯端点存在，实际使用时应走 `surface-2/3`。代码块是唯一豁免，且已由 `test/css.test.mjs` 显式放行。

### 8.6 按钮阶梯（`CdsButton.tsx:28-35`）

| Size | 高度 | 内边距 | 圆角 | 字号 |
| :--- | :--- | :--- | :--- | :--- |
| `xxs` | `h-5` = 20px | `px-1.5` | `--radius-sm` 4px | 11px |
| `xs` | `h-6` = 24px | `px-2` | `--radius-md` 6px | 11.5px |
| `sm` | `h-7` = 28px | `px-2.5` | `--radius-lg` 8px | 12px |
| `md`（默认） | `h-8` = 32px | `px-3.5` | `--radius-lg` 8px | 14px |
| `lg` | `h-10` = 40px | `px-5` | `--radius-xl` 12px | 15px + `font-medium` |
| `icon` | `size-8` = 32px | `p-0` | `--radius-lg` 8px | — |

⚠️ **冲突 C16 — 按钮高度**：`v1-02:30-37` 按 rem-scale 计算得 18.82 / 22.59 / 26.35 / 30.12 / 37.65px，`agents:120` 写 24/28/32/40（4 档），`CdsButton.tsx:29-34` 用 Tailwind 定值 20/24/28/32/40（5 档）。**裁定：用 `CdsButton.tsx` 的 20/24/28/32/40**（P1 实际实现，且是整数像素，无亚像素模糊）。`v1-02` 的 30.12px 这类值在非 Retina 屏上会落到半像素边界，产生模糊。

**7 大变体**（`CdsButton.tsx:37-73`）：`secondary`（默认，无边框 + `--cds-fill-secondary`）、`primary`（`bg-clay`）、`ghost`（透明 + hover 填充）、`danger`（`bg-red-600`）、`brand`（`bg-[var(--brand)]`）、`onContent`（半透明 + `backdrop-blur-md`）、`outline`（**仅限空白画布，禁止放入已带边框容器**，`CdsButton.tsx:68`）。

**双层结构**（`v1-02:48`）：外层 `[data-cds="Button"]` 负责定位/焦点/弹簧，内层 `<span data-cds-part="paint">` 负责背景/阴影/圆角（`rounded-[inherit]`）。这解耦了内外尺寸抖动，**必须照此实现**，不要把背景写在外层。

**按压物理**：`.cds-btn-squish` + `--cds-btn-spring`（§6.5），`scale(0.975)` 而非 `0.95`。

### 8.7 卡片与磁贴

- **hover 抬升**：`transform: translateY(-1.5px)` + 阴影切到 `--cds-panel-shadow-hover` + 边框切到 `--cds-border-strong`，过渡 `200ms var(--cds-ease-swift)`（`css:549-561`）；
- **active**：`translateY(0)`（不缩放）；
- **附件磁贴**：桌面网格 `128×96px`（`sbook` 语义，`AttachmentCard.tsx` 的 `tile` 布局），composer 内联 chip 模式圆角 10px（`AttachmentCard.tsx:96`）；
- **入场**：`file-thumbnail-grow-in 250ms cubic-bezier(.165,.84,.44,1)`（`css:476-479`、`AttachmentCard.tsx:99`）；
- **文件类型徽标**：大写字距 `font-mono text-[9px] font-bold tracking-wide`，配色按类别（code=clay、pdf=red、image=emerald、text=blue、archive=amber，`AttachmentCard.tsx:69-84`）—— 注意这些是 Tailwind 类名，非 CDS 令牌。

### 8.8 状态灯与呼吸

- `.status-dot` 严格 **6px** 直径（`css:494-500`）；
- `clay` kind：`3s ease-in-out infinite dframe-clay-breathe`，`scale .86→1` + `brightness .96→1.06`（`css:511-514`、`css:458-461`）；
- `running` kind：`1.2s ease-in-out infinite dframe-dot-blink`，`opacity .3↔1`（`css:504-507`）；
- 思考三点：3px 圆点、`gap: 3.5px`、`1.9s` 循环、阶梯延迟 0/0.15/0.3s、`translateY(2px → -2.5px → 0)`（`css:597-612`）；
- **注意 `top: .26em`**：三点容器整体下沉 0.26em 以对齐文本基线（`css:601`）—— 漏掉这个偏移会让三点浮在文字上方。
- `agents:122` 说呼吸灯是 2.4s，`tw:84` 也写 `2.4s`，但 `css:513` 是 `3s`。**裁定：3s**（P0）；2.4s 是 Tailwind 类的近似覆盖，会与 `css:458-461` 的关键帧节奏不符。

### 8.9 动效纪律（DON'T 清单，`agents:234-239`）

1. **禁止** `transition: all 0.3s linear` / `transition: all 0.5s ease` —— 必须用弹簧预设或 `cubic-bezier(.16,1,.3,1)` 系列；
2. **禁止**夸张的 bouncy CSS 过渡（超过 `--cds-ease-pop` 的 +56% 即为失控）；
3. **禁止**在 streaming 时强制滚到底：`if (Date.now() - lastUserScrollTime < 150ms) return;`（`agents:238`、`useClaudeScrollPinning.ts`）；
4. **禁止**引入二进制字体/音频资产（`agents:236`）；
5. **禁止**给已带边框容器的内部控件加边框（§8.1）。

### 8.10 可访问性硬约束

- 所有动态数字 `tabular-nums`（§7.6）；
- 触控目标 ≥44×44px（靠负边距补偿实现，§8.3）；
- CJK IME 合成守卫：`if (e.nativeEvent.isComposing || e.keyCode === 229) return;`（`agents:221-230`、`ChatComposer.tsx:79-81`）—— 这是**必须**的，否则中文用户按 Enter 选词会直接发送；
- 焦点环必须有实色主环（§5），不依赖半透明色（暗色下会消失）；
- `prefers-reduced-motion` 包裹循环动效（参考 `css:690-713` 的 `@media (prefers-reduced-motion: no-preference)` 写法）。

---

## 9. 冲突清单汇总（裁定表）

| ID | 冲突点 | 来源 A | 来源 B | 裁定 | 一句话理由 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **C1** | Surface 0–3 取值与方向 | `agents:37-41`：`#fcfcfb/#fbfbfa/#f7f7f5/#efeee9`，索引越大越暗 | `css:90-94`：`#f9f9f7/#fcfcfb/#ffffff/#ffffff`，索引越大越亮 | **B（CSS）** | A 的 10 个值中 9 个不在 35 阶 ramp 上，且层级方向与 B 相反 |
| **C2** | 暗色 popover | `css:289` `#2c2c2a` | `ChatComposer.tsx:169` `#222220` | **A（CSS）** | `#222220` 不在 ramp 上，是组件近似值 |
| **C3** | 文本三阶 | `agents:46-48` 暖灰 `#1f1e1d/#6b6966/#999793` | `css:139-141` 中性灰 `#151515/#525252/#8a8a8a` | **B（CSS）** | 中性灰是"不与语法高亮混色"的明确设计决策 |
| **C4** | 边框透明度 | `agents:49-50` `0.06 / 0.08 / 0.12` | `css:99-100` `0.10 / 0.20` | **B（CSS）** | `0.06` 与 `0.08` 差 2%，肉眼不可辨，是伪层级 |
| **C5** | Clay 阶梯 | `agents:53-55` `clay-500/600/700` 三级，暗色 `#cc6b49` | `css:11-13`+`tw:14-17` 四值 `clay/hover/light/dark`，暗色 `#d97757` | **B（CSS+tw）** | `clay-600/700` 在仓库中不存在；A 的暗色方向与 B 相反 |
| **C6** | 气泡圆角 18px | `agents:61`、`tw:62`、`v1-01:83` 均称 18px | `css:176` 公式在默认 `--cds-radius:8px` 下得 **11.76px** | **A 的字面值 + B 的公式** | 需显式设 `--cds-radius: 14px` 才能得到 18px；`--cds-radius` 在 P0 中未定义 |
| **C7** | card 圆角 10px vs 12px | `agents:64` `--cds-radius-card` = 10px | `css:151` `--cds-panel-radius` 10px；`css:158` `--radius-card` 公式 ≈12px | **两者都实现** | AGENTS 把两个不同令牌混为一个 |
| **C8** | Composer 20px vs 12/14px | `css:155`、`ChatComposer.tsx:102` = 20px | `v2-03:83`、`sbook:150` 2.0 降为 12/14px | **20px** | 20px 是 CDS 签名几何；12px 会与 `--radius-xl` 撞形 |
| **C9** | 焦点环配方 | `agents:56` `0 0 0 2px surface-0, 0 0 0 4px rgba(clay,.4)` | `css:130` 三层 `inset 1px surface-1, 1.5px clay, 6px/0.25 glow` | **B（CSS）** | A 无实色主环（暗色/彩底会消失），且引用 C1 的伪令牌 |
| **C10** | 4 组弹簧参数+命名 | `agents:84-95`（600/30/0.6 等） | `motion:64-120`（600/30/1.0 等）+ `v1-04:156-161` | **B（motion.ts）** | A 的 `mass` 值在代码中不存在，且语义映射与 B 正好相反；A 还把 ζ 算错 |
| **C11** | 贝塞尔曲线数量 | `v2-04:61-73` 仅 3 条 | `css:204-223` 10 条 | **B（CSS）** | v2-04 是摘要章节 |
| **C12** | 滚动遮罩宽度/配方 | `v2-02:139` 24px；`agents:154-165` 7 档 | `css:196` 28px；`css:820-821` 8 档滚动驱动 | **28px + 二选一配方** | 28px 有 P0 与 v1-01 双重支持；两套档位不可混用 |
| **C13** | 字体栈 | `css:231-234`、`tw:28-52`、`v1-01:331` 三套不同 | — | **原版 Anthropic Web 字体（6 个 woff2 内联）+ 思源 CJK 回退** | 用户要求原版字体；Anthropic 字体无 CJK 码位，中文必须回退（§7.2） |
| **C14** | body 字号 | `v1-01:350` 12.24px | `css:190` `--chat-body`（缩放后 ≈13.18px）；`v1-01:540`、`sbook:663` 14px | **14px（实现基准）** | 13.18 是 rem-scale 后的表达式值，不是独立设计值（§7.3） |
| **C15** | 暗色字重补偿 | `v1-01:391-394` 460 / 550 | `css:376-385` 465 / 560；真实应用为可变字重 | **460 / 550 + Regular 360** | 宿主只接受静态字重，5–10 刻度不可辨（§7.4） |
| **C16** | 按钮高度 | `v1-02:30-37` 18.82/22.59/26.35/30.12/37.65 | `CdsButton.tsx:29-34` 20/24/28/32/40 | **B（实现）** | 整数像素，无亚像素模糊 |
| **C17** | 呼吸灯周期 | `agents:122`、`tw:84` 2.4s | `css:513` 3s | **B（CSS）** | 与 `css:458-461` 关键帧节奏配套 |
| **C18** | 代码块底色 | 参考仓库 `#0d0d0c`（无浅色变体） | 真实 Claude 2.42304.2：浅色 `#ffffff` / 暗色 `#1a1a19` | **真实应用** | 截图逐像素核对；参考示例只还原了暗色（§8.5） |

### 9.1 `cds-theme.css` 中被引用但未定义的令牌（主题必须补齐）

| 令牌 | 引用位置 | 后果 | 建议值 |
| :--- | :--- | :--- | :--- |
| `--cds-dur-fast` / `-snap` / `-base` / `-sheet` / `-slow` | `css:486,435` | 按钮弹性动画静默失效 | 60ms / 120ms / 200ms / 300ms / 450ms（`v2-04:53-57`） |
| `--cds-radius` | `css:157,158,164` 的 `var(..., 8px)` | `--radius-card` / 气泡圆角取 8px 基准 | `14px`（若要 18px 气泡）或 `8px`（若要 12px 气泡） |
| `--cds-bg-neutral` | `css:173` | `--cds-bg-user-message` 解析失败 | 用 `--cds-bg-tint-blue` `#f0f4f8` / `rgba(255,255,255,0.06)`（`css:142,296`） |
| `--cds-bg-neutral-hover` | `css:642` | hover 态解析失败 | `--cds-surface-3` |
| `--cds-text-tint-blue` | `css:175`（有回退 `#193c5f`） | 回退生效，可接受 | `#193c5f` |
| `--cds-pad-lg` / `-md` / `-xs` | `css:177-178`、`v1-05:612-613` | 有回退 16/12px | 16 / 12 / 4px |
| `--cds-font-size-*`（7 档） | 全文未出现，仅 `v1-01:355-381` | 无法直接使用 | 按 §7.3 声明 |
| `--cds-h-control` / `--cds-icon` / `--cds-gap-*` | 仅 `v2-03:96-111` | 尺寸阶梯缺失 | 紧凑 24/16px，舒适 32/20px |
| `--cds-anim-dur` / `--cds-anim-ease` | `css:682,655,666` | 可变字形动效取回退 | `0.3s` / `cubic-bezier(.34,1.3,.64,1)` |

### 9.2 实现自检清单

写主题 CSS 时逐项核对：

- [ ] 35 阶 gray + 35 阶 orange ramp 全部落地（§1）
- [ ] `surface-0..3 + popover` 双向重载，方向律正确（浅色越上越亮、暗色越上越亮，但起点不同）（§2.1）
- [ ] `alpha-0..4` 用 `hsla`，**不是** `rgba(0,0,0,…)`（§2.3）
- [ ] `--brand` 与 `--cds-clay` 双轨分离，暗色 hover 是**提亮**（§2.4）
- [ ] `--cds-ring-inner/outer` 在明暗模式**互换**（§2.7）
- [ ] `--cds-radius` 显式赋值（否则气泡/卡片圆角退化）（§9.1）
- [ ] 5 个 `--cds-dur-*` 显式声明（否则按钮弹簧失效）（§6.3）
- [ ] 10 条贝塞尔曲线 + `--cds-btn-spring` linear()（§6.4、§6.5）
- [ ] 暗色 460/550/660 光学补偿 + Regular 360，并附 `font-weight` 数值回退（§7.4）
- [ ] `--cds-rem-scale: calc(16/17)` 声明（§7.1）
- [ ] CJK 四段回退链完整（§7.2）
- [ ] 所有 `border` 改为 `box-shadow: 0 0 0 1px` / `inset 0 0 0 1px` 以避免 1px 抖动（§4.3）
- [ ] 容器内 Secondary/Chip 无边框（§8.1）
- [ ] 代码块采用真实应用值：浅色 `#ffffff` / 暗色 `#1a1a19`（§8.5）
- [ ] 三点思考 `top: .26em` 对齐（§8.8）
- [ ] 数字 `tabular-nums`（§7.6）
- [ ] IME 合成守卫（§8.10）

### 9.3 已知实现偏差（与参考不同，已裁定）

| # | 项 | 参考 | 实现 | 原因 |
|---|---|---|---|---|
| D1 | 代码块底色 | 参考仓库 `CodeBlock.tsx` 写死 `#0d0d0c`（无浅色变体） | 浅色 `#ffffff` / 暗色 `#1a1a19` | 真实 Claude 2.42304.2 的 `claude-light` / `claude-dark` 主题实测（§8.5） |
| D2 | muted 文本 | `#8a8a8a` / `#666666` | `#767676` / `#85837e` | 正文尺寸 AA 4.5:1；参考值只有 3.45:1 / **3.03:1**（§2.2） |
| D3 | 行内代码 chip | 排版表 3px / 1px 线 / 无填充 | 4px + `.5px` 边 + `#f0f0ef`/`#262625` 填充 + `#8e2626`/`#ec7e7e` 红字 | 真实应用的聊天 markdown 规则；旧内描边几乎不可见，且漏了红字（§8.5） |
| D4 | 代码块字号 | 字体表 12px / §8.5 表 13px | 12px / 17.5px | 取字体表；13px 是组件 Tailwind 字面值（§8.5） |
| D6 | 暗色实色填充的 hover | 提亮（`#e08264`） | 加深（`mix(fill, #000, 10%)`） | 白字在提亮后的暗色 fill 上只有 **2.78:1**（§2.4） |
| D7 | 字体来源 | 参考仓库用系统回退（`agents:21-23` 禁止二进制字体） | 6 个原版 Anthropic woff2 + 2 个思源子集内联 | 用户要求原版 Anthropic 字体；Anthropic 字体无 CJK 码位（§7.2） |

**D5 已对齐（2026-10-21）**：暗色 surface-0 从 `#151515`/`#121211` 回退到参考的 `#0b0b0b`，surface-1 保持 `#151515`，后续沿参考阶梯 `#1a1a19 → #20201f → #2c2c2a`（R 差 5/6/12，不是"每阶 2"）（§2.1）。

这六处不是漏改，是**有证据的偏离**；改动它们之前先读对应章节的裁定与测试守卫。

---

*本规范由 `.reference/open-claude-ui` 逐行取证生成；所有数值均附 `文件:行号`。凡标注「未定义」者，仓库中确实不存在，已给出最近已记录值及裁定理由。*
