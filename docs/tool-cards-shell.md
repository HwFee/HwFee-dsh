# 工具卡片逆向 · 外壳（Tool Row Shell）

> **性质**：新增的独立条目，也是本组 `tool-cards-*` 文档的**总外壳篇**。
> 所有工具（Read / Edit / Bash / Grep / MCP / Task / WebSearch…）最终都渲染同一个外壳组件 `YH`；
> 本篇讲这个外壳本身，各工具的差异见对应的 `tool-cards-*.md`。
>
> **版本**：本机 Claude Desktop **2.42304.2**（参考仓库针对 v2.37337.1）。
>
> **五条核心结论**：
> 1. **外壳只有一个组件**：`YH`（`cc1aae219:13343-13539`，导出名 `XH`）。另有一套 epitaxy 新壳
>    `tool-cell-row`（`c5ac695a3:304-491`）并存，两套的 testid / 字号 / 色 token 完全不同。
> 2. **DOM 固定骨架**：`div.card > fragment > (<button data-testid="tool-row-header"> | <a>) + children`。
>    body 是 `qH`（overflow 外壳）+ `JH`（`mx-2.5 mt-1 mb-2 rounded-lg border-[0.5px] bg-bg-000`）两段式。
>    不可点击时 `tool-row-header` 这个 testid 直接变 `undefined`。
> 3. **三个 `tool-status-*` 不是单个工具卡的状态**，是**一个 assistant turn 的聚合状态行**。
>    单个工具卡只有 4 个原子状态：`running / done / error / stopped`。
>    `pending`（等审批）是可见性门控、`stalled` 是上层 agent 统计，都不在卡片状态机里。
> 4. **`epitaxy-expanding-body` 没有动画也没有高度测量** —— 只是 `hidden` 属性开关 +
>    「挂载一次永不卸载」（`c425fb3cf:98-111`），全量 CSS 里不存在该类的样式规则。
>    真正的动画在旧壳：`timeline-expand-enter` grid-rows 0fr→1fr，`.2s cubic-bezier(.19,1,.22,1)`。
> 5. **默认展开条件有三条独立规则**：① 组内全是 thinking/Task → 强制展开；
>    ② 外层时间线整体展开 → body 恒挂载、max-h 200px→4000px；
>    ③ 流式结束 2 秒后自动收起（350ms 后恢复动画），同组手风琴只允许一个展开。
>
> **排版要点（与 `typography-cross-check.md` §5 一致）**：
> 工具行**主文案用 `text-body` = 14px / 20px（comfortable）**，不是 `font-base`。
> `font-base`（12px）只用于搜索结果行、时间线文本等次级元素。
> 两套壳的字号差异见本文 §10 与 `typography-cross-check.md` §5.2b。
>
> **图标**：`diffs-icon-*` **不参与**工具卡图标（属 diff 视图）；工具卡图标另有 6 张映射表（本文 §6）。
>
> **证据约定**：`<chunk>.pretty.js:N` 指 `C:\Users\17445\Desktop\rea\claude-ui-re\pretty\` 下格式化后的行号。
> 本文 46 处【确证】+ 10 处【推断】，48 处 chunk 行号引用。

---
## 范围

目标：Claude Desktop 2.42304.2，`ion-dist/assets/v1/*.js` 静态产物。
范围：**所有工具共用的那张卡**——最外层容器、header（图标/名称/摘要/状态）、body（折叠内容）、caret、状态机、图标表、分组/嵌套、流式占位、CSS 与排版度量。

证据约定：行号均为 `pretty.mjs` 格式化后文件的行号，格式 `chunk 文件名:行号`。标注 **【确证】** 的为代码/字符串直读，标注 **【推断】** 的为相邻关系推断。

## 0. 结论速览（先看这 6 条）

1. 卡片外壳只有**一个**组件：`YH`（`cc1aae219-Bd1YvDXP.pretty.js:13343-13539`，导出为 `XH`）。所有工具（Read/Edit/Bash/Grep/MCP/Task/WebSearch…）最终都渲染它，差异只在传入的 `icon / text / children`。另有一套 epitaxy 新壳 `tool-cell-row`（`c5ac695a3-CqnCpnMn.pretty.js:304-491`）与之并存。
2. DOM 骨架固定为 **`div.card > div.inner > (header 或 a) + body`**。header 是 `<button data-testid="tool-row-header">`（不可点击时该 testid 变成 `undefined`），body 是 `qH/JH` 两段式（`overflow-hidden` 外壳 + `mx-2.5 mt-1 mb-2` 圆角内框）。
3. 三种 `tool-status-*` 分属**两个层级**：`tool-status-pill / tool-status-caret / tool-status-spark` 属于**一个 assistant turn 的聚合状态行**（"Working…" / "3 steps"），**不是**单个工具卡；单个工具卡的状态靠**文字 + shimmer + spark 图标**表达，没有独立 pill。
4. 状态只有 4 个原子：`running`（流式中）/`done`（有 tool_result 且非 error 非 cancelled）/`error`（`is_error`）/`stopped`（`cancelled`）。`pending`（等待审批/等待输入）与 `stalled` 属于**上层 turn/agent 状态**，不是卡片状态机成员。
5. 摘要文案是「`<动词> {参数摘要}`」模板，走 i18n，**没有**统一截断函数；截断靠 CSS（`truncate` / `overflow-hidden overflow-ellipsis whitespace-nowrap`）。
6. **字号必须按 `data-density="comfortable"` 算**（`ion-dist/index.html` 的 `<html>`）：`--cds-font-size-body` = `.875rem` = **14px / 20px**，`.font-small` = 12px/17px，代码 12px/19px。`--cds-h-control` = **32px**，`--cds-radius` = 8px。凡只写 13px/26px 的结论都取的是 `.cds-root` 裸值，不是桌面实际值。

---

## 1. 调用链（从 transcript 到卡片）

```
transcript 容器
  data-testid="transcript-sizer"                 c4a9ee384-BKGJtC0p.pretty.js:3787
  └ div[data-testid="transcript-row"]            c4a9ee384-BKGJtC0p.pretty.js:3708
      └ div[role=article]                        c4a9ee384-BKGJtC0p.pretty.js:3714-3724
          └ … assistant-message 段              ca2ef848d-CKbIdz6g.pretty.js:8130
              └ EB（blocks 渲染器）               cc1aae219:11579
                  └ 分组判定 → 单块 / "group"      cc1aae219:11621-11818
                      └ vB（Row，按 block.type 分派） cc1aae219:11278-11559
                          case "tool_use" → JL/qL    cc1aae219:9194-9199
                              └ By（ChatToolCard 错误边界）c05b96c7f-DdfnpDBP.pretty.js:1596-1606
                                  └ KL（tool_use 单元格）  cc1aae219:9021-9193
                                      └ renderToolUseCell() 注入点  cc1aae219:9038 / 9102
                                          └ TU（通用工具卡装配器） cc1aae219:14072-14178
                                              └ YH（外壳，导出 XH）  cc1aae219:13343-13539
                                                  ├ header（button/a）
                                                  ├ qH/JH（body）
                                                  └ 各工具自己的 children
```

**【确证】** `By` 是渲染错误边界，`componentName:"ChatToolCard"`，`resetOn` 取三态 `result | input_settled | partial_input`（`c05b96c7f-DdfnpDBP.pretty.js:1596-1605`）——这也是**流式占位**的关键：参数未收完时边界以 `partial_input` 为 key，收完切到 `input_settled`，有结果切 `result`。

**【确证】** `renderToolUseCell()` 由 ChatMessageContext 注入（`cc1aae219:9038`），缺失会抛 `"renderToolUseCell() is not provided, missing ChatMessageContext?"`（`cc1aae219:9095`）。

---

## 2. DOM 结构树（逐节点：testid / class / 来源行号）

### 2.1 卡片外壳（当前实现，`YH`）

```
div                                                               ← :13528-13538
  class: "rounded-[var(--msg-block-radius,0.5rem)] border-[0.5px] flex flex-col
          font-sans leading-normal my-3 border-border-300"
        + 未禁用且未展开 → "hover:bg-bg-200"
        + isFirstBlockOfMessage ? "mt-2" : "mt-3"
        + isLastBlockOfMessage  ? "mb-2" : "mb-3"
        + 已展开 → "bg-bg-000 shadow-sm"
        + wrapperClassName
  └ <f>（Fragment）                                              ← :13511
    ├ header：<button> 或 <a>                                     ← :13484-13510
    │   button 分支:
    │     data-testid = N ? undefined : "tool-row-header"          ← :13499
    │     disabled / aria-disabled / tabIndex=-1（N 时）
    │     aria-expanded = isExpanded                               ← :13504
    │     title = nativeTitle
    │     class = L（见下）
    │     [子节点 B]
    └ children（各工具的 body 内容，通常就是 qH/JH）              ← :13511
```

`L`（header 的 class 串）**【确证】** `:13394-13402`：

```
"group/row flex flex-row items-center rounded-[var(--msg-block-radius,0.5rem)] w-full"
  renderMode===TimelineGroup && Fx() ? "px-0" : "px-2.5"
  secondaryElement ? "gap-2" : "justify-between"
  renderMode!==TimelineGroup && (secondaryElement ? "py-1" : "py-2")
  "text-text-300"
  N ? "!cursor-default" : "cursor-pointer"
  className
```

`N = isDisabled || (!handleClick && !href)` **【确证】** `:13391`。

header 内部结构 **【确证】** `:13403-13464`：

```
div.class = "flex flex-row items-center gap-2 min-w-0 flex-1"
  ├ 图标容器（TimelineGroup 模式不渲染）                          ← :13408-13418
  │   class = "flex items-center justify-center text-text-500 shrink-0"
  │     + 可交互时: "transition-colors duration-200 cds-Icon:transition-colors
  │        cds-Icon:duration-200 [&_.tool-row-glyph]:transition-colors
  │        [&_.tool-row-glyph]:duration-200
  │        group-hover/row:text-secondary group-focus-visible/row:text-secondary
  │        group-hover/row:cds-Icon:text-secondary …（共 12 个变体）"
  │     + 可交互 && 已展开 && Fx(): "text-secondary cds-Icon:text-secondary …"
  └ 文本容器                                                       ← :13419-13452
      class = "flex items-center gap-1 min-w-0 text-body text-start" + "text-muted"
            + 可交互时: "transition-colors duration-200
               [&_:is(span.text-muted,span.text-muted-as-secondary)]:transition-colors …"
            + !secondaryElement && "w-0 flex-grow"
      ├ <ShimmerText active={isStreaming} variant="secondary" className="truncate min-w-0">
      │     {text}                                                 ← :13429-13436
      └ caret（仅 可交互 && !hideCaret && !secondaryIcon && isExpanded!==undefined）:
            <span data-testid="tool-row-caret">                    ← :13441-13450
              class = "inline-flex shrink-0 transition-transform duration-150"
                    + 收起时 "-rotate-90 [&:where(:root[dir=rtl]_:dir(rtl))]:rotate-90
                       opacity-0 group-hover/row:opacity-100
                       group-focus-visible/row:opacity-100 [@media(hover:none)]:opacity-100"
              <Icon name="CaretDown" size="xs" />    ← 12px
  trailing 区（secondaryElement 之后）                             ← :13456-13462
    div.class = "flex flex-row items-center gap-1.5 shrink-0"
      ├ <p class="ps-1 text-muted font-small shrink-0 whitespace-nowrap">{secondaryText}</p>
      └ <span class="inline-flex">{secondaryIcon}</span>
```

### 2.2 body（折叠内容）

**外壳 `qH`** **【确证】** `:13313-13318`：

```
isExpanded || Vm() 时渲染：
  div.class = "shrink-0" + (Vm() ? "overflow-visible" : "overflow-clip") + className
  tabIndex = -1
```

**内容框 `JH`** **【确证】** `:13319-13342`：

```
div.class = Vm() ? "overflow-y-clip" : "overflow-hidden"
  └ div.class = Vm() ? "" : "mx-2.5 mt-1 mb-2 rounded-lg border-[0.5px] border-border-300 bg-bg-000"
      └ div.class = "flex flex-col gap-2"
            + (Px() ? "[&_code]:!text-code [&_pre]:!text-code" : "[&_code]:!text-xs [&_pre]:!text-xs")
            + !(Vm() && Fx()) && "max-h-[200px] overflow-y-auto"
            + Vm() && Fx() && "max-h-[4000px] overflow-y-auto"
            + (Vm() ? "mx-outset …" : "p-2")     ← rh = "[--cds-outset-x:var(--cds-pad-xs)] mx-outset w-stretch px-xs"
        style = Vm() ? Hm : undefined            ← Hm = { "--cds-outset-x": "var(--cds-pad-xs)" }
```

也就是说：**普通（非展开时间线）卡片体最大高 200px 可滚动；时间线整体展开态下最大 4000px。**

### 2.3 新版「epitaxy tool cell」外壳（`tool-cell-row`）

同样存在一套并行实现（用于 MCP app / 新时间线视图），结构不同、testid 不同：

```
div （renderMode===Standard 时）                                  c5ac695a3-CqnCpnMn.pretty.js:478-490
  class = "ease-out transition-[background-color,box-shadow,border-radius]
           flex flex-col font-sans leading-normal min-h-[2.625rem] compact:min-h-9
           overflow-hidden"
        + 流式进入 "animate-[fade_0.5s_ease-in]"
        + 非 borderless: "border-0.5 border-border-300 rounded-[var(--msg-block-radius,0.5rem)]"
        + 未展开 "hover:bg-surface-0"
        + mt-2/mt-3、mb-2/mb-3（首末块）
        + 展开 "bg-surface-3 shadow-sm"
  └ Q（Fragment）
    ├ <X>（button 或 div）                                        c5ac695a3:367-458
    │   data-testid = q ? undefined : "tool-cell-row"               ← :355
    │   aria-expanded = J
    │   class = "group/row flex flex-row items-center justify-between gap-4
    │            rounded-[…] text-secondary dark:text-muted-as-secondary py-2 compact:py-1"
    │         + wrapText ? "min-h-[2.625rem] compact:min-h-9" : "h-[2.625rem] compact:h-9"
    │         + !borderless && "px-3 compact:px-2"
    │         + 不可交互 "cursor-default" / action "relative"
    │         + "focus-visible:-outline-offset-2"
    │   ├ le（div 或 button）class = "flex flex-row items-center gap-2 min-w-0"
    │   │   ├ 图标 div class = "w-5 h-5 flex items-center justify-center text-primary"
    │   │   └ 文本 div class = "flex gap-2 relative bottom-[0.5px] font-base
    │   │              compact:font-small text-start flex-grow text-secondary
    │   │              dark:text-muted-as-secondary transition-colors duration-200"
    │   │            + wrapText ? "min-w-0 [overflow-wrap:anywhere]"
    │   │                        : "overflow-hidden overflow-ellipsis whitespace-nowrap"
    │   │        ├ ShimmerText / span{text}
    │   │        └ badge
    │   └ 右侧 div class = "flex flex-row items-center gap-1.5 min-w-0 shrink-0"
    │        ├ action
    │        ├ 错误态: Warning 图标（text-danger）+ isErrorExpandable 时 CaretDown
    │        └ 正常: secondaryText <p class="relative bottom-[0.5px] ps-1 text-muted-as-secondary
    │                                font-small shrink-0 whitespace-nowrap"> + secondaryIcon
    ├ children（工具自定义内容）
    └ 错误展开面板 se()（height animate 0→72 或 auto）              c5ac695a3:199-288
        class = "px-3 compact:px-2 pt-1 pb-3 text-code text-secondary
                 [overflow-wrap:anywhere] [unicode-bidi:plaintext]"
```

**【推断】** 两套壳并存的原因：`c5ac695a3` 属于 epitaxy/CDS 新版（`tool-cell-row`、`compact:` 变体、`surface-*` 色），`cc1aae219` 的 `YH` 属于 chat transcript 旧壳（`tool-row-header`、`bg-bg-*` 色）。工具卡片是否走新版取决于调用方注入的 `renderToolUseCell`（`shared-6-DkPBS4Mh.pretty.js:3554` 里存在 `renderToolUseCell: void 0` 的“不注入”分支）。

### 2.4 footer

**【确证】** 外壳本身没有 footer 节点。footer 有三个来源：
- 卡片级：`children` 里由工具自己放（例如 MCP 授权条 `BW`，`cc1aae219:15920-15969`；审批 footer 见 `ca3b5b2cd-BKpBjccM.pretty.js:1342-1353` 的 `footer:` prop）。
- 分组级：`MW` 有 `groupFooter` / `collapsedFooter` 两个 prop（`cc1aae219:15666-15667`），渲染在 status 行所在 grid 的第 1 行（`:15790`）。
- 输出截断提示：`Dw` = `<p data-testid="tool-body-truncated-note" class="px-1 pt-1.5 text-caption text-muted">Output truncated</p>`（`cc9e4071f-COsmd4CO.pretty.js:5-12`）。

### 2.5 完整 testid 清单（本范围）

| testid | 含义 | 证据 |
| --- | --- | --- |
| `tool-row-header` | 可展开工具卡的 header 按钮 | `cc1aae219:13499` |
| `tool-row-caret` | header 里的折叠箭头（CaretDown 12px） | `cc1aae219:13442` |
| `tool-cell-row` | 新版（epitaxy）工具行 | `c5ac695a3-CqnCpnMn.pretty.js:355` |
| `collapsed-steps-toggle` | 分组里「N steps / Hide steps」按钮 | `c5ac695a3:43` |
| `tool-status-pill` | turn 聚合状态行按钮 | `cc1aae219:15292` |
| `tool-status-caret` | 状态行箭头（3 处：leading / trailing / working） | `cc1aae219:15183, 15195, 15254` |
| `tool-status-spark` | 状态行 spark 动画位 | `cc1aae219:15220` |
| `tool-image-thumbnail` | 工具卡内截图缩略图 | `cc1aae219:13182` |
| `tool-body-truncated-note` | 「Output truncated」 | `cc9e4071f-COsmd4CO.pretty.js:8` |
| `tool-param-truncated-note` | 「Too long to show in full」 | `c98a82a77-Cl0GRZ6b.pretty.js:387` |
| `tool-card-crashed` | 卡片渲染崩溃兜底 | `c05b96c7f-DdfnpDBP.pretty.js:1611` |
| `subagent-elbow` | Task 子卡左侧拐角线 | `cc1aae219:14476` |
| `transcript-row` / `transcript-sizer` / `transcript-spacer` / `transcript-end` | transcript 虚拟滚动 | `c4a9ee384:3708, 3787, 3703, 3827` |
| `transcript-bottom-fade` | 底部渐隐 | `ca2ef848d-CKbIdz6g.pretty.js:2362` |

---

## 3. 折叠 / 展开交互

### 3.1 caret 与点击区域

**【确证】**
- caret 是 header `<button>` 的**子孙 span**（`cc1aae219:13441`），不是独立按钮；点击穿过到整个 header 按钮。
- 渲染条件双重：`!N && !hideCaret && !secondaryIcon && isExpanded !== undefined`（`:13437-13440`）。即：不可交互不画、显式 `hideCaret` 不画、用了 `secondaryIcon` 不画（此时箭头由调用方自己画，如 web_search 行用 `ArrowOutSquare`）、没有受控 `isExpanded` 不画。
- caret 收起时 `-rotate-90`（展开时 0deg），初始 `opacity-0`，`.group/row:hover` 或 `:focus-visible` 才 `opacity-100`，触屏（`@media(hover:none)`）常显。
- 图标：`CaretDown`，`size="xs"` = 12px（`shared-frame-BfjMqbuN.pretty.js:1982` 定义 `xs: { px: 12 }`）。

### 3.2 默认展开条件

三层，各不相同：

**(a) 组（同 turn 连续工具）** **【确证】** `cc1aae219:11765-11775`

```js
let x = f.items.every(e =>
  e.block.type === "thinking" || (e.block.type === "tool_use" && e.block.name === "Task"));
…
defaultExpanded: x,
alwaysExpanded: x,
```
即：**一个组里全是 thinking 或 Task 时，默认展开且强制展开**；否则折叠，仅显示末 2 条（`U` 组件：`b = max(0, len-2)`，`x = !f && !u ? slice(-2) : all`，`c5ac695a3:142-143`）。

**(b) 时间线是否整体展开** **【确证】** `cc1aae219:13315, 13323, 14109, 14149, 14152`

```js
qH: if (isExpanded || Vm()) return …      // Vm() = 外层"时间线已展开"上下文
JH: if (isExpanded || Vm()) return …
```
`Vm()` 为 true 时 body 恒挂载、`overflow` 改为 `visible/clip`、`max-h` 抬到 4000px、内边距换成 `--cds-outset-x` 出血版。这解释了「展开时间线后所有工具卡内容全露出来」。

**(c) 单卡自动开合（流式驱动）** **【确证】** `cc2dfdfd3-CZ_wV3oM.pretty.js:4-53`（`Hw`/`Mt`）

```
入参: (defaultExpanded, groupItemKey, isInExpandedTimeline, isStreaming)
T(是否展开) = isInExpandedTimeline || auto ? true
          : groupItemKey ? expandedItemKey === groupItemKey : localFlag
副作用:
  isStreaming 变 true  → 展开, snappyTransition=false
  isStreaming 变 false → 2000ms 后收起; 再 350ms 后恢复 snappyTransition
```
同时用 `expandedItemKey`（`c5ac695a3:118-126` 的 Provider）实现**手风琴**：同组内只允许一个展开。

**(d) 审批场景** **【确证】** `cc1aae219:8998` 把 `expandInputByDefault` 放进 approvalData；`ca3b5b2cd-BKpBjccM.pretty.js:1308` 用 `detailsInitiallyOpen` 消费。**【推断】** 需要审批的工具（Bash 写操作、文件写）入参默认展开，是审批 UI 的职责而非壳的职责。

### 3.3 `epitaxy-expanding-body` 的动画与高度测量

**【确证】** 组件在 `c425fb3cf-DyrNZKbs.pretty.js:98-111`：

```js
F = memo(function ({ expanded, children }) {
  let a = useContext(N);            // "内容是否可见" 上下文
  let [mounted, setMounted] = useState(expanded);
  expanded && !mounted && setMounted(true);   // 一旦展开过就永久挂载
  return mounted
    ? <div className={expanded ? "epitaxy-expanding-body flow-root" : "epitaxy-expanding-body"}
           hidden={!expanded}>
        <N.Provider value={a && expanded}>{children}</N.Provider>
      </div>
    : null;
});
```

配套的 `I({visible, children})`（`:112-115`）只切换上下文值，不卸载 DOM。

**机制结论【确证 + 推断】**：
- **没有 JS 高度测量**，也**没有** height 过渡：展开/收起只是 `hidden` 属性开关（`display:none`）。
- **挂载一次，之后只隐藏**（`setMounted(true)` 后不再回 null），所以子内容（iframe / 图表 / 编辑器）不会因折叠而重挂——这是"expanding body"这个名字的实际含义。
- `flow-root` 仅用于建立 BFC，避免子元素 margin 折叠导致隐藏前后布局跳动。
- 全量 CSS 里**不存在** `.epitaxy-expanding-body` 的样式规则（对 26 个 css chunk 做了全文检索，唯一命中在 JS 字符串里），所以它是个**语义标记类**，可被外部主题/插件选中。
- 该类的另一处用途在 `ccae33cda-CLjcZCAe.pretty.js:314`：焦点恢复时用 `t?.closest(".epitaxy-expanding-body")` 判断焦点是否还在卡内。同一处在 `:533` 用它包裹 AskUserQuestion 的选项列表。

**真正的动画在旧壳侧** **【确证】**：
- 分组展开/收起：framer-motion `grid-template-rows: 1fr` + `transition: { ease: [0.19,1,0.22,1], duration: 0.2 }`（`c5ac695a3:165-177`），类 `timeline-expand-enter` → CSS `@keyframes timeline-expand { 0%{opacity:0;grid-template-rows:0fr} to{opacity:1;grid-template-rows:1fr}}`，`.2s cubic-bezier(.19,1,.22,1)`（`cc1aae219-DtZTxCKj.css`）。
- 卡片体（`JH`）本身**无过渡**，靠 `overflow-hidden` 直接显隐（`cc1aae219:13319`）。
- 时间线文本块自动收起用 `scrollHeight` 测量 + ResizeObserver，阈值 200px（`cc1aae219:14497-14520`，`LU = 200`）。
- 虚影行位移动画：读 `offsetHeight` 后 `animate([{transform: translateY(h)}, {0}], {duration:250, easing:cubic-bezier(.19,1,.22,1)})`（`cc1aae219:15350-15353`，`yW = 250`）。

---

## 4. 状态机

### 4.1 三个 `tool-status-*` 的真实归属

**【确证】** 三者全部来自 `hW`（导出 `gW`），渲染的是**一个 turn 内工具组的聚合状态行**，源码 `cc1aae219:15115-15307`：

| testid | 位置 | 语义 |
| --- | --- | --- |
| `tool-status-pill` | 外层 `<button>`（`:15290-15299`） | 整行可点区域：切换时间线展开。`aria-expanded`、`aria-controls` 指向 panel（`:15295-15297`） |
| `tool-status-caret` | 三处 | ① `caretPosition="leading"`：文字前的 CaretDown 14px（`:15182-15189`）；② `trailing` 且非 working：hover 才出现的 12px CaretDown（`:15194-15202`）；③ working 且 `quiet-dots`：静默点与 caret 叠在同一格（`grid` 叠放，`:15253-15272`） |
| `tool-status-spark` | `:15219-15232` | Claude spark 图形占位，working 时 `w-5 me-0.5` + `opacity-100`，否则 `w-0 -me-2` + `opacity-0`；内含 `<Fc state="writing" size={20}/>` |

**【确证】** 该行文字不是"Running Bash"，而是：
- 运行中：`statusText`（默认 i18n `"Working"` id `gAR0atqpRn`，`:15727`）
- 结束：`"{count, plural, one {# step} other {# steps}}"`（id `vAKAnIbJ4M`，`:15730-15733`）

### 4.2 单个工具卡的 4 个原子状态

**【确证】** 状态由「有无 tool_result」+ `is_error` + `cancelled` 三者推导：

```js
d = t ? (Mp(t) ? "stopped" : t.is_error ? "failed" : "done") : undefined
// cc1aae219:16778（Task 卡）
E = (t?.is_error || false) && !T            // T = t?.cancelled === true || Ld(t)   cc1aae219:13611-13612
K = cancelled                                // 同上
```

| 状态 | 判定 | 视觉 | 状态字符串（i18n id） |
| --- | --- | --- | --- |
| running | 无 result 且流式中 | 文字 `ShimmerText active variant="secondary"`，`background-image: linear-gradient(120deg, secondary 37.5%, mix(secondary,white) 50%, secondary 62.5%)`，`animation: cds-shimmer-text-shine 3s linear infinite`；`background-size:400% 100%`，`-webkit-text-fill-color:transparent` | Bash:`"Running a command"`(`+B6q99cXCl`)；WebFetch:`"Reading a page"`(`nxxRes7Qf3`) / `"Reading {hostname}"`(`pWSKVH/h6d`)；WebSearch:`"Searching the web"`(`5KajyzHSXj`)；Task:`"Running subagent"`(`XGkVpOO9dA`)；通用回退 `"this tool"`(`ydzl/bFz8L`) |
| done | result 存在、非 error、非 cancelled | 正常色 + 完成时文字常显（非 shimmer） | 过去式：`"Ran a command"`(`cv9VNYMHXY`)、`"Searched the web"`(`4+310Bnuvz`)、`"Read {fileName}"`(`sUFFaC9x7r`)、`"Edited {fileName}"`(`V+jPyROpXb`)、`"Created {fileName}"`(`5CvLCHBlfQ`)、`"Done"`(`JXdbo8Vnlw`) |
| error | `is_error === true` 且未 cancelled | 文字包 `<span class="text-danger-000">`（`cc1aae219:14147`，`text-danger-000` = `var(--cds-text-danger)`）；body 用 `bg-danger-900` + `text-danger-000`（`:13631-13637`）；旧壳错误图标 `Warning` + `text-danger`（`c5ac695a3:422-426`） | `"Couldn't read"`(`FaF0pZhJOG`)、`"Couldn't complete this search."`(`PF2CCf1+ZX`)、`"Failed"`(`vXCeIi67rj`)、`"Failed to read {fileName}"`(`sY6b1IqyXe`) |
| stopped | `cancelled === true`（或 lossClass 判定的中断） | 文字带过去式 + 次级说明；不染红（`errorTintAllowed` 门控） | `"Stopped"`(`1LBny5MvRa`)、`"Stopped running the command"`(`hKfea45aHT`)、`"Stopped reading the page"`(`hgLumeKZVX`)、`"Stopped searching the web"`(`bCLH7sVUr7`)、`"Stopped editing {file}"`(`fqubJDzJLU`) |

**【确证】** `<Fc>` 是 `NT`（`shared-frame-BfjMqbuN.pretty.js:10983-10988`，导出别名 `$i`），`state` 白名单只有 `entrance | exit | tickle`（`:10919`），默认色 `var(--cds-clay, #d97757)`（`:5681`）。working 时传 `state="writing"`，不在白名单 → 走静态 `_h` 分支（纯 SVG path，`viewBox="0 0 100 100"`，填充 clay 色）。

### 4.3 `pending` / `stalled` 不属于卡片

**【确证】**
- `pending` 是**审批/输入等待**：`needsUserInput` 判定 `approval_options && approval_key || mcp_auth_required || mcp_elicitation || isToolAwaitingInput || name === "AskUserQuestion"`（`cc1aae219:15417-15429`）。这类块**始终可见**、不被折叠（`OW` 里 `c = needsUserInput(o)` 时无条件 `push`，`:15396-15399`）。
- `stalled` 只出现在 **agent 编排状态**统计里：`{ state:"stalled", n:r }`（`c96d752d0-lrmpAk66.pretty.js:52565`），文案 `"{done} of {total} agents done, {running} running, {stalled} stalled, {error} failed"`（`:52588`）。另一个 `"stalled"` 出现在消息投递状态机（`cf74bc599-C-uiMSfs.pretty.js:5789`）与 `cc1aae219` 之外的 stop_reason 推导（`shared-3-BRUZTCoh.pretty.js:12096`）。
- 因此：**卡片状态机 = {running, done, error, stopped}**；`pending` 是可见性/交互门控标志，`stalled` 是上层 turn 概念。

### 4.4 状态文字切换动画

**【确证】** `mW`（`cc1aae219:15014-15114`）用三层 `span.timeline-status-layer` 叠在同一 grid 单元内做 cross-fade：

| 类 | 动画 |
| --- | --- |
| `timeline-status-enter` | `.25s ease-in-out timeline-fade-in` |
| `timeline-status-enter-quiet` | `.24s cubic-bezier(.3,.7,.4,1) timeline-status-rise`（`0%{opacity:0;translateY(6px)}`） |
| `timeline-status-enter-after-spark` | `.25s ease-in-out .21s both timeline-fade-in`（等 spark 退出） |
| `timeline-status-exit` | `.15s ease-out forwards timeline-fade-out` |
| `timeline-status-exit-quiet` | `.18s ease-out forwards timeline-status-fall`（`to{opacity:0;translateY(-4px)}`） |
| `timeline-spark-depart` | `.42s linear forwards timeline-spark-depart`（`0%,50%{opacity:1} to{opacity:0}`） |

全局常量：`FH = { COLLAPSE_EXPAND:0.2, FADE:0.15, FADE_SLOW:0.3, FADE_IN:0.15, SHIMMER:2.25, LAYOUT:0.2 }`、`IH.EASE_OUT="easeOut"`、`IH.SNAPPY_OUT=[0.19,1,0.22,1]`（`cc1aae219:13207-13208`）。
`prefers-reduced-motion` / `:root[data-reduce-motion=true]` 下 enter 动画置 `none`、exit 层直接 `display:none`（`cc1aae219-DtZTxCKj.css`）。

### 4.5 quiet-dots 与计时

**【确证】** `workingVariant = "quiet-dots"` 时（`cc1aae219:15141`）：
- 显示 3 个 clay 色 3px 圆点，`animation: 1.9s cubic-bezier(.4,0,.2,1) infinite timeline-quiet-dot`，第 2/3 个 `animation-delay: .15s / .3s`（CSS）。
- 运行超过 **5 秒**（`lW = 5`，`:14990`）后显示耗时：`<span class="font-base tabular-nums opacity-[0.65]">{duration}</span>`（`:15246-15251`）。

---

## 5. 头部摘要文案生成

### 5.1 三级来源（优先级从高到低）**【确证】**

```js
// cc1aae219:16043-16051
function qW(block, inputSummary, integration) {
  let r = (Bf(block.name) ? undefined : inputSummary) || HS(integration);
  if (block.tool_display_name !== undefined) return r || ob(block);   // ① 服务端下发
  let i = block.message && block.message !== block.name ? block.message : undefined;
  return r || i;                                                     // ② input 摘要 / message
}
function JW(block, sum, integration) {
  return Kr(qW(...) ?? bp(block.name)) || Kr(bp(block.name)) || "Tool";
}
```
- ① 服务端字段 `tool_display_name`（渲染时打 `servedRow: e.tool_display_name !== undefined`，`cc1aae219:16754`）。
- ② 工具自己算的摘要 `hp(name, input, {done, cancelled, suppressInternalMcp, …})`（`cc1aae219:16731`，实现 `shared-130-Bwsvvi4y.pretty.js:15620-15850+`）。
- ③ 静态词典 `bp(name)`（`dL`，`shared-130-Bwsvvi4y.pretty.js:15751-15761`）——把工具标识符"去蛇形 + 首字母大写"，MCP 名会先剥 `mcp__server__` 前缀（`uL`，`:15743-15750`）。
- 全部经过 `Kr()` = `Yw` → `Uw` 清理：<br>`Uw(e) = e.replace(/[\n\r\u2028\u2029]/g," ").replace(控制字符," ").replace(多余空白," ").trim()`，**输入先 `slice(0, 4000)`**（`shared-78-BDwyc9QD.pretty.js:7108-7119`，`Gw = 4e3`）。

### 5.2 静态摘要词典（片段）**【确证】** `shared-130-Bwsvvi4y.pretty.js:14743-14809`

```
todo_write: "Updating the plan"        read: "Reading a file"        write: "Creating a file"
edit: "Editing a file"                 multi_edit: "Editing files"   str_replace(_editor): "Editing a file"
view: "Reading a file"                 create_file: "Creating a file"  open_file: "Opening file"
glob: "Looking for files"              grep: "Searching files"       file_search: "Searching files"
web_fetch: "Reading a page"            web_search(_fast): "Searching the web"
task/agent: "Running an agent"         repl / java_script: "Running code"
ask_user_question: "Asking a question" skill: "Running skill"
project_knowledge_search: "Searching project knowledge"
drive_search: "Searching Google Drive" tmux: "Running terminal"      kill_bash: "Stopping a command"
preview_start/screenshot/click/type/…  "Starting preview" / "Taking preview screenshot" / …
```

完成态词典 `RF`（`:14894-14908`）与取消态 `zF`（`:14909-14919`）：`read→"Stopped reading file"`、`bash→"Stopped running the command"` 等。

### 5.3 参数摘要拼接规则 **【确证】** `shared-130-Bwsvvi4y.pretty.js:15620-15700`

```js
case "TaskCreate":  `Added task: ${subject}` | "Added task"
case "TaskUpdate":  $I[status] ?? "Updated task status" | "Renamed task" | "Updated task"
case "TaskGet":     "Reading task"        case "TaskList": "Listing tasks"   case "TaskStop": "Stopping task"
bash/bash_tool/power_shell: description || command || (cancelled ? zF[r] : done ? "Ran a command" : "Running a command")
str_replace(_editor): path ? `Editing ${path}` : "Editing a file"
skill: done ? `Ran skill: ${skill}` : `Running skill: ${skill}`
computer: 按 action 映射 "Taking screenshot"/"Clicking"/"Dragging"/"Moving mouse"/"Typing"/"Pressing key"/"Scrolling"
projects: 按 method 映射 `Reading project file${path}` 等
```
文件类卡片另有独立模板（`cc1aae219:13800-13825`）：

```js
gU(action, fileName, streaming, intl):
  create: streaming ? "Creating {fileName}" : "Created {fileName}"   (cuaMuzr//N / 5CvLCHBlfQ)
  read:   streaming ? "Reading {fileName}"  : "Read {fileName}"      (9fXfauBZpW / sUFFaC9x7r)
  edit:   streaming ? "Editing {fileName}"  : "Edited {fileName}"    (O2hMrU1FI9 / V+jPyROpXb)
  present: "Sharing files" / "Shared files"                           (4eilsgmbAQ / 9j5ma+F5F5)
  skill:  "Loading skill" / "Loaded skill"                            (YBctaBAMh/ / /ly4NRQA83)
```
文件名回退：`CLAUDE.md` → `"Global instructions (CLAUDE.md)"` / `"Folder instructions (CLAUDE.md)"`（`53DiPrdI5r` / `dqW6sjmil4`，`cc1aae219:13847-13850`）。

### 5.4 超长截断 **【确证】**

- **没有**按字符数截断的通用函数（唯一上限是清洗函数里的 4000 字符 `slice`，`shared-78-BDwyc9QD.pretty.js:7114`）。
- 视觉截断靠 CSS：
  - 单行：`truncate min-w-0`（`text-overflow:ellipsis; white-space:nowrap; overflow:hidden`，`cc1aae219:13433`）。
  - 新版行：`overflow-hidden overflow-ellipsis whitespace-nowrap`，或换行模式 `min-w-0 [overflow-wrap:anywhere]`（`c5ac695a3:395`）。
  - 双行夹断：`line-clamp-2 break-words`（`cc1aae219:15178`，`ae = G ? "line-clamp-2 break-words" : "truncate"`）。
  - 4 行夹断：`min-w-0 line-clamp-4`（`c5ac695a3:289`）。
- 是否被裁切由 JS 检测：`scrollWidth > clientWidth` 或 `Range.getBoundingClientRect()` 宽度差 > 1/64px（`cc1aae219:13375-13386`），结果通过 `onTextClippedChange` 上报，用于给 header 加 `title` 原生 tooltip（`nativeTitle` 只在被裁切时传，`:14158`）。

### 5.5 i18n

- 全部走 `intl.formatMessage({defaultMessage, id})`，id 是 10 位 base64 风格（如 `cv9VNYMHXY`）。
- 清单在 `ion-dist/i18n/en-US.json`（2.5MB），已抽样核对：`cv9VNYMHXY:"Ran a command"`、`XGkVpOO9dA:"Running subagent"`、`5KajyzHSXj:"Searching the web"`、`JXdbo8Vnlw:"Done"`、`vXCeIi67rj:"Failed"`、`1LBny5MvRa:"Stopped"`、`gAR0atqpRn:"Working"`、`vAKAnIbJ4M:"{count, plural, one {# step} other {# steps}}"`、`ydzl/bFz8L:"this tool"`、`KDzvNnJI+J:"Output truncated"`、`gqXzlTe+X+:"Too long to show in full"`、`Iufn28MeR1:"Hide steps"`、`dS6ebV+vpY:"{collapsedCount, plural, one {# step} other {# steps}}"`。
- 另有内联（非 i18n）英文摘要，如 `shared-130` 的 `kF/RF/zF` 词典是**硬编码英文字面量**——这是与 i18n 体系并存的第二条路径。

---

## 6. 图标体系

### 6.1 主映射表 `xU(toolName, size=16, sweepIcons, servedRow)` **【确证】** `cc1aae219:13924-14032`

先看前缀特判（顺序很关键）：

| 条件 | 图标 |
| --- | --- |
| `TaskCreate/TaskUpdate/TaskGet/TaskList/TaskStop` | `Tasks` |
| `mcp__remote-devices__*`（截 21 字符后查表 `yU`） | `device_bash→CommandLine`、`device_stage_files→BookText`、`device_commit_files→File`、`device_list_dir→Folder`、`list_devices/get_device_info→Computer` |
| `mcp__plugin_documents_Documents__*`（查表 `bU`） | `doc_create→File`（流式中为 `AddCircle`）、`doc_edit→Edit`、`doc_read/doc_outline→BookText`、`doc_search→Search`、`doc_export/doc_check_layout→File`、`doc_resolve_changes→Edit` |
| 非 mcp 且不含 `:`，且 `Vd(name)` | `UserCircle` |
| 非 mcp，且 `jf(name) || Cf(name)` | `Plugin` |
| 非 mcp，且 `am(name) || If(name)` | `Scroll` |

再按规范化名 `Af(name)` 做 `sweepIcons` 二次特判（`:13949-13975`，仅当 `sweepIcons=true`）：

| 规范化名 | 图标 |
| --- | --- |
| `preview_*`（除 `preview_snapshot`） | `EyeFrame` |
| `preview_snapshot` | `Camera` |
| `tmux` | `CommandLinePrompt` |
| `kill_bash` | `StopCircle` |
| `file_search` | `Search` |
| `delete_file` | `Trash` |
| `view` | `Eye` |
| `multi_edit` | `Edit` |
| `notebook_edit` | `BookText` |
| `skill`（非 mcp 且无 `:`） | `Scroll` |
| `create_artifact` | `AddCircle` |

主表（`:13976-14031`）：

| 工具名（规范化后） | 图标名 |
| --- | --- |
| `bash` / `bash_tool` / `power_shell` | `CommandLine` |
| `read` | `BookText` |
| `edit` / `str_replace` / `str_replace_editor` | `Edit` |
| `write` / `create_file` / `open_file` / `update_file` | `File` |
| `glob` / `grep` | `Search` |
| `tool_search` | `Search`（mcp 或含 `:` 时返回 `null`） |
| `repl` | `CodeBlock` |
| `web_search` / `web_search_fast` | `Globe` |
| `web_fetch` | `Globe` |
| `todo_write` | `Tasks` |
| `task` / `agent` | `Agent` |
| `ask_user_question` | `Lightbulb` |
| `push_notification` | `Notification`（mcp 时 `null`） |
| `recent_chats` / `conversation_search` / `project_memory_read` / `project_memory_write` | `Memory` |
| `projects` / `project_knowledge_search` | `Projects` |
| `drive_search` | `<xr>`（Google Drive 品牌 SVG 组件） |
| 兜底（名含 `search_mcp_registry`） | `Connectors` |
| 其它 | `null` → 见 6.2 兜底链 |

### 6.2 图标解析总链路 **【确证】** `cc1aae219:14118-14146`

```
1. 显式 icon prop           → 直接用
2. iconName 字符串（t.icon_name）→ wU(iconName, size)     ← 6.3
3. xU(toolName, size, sweepIcons, servedRow)              ← 6.1
4. integrationIconUrl 存在 → qn/Ar（favicon/图片，fallback 为字母头像 th）
5. 兜底 → b（integrationName）? 字母头像 : <Icon name="Wrench"/>
```
`isPlaceholder` 只在最后一步为真，此时 TimelineGroup 模式下**不画图标**、改用 6px 圆点（`:14149, 14155-14156`）。

### 6.3 `iconName` 字符串映射 `wU` **【确证】** `cc1aae219:14037-14071`

`Bc` 白名单内的名字直接当图标名（`CU()`，`:14034-14036`）；否则按别名表：

`globe→Globe`、`codeBlock→CodeBlock`、`commandLine→CommandLine`、`bookText→BookText`、`file→File`、`edit→Edit`、`search→Search`、`tasks→Tasks`、`agent→Agent`、`lightbulb→Lightbulb`、`memory→Memory`、`projects→Projects`、`artifacts→Artifacts`、`connectorSmall→Connectors`；未命返回 `null`。

### 6.4 文件类卡片图标 `hU` **【确证】** `cc1aae219:13789-13799`

```
含 "SKILL.md" 或 action==="skill" → Scroll
present / read                     → File
默认                               → File
```

### 6.5 浏览器/computer 动作图标 `RW` + `zW` **【确证】** `cc1aae219:15879-15919`

`camera→Camera`、`keyboard→Keyboard`、`timer→Timer`、`eye→Eye`、`search→Search`、`navigate→Globe`、`upload→Upload`、`code→Code`、`terminal→CommandLine`、`shuffle→Shuffle`、`batch→Batch`、`click→Cursor`、`scroll-up/down/left/right→ArrowUp/Down/Left/Right`、`drag→Reorder`、`zoom→SearchCircle`、`computer→Computer`、`tabs→ArrowOutSquare`、`gif→Image`、`network→Activity`、`console→CommandLinePrompt`、`resize→ArrowsOut`、`plan→Tasks`、`web-search/web-fetch→Globe`、`menu→Menu`、`clipboard→Clipboard`；未命中 → `Computer`。

### 6.6 集成/连接器图标 `V`（`c98a82a77-Cl0GRZ6b.pretty.js:287-309`）**【确证】**

`Search Project Knowledge→Projects`、`Memory / Search Past Conversations→Memory`、`Google Drive→GDRIVE`、`Google Calendar→GCAL`、`Gmail→GMAIL`，其余走 favicon。

### 6.7 尺寸

**【确证】** `shared-frame-BfjMqbuN.pretty.js:1981-1988`：

```
xs  12px (stroke 0.8)     sm 16px (1 / 1.25)     md 20px (1.2 / 1.5)
lg  24px (1.4)            xl 28px (1.6)          xxl 32px (1.8)
```
工具卡 header 用 `iconSize: 20`（`cc1aae219:16744, 17973`），旧卡默认 `16`（`cc1aae219:14084`），caret 用 `xs`=12，`CaretDown` leading 用 14。
图标本体是 `1em` 视觉的 SVG，`font-size` 由 `Go(size, stroke)` 算：`fontSize = lo(px)`，`fontWeight = 400 + 300 * (px*stroke/normalize)` 且夹在 [400,700]（`:2025-2036`）——即**图标尺寸同时驱动其描边粗细**。

### 6.8 `diffs-icon-*` 与本范围的边界

`diffs-icon-*`（`c64baa838-Dmxf9-qc.pretty.js:114, 1501-1505`）属于 **diff 视图**的图标（`diffs-icon-plus/file-code/symbol-modified/symbol-added`），**不参与**工具卡 header 图标选择。工具卡只用 6.1-6.6 的 CDS 图标名。

---

## 7. 分组与嵌套

### 7.1 同一 turn 内连续工具的聚合 **【确证】** `cc1aae219:11621-11818`

```
遍历 blocks：
  if (ew(block, …)) {                 // 可聚合判定
     items = [当前块]; 向后贪婪吞并所有 ew() 为真的块
     若组内含 artifacts 工具 → 从该位置截断（:11636-11643）
     renderable 数为 0 → 退化成 single
     否则 → { type:"group", content:{items, startIndex, isLastBlockOfMessage} }
  } else → single
```
渲染：`items.length <= 1` 时按单块渲染；否则交给 `nw`（= `c5ac695a3` 的 `U`）：

```
U({ defaultExpanded, alwaysExpanded })                                c5ac695a3:127-164
  div.class = "rounded-[…] border-0.5 flex flex-col font-sans leading-normal
               border-border-300 min-h-[2.625rem] overflow-hidden"
  children:
    b>0 && !alwaysExpanded && <ie collapsedCount={b} …/>   // "N steps / Hide steps" 按钮
    <AnimatePresence><q>每项</q></AnimatePresence>          // grid 展开动画
```
其中 `b = max(0, items.length - 2)`——**默认最多折叠掉前 N-2 条**。

每个成员行以 `renderMode: TimelineGroup` 渲染（`cc1aae219:11797`），并传入 `isFirstItemInGroup / isLastItemInGroup`。TimelineGroup 模式下外壳走 `KH`（竖线+圆点时间线版本，`cc1aae219:13224-13312`）：

```
KH (GH)
  div.flex.flex-col.shrink-0
    ├ div.h-[8px] > div.w-[20px] > div.w-[1px].h-full.bg-border-300   ← 上连接线
    ├ div.rounded-[…]
    │   ├ div.group/titem（header 行, py-1）
    │   │   ├ div.w-[20px]（图标或 8px 圆点 bg-border-100）
    │   │   └ div.flex-1.min-w-0（header 内容）
    │   └ div.flex.flex-row（body 行）
    │       ├ div.w-[20px]（竖线 w-[1px]）
    │       └ div.flex-1.min-w-0（children）
    └ div.h-[8px] > 竖线                                              ← 下连接线
```
**【确证】** TimelineGroup + 时间线已展开时，外壳**只渲染 children、不渲染 header**（`cc1aae219:13512-13515`、`c5ac695a3:472-475`）——这就是"展开时间线 = 列表化"的实现方式。

### 7.2 Task 子代理嵌套

**【确证】** `FU`/`IU`（`cc1aae219:14374-14495`）：

```
XH (hideCaret, handleClick=toggle, secondaryText=状态胶囊)
  icon = Agent (sm/md)
  text = description || "Running subagent"
  secondaryText = [ "Done"/"Failed"/"Stopped" · "{n} steps" ] + <CaretRight rotate-45 when expanded>
  children = 展开时：
    div.overflow-hidden > div.mt-1
      <MU borderless autoCollapse={false}>            ← 内层 MU 是"时间线容器"（无外框）
        subagentBlocks.map(block =>
          S || isStepRow
            ? div.flex.items-start.gap-xs.ps-xs
                ├ span[data-testid="subagent-elbow"]           ← 拐角
                │   class = "flex h-control w-3 shrink-0 items-center"
                │   > span.size-3.-translate-y-1/2.rounded-es-chip.border-s.border-b.border-strong
                └ div.min-w-0.flex-1 > <UG 子工具卡>
            : div > <UG 子工具卡>)
```
- `p = subagentBlocks.filter(b => b.type === "tool_use" && !hidden(b))`（`:16780`）——只把子 `tool_use` 当子卡。
- 子块渲染仍是 `By` + `WG`（`:16579`），即**同一套卡片组件递归**，只是 `renderMode` 传 `TimelineGroup`、`asStepRow` 控制是否画拐角。
- 顶层 `bB` 判定：`metadata.render_hint === "subagent"` 或 blocks 里存在 `name === "Task"` 时，`xB` 会把 `_isSubagentBlock` 的块从主消息里剔除（`cc1aae219:11561-11572`），避免子工具卡在主 turn 里重复出现。

---

## 8. 流式（参数未完成）时的占位

**【确证】** 三层机制：

1. **错误边界重置键**：`pl()` 用 `result | input_settled | partial_input` 作 `resetOn`（`c05b96c7f-DdfnpDBP.pretty.js:1596-1605`）。参数未收完时卡片以"partial_input"身份存在并可重挂，收完后不重建（仅切换边界状态）。
2. **`isStreaming` 驱动文字 shimmer**：`TU` 把 `isStreaming` 透传给 `YH`，行内 `<ShimmerText active>`（`cc1aae219:14162, 13429`）——**卡片从 tool_use 第一个字节到达时就出现**，不是等结果。
3. **`partialJson` 专有占位**：部分工具在 `input` 未 settle 时用 `partial_json` 渲染骨架/部分内容：
   - 入口：`KL` 把 `t.partial_json` 透传给 cell（`cc1aae219:9141`）；`_1`（另一实现）在 `:27978` 判断 `t && !s && typeof W === "string"` 时改渲染 `O$`（部分态组件）。
   - `O$`（`cc1aae219:26662-26694`）示例：文字 `"Sending notification"`(`RnjX9qJ/7E`) / 完成 `"Sent notification"`(`0SIm+asooC`)，`isStreaming = !!r && !n`（有 result 才停）。
   - 图片搜索类会用正则从 `partial_json` 抠数量：`/"num_images"\s*:\s*(\d+)\s*[,}]/`（`c05b96c7f-DdfnpDBP.pretty.js:3921`）。
4. **body 不预先撑开**：`isExpanded` 初始 false，未展开时 body 完全不挂载（`JH` 返回 null），所以流式期间卡片只有 1 行高，参数收完/展开才出现内容。
5. **transcript 级占位**（本范围之外但相关）：骨架行用 `h-[1lh] w-56 rounded bg-alpha-1 text-body`（`c10f0af0c-CEXal87U.pretty.js:1920`），`1lh` 在该作用域 = `text-body` 的行高 = 20px。

---

## 9. 相关 CSS 实际数值

### 9.1 本卡专属 CSS 文件

`assets/v1/cc1aae219-DtZTxCKj.css`（3.3KB）——时间线/状态行/静默点全部动画都在这里。原样摘录关键块：

```css
@keyframes timeline-fade-in { 0%{opacity:0} to{opacity:1} }
@keyframes timeline-block-enter {
  0%  { opacity:0; filter:blur(4px); animation-timing-function:cubic-bezier(.22,1,.36,1);
        transform:translateY(5px) scale(.9) }
  30% { opacity:0; filter:blur(4px); animation-timing-function:ease-out; transform:none }
  to  { opacity:1; filter:none; transform:none }
}
.timeline-status-layer { grid-area:1/1; align-items:center; gap:.25rem; min-width:0; display:inline-flex }
.timeline-status-enter            { animation:.25s ease-in-out timeline-fade-in }
.timeline-status-exit             { animation:.15s ease-out forwards timeline-fade-out }
.timeline-status-enter-after-spark{ animation:.25s ease-in-out .21s both timeline-fade-in }
.timeline-spark-depart            { animation:.42s linear forwards timeline-spark-depart }
@keyframes timeline-spark-depart  { 0%,50%{opacity:1} to{opacity:0} }
@keyframes timeline-status-fall   { 0%{opacity:1;transform:none} to{opacity:0;transform:translateY(-4px)} }
.timeline-status-exit-quiet       { animation:.18s ease-out forwards timeline-status-fall }
@keyframes timeline-status-rise   { 0%{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
.timeline-status-enter-quiet      { animation:.24s cubic-bezier(.3,.7,.4,1) timeline-status-rise }

.timeline-expand       { grid-template-rows:1fr; display:grid }
.timeline-expand > *   { align-self:start; min-width:0; min-height:0 }
.timeline-expand-enter { animation:.2s cubic-bezier(.19,1,.22,1) timeline-expand }
@keyframes timeline-expand { 0%{opacity:0;grid-template-rows:0fr} to{opacity:1;grid-template-rows:1fr} }

.timeline-pop-exit      { pointer-events:none; animation:.18s ease-out forwards timeline-fade-out }
.timeline-block-fade-exit{ animation:.15s ease-out forwards timeline-fade-out }

.timeline-quiet-dots        { gap:3.5px; display:inline-flex; position:relative; top:.26em }
.timeline-quiet-dots > span { background:var(--cds-clay,#d97757); opacity:0; border-radius:50%;
                              width:3px; height:3px;
                              animation:1.9s cubic-bezier(.4,0,.2,1) infinite timeline-quiet-dot }
.timeline-quiet-dots > span:nth-child(2) { animation-delay:.15s }
.timeline-quiet-dots > span:nth-child(3) { animation-delay:.3s }
@keyframes timeline-quiet-dot {
  0%,8%   { opacity:0; transform:translateY(2px) }
  22%     { opacity:1; transform:translateY(-2.5px) }
  36%,70% { opacity:1; transform:translateY(0) }
  90%,to  { opacity:0; transform:translateY(0) }
}
/* reduce-motion：enter 动画 none；exit / spark-depart 直接 display:none */
```

### 9.2 从 Tailwind 类反查出的实际数值（`c6a992d55-sXiDGMFQ.css`）

> 下列 Tailwind 数值型工具类（`px-2.5` / `gap-2` …）**与 density 无关**，直接乘 `--spacing`。
> 但 CSS 变量型（`gap-xs`、`p-md`、`rounded`、`h-control`）**随 density 变**，表中标注两栏。

| 类 | 编译结果 |
| --- | --- |
| `px-2.5` | `padding-inline: calc(var(--spacing) * 2.5)` = **10px**（`--spacing: .25rem`） |
| `px-3` / `px-2` / `px-1` | 12 / 8 / 4 px |
| `py-2` / `py-1.5` / `py-1` / `py-0.75` | 8 / 6 / 4 / 3 px |
| `gap-2` / `gap-1.5` / `gap-1` / `gap-0.75` / `gap-0.5` | 8 / 6 / 4 / 3 / 2 px |
| `mt-1` / `mt-2` / `mt-3` / `mb-2` / `mb-3` | 4 / 8 / 12 / 8 / 12 px |
| `mx-2.5` | 10px（左右） |
| `h-[2.625rem]` / `min-h-[2.625rem]` | **42px**（`compact:` 变体 `h-9` = 36px） |
| `border-0.5` / `border-[0.5px]` | `border-width: .5px`，`border-style: var(--tw-border-style)` = solid |
| `rounded-[var(--msg-block-radius,0.5rem)]` | `border-radius: var(--msg-block-radius, .5rem)` → 默认 **8px** |
| `rounded-lg` / `rounded-xl` / `rounded-sm` | 8 / 12 / 4 px（`--radius-lg:.5rem`、`--radius-xl:.75rem`、`--radius-sm:.25rem`） |
| **`rounded-[var(--cds-radius)]` 家族（`rounded-card` 等）** | comfortable：`--cds-radius` = `.5rem` → `rounded-card = calc(.5rem + .25rem)` = **12px**；裸值 `--cds-radius` = `.375rem` → 10px |
| **`gap-xs` / `gap-sm` / `gap-md`** | comfortable：**8 / 12 / 16px**；裸值：6 / 8 / 12px |
| **`p-md` / `px-md` / `py-md`** | comfortable：`--cds-pad-md` = `.75rem` = **12px**；裸值 8px |
| `bg-bg-000` | `var(--cds-surface-3)` → 浅色 `#fff`（gray-0） |
| `bg-bg-200` | `var(--cds-surface-0)` → 浅色 `#f9f9f7`（gray-20） |
| `bg-surface-3` / `bg-surface-0` | gray-0 / gray-20（同上） |
| `border-border-300` | `var(--cds-border)`——**两处定义**：`:root` 里是 `currentColor`；`.cds-root` 里是 `var(--cds-alpha-2)` = `hsl(from gray-900 h s l / 10%)`。**实际生效是 `.cds-root` 的 alpha-2**（特异性更高） |
| `border-strong` | `var(--cds-border-strong)` = `var(--cds-alpha-3)` = `hsl(from gray-900 h s l / 20%)` |
| `text-text-300` | `var(--cds-text-secondary)` |
| `text-text-500` | `var(--cds-text-muted)` |
| `text-secondary` | `var(--cds-text-secondary)` |
| `text-muted` | `var(--cds-text-muted)` |
| `text-muted-as-secondary` | `var(--muted-as-secondary, var(--cds-text-muted))` ← `--muted-as-secondary` 在产物 CSS 里**从未定义**，等价于 muted |
| `text-danger-000` | `var(--cds-text-danger)` |
| `bg-danger-900` | `var(--cds-bg-danger)`（浅色 `--cds-red-100` = `#fad6d6`） |
| `bg-alpha-1` | `var(--cds-alpha-1)` = `hsl(from gray-900 h s l / 5%)` |
| `duration-150/200/400` | `.15s / .2s / .4s` |
| `ease-snappy-out` | `cubic-bezier(.19,1,.22,1)` |
| `ease-out` | `var(--cds-ease-out)` = `cubic-bezier(.165,.84,.44,1)` |
| `max-h-[200px]` / `max-h-[4000px]` / `max-h-[150px]` | 200 / 4000 / 150 px |
| `w-[20px]` / `h-[8px]` / `size-[8px]` / `w-5 h-5` | 20px 槽宽、8px 连接线、8px 点、20px 图标位 |
| `top:.26em`（quiet dots） | 相对工具卡 12px 字号 ≈ 3.1px |

### 9.3 卡片视觉要点汇总

- 圆角：`var(--msg-block-radius, 0.5rem)` = **8px**（用户消息内被置为 `initial`，`cc1aae219:25053`）。
- 边框：`0.5px solid`，色 `var(--cds-border)` = `.cds-root` 下的 `--cds-alpha-2` = **`hsl(from #0b0b0b h s l / 10%)`**（浅色）。不是 `currentColor`——`:root` 的 `currentColor` 被 `.cds-root` 覆盖。
- 展开态：`bg-bg-000`（白）+ `shadow-sm`；折叠态 hover：`bg-bg-200`（`#f9f9f7`）。
- 垂直节奏：首块 `mt-2`(8px)、非首块 `mt-3`(12px)；末块 `mb-2`／非末块 `mb-3`（`cc1aae219:13532-13533`）。
- 底部渐隐：`data-testid="transcript-bottom-fade"`，`page-fade-b absolute h-12`，`background-image: linear-gradient(to top, var(--cds-page-bg), transparent)`，`transition: opacity/visibility .15s ease-out`（`ca2ef848d-CKbIdz6g.pretty.js:2362-2368`）。
- 顶层渐变：`.page-fade-t-soft` 五段 `color-mix` 渐隐（`c6a992d55…css`）。

---

## 10. 排版度量 / Typography（逐元素四要素）

> **前置（必读）**：`1rem = 16px`（`:root{font-size:calc(100% * env(preferred-text-scale,1))}`）；`--cds-rem-scale: 1`（仅 iOS `-apple-system-body` 场景变 `16/17`）。
> **桌面端 `<html>` 实际是 `data-density="comfortable" class="cds-root"`**（`ion-dist/index.html`），
> 所以 `.cds-root[data-density=comfortable]` 那整块 token 覆盖 `.cds-root` 的裸值。
> 本章左列一律给 **comfortable 实际值**；需要对照时在括号里给裸值。以下 px 均按 `--cds-rem-scale:1` 计算。

### 10.0 字体族（font-family）

| 变量 | 值 | 定义处 |
| --- | --- | --- |
| `--font-anthropic-sans` | `"anthropic-sans", var(--font-sans-fallbacks)` | `c6a992d55…css` |
| `--font-sans-fallbacks` | `system-ui, "Segoe UI", Roboto, Helvetica, Arial, var(--font-cjk-sans-fallback), var(--font-script-fallbacks), sans-serif` | 同上 |
| `--cds-font-system`（:root） | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "PingFang TC", "Hiragino Sans", "Apple SD Gothic Neo", sans-serif` | 同上 |
| `--cds-font-sans`（`:root`） | `var(--cds-font-system)`（**不含 anthropic-sans**） | 同上 |
| `--cds-font-sans`（`.cds-root`） | `var(--font-anthropic-sans, var(--cds-font-system)), var(--cds-font-system)` | 同上 |
| `--font-ui` | `var(--font-anthropic-sans)` | 同上 |
| `--cds-font-sans`（无障碍字体开启时） | `var(--font-ui-dyslexic)` = `"OpenDyslexic", var(--font-anthropic-sans)` | 同上 |
| `--font-anthropic-mono` | `"anthropic-mono", ui-monospace, monospace` | 同上 |
| `--cds-font-mono`（`.cds-root`） | `var(--cds-font-mono-override,) var(--font-anthropic-mono,"SF Mono"), "SF Mono", ui-monospace, Menlo, Consolas, monospace` | 同上 |
| `--cds-font-mono`（`:root` 兜底版） | `var(--cds-font-mono-override,) ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` | 同上 |
| `--font-mono` | `var(--cds-font-mono)` | 同上 |
| `--font-anthropic-serif` | `"anthropic-serif", "Anthropic Serif Fallback Georgia", …Georgia, "Arial Hebrew", "Noto Sans Hebrew", "Times New Roman", Times, var(--font-cjk-serif-fallback), var(--font-script-fallbacks), serif`（工具卡**不用**） | 同上 |

`@font-face`（真实字体名与文件）：

```css
@font-face{font-family:anthropic-sans; src:url(/assets/v1/cc27851ad-DDVos-BJ.woff2);
           font-weight:300 800; font-style:normal; font-display:swap; font-feature-settings:"dlig" 0}
@font-face{font-family:anthropic-sans; src:url(/assets/v1/c9d3a3a49-CJtkx3-S.woff2);
           font-weight:300 800; font-style:italic}
@font-face{font-family:anthropic-mono; src:url(/assets/v1/c5dbe0935-CQcSkHaI.woff2);
           font-weight:300 800; font-style:normal}
@font-face{font-family:anthropic-serif; src:url(/assets/v1/c66fc489e-2VcCjn5t.woff2); font-weight:300 800}
@font-face{font-family:Anthropicons-Variable; src:url(/assets/v1/c0f671921-cvFTkbeX.woff2);
           font-weight:400 700; font-display:block}
```

**结论（按元素）**

| 元素 | font-family | 字号（comfortable） | 依据 |
| --- | --- | --- | --- |
| 卡片外壳 | `font-sans` → `var(--cds-font-sans)` = `.cds-root` 下 `var(--font-anthropic-sans, var(--cds-font-system)), var(--cds-font-system)` | — | `cc1aae219:13530`、`c5ac695a3:146` |
| header 标题（工具名/摘要） | 继承外壳（anthropic-sans 变量字体） | 旧壳 `text-body` = **14px/20px**；新壳 `font-base` 被行包裹器压到 **12px/20px** | `cc1aae219:13421`；`c5ac695a3:393`；`c041f89c8:13` |
| meta / 副标题 `secondaryText` | 继承；用 `font-small`（显式 `font-family:var(--cds-font-sans)`） | **12px / 17px**（caption 档） | `cc1aae219:13459`；`c5ac695a3:446`；`.font-small` |
| 路径 / 文件名 | 同标题，**非等宽**（`Read src/app.ts` 里文件名无 mono 包装） | 同标题 | `cc1aae219:13857` |
| body 内代码/命令片段 | `text-code` → `font-family: var(--cds-font-mono)`；行内 `code` 同为 mono | `text-code` = **13px/19px**；行内 `code` = `calc(var(--chat-body) - 1px)` = **13px**；`.code-block__code` 被 `--msg-code-font-size` 钉死 **12px** | `c19e90103-CuNz46ca.css`；`c041f89c8:13` |
| 状态词（"Running a command"） | 同标题族（anthropic-sans），**非等宽**；working 时是 `<ShimmerText variant="secondary">` | 同标题 | `cc1aae219:13622`、`:13429` |
| 图标旁文本 | 同标题族 | 同标题 | — |
| 计时 / 计数 | anthropic-sans + `font-variant-numeric: tabular-nums` | 计时 `font-base`（12px）；计数 `font-small`（12px） | `cc1aae219:15249`、`:13739` |
| 分组提示 "N steps" / "Hide steps" | 继承，`text-sm` | **14px / 20px**（Tailwind 静态） | `c5ac695a3:75` |
| 分组 `collapsed-steps-toggle` 按钮 | 同上 | 同上 | `c5ac695a3:40-48` |
| 错误正文 | 新壳 `text-code`（**mono 13px**）；旧壳 `pre.text-xs` + `code`（**mono 12px**） | — | `c5ac695a3:466`；`cc1aae219:13635-13637` |
| 结果列表 `result-list-box` | `font-sans` + `text-footnote`（13px/17px） | — | `cc1aae219:14748` |
| 分组容器 | `font-sans leading-normal` → **line-height: 1.5** | — | `c5ac695a3:146`；`cc1aae219:13530` |

### 10.1 字号（font-size）

> **关键前提（容易搞错）**：桌面端 `<html>` 上是 `data-density="comfortable"` 且 `class="cds-root"`（`ion-dist/index.html` 的 `<html>` 标签），
> 因此 `.cds-root[data-density=comfortable]` 那一整块 token **覆盖**了 `.cds-root` 的默认值。
> 下表左列给 **comfortable（桌面实际生效）**，右列给 `.cds-root` 裸值（compact 或未设 density 时）。

| 变量 | comfortable（**桌面实际**） | `.cds-root` 裸值 |
| --- | --- | --- |
| `--cds-font-size-body` | `.875rem` = **14px** | `.8125rem` = 13px |
| `--cds-leading-body` | `1.25rem` = **20px** | 1.1875rem = 19px |
| `--cds-font-size-footnote` | `.8125rem` = **13px** | `.75rem` = 12px |
| `--cds-leading-footnote` | `1.0625rem` = **17px** | `.9375rem` = 15px |
| `--cds-font-size-caption` | `.75rem` = **12px** | `.6875rem` = 11px |
| `--cds-leading-caption` | `1.0625rem` = **17px** | 1.0625rem = 17px |
| `--cds-font-size-code` | `.8125rem` = **13px** | `.75rem` = 12px |
| `--cds-leading-code` | `1.1875rem` = **19px** | 1.0625rem = 17px |
| `--cds-font-size-heading` | `.9375rem` = **15px** | `.875rem` = 14px |
| `--cds-leading-heading` | `1.25rem` = **20px** | 1.125rem = 18px |
| `--cds-font-size-title` | `1.375rem` = **22px** | 1.25rem = 20px |
| `--cds-leading-title` | `1.75rem` = **28px** | 1.5625rem = 25px |
| `--cds-font-size-prose` | `1rem` = **16px** | `.875rem` = 14px |
| `--cds-leading-prose` | `1.5rem` = **24px** | 1.25rem = 20px |

派生类（跟随上表变量，故 comfortable 下也随之变大）：

| 类 | comfortable 实际 | 说明 |
| --- | --- | --- |
| `.text-body` | **14px / 20px** | `font-size:var(--cds-font-size-body); line-height:var(--cds-leading-body)` |
| `.text-footnote` | **13px / 17px** | |
| `.text-caption` | **12px / 17px** | |
| `.text-code` | **13px / 19px** + mono | `font-size:var(--cds-font-size-code); line-height:var(--cds-leading-code); font-family:var(--cds-font-mono)` |
| `.font-base` | **14px / 20px** / 400 | 三元组 `font-family:sans; font-size:body; font-weight:regular; line-height:body` |
| `.font-base-bold` | **14px / 20px** / 500 | 同上但 `font-weight:medium` |
| `.font-small` | **12px / 17px** / 400 | `font-size:caption; line-height:caption`（注意：**不是** footnote） |
| `.font-large` | **15px / 20px** / 400 | `font-size:heading; line-height:heading` |
| `.text-sm`（Tailwind 静态值，不随 density） | **14px**，行高 `calc(1.25/.875)`=1.42857 → **20px** | `--text-sm:.875rem` 是 Tailwind 常量 |
| `.text-xs`（Tailwind 静态值） | **12px**，行高 `calc(1/.75)`=1.3333 → **16px** | `--text-xs:.75rem` |

**工具行 vs 正文是否不同** **【确证】**
- transcript 正文基准：`.epitaxy-transcript-typography { --chat-body: calc(.875rem * scale); --chat-leading:1.42857; font-size:var(--chat-body); line-height:var(--chat-leading) }` → **14px/20px**（与 `--cds-font-size-body` 的 comfortable 值恰好一致）。
- **transcript 行包裹器**会把 `.font-base` 与 `[data-timeline-text]` 强制压到 `--msg-timeline-font-size`：`[--msg-timeline-font-size:0.75rem] … [&_.font-base]:text-[length:var(--msg-timeline-font-size)] [&_[data-timeline-text]]:!text-[length:var(--msg-timeline-font-size)] [&_[class*='!font-base']]:!text-[length:var(--msg-timeline-font-size)]`（`c041f89c8-n0JhV0Ev.pretty.js:13`）。
  → **新壳工具卡（`font-base`）= 12px/20px**（字号被压，行高保持 20px）；**旧壳工具卡（`text-body`）不受影响 = 14px/20px**。
- 因此：新壳卡片比正文小 2px，旧壳卡片与正文同号。**两套壳的字号不一致是产物里的既成事实**。
- `[--msg-font-size:0.8125rem]` 把 `.font-large` 与 `.font-claude-response-body` 定为 13px；`[--msg-code-font-size:0.75rem]` 把 `.code-block__code` 与行内 `code` 定为 12px——**代码在所有密度/所有壳里都是 12px**，因为被显式 `!important` 钉死。

**`data-chat-text-size` 响应** **【确证】**（`c6a992d55…css`）

```css
.epitaxy-transcript-typography        { --chat-body: calc(.875rem * scale); --chat-leading: 1.42857 }   /* 默认 14px / 20px */
[data-chat-text-size=s] .epitaxy-transcript-typography { --chat-body: calc(.8125rem * scale) }          /* 13px，行高沿用 1.42857 → 18.57px */
[data-chat-text-size=l] .epitaxy-transcript-typography { --chat-body: calc(.9375rem * scale); --chat-leading:1.46667 }  /* 15px / 22px */
[data-chat-text-size=s] .epitaxy-root { --prompt-text-size: calc(.8125rem * scale) }
[data-chat-text-size=l] .epitaxy-root { --prompt-text-size: calc(.9375rem * scale) }
```
注意：`--cds-font-size-*` **不随** `data-chat-text-size` 变化——只有 `--chat-body` 与 `--prompt-text-size` 变。
因此 **s/l 切换只改正文，不改工具卡**；工具卡的 `text-body`/`font-base` 吃 `--cds-font-size-body`（density 决定），不受 s/l 影响。这是三条独立轴（density / chat-text-size / 无）的叠加结果：

| 轴 | 影响范围 | 取值 |
| --- | --- | --- |
| `data-density`（html 上，桌面固定 comfortable） | `--cds-font-size-*`、`--cds-*` 间距/圆角/控件高 | comfortable / 默认真（compact 只由 `.cds-root` 裸值体现） |
| `data-chat-text-size`（s / 无 / l） | `--chat-body`、`--prompt-text-size` | 13 / 14 / 15px |
| `--msg-timeline-font-size`（行包裹器写死 0.75rem） | `.font-base`、`[data-timeline-text]` | 12px（**不随任何轴变**） |

### 10.2 字重（font-weight）

| 变量 / 类 | 数值 |
| --- | --- |
| `--cds-font-weight-regular` | **400** |
| `--cds-font-weight-medium` | **500** |
| `--cds-font-weight-semibold` | **580**（注意不是 600） |
| `--cds-font-weight-bold` | **600**（注意不是 700） |
| `.font-base` | `var(--cds-font-weight-regular)` = 400 |
| `.font-base-bold` | `var(--cds-font-weight-medium)` = 500 |
| `.font-small` | 400 |
| `.text-body-medium` | 500 + `--cds-font-axis-wght: var(--cds-font-axis-wght-medium)` |
| `.text-body-semibold` | 580 + `--cds-font-axis-wght: var(--cds-font-axis-wght-semibold)` |
| `.text-footnote-medium` | 500 + axis medium |
| `.font-medium` | `var(--_cds-font-weight-role, 500)` |
| `.font-semibold` | `var(--_cds-font-weight-role, 580)` |

**变量字体轴：浅色与暗色是两套机制** **【确证】**（`c6a992d55…css`）

浅色（`.cds-root` 默认块）：`font-weight` 给数值，**wght 轴给 `normal`**
```css
--cds-font-weight-regular:400; --cds-font-weight-medium:500;
--cds-font-weight-semibold:580; --cds-font-weight-bold:600;
--cds-font-wght-regular:normal; --cds-font-wght-medium:normal;
--cds-font-wght-semibold:normal; --cds-font-wght-bold:normal;
```

暗色（`@media screen { [data-mode=dark] .cds-root … }`）：**wght 轴接管**，把字重整体压轻
```css
--cds-font-wght-regular:"wght" 360;  --cds-font-wght-medium:"wght" 460;
--cds-font-wght-semibold:"wght" 540; --cds-font-wght-bold:"wght" 560;
--cds-font-axis-wght-regular:var(--cds-font-wght-regular),;  /* … medium/semibold/bold 同构 */
```

基座（`:where(.cds-root,.cds-dark-scope[data-mode=dark])`）：
```css
--cds-font-axis-wght: var(--cds-font-axis-wght-body, var(--cds-font-axis-wght-regular));
font-variation-settings: var(--font-opsz-axis,) var(--cds-font-axis-wght,) "GRAD" var(--cds-font-grad,0);
--font-opsz-axis: "opsz" 48,;   --cds-font-grad: 0
```

要点：
- **浅色下 `font-variation-settings` 的 wght 是 `normal`**，即真实字重完全由 `font-weight` 数值决定（400/500/580/600）；
- **暗色下 wght 轴被显式设成 360/460/540/560**，而 `font-weight` 数值不变——这就是"暗色字重看起来更轻"的机制；
- `"opsz" 48` 常驻，`"GRAD" var(--cds-font-grad,0)` 为 0（关闭 grade 轴）；
- **不是** `font-variation-settings:"wght" N` 单独写死，而是 `var(--cds-font-axis-wght)` 间接引用，所以能被 `.text-body-medium` 之类的类覆盖。
- `.font-base-bold` 只改 `font-weight:500`，**没有**同时把 `--cds-font-axis-wght` 换成 medium → 暗色下（axis=360）它与 `.font-base` 视觉几乎无差。【推断】属实现遗留，非刻意设计。
- `.text-body-medium` / `.text-body-semibold` / `.text-footnote-medium` 是**两条路径都改**（`font-weight` + `--cds-font-axis-wght`），所以是真正可靠的加粗方式。
- `<b>` / `<strong>` 且不带任何 `font*` 类时：`--cds-font-axis-wght: var(--cds-font-axis-wght-bold)`（浅色 600 / 暗色 560）。

**按元素**
- 工具名 / 摘要：400（`.font-base` / 继承），**不加粗**。
- 状态词：400；working 时靠 shimmer 渐变而非加粗。
- 失败词（"Couldn't read"）：400 + `text-danger-000`，无加粗（`cc1aae219:14679`）。
- 分组 "N steps"：`text-sm`，字重继承 400（`c5ac695a3:75`）。
- 折叠计数按钮文字：400 + `text-muted-as-secondary`。
- "Run summary" 之类小标签：`text-caption` + `uppercase` + `tracking-wide`，字重 400（`cc1aae219:25326`）。
- 卡片内错误代码块标题：无独立字重，随 `code` 继承。

### 10.3 字距（letter-spacing / tracking）

**【确证】** 工具卡默认**无** letter-spacing（无任何 `tracking-*` 应用于标题/正文）。

| 类 | 值 | 出现处 |
| --- | --- | --- |
| `--tracking-tight` | `-.025em` | 未用于工具卡（保留给大标题） |
| `--tracking-wide` | `.025em` | `cc1aae219:25326`："Run summary" 小标签，与 `uppercase` 配套 |
| `--tracking-wider` | `.05em` | diff / 调试面板里的 `text-[10px] uppercase tracking-wider`（`c5a5d8e85-Cr1m8-bg.pretty.js:876, 987, 1097`） |
| `font-variant-numeric: tabular-nums` | — | ① 状态行耗时（`cc1aae219:15249`，`font-base tabular-nums opacity-[0.65]`）；② 压缩进度百分比（`:13739`，`font-small … tabular-nums`）；③ 计数胶囊（`:2742, 2816`）；④ MCP 结果行（`c5a5d8e85:892`）；⑤ 版本号/去重键（`c5a5d8e85:705, 724, 830, 998`） |
| `text-transform: uppercase` | — | 仅小写标签：`Run summary`（`cc1aae219:25326`）与 diff 调试头；工具摘要**不转大写** |
| `font-variant-caps: small-caps` | — | 存在于 CSS（`.\[font-variant-caps\:small-caps\]`）但工具卡未用 |
| `text-box: trim-start cap alphabetic` | — | 存在，工具卡未用 |

### 10.4 行高与度量

| 项 | 值 | 出处 |
| --- | --- | --- |
| 卡片外壳 `leading-normal` | **1.5**（无单位） | `.leading-normal{line-height:var(--leading-normal)}`，`--leading-normal:1.5` |
| 正文 `--chat-leading` | **1.42857**（= 20/14） | `.epitaxy-transcript-typography` |
| `[data-chat-text-size=l]` | **1.46667**（= 22/15） | 同上 |
| 工具卡正文行高（旧壳 `text-body`） | **20px** 定值（`--cds-leading-body` at comfortable） | `.text-body{line-height:var(--cds-leading-body)}` |
| 工具卡正文行高（新壳 `font-base`） | **20px** 定值（同理，但字号被压到 12px → 行高比 1.667） | `.font-base{line-height:var(--cds-leading-body)}` |
| 单行工具行高（新壳） | **`h-[2.625rem]` = 42px**（不换行）/ `min-h-[2.625rem]`（换行） | `c5ac695a3:373` |
| 紧凑密度 | `compact:h-9` = **36px**、`compact:min-h-9`、`compact:px-2`(8px)、`compact:py-1`(4px) | `c5ac695a3:372-374` |
| `--cds-h-control` | comfortable = `2rem` = **32px**；`.cds-root` 裸值 = `1.5rem` = 24px | `c6a992d55…css`，`.cds-root[data-density=comfortable]` |
| `--cds-h-control-nested` | comfortable = `1.375rem` = **22px**；裸值 `1.125rem` = 18px | 同上 |
| 旧壳行高（非固定） | `py-2` 8+8 + 20（行高）= **36px** + 0.5px×2 边框 = 37px | `cc1aae219:13398` |
| 旧壳 TimelineGroup 行 | `py-1` 4+4 + 20 = **28px**（header 行），上下各接 `h-[8px]` 连接段 | `cc1aae219:13256, 13245, 13290` |
| `1lh` 实际像素 | 取决于该元素 line-height：`text-body`@comfortable = **20px**；`text-sm` = 20px；`text-xs` = 16px；`text-footnote`@comfortable = 17px | 骨架行 `h-[1lh] w-56 … text-body`（`c10f0af0c-CEXal87U.pretty.js:1920`） |
| 图标位 | 时间线槽 `w-[20px]`；新壳 `w-5 h-5` = 20px | `cc1aae219:13247, 13260`；`c5ac695a3:388` |
| body 最大高 | **200px**（普通）/ **4000px**（时间线展开） | `cc1aae219:13332-13333` |
| 文件名预览区最大高 | **150px** | `cc1aae219:13873, 13891` |
| 子代理体最大高 | **238px**（`!max-h-[238px]`） | `c5ac695a3:241, 275` |
| 时间线文本折叠阈值 | **200px**（含 `h-10` = 40px 底部渐变遮罩） | `cc1aae219:14497, 14537`；`LU=200` `:14497` |
| 网格垂直节奏 | `mt-2`=8px / `mt-3`=12px、`mb-2`=8px / `mb-3`=12px、`mt-1`=4px | `cc1aae219:13532-13533`、`13327` |
| 分组竖线槽宽 | `w-[20px]`，线本身 `w-[1px]`；上下连接段各 `h-[8px]` | `cc1aae219:13245-13247, 13290-13294` |
| TimelineGroup 图标点 | `size-[8px]` 圆点（无图标时）vs `size-[6px]` 圆点（新壳） | `cc1aae219:13264`；`c5ac695a3:190` |

**文本截断策略与裁切补偿**

| 场景 | 类 | 编译值 |
| --- | --- | --- |
| 单行省略 | `truncate` | `text-overflow:ellipsis; white-space:nowrap; overflow:hidden` |
| 新壳单行 | `overflow-hidden overflow-ellipsis whitespace-nowrap` | 同上三属性（`c5ac695a3:395`） |
| 换行不裁 | `min-w-0 [overflow-wrap:anywhere]` | `overflow-wrap:anywhere`（中文/长哈希也能断） |
| 2 行夹断 | `line-clamp-2 break-words` | `-webkit-line-clamp:2` + `overflow-wrap:break-word`（`cc1aae219:15178`） |
| 4 行夹断 | `min-w-0 line-clamp-4` | `-webkit-line-clamp:4`（`c5ac695a3:289`） |
| 裁切补偿 | `.py-\[0\.125em\].-my-\[0\.125em\]` | `padding-block:.125em; margin-block:-.125em`（`c21f11e6d-BWlJgL2n.pretty.js:5595`）——给 `leading-3`(12px) 的行留上下溢出空间，避免 descender 被 `overflow-hidden` 切掉 |
| 垂直对齐微调 | `relative bottom-[0.5px]` | 下移 0.5px，使文本视觉居中（新壳，`c5ac695a3:393`、`:446`） |
| body 滚动 | `max-h-[200px] overflow-y-auto` + `scrollbar-gutter:stable` + `scroll-fade-y scroll-fade-size-4` | `c5ac695a3:238-240, 272-274` |
| 被裁切检测 | `scrollWidth > clientWidth` 或 `Range.getBoundingClientRect().width - el.width > 1/64` | `cc1aae219:13375-13386` |
| 溢出安全阈值 | `overflow-clip-margin: .25em`（可用），`-webkit-line-clamp` 与 `text-overflow` 并存 | `c6a992d55…css` |

### 10.5 文本色与透明度层级

**【确证】** 两套主题（`.cds-root`；暗色由 `[data-mode=dark]` 触发）：

```css
/* 浅色 */
--cds-text-primary:  var(--cds-neutral-900) = #0b0b0b
--cds-text-secondary:var(--cds-neutral-600) = #52514e
--cds-text-muted:    var(--cds-neutral-400) = #898781
--cds-text-disabled: var(--cds-alpha-4)     = hsl(from #0b0b0b h s l / 35%)
--cds-text-danger:   var(--cds-role-danger-600) = var(--cds-red-600) = #8e2626
--cds-bg-danger:     var(--cds-role-danger-100) = var(--cds-red-100) = #fad6d6

/* 暗色 */
--cds-text-primary:  var(--cds-gray-50)  = #f0efec
--cds-text-secondary:var(--cds-gray-200) = #c3c2b7
--cds-text-muted:    var(--cds-gray-400) = #898781
--cds-text-danger:   var(--cds-role-danger-300) = var(--cds-red-300) = #ec7e7e
```

语义映射：

| Tailwind | 变量 | 浅色 | 暗色 |
| --- | --- | --- | --- |
| `text-primary` | `--cds-text-primary` | `#0b0b0b` | `#f0efec` |
| `text-secondary` / `text-text-300` | `--cds-text-secondary` | `#52514e` | `#c3c2b7` |
| `text-muted` / `text-text-500` | `--cds-text-muted` | `#898781` | `#898781` |
| `text-muted-as-secondary` | `var(--muted-as-secondary, var(--cds-text-muted))` | 同 muted（变量未定义） | 同 muted |
| `text-danger` / `text-danger-000` | `--cds-text-danger` | `#8e2626` | `#ec7e7e` |
| `dark:text-muted-as-secondary` | 同上 | — | 同 muted |

透明度层级（`--cds-alpha-*`，基于 `gray-900`）：

```
alpha-1 5%   alpha-2 10%   alpha-3 20%   alpha-4 35%   alpha-5 50%
alpha-6 60%  alpha-7 70%   alpha-8 85%   alpha-9 95%
--cds-fill-ghost-hover: #ffffff26（暗色态 hover 填充）
.status 耗时文字: opacity-[0.65]
```

**"复用别档颜色"的语义**
- `text-muted-as-secondary` 是刻意的**占位别名**：`var(--muted-as-secondary, var(--cds-text-muted))`，注释级意图是"某些上下文（分享页/只读视图）这里应当表现得像 secondary"。产物 CSS 里从未定义 `--muted-as-secondary`，因此**当前构建等价于 muted**。【推断】这是给上层容器预留的钩子（`--diff-widget-muted` 同样套路，见 `c44d00c7f-BvqLukuQ.pretty.js:1426`）。
- 暗色下新壳用 `text-secondary dark:text-muted-as-secondary`（`c5ac695a3:372`）——**暗色反而更淡**，属于有意降对比。

---

## 11. 未确认项

1. `--muted-as-secondary` 的**赋值点**没找到：全量检索 26 个 css chunk 无定义，5 个 JS chunk 只读取不写入。可能是运行时由宿主（frame/embed）注入，或已废弃。
2. `epitaxy-expanding-body` 若带过渡，应在 `[data-reduce-motion]` 之外有对应 CSS；产物里**完全没有**该类的样式规则，因此实际交互为 `hidden` 硬切。若线上有动画，说明来自运行时注入的 `data-inline-css`（`c425fb3cf-DyrNZKbs.pretty.js:19-31` 有这套注入机制，但注入内容只有 task-card-surface 相关三条）。
3. `tool-cell-row`（新壳）与 `tool-row-header`（旧壳）**在真实会话里谁生效**，取决于 `renderToolUseCell` 注入哪套实现。`shared-6-DkPBS4Mh.pretty.js:3554` 有 `renderToolUseCell: void 0` 分支，说明存在"不注入"的降级路径；没有找到运行时开关的判定条件。
4. `Fx()`（c57108ec0 的 `i`，读 `context`）语义未从 name 层面确证；从使用点（`!N && isExpanded && Fx()` 时强制 `text-secondary`）推断为"展开态文字提亮上下文"。
5. `Vm()`（shared-7 的 `_r` = `ET`，读布尔 context）推断为"时间线整体展开"，与 `Fx()` 非同一上下文；两者 provider 都在 `shared-frame-BfjMqbuN.pretty.js:1422` 与 `c5ac695a3:150-153` 附近，未逐一比对取值来源。
6. 图标组件 `Hl`（`shared-frame-BfjMqbuN.pretty.js:17580` `Jo as Hl`）内部按 `name` 查的图标 SVG 表体量过大（`Anthropicons-Variable` 变量字体 + SVG path 映射），未逐条列出 path 数据；本报告只给 name → 语义映射。
7. `.font-base-bold` 只设 `font-weight:500` 而未设 `--cds-font-axis-wght: medium`，暗色下（axis=360）它与 `.font-base` 的视觉差异是否真如推断那样可忽略，未做浏览器渲染比对。
8. **density 的运行时切换路径**未追完：`.cds-root[data-density=comfortable]` 是 CSS 唯一命中的 density 块，但没找到设置 `data-density` 的 JS（`index.html` 硬编码了 `comfortable`）。如果运行时会改这个属性，本报告 10.1 的 comfortable 数值仍成立（因为初始值与桌面一致），但 compact 分支的具体来源未确证。
9. `--cds-font-size-body` 还有 `--cds-font-size-body--own/--sm/--lg/--textsm/--textmd/--textlg` 一族变体，仅在 `[data-text-size]` 作用域内被选用（选择器极长，见 `c6a992d55…css` 1745384 附近）。工具卡容器是否带 `data-text-size` 未确认；本报告按"不带"处理（即吃 density 的 body 值）。

