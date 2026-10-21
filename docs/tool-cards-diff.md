# 工具卡片逆向 · Diff（代码差异）渲染

> **性质**：新增的独立条目。补参考仓库 `.reference/open-claude-ui` 未覆盖的一块 ——
> Edit / Write / MultiEdit 类工具卡片里那块 diff 渲染器的完整实现。
>
> **版本**：本机 Claude Desktop **2.42304.2**（参考仓库针对 v2.37337.1）。
>
> **核心结论（会颠覆直觉）**：Claude **没有自研 diff 渲染器**，也不是普通 React 组件。
> 它用 **Web Component `<diffs-container>` + Shadow DOM** 渲染，通过 `customElements.define()` 注册，
> 样式用 `adoptedStyleSheets` 注入，内部有 `@layer base/theme/rendered/unsafe` 分层。
> Claude 自己只包了一层 React 面板（文件树、分组、折叠、设置、批注）。
>
> **关于「是不是第三方库 `@pierre/diffs`」——归因修正**：
> 本文原稿写的是"内嵌 `@pierre/diffs` 第三方库"。核实后应更谨慎：
> - ✅ **确证**：`customElements.get("diffs-container") == null` 守卫 + `customElements.define()` 注册
>   （`c64baa838`，120 KB chunk 内自带完整实现）、`attachShadow` + `adoptedStyleSheets`
>   （`c64baa838:69036` 附近）、`workerManager` 类、`hunkLineCount/lineHeight/diffHeaderHeight` 等内部常量（`c93fb40ec`）。
> - ✅ **确证**：主题名 `pierre-dark` / `pierre-light` / `pierre-dark-tritanopia` 等，
>   以及独立 chunk `pierre_worker_pool`（`c227f4d5e`）与 `pierreWorkerPoolRuntime`。
> - ❌ **未确证**：字符串 `"@pierre/diffs"` 在产物中**出现 0 次**，没有 package 名或版本号。
>
> **准确表述**：这是一套**以 `diffs-container` 为名的 Web Component diff 渲染器，代码已完全打进应用包内**
> （不是运行时外部依赖），命名字形与作者标识指向 pierre 生态。
> 实现细节全在 `c64baa838` / `c44d00c7f` / `c93fb40ec` / `c49d7f557` / `ca7ba268c` 这几个 chunk 里，可直接读，无需外部库文档。
>
> **与其它文档的关系**：
> - 排版基线（字号/字重/字距/rem-scale）见 `docs/typography-cross-check.md`；本文 §10 是该基线在 diff 上的应用。
> - 工具卡片外壳（tool row）见 `docs/tool-cards-search-plan.md` §1；diff 是它的 body。
>
> **证据约定**：`<chunk>.pretty.js:N` 指 `C:\Users\17445\Desktop\rea\claude-ui-re\pretty\` 下格式化后的行号。

---
## 范围

diff 的解析、行模型、渲染组件、文件树、设置项、交互、排版度量。
不含工具卡片外壳（见 `tool-cards-search-plan.md` §1）、不含编辑器。

**一句话结论已在开头**：diff 由 `<diffs-container>` Web Component（Shadow DOM）渲染，
数据结构是 **structured hunks（`hunks[].hunkContent[]`）**，不是 unified diff 字符串；字符串只在输入解析那一步存在。

---

## 0. 结论速览（8 条）

| # | 结论 | 关键证据 |
| --- | --- | --- |
| 1 | 数据模型 = `FileDiff { hunks[].hunkContent[] }`，输入是 git patch 文本，解析入口 `parsePatchContent` | `c19cfecfb-DUAekdaq.pretty.js:118`、`:211-230` |
| 2 | 行级只有 4 种 `data-line-type`：`context` / `context-expanded` / `change-addition` / `change-deletion`。**没有 `modified` 行类型** | `c64baa838-Dmxf9-qc.pretty.js:1230-1240` |
| 3 | 「修改行」= 同一行位上一个 deletion + 一个 addition，split 视图并排、unified 视图上下两行 | `ca7ba268c-BWAjIZ0x.pretty.js:1714-1722`、`:749-757` |
| 4 | 词级 diff 用 **jsdiff Myers**；默认 `lineDiffType: "word-alt"`，可切 `char`；超过 `maxLineDiffLength: 1000` 字符直接跳过 | `cc8da1d42-BHUuvGrf.pretty.js:861-890`、`ca7ba268c:1248-1249` |
| 5 | 两种视图由 **CSS Grid + subgrid** 实现，属性名是 `single` 而不是 `unified` | `c49d7f557-BzsUo6sq.pretty.js:336-347`、`:438-469`；`c64baa838:1579` |
| 6 | 代码行 **13px / 19px**（comfortable density，rem-scale=1），字体 `--cds-font-mono` | `c6a992d55-SXiDGMFQ.css`（`--cds-font-size-code: .8125rem`、`--cds-leading-code: 1.1875rem`） |
| 7 | 大 diff：>**5000** 行（无 worker pool）/ >**20000** 行判定 large → 全部折叠 + 禁用 Expand all | `cd14a8022-DX5tudD1.pretty.js:85-86`；`c44d00c7f-BvqLukuQ.pretty.js:5815-5826` |
| 8 | 偏好 key 全部是 `persisted.epitaxy-diff-*`，经 zustand persist + 服务端 `epitaxyPrefs` 双写 | `shared-28-DpnCXf6C.pretty.js:1009`、`:914` |

---

## 1. Diff 数据模型

### 1.1 底层库身份（确证）

| 证据 | 内容 |
| --- | --- |
| `c49d7f557-BzsUo6sq.pretty.js:2` | `@layer base { :host { --diffs-font-fallback: "SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace; ... } }` |
| `c49d7f557:1279` | `@layer theme, rendered, unsafe;` |
| `c64baa838-Dmxf9-qc.pretty.js:2383` | `typeof HTMLElement < "u" && customElements.get("diffs-container") == null` → 注册自定义元素 `diffs-container` |
| `c93fb40ec-DqA5LwgW.pretty.js:1` | `var e = "diffs-container"`，随后是 git patch 正则：`/(?=^diff --git)/gm`、`/^(---\|\+\+\+)\s+([^\t\r\n]+)/`、`/^diff --git (?:"a\/(.+?)"\|a\/(.+?)) (?:"b\/(.+?)"\|b\/(.+?))$/`、`/^index ([0-9a-f]+)\.\.([0-9a-f]+)(?: (\d+))?$/i` |
| 版本 | `c64baa838:2136` 内联 SVG sprite，图标前缀 `diffs-icon-*`（随渲染器一起打包的图标集） |

**确证**：整套 diff 渲染逻辑都封装在 `diffs-container` Web Component 内（自带 Shadow DOM 样式表），
所以 Claude 主文档的 CSS 里**没有** `.diff-added` 这类规则（25 个 CSS 文件全量 grep 零命中），
也没有 `.diff-sidebyside` / `.diff-single` 类（见 §9.2 澄清）。
这些名字实际是 **Monaco codicon 图标 id**，不是 CSS 类 —— 这是本文最重要的纠错之一。

### 1.2 解析链路（三段）

```
git patch / API rawFile
  └─(1) parsePatchContent  c19cfecfb-DUAekdaq.pretty.js:118  逐行扫描 @@/+/−/空格
        └─→ FileDiff { hunks[], additionLines[], deletionLines[] }
              └─(2) hydratePartialDiff / parseDiffFromFile  ca7ba268c:143-296
                    └─→ 补全行内容、计算行索引、判断 new/deleted/rename
                          └─(3) DiffHunksRenderer.processDiffResult  ca7ba268c:1620+
                                └─→ hast AST → DOM（含行号列、分隔条、词级高亮）
```

Claude 侧包装函数：`c44d00c7f-BvqLukuQ.pretty.js:400-426` 的 `Nr(e, t, n)` ——
入参是 API 的 `rawFile`（含 `patch`/`filename`/`status`/`additions`/`deletions` 字段），
内部调 `ft(...)`（= `c19cfecfb` 的 `parsePatchContent`）产出 `{ meta, whitespaceOnly, modeChange, binary }`：

```js
// c44d00c7f:400-425（摘要）
if (!e.patch) return Sr;
let r = yr(e.patch, e), i = Tr(r), a = Er(r);     // i=modeChange  a=binary
if (n?.hideWhitespace) { let e = vr(r); if (e.whitespaceOnly) return {...Cr, modeChange:i, binary:a}; r = e.patch; }
let p = ft(r, { cacheKey: ..., oldFile: l, newFile: u });
return p ? ((p.name = e.filename), (p.prevName = e.previous_filename ?? void 0),
            (p.type = Pr(e, p)), p.lang ||= yt(e.filename),
            { meta: p, whitespaceOnly: !1, modeChange: i, binary: a }) : {...Sr, modeChange:i, binary:a};
```

### 1.3 `FileDiff` 字段表（确证）

来源：`c19cfecfb-DUAekdaq.pretty.js:211-230`（构造）+ `ca7ba268c-BWAjIZ0x.pretty.js:187-244`（补全）。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `name` | string | 新路径（`+++ b/...` 或 `diff --git` 的 b 侧） |
| `prevName` | string? | 旧路径；仅在 `type` 为 rename 类时保留（`c19cfecfb:344`） |
| `type` | `"change" \| "new" \| "deleted" \| "rename-pure" \| "rename-changed"` | 文件级变更类型 |
| `mode` / `prevMode` | string? | 文件权限，如 `100644` / `100755`（`c19cfecfb:161-170`） |
| `prevObjectId` / `newObjectId` | string? | `index a1b2c3d..e4f5a6b` 的两个 blob sha |
| `isPartial` | boolean | 只有 hunk 骨架、没有全文（大文件懒加载态） |
| `hunks` | `Hunk[]` | 见下表 |
| `additionLines` | `string[]` | 新文件全文按行切分（含 `\n`） |
| `deletionLines` | `string[]` | 旧文件全文按行切分 |
| `splitLineCount` / `unifiedLineCount` | number | 两种视图各自的总渲染行数（含折叠占位行） |
| `cacheKey` | string? | `ck{n}:JSON.stringify([...])`，缓存键 |
| `lang` | string? | 语法高亮语言（由扩展名推，`cbe9ab01c-BTrRO0l3.js` 是 ext→lang 映射表） |

`Hunk` 字段（`c19cfecfb:211-230`）：

| 字段 | 含义 |
| --- | --- |
| `hunkSpecs` | **原始 hunk 头字符串**，如 `@@ -12,7 +12,9 @@`（`c19cfecfb:921` 也会在编辑后重建） |
| `hunkContext` | `@@ ... @@` 后面的函数上下文文本 |
| `additionStart` / `additionCount` | 新文件侧起始行（1-based）与行数 |
| `deletionStart` / `deletionCount` | 旧文件侧起始行与行数 |
| `additionLineIndex` / `deletionLineIndex` | 在 `additionLines[]`/`deletionLines[]` 中的 **0-based 索引** |
| `additionLines` / `deletionLines` | 本 hunk 内的行数（注意与文件级同名不同义） |
| `hunkContent` | `{type:"context",lines:N,additionLineIndex,deletionLineIndex}` 或 `{type:"change",additions:N,deletions:N,additionLineIndex,deletionLineIndex}` |
| `collapsedBefore` | 本 hunk 上方被折叠的上下文行数 |
| `splitLineStart` / `splitLineCount` | split 视图中的起始行号与行数 |
| `unifiedLineStart` / `unifiedLineCount` | unified 视图中的起始行号与行数 |
| `noEOFCRAdditions` / `noEOFCRDeletions` | 文件末尾无换行（`\ No newline at end of file`） |

**关键点**：`hunkContent` 是「上下文块 / 变更块」的游程编码，**不存每行文本**；
行文本按 `additionLineIndex` 从 `additionLines[]` 里取。这就是它能做到大 diff 只存骨架（`isPartial`）的原因。

### 1.4 数据结构示例（由字段语义还原，标注为推断）

```jsonc
{
  "name": "src/app/diff.ts",
  "prevName": "src/app/old-diff.ts",     // 仅 rename-changed
  "type": "rename-changed",
  "isPartial": false,
  "lang": "typescript",
  "splitLineCount": 96, "unifiedLineCount": 112,
  "additionLines": ["import x from 'y';\n", "…"],
  "deletionLines": ["import x from 'z';\n", "…"],
  "hunks": [{
    "hunkSpecs": "@@ -12,7 +12,9 @@ export function render(",
    "hunkContext": "export function render(",
    "additionStart": 12, "additionCount": 9, "additionLineIndex": 11,
    "deletionStart": 12, "deletionCount": 7, "deletionLineIndex": 11,
    "collapsedBefore": 11,
    "splitLineStart": 11, "splitLineCount": 9,
    "unifiedLineStart": 11, "unifiedLineCount": 16,
    "noEOFCRAdditions": false, "noEOFCRDeletions": false,
    "hunkContent": [
      { "type": "context", "lines": 3, "additionLineIndex": 11, "deletionLineIndex": 11 },
      { "type": "change",  "additions": 2, "deletions": 1,
        "additionLineIndex": 14, "deletionLineIndex": 14 },
      { "type": "context", "lines": 4, "additionLineIndex": 16, "deletionLineIndex": 15 }
    ]
  }]
}
```
> 「推断」标记：JSON 结构由字段名与 `l19`/`c19cfecfb` 的 push 顺序还原，具体数值是示例。

### 1.5 git 头解析细节（确证，`c19cfecfb:142-176`）

| 原始行 | 处理 |
| --- | --- |
| `diff --git a/x b/y` | 正则 `o` 取两侧路径；不相等则设 `prevName` |
| `--- a/x` / `+++ b/y` | 非 git diff 模式走 `i` 正则；`/dev/null` 不写入 |
| `new file mode 100644` | `type = "new"`, `mode` |
| `deleted file mode 100644` | `type = "deleted"` |
| `similarity index 100%` | `type = "rename-pure"`（否则 `rename-changed`） |
| `index a..b 100644` | `prevObjectId` / `newObjectId` / `mode` |
| `rename from` / `rename to` | `prevName` / `name` |

---

## 2. 行级渲染

### 2.1 DOM 结构（确认为 hast→DOM，来源 `c64baa838` + `cb971281b`）

```
<diffs-container>                       ← custom element，Shadow DOM
└─ <pre data-diff data-diff-type="single|split" data-overflow="scroll|wrap"
        data-indicators="classic|bars" data-background
        data-disable-line-numbers?  style="--diffs-min-number-column-width-default:3ch">
   ├─ <div data-diffs-header="default" data-change-type="change|new|deleted|rename-*" data-sticky?>
   │   └─ <div data-header-content>
   │        ├─ <slot name="header-prefix">
   │        ├─ <svg data-change-icon="new|deleted|change|rename-pure|rename-changed|file">
   │        ├─ [<div data-prev-name><bdi>旧路径</bdi></div> <svg data-rename-icon>]
   │        ├─ <div data-title><bdi>新路径</bdi></div>
   │        └─ <div data-metadata><span data-deletions-count>−N</span><span data-additions-count>+N</span></div>
   └─ <code data-code data-container-size data-unified>        ← unified 视图只有这一个 code
      或 <code data-code data-deletions> + <code data-code data-additions>   ← split 视图两个 code
      ├─ <div data-gutter  style="grid-row: span N">          ← 行号列（subgrid）
      │   ├─ <div data-line-type="change-addition" data-column-number="42"
      │   │      data-line-index="41,0"><span data-line-number-content>42</span></div>
      │   └─ <div data-gutter-buffer="buffer|annotation" data-buffer-size="N">
      ├─ <div data-content  style="grid-row: span N">         ← 代码列（subgrid）
      │   ├─ <div data-line="42" data-line-index="41,0"
      │   │      data-line-type="change-addition" data-alt-line="?">…tokens…</div>
      │   ├─ <div data-line-annotation="hunkIndex,lineIndex"><div data-annotation-content>
      │   └─ <div data-separator="line-info|line-info-basic|metadata|simple|custom"
      │          data-expand-index="N" data-separator-first data-separator-last>
      │        └─ <div data-separator-wrapper [data-separator-multi-button]>
      │             ├─ <div role="button" data-expand-button data-expand-up|down|both|all>
      │             │    └─ <svg data-icon>（diffs-icon-expand / expand-all）
      │             ├─ <div role="button" data-expand-button data-expand-all-button>Expand all</div>
      │             └─ <div data-separator-content><span data-unmodified-lines>7 unmodified lines</span></div>
      └─ <div data-content-buffer data-buffer-size="N">       ← 虚拟化占位（斜纹）
```

逐节点证据：

| 节点 | 证据 |
| --- | --- |
| `<pre>` 属性集合 | `c64baa838:1565-1586`（`Qe()` 返回 `data-diff`/`data-file`/`data-diff-type`/`data-overflow`/`data-disable-line-numbers`/`data-background`/`data-indicators`/`--diffs-min-number-column-width-default`） |
| 行号单元格 | `cb971281b-Dn4DFuqh.pretty.js:31-39`：`{ data-line-type, "data-column-number": n, "data-line-index": n }` + `<span data-line-number-content>` |
| 行内容单元格 | `cb971281b:59-78` `f()`：写入 `data-line`(行号)、`data-alt-line`、`data-line-type`、`data-line-index` |
| 文本行属性注入 | `ca7ba268c:1685`、`:1690`、`:1728`、`:1737`：`{"data-line": 行号, "data-line-index": "unifiedLineIndex,splitLineIndex"}` |
| gutter / content 容器 | `cb971281b:28-30`（`data-gutter`）、`ca7ba268c:1830-1831`（`grid-row: span N`） |
| 分隔条 | `ca7ba268c:386-437` `an()` |
| 注释条 | `c64baa838:1485-1497` `Ke()` → `data-line-annotation="${hunkIndex},${lineIndex}"` |

### 2.2 四种 `data-line-type` 与语义（确证）

`c64baa838-Dmxf9-qc.pretty.js:1229-1241`：

```js
function Ie(e) {
  let t = e.getAttribute("data-line-type");
  if (t != null) switch (t) {
    case "change-deletion": case "change-addition":
    case "context": case "context-expanded": return t;
    default: return;
  }
}
```

| `data-line-type` | 语义 | 来源 |
| --- | --- | --- |
| `context` | 未变上下文行 | `cb971281b:67` 缺省 `data-line-type ?? "context"` |
| `context-expanded` | 用户点「展开」后**补出来的**上下文行（可再次折叠） | `ca7ba268c:1787`（`c === "context-expanded"` 时 hunkIndex 用 `t` 而非 `t+1`） |
| `change-addition` | 新增行 | `ca7ba268c:1231` |
| `change-deletion` | 删除行 | `ca7ba268c:1231` |

**「changed vs modified」的真相**：
- 行级没有 `modified`。`hunkContent` 里的 `type:"change"` 是一个**块**，同时含 deletions 与 additions；
  渲染时按侧拆成 `change-deletion` 与 `change-addition` 两个行元素（`ca7ba268c:1672`）：
  ```js
  let a = c === "change" ? (o == null ? "change-deletion" : "change-addition") : c;
  ```
- `--diffs-modified-base`（蓝色）在 diff 里**不用于行背景**，只用于：① 选区基色
  （`c49d7f557:40` `--diffs-selection-base: var(--diffs-modified-base)`）；② merge conflict 的「incoming」侧
  （`c49d7f557:256-270`）；③ 文件级 `data-change-icon="change"` 的着色（`c49d7f557:1135-1137`）。
  Claude 把 `--diffs-modified-color-override` 指向 `--cds-text-git-modified`（`ca7ba268c:7486`）。

### 2.3 行类型对应的 class / 背景色

**这套 CSS 不用 class，全用属性选择器**（这是最容易搞错的地方）。

| 状态 | 选择器 | 浅色 | 深色 |
| --- | --- | --- | --- |
| 新增行背景 | `[data-background] [data-line-type="change-addition"]` `--diffs-computed-diff-line-bg` | `color-mix(in lab, <decoration-bg> 88%, --diffs-addition-base)` | `…80%…` |
| 删除行背景 | 同上，`change-deletion` | `color-mix(… 88%, --diffs-deletion-base)` | `…80%…` |
| 上下文行背景 | 默认 `--diffs-bg`；Claude 覆写为透明 | `transparent`（Claude 覆写） | 同 |
| 新增行号 | `[data-line-type="change-addition"]:where([data-column-number])` | `color: var(--diffs-addition-base)` = `#1e9e3c` | `#32d74b` |
| 删除行号 | `…change-deletion…` | `var(--diffs-deletion-base)` = `#cd2054` | `#ff2c56` |
| 普通行号 | `[data-column-number]` | `var(--diffs-fg-number)` → Claude 覆写为 `var(--cds-text-stays-secondary, var(--cds-text-muted))` | 同 |
| `+`/`−` 指示符 | `[data-indicators="classic"] …:before{content:"+"}` | `color: var(--diffs-addition-base)` | 同 |

逐条证据：
- 新增/删除背景：`c49d7f557-BzsUo6sq.pretty.js:194-238`
- 行号着色：`c49d7f557:208-231`（`&:where([data-gutter-buffer], [data-column-number]) { color: var(--diffs-fg-number-addition-override, var(--diffs-addition-base)) }`）
- 普通行号色：`c49d7f557:944-950` `[data-column-number] { text-align:right; user-select:none; color: var(--diffs-fg-number); padding-left:2ch }`
- Claude 覆写：`ca7ba268c-BWAjIZ0x.pretty.js:7478-7491`（`--diffs-fg-number-override` / `-addition-override` / `-deletion-override`）
- classic 指示符：`c49d7f557:850-886`（`padding-inline-start: 2ch`，`:before` 宽 `1ch` 高 `1lh`，绝对定位左上）

### 2.4 行号列渲染（旧行号 / 新行号）

**统一（single）视图只有一列行号**：优先显示新行号，删除行回退到旧行号。
`ca7ba268c:1679`：

```js
w("unified", u.gutterLineType, o == null ? s.lineNumber : o.lineNumber, `${f},${l}`, u.gutterProperties)
//           侧名            行号 = 有 addition 用 addition 行号，否则用 deletion 行号
```
且 `data-line-index` 是 **`"unifiedIndex,splitIndex"` 复合串**（`ca7ba268c:1685`），
这样同一个元素能在两种排版间复用而不重算。

**并排（split）视图两套独立 gutter**，删除侧在左、新增侧在右，各自 `data-column-number`（`ca7ba268c:1730`、`:1739`）。

行号宽度自适配：`c49d7f557:1584` 预置 `--diffs-min-number-column-width-default: ${数字位数}ch`；
Claude 追加的最小宽度规则 `max(3ch, …)`：`ca7ba268c:7517`。

### 2.5 `line-info` / `line-thin` / `diff-line` 三个词的辨析（重要）

| 词 | 实际是什么 | 证据 |
| --- | --- | --- |
| `line-info` | **hunk 折叠条类型**。是 `hunkSeparators` 的取值（`"line-info" \| "line-info-basic" \| "metadata" \| "simple" \| 函数`），DOM 上是 `div[data-separator="line-info"]`，高 32px，带上下 margin `--diffs-gap-block` | `ca7ba268c:1247`、`:386-437`；`c49d7f557:536-590` |
| `line-thin` | **与 diff 无关**。它是 Monaco 编辑器光标样式枚举：`LineThin = 4`、`"line-thin"` → `TextEditorCursorStyle` | `c0c1c41fc-UusIIGu7.pretty.js:1005-1026`、`:3743` |
| `diff-line` | **事件载荷类型名**，不是 DOM 类名。行交互事件 `toEventBaseProps` 在 diff 模式下产出 `{type:"diff-line", annotationSide, lineType, lineElement, numberElement, lineNumber, numberColumn}` | `c64baa838:929-947` |

另外用户清单里的 `diff-added/removed/modified/renamed/ignored/sidebyside/single`：
这七个是 **Monaco codicon 图标 id**（`P("diff-added", 60124)` … `P("diff-sidebyside", 60129)`，`P("diff-single", 60450)`），
不是 CSS 类。见 `c0c1c41fc:7162-7168`、`:7508`。CSS 里无对应规则（已 grep 全部 25 个 `.css`，零命中）。

diff 真正的文件状态图标是 SVG sprite `diffs-icon-symbol-*`，见 §5.4。

---

## 3. 词级差异（word-level diff）

### 3.1 开关与算法

| 项 | 值 | 证据 |
| --- | --- | --- |
| 类型分派 | `lineDiffType: "word-alt"`（默认）/ `"word"` / `"char"` / `"none"` | `ca7ba268c:1248`；`cc8da1d42:872` |
| 长度上限 | `maxLineDiffLength: 1000` 字符，超限本行不词级 diff | `ca7ba268c:1249`；`cc8da1d42:871` |
| `word`/`word-alt` 实现 | jsdiff `diffWords`（`n()`），tokenize 正则 `[a-zA-Z0-9_\u{AD}\u{C0}-\u{D6}…]+|\s+|[^…]` | `cc8da1d42-BHUuvGrf.pretty.js:6`（`import { t as n } from "./cc47d1870-DfC8yeOG.js"`）；`cc47d1870:80-81` |
| `char` 实现 | jsdiff `diffChars`（`_()`） | `cc8da1d42:13-15`、`:872` |
| 核心算法 | **Myers O(ND)**，`maxEditLength` 截断，`extractCommon` 对角推进 | `c6438c669-CeVpGyFN.pretty.js:13-55`（`diffWithOptionsObj` 的 `for (let r = Math.max(p,-s); r <= Math.min(m,s); r += 2)`） |
| jsdiff 版本特征 | `objectHash`/`stringifyReplacer`/`maxEditLength`/`timeout` 均为现代 jsdiff（v5+） | `cc8da1d42:36-55`、`c6438c669:30` |

> 用户推测的「LCS？分块？」——答案是 **Myers 最短编辑脚本**，不是 LCS 表。
> 但外层还有一层**行块切分**（`hunkContent` 的 change 块），所以实际是「先按行块，再在块内逐对行做词级」。

### 3.2 span 结构（确证）

```js
// cc8da1d42-BHUuvGrf.pretty.js:98-105
function C({ line: e, spanStart: t, spanLength: n }) {
  return {
    start: { line: e, character: t },
    end:   { line: e, character: t + n },
    properties: { "data-diff-span": "" },   // ← 唯一标记
    alwaysWrap: !0,
  };
}
```

这些 decoration 交给 Shiki 的 `decorations` 选项，最终落成
`<span data-diff-span>` 包住变化片段（`cc8da1d42:928-955` 的 `Y()` → `codeToHast(..., { decorations })`）。

**合并相邻同类片段**（避免每词一个 span）：`w()`，`cc8da1d42:106-118`：

```js
function w({ item: e, arr: t, enableJoin: n, isNeutral: r = !1, isLastItem: i = !1 }) {
  let a = t[t.length - 1];
  if (a == null || i || !n) { t.push([+!r, e.value]); return; }
  let o = a[0] === 0;
  if (r === o || (r && e.value.length === 1 && !o)) { a[1] += e.value; return; }  // ← 合并
  t.push([+!r, e.value]);
}
```
- `enableJoin` 只在 `word-alt` 为真（`cc8da1d42:875` `p = s === "word-alt"`），这也是 `word-alt` 与 `word` 的唯一差别：
  `word-alt` 会把相邻的中性片段并起来，减少 span 数。
- 单字符的中性片段会被并入前一个高亮段（`e.value.length === 1 && !o`）。

### 3.3 词级高亮的背景色与文字色

```css
/* c49d7f557-BzsUo6sq.pretty.js:991-1002 */
[data-diff-span] { box-decoration-break: clone; border-radius: 3px; }
[data-line-type="change-addition"] [data-diff-span] { background-color: var(--diffs-bg-addition-emphasis); }
[data-line-type="change-deletion"] [data-diff-span] { background-color: var(--diffs-bg-deletion-emphasis); }
```
```css
/* c49d7f557:36-39 */
--diffs-bg-deletion: light-dark(color-mix(in lab, var(--diffs-bg) 88%, var(--diffs-deletion-base)),
                                color-mix(in lab, var(--diffs-bg) 80%, var(--diffs-deletion-base)));
--diffs-bg-deletion-emphasis: light-dark(rgb(from var(--diffs-deletion-base) r g b / .15),
                                         rgb(from var(--diffs-deletion-base) r g b / .2));
--diffs-bg-addition: …同构…
--diffs-bg-addition-emphasis: light-dark(rgb(from var(--diffs-addition-base) r g b / .15),
                                         rgb(from var(--diffs-addition-base) r g b / .2));
```

**文字色不变**（仍是 `--diffs-fg` / 语法高亮 token 色），只有背景加深。圆角 3px，`box-decoration-break: clone` 保证跨行时每段都圆角。

⚠️ 但 Claude **默认把 emphasis 覆盖成透明**：
`c82eca2bd-DdWnXMgj.pretty.js:827-831`
```js
_t = { "--diffs-bg-addition-emphasis-override": "transparent",
       "--diffs-bg-deletion-emphasis-override": "transparent" }
```
并在 `<FileDiff style={wordDiff ? undefined : on}>` 处使用（`c44d00c7f:5618`）。
即：**用户关掉「Highlight changed words」→ 传入把强调色置透明的 style；打开 → 不传 style，用库默认的 15%/20% 半透明强调色。**
（这里语义反了直觉，但代码就是这样：`style: ee ? void 0 : on`，`ee` = `wordDiff`，`on` = 透明 emphasis 覆盖。）

### 3.4 词级 diff 的窗口化（性能闸门）

`cc8da1d42:861-890` `q()` 的三个提前返回条件：
```js
if (e == null || t == null || s === "none" || ((e = d(e)), (t = d(t)), e.length > c || t.length > c)) return;
```
再看 `cc8da1d42:770`：
```js
p = r && !u && (e.unifiedLineCount > 1e3 || e.splitLineCount > 1e3) ? "none" : n.lineDiffType
//  r = forcePlainText，u = 是否窗口化渲染
```
→ **单文件行数 > 1000 时，非窗口化场景直接关闭词级 diff**（`lineDiffType = "none"`）。

---

## 4. 两种视图：single(unified) vs sidebyside(split)

### 4.1 属性名与状态

| 项 | 值 | 证据 |
| --- | --- | --- |
| DOM 属性 | `data-diff-type="single" \| "split"` —— **注意是 `single`，不是 `unified`** | `c64baa838:1579` `"data-diff-type": o === "diff" ? (i ? "split" : "single") : void 0` |
| 选项 API | `diffStyle: "unified" \| "split"` | `ca7ba268c:1238` |
| Claude 传值 | `$t = z !== undefined && !Zt ? "unified" : R`（窄面板强制 unified） | `c44d00c7f:5939` |
| 持久化 key | `epitaxy-diff-layout`，取值 `"unified" \| "split" \| "auto"`，默认 `"unified"` | `c227f4d5e-BtCczSFM.pretty.js:2759-2775` |
| 生效逻辑 | `return [e && (t === "split" \|\| t === "auto") ? "split" : "unified", setter]`，`e = tC() = !we("__gb__2217832767")` | `c227f4d5e:2760-2775` |
| 窄面板阈值 | `splitMinWidth: 560`（px），ResizeObserver 测宽后 `>= 560` 才允许 split | `cccc2cf0a:7768`、`c44d00c7f:5931-5938` |
| 菜单项 | "Side by side"，hint "Needs a wider pane" | `c227f4d5e:2908-2916` |

> **确证**：GrowthBook 开关 `__gb__2217832767` 关闭时，`nC()` 恒返回 `"unified"`，
> 且菜单里的 "Side by side" 项根本不渲染（`n = tC()` 为 false 时 `e.push` 被跳过）。
> 也就是说**用户实际能看到的默认是 unified**，split 需灰度命中。

### 4.2 布局实现：CSS Grid + subgrid（不是两组列）

**滚动（scroll）模式的 split** —— 左右各一个 `<code>`，外层两等分：
```css
/* c49d7f557-BzsUo6sq.pretty.js:336-347 */
[data-diff-type="split"][data-overflow="scroll"] {
  grid-template-columns: 1fr 1fr;
  display: grid;
  & [data-additions] { border-left: 1px solid var(--diffs-bg); }
  & [data-deletions] { border-right: 1px solid var(--diffs-bg); }
}
```

**换行（wrap）模式的 split** —— 单层 4 列网格，deletion gutter/content + addition gutter/content：
```css
/* c49d7f557:438-469 */
[data-diff-type="split"][data-overflow="wrap"],
[data-dehydrated][data-diff-type="split"][data-overflow="scroll"] {
  grid-auto-flow: dense;
  grid-template-columns: repeat(2, var(--diffs-code-grid));  /* 2 × (行号列 + 代码列) = 4 列 */
  padding-block: var(--diffs-gap-block, var(--diffs-gap-fallback));
  display: grid;
  & [data-code] { display: contents; }                        /* ← code 元素被"穿透"，子元素直接参与外层网格 */
  & [data-deletions] { & [data-gutter] { grid-column: 1 } & [data-content] { border-right: 1px solid var(--diffs-bg); grid-column: 2 } }
  & [data-additions] { & [data-gutter] { border-left: 1px solid var(--diffs-bg); grid-column: 3 } & [data-content] { grid-column: 4 } }
}
```

**单侧（unified）的网格**：
```css
/* c49d7f557:97-108 */
[data-diff], [data-file] {
  --diffs-grid-number-column-width: minmax(min-content, max-content);
  --diffs-code-grid: var(--diffs-grid-number-column-width) 1fr;
}
/* c49d7f557:349-362 */
[data-code] {
  grid-auto-flow: dense;
  grid-template-columns: var(--diffs-code-grid);
  overflow: var(--diffs-overflow-override, scroll) clip;
  overscroll-behavior-x: none;
  tab-size: var(--diffs-tab-size, 2);
  padding-top: var(--diffs-gap-block, var(--diffs-gap-fallback));
  padding-bottom: max(0px, calc(var(--diffs-gap-block, …) - var(--diffs-scrollbar-gutter)));
  scrollbar-gutter: stable;
  display: grid;
}
/* c49d7f557:415-436 —— gutter 与 content 用 subgrid 共享行轨道 */
[data-gutter]  { grid-template-rows: subgrid; grid-template-columns: subgrid; grid-column: 1; z-index: 3; background-color: var(--diffs-bg); position: relative; }
[data-content] { grid-template-rows: subgrid; grid-template-columns: subgrid; grid-column: 2; min-width: 0; }
```

**左右对齐机制**（这是用户问的重点）：
1. **不是**靠 JS 算高度，而是靠 CSS Grid 的 `subgrid` —— gutter 与 content 共用同一批行轨道，行高天然一致。
2. 行高是**固定的**：`[data-line]` 在 scroll 模式 `min-height: 1lh`（`c49d7f557:939-942`）、wrap 模式也 `min-height: 1lh`（`ca7ba268c:7509`）。
   `lh` 单位 = 当前 `line-height` = `--diffs-line-height`（Claude = `--cds-leading-code` = 19px）。
3. **垂直滚动同步**（scroll 模式下左右两个 `code` 各自可横向滚动）由 `ScrollSyncManager` 做**横向**同步（`ca7ba268c:300-353`）：
   ```js
   handleDeletionsScroll = () => { if (this.isAdditionsScrolling) return;
     this.isDeletionsScrolling = true; clearTimeout(this.timeoutId);
     this.timeoutId = setTimeout(() => this.isDeletionsScrolling = false, 300);
     this.codeAdditions?.scrollTo({ left: this.codeDeletions?.scrollLeft }); }
   ```
   300ms 互斥锁防递归，只同步 `scrollLeft`，**纵向靠同一个滚动容器**。
4. 行号列 sticky：`[data-overflow="scroll"] [data-gutter] { position: sticky; left: 0 }`（`c49d7f557:475-478`）。

### 4.3 横向滚动与制表符

| 项 | 值 | 证据 |
| --- | --- | --- |
| scroll 模式行 | `white-space: pre; min-height: 1lh` | `c49d7f557:939-942` |
| wrap 模式行 | `white-space: pre-wrap; word-break: break-word` | `c49d7f557:928-937` |
| wrap 模式右内边距（防溢出到滚动条下） | `padding-right: max(1ch, calc(100% - 1ch - var(--cds-code-wrap-cols,9999) * 1ch))` | `ca7ba268c:7498` |
| 滚动条槽位 | `--diffs-scrollbar-gutter-fallback: 6px`，实测值写入 `--diffs-scrollbar-gutter-measured` | `c49d7f557:10-11`、`:364-375`（`[data-diffs-scrollbar-measure]` 探针） |
| `tab-size` | `var(--diffs-tab-size, 2)` | `c49d7f557:354` |
| tab 宽度来源 | 编辑器偏好 `tabSize`：`rf = pe?.tabSize ?? (M ? 2 : void 0)`，写入 `--diffs-tab-size` | `cd2efac6e-DCWkGXIV.pretty.js:3310-3311`、`:4953` |

---

## 5. 文件列表 / 文件树

### 5.1 菜单与容器（Claude 侧，非库）

`cccc2cf0a-JnTR9JZB.pretty.js:3337-3464`（`zb()`，构建 diff 视图的右键/选项菜单）：

| 菜单 key | 项 | 行为 |
| --- | --- | --- |
| `diff-refresh` | "Refresh" | `Ou({session_type})` + refetch |
| `diff-file-list` | "Show files"（checkbox，`keepOpen`）| 切 `diffShowTree`，快捷键 `toggleDiffFileList` |
| `diff-file-tree` | "Group files by folder" | `setFileTree(!l)` |
| `diff-group-by-kind` | "Separate test, build, and generated files" | `setGroupByKind(!f)` |
| `diff-fold` | "Collapse all files" / "Expand all files" | 见 §6 |
| `diff-display` | "Highlight changed words" / "Hide whitespace changes" | 见 §7 |

`diff-base` / `diff-scope` / `diff-commits` 是**头部下拉**，不是这个菜单（`cccc2cf0a:2798-2968`）：

| key | 标签 | 数据结构 |
| --- | --- | --- |
| `diff-base` | "Compare against"（hint = 当前 base；searchLabel "Search branches"；空态 "No branches match"；默认项带 `hint:"default"`） | `items: [{value:`diff-base:${branch}`, label, checked, checkedRole:"radio", hint, onSelect}]`，`value` 前缀 `diff-base:` 便于遥测 |
| `diff-scope` | "All changes"（hint `vs {base}`）/ "Uncommitted changes" | `scope: {kind:"branch"\|"uncommitted"\|"commit", sha?}` |
| `diff-commits` | "Commits"（hint = shortSha 或总数；最多列 50 条 `fb = 50`，超出显示 "N older commits not shown"） | `items: [{value: sha, label: subject \|\| "(no message)", hint: shortSha}]` |

### 5.2 文件条目数据（`DiffFileEntry`）

`c44d00c7f-BvqLukuQ.pretty.js:485-512`（`Br()`）：

```js
{
  filePath: t.filename,
  rawFile: t,                       // 原始 API 对象（含 patch/status/additions/deletions/previous_filename）
  contentHash: M(o),                // 哈希：`${repoScope}\0${merge_base}\0${patch}` 或 `${…}:${status}:${additions}:${deletions}:${prev}`
  lazy: a,                          // = comparison.lazy_file_hunks === true
  status: t.status,                 // "added" | "removed" | "modified" | "renamed" | ...
  additions: t.additions,
  deletions: t.deletions,
}
```
排序：`r.sort((e,t) => Hr(e.filePath, t.filePath, n))`，
`Hr` 里 `Vr = e => e.startsWith("… ")` —— **路径被折叠成 `… ` 前缀的条目永远排最后**，其余按 tree（`K`）或 flat（`je`）比较器（`c44d00c7f:513-517`）。

### 5.3 文件树构建与分组

```js
// c44d00c7f:4585-4629
function hc(e) {                       // tree 模式
  let t = [], n = new Map([["", t]]);
  for (let r of e) {
    let e = r.filePath.split("/"), i = e.pop(), a = "", o = t;
    for (let t of e) { let e = a ? `${a}/${t}` : t, r = n.get(e);
      r || ((r = []), n.set(e, r), o.push({kind:"dir", name:t, path:e, children:r})); a = e; o = r; }
    o.push({kind:"file", name:i, path:r.filePath, additions:r.additions, deletions:r.deletions, removed:r.status==="removed"});
  }
  return _c(t);                        // 单子目录链压缩：a/b/c 合成一个节点
}
function gc(e) { /* flat 模式：直接 kind:"file" */ }
function _c(e) {                       // 目录压缩
  return e.map(e => {
    if (e.kind !== "dir") return e;
    let t = _c(e.children);
    if (t.length === 1 && t[0].kind === "dir") {
      let n = t[0]; return {kind:"dir", name:`${e.name}/${n.name}`, path:n.path, children:n.children};
    }
    return {...e, children:t};
  });
}
```

**按类型分组**（`group-by-kind`）—— `c44d00c7f:4534-4584`：

```js
var sc = ["test", "build", "generated"];              // 分组顺序
var cc = ["source", ...sc];                           // 渲染顺序：source 在前
function fc(e) {                                      // 分类器
  return lc.test(e) ? "generated" : uc.test(e) ? "build" : Lo(e) || dc.test(e) ? "test" : "source";
}
```
三条正则（确证，`c44d00c7f:4536-4572`）：

| 类别 | 匹配（节选） |
| --- | --- |
| `generated` | 锁文件（`package-lock.json`/`yarn.lock`/`pnpm-lock.yaml`/`Cargo.lock`/`go.sum`/`poetry.lock` …）、`(__generated__\|generated\|gen)/`、`[._]gen(erated)?\.[^/]+$`、`*.pb.go`、`*_pb2.py`、`*.g.dart`、`*.min.js/css`、`*.map`、`.next/`/`.nuxt/`/`__pycache__/`、`*.pyc`、`^dist/` |
| `build` | `BUILD(.bazel)?`、`WORKSPACE(.bazel\|.bzlmod)?`、`MODULE.bazel`、`*.bzl` |
| `test` | `*.stories.[jt]sx?`、`conftest.py`、`Tests?.(swift\|kt\|java)`、`*_unittest.(cc\|cpp)`、`(^/\|/\|_)tests\.rs`、`(tests?\|testdata\|spec\|__Snapshots__\|e2e)/`、`*-tests/` |

分组标题文案（`c44d00c7f:4844-4848`）：`Test files` / `Build files` / `Generated files`；
每组一个可折叠行 `data-diff-tree-section="{kind}"`，右侧显示文件数（`text-footnote tabular-nums`）。

### 5.4 文件状态图标（确证）

**diff 视图内的文件头**用 SVG sprite（`c64baa838:1498-1512` `qe()` 映射）：

| `type` | 图标 symbol | 视觉 | 着色 |
| --- | --- | --- | --- |
| `file` | `diffs-icon-file-code` | 文档 + `<>` | `opacity: .6`（`c49d7f557:1147-1149`） |
| `change` | `diffs-icon-symbol-modified` | 圆环 + 实心圆点 | `var(--diffs-modified-base)` |
| `new` | `diffs-icon-symbol-added` | 圆环 + `+` | `var(--diffs-addition-base)` |
| `deleted` | `diffs-icon-symbol-deleted` | 圆环 + `−` | `var(--diffs-deletion-base)` |
| `rename-pure` / `rename-changed` | `diffs-icon-symbol-moved` | 圆环 + 双右箭头 | `var(--diffs-modified-base)` |
| （未被 `qe()` 使用） | `diffs-icon-symbol-ignored` | 圆环 + 斜杠 | 无对应着色规则 |

着色规则：`c49d7f557:1130-1145`
```css
[data-change-icon="change"], [data-change-icon="rename-pure"], [data-change-icon="rename-changed"] { color: var(--diffs-modified-base); }
[data-change-icon="new"] { color: var(--diffs-addition-base); }
[data-change-icon="deleted"] { color: var(--diffs-deletion-base); }
[data-change-icon="file"] { opacity: .6; }
```

文件名重命名：`[data-prev-name]`（`opacity: .7`, `direction: rtl` 截断）+ `[data-rename-icon]`（`diffs-icon-arrow-right-short`）+ `[data-title]`（`c49d7f557:1095-1111`）。

**文件树里的文件类图标**是另一套（Claude 自己的图标组件）：
`c44d00c7f:5123` `<FileIcon fileName={e.name} size="xs" className="shrink-0 text-muted-control" />`；
图标尺寸 `xs = 12px`（`shared-frame-BfjMqbuN.pretty.js:1982` `xs: { px: 12 }`）。

**Claude 文件头里的「状态徽章」（纯文字，无图标）** —— `c219730b0-D73Ipz0E.pretty.js:269-290`：

| 徽章文案 | 条件 | 提示（tooltip） |
| --- | --- | --- |
| `Binary file` | `binary` | `{path} (binary file)` |
| `Too large to show` | `tooLarge` | `{path} (too large to show)` |
| `Whitespace only` | `whitespaceOnly` | `{path} (whitespace only)` |
| `Made executable` | `100644 → 100755` | `{path} (made executable)` |
| `No longer executable` | `100755 → 100644` | `{path} (no longer executable)` |

`Bt(d)` 判权限变更（`c219730b0:399-402`）；重命名显示 `Renamed from {path}`（`:378-398`）。

### 5.5 树的交互与视觉

| 项 | 值 | 证据 |
| --- | --- | --- |
| 行高 | `h-control` = 32px（comfortable）/ 24px（compact） | `ca7840910-BG53o7qL.pretty.js:43`；`c6a992d55.css` `--cds-h-control: calc(1.5rem * …)` / comfortable `2rem` |
| 缩进公式 | `paddingInlineStart: 8 + depth * (D() + 4)`；`D() = 图标px / 2` | `ca7840910:24-34`、`:46-48` |
| 缩进指南 | `repeating-linear-gradient(to right, var(--cds-border) 0 1px, transparent 1px <k>px)`，每级 `<k> = D()+4` | `ca7840910:54-64` |
| 圆角 | `rounded`（4px） | `ca7840910:43` |
| 键盘 | `↑↓` 移动、`Home/End`、`→` 展开或进子、`←` 折叠或上父级、单字符前缀跳转 | `c44d00c7f:4928-5004` |
| `aria` | `role="tree"` / `role="treeitem"` / `aria-level` / `aria-expanded` / `aria-current` | `c44d00c7f:4805-4814`、`:5066-5071` |
| 滚动位置记忆 | LRU 32 条（`nc = 32`），key = `session\0tree|flat(+kinds)\0paths` | `c44d00c7f:4516-4533` |
| 树宽拖拽 | `TreeWidthHandle`，默认 240，min 160，max 640；`< MIN/2`（80px）自动隐藏 | `c227f4d5e:2162-2170`、`:2202-2269` |

---

## 6. 折叠 / 展开

### 6.1 全局「全部折叠 / 全部展开」

菜单项（`cccc2cf0a:3415-3437`）：

| value | label | 条件 |
| --- | --- | --- |
| `diff-collapse-all` | `Collapse all files` | 始终 |
| `diff-expand-all` | `Expand all files` | **`disabled: C`**（`C = diffIsLarge[scopeId]`），且 tooltip = `This diff is too large to expand at once. Select a file to expand it.` |

实现：`requestDiffFoldAll(scope, sessionId, collapsed)` 写入 store（`c03935b01-Csh_0_Y5.pretty.js:2736-2743`）：
```js
requestDiffFoldAll: (e, t, n) => i(r => ({ diffFoldAll: { ...r.diffFoldAll, [e]: { collapsed: n, seq: ++Do, sessionId: t } } })),
consumeDiffFoldAll: (e, t) => i(n => { if (n.diffFoldAll[e]?.seq !== t) return n; let { [e]: r, ...i } = n.diffFoldAll; return { diffFoldAll: i }; }),
```
用 `seq` 做一次性消费（避免重复应用）。消费侧 `c44d00c7f:5846-5853`。

大 diff 下的额外横幅（`c44d00c7f:6156-6162`）：
`Files are collapsed for large diffs. Select a file to expand it.`（`id: q0jjHC00PT`）

### 6.2 单个 hunk / 上下文折叠条（ContextLines 展开按钮）

**文案**（确证）：`ca7ba268c-BWAjIZ0x.pretty.js` 原始 bundle 内（pretty 文件对应 `:386-437` 的 `an()`）：

```js
var nr = new Intl.PluralRules("en-US");
function rr(e){ return `${e} unmodified line${nr.select(e)==="one" ? "" : "s"}` }
```
→ `1 unmodified line` / `7 unmodified lines`。

未知行数时：`"More unchanged context may be available"`（同一函数，`content = typeof n == "number" ? rr(n) : "More unchanged context may be available"`）。

**按钮结构**（`ca7ba268c:386-437`）：

| 元素 | 属性 | 出现条件 |
| --- | --- | --- |
| 展开按钮（单/双向） | `role="button" data-expand-button data-expand-both\|data-expand-up\|data-expand-down` | `expandIndex != null` |
| 图标 | `<svg data-icon>`，`diffs-icon-expand`（单）/ `diffs-icon-expand-all`（both） | `rn()`，`ca7ba268c:371-385` |
| 「Expand all」按钮 | `role="button" data-expand-button data-expand-all-button` | **chunked 模式**（`rangeSize > expansionLineCount`，默认 100）且在中间 hunk |
| 文案区 | `data-separator-content > span[data-unmodified-lines]` | 始终 |
| 多按钮布局 | `data-separator-wrapper[data-separator-multi-button]` | 按钮数 > 1 |

**方向判定**（`c64baa838:1007-1019`）：
```js
direction: f.hasAttribute("data-expand-up") ? "up" : f.hasAttribute("data-expand-down") ? "down" : "both",
all:       f.hasAttribute("data-expand-all-button"),
hunkIndex: parseInt(f.getAttribute("data-expand-index"))
```
点击后：`c64baa838:327-330`
```js
if (we(i) && f != null) { f(i.hunkIndex, i.all || t.shiftKey ? "both" : i.direction, i.all || t.shiftKey ? 1/0 : void 0); break; }
```
→ **`Shift + 点击` = 一次展开到两边全部**（`1/0` = Infinity）。

**折叠条尺寸**：`c49d7f557:536-543`
```css
[data-separator="line-info"], [data-separator="line-info-basic"], [data-separator="metadata"] { height: 32px; position: relative; background-color: var(--diffs-bg-separator); }
[data-separator="line-info"] { margin-block: var(--diffs-gap-block, var(--diffs-gap-fallback)); }
[data-separator="simple"] { min-height: 4px; }
```
Claude 把 `--diffs-bg-separator-override` 设为 `transparent`（`ca7ba268c:7480`），所以折叠条**没有底色**，只有悬停时才显示内容区（`c49d7f557:608-611` 下划线、`:622-624` 图标变亮）。

### 6.3 文件级折叠

每个文件头是一个可点击行（`c44d00c7f:4416-4438`）：`<button aria-expanded data-sticky>` 包着 `FileHeader`，
`expanded` 决定插入 `<FileDiff>` 还是仅头部。文件头 `sticky top-0 z-[4]`（`c44d00c7f:5554`），
diff 本体套 `<div data-diff-file-header>` 让 sticky 偏移可算（`c44d00c7f:2846`）。

库层面：`options.collapsed = true` 时 `getLinePosition` 直接返回 `{top: headerHeight, height: 0}`（`ca7ba268c:4223`）。

---

## 7. 设置项

### 7.1 全部 diff 偏好（确证）

存储层：`qS(key, telemetryName, defaultValue, enabled)`，`c227f4d5e-BtCczSFM.pretty.js:2726-2758`：

```js
function qS(e, t, n, r) {
  let [i, a] = Bc(e, null);                         // Bc = shared-28 的 fs = usePersistedStorage
  return [ r && typeof i == "boolean" ? i : n,      // 未命中灰度则强制默认值
           H((e) => { a(e), rh({ option: t, enabled: e }); }, [a, t]) ];   // 同时上报遥测
}
```

| 偏好 key | 遥测 option | 默认 | 灰度门 | 影响 |
| --- | --- | --- | --- | --- |
| `epitaxy-diff-word-wrap` | `word_wrap` | `true` | `__gb__1420783417` | `overflow: wrap` vs `scroll` |
| `epitaxy-diff-word-diff` | `word_diff` | `true` | 同上 | 词级高亮开关（§3.3） |
| `epitaxy-diff-hide-whitespace` | `hide_whitespace` | `false` | 同上 | 折叠纯空白变更（§7.3） |
| `epitaxy-diff-file-tree` | `file_tree` | `!ve("__gb__616667399", e)` | `__gb__220101525` | 文件树 vs 平铺列表 |
| `epitaxy-diff-group-by-kind` | `group_by_kind` | `false` | `__gb__2303813757` | test/build/generated 分组 |
| `epitaxy-diff-commits-collapsed` | `commits_collapsed` | `false` | `__gb__1420783417` | 左栏 commits 区折叠 |
| `epitaxy-diff-layout` | （无，走 `_h({layout})`） | `"unified"`，可选 `"split"`/`"auto"` | `__gb__2217832767` | §4.1 |
| `epitaxy-diff-tree-width` | — | **240**，clamp `[160, 640]` | `__gb__1870290131` | 文件树宽度 |
| `epitaxy-pr-diff-tree-width` | — | **160** | 同上 | PR 面板树宽 |
| `epitaxy-files-tree-width` | — | **240** | 同上 | 文件面板树宽 |

### 7.2 存储介质（三重）

```js
// shared-28-DpnCXf6C.pretty.js:1003-1017
let d = T(u === void 0 ? Lf : tp(o, u), () => kf(o), () => void 0),
    f = _(() => (u !== void 0 && be(`persisted.${o}`) === void 0 ? (u.read() ?? t) : t), [o, u, t]),
    [p, m] = Te({ key: `persisted.${o}`, defaultValue: f, sync: !0 });   // ← zustand persist
return [ d ?? p, Qt(e => { ... m(n), U && Jf(o, n); }) ];               // ← Jf 推到桌面主进程偏好桶
```
- **浏览器 localStorage key 前缀**：`persisted.` → 实际 key 是 `persisted.epitaxy-diff-word-wrap`（`shared-28:907`、`:914`、`:1009`）。
- **服务端/主进程偏好桶**：`Jf(e, t)` → `U.setPreference`，整包叫 `epitaxyPrefs`（`shared-28:853-858` 的 `Ff` 消费 `e.epitaxyPrefs`）。
- **旧 key 迁移**：`legacyLocalStorageKey` / `seedFromPref`（`shared-28:1000-1002`、`:1039-1061`）。

`diffShowTree`（是否显示文件列表）不在上面这套里，而在**面板 store**：
`localStorage` key `epitaxy-popout-diff-file-list-shown`（popout 窗口）或跟随 pane 默认 `!0`（`c03935b01-Csh_0_Y5.pretty.js:761-777`）。

### 7.3 `epitaxy-diff-hide-whitespace` 的具体渲染影响

不是 CSS，是**预处理 patch 文本**（`c44d00c7f:261-327` 的 `vr(patch)`）：

1. 按 `@@` 切 hunk；
2. 连续 `-`/`+` 行成组，用 jsdiff 对**去掉所有空白后的行**做 `diffLines`（`x(e) = e.replace(/\s+/g,"")`，`c44d00c7f:96-97`）；
3. `_r(dels, adds)` 判定「去空白后完全相同」→ 整组降级为 ` ` 上下文行（`for (let e of r.adds) t.push(\` ${e}\`)`）；
4. 其余行按 jsdiff 结果重排 `-`/`+`/` ` 前缀；
5. 返回 `{ patch, whitespaceOnly: i && !a }` —— 如果**所有**变更都是空白差异，`whitespaceOnly = true`，UI 显示徽章 `Whitespace only` 并跳过渲染。

`dr = 2000` 是单块行数上限、`fr = 400` 是 `maxEditLength`（`c44d00c7f:230-231`），超出就不做重排。

### 7.4 菜单入口的可见性门控

| 菜单项 | 门控函数 | 证据 |
| --- | --- | --- |
| `diff-side-by-side` / `diff-word-wrap` | `tC()` = `!we("__gb__2217832767")`；`WS()` = `!we("__gb__1420783417")` | `c227f4d5e:2960-2928` |
| `diff-word-diff` / `diff-hide-whitespace` | `_`（= 灰度） | `cccc2cf0a:3440-3458` |
| `diff-file-tree` | `Rs()` | `cccc2cf0a:3396-3404` |
| `diff-group-by-kind` | `gs()` | `cccc2cf0a:3405-3413` |
| `diff-collapse-all` / `diff-expand-all` | `_ && C !== undefined` | `cccc2cf0a:3415` |

---

## 8. 大 diff 的性能处理

### 8.1 判定阈值（确证）

```js
// cd14a8022-DX5tudD1.pretty.js:85-86
var A = 5e3,   // 导出为 i  → c44d00c7f 里叫 Pt
    j = 2e4,   // 导出为 t  → c44d00c7f 里叫 Rt
```
```js
// c44d00c7f-BvqLukuQ.pretty.js:5815-5826
$e = useMemo(() => {
  let e = He ? Rt : Pt;                    // He = 是否有 worker pool；有则 20000，否则 5000
  return Ze.additions + Ze.deletions > e ? true
       : Qe === void 0 ? (Fe !== void 0 && ((Z.some(f => f.rawFile.changes > 0) && !Z.some(f => f.rawFile.patch))
                                           || (Z.length > kl && … && !Z.some(f => Ol.test(f.rawFile.patch ?? "")))))
       : Qe;                               // Qe = comparison.patches_withheld（服务端已判定为 withheld）
}, [Ze, Qe, Fe, Z, He]);
```
`kl = 300`（文件数）、`Ol = /(?:^|\n)@@/`（patch 里是否含 hunk 头）。

判定结果通过 `onIsLargeDiffChange` 写入 store `diffIsLarge[scopeId]`（`cccc2cf0a:7690`）。

### 8.2 大 diff 时的四件事

| 行为 | 实现 | 证据 |
| --- | --- | --- |
| 全部文件默认折叠 | `Ue(t) = p \|\| (h && Lo(file)) \|\| (!t.rawFile.patch && !bs(...))`；大 diff 时 `$e` 进入 `collapseAll` | `c44d00c7f:5869-5873`、`:3783` |
| 禁用「Expand all」 | `disabled: C` + tooltip | `cccc2cf0a:3426-3432` |
| 顶部提示条 | `Files are collapsed for large diffs. Select a file to expand it.` | `c44d00c7f:6156-6162` |
| 预折叠集合 `folded` | 用 `Set<path>` 记录，`scope` 变了就重建 | `c44d00c7f:5855-5869` |

### 8.3 虚拟化（确证，三层）

| 层 | 机制 | 证据 |
| --- | --- | --- |
| 文件级 | `IntersectionObserver` + `rootMargin: "200px"` 决定是否请求 patch/行；`fetchScheduler.setVisible` 控制优先级 | `c44d00c7f:5347-5374` |
| 渲染级 | `VirtualizedFileDiff`，上下各一块 `div[data-virtualizer-buffer]` 占位（`grid-row: span N`），离屏时换成 `div[data-placeholder]`（`contain: strict`，仅设 `height`） | `ca7ba268c:3822-3845`、`:3131-3146`；`tn()` `:354-363`；`c49d7f557:1256-1258` |
| 词级高亮级 | `isWindowedHighlight`：只对可视窗口内的行做 token 化（`shouldSkip` / `isInWindow` / `emit` 计数跳过） | `cc8da1d42:263-320` |

虚拟化占位样式（`c49d7f557:515-525`）：斜纹背景
```css
[data-content-buffer] {
  background-image: repeating-linear-gradient(-45deg, transparent, transparent calc(3px*1.414),
                      var(--diffs-bg-buffer) calc(3px*1.414), var(--diffs-bg-buffer) calc(4px*1.414));
  background-position: 5px 0; background-size: 8px 8px; background-origin: border-box;
}
```

### 8.4 预高亮预算（确证，`c44d00c7f:5674-5679`）

```js
var wl = 300,   // 最长等待 300ms
    El = 160,   // 最多预扫 160 个文件（每个算 2 单位）
    Dl = 640;   // 累计行预算上限
```
`Ml()`（`:6259-6281`）遍历文件，若在后台 worker pool 中且未缓存，则把 `FileDiff` 塞进 `primeDiffHighlightCache`；
`Nl()`（`:6282-6304`）用一个 `performance.now() + 300` 的 deadline 与 `Promise.all` 竞速，到点就放弃剩余预高亮。
第二个触发点：`cl = 4000` 行以下、且文件在视口内时才预热（`c44d00c7f:5416-5424`）。

### 8.5 行数上限 / 截断提示

| 场景 | 处理 | 证据 |
| --- | --- | --- |
| 单文件超 `tokenizeMaxLength`（默认 `1e5` 行） | 跳过 token 化，退化为纯文本渲染 | `c93fb40ec:27`（`y = 1e5`）、`ca7ba268c:1354` |
| 单行超 `tokenizeMaxLineLength`（1000 字符） | 该行不高亮 | `ca7ba268c:1254` |
| 单文件行数 > 1000 且非窗口化 | 关闭词级 diff | `cc8da1d42:770` |
| 服务端 `patches_withheld` | 直接视作 large，全部折叠 | `c44d00c7f:5814-5826` |
| 无 patch 且文件改动 > 0 | 显示空态，等待 `fetchFilePatch` | `c44d00c7f:5821-5824`、`:3861` |
| 全部文件都拿不到内容 | `Diff content unavailable for {count, plural, one {# file} other {# files}}.` | `c44d00c7f:5978-5986` |
| 折叠态下的 hunk 分隔条 | 未知行数文案 `More unchanged context may be available` | §6.2 |

---

## 9. 完整 CSS 摘录

### 9.1 变量与色板

`c49d7f557-BzsUo6sq.pretty.js:2-45`（`:host`）：

```css
:host {
  --diffs-font-fallback: "SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace;
  --diffs-header-font-fallback: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif;
  --diffs-mixer: light-dark(#000, #fff);
  --diffs-gap-fallback: 8px;
  --diffs-scrollbar-gutter-fallback: 6px;
  --diffs-scrollbar-gutter: var(--diffs-scrollbar-gutter-override, var(--diffs-scrollbar-gutter-measured, var(--diffs-scrollbar-gutter-fallback)));
  --diffs-added-light:    #0dbe4e;   --diffs-added-dark:    #5ecc71;
  --diffs-modified-light: #009fff;   --diffs-modified-dark: #69b1ff;
  --diffs-deleted-light:  #ff2e3f;   --diffs-deleted-dark:  #ff6762;
  --diffs-warning-light:  #d5a910;   --diffs-warning-dark:  #ffd452;
  color-scheme: light dark;
  font-family: var(--diffs-header-font-family, var(--diffs-header-font-fallback));
  font-size: var(--diffs-font-size, 13px);
  line-height: var(--diffs-line-height, 20px);
  font-feature-settings: var(--diffs-font-features);
  --diffs-bg:            light-dark(var(--diffs-light-bg, #fff), var(--diffs-dark-bg, #000));
  --diffs-bg-context:    var(--diffs-bg-context-override,    light-dark(color-mix(in lab, var(--diffs-bg) 98.5%, var(--diffs-mixer)), color-mix(in lab, var(--diffs-bg) 92.5%, var(--diffs-mixer))));
  --diffs-bg-separator:  var(--diffs-bg-separator-override,  light-dark(color-mix(in lab, var(--diffs-bg) 96%, var(--diffs-mixer)),   color-mix(in lab, var(--diffs-bg) 85%, var(--diffs-mixer))));
  --diffs-fg:            light-dark(var(--diffs-light, #000), var(--diffs-dark, #fff));
  --diffs-fg-number:     var(--diffs-fg-number-override, light-dark(color-mix(in lab, var(--diffs-fg) 65%, var(--diffs-bg)), color-mix(in lab, var(--diffs-fg) 65%, var(--diffs-bg))));
  --diffs-deletion-base:  var(--diffs-deletion-color-override,  light-dark(var(--diffs-deleted-light),  var(--diffs-deleted-dark)));
  --diffs-addition-base:  var(--diffs-addition-color-override,  light-dark(var(--diffs-added-light),    var(--diffs-added-dark)));
  --diffs-modified-base:  var(--diffs-modified-color-override,  light-dark(var(--diffs-modified-light), var(--diffs-modified-dark)));
  --diffs-bg-deletion:          var(--diffs-bg-deletion-override,          light-dark(color-mix(in lab, var(--diffs-bg) 88%, var(--diffs-deletion-base)), color-mix(in lab, var(--diffs-bg) 80%, var(--diffs-deletion-base))));
  --diffs-bg-deletion-emphasis: var(--diffs-bg-deletion-emphasis-override, light-dark(rgb(from var(--diffs-deletion-base) r g b / .15), rgb(from var(--diffs-deletion-base) r g b / .2)));
  --diffs-bg-addition:          var(--diffs-bg-addition-override,          light-dark(color-mix(in lab, var(--diffs-bg) 88%, var(--diffs-addition-base)), color-mix(in lab, var(--diffs-bg) 80%, var(--diffs-addition-base))));
  --diffs-bg-addition-emphasis: var(--diffs-bg-addition-emphasis-override, light-dark(rgb(from var(--diffs-addition-base) r g b / .15), rgb(from var(--diffs-addition-base) r g b / .2)));
  background-color: var(--diffs-bg); color: var(--diffs-fg); display: block;
}
```

### 9.2 Claude 的实例化变量（`ca7ba268c:7473-7492`）

```js
ua = {
  "--diffs-font-family":        "var(--cds-font-mono)",
  "--diffs-header-font-family": "var(--cds-font-sans)",
  "--diffs-font-size":          "var(--cds-font-size-code)",
  "--diffs-line-height":        "var(--cds-leading-code)",
  "--diffs-bg-hover-override":      "var(--cds-fill-ghost-hover)",
  "--diffs-bg-context-override":    "transparent",
  "--diffs-bg-separator-override":  "transparent",
  "--diffs-fg-number-override":            _,
  "--diffs-fg-number-addition-override":   "var(--cds-text-git-added)",
  "--diffs-fg-number-deletion-override":   "var(--cds-text-git-removed)",
  "--diffs-addition-color-override":       "var(--cds-text-git-added)",
  "--diffs-deletion-color-override":       "var(--cds-text-git-removed)",
  "--diffs-modified-color-override":       "var(--cds-text-git-modified)",
  "--diffs-selection-color-override":      "var(--cds-text-accent)",
  "--diffs-bg-selection-override":         "var(--cds-fill-accent)",
  "--diffs-bg-selection-number-override":  "var(--cds-fill-accent)",
  "--diffs-fg-conflict-marker-override":   _,
},
da = { "--diffs-gap-style": "0" };
```
`_ = Nt = "var(--cds-text-stays-secondary, var(--cds-text-muted))"`
（`shared-frame-BfjMqbuN.pretty.js:135`；`ca7ba268c` 的 `_` 由 `Cd as _` 引入 = 同一个字符串常量）。

宿主底色：`ya = ":host{--diffs-bg:var(--cds-filediff-bg,var(--cds-surface-1))}"`（`ca7ba268c:7507`），
`--cds-filediff-bg` 由 `ka(backgroundColor)` 决定，取值 `var(--cds-surface-1)` / `transparent` / 任意 cds token（`ca7ba268c:7520-7528`）。

**Claude 的 `.epitaxy-diff` 只有两条规则**（`c6a992d55-SXiDGMFQ.css`，全文 2 处命中）：

```css
.epitaxy-root .epitaxy-diff{
  --diffs-font-size:var(--cds-font-size-code);
  --diffs-line-height:var(--cds-leading-code);
  --diffs-font-family:var(--cds-font-mono);
  --diffs-header-font-family:var(--cds-font-sans);
  --diffs-addition-color-override:var(--cds-text-git-added);
  --diffs-deletion-color-override:var(--cds-text-git-removed);
  --diffs-modified-color-override:var(--cds-text-accent);
  --diffs-gap-inline:var(--cds-pad-md);
  --diffs-gap-block:var(--cds-pad-xs)
}
.epitaxy-root .epitaxy-card-outline,
.epitaxy-root .epitaxy-card-outline-inset,
[data-mode=light][data-code-theme-light=claude-light] .epitaxy-root .epitaxy-diff:not(.epitaxy-fence),
[data-mode=dark][data-code-theme-dark=claude-dark]   .epitaxy-root .epitaxy-diff:not(.epitaxy-fence){
  --epitaxy-card-outline:0 0 0 1px var(--cds-border); box-shadow:var(--epitaxy-card-outline)
}
```

> **澄清用户清单里的类名**：`diff-added` `diff-removed` `diff-modified` `diff-renamed` `diff-ignored`
> `diff-sidebyside` `diff-single` **在 CSS 中不存在**（25 个 CSS 全量 grep 零命中）。
> 它们是 Monaco 的 codicon id（`c0c1c41fc:7162-7168`、`:7508`）。
> `epitaxy-diff-word-wrap` `epitaxy-diff-word-diff` `epitaxy-diff-hide-whitespace` `epitaxy-diff-file-tree`
> `epitaxy-diff-group-by-kind` `epitaxy-diff-tree-width` `epitaxy-diff-layout` `epitaxy-diff-commits-collapsed`
> **也不是 CSS 类**，而是 **localStorage / 偏好键名**（`c227f4d5e:2171`、`:2711-2716`、`:2759`）。

### 9.3 行 / 行号 / 选中

```css
/* c49d7f557:845-852, 939-957 */
[data-line], [data-column-number], [data-no-newline] { padding-inline: 1ch; position: relative; }
[data-indicators="classic"] [data-line] { padding-inline-start: 2ch; }
[data-overflow="scroll"] [data-line] { white-space: pre; min-height: 1lh; }
[data-column-number] { box-sizing: content-box; text-align: right; user-select: none;
                       color: var(--diffs-fg-number); padding-left: 2ch; }
[data-line-number-content] { min-width: var(--diffs-min-number-column-width, var(--diffs-min-number-column-width-default, 3ch));
                             z-index: 1; display: inline-block; position: relative; }

/* c49d7f557:274-326 选中行 */
[data-gutter-buffer][data-selected-line], [data-column-number]:is([data-selected-line], [data-editor-active-line]) { color: var(--diffs-selection-number-fg); }
&:where([data-line], …)[data-selected-line] { --mix-selection-light: 82%; --mix-selection-dark: 75%; }
&:where([data-gutter-buffer][data-selected-line], [data-column-number]:is(…)) { --mix-selection-light: 75%; --mix-selection-dark: 60%; }

/* c49d7f557:314-322 悬停 */
@media (pointer: fine) {
  [data-line][data-hovered], … { --diffs-computed-hovered-line-bg:
      light-dark(color-mix(in lab, var(--diffs-computed-editor-active-line-bg) 97%, var(--diffs-hover-mix-target)),
                 color-mix(in lab, var(--diffs-computed-editor-active-line-bg) 91%, var(--diffs-hover-mix-target))); }
}
```

### 9.4 头部（文件标题条）

```css
/* c49d7f557:1072-1149 */
[data-diffs-header="default"] {
  background-color: var(--diffs-bg);
  justify-content: space-between; align-items: center;
  gap: var(--diffs-gap-inline, var(--diffs-gap-fallback));
  min-height: calc(1lh + (var(--diffs-gap-block, var(--diffs-gap-fallback)) * 3));
  z-index: 2; flex-direction: row; padding-inline: 16px; display: flex; position: relative; top: 0;
}
[data-diffs-header][data-sticky] { z-index: 1; background-color: var(--diffs-bg); position: sticky; top: 0; }
[data-header-content] { align-items: center; gap: var(--diffs-gap-inline, …); white-space: nowrap; display: flex; }
[data-header-content] [data-prev-name], [data-header-content] [data-title] {
  text-overflow: ellipsis; white-space: nowrap; direction: rtl; min-width: 0; overflow: hidden;
}
[data-prev-name] { opacity: .7; }
[data-diffs-header="default"] [data-additions-count] { font-family: var(--diffs-font-family, …); color: var(--diffs-addition-base); }
[data-diffs-header="default"] [data-deletions-count] { font-family: var(--diffs-font-family, …); color: var(--diffs-deletion-base); }
[data-file-info] { color: var(--fg); background-color: color-mix(in lab, var(--bg) 98%, var(--fg));
                   border-block: 1px solid color-mix(in lab, var(--bg) 95%, var(--fg)); padding: 10px; font-weight: 700; }
```

### 9.5 Claude 追加的注入 CSS（`ca7ba268c:7498-7518`）

```js
ma = '[data-overflow="wrap"] [data-line]{padding-right:max(1ch,calc(100% - 1ch - var(--cds-code-wrap-cols,9999) * 1ch))}'
   + '[data-overflow="wrap"][data-indicators="classic"] [data-line]{padding-right:max(1ch,calc(100% - 2ch - var(--cds-code-wrap-cols,9999) * 1ch))}'
   + '@supports (padding-right:round(up,1ch,1px/64)){ … round(up,1ch,1px/64) … }';

ha = '[data-diffs-header]{display:none}'                                     // disableFileHeader 时
   + ':is([data-diffs-header]~[data-diff],[data-diffs-header]~[data-file]) [data-code],…{padding-top:var(--diffs-gap-block,…)}';

ga = ':is([data-diff],[data-file]):not([data-disable-line-numbers]) [data-gutter-utility-slot]{right:unset;left:5px;justify-content:flex-start}'
   + ':is([data-diff],[data-file]):not([data-disable-line-numbers]) [data-column-number]{padding-left:calc(2ch + 5px)}';

_a = '[data-separator-wrapper]{padding-left:8px;grid-template-columns:16px auto;gap:4px}'
   + '[data-separator-wrapper][data-separator-multi-button]{grid-template-columns:16px 16px auto}'
   + '[data-expand-button]{min-width:16px;border-right:0}'
   + '[data-separator-content]{grid-column-start:-2;padding:0}'
   + '[data-separator-wrapper]:has([data-expand-button]):hover :is([data-expand-button],[data-separator-content]){color:var(--cds-text-secondary)}';

va = '[data-separator-wrapper]{padding-left:var(--cds-pad-md)}'
   + '@media (pointer:fine){[data-separator-wrapper][data-separator-multi-button]{grid-template-columns:16px calc(24px - var(--cds-pad-md)) auto}}';

ya = ':host{--diffs-bg:var(--cds-filediff-bg,var(--cds-surface-1))}';
ba = ':host{--diffs-selection-base:var(--diffs-selection-color-override,var(--diffs-modified-base))}';
xa = '[data-overflow=wrap] [data-line]{min-height:1lh}';
Sa = '[data-overflow=wrap]{--diffs-code-grid:var(--diffs-grid-number-column-width) minmax(0,1fr)}';
Ca = '[data-diff],[data-file]{letter-spacing:calc(round(up,1ch,1px/64) - 1ch);'
   + 'font-feature-settings:var(--diffs-font-features,"liga","clig","calt")}';
wa = '[data-line] span[style*="font-weight"],[data-error-message]{font-variation-settings:normal}';
Ta = '::selection{background-color:var(--cds-code-text-selection-bg,'
   + 'light-dark(color-mix(in srgb,var(--cds-fill-accent) 25%,transparent),color-mix(in srgb,var(--cds-fill-accent) 30%,transparent)))}';
Ea = ':is([data-diff],[data-file]):not([data-disable-line-numbers]) [data-line-number-content],'
   + ':is([data-diff],[data-file]):not([data-disable-line-numbers]) [data-gutter-buffer]:before'
   + '{min-width:var(--diffs-min-number-column-width,max(3ch,var(--diffs-min-number-column-width-default,3ch)))}';
Da = '[data-indicators="classic"] [data-no-newline]{padding-inline-start:2ch}';
```

---

## 10. 排版度量 / Typography

> **口径**：桌面端 density 默认 **comfortable**，且 `--cds-rem-scale: 1`（`--cds-rem-scale:calc(16/17)` 只在 iOS `@supports (font:-apple-system-body)` 里生效，见 `c6a992d55.css`）。
> 因此下文 `rem → px` 一律按 **1rem = 16px** 换算。

### 10.1 字体族

**diff 代码行**（`<diffs-container>` 内 `pre, code`）—— `c49d7f557:47-54` + `ca7ba268c:7474`：

```css
pre, code, [data-error-wrapper] { font-family: var(--diffs-font-family, var(--diffs-font-fallback)); }
/* Claude 把 --diffs-font-family 指到 --cds-font-mono */
```
完整解析链（`c6a992d55.css` 两条 `--cds-font-mono` 定义，后者为 Anthropic 正式栈）：

```
--cds-font-mono        = var(--cds-font-mono-override,)  var(--font-anthropic-mono,"SF Mono"), "SF Mono", ui-monospace, Menlo, Consolas, monospace
--font-anthropic-mono  = "anthropic-mono", ui-monospace, monospace
--diffs-font-fallback  = "SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace
```
**实际生效栈**：`anthropic-mono`（可变字体 300–800）→ `"SF Mono"` → `ui-monospace` → `Menlo` → `Consolas` → `monospace`。
另一条并行定义（旧栈）：`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`。

| 元素 | 字体族 | 证据 |
| --- | --- | --- |
| 代码行 / 词级 span | `--cds-font-mono`（上） | `ca7ba268c:7474` |
| **hunk 头 / 折叠条 / 冲突标记 / 文件头标题** | `--cds-font-sans` = `"anthropic-sans", system-ui, "Segoe UI", Roboto, Helvetica, Arial, <CJK fallback>, <script fallback>, sans-serif` | `c49d7f557:21`、`:78-80`；`ca7ba268c:7475` |
| 行号列 | 继承 `code`（mono）；无独立 font-family 声明 | `c49d7f557:845-957`（无 font-family） |
| diff 内 `+N −N` 计数 | **mono**（`[data-additions-count]` 显式 `font-family: var(--diffs-font-family…)`） | `c49d7f557:1120-1128` |
| 文件树行 | **sans**（走页面默认 `--cds-font-sans`，未显式声明） | `ca7840910:43`（类里无 font-family） |
| 文件名 / 路径标签 | sans（Claude 自己的 `text-body` 组件） | `c219730b0:352` `text-body text-secondary` |
| 操作按钮文案 | sans | `c44d00c7f:6003` 等 |

**variable font 的 wght 轴**（`c6a992d55.css`，`.text-code-medium` / `.text-code-regular`）：
```css
.text-code-medium{
  font-size:var(--cds-font-size-code); line-height:var(--cds-leading-code); font-family:var(--cds-font-mono);
  font-weight:var(--cds-font-weight-medium);                       /* 500 */
  --cds-font-axis-wght:var(--cds-font-axis-wght-medium);
  font-variation-settings: var(--font-opsz-axis,) var(--cds-font-axis-wght,) "GRAD" var(--cds-font-grad,0);
}
```
- 默认 `--cds-font-axis-wght-regular/medium/semibold/bold` 都是 **空值**（`c6a992d55.css`：`--cds-font-axis-wght-regular: ;`），
  即 **浅色模式下只用 `font-weight`，wght 轴留空**；暗色模式才填入具体 wght（360/460/540/560）。
- **diff 的代码行不用 `.text-code-medium`，用的是 `.text-code`**（无 `font-variation-settings`），
  并且在 `FileDiff` 根节点上写死 `font-normal`（见 §10.3）。
- Claude 还关掉了字重 span 的斜体化副作用：`wa = '[data-line] span[style*="font-weight"]{font-variation-settings:normal}'`（`ca7ba268c:7513`）。

### 10.2 字号

| 元素 | comfortable（默认） | compact | 变量 / 类 | 证据 |
| --- | --- | --- | --- | --- |
| **代码行** | `0.8125rem` = **13px** | `.75rem` = 12px | `--cds-font-size-code` → `--diffs-font-size` | `c6a992d55.css`（`.cds-root` / `[data-density=comfortable]`）；`ca7ba268c:7476` |
| 代码行兜底（变量缺失时） | `13px` | — | `var(--diffs-font-size, 13px)` | `c49d7f557:22` |
| **行号** | 同代码行（13px），继承 | 12px | 无独立字号 | `c49d7f557:944-957` |
| **hunk 头 / 折叠条文案** | 13px —— 继承 `:host` 的 `font-size`（`[data-separator]` 只改 font-family 为 sans，**不覆盖字号**） | 12px | 无独立字号 | `c49d7f557:21-23`（`:host`）、`:78-80`（仅 font-family） |
| 合并冲突标记 `(Current Change)` | `.75rem` = 12px / 行高 `1.25rem` = 20px | — | 字面量 | `c49d7f557:1009-1021` |
| 合并冲突操作按钮区 | `.75rem` = 12px / 行高 `1.2` | — | 字面量 | `c49d7f557:1031-1041` |
| **文件树行** | `--cds-font-size-body` = `0.875rem` = **14px** | `0.8125rem` = 13px | `text-body` | `ca7840910:43`；`c6a992d55.css` |
| 文件树组标题（Test/Build/Generated 计数） | `--cds-font-size-footnote` = `0.75rem` = **12px** | 同 | `text-footnote` | `c44d00c7f:4896`；`c6a992d55.css` |
| diff 内文件头（文件名） | 14px（`text-body`） | 13px | `text-body` | `c219730b0:352`；`c6a992d55.css` |
| diff 内文件头（徽章 `Binary file` 等） | 12px（`text-footnote`） | 同 | `text-footnote` | `c219730b0:268`、`:383` |
| `+N −N` 计数（文件头） | 14px（`text-body`） | 13px | `text-body` | `c219730b0:360` |
| `+N −N` 计数（文件树行） | 12px（`text-footnote`） | 同 | `text-footnote` | `c44d00c7f:5148` |
| 顶部「N files +A −D」 | 12px（`text-footnote`）+ 13px（`text-code`） | — | — | `c44d00c7f:6037-6047` |
| 菜单项/按钮文案 | 13–14px（`text-body`） | — | `text-body` | `c44d00c7f:6003` |

> **关于 `.75rem` 的说明**：`epitaxy-terminal-view` 里写 `var(--cds-font-size-code, .75rem)`，
> `.75rem` 只是「变量没定义时」的兜底（12px）。**正常运行时 `--cds-font-size-code` 已定义**，
> 桌面 comfortable 下解析为 **13px**。所以「默认 12px」这个推断**不成立**——
> 12px 只在 compact density 或变量丢失时出现。

`.text-code` 工具类（`c6a992d55.css`）：
```css
.text-code { font-size: var(--cds-font-size-code); line-height: var(--cds-leading-code); font-family: var(--cds-font-mono); }
```

### 10.3 字重

| 元素 | font-weight | 证据 |
| --- | --- | --- |
| **所有代码行（含新增/删除行）** | **400** —— `FileDiff` 根节点硬编码 `font-normal` | `ca7ba268c-BWAjIZ0x.pretty.js:7613`：`className: T("text-code text-primary font-normal", t)` |
| 新增行 / 删除行 | **不加粗、不倾斜**。CSS 里没有任何 `[data-line-type]` 的 font-weight 规则 | 全量 grep `c49d7f557` 只有 4 处 font-weight：`:94`（`[data-file-info]` 700）、`:119`（token 变量继承）、`:1270`（错误标题 bold）；无 `change-addition`/`change-deletion` 命中 |
| 语法 token | `font-weight: light-dark(var(--diffs-token-light-font-weight, inherit), var(--diffs-token-dark-font-weight, inherit))` —— **由高亮主题决定，默认 inherit（=400）** | `c49d7f557:119` |
| hunk 头 / 折叠条文案 | **400**（`[data-separator-content]` 无 weight 声明，继承 400） | `c49d7f557:635-642` |
| 文件名（diff 头） | **400**（`[data-title]` 无 weight 声明） | `c49d7f557:1095-1101` |
| 文件树行 / 文件树组名 | 400（`dirLabel: "text-sm font-normal truncate"` 显式 normal；compact 版无 weight 类） | `ca7840910:152`、`:164` |
| `[data-file-info]`（库内置的另一种文件头） | **700** | `c49d7f557:89-95` |
| 合并冲突标记 `(Current Change)` 文案 | 400，仅 `font-size:.75rem` | `c49d7f557:1009-1021` |
| diff 徽章 / 计数 | 400 | `c219730b0:268`、`:360` |

**结论（确证，非推断）**：这套实现**不用加粗区分增删**。视觉区分完全靠背景色（§9.1 的 `--diffs-bg-addition/deletion`）、
`+`/`−` 指示符（`[data-indicators="classic"]`）、行号着色（git 绿/红）三者叠加。

### 10.4 字距

| 项 | 值 | 证据 |
| --- | --- | --- |
| **代码行 letter-spacing** | `calc(round(up, 1ch, 1px/64) - 1ch)` | `ca7ba268c:7512` |
| 该值的含义（推断，但公式自明） | 把 `1ch` 向上取整到 `1/64 px` 精度后减回 `1ch`，得到 **0 ~ +0.0156px 的亚像素补偿**，消除等宽字体在非整数设备像素下的列漂移 | 同上 |
| `font-feature-settings` | `var(--diffs-font-features, "liga", "clig", "calt")` —— 连字默认开 | `ca7ba268c:7512` |
| **行号列 tabular-nums** | **CSS 未设**（`[data-column-number]` 无 `font-variant-numeric`）。它靠等宽字体本身对齐 | `c49d7f557:944-950` |
| 但 Claude 自己的数字（文件树 `+N −M`、组计数、文件数） | 显式 `tabular-nums`（→ `font-variant-numeric: tabular-nums`） | `c44d00c7f:5148`、`:4896`、`:6037`；`c6a992d55.css` `.tabular-nums` |
| diff 计数徽章（`DiffIndicator`） | `[font-variant-numeric:tabular-nums_lining-nums]` | `c227f4d5e:2815`、`:2850` |
| **uppercase / 负 tracking** | **hunk 头不使用**。存在一个 section-label 工具类 `text-caption-medium uppercase tracking-wide`，`tracking-wide = 0.025em`，用在小节标题；diff 面板内未见使用（`kg` 已被 import 但全文件无调用） | `ca7d7d34d-D_G8uDn6.pretty.js:14`、`:22-24`；`c6a992d55.css` `--tracking-wide:.025em` |

### 10.5 行高与度量

| 项 | 值 | 证据 |
| --- | --- | --- |
| **代码行 line-height** | `--cds-leading-code` = `1.1875rem` = **19px**（comfortable）；compact `1.0625rem` = 17px | `c6a992d55.css`；`ca7ba268c:7477` |
| 库默认（变量缺失） | `20px` / 字号 `13px` | `c49d7f557:22-23` |
| JS 侧用于布局计算的行高 | `fa(density, remPx) = { ...P, lineHeight: (la[density] * remPx) / 16 }`，`la = {compact:17, comfortable:19}` → **19px** | `ca7ba268c:7472`、`:7493-7495` |
| 两者一致性 | 19px（CSS 变量）== 19px（JS metrics）。**固定行高，是左右栏对齐的前提** | 同上 |
| 行最小高度 | `[data-line] { min-height: 1lh }`（scroll）/ `[data-overflow=wrap] [data-line]{min-height:1lh}` | `c49d7f557:939-942`；`ca7ba268c:7509` |
| 文件头高度 | `diffHeaderHeight: 44`（库默认）；Claude 传 `diffHeaderHeight: 0` 因为用自己的 sticky 头（`hideHeader: !0`） | `c93fb40ec:27`；`cccc2cf0a:7758`；`ca7ba268c:7552` |
| hunk 分隔条高度 | `32px`（`[data-separator="line-info"]`）+ 上下 `--diffs-gap-block`（Claude = `--cds-pad-xs` = 4px） | `c49d7f557:540-543`、`:572-578`；`ca7ba268c:7489`；`c6a992d55.css` `--cds-pad-xs: calc(.25rem * …)` |
| 内容区上下 padding | `--diffs-gap-block`（4px），底部再减滚动条槽 | `c49d7f557:355-358` |
| 文件块间距 | `spacing: 8`（`{ paddingTop: 8, paddingBottom: 8, gap: 8 }`） | `c93fb40ec:28` |
| 文件树行高 | `--cds-h-control` = **32px**（comfortable）/ 24px（compact） | `ca7840910:43`；`c6a992d55.css` |
| **side-by-side 左右对齐** | ① CSS Grid `subgrid` 让 gutter 与 content 共用行轨道 → 天然等高；② 固定 `line-height` 19px + `min-height: 1lh`；③ 纵向共用同一滚动容器，横向由 `ScrollSyncManager` 300ms 互斥同步 | §4.2 |
| **长行横向滚动** | `overflow: var(--diffs-overflow-override, scroll) clip`（Claude wrap 模式覆盖为 `clip`）；`scrollbar-gutter: stable`；行号列 `position: sticky; left: 0` | `c49d7f557:352`、`:359`、`:475-478`；`ca7ba268c:7544` |
| **tab-size** | `var(--diffs-tab-size, 2)` —— 默认 **2**，跟随编辑器 `tabSize` 偏好 | `c49d7f557:354`；`cd2efac6e:3310-3311` |

### 10.6 颜色层级（浅色 / 深色双套）

代码行的**文字色**来自语法高亮主题（`claude-light` / `claude-dark` 或用户选的主题），
变量为 `--diffs-token-light` / `--diffs-token-dark`（`c49d7f557:116-122`）。
**增删的色差只体现在背景与行号上**，文字色不因增删而变。

| 语义 | Token | 浅色 hex | 深色 hex | 证据 |
| --- | --- | --- | --- | --- |
| 新增前景（行号、`+`、计数） | `--cds-text-git-added` | `#1e9e3c` | `#32d74b` | `c6a992d55.css` |
| 删除前景 | `--cds-text-git-removed` | `#cd2054` | `#ff2c56` | 同上 |
| 修改前景 | `--cds-text-git-modified` | `#98801f` | `#ffd014` | 同上 |
| 新增行背景 | `--diffs-bg-addition` | `color-mix(in lab, <bg> 88%, #1e9e3c)` | `color-mix(in lab, <bg> 80%, #32d74b)` | `c49d7f557:38` |
| 删除行背景 | `--diffs-bg-deletion` | `color-mix(in lab, <bg> 88%, #cd2054)` | `color-mix(in lab, <bg> 80%, #ff2c56)` | `c49d7f557:36` |
| 词级强调（新增） | `--diffs-bg-addition-emphasis` | `rgb(from #1e9e3c r g b / .15)` | `… / .2` | `c49d7f557:39` |
| 词级强调（删除） | `--diffs-bg-deletion-emphasis` | `rgb(from #cd2054 r g b / .15)` | `… / .2` | `c49d7f557:37` |
| 普通行号 | `--diffs-fg-number` → Claude 覆写 `var(--cds-text-stays-secondary, var(--cds-text-muted))` | `#898781`（gray-400） | `#6d6b67`（`--cds-neutral-400` → gray-500） | `c49d7f557:31`；`ca7ba268c:7481`；`shared-frame-BfjMqbuN.pretty.js:135`；`c6a992d55.css` |
| 上下文背景 | 库 `--diffs-bg-context`；Claude 覆写 `transparent` | `transparent` | `transparent` | `c49d7f557:27`；`ca7ba268c:7479` |
| 分隔条背景 | 库 `--diffs-bg-separator`；Claude 覆写 `transparent` | `transparent` | `transparent` | `c49d7f557:29`；`ca7ba268c:7480` |
| 选区背景 | `--diffs-bg-selection` → Claude `var(--cds-fill-accent)` = `--cds-blue-450` | `#2a78d6` | 同 | `ca7ba268c:7488`；`c6a992d55.css` |
| 选区行号前景 | `--diffs-selection-number-fg` | `color-mix(in lab, blue 65%, #000)` | `color-mix(in lab, blue 75%, #fff)` | `c49d7f557:41` |
| 冲突标记前景 | `--diffs-fg-conflict-marker` → Claude `--cds-text-muted` | `#898781` | `#6d6b67` | `c49d7f557:32`；`ca7ba268c:7490` |
| 虚拟化占位斜纹 | `--diffs-bg-buffer` | `light-dark(color-mix(bg 92%, mixer), …)` | 同 | `c49d7f557:26`、`:515-525` |
| diff 宿主底色 | `--cds-filediff-bg` 缺省 → `--cds-surface-1` | `#fcfcfb`（gray-10） | `#151515`（gray-850） | `ca7ba268c:7507`；`c6a992d55.css` |

**代码文字色**：`--diffs-fg` = `light-dark(var(--diffs-light,#000), var(--diffs-dark,#fff))`（`c49d7f557:30`）；
实际被高亮 token 覆盖（`[data-line] span` 的 `--diffs-token-light/dark`）。

---

## 11. 组件树（Claude 侧，带 testid/class 与行号）

```
DiffPaneBody                                   cccc2cf0a:7740-7745
├─ div[data-diff-pane-body]                    "flex h-full flex-col select-text outline-none"
│  ├─ Sg                                       顶部 review-findings 条
│  └─ <DiffView>（zp / Al）                     c44d00c7f:5680
│     ├─ div[data-diff-view-header]             c44d00c7f:5995
│     │  ├─ button "Show files"/"Hide files"    ListBullet 图标, aria-pressed
│     │  ├─ 分支指示 "base → head"               ArrowSplitRight
│     │  └─ "N files  +A  −D"                    text-footnote / text-code
│     ├─ div.flex.flex-1.min-h-0                 c44d00c7f:6072（flex-row-reverse in RTL）
│     │  ├─ [文件列表栏] div[data-pane-line]     c44d00c7f:6077-6136
│     │  │  ├─ FileList（Uc）
│     │  │  │  └─ div[role="tree"][aria-label="Changed files"]
│     │  │  │     ├─ button[data-diff-tree-row][role="treeitem"][aria-level]
│     │  │  │     │    ├─ svg (CaretRight / FileIcon)
│     │  │  │     │    ├─ span 文件名 / [path]
│     │  │  │     │    └─ span.text-footnote.tabular-nums  "+N −M"
│     │  │  │     └─ [分组] div[data-diff-tree-section="test|build|generated"]
│     │  │  ├─ [Commits 区] maxHeight:40%       c44d00c7f:6103-6119
│     │  │  └─ ResizeHandle（"Resize file list"） c44d00c7f:6120-6135
│     │  └─ [diff 主体] div.flex-1.min-w-0       c44d00c7f:6149
│     │     ├─ 大 diff 提示条                    c44d00c7f:6156
│     │     ├─ VirtualizedFileList（Bs）         c44d00c7f:6166
│     │     │  └─ 每个文件：
│     │     │     └─ FileSection（ml / hl）      c44d00c7f:5301 / :4368
│     │     │        ├─ button[data-sticky] "group/diff-file sticky top-0 z-[4]"
│     │     │        │  └─ FileHeader（Bt/Lt）   c219730b0:291
│     │     │        │     ├─ svg caret（旋转 -90deg 表示折叠）
│     │     │        │     ├─ FileIcon
│     │     │        │     ├─ 路径（TruncatedPath）
│     │     │        │     ├─ [Renamed from …]
│     │     │        │     ├─ [徽章 Binary/Too large/Whitespace only/±x]
│     │     │        │     ├─ [open comment count]
│     │     │        │     └─ "+N −M"
│     │     │        └─ CodeView（st）→ <diffs-container>
│     │     │           └─ <pre data-diff data-diff-type=… data-overflow=…>
│     │     │              ├─ header / separator / line …
│     │     └─ [空态] "Diff content unavailable for N files."
│     └─ div[data-diff-pane-focus-ring]          c44d00c7f:2712-2718
└─ Annotation 编辑器（inline，走 slot）
```

关键属性常量：`_o = "data-diff-file-header"`（`c44d00c7f:2846`）、
`Dc = "[data-diff-tree-row]"`（`c44d00c7f:4904`）、`Yc = "diffs-container"`（`c44d00c7f:5191`）、
`oo = "diffs-container"`（`c44d00c7f:2727`）。

库内部选项（Claude 传入，`c44d00c7f:4327-4344`）：

```js
{ diffStyle, diffIndicators: "classic", collapsedContextThreshold: 3, overflow: wordWrap ? "wrap" : "scroll",
  backgroundColor, enableLineSelection: !readOnly, enableGutterUtility: !readOnly,
  expandUnchanged, stickyHeaders: !0, metrics, layout, onLineNumberClick, onLineSelectionStart/Change/End,
  onPostRender, theme, lineAnnotations, renderAnnotation, loadDiffFiles }
```

---

## 12. 交互清单

| 交互 | 行为 | 证据 |
| --- | --- | --- |
| 点击行号 | `onLineNumberClick` → 打开行级批注/提交评论 | `c44d00c7f:4328`、`:5622` |
| 拖选行 | `onLineSelectionStart/Change/End`，形成 `{start, end, side, endSide}` | `c64baa838:953-958` |
| hover 行 | `@media (pointer: fine)` 才启用；行背景混 3%/9% | `c49d7f557:314-322` |
| 点击折叠条 | 展开上下文；**Shift+点击 = 双向全展开** | `c64baa838:327-330` |
| 点击 `+` 槽位（gutter utility） | `onGutterUtilityClick`，按钮 `data-utility-button`，1lh×1lh，圆角 4px，底色 `--diffs-modified-base` | `c49d7f557:1183-1210` |
| 右键 | 文件级 → `Open file` / `Attach as context` / `Copy path`；行级 → 批注菜单 | `c219730b0:438-460` |
| Cmd/Ctrl+点击树节点 | 直接 `onOpenFile`（否则只是滚动定位） | `c44d00c7f:4766-4775` |
| 快捷键 `toggleDiffFileList` | 显示/隐藏文件列表，带 coachmark | `cccc2cf0a:3295-3300` |
| 点击 diff 链接 | 外链用系统浏览器，`target=_blank rel=noreferrer` | `c227f4d5e:2801-2810` |

---

## 13. 未确认项

1. **`single` vs `unified` 的属性命名由来**：DOM 用 `data-diff-type="single"`，API 用 `diffStyle:"unified"`，
   两者映射在 `c64baa838:1579`，但我没找到上游文档说明为何不同名。
2. **`diffs-icon-symbol-ignored` 的使用点**：sprite 里有这个 symbol（`c64baa838:2176-2178`），
   但 `qe()` 的映射表（`:1498-1512`）没有 `ignored` 分支，全仓也没找到 `data-change-icon="ignored"`。推断是库预留但 Claude 未用。
3. **`data-diff-type="single"` 时 `--diffs-code-grid` 是否被 `data-unified` 覆盖**：
   `c49d7f557:661-676` 有 `@supports (width: 1cqi) { [data-unified] { … } }` 只影响分隔条圆角，
   没看到网格定义差异。推断 unified 与 split 的列定义差异只在 `[data-diff-type=…]` 层面。
4. **`epitaxy-diff-layout` 的 `"auto"` 取值**：代码允许 `"auto"`（`c227f4d5e:2765-2767`），
   但没找到任何写入 `"auto"` 的 UI 入口。
5. **`diff-commits` 的 `fb = 50` 上限外是否还有分页**：只看到 "N older commits not shown" 的静态提示（`cccc2cf0a:2949-2963`），未见分页逻辑。
6. **`lineDiffType` 是否可被用户切换**：Claude 只暴露"Highlight changed words"布尔开关，
   没有暴露 `word`/`char` 的选择；`char` 分支实现了但我没找到调用方传入的路径。
7. **`--cds-font-mono` 两条定义哪条优先**：同一文件里出现两次（`c6a992d55.css`），
   一条是 `ui-monospace,…` 系统栈，一条是 `var(--font-anthropic-mono,"SF Mono"),…` Anthropic 栈。
   按 CSS 层叠后者通常胜出（同为 `.cds-root`/`:root` 级别），但我没逐 selector 验证优先级。
8. **`epitaxy-diff-hide-whitespace` 打开时的行号映射**：折叠后 `additionStart` 是否重编号，
   我只确认了 patch 文本被重写（`c44d00c7f:261-327`），未验证最终行号是否与真实文件错位。

---

## 14. DSH 侧：行号从哪来

> 编号说明：任务里写的是「§9」，但本文 §9 已被「完整 CSS 摘录」占用；按本文件顺序编号的惯例，
> 新段落接在 §13 之后，编为 §14。

**一句话**：参考实现的 `lineNumber`（§1.3）是**diff 引擎算出来的**，DSH 的 diff 引擎也算出了同样的数字，
但在写给 UI 的那一步把它**丢掉了**；仓库里的补丁把它捡回来，客户端才有真实行号可渲染。

### 14.1 参考实现：行号是引擎产物，不是渲染器序号

`FileDiff.hunks[]` 里 `additionStart` / `deletionStart` 是 **1-based 文件行号**，
`hunkSpecs` 原样保存 `@@ -12,7 +12,9 @@` 头（§1.3）。渲染时 unified 视图的 gutter 直接取
`addition?.lineNumber ?? deletion?.lineNumber`（§2.4，`ca7ba268c:1679`）。
也就是说：**编号来自 hunk 头，渲染器只是把它打印出来**，从不自己从 1 数。

### 14.2 DSH：数字在最后一米被丢掉

宿主侧 `@deepseek-ai/dsh-tool-fs/lib/index.js`（asar 内 `dsh/node_modules/…`）的
`computeHunkDiffs()`（该文件 `:404-427`）用 jsdiff 的 `structuredPatch()` 算差异，
`patch.hunks[].oldStart` / `newStart` **在手**，但推进数组的对象只有三个字段：

```js
diffs.push({ path, oldText, newText })   // oldStart / newStart 在这里丢失
```

之后还有两处会把它抹掉，所以只改一处**没有效果**：

| # | 位置 | 行为 |
| --- | --- | --- |
| 1 | `computeHunkDiffs()`，`:404-427` | 唯一持有 `hunk.oldStart` / `hunk.newStart` 的地方，构造 hunk 时丢弃 |
| 2 | `presentationMeta`（write `:593-601`、edit `:738-745`） | 把每个 hunk 再解构投影一次，只列 `{path, oldText, newText}` |
| 3 | `isFileDiff()`，`:429-433` | 收窄 opaque `meta`；只认三个字段，加字段不会报错但也不会被保留 |
| 4 | `narrowDiffs()`，`@deepseek-ai/dsh-client-ui-tool/lib/client.js:468-484` | 浏览器侧第三次按三键重建每个 hunk |

实测证据（本机真实会话）：`meta.diffs` 的键恰好是 `path` / `oldText` / `newText`，
整个会话记录里既没有 `@@ -` 头，也没有 `oldStart`。

### 14.3 补丁做了什么（两个补丁，一数据一渲染）

行号要同时穿过**数据**与**渲染**两段，缺一段都看不到东西。所以有两个独立补丁文件：

| # | 补丁文件 | 目标 member | 作用 | 脆弱度 |
| --- | --- | --- | --- | --- |
| 1 | `patches/dsh-tool-fs-hunk-lines.patch` | `dsh-tool-fs/lib/index.js`、`dsh-client-ui-tool/lib/client.js` | 把 `oldStart`/`newStart` 带进 `meta.diffs` | 低（未压缩 `lib/`） |
| 2 | `patches/dsh-web-frontend-diff-start.patch` | `dsh-web-frontend/dist/assets/index-CN7NIWNw.js` | 把行号写到 hunk 首行的 DOM 属性上 | **高（压缩产物）** |

**补丁 1（数据）** 在上述四处同时放开：

- `computeHunkDiffs()` 追加 `oldStart: hunk.oldStart`、`newStart: hunk.newStart`（1-based）；
- 两个 `presentationMeta` 投影把两个字段透传；
- `isFileDiff()` 与 `narrowDiffs()` 把两个字段当**可选数字**：缺省合法（老会话、未落定的调用照样能回放），
  出现则必须是 `Number.isInteger(n) && n >= 0`，否则按原有的「malformed」路径拒绝。

**补丁 2（渲染）** 只改 `DiffBlock` 的行构建，两处：

- `gF(diffs)` 给每个 hunk 的**第一行**挂上 `start = {newStart, oldStart}`；
  算式是 `i.newStart + s.newStart - 1`——`X_(i)` 会把 hunk 自己的文本再 diff 一遍，
  那段文本已经是文件的切片，所以 jsdiff 从 1 重新编号，必须加上 hunk 在文件中的起点。
  数字**全部来自补丁 1**，不重新从文件算。
- 行渲染（`F.map` / `D.map` 两个切片）把 `start` 写成 `data-diff-new-start` / `data-diff-old-start`。

**为什么用属性而不是行字段（通道 a 不可行）**：行对象只有 `{kind, text}`，渲染处只 spread
`{className, children}`，下游没有任何 `start`/`lineNumber` 字段可挂。属性是唯一出口。

**为什么挂在 hunk 首行而不是 body**：`diffnumbers.js` 只在「整张卡片是一段连续行」时才走 body 模式；
任何多 hunk 卡片中间都有 `⋯` 分隔符，会走 row 模式，而 row 模式要求**每一段**首行自带起点。
挂 body 会让单 hunk 卡片亮起来、多 hunk 卡片仍旧 1..n——恰恰是用户最容易注意到的情况。

两个补丁都打在**装好的 asar 里的打包产物**上（不是上游包源码），因为仓库里没有 `app.asar` 的解包副本。
`apply` 前会整包备份成 `app.asar.bak-<epochms>`，且**不会**重签名任何东西（归档本身没有签名）。

### 14.4 客户端拿到 `newStart` / `oldStart` 之后要做什么

1. **行号从 hunk 头开始数，不从 1 开始。** 维护两个游标：删除侧 `oldStart`、新增侧 `newStart`；
   按行序走，`context` 行两侧同时 +1，`del` 行打印 `old+` 再自增，`add` 行打印 `new+` 再自增。
   拿 `newStart` 去加「行在数组里的下标」是错的——中间隔着删除行时右侧会漂。
2. **先算全量行号，再裁剪。** DSH 的卡片默认只显示 16 行并可展开（`.work` 里实测的 `yF()`），
   行号必须在 `slice()` 之前算完，否则展开后编号对不上。
3. **两个字段都可能缺。** 老会话（本次补丁之前录的）以及工具调用未落定时的参数推导 diff 都没有数字；
   此时按旧行为退回 1..n，不要显示 `NaN`，也不要因此拒绝整个 hunk。补丁 2 在缺省时**不写属性**，
   正是为了把「不知道」交回给主题的 1..n 计数。
4. **纯插入的 hunk `oldText === null`。** 这类 hunk 只有 `newStart` 可用来编号删除侧；
   删除侧那一列要么留空，要么显示 `newStart - 1` 之外的占位，不要伪造 `oldStart`。
5. **点击行号跳转用哪一个**：`add`/`context` 行 → `newStart` 侧；`del` 行 → `oldStart` 侧。
   文件已经改成新版本，所以「打开文件到某行」只对新增侧有意义，删除侧只能定位到附近。

### 14.5 怎么确认装上的版本已经带上字段

```sh
node tools/patch-asar.mjs status              # 全部补丁
node tools/patch-asar.mjs status --patch diff-start-attrs   # 只看一个
```

`status` 逐补丁、逐目标打印状态。除了 `PATCHED` / `unpatched`，还有两个状态值得认识：

- **`SKIPPED (anchors do not match this build)`**：补丁 2 的目标文本在这个版本里已经变了
  （压缩产物的常态）。这是**设计好的安全失败**——`apply` 会略过它并照常装补丁 1，两者互不阻塞。
  要用 `--patch diff-start-attrs` 显式点名时才会硬失败，并打印它期望的原文。
- **`PARTIAL`**：某补丁只装了一半（有人手改过归档）。`apply` 不会自动「修复」，只会要求先 revert。

全部 `PATCHED` 之后**重启应用**（归档在进程启动时读取，改完不重启仍是旧代码）。
只验证补丁、不动安装的方式：

```sh
node .work/verify-patch.mjs            # 补丁 1：git apply --check / node --check / 两 hunk 模拟
node .work/verify-frontend-patch.mjs   # 补丁 2：行对象是否拿到 start（含 legacy 与多 hunk）
node .work/verify-frontend-dom.mjs     # 补丁 2：属性是否真的写进 DOM props（含反例）
node .work/verify-frontend-syntax.mjs  # 补丁 2：整个 940 KB 产物仍能解析、行数不变
```

**升级应用之后**：先跑 `status`。补丁 2 变成 `SKIPPED` 是预期行为，需要按新的压缩产物重新取出锚点；
在此之前主题会一直用 1..n 计数，不会显示错的行号。


