# 排印核对：本机产物 vs 参考仓库 · Typography Cross-Check

> **性质**：新增的独立核对条目。不改动仓库里已有文档的任何结论，只把「本机已安装产物」的实测值
> 与 `.reference/open-claude-ui` 的排印记载逐条对照，列出**确认一致**、**需要补充**、**确有出入** 三类。
>
> **另含一节「工具卡片实测」（§5）**：这一节不是与参考仓库比对，而是补参考仓库完全没写的一块 ——
> 工具调用卡片的字体/字号/字重/字距。因为参考仓库的 v1-03 只写了「代码块表面（深色终端）」，
> 没写工具行的排印。
>
> **取证对象**：Claude Desktop `2.42304.2`（MSIX 安装）
> `C:\Program Files\WindowsApps\Claude_2.42304.2.0_x64__pzs8sxrjxfjjc\app\resources\ion-dist\assets\v1\c6a992d55-sXiDGMFQ.css`（1,792,944 B，640 个顶层规则块）
> 与 `frame-window-054FFK51.js`（density 覆盖块）、`shared-frame-BfjMqbuN.js`（density 默认值）、
> `c734f318c-BSUCqMkp.js`（工具行组件 `TurnStatusStep`）。
>
> 原始抽取产物（可复核）：`C:\Users\17445\Desktop\rea\claude-ui-re\` 下的
> `typography-authoritative.txt` / `token-selectors.txt` / `wght-selectors.txt` / `two-weight-systems.txt` / `font-vars.txt` / `font-face.txt` / `letter-spacing.txt` / `font-utility-overrides.txt` / `typography-usage.txt`
>
> 行号写法：`css:N` 指上述 CSS 文件的行；`ref:v1-01:N` 指参考仓库 `docs/v1/01-设计哲学与设计令牌体系.md`。

---

## 本组文档索引

本次核对产出的是一组独立条目，互不覆盖。按主题查：

| 文档 | 内容 | 与本文的关系 |
| --- | --- | --- |
| **`typography-cross-check.md`**（本文） | 排印令牌权威台账 + 与参考仓库的版本核对 + 工具卡片排版总览（§5） | — |
| `tool-cards-shell.md` | **总外壳篇**：所有工具共用的卡片组件 `YH`、DOM 骨架、折叠机制、状态机、图标 6 张映射表、两套壳差异 | 其 §10 是本文 §5 的逐元素明细；两套壳字号差异见本文 §5.2b |
| `tool-cards-read.md` | Read 工具卡（复用文件卡 `vU/_U`）、行号真相、shiki 高亮、图片/PDF、附件胶囊 | 其 §11 是本文 §5 在 Read 上的应用 |
| `tool-cards-edit-write.md` | Edit / Write / MultiEdit / NotebookEdit：参数归一化、diff 交接、失败态、路径展示 | 其 §9 是本文 §5 的延伸（注意本文已标注其 compact 档口径） |
| `tool-cards-diff.md` | Diff 渲染器（`diffs-container` Web Component + Shadow DOM）、行模型、词级 diff、文件树、性能阈值 | 其 §10 是本文 §5 在 diff 上的应用 |
| `tool-cards-bash-terminal.md` | Bash 卡、内联命令块、xterm 真实终端、后台任务；终端是唯一脱离行高令牌的地方 | 其 §6 与本文 §5.4 对应 |
| `tool-cards-search-plan.md` | Grep/Glob/WebSearch/WebFetch、TodoWrite/Plan、Task/子代理、AskUserQuestion | 其 §9 是本文 §5 的逐元素明细延伸 |

六份文档共享同一基线：**1rem = 16px（`--cds-rem-scale` 在桌面端不生效）**，
**`<html data-density="comfortable">` 是写死在 `ion-dist/index.html` 里的静态属性**（不是运行时推断）。

字号共有**四套机制**并存，引用时必须说清是哪一套（详见本文 §5.1c 与 §5.2b）：

| # | 机制 | 例 | 受 density 影响 |
| --- | --- | --- | --- |
| A | CDS 语义令牌 | `text-body` / `text-code` / `text-caption` | ✅ |
| B | Tailwind 原生 | `text-xs` / `text-sm` / `text-base` | ❌ |
| C | 对话区覆写 | `--chat-body` | 部分 |
| D | 聊天容器 `--msg-*` | `--msg-timeline-font-size` / `--msg-code-font-size`（含 `!important`） | ❌ 固定 |

---

## 0. 总判定

**参考仓库没有错，它只是写的是另一个版本。**

| 项 | 版本 |
| --- | --- |
| 参考仓库逆向对象 | **Claude Desktop v2.37337.1** |
| 本次核对的本机产物 | **Claude Desktop 2.42304.2** |

逐条核对后，字号阶梯、字体栈、CJK 回退、`rem-scale`、暗色减薄思路全部能在本机产物里找到对应；
差异集中在 4 个数值上，且都能用**版本漂移**解释（详见 §3.0）。

| 类别 | 条数 |
| --- | --- |
| ✅ 确认一致（可据以实现） | 11 |
| 🟡 参考缺失 / 需补充（产物里有、参考未记） | 9 |
| ⚠️ 版本漂移导致的数值差异（原因已定位） | 4 |
| ➕ 参考完全未覆盖（工具卡片排印，见 §5） | 1 大节 |
| **🚫 结论** | **无需修改参考仓库的任何结论**；本文档只做"补全 + 版本标注" |

---

## 1. ✅ 确认一致

### 1.1 光学缩放基准 —— 值一致，但**桌面端不生效**

```css
@supports (font: -apple-system-body) and (-webkit-touch-callout: default) {
  :root { font: -apple-system-body; font-family: var(--font-ui);
          --cds-rem-scale: calc(16 / 17); line-height: 1.5; }
}
```

值 `calc(16 / 17)` 与 `ref:v1-01:629` 一致。**但它在 `@supports` 条件内** ——
`-apple-system-body` 是 iOS WebKit 的特征，**桌面 Electron 不满足该条件**，因此：

- 桌面端 `--cds-rem-scale` **未定义**
- 所有 `calc(... * var(--cds-rem-scale, 1))` 取 fallback **1**
- **1rem = 16px，字号就是令牌字面值（14px / 20px 等整数）**

> 参考仓库把它记成"所有字号/间距令牌都乘这个系数"，在 iOS 语境下成立，**桌面端不成立**。
> 这一条是本次核对中唯一一处"参考结论在目标平台上不适用"的地方，值得在 `docs/cds-spec.md` §7.1 补一句环境限定。

**佐证**：按 1 算全部令牌都是整数（12/13/13/14/15/22…）；按 0.941176 算会得到 13.18/18.82 这类非设计值。
设计系统不会用非整数结尾的 rem 值，这反向证明桌面端取 1。

### 1.2 CJK 回退链

| 令牌 | 产物值 | 参考 |
| --- | --- | --- |
| `--font-cjk-sans-sc` | `"PingFang SC"` | ✅ 同 |
| `--font-cjk-sans-tc` | `"PingFang TC"` | ✅ 同 |
| `--font-cjk-sans-jp` | `"Hiragino Sans"` | ✅ 同 |
| `--font-cjk-sans-kr` | `"Apple SD Gothic Neo"` | ✅ 同 |

补充：产物里这条链的顺序**按语言动态重排**（4 组规则），参考仓库只记了默认顺序：

```css
:root:lang(zh-Hans)                        → sc 优先
html[data-cjk-order=zh-hant], :root:lang(zh-Hant) → tc 优先
html[data-cjk-order=ja],      :root:lang(ja)      → jp 优先
html[data-cjk-order=ko],      :root:lang(ko)      → kr 优先
```

### 1.3 字体栈主结构

`--font-anthropic-sans: "anthropic-sans", var(--font-sans-fallbacks)`、
`--font-anthropic-mono: "anthropic-mono", ui-monospace, monospace`、
`--font-sans-fallbacks: system-ui, "Segoe UI", Roboto, Helvetica, Arial, <CJK>, <script>, sans-serif`
—— 与 `ref:v1-01:642-644` 逐字一致。

### 1.4 三个字族都是可变字体（`300 800`），且**字体文件随包分发**

```css
@font-face { font-family: anthropic-sans;   font-weight: 300 800; }   /* + italic */
@font-face { font-family: anthropic-serif;  font-weight: 300 800; }   /* + italic */
@font-face { font-family: anthropic-mono;   font-weight: 300 800; }   /* + italic */
```

这证实了参考仓库"字重靠 wght 轴"的前提成立。

**字体的实际落盘文件**（`ion-dist/assets/v1/`，共 40 个 `.woff2`，其中 6 个是 Anthropic 三族）：

| 字体 | Roman | Italic | 大小 |
| --- | --- | --- | --- |
| `anthropic-sans` | `cc27851ad-DDVos-BJ.woff2` | `c9d3a3a49-CJtkx3-S.woff2` | 115 KB |
| `anthropic-serif` | `c66fc489e-2VcCjn5t.woff2` | `cc410af59-Dcb-9NUS.woff2` | 162 KB |
| `anthropic-mono` | `c5dbe0935-CQcSkHaI.woff2` | `c2f08283e-CZqJpOsc.woff2` | 64 / 68 KB |
| `Anthropicons-Variable`（图标） | `c0f671921-cvFTkbeX.woff2` | — | 100 KB |

**这一条解决了一个关键疑问**：`anthropic-mono` **确实随应用分包分发**，不是靠系统里恰好装了 SF Mono。
所以 `--cds-font-mono` 在 Windows 上解析到的是**原版 Anthropic Mono**，不会回退到 `ui-monospace` / `Consolas`。

### 1.5 `font-display: swap`、`"dlig" 0` 与连字强制关闭

三个 Anthropic 字族的 `font-feature-settings` 都显式关掉了 discretionary 连字：`"dlig" 0`。
参考仓库未记这一条，但它是"Claude 正文没有装饰性连字"的原因。

代码路径上还有更强的一层（`04-read-tool.md` 的实证）：

```css
code, pre, kbd, samp, [class*=font-mono] {
  font-variant-ligatures: none;
  font-feature-settings: "calt" 0, "liga" 0;
}
```

**强制关闭所有连字**，保证「字符数 ↔ 列宽」严格一一对应 —— 这是代码块与 diff 能用 `ch` 单位做对齐的前提。
而 diff 渲染器自己又单独声明了 `font-feature-settings: var(--diffs-font-features, "liga","clig","calt")`（默认开启），
两者作用域不同：**Claude 的 `code/pre` 规则管普通代码块，diff 的 Shadow DOM 内部规则管 diff 行**。

### 1.6 字号令牌的表达式形式

`calc(.6875rem * var(--cds-rem-scale,1))` 这类写法与参考 `ref:v1-01:679-685` 的表完全对得上。

### 1.7 行高令牌结构

`--cds-leading-{caption,footnote,code,body,heading,title,prose}` 七档齐全，命名与参考一致。

### 1.8 `--chat-*` 对话区令牌

```css
--chat-body: calc(.875rem * var(--cds-rem-scale,1));
--chat-leading: 1.42857;
--chat-turn-gap: calc(var(--chat-body) * var(--chat-leading) * .75);
--chat-item-gap: calc(var(--chat-body) * var(--chat-leading) * .5);
```
与 `ref:v1-01:691-695` 逐字一致（已在 `docs/cds-spec.md` §7.3 记录）。

### 1.9 字距令牌

| 类 | 值 |
| --- | --- |
| `.tracking-tight` | `-.025em` |
| `.tracking-normal` | `0em` |
| `.tracking-wide` | `.025em` |
| `.tracking-wider` | `.05em` |
| `.tracking-widest` | `.1em` |

`ref:v1-01:449` 说"工件语言标签用 `letter-spacing: 0.05em`" —— 对应 `--tracking-wider`，✅ 一致。

### 1.10 行内图标光学基线

`.align-neg-125 / .align-neg-075 / .align-neg-1px` 三个类在产物中存在，值与 `ref:v1-01:730-732` 一致。

### 1.11 正文基准 14px / 20px

产物 `.cds-root[data-density=comfortable]` 给出 `--cds-font-size-body: .875rem`、`--cds-leading-body: 1.25rem`，
与参考结论（`ref:v1-01:540` 的 `.text-body-regular` 14px/20px）**一致**。
而且 React 侧默认密度**就是 comfortable**：

```js
// shared-frame-BfjMqbuN.js
var la = G("comfortable");                    // createContext 默认值
var oa = { compact: 2, comfortable: 4 };      // density → base step
```

→ **参考仓库取 14px 是对的**，`docs/cds-spec.md` §7.3 的裁定（C14：正文 14px / 行高 20px）成立，无需修改。

---

## 2. 🟡 参考缺失，产物里有（建议补充）

以下都是产物中实测存在、但参考仓库文档未记载的内容。按"补全笔记"归类，**不构成冲突**。

### 2.1 两档 density 并存（最关键的一条）

`--cds-font-size-*` 与 `--cds-leading-*` 各有两个正规定义，**不是一套**：

| 令牌 | `.cds-root`（compact 基准） | `[data-density=comfortable]`（**默认**） |
| --- | --- | --- |
| `--cds-font-size-caption` | `.6875rem` | `.75rem` |
| `--cds-font-size-footnote` | `.75rem` | `.8125rem` |
| `--cds-font-size-code` | `.75rem` | `.8125rem` |
| `--cds-font-size-body` | `.8125rem` | `.875rem` |
| `--cds-font-size-heading` | `.875rem` | `.9375rem` |
| `--cds-font-size-title` | `1.25rem` | `1.375rem` |
| `--cds-font-size-prose` | `.875rem` | `1rem` |
| `--cds-leading-caption` | `1.0625rem` | `1.0625rem` |
| `--cds-leading-footnote` | `.9375rem` | `1.0625rem` |
| `--cds-leading-code` | `1.0625rem` | `1.1875rem` |
| `--cds-leading-body` | `1.1875rem` | `1.25rem` |
| `--cds-leading-heading` | `1.125rem` | `1.25rem` |
| `--cds-leading-title` | `1.5625rem` | `1.75rem` |
| `--cds-leading-prose` | `1.25rem` | `1.5rem` |

参考仓库的表格里 caption 处是 `.6875rem`、body 处是 `.875rem` —— 前者取 compact、后者取 comfortable，**混用了两档**。这是出入来源（见 §3.2）。

### 2.2 五阶用户字号（`data-step="1..5"`）

用户设置里的字号滑块映射到 `data-step`，每档独立覆盖字号与行高：

| step | body | caption | prose | leading-body |
| --- | --- | --- | --- | --- |
| 1 | `.75rem` | `.625rem` | `.8125rem` | `1.0625rem` |
| 2 | `.8125rem` | `.6875rem` | `.875rem` | `1.1875rem` |
| 3 | `.875rem` | `.75rem` | `.9375rem` | `1.25rem` |
| 4 | `.875rem` | `.75rem` | `1rem` | `1.25rem` |
| 5 | `.9375rem` | `.8125rem` | `1.125rem` | `1.375rem` |

换算规则（`shared-frame-BfjMqbuN.js`）：

```js
var oa = { compact: 2, comfortable: 4 };       // density → base step
var sa = { xs: -2, sm: -1, base: 0, lg: 1 };   // data-size 修正
function ca(e, t) { let n = oa[e] + sa[t ?? "base"]; return n < 1 ? 1 : n > 5 ? 5 : n; }
```

参考仓库完全没有这一层。

### 2.3 对话文本三档（`data-text-size`）

```css
--cds-font-size-body--textsm / --textmd / --textlg
--cds-leading-body--textsm  / --textmd / --textlg
```
作用于 `[data-cds=AssistantMessage]`、`[data-cds=UserMessage]`、`[data-cds=ChatComposerQueuedMessages]`。
另有 `.epitaxy-transcript-typography` 的 `[data-chat-text-size=s|l]`：

```css
[data-chat-text-size=s] { --chat-body: calc(.8125rem * s); }
[data-chat-text-size=l] { --chat-body: calc(.9375rem * s); --chat-leading: 1.46667; }
```

### 2.4 26 条语义文本类的完整矩阵

产物定义的不是 7 档，而是 **size × weight 的完整笛卡尔积**（26 个类）：

`text-{body|caption|footnote|heading|title|code}-{regular|medium|semibold|bold}`，
另有 `text-code`（无色重版）、`text-prose`、`text-label`、`.font-claude-response*` 系列。

每个类**同时**声明 `font-weight` 与 `--cds-font-axis-wght` + `font-variation-settings`。

### 2.5 GRAD 轴恒为 0

每个 `font-variation-settings` 都以 `"GRAD" var(--cds-font-grad, 0)` 结尾，而 `--cds-font-grad` **全文从未定义**。
→ GRAD 轴永远取 fallback `0`。参考仓库未记这条，但它解释了为什么 GRAD 在效果上不存在。

### 2.6 serif 展示级的 opsz 轴

| 类 | 字体 | `font-variation-settings` | `font-size` | `font-weight` | `line-height` |
| --- | --- | --- | --- | --- | --- |
| `.font-display` | serif | `"opsz" 48` | `2.375rem` (38px) | `330` | `1.2` |
| `.font-heading` | serif | `"opsz" 24` | `1.5rem` (24px) | `500` | `1.3` |
| `.font-title` | serif | `"opsz" 28` | `1.75rem` (28px) | `500` | `1.3` |
| `.font-xl` | sans | `"opsz" 20` | `--cds-font-size-title` | `--cds-font-weight-regular` | `--cds-leading-title` |
| `.font-xl-bold` | sans | `"opsz" 20` | 同上 | `--cds-font-weight-semibold` | 同上 |
| `.font-claude-response-heading` | `--font-claude-response` | `"opsz" 20` | `1.25rem` | `600` | `1.4` |
| `.font-claude-response-title` | 同上 | `"opsz" 28` | `1.75rem` | `600` | `1.3` |

参考只记了 `.font-display` 一行，且未提 `.font-claude-response*` 这一族（它是会话正文的 serif 可选字体）。

### 2.7 `--font-claude-response` 是双值变量

```css
--font-claude-response: var(--font-ui)          /* sans，默认 */
--font-claude-response: var(--font-anthropic-serif)  /* serif，另一档 */
```
会话正文可在 sans / serif 之间切换，走这一个变量。

### 2.8 Mono 有两套栈，**`.cds-root` 那套生效 → 代码用 Anthropic Mono**

同一份 CSS 里 `--cds-font-mono` 有**两条**定义，分属不同选择器：

```css
/* [1] :root —— 系统等宽栈 */
:root {
  --cds-font-mono: var(--cds-font-mono-override,)
                   ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
                   "Liberation Mono", "Courier New", monospace;
}

/* [2] .cds-root —— Anthropic 优先栈（选择器特异性更高，且声明在后 → 生效） */
.cds-root {
  --cds-font-mono: var(--cds-font-mono-override,)
                   var(--font-anthropic-mono, "SF Mono"), "SF Mono",
                   ui-monospace, Menlo, Consolas, monospace;
}

--font-anthropic-mono: "anthropic-mono", ui-monospace, monospace;
```

**实际生效的栈**（`.cds-root` 覆盖 `:root`）：

```
--cds-font-mono-override（全 CSS 从未赋值 → 空）
→ var(--font-anthropic-mono, "SF Mono")
→ "SF Mono"
→ ui-monospace, Menlo, Consolas, monospace
```

展开后：**`anthropic-mono` → `"SF Mono"` → `ui-monospace` → `Menlo` → `Consolas` → `monospace`**

**结论：代码默认使用 `anthropic-mono`（可变字体 300–800），不是系统等宽。**

`--cds-font-mono-override` 在全部 25 个 CSS 文件里**从未被赋值**（只有 2 次消费），所以它恒为空。

`.font-mono` 工具类的写法会让人误判：

```css
.font-mono { font-family: var(--font-mono); font-family: var(--cds-font-mono); }
```

第二行覆盖第一行 —— 但两行的最终值都指向同一个 Anthropic 优先栈（`--font-mono` = `var(--cds-font-mono)`，`:root` 侧另有 `var(--font-anthropic-mono)` 的一版），结果一致。

> **自查记录**：本文档早期版本曾写"默认是系统等宽"，是只看了 `:root` 那条、漏了 `.cds-root` 覆盖。已修正。
> 验证脚本：`check-mono.mjs`（输出见 `mono-resolution.txt`）。

参考 `ref:v1-01:644` 记录了 `--font-anthropic-mono`，方向是对的。

### 2.9 度量对齐的回退字体（`size-adjust`）

产物有 4 个 `local()` 克隆字体，用 `size-adjust` + `ascent/descent/line-gap-override` 抵消回退时的字宽/行高跳变：

```css
@font-face { font-family: "Anthropic Serif Fallback Georgia"; src: local(Georgia);
             size-adjust: 104.79%; ascent-override: 94.71%; descent-override: 24.57%; line-gap-override: 0%; }
@font-face { font-family: "Anthropic Serif Fallback Times";  size-adjust: 114.99%; ascent: 86.31%;  descent: 22.39%; }
@font-face { font-family: "Anthropic Serif Fallback DejaVu"; size-adjust: 90.15%;  ascent: 110.1%;  descent: 28.56%; }
```
参考仓库未记，这对"字体加载失败时不跳版"有实际价值。

### 2.10 硬编码字距清单

`c6a992d55` 共 17 处 `letter-spacing`，除 5 个 `--tracking-*` 引用外，还有裸值：

`-.01em`、`-.03em`、`-.3px`、`-.4px`、`.08em`、`.09em`、`.12em`、`.2em`、`.3em`、`5px`、`inherit`×2

即：**字距不是统一值**，大字负收紧（`-.03em`）、大写小标签正放宽（`.08em`–`.12em`）、还有亚像素级（`-.3px`/`-.4px`）。

---

## 3. ⚠️ 数值出入（根因：版本不同 + 两套并行体系）

### 3.0 先定版本边界——这条必须先读

| 项 | 版本 |
| --- | --- |
| 参考仓库 `.reference/open-claude-ui` 逆向对象 | **Claude Desktop v2.37337.1**（`docs/v2/01-综述与版本边界.md:5,17`，捆绑 CLI 2.1.295） |
| 本次核对的本机产物 | **Claude Desktop 2.42304.2**（`app.asar/package.json` 的 `"version": "2.42304.2"`，捆绑 CLI 2.1.299） |

两者不是同一版本。参考仓库自述的提取来源是 `c6a992d55-C0zTICcS.css`，
本机是 `c6a992d55-sXiDGMFQ.css` —— **同一个内容哈希 `c6a992d55`，不同的构建后缀**。
这说明 CSS 主体未变，但**被后续版本追加了规则**。

> **因此：下文的数值差异，绝大多数应理解为"上游在 2.37337.1 之后改了值"，而不是"参考抄错了"。**
> 参考仓库在它自己的版本语境下是准确的。本节的作用是标出"哪些值在本机版本上已经不是那个数了"。

### 3.1 暗色字重：本机有两套并行体系，参考只记了一套

在 `c6a992d55-sXiDGMFQ.css` 里，暗色减薄有**两条独立路径**，数值不同：

**路径 A —— 语义类，走 `--cds-font-wght-*` 令牌**

```css
/* 选择器（三条，覆盖三种暗色声明） */
@media screen
  [data-mode=dark] .cds-root:not([data-mode=light]):not([data-mode=system]),
  .cds-root[data-mode=dark]                       { --cds-font-wght-regular: "wght" 360; … }
@media screen and (prefers-color-scheme: dark)
  [data-mode=system] .cds-root:… ,
  .cds-root[data-mode=system],
  .cds-root:not([data-mode]):not([data-mode] *)    { --cds-font-wght-regular: "wght" 360; … }
@media screen
  .cds-dark-scope[data-mode=dark]                  { … }
```

| 令牌 | 暗色值 |
| --- | --- |
| `--cds-font-wght-regular` | `"wght" 360` |
| `--cds-font-wght-medium` | `"wght" 460` |
| `--cds-font-wght-semibold` | **`"wght" 540`** |
| `--cds-font-wght-bold` | **`"wght" 560`** |

**路径 B —— Tailwind 工具类，写死字面值**

```css
[data-theme=claude][data-mode=dark] .font-normal   { --cds-font-axis-wght: "wght" 360,; … }
[data-theme=claude][data-mode=dark] .font-medium   { --cds-font-axis-wght: "wght" 460,; … }
[data-theme=claude][data-mode=dark] .font-semibold { --cds-font-axis-wght: "wght" 560,; … }
[data-theme=claude][data-mode=dark] b,
[data-theme=claude][data-mode=dark] strong,
[data-theme=claude][data-mode=dark] .font-bold     { --cds-font-axis-wght: "wght" 660,; … }
```

（`system` 模式走 `@media (prefers-color-scheme: dark)` 内的一份**完全相同**的副本）

| 类 | 暗色 wght |
| --- | --- |
| `.font-normal` | `360` |
| `.font-medium` | `460` |
| `.font-semibold` | **`560`** |
| `.font-bold` / `b` / `strong` | **`660`** |

**为什么会有两套，以及哪一套在用**：

- `.text-*` 语义类用于「排印档位已确定」的场景（正文、caption、卡片标题…），字号字重行高一起定义。
- `.font-*` 工具类是即时强调，只改字重不改字号行高。

实测使用分布（在 `ion-dist/assets/v1/*.js` 的 class 字符串里统计）：

| 类族 | 出现次数 |
| --- | --- |
| `font-semibold` | 451 |
| `text-*-semibold` | 264 |

**关键：两族在真实 DOM 里没有共现。** 扫描全部 chunk 的 class 字符串，找不到同时含 `text-*-{weight}`
与 `font-{weight}` 的样例 —— 它们被用在不同的组件上，不是"靠层叠决定胜负"的关系。

所以两套数值**都真实生效**，取决于那个组件选了哪一族：

| 场景 | 用的类 | 暗色 wght |
| --- | --- | --- |
| 语义排印（正文/标题/说明） | `.text-body-semibold` 等 | **540** |
| 即时强调（按钮、标签、强调文字） | `.font-semibold` / `b` / `strong` | **560**（`b`/`strong`/`.font-bold` → **660**） |

若非要选一个"代表值"，取 **560**：它覆盖了更多真实调用点（451 vs 264），且 `b/strong` 走的是 660 那一档。
但更准确的做法是两个都记，因为它们描述的是不同的东西。

**参考仓库的记载**（`ref:v1-01:389-394` 的表格 + 同文件 `:396-430` 的 CSS 块）：

| 语义字重 | 浅色 | 参考·表格 | 参考·CSS 块 | 本机·路径 A | 本机·路径 B |
| --- | --- | --- | --- | --- | --- |
| Regular | `400` | `360` | `360` | `360` ✅ | `360` ✅ |
| Medium | `500` | `460` | `460` | `460` ✅ | `460` ✅ |
| Semibold | `580` | **`550`** | **`550`** | **`540`** | **`560`** |
| Bold | `600` | `660` | `660` | **`560`** | `660` ✅ |

**判定（含版本归因）**：

- **Regular / Medium / Bold 三档完全一致**，参考正确。
- **Semibold 是唯一分歧点**：
  - 参考的表格与 CSS 块**自洽**（都写 `550`），所以不是笔误。
  - 本机 **`"wght" 550` 出现 0 次**（全量 grep 全部 25 个 CSS 文件 + 3548 个 JS chunk）。
  - 本机是路径 A `540` / 路径 B `560`。
  - **归因**：`550` 在 v2.37337.1 是真实值，到 2.42304.2 被拆成了 540（语义类）与 560（工具类）两个值。
- **Bold 的路径 A 是 `560` 而非 `660`**：本机的 `--cds-font-wght-bold` 令牌就是 `560`，只有 `.font-bold` / `b` / `strong` 工具类写 `660`。
  参考把"浅色 600 / 暗色 660"配对记录，实际本机浅色 `--cds-font-weight-bold: 600`、暗色令牌 `560`、暗色工具类 `660` —— **三个数并存**。

**建议**（给本仓库实现用）：
1. 若目标是**复刻 v2.37337.1**，保持 `550`，与参考一致。
2. 若目标是**对齐本机 2.42304.2**，用下表：

| 场景 | 浅色 | 暗色 |
| --- | --- | --- |
| 语义类（`.text-*-semibold`） | `font-weight: 580` | `wght 540` |
| 工具类（`.font-semibold`） | `font-weight: 580` | `wght 560` |
| 粗体（`.font-bold` / `b` / `strong`） | `font-weight: 600` | `wght 660` |
| 粗体（`--cds-font-axis-wght-bold` 令牌） | — | `wght 560` |

3. 只取一个值时用 **560**（覆盖 451 个真实调用点 vs 264）。

### 3.2 字号表混用了 compact 与 comfortable 两档

参考 `ref:v1-01:533-547` 的表格，逐行比对产物：

| 类 | 参考字号 | 参考行高 | 产物 compact | 产物 comfortable |
| --- | --- | --- | --- | --- |
| `.text-caption-*` | `.6875rem` (11px) | `1.0625rem` | `.6875rem` ✅ | `.75rem` |
| `.text-footnote-*` | `.8125rem` (13px) | `1.0625rem` | `.75rem` | `.8125rem` ✅ |
| `.text-body-*` | `.875rem` (14px) | `1.25rem` | `.8125rem` | `.875rem` ✅ |
| `.text-heading-*` | `.9375rem` (15px) | `1.25rem` | `.875rem` | `.9375rem` ✅ |
| `.text-title-*` | `1.25rem` (20px) | `1.75rem` | `1.25rem` ✅ | `1.375rem` |

即：**caption 取了 compact，其余四档取了 comfortable**。
而参考同一行的"行高"列又统一写 `1.0625rem` / `1.25rem`——这两个恰好是 **caption 的 compact 值** 与 **body 的 comfortable 值**。

**判定**：这不是笔误，而是把"两档共存的令牌"当成"单一阶梯"记录了。
但结合 §3.0 的版本差异，更可能的解释是：**v2.37337.1 时代 comfortable 档的字号比现在小一档**，
参考当时记录的是它所在版本的真实值，而本机 2.42304.2 把 comfortable 整体上调了。

**建议**：
- 表格拆成两列（compact / comfortable），明确标注当前档位。
- 若对齐本机 2.42304.2：caption 用 `.75rem`、title 用 `1.375rem`、prose 用 `1rem`；
  body / footnote / heading 与参考一致，无需改。
- 行高方面：caption 的 `1.0625rem` **两档相同**，✅ 无争议。

### 3.3 `.text-body-medium` 的字重标注

参考写 `Medium (470 / 460)`。

**`470` 确实存在于产物，但不在 `.text-*` 语义类上**：
全机唯一一处 `font-weight: 470`（跨 25 个 CSS 文件）在 `shared-styles-Bl9zqrv-.css` 的 `.df-pill-label` 上
（`--df-` 前缀是另一套组件体系，即设计系统里较早的一层 pill 标签）。

`.text-*` 类上实测：浅色 `font-weight: 500`（`--cds-font-weight-medium`）、暗色 wght 轴 `460`。

**判定**：`470` 这个数字**有出处，但语义类上不是它**。可能有两种来源：
(a) 参考从 `.df-pill-label` 抄串了行；(b) v2.37337.1 时代 `.text-body-medium` 真的是 470，后来改为 500。
`sbook`（Storybook）里出现的 `Medium (470 / 460)` 写法支持 (b)。

**建议**：本机对齐用 `500 / 460`；要在仓库里保留 `470` 的话，标明它来自 `v2.37337.1` 或 `.df-pill-label`，避免歧义。

### 3.4 小节标题的 `.text-caption-bold` / `.text-body-bold` 字重

参考写 `Bold (700 / 660)`。

**`font-weight: 700` 在全部 CDS CSS 中共 22 处，但没有一处落在 `.text-*` 语义类上。**
分布：`.monaco-editor` 高亮（`c5aee9dbd-*.css`）、`@font-face` 的 `font-weight:700` 声明、
KaTeX 数学字体（`cf1a02a1a-*.css`）、`forced-colors` 高对比模式的 `.df-app-switch` 图标。

本机 `.text-*-bold` 实测：`font-weight: 600`（`--cds-font-weight-bold`），暗色路径 B wght `660`。

**判定**：本机版本是 `600`，不是 `700`；`660` 作为暗色 wght 值是对的（路径 B）。
`700` 在 v2.37337.1 可能是真实值（参考的 CSS 块 `:396-430` 里 `.font-semibold` 写 `580`，与浅色基准一致，
说明当时 bold 对应 `600`；表里的 `700` 更像是从 `b/strong` 的 UA 默认值推来的）。

**建议**：对齐本机用 `Bold (600 / 660)`；保留 `700` 时标注来源版本。

---

## 4. 现有 `docs/cds-spec.md` §7 的核对结论

| 小节 | 结论 |
| --- | --- |
| §7.1 `--cds-rem-scale: calc(16/17)` | ⚠️ 值正确，但**在 `@supports (-apple-system-body)` 内，桌面端不生效**（1rem = 16px）。建议补环境限定 |
| §7.2 字体栈 | ✅ 主结构正确；**可补**：`--cds-font-mono` 在 `.cds-root` 被覆写为 Anthropic 优先栈（`anthropic-mono` → `"SF Mono"` → `ui-monospace`），`:root` 那条系统栈不生效 |
| §7.3 7 阶字号阶梯 | 🟡 数值需按 comfortable 档校正（caption `.75rem`、title `1.375rem`、prose `1rem`）；结论「正文 14px / 20px」✅ 正确 |
| §7.4 字重与暗色补偿 | ⚠️ 注意版本：`550` 是 v2.37337.1 的值；本机 2.42304.2 是 540 / 560 两套并存（见 §3.1） |
| §7.5 行内图标基线 | ✅ 正确 |
| §7.6 换行与数字锁定 | ✅ 结构与产物一致 |

**§7.3 里「这些 `--cds-font-size-*` 令牌在 `cds-theme.css` 中完全不存在」这条判断，现在有了更精确的版本**：
它们在**原版产物的 `c6a992d55-sXiDGMFQ.css` 里是齐全的**（每个令牌 2–14 处定义，见 `token-selectors.txt`），
只是不在参考仓库那份精简的 `cds-theme.css` 里。所以"主题需自行声明"这个结论对 Harness 仍成立，但**原因不是 Claude 没有这些令牌**。

---

## 5. ➕ 工具卡片排印实测（参考仓库未覆盖）

参考仓库 `docs/v1/03-会话核心流与指令交互引擎.md` 记录了这一层的**结构**（"代码块表面（深色终端）、思考折叠区"），
但**没有记录工具调用行的字体/字号/字重/字距**。本节补上。

### 5.1 只有一种字体，没有例外

工具行组件 `TurnStatusStep` 的根节点（`c734f318c-BSUCqMkp.js`）：

```jsx
className: "flex min-w-0 items-start gap-xs font-sans text-body font-normal text-secondary not-italic"
```

`font-sans` 是**显式声明**的，不是继承。换算：

| 类 | 等价 CSS | 值 |
| --- | --- | --- |
| `font-sans` | `font-family: var(--cds-font-sans)` | `"anthropic-sans", system-ui, "Segoe UI", Roboto, Helvetica, Arial, <CJK>, <Script>, sans-serif` |
| `text-body` | `font-size` + `line-height` | **14px / 20px** |
| `font-normal` | `font-weight` | **400** |
| `text-secondary` | `color` | light `neutral-600` / dark `gray-200` |
| `not-italic` | `font-style` | normal |
| `gap-xs` | `gap` | 4px |

**推论**：即使会话正文切到 serif（`--font-claude-response: var(--font-anthropic-serif)`），工具行**不受影响**，
因为 `font-sans` 在工具行上是硬写的。

唯一走等宽的是终端卡（§5.4）。文件中转、图片、审批卡等一律 sans。

### 5.1b ⚠️ 对话流里有一层 `.text-body` 覆写，必须先算清

`.epitaxy-transcript-typography` 作用域内有两条规则会改写 `.text-body` 的字号来源（`css` 偏移 `@1788929`、`@1789285`）：

```css
/* 规则 1：对话区基线（--chat-body 是「设计值 × rem-scale」） */
.epitaxy-root .epitaxy-transcript-typography {
  --chat-body: calc(.875rem * var(--cds-rem-scale, 1));
  --chat-leading: 1.42857;
  font-size: var(--chat-body);
  line-height: var(--chat-leading);
}

/* 规则 2：把 .text-body / -medium / -semibold 的字号改指向 --chat-body */
.epitaxy-root .epitaxy-transcript-typography :where(.text-body):not(button,input,textarea),
.epitaxy-root .epitaxy-transcript-typography [data-cds=TurnStatusStep] > :where(.text-body),
.epitaxy-root .epitaxy-transcript-typography :where(.text-body-medium)…,
.epitaxy-root .epitaxy-transcript-typography :where(.text-body-semibold)… {
  font-size: var(--chat-body);
  line-height: var(--chat-line, var(--chat-leading));
}

/* 规则 3：消息行内把 --chat-body 改回令牌本身 */
.epitaxy-root .epitaxy-transcript-typography [data-transcript-row] [data-cds=AssistantMessage][data-turn-key],
.epitaxy-root .epitaxy-transcript-typography [data-transcript-row] [data-cds=UserMessage][data-turn-key],
.epitaxy-root .epitaxy-transcript-typography [data-code-own-row] {
  --chat-body: var(--cds-font-size-body);
  --chat-line: var(--cds-leading-body);
}
```

**先修正一个陷阱：`--cds-rem-scale` 在桌面端不生效。**

它只在下面这个条件下被声明：

```css
@supports (font: -apple-system-body) and (-webkit-touch-callout: default) {
  :root { font: -apple-system-body; font-family: var(--font-ui); --cds-rem-scale: calc(16 / 17); line-height: 1.5; }
}
```

这是 **iOS Safari / WebKit** 的特征（`-apple-system-body` 用来读系统字号）。**桌面 Electron 不满足该 `@supports`**，
所以 `--cds-rem-scale` 未定义 → 所有 `var(--cds-rem-scale, 1)` 取 fallback **`1`**，即 **1rem = 16px**。

> 佐证：按 rem-scale=1 计算，全部令牌都落成整齐的整数（12/13/13/14/15/22 / 17/17/19/20/20/28/24）。
> 若按 0.941176 算会得到 13.18/18.82 这类非整数——设计系统不会这么做。这反过来证明桌面端确实取 1。

**覆写规则的实际效果（桌面端，rem-scale=1）**：

| 场景 | 默认 `--cds-font-size-body` | 覆写后 `--chat-body` | 净效果 |
| --- | --- | --- | --- |
| comfortable，**消息行内**（规则 3 生效） | 14px | `var(--cds-font-size-body)` = 14px | **不变** |
| compact，消息行内 | 13px | 13px | **不变** |
| comfortable，消息行外 | 14px | `.875rem × 1` = 14px | **不变** |
| compact，消息行外 | 13px | 14px | **+1px** |

**结论**：
1. 覆写规则确实存在，但**在消息行内它是等式，不改变任何值**。
2. 唯一有实际效果的是 **compact 密度 + 消息行外**：把 13px 抬到 14px。
3. 所以工具行（永远在 `[data-transcript-row]` 内）**不会**被这层覆写改变字号。
4. 因此"transcript 内的 `.text-body` 一律是 14px，不看原类名"这个说法**方向对但归因错**：
   实际是"令牌本身就是 14px"，不是"被覆写强制成 14px"。

**设计值 = 渲染值**（桌面端），不再有两套数：

| 令牌 | 设计值 | 桌面渲染值 |
| --- | --- | --- |
| body | 14px / 20px | **14px / 20px** |
| footnote | 13px / 17px | **13px / 17px** |
| caption | 12px / 17px | **12px / 17px** |
| code | 13px / 19px | **13px / 19px** |
| heading | 15px / 20px | **15px / 20px** |
| title | 22px / 28px | **22px / 28px** |
| prose | 16px / 24px | **16px / 24px** |

### 5.1c ⚠️ 字号有三套机制并存，混用是最大的出错源

工具卡片里同时存在三个字号体系，**它们互不影响，值也不一样**：

| 机制 | 写法 | 值 | 受 density 影响 |
| --- | --- | --- | --- |
| **A. CDS 语义类** | `text-body` / `text-footnote` / `text-caption` / `text-code` | 14 / 13 / 12 / **13**px | ✅ 是（compact 降一档） |
| **B. Tailwind 原生类** | `text-xs` / `text-sm` / `text-base` | **12 / 14 / 16**px | ❌ 否，字面固定 |
| **C. 对话区覆写** | `--chat-body`（见 §5.1b） | 14px | 部分 |

**B 的实际定义**（`c6a992d55.css`）：

```css
.text-xs   { font-size: var(--text-xs);   line-height: var(--text-xs--line-height) }
--text-xs: .75rem;          /* 12px */
--text-xs--line-height: calc(1 / .75);      /* → 16px */

.text-sm   { font-size: var(--text-sm);   line-height: var(--text-sm--line-height) }
--text-sm: .875rem;         /* 14px */
--text-sm--line-height: calc(1.25 / .875);  /* → 20px */

.text-base { font-size: var(--text-base); line-height: var(--text-base--line-height) }
--text-base: 1rem;          /* 16px */
--text-base--line-height: calc(1.5 / 1);    /* → 24px */
```

**为什么会混**：`text-xs`(12px) 与 `--cds-font-size-caption`(12px) 数值碰巧相同，
`text-sm`(14px) 与 `--cds-font-size-body`(14px) 也相同 —— 所以在 comfortable 档下肉眼看不出差别。
但 **compact 档下 `text-xs` 仍是 12px，而 caption 会降到 11px**，这时差异就暴露了。

**实证：Read 卡片用的是 B，不是 A。**

```jsx
// cc1aae219:13871  —— create/edit 动作
className: "border-[0.5px] border-border-300 rounded-xl mx-2.5 mt-1 mb-2 rounded bg-bg-000/30 text-xs"

// cc1aae219:13896  —— 其它动作（含 read）
className: "p-3 text-sm text-text-300 whitespace-pre-wrap overflow-x-auto"
```

→ Read 的文件内容正文是 **`text-sm` = 14px**，`create/edit` 分支是 **`text-xs` = 12px**。
两者都**不是** `text-code`（13px）。

**判读规则（务必记住）**：
1. 看到 `text-xs` / `text-sm` / `text-base` → 查 Tailwind 表，值固定，别去套 CDS 令牌。
2. 看到 `text-body` / `text-code` 等 → 查 CDS 令牌，记得 density 会改值。
3. 两者数值碰巧相同时，**compact 档是唯一的照妖镜**。

只有在 iOS 端才会因 `rem-scale = 16/17` 整体缩到 ~94%。

### 5.2 字号三档，全部复用对话正文

| 部位 | class | font-size | line-height |
| --- | --- | --- | --- |
| 工具名 / 主文案 / 副文案 | `text-body` | **14px** | **20px** |
| 折叠区次要说明 | `text-footnote` | **13px** | **17px** |
| 计数 / 耗时 / 行数差 / kbd | `text-caption` | **12px** | **17px** |
| 终端卡内部 | `text-code` | **13px** | 独立 `1.55` |

**关键：工具卡片没有专属排印档位。** 它复用 `.text-body` / `.text-footnote` / `.text-caption`。
→ 改工具卡片字号 = 改整条对话流。这一条对做主题很要紧：不存在"只放大工具行"的钩子。

### 5.2b ⚠️ 但聊天容器有一套 `--msg-*` 私有变量，会压掉部分元素

`c041f89c8-n0JhV0Ev.js` 导出的一组 Tailwind 任意值类，被**无条件加在 `data-testid="transcript-list"` 根容器上**
（`ca2ef848d:30602`，`className: R(au, n && Fk, …)`）。

```css
/* 变量（1rem = 16px 已换算） */
--msg-font-size:          0.8125rem  /* 13px */
--msg-timeline-font-size: 0.75rem    /* 12px */
--msg-code-font-size:     0.75rem    /* 12px */

/* 强制覆盖 */
.font-large                   → var(--msg-font-size)          = 13px
.font-claude-response-body    → var(--msg-font-size)          = 13px
.text-base.text-primary       → var(--msg-font-size)          = 13px
h6 / table                    → var(--msg-font-size)          = 13px
.font-base                    → var(--msg-timeline-font-size) = 12px
.font-base-bold               → var(--msg-timeline-font-size) = 12px
[data-timeline-text]          → !var(--msg-timeline-font-size)= 12px  ← !important
[class*='!font-base']         → !var(--msg-timeline-font-size)= 12px  ← !important
.code-block__code             → !var(--msg-code-font-size)    = 12px  ← !important
:not(pre) > code              → var(--msg-code-font-size)     = 12px
pre[data-mermaid]             → var(--msg-code-font-size)     = 12px
```

**哪些被压、哪些不受影响（关键分辨）**：

| 元素 | 类 | 在 transcript-list 内？ | 实际字号 |
| --- | --- | --- | --- |
| **工具行标题/主文案** | `text-body` | ✅ 是 | **14px**（未受影响 —— `text-body` 不在覆盖名单里） |
| 搜索结果行、时间线文本 | `font-base` / `data-timeline-text` | ✅ 是 | **12px**（被压） |
| 聊天正文 markdown 代码 | `.code-block__code` | ✅ 是 | **12px**（`!important` 钉死） |
| 聊天正文行内代码 | `:not(pre) > code` | ✅ 是 | **12px** |
| **终端卡 `.epitaxy-terminal-view`** | `text-code` | ❌ 否（独立 surface） | **13px**（令牌值，不受 msg 变量影响） |

**所以 §5.2 的表要这样读**：
- 工具行主文案 14px ✅ 正确（`text-body` 不在 `--msg-*` 覆盖名单里）
- 但**聊天正文里的代码是 12px**，不是 `--cds-font-size-code` 的 13px
- **终端卡仍是 13px**，因为它不在 transcript-list 内部

**这是第四套字号机制**（在 §5.1c 的三套之外），优先级最高（含 `!important`）。

### 5.3 字重与字距

**字重**：基线 `400`（`font-normal`），强调 `500`（`font-medium`），标题 `580`（`semibold`）。
暗色通过 wght 轴降为 `360 / 460 / 540`（或 560，取决于用哪一族类，见 §3.1）。

**字距：工具卡片是 `0`（normal）。**

证据：工具行所有 class 字符串里**没有一处 `tracking-*`**。而全局 `letter-spacing` 只有 17 处声明，
其中 `+0.05em` 以上全部服务于**全大写小标签**（工件语言标签那类），`-.025em` 左右服务于**大字标题**。

| 用途 | 字距 |
| --- | --- |
| 工具卡片全部文字 | **`normal` / 0** |
| 全大写类型标签（`MCP`、`JSON`…） | `+0.05em`（`--tracking-wider`） |
| 页面级大字标题 | `-.025em`（`--tracking-tight`） |
| 亚像素微调（高分屏） | `-.3px` / `-.4px` |

### 5.4 终端卡是唯一例外

`cf6989767-CXXjtvjM.js` 内联 CSS：

```css
.epitaxy-terminal-view {
  font-family: var(--cds-font-mono);
  font-size: var(--cds-font-size-code, .75rem);
  line-height: 1.55;              /* 注意：不是 --cds-leading-code，是独立倍数 */
  background: #101010;
  color: #e8e6e3;
}
```

| density | `--cds-font-size-code` | 终端字号 | 实际行高 |
| --- | --- | --- | --- |
| compact | `.75rem` = 12px | 12px | 18.6px |
| comfortable（默认） | `.8125rem` = 13px | 13px | 20.15px |

`--cds-leading-code`（comfortable）是 `1.1875rem` = 19px，与 `13 × 1.55 = 20.15px` **不等** —— 终端是独立设定的。

`--cds-font-mono` 生效栈是 **`anthropic-mono` → `"SF Mono"` → `ui-monospace` → `Menlo` → `Consolas` → `monospace`**
（`.cds-root` 覆盖 `:root`，见 §2.8）。**不是系统等宽**，`--cds-font-mono-override` 全 CSS 从未赋值。

### 5.5 数字必须等宽：`tabular-nums`

全局统计（`typography-usage.txt`，3548 个 chunk）：`tabular-nums` 出现 **154 次**，排第 10 位。

工具相关实测：

```jsx
// 耗时 / 计数 —— 右对齐，流式更新时不抖动
"ms-auto text-caption text-muted-as-secondary tabular-nums shrink-0"
"flex shrink-0 items-center gap-0.5 text-body tabular-nums"
"flex shrink-0 items-center gap-0.5 text-footnote tabular-nums"
"grid items-center gap-x-xs gap-y-0.75 text-footnote tabular-nums"
"contents tabular-nums text-body-medium"
```

**规律：凡随流式数据变化的数字都加 `tabular-nums`。**
不加的后果是"1 秒"→"12 秒"时整行左右抖动。

### 5.6 图标是图标字体，不是 SVG

```css
@font-face {
  font-family: "Anthropicons-Variable";
  src: url(/assets/v1/c0f671921-cvFTkbeX.woff2) format("woff2-variations");
  font-weight: 400 700;
  font-display: block;
}
```

caret、状态点、Warning/Info/Check 图标都来自这个**可变图标字体**（轴 `400 700`），所以图标粗细能跟字重联动。
`font-display: block` 防止先显示方框。

> 对主题实现的含义：**拿不到 SVG path**，要换图标只能换码位或替换整个字体。

配套的亚像素对齐（`c734f318c:191`）：

```js
Ze = { translate: "0 0.5px" };   // caret 下移 0.5px，仅在图标字体模式下启用
```

### 5.7 度量技巧：`1lh` 与 0.125em 补偿

```jsx
"inline-flex h-[1lh] items-center justify-center"      // 图标容器：高度 = 当前行高
"min-w-[1lh] justify-end rounded"                      // trailing 槽
"py-[0.125em] -my-[0.125em]"                           // 裁切补偿
```

- `1lh` = 一倍 `line-height`。`text-body` 下 **20px**，`text-caption` 下 **17px**。字号变则跟着变，不用写死像素。
- `overflow-x-clip` 会切掉 descender 与大写上沿，所以上下各补 `0.125em`（14px 下 = 1.75px）再负 margin 抵消。

### 5.8 颜色：静止 muted，hover 才 secondary

```js
// c734f318c:186-187
step:   "group-hover/step:text-secondary group-has-[:focus-visible]/step:text-secondary",
status: "group-hover/status:text-secondary group-has-[:focus-visible]/status:text-secondary",
```

工具行**静止时是 `text-muted`，悬停/focus 才升到 `text-secondary`**。这与"默认 secondary"的直觉相反。

状态词颜色（`shared-frame-BfjMqbuN:15084-15098`）：

| 状态 | tone | 说明 |
| --- | --- | --- |
| `failed` | `text-danger` | 红 |
| `blocked` | `text-warning` | 黄（文案 "Needs approval"） |
| `stopped` / `denied` | `text-secondary` | 灰 |
| `busy` / `done` | **null** | **不显示状态词** |

最后一条容易漏：**运行中和已完成都不显示状态词**，只有失败/待审批才在行尾追加彩色词。

### 5.9 可直接抄的 CSS

```css
.tool-card {
  font-family: "anthropic-sans", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: .875rem;          /* 14px */
  line-height: 1.25rem;        /* 20px */
  font-weight: 400;
  letter-spacing: normal;      /* 0 —— 不要加 */
  font-style: normal;
  color: var(--text-secondary);
}
.tool-card__stat {
  font-size: .75rem;           /* 12px */
  line-height: 1.0625rem;      /* 17px */
  font-variant-numeric: tabular-nums;
  color: var(--text-muted-as-secondary);
  flex-shrink: 0;
}
.tool-card__icon {
  display: inline-flex;
  height: 1lh;                 /* 20px @ text-body */
  align-items: center;
  justify-content: center;
}
.tool-terminal {
  font-family: var(--cds-font-mono);
  font-size: .8125rem;         /* 13px */
  line-height: 1.55;           /* 独立倍数，非令牌 */
  background: #101010;
  color: #e8e6e3;
}
```

---

## 6. 可直接抄走的实现值（comfortable 档，桌面端实测）

> 桌面端 `--cds-rem-scale` 不生效（1rem = 16px），所以下面的 rem 值**就是最终像素值**。

```css
/* 字号 + 行高（桌面端 rem 与 px 一一对应） */
--caption-size: .75rem;    --caption-leading: 1.0625rem;   /* 12 / 17 */
--footnote-size: .8125rem; --footnote-leading: 1.0625rem;  /* 13 / 17 */
--code-size: .8125rem;     --code-leading: 1.1875rem;      /* 13 / 19 */
--body-size: .875rem;      --body-leading: 1.25rem;        /* 14 / 20 */
--heading-size: .9375rem;  --heading-leading: 1.25rem;     /* 15 / 20 */
--title-size: 1.375rem;    --title-leading: 1.75rem;       /* 22 / 28 */
--prose-size: 1rem;        --prose-leading: 1.5rem;        /* 16 / 24 */

/* 字重（浅色 font-weight / 暗色 wght 轴） */
regular  : 400 / 360
medium   : 500 / 460
semibold : 580 / 540（语义类）或 560（工具类）
bold     : 600 / 660（工具类）或 560（语义类）

/* 字距 */
大字标题  : -.025em  ~ -.03em
常规正文  : 0
大写小标签: .05em    ~ .12em
亚像素微调: -.3px / -.4px
```

---

## 7. 复核方式

```powershell
cd C:\Users\17445\Desktop\rea\claude-ui-re

# 1) 字重值普查（确认 550/465 不存在；470 只在 .df-pill-label）
$c="C:\Program Files\WindowsApps\Claude_2.42304.2.0_x64__pzs8sxrjxfjjc\app\resources\ion-dist\assets\v1\c6a992d55-sXiDGMFQ.css"
foreach($v in @('"wght" 550','"wght" 465','"wght" 540','"wght" 560','"wght" 660','font-weight:470','font-weight:700')){
  $n=([regex]::Matches((Get-Content $c -Raw),[regex]::Escape($v))).Count; "$v = $n"
}
# 结果：550=0  465=0  540=9  560=17  660=2  470=0（全 CSS 里唯一一处 470 在 shared-styles-Bl9zqrv-.css 的 .df-pill-label）  700=3（均非 .text-* 类）

# 2) 两套体系的完整选择器
node check-two-systems.mjs        # -> two-weight-systems.txt
node extract-wght-selectors.mjs   # -> wght-selectors.txt（带 @media 上下文）

# 3) 字号令牌的 density 分档
node extract-token-selectors.mjs  # -> token-selectors.txt

# 4) 两族类是否共现（结论：不共现）
$dir="C:\Program Files\WindowsApps\Claude_2.42304.2.0_x64__pzs8sxrjxfjjc\app\resources\ion-dist\assets\v1"
(Select-String -Path "$dir\*.js" -Pattern '\bfont-semibold\b' -AllMatches | %{ $_.Matches.Count } | Measure-Object -Sum).Sum   # 451
(Select-String -Path "$dir\*.js" -Pattern '\btext-[a-z]+-semibold\b' -AllMatches | %{ $_.Matches.Count } | Measure-Object -Sum).Sum  # 264
```

---

## 8. 一句话总结

参考仓库的排印部分**方向全对、绝大多数数值对**。它是为 **v2.37337.1** 写的，本机是 **2.42304.2**，
所以少数数值有版本漂移：`550`（现为 540/560 两套）、`470`、`700`、以及 comfortable 档的 caption/title 字号。
**这些不是参考记错，是上游改版了。**

真正需要补的是它**没写**的部分：工具调用卡片的排印（§5）—— 那是"不完整"而非"不对"。

对齐本机 2.42304.2 时，用 §6 的速查值即可；要复刻 v2.37337.1，保持现有 `docs/cds-spec.md` §7.4 的 `550`。
