# 工具卡片逆向 · Read（文件阅读）

> **性质**：新增的独立条目。补参考仓库 `.reference/open-claude-ui` 未覆盖的一块 ——
> Read 工具卡片（读文件）的渲染链路、行号真相、图片/PDF、附件胶囊、排版度量。
>
> **版本**：本机 Claude Desktop **2.42304.2**（参考仓库针对 v2.37337.1）。
>
> **四个必须先知道的结论**（会改变你对其它文档的解读）：
> 1. **Read 没有专用组件**，复用「文件工具卡片」`vU/_U`（`cc1aae219:13826-13904`），按 `action` 分派；
>    `read|view|open_file|grep|glob` 全归为 `action:"read"`。
> 2. **Read 结果没有行号 gutter**。内容是 `pre>code` + shiki 高亮。用户看到的 `1→` 行号来自**工具返回的文本本身**。
> 3. **`lineOffset` 与 Read 无关**，整仓只有 diff 虚拟滚动锚点与 markdown 评论两处用它。
> 4. **`epitaxy-file-snippet-inert` 不是 CSS 类**，是 React Query 的 queryKey 哨兵数组（`c2fd10b8d:3298`）。
>
> **字号双轨提醒（与 `typography-cross-check.md` §5 的关系）**：
> Read 卡片正文用的是 Tailwind 原生 **`text-xs`(12px)/`text-sm`(14px)**，**不是** `text-code` 令牌。
> 而 `--cds-font-size-code` 在 comfortable 下是 **13px**。
> 两套机制并存 —— 文中出现的 12px 是 `text-xs` 的字面值，**不是** `--cds-font-size-code` 的值。两者都不错，只是不同的东西。
>
> **证据约定**：`<chunk>.pretty.js:N` 指 `C:\Users\17445\Desktop\rea\claude-ui-re\pretty\` 下格式化后的行号。

---
## 范围

Read 工具卡片 + 读取类结果呈现（文件内容 / 行号 / 图片 / PDF / 附件）。

逆向对象：Claude Desktop 2.42304.2，`ion-dist/assets/v1/*.js` + `*.css`。
约定：**确证**＝源码里直接读到的；**推断**＝依据相邻关系/命名推测，已标注。

## 0. 结论先行（10 条）

1. **Read 卡片没有专用组件**。它复用「文件工具卡片」`vU/_U`，按 `action` 分派：`read | view | open_file | grep | glob` 都归为 `action: "read"`（确证：`cc1aae219:16935`）。
2. 头部文案模板：**`Read {fileName}` / `Reading {fileName}`**（i18n id `sUFFaC9x7r` / `9fXfauBZpW`），文件名取 `file_path` 的 basename，**不含 offset/limit/pages**（确证：`cc1aae219:13806-13809`，`Tg` 白名单只含 `file_path|path|display_file_path|display_file_name`，`cc1aae219:7288`）。
3. 读到内容**不是**带行号的代码块：是 `pre>code` + **shiki 语法高亮**，`max-h-[150px]` 可滚动，**无行号 gutter**（确证：`cc1aae219:13883-13901` + `c62cd56ac:19-50`，`showLineNumbers` 默认 `!1`）。
4. 玩家看到的「1→/1\t」行号**来自工具返回文本本身**，不是 UI 生成的（确证：真实 transcript `content: "1\t/**\n2\t * ..."`，而 `toolUseResult.file.content` 无行号）。
5. 语法高亮走 **shiki**，主线程优先、Web Worker 兜底（`highlightWorker`），worker 启动 8s 视为慢、60s 上限、失败退避 30s/120s/300s，最终回落到页内增量 tokenizer 或纯 `<pre>`（确证：`shared-10:2096-2098`、`shared-10:2111-2165`、`shared-10:4301-4357`）。
6. `truncated` 只有一行提示 **"Output truncated"**（id `KDzvNnJI+J`），`data-testid="tool-body-truncated-note"`，**没有「展开全文」按钮**（确证：`cc9e4071f:4-11`，5 处调用点均为裸 `<Dw/>`）。
7. `lineOffset` **与 Read 无关**：它只出现在 diff 虚拟滚动的滚动锚点里（`{lineIndex,lineOffset,fileElement,fileOffset,fileTypeOffset}`，`c64baa838:4130-4186`）和 markdown 评论的 `bodyLineOffset`（`c088df2d1:457`）。
8. Read 一个 png → 结果里是**内联 `<img>`**（`max-w-md` = 448px，`rounded-md`），**不是** `tool-image-thumbnail` 那枚 36×28 缩略图；缩略图是 computer-use 截图的专用组件（确证：`cc1aae219:17451-17472` vs `13160-13205`）。
9. PDF 在 UI 层**不暴露 pages 参数**。`pages` 只出现在产物/附件分页语义（`Page {page} of {total}` 属 DataTable 分页），Read 卡片只渲染 `file_path` 摘要（确证：`cc1aae219:7288`、`shared-104:14923`）。
10. 读取失败的展示分三套：卡片标签 `Failed to read {fileName}`（`sY6b1IqyXe`）、预览兜底页 `Preview isn't available for this file`、以及会话级 `This session's file couldn't be read just now. Try again in a moment.`（`MtSkAgGN+h`）。

---

## 1. 渲染链路总览

### 1.1 三个平行入口（同一份数据，三套 UI）

| 入口 | chunk | 形态 | 证据 |
| --- | --- | --- | --- |
| 主聊天 transcript（timeline 行） | `cc1aae219-Bd1YvDXP.js` | `XH`(tool row) + `vU`(file cell) | `cc1aae219:13528`、`13826` |
| 新式 timeline cell（`XG`） | `cc1aae219-Bd1YvDXP.js` | 自绘 label + 内联代码 | `cc1aae219:16879` |
| Hub / 精简 transcript | `c52b02f3f-BUL_S2rP.js` | verb + meta（`Read` / file_path） | `c52b02f3f:900-907` |

三者的证据前缀一致：**verb 表 + 文件名 basename**，差别只在排版密度。

### 1.2 组件树（主聊天路径，确证）

```
<div class="rounded-[var(--msg-block-radius,0.5rem)] border-[0.5px] flex flex-col font-sans
            leading-normal my-3 border-border-300 hover:bg-bg-200 …">   ← YH 外壳, cc1aae219:13528-13538
├─ <button data-testid="tool-row-header">                              ← 13497-13510
│  ├─ <div class="… w-[20px] flex justify-center …">{icon}</div>        ← 时间线图标槽, 13258-13265
│  ├─ <div class="flex items-center gap-1 min-w-0 text-body text-start text-muted">
│  │  ├─ <span class="truncate min-w-0">Read foo.ts</span>              ← 13429-13436
│  │  └─ <span data-testid="tool-row-caret">{CaretDown}</span>          ← 13441-13450
│  └─ <div class="… gap-1.5 shrink-0">{secondaryText}</div>             ← 13456-13462
└─ children（展开区）
   ├─ <div class="border-[0.5px] border-border-300 rounded-xl mx-2.5 mt-1 mb-2
                   overflow-hidden bg-bg-000/30">                       ← 13886-13901
   │  └─ <Ow class="max-h-[150px] overflow-y-auto">                     ← 13890-13891
   │     └─ <ZG> → <Pw …> → <pre><code>(shiki spans)</code></pre>
   └─ （可选）<Dw data-testid="tool-body-truncated-note">Output truncated</Dw>
```

另一种（更常见于已存在会话的）展开壳是 `JH`：
`mx-2.5 mt-1 mb-2 rounded-lg border-[0.5px] border-border-300 bg-bg-000`，内层
`flex flex-col gap-2` + `[&_code]:!text-xs [&_pre]:!text-xs` + `max-h-[200px] overflow-y-auto`（宽屏时 `max-h-[4000px]`），`p-2`（`cc1aae219:13319-13341`）。

---

## 2. Q1 · Read 卡片头部：文案模板与参数展示

### 2.1 工具名归一化（确证）

```js
// c05b96c7f-DdfnpDBP.pretty.js:1010-1020
var fc = new Set(["create_file","open_file","update_file","view","read","write","edit","str_replace","str_replace_editor"]);
function pc(e) { return fc.has(e); }
```

```js
// c05b96c7f:7306-7328  —— 动词标签分派
function Pg(e, t) {
  if (!(t.startsWith("mcp__") || kr(t) !== t))
    switch (hr(t)) {
      case "read": case "view": case "open_file":
        return e.formatMessage({ defaultMessage: "Read", id: "ROUleDAJXx" });
      case "write": case "create_file":
        return e.formatMessage({ defaultMessage: "Created", id: "ETH2uhuxAQ" });
      case "edit": case "multi_edit": …
        return e.formatMessage({ defaultMessage: "Edited", id: "WpAhsDj0T5" });
      case "send_user_file":
        return e.formatMessage({ defaultMessage: "Shared", id: "rquQXFjeYX" });
    }
}
```

### 2.2 文件路径 → 显示名（确证）

```js
// c05b96c7f:7286-7304
var Cg = ["query","url","title","skill"],  wg = ["title","query","url","skill"],
    Tg = ["file_path","path","display_file_path","display_file_name"],   // ← 注意：无 offset/limit/pages
    Eg = /[/\\]+$/, Dg = /[/\\]/;
function Og(e) { return e.replace(Eg, "").split(Dg).pop() ?? ""; }   // basename
var Mg = /^(.+)\.md$/;
function Ng(e) { let t = Og(e).replace(Mg, "$1"); return t === "" ? e : t; }   // .md 去后缀
```

### 2.3 文案模板（确证）

```js
// cc1aae219:13800-13825
function gU(e, t, n, r) {           // e=action, t=fileName, n=streaming
  switch (e) {
    case "read":
      return n
        ? r.formatMessage({ defaultMessage: "Reading {fileName}", id: "9fXfauBZpW" }, { fileName: t })
        : r.formatMessage({ defaultMessage: "Read {fileName}",     id: "sUFFaC9x7r" }, { fileName: t });
    …
  }
}
```

动作判定（`cc1aae219:16935-16941`）：

```js
: ["open_file","view","read","grep","glob"].includes(n)
    ? ((I = "read"),
       j && (!F || g || _) && !R
         ? (R = fv(h, P ? "search" : "read", { streaming: r, isError: g, stopped: _ }))
         : _ && !r
           ? (R ||= h.formatMessage({ defaultMessage: "Stopped reading {file}", id: "vCoZGHhsFN" }, { file: N }))
           : g && !r && !R && (R = h.formatMessage(LW.read, { fileName: N })))
```

其中 `LW.read = "Failed to read {fileName}"`（id `sY6b1IqyXe`，`cc1aae219:15859`），
`P = j && !/\.md$/i.test(x)` → `.md` 之外走 `"search"` 分支（`cc1aae219:16913`）。

### 2.4 Hub 路径的第二套模板（确证）

```js
// c52b02f3f:900-907
case "Read":
  return {
    verb:        e.formatMessage({ defaultMessage: "Read",              id: "filwqDWORF" }),
    runningVerb: e.formatMessage({ defaultMessage: "Reading",           id: "MOK/yKIpYX" }),
    meta:        X(a("file_path")),
    failedVerb:  e.formatMessage({ defaultMessage: "Failed to read",    id: "ov1s7+MDus" }),
    kind:        c,      // an("Read") === "file"，c52b02f3f:656-657
  };
```

流式状态文案另有整套（`c8af22d2e:165-186`）：

```
Read          + file → "Reading {fileName}…"   id: tc8YhXcfsS
Read（无 file）      → "Reading a file…"        id: XFlgOIsY67
```

### 2.5 参数展示

- **file_path**：只取 basename（`Og()`），完整路径进 `title` 属性与 `tooltip`。
- **offset / limit**：UI 层**完全不出现**。全仓库 `"offset"` 键命中的 Read 相关 chunk 均属文件预览/编辑器（`c148e7537` codemirror、`c30db9bec` 等），Read 卡片路径没有读取 `input.offset`。
- **pages**：同上，`Tg` 白名单无 `pages`；`pages` 在 `cc1aae219` 里只出现在 `pagesChipArtifactIds`（页面产物 chip）与 MCP 分页数据。
- **「第 N–M 行」标注：不存在。** 唯一近似物是评论/差异场景的 `Lines {start}–{end}`（id `LkSZyjr77o`，`c82eca2bd:637-641`）与 `Line {line}`（`qtx2KQoFxt`），属 diff 评审，不属 Read。

> **推断**：Read 的 `offset/limit` 只体现在「返回文本从第 N 行开始」这一事实里（后端把起始行号写进文本），UI 不做二次解析。依据：`_U`/`XG` 全程只用 `v.file_path`、`v.content`、`v.display_file_name`、`v.description`（`cc1aae219:16899-16917`）。

---

## 3. Q2 · 文件内容如何渲染

### 3.1 内容来源与展示阈值（确证）

```js
// cc1aae219:16899-16901
let b = v?.file_path || v?.path || "";
let x = typeof b == "string" ? b : "";
let S = v?.content || v?.file_text || "";     // ← input 里的 content（写入类工具才有）
```

```js
// cc1aae219:13854（_U 内）
let E = !!n && !c;       // n = fileText, c = isComplete
…
e !== "create" && e !== "edit" && E &&
  y("div", { className: "overflow-hidden", children:
    y("div", { className: "border-[0.5px] border-border-300 rounded-xl mx-2.5 mt-1 mb-2 overflow-hidden bg-bg-000/30",
      children: y(Ow, { className: "max-h-[150px] overflow-y-auto", noDefaultScroll: !s,
        children: h ? h(n, C) : y("pre", { className: "p-3 text-sm text-text-300 whitespace-pre-wrap overflow-x-auto",
                                        children: y("code", { children: n }) }) }) }) })
```

- 折叠阈值：**150px**（`max-h-[150px]`），`Ow` = 自动贴底的滚动容器（`c601a232b:60-75`，`scrollToBottomIfPinned`，阈值 `scrollHeight - 8`）。
- `renderCode` 由外层注入：`renderCode: (e, t) => y(ZG, { code: e, language: t })`（`cc1aae219:17029`）。

### 3.2 语言推断（确证）

```js
// cc1aae219:13751-13788
var pU = { js:"javascript", jsx:"javascript", ts:"typescript", tsx:"typescript", py:"python", rb:"ruby",
           java:"java", c:"c", cpp:"cpp", h:"c", hpp:"cpp", cs:"csharp", go:"go", rs:"rust", php:"php",
           swift:"swift", kt:"kotlin", scala:"scala", html:"html", css:"css", scss:"scss", less:"less",
           json:"json", xml:"xml", yaml:"yaml", yml:"yaml", md:"markdown", sql:"sql", sh:"bash",
           bash:"bash", zsh:"bash", ps1:"powershell", dockerfile:"dockerfile" };
function mU(e) { return pU[e.split(".").pop()?.toLowerCase() || ""] || "text"; }
```

### 3.3 高亮组件（确证）

```js
// cc1aae219:17033-17039
function ZG({ code: e, language: t }) {
  let n = Px();                     // 是否 hub/紧凑密度
  return y("div", { className: n ? void 0 : "[&_pre]:!text-xs [&_code]:!text-xs",
    children: y(Pw, { language: t, code: e, className: "!bg-surface-3",
                      codeTagClassName: "[unicode-bidi:plaintext]" }) });
}
```

`Pw` = `c62cd56ac-BM3qknKn.js` 的 `t`（`cc1aae219:1353`），核心：

```js
// c62cd56ac:19-50
function g({ bare = !1, className: p, code: m, codeTagProps: g, codeTagClassName: v, language: y, title: b }) {
  let { exceedsSizeLimit: x } = c(m);          // c = shared-10 的 Uu/Hu
  let w = n(() => f(m), [m]);                  // 语言注册
  let T = i("code-block__code !my-0 !p-0 !rounded-none break-words",
            C ? "!text-code" : "!text-sm !leading-relaxed");
  return e("div", { className: i(r ? "flex flex-col"
                                  : ["flex flex-col gap-3 bg-surface-1 rounded-md", S ? [s, "py-3"] : "p-3"], p),
    children: [
      !r && t(_, { language: y, title: b, oneSize: C }),        // 语言/标题条 h-3
      x ? t(u, { code: m, codeClassName: i(T, v, "[direction:ltr]") })   // 超限：纯 <pre>
        : t("div", { dir: "ltr", className: "contents",
            children: w ? t(h, { code: m, className: T, … })               // 无语言：逐行 span
                        : t(l, { className: T, codeTagProps: g, codeTagClassName: v, language: y,
                                 PreTag: "div", wrapLongLines: !0, streamRenderTelemetry: "tool_cell",
                                 children: m }) })                        // shiki 高亮
    ] });
}
```

### 3.4 高亮执行链路（确证）

```
Pw → shared-10 `Bu`(line 4287) ──┬─ 页内：createHighlighterCore({themes:[light,dark], langs:[], engine})
                                 │        + codeToTokensBase(…, { tokenizeTimeLimit: 2000 })
                                 └─ worker：`fs()`(shared-10:2111) 启动 highlightWorker
                                          · 8s 未就绪 → "slow-start"（shared-10:2096 `Lo = 8e3`）
                                          · 60s 未就绪 → terminate + 降级（`Ro = 6e4`）
                                          · 构造失败退避 [30s, 12e4, 3e5]（`Bo`）
                                          · 埋点事件 `chat.highlight_worker_boot`（shared-10:2160）
```

- 渲染引擎标识：`formatter: "shiki"`、`engine: "worker" | "incremental"`、`text_repr`、`two_byte_lines`（`shared-10:4342-4362`）。
- 语法 `grammar` 名：`_u(lang)`；plain 回退原因串：`"grammar_import_failed" | "lang_plain"`（`shared-10:4323`）。
- 失败降级顺序：worker → 页内增量 → 纯文本（`shared-10:4319`、`4457-4482`）。

### 3.5 `epitaxy-document-*` 是否相关？

**不是 Read 卡片的类。** 它们属于「文档阅读器」（打开 .md/.txt/文档预览时的整页阅读模式）：

| 类 | 用途 | 证据 |
| --- | --- | --- |
| `epitaxy-document-page` | 文档滚动页容器 + 字号变量作用域 | `c3fde7009:487-493`；CSS `.epitaxy-document-page{--document-body:…}` |
| `epitaxy-document-column` | 版心（`max-width:var(--document-measure,34rem)`） | `c3fde7009:480-486` |
| `epitaxy-document-prose` | 正文排版根（serif 可选） | `c3fde7009:499-511` |
| `epitaxy-document-plaintext` / `-line` / `-lead` | **纯文本模式**逐行渲染（悬挂缩进、等宽探测） | `c3fde7009:512-556` |
| `epitaxy-document-source` | 文档「源码」视图（CodeMirror 容器） | `c3fde7009:500`；CSS 改 `--cds-font-size-code` |
| `epitaxy-file-prose` / `-chunk` | 文件预览的 markdown 正文块 | `c3fde7009:2607`、`2723` |

`tailwind` 那一行 `[data-mono]` 是「疑似等宽行」探测结果（表格、ASCII 图）：`pn` 正则命中 `│─┌`、`| a | b |`、`+---+`、多空格对齐（`c3fde7009:557-570`）。

---

## 4. Q3 · 行号渲染

### 4.1 结论

| 场景 | 行号 | 证据 |
| --- | --- | --- |
| Read 工具卡片的文件内容 | **无 gutter**，行号在返回文本里 | `c62cd56ac:19-50`（无 `showLineNumbers`） |
| 文件预览/编辑器（.ts 等） | CodeMirror 行号槽 | `c148e7537:166484` `.cm-lineNumbers .cm-gutterElement{padding:0 3px 0 5px;minWidth:20px;textAlign:right}` |
| diff 视图 | 双列行号（old/new） | `c5dc59ef8:309-324` |
| 文档纯文本模式 | 无行号，用 `data-ck-s/e` 字节偏移 | `c3fde7009:532-538` |

### 4.2 Read 结果文本里行号的真实形态（确证）

真实 transcript（`C:\Users\17445\.claude\projects\...\ed2249d7….jsonl`）：

```json
{"type":"tool_result","content":"1\t/**\n2\t * The browser half of `@hwfee/dsh-genui`.\n3\t *\n4\t * It registers one occupant …"}
{"toolUseResult":{"type":"text","file":{"filePath":"…index.js","content":"/**\n * The browser half of …"}}}
```

即：**`{行号}\t{该行原文}`**，行号是后端注入的文本；`toolUseResult.file.content` 保留无行号原文。Read 卡片渲染的是前者（`v.content` 若存在才渲染；对纯 Read，`input` 无 `content`，内容来自 tool_result 的 text block）。

> 因此「行号可点击/可复制」= **不可点击，但可被文本选中复制**（纯 `<code>` 文本，`select-text` 由外层继承）。UI 没有为行号设 `user-select:none`（对比：真行号 gutter 是 `user-select:none`）。

### 4.3 `lineOffset` 的真实归属（确证）

```js
// c64baa838:4130-4147  —— 只做滚动锚点补偿
scrollFix(e) {
  let { lineIndex: n, lineOffset: r, fileElement: i, fileOffset: a, fileTypeOffset: o } = e;
  if (n != null && r != null) {
    let e = i.shadowRoot?.querySelector(`[data-line][data-line-index="${n}"]`);
    if (Qt(e)) { let n = Q(e, t); if (n !== r) this.applyScrollFix(n - r); return; }
  }
  …
}
// c64baa838:4165-4186  getScrollAnchor 里做「谁更靠上」比较
```

另一处 `lineOffset`（`c088df2d1:457/464/472`）是 `bodyLineOffset` = frontmatter 占用的行数，用于把 markdown 评论锚到正文真实行号：

```js
bodyLineOffset: u.slice(0, u.length - t.length).split(`\n`).length - 1,
…
D = h((e) => yr(e, { filename: c, source: x, lineOffset: S }), [c, x, S]),
```

### 4.4 真行号 gutter 的度量（diff 路径，供对照，确证）

```js
// c5dc59ef8:309-324
X = f(function ({ num: e, isOld: t, charWidth: n, diffView: r, lineType: i }) {
    let a = e?.toString().padStart(n, " ") || " ".repeat(n);
    let s = `${n * 0.6 + 0.5}rem`;                       // 宽度 = 位数×0.6 + 0.5 rem
    return o("span", {
      className: h("flex items-start justify-end select-none pe-2 font-mono-ui text-xs",
                   r ? "ps-4" : "ps-1", V(i), !t && "border-e border-border-400"),
      style: { minHeight: "1.375rem", lineHeight: "1.375rem", width: s },
      "data-line-number": e || "", … });
});
```

- 宽度：`(位数 × 0.6 + 0.5)rem`，**不是 `ch` 单位**；右对齐用 `justify-end` + `padStart` 空格。
- 行号 `select-none`；`data-line-number` 供 `::after` 复制/打印。

---

## 5. Q4 · truncated

### 5.1 组件全文（确证）

```js
// cc9e4071f-COsmd4CO.pretty.js:4-11
var a = t(({ isError: t = !1 }) => {
  let a = i();                     // 是否紧凑密度
  return e("p", {
    "data-testid": "tool-body-truncated-note",
    className: n("px-1 pt-1.5", a ? "text-footnote" : "text-caption", t ? "text-danger" : "text-muted"),
    children: e(r, { defaultMessage: "Output truncated", id: "KDzvNnJI+J" }),
  });
});
```

- i18n：`"KDzvNnJI+J": "Output truncated"`（`i18n/en-US.json:12272`）。
- 位置：结果内容块**之后**、容器内尾部（`px-1 pt-1.5`）。
- 5 个调用点：Bash 输出（`cc1aae219:13671`）、通用结果（`16707`）、legacy 结果（`17476`）、hub 结果（`17947`）、错误折叠区（`18180`）。
- 颜色：正常 `text-muted`，错误 `text-danger`；`text-danger` → `var(--cds-text-danger)`（`c6a992d55…css:465373`）。

### 5.2 判定与阈值

- **是否截断由后端字段 `is_truncated` 决定**，UI 不算阈值（确证：`t?.is_truncated` 直接透传）。
- UI 侧有**三个独立阈值**，别混：

| 常量 | 值 | 含义 | 证据 |
| --- | --- | --- | --- |
| `Vu` | `204800`（200 KiB） | 代码块超此大小 → 放弃高亮，直接纯 `<pre>` | `shared-10:4410-4418` |
| `Sc` | `2e4`（20000 chars） | 单段超过则不尝试结构化角色识别 | `c05b96c7f:1069` |
| `IG` | `200` chars | 结果文本「一行化摘要」字面上限 | `cc1aae219:16440` |
| 131072 | 128 KiB | 文档纯文本模式超过则不逐行分块，整块 `<div>` | `c3fde7009:513` |
| `2e3` | 2000 chars | 结果文本多行摘要上限 | `cc1aae219:17736` |

- **没有「展开全文」**。截断提示是纯文本 `p`，无按钮、无超链接、无 `onClick`（确证：整个 `cc9e4071f` 只有 11 行）。

### 5.3 相邻的第二套截断提示（参数侧，确证）

```js
// c3b2e82df:620-622
"data-testid": "tool-param-truncated-note",
children: t(d, { defaultMessage: "Too long to show in full", id: "gqXzlTe+X+" }),
```

用于工具**入参**值过长（渲染为 `truncated: true` 的 row），Read 的 `file_path` 一般不会触发。

---

## 6. Q5 · 图片读取

### 6.1 Read 一个 png → 内联 `<img>`（确证）

```js
// cc1aae219:17451-17472  （通用 tool_result → image 分支）
if (r.type === "image") {
  if (e.anyConsentPromptLive)
    return y("div", { className: "rounded bg-surface-1 p-sm text-caption text-muted-as-secondary",
      children: y(Z, { defaultMessage: "1 image attachment. View in transcript.", id: "J0gPXurIQI" }) });
  let t = kS(jS({ content: [r] }), o);
  return t ? y("img", { src: t, alt: e.intl.formatMessage({ defaultMessage: "Tool result", id: "OJmR+3dTK6" }),
                        className: "max-w-md max-h-md h-auto rounded-md" }) : null;
}
```

- `max-w-md` = `--container-md` = **28rem = 448px**（`c6a992d55…css` `.max-w-md{max-width:var(--container-md)}`，`--container-md:28rem`）。
- `max-h-md` **在样式表里不存在**（全量检索 26 个 CSS 无 `.max-h-md` 规则）→ 实际无高度上限，靠 `h-auto` 保持比例。**确证**（缺失本身即证据）。
- `rounded-md` = `--radius-md` = 0.375rem = **6px**。
- 无 lightbox、无点击放大：该 `<img>` 没有 `onClick`/`cursor-zoom-in`。

### 6.2 `tool-image-thumbnail`（确证，注意：不是 Read 用的）

```js
// cc1aae219:13160-13205
function NH({ dataUrl: e, className: t = "", coordinates: n, onClick: r }) {
  …
  return m("button", {
    "data-testid": "tool-image-thumbnail",
    onClick: (e) => { e.stopPropagation(), r?.(e); },
    className: `relative flex-shrink-0 w-9 h-7 rounded border border-border-300
                hover:border-border-200 hover:rotate-2
                transition-[border-color,box-shadow,rotate,transform,outline-color]
                duration-150 ease-out hover:shadow-sm overflow-hidden ${t}`,
    title: i.formatMessage({ defaultMessage: "Click to view full screenshot", id: "LWiiXht89U" }),
    children: [
      y("img", { src: e, alt: i.formatMessage({ defaultMessage: "Screenshot thumbnail", id: "/oSRHC9/hb" }),
                 className: "w-full h-full object-cover", loading: "lazy", decoding: "async" }),
      n && y("div", { className: "absolute pointer-events-none rounded-full border border-brand-100
                                   w-1.5 h-1.5 bg-brand-100",
                      style: { left: `${n[0] * o}px`, top: `${n[1] * o}px`, transform: "translate(-50%,-50%)" } }),
    ] });
}
```

- 尺寸：`w-9` = 2.25rem = **36px**；`h-7` = 1.75rem = **28px**（`--spacing:.25rem`）。
- 圆角 `rounded` = `var(--cds-radius)` = 0.375rem = 6px（`.cds-root` 作用域）。
- hover：`rotate-2`（2°）、`border-border-200` = `--cds-border-strong`、`shadow-sm`、150ms `ease-out`。
- 坐标红点：1.5×1.5 = **6px** 圆点，品牌色 `--cds-brand-100`，`translate(-50%,-50%)` 居中在点击点。
- 使用方：computer-use / 截图类工具（`cc1aae219:18083`、`18131`），Read 不经过它。

### 6.3 真 lightbox 的落点（确证 + 一处推断）

- 打开入口：附件区 `openImageLightbox`（`c2fd10b8d:1521-1538`，`Hs()` 把 `{src, fullSrc, fileName, path, width, height, onOpen: () => n(i), registerThumbnail}` 交给 tile）。
- 查看器本体：`c0fbbe82d` 里的 `st`（props `{src, alt, isOpen, originRef, onClose, onAnnotate}`，`c0fbbe82d:53246` 附近）。
- 缩放：`c593ecc90` `image-zoom-viewport` —— `overflow-auto` 视口 + `data-testid="image-zoom-viewport"`，缩放 **1×–8×**、`Ctrl/⌘+wheel` 指数缩放（`Math.exp(-deltaY * 16 * 0.01)`）、按钮 `1.5×` 步进、`--cds-dur-base` 动画、ResizeObserver 自动归位（`c593ecc90:1-140`）。
- 缩放预设：`[10,25,50,75,100,150,200,400,800]` 百分比（`c6d62edc5:15`），`data-testid="file-preview-zoom-control"`。

> **推断**：Read 一个图片文件（走文件预览面板）时，走 6.3 的 viewer；而 Read 结果里的 image block 走 6.1 的内联 `<img>`，两者无交集。依据：6.1 的 `<img>` 无任何点击 handler，6.3 的入口只挂在附件/文件预览侧。

---

## 7. Q6 · PDF

### 7.1 Read 卡片的 PDF 路径

- **`pages` 参数不上 UI**（第 2.5 节已证）。
- Read 命中 `pdf` 时，结果通常是**文本**（"PDF converted to text"，`A/pPpSVBy1`），仍走第 3 节的代码块渲染（`language: "text"`，`mU("a.pdf")` → `pU["pdf"]` 未定义 → `"text"`，`cc1aae219:13786-13788`）。

### 7.2 文件预览面板的 PDF 分支（确证）

```js
// shared-104-A_oIUFQK.pretty.js:14291 / 14923 / 14935
(e.Pdf = "application/pdf"),
…
p = r === Q.Pdf,
x = u || l || d || f || p || y || b || h || g,          // isRichType
T = i ? "image" : o ? "audio" : s ? "video" : a || c ? "nonrenderable"
  : x ? "rich" : w ? "code" : "nonrenderable",          // displayFileType
```

- `pdf` 被归为 **`displayFileType: "rich"`**，`isPdf: true`、`showViewToggle: true`（有 rich/plaintext 双视图，`isRichTypeWithPlaintext`）。
- 渲染落点：`file-sandboxed-preview` 容器（`cd2efac6e:4844`），内层是通用文档渲染器 `mn`（`content: X.content, type: X.mime`），即**内嵌文档视图**，不是转图、也不是逐页 `<img>`。
- 与 PDF 同类的还有 `Svg/Html/React/Mermaid/Csv/Tsv/Office/Spreadsheet`（`shared-104:14931-14935`）。

> **推断（依据命名 + 容器）**：桌面端 PDF 预览由内嵌 web 文档渲染器（浏览器内置 PDF viewer）承载；仓库内未发现 `pdfjs-dist` 被 UI 直接调用（检索 `pdfjs`/`getDocument` 命中均在 monaco/编辑器域）。

### 7.3 PDF 失败文案（确证，来自主进程侧分类 + i18n）

```
"RwOTBW8K0I": "PDF is password protected"
主进程分类：n.includes("PDF is password protected") || "PDF file was not valid" || "PDF too large"
        → { category: "pdf_input_error" }            （asar/.vite/build/index.chunk-BkirSAUO.js:2033781 附近）
```

上传侧页数限制（不属于 Read，但同源）：

```
"2PLaXYE1kl": "Upload a PDF over {max, plural, one {# page} other {# pages}}?"
"DQ3I7wTP/5": "“{fileName}” has {total, plural, one {# page} other {# pages}}, over the {max, number}-page limit. …"
"E9LhNzcdWG": "{count, plural, =1 {“{fileName}” has too many pages. Split it into smaller PDFs and add them again.} …"
"16D+zD3nOc": "This session has reached the {max}-image limit (including PDF pages). …"
```

`Page {page} of {total}`（`Alf4gQW8kH`）属 **DataTable 分页**（`shared-104:52387` 上下文是 tablePagination/previousPage/nextPage），与 PDF 页无关。

---

## 8. Q7 · 附件 / 文件胶囊

### 8.1 容器与结构（确证）

```js
// c2fd10b8d:1491
var Is = `epitaxy-user-attachments flex flex-wrap max-w-full ${rs}`,   // rs = "[.epitaxy-user-turn_&]:justify-end"
```

- `.epitaxy-user-attachments` **没有专属 CSS 规则**（26 个 CSS 全检索无命中）——纯 Tailwind 组合类。

树（用户消息里的附件区）：

```
<div class="epitaxy-user-attachments flex flex-wrap max-w-full [.epitaxy-user-turn_&]:justify-end">
├─ <li role="listitem" class="flex max-w-full items-center gap-1.25">        ← rc(), c2fd10b8d:2042-2044
│  └─ <oc file channelAttachment siblings>                                  ← 文件胶囊（可点击打开）
├─ <li role="listitem" class="… vs" title=…>                                ← ec(), 2021-2023
│  └─ <$s fileName>  →  <span class="inline-flex h-[24px] min-w-[24px] … rounded-sm bg-alpha-2 px-xs">{类型图标}</span>
│                       <span class="truncate">{文件名}</span>
├─ <div class="… ys self-end"><oc …/></div>                                 ← 1955-1960
├─ <div title=… class="… vs self-end"><$s …/></div>                          ← 1963-1967
├─ <Xs snippets annotations>                                                 ← 引用片段 + 注释, 1982-2006
└─ 图片/视频 tiles（Vs / Ec / Ac）
```

### 8.2 文件胶囊尺寸与配色（确证）

```js
// c2fd10b8d:1452-1454
vs = "flex items-center gap-1.25 max-w-full h-[32px] ps-xs pe-sm rounded bg-fill-secondary
      shadow-field stacks:shadow-none text-secondary text-body select-text";
ys = "flex max-w-full items-center gap-1.25";
bs = "self-end select-text";
```

- 高度 **32px**、圆角 4px（`rounded`）、`ps-xs`=2px / `pe-sm`=6px、`gap-1.25`=5px、字号 `text-body`=13px。
- 类型图标框：`h-[24px] min-w-[24px] rounded-sm bg-alpha-2 px-xs`（`c2fd10b8d:2014`）。

### 8.3 图片 tile 三套尺寸（确证）

```js
// c2fd10b8d:1447-1472
hs = { minWidth: 120, minHeight: 120 },
gs = { width: 120, height: 120, ...hs },
xs = "relative flex shrink-0 items-center justify-center rounded-lg overflow-hidden
      border-0.5 border-strong bg-alpha-2 shadow-sm shadow-black/5",     // 卡框
Es = "block max-h-80 max-w-full",        // 单图：最大高 320px
ks = "block max-h-40 max-w-full",        // 多图：最大高 160px
As = "absolute inset-0 size-full object-contain",   // 方图铺满
js = {
  natural: { dims: hs, card: Ts, media: Es },        // 1 张
  several: { dims: hs, card: Os, media: ks },        // 多张
  square:  { dims: gs, card: Ts, media: As },        // 方图 120×120
};
Ds = "max-w-[min(100%,240px,calc(50%_-_var(--cds-gap-sm)/2))]";   // 多图并排上限 240px
ws = `${Cs} hover:border-stronger hover:shadow-black/10 cursor-zoom-in`;   // ← 可点放大
```

- 单图：`hover` 变 `cursor-zoom-in` + 边框加深 + 阴影加深（唯一带「点击放大」语义的图片态）。
- 多图并排：单块最宽取 `100% / 240px / 半宽减 gap` 三者最小值。
- 图片尺寸钳制：边长 16384 上限（`Ns = 16384`），2× DPR 折算（`c2fd10b8d:1474-1482`）。

### 8.4 `epitaxy-pill-*`（确证）

```css
/* shared-styles-Bl9zqrv-.css */
.epitaxy-pill-body{position:relative;box-shadow:0 0 0 .5px #0003}
.epitaxy-root .epitaxy-pill-body:after{content:"";border-radius:inherit;pointer-events:none;
  position:absolute;inset:0;box-shadow:inset 0 0 0 .5px #fff3}
.epitaxy-root .epitaxy-pill-body--flat,.epitaxy-root .epitaxy-pill-body--flat:after,
.epitaxy-root .epitaxy-pill-body--tile,.epitaxy-root .epitaxy-pill-body--tile:after{box-shadow:none}
.epitaxy-root .epitaxy-pill-body:focus{box-shadow:var(--cds-focus-shadow)}
```

组件侧（`c0fbbe82d:41944-42054`）：

```
inline-flex items-center gap-1.25 h-10 px-md text-secondary-control text-body      ← 无 label 变体
inline-flex items-center gap-sm py-xs pe-md ps-lg text-secondary-control text-body  ← 有 label 变体
epitaxy-pill-body--tile rounded-card border        ← tile 变体
epitaxy-pill-body--flat bg-alpha-2 text-muted-control
epitaxy-pill-remove absolute -top-1.5 -end-1.5 z-10 grid place-items-center size-4
                    rounded-full bg-surface-2 text-secondary ring-1 ring-alpha-2
                    opacity-0 … group-hover/pill:opacity-100 …
```

移除按钮：**16×16px** 圆钮，悬停出现（`group-hover/pill` / `group-focus-within/pill`）。
`h-10` = 2.5rem = 40px（pill 主体高度）；`rounded-card` = `calc(var(--cds-radius) + .25rem)`。

### 8.5 两个「看起来像类名、其实不是」的陷阱（确证）

```js
// c2fd10b8d:3298
var Ll = ["epitaxy-file-snippet-inert"];     // ← React Query 的 queryKey 哨兵数组
…
{ queryKey: o ? Al(i, …) : Ll, gcTime: hi, meta: { silent: !0, noToast: !0 } }
```

```js
// c2fd10b8d:3315
var zl = ["epitaxy-channel-artifact-thumb-inert"];   // 同上，缩略图查询的 inert key
```

`epitaxy-file-snippet-inert` / `epitaxy-channel-artifact-thumb-inert` **不是 DOM 类名**，别写进选择器。

真实文件缩略图 testid 是 `file-thumbnail`，且它是**项目文件夹卡片**（`c9260427e:154`，`h-[120px] w-full` + 右上折角 `absolute -top-[7.5px] … h-2 w-12 rounded-t-md`），不是消息附件。

### 8.6 引用片段 / 注释胶囊（确证）

```js
// c2fd10b8d:1985-2006
snippet → <Quote badge="Excerpt" (pkFB4TVgKb)  badgeTooltip={label} name={label ?? ps(text)} text={text}/>
annotation → <Quote badge="Comment" (FJI3BnIl+Q) name="Comment on {where}" text={body || code || where}/>
```

---

## 9. Q8 · 读取失败的展示

### 9.1 三条独立链路（确证）

**A. 卡片标签变色（工具结果 is_error）**

```js
// cc1aae219:16941
g && !r && !R && (R = h.formatMessage(LW.read, { fileName: N }));
// LW.read: cc1aae219:15859 → "Failed to read {fileName}"  id: sY6b1IqyXe
```

渲染为 `text-danger`（`cc1aae219:18135`：`text: T ? y("span", { className: "text-danger", children: h }) : h`），
同时把结果正文推进折叠区（`xK` → `JH`），出错正文用红色代码块：

```js
// cc1aae219:18165-18175
y(Pw, { language: "json", code: c ? _h(e) : e,
        title: s.formatMessage({ defaultMessage: "Error", id: "KN7zKn8z4F" }),
        className: "!bg-danger", codeTagProps: { className: "text-danger" },
        codeTagClassName: "[unicode-bidi:plaintext]" })
```

**B. 预览兜底页（文件打不开）** —— `cd2efac6e:5402-5492`

| decline 值 | 标题 | 正文 | i18n |
| --- | --- | --- | --- |
| `file_access_file_too_large` | `Preview isn’t available for this file` | `It’s too large to preview here.` | `6tSBeh0FOe` / `TNz7MPF8pJ` |
| `file_access_remote_read_timed_out` | `Couldn’t load this file` | `It took too long to load over the session’s connection.` | `j8M+lCyqY/` / `Vyedc7xYE9` |
| `file_access_remote_unreachable` | 同上 | `This session isn’t reachable right now.` | `F6+YGS92k8` |
| `file_access_remote_read_failed` | 同上 | `It may be unreadable, or the session’s connection may have dropped.` | `ThuGs+zYpY` |
| `vm_stopped` / `vm_unavailable` | `Claude’s workspace isn’t running` | `It needs to be running to preview this file.` | `FijUU2fIk6` / `SXnrewfmQX` |
| `vm_start_failed` / `vm_start_timeout` | `Couldn’t start Claude’s workspace` / `…took too long to start` | — | `I4Bp6CiVsZ` / `FZxDCkSc5T` |
| default | `Inline preview isn’t available for this file` | — | `aBWbI0Ii0N` |

带 `textRole: "alert"` 的条目走警示配色；`file_access_*` 组合带 `Try again` 按钮（`FazwRldA7z`）。
容器 testid：`file-no-inline-preview`，并带 `data-reason={Ru}` 便于断言原因（`cd2efac6e:4897-4898`）。

**C. 会话/文档摄取失败（整段记录读不出）** —— `ca2ef848d:14239-14244`

```js
var QY = new Map([
  ["unsupported-format", "local_unsupported_format"],
  ["path-not-allowed",   "local_path_not_allowed"],
  ["read-failed",        "local_read_failed"],
  ["ingest-failed",      "local_ingest_failed"],
]);
```

文案（`c4ea84cb3:10536` 附近，含完整 i18n id）：

```
local_not_regular   → "…opened because it looks like a link or a placeholder, not a regular file."  (Ae3r9b2X49)
local_permission    → "Claude Code doesn’t have permission to read a file or folder in your .claude folder."  (OVCyyrJZm5)
local_read_failed   → "This session’s file couldn’t be read just now. Try again in a moment."  (MtSkAgGN+h)
default             → "Something went wrong while loading earlier messages."  (tunNtxk3NV)
```

### 9.2 位置与「是否含原因」

- 「含原因」：**是**，但只说**类别**（too large / 远程超时 / 不可达 / 读失败 / 权限 / 非普通文件），不透出底层 `errno`。
- 位置：A 在卡片首行；B 占满预览区（`flex-1 min-h-0` + 居中）；C 在消息加载占位处（`kind` 驱动的错误块）。
- 「Stopped reading {file}」（`vCoZGHhsFN`）是用户中止，不算失败，颜色不变红。

---

## 10. Q9 · 路径处理函数完整还原（`c05b96c7f:955-1009`）

### 10.1 原文（pretty 后逐行）

```js
function uc(e, t) {                       // 955  —— 对外入口：uc(path, shareType)
  if (!t) return !0;                      //   无 shareType（本地会话）→ 放行
  if (t === "org_scoped") return dc(e);   //   组织内共享 → 走严格校验
  if (t === "public") return !1;          //   公开分享 → 一律拒绝
  throw Error(`Unknown share type: ${t}`); //  未知类型 → 抛错（fail-closed）
}

function dc(e) {                          // 961
  let t = e.replace(/^computer:\/{2,3}/i, "/").replace(/^\/+/, "/"),
      n = !1;

  for (let e = 0; e < 5; e++) {           // 964 —— 最多解码 5 轮
    let e;
    try { e = decodeURIComponent(t); }
    catch {
      /%[0-9a-fA-F]{2}/.test(t) && (t = "\0undecodable"), (n = !0);
      break;                              // 964-971  解码炸了：含 %XX 就标记不可解码
    }
    if (e === t) { n = !0; break; }        // 972-976  收敛（不再变化）→ 标记「已稳定」
    t = e;                                //           否则继续解一层
  }
  n || (t = "\0undecodable"), (t = t.replace(/\\/g, "/"));   // 978  5 轮还没收敛 → 不可解码；反斜杠归正

  let r = [], i = !1;                     // 979 —— 归一化栈 + 逃逸标志
  for (let e of t.split("/"))
    if (e !== "" && e !== ".") {          // 981-982  跳过空段与 "."
      if (e === "..") {                   // 983
        if (r.length === 0) { i = !0; break; }   // 984-987  栈空还 ".." → 逃逸根
        r.pop();                          // 988      正常回退一层
        continue;
      }
      r.push(e);                          // 991
    }
  let a = i ? "\0escapes-root"                       // 993  逃逸 → 哨兵字符串
            : `/${r.join("/")}${t.endsWith("/") && r.length > 0 ? "/" : ""}`;   // 否则重建绝对路径

  {                                       // 994 —— 第二遍：深度扫描，检测「先下潜再回退」
    let e = t.replace(/\/+/g, "/"), n = 0, r = !1, i = !1;
    for (let t of e.split("/"))
      if (t !== "" && t !== ".") {
        if (((n += t === ".." ? -1 : 1), n >= 2)) r = !0;   // 999-1001  深度 ≥2 → 进入受保护区
        else if (r) { i = !0; break; }                       // 1002-1005 出了受保护区又继续 → 违规
      }
    return !i && e.startsWith("/mnt/user-data/") && a.startsWith("/mnt/user-data/");  // 1007
  }
}
```

### 10.2 逐分支解释

| 分支 | 条件 | 结果 | 意图 |
| --- | --- | --- | --- |
| `uc` 无 `t` | 本地/同机会话 | `true` | 本地路径无需沙箱校验 |
| `uc` `t === "public"` | 公开分享 | `false` | 公开链接**永不**允许文件路径（防泄漏） |
| `uc` 未知 `t` | 其它字符串 | `throw` | fail-closed，避免新 share type 默认放行 |
| 协议前缀 | `computer://`、`computer:/`、`computer:///` | 归一为 `/` | 桌面「computer:」伪协议等价于根 |
| 前导斜杠 | 任意数量 `/` | 收敛为单个 `/` | 防 `//mnt/...` 绕过前缀判断 |
| 解码循环 | 最多 5 轮 `decodeURIComponent` | 收敛即停 | 防 `%252e%252e%252f` 多层编码穿越 |
| 解码异常 | `URIError` 且串含 `%XX` | `"\0undecodable"` + `n = true` | 畸形百分号编码 → 判死，但先判「是否真是编码串」 |
| 未收敛 | 5 轮仍在变 | `"\0undecodable"` | 防超深编码（炸弹） |
| 反斜杠 | `\` → `/` | Windows 分隔符归正 | 跨平台一致 |
| `.` 段 | `e === "."` | 丢弃 | 无意义段 |
| `..` 栈空 | 已到顶还 `..` | `"\0escapes-root"` + break | 越根逃逸 |
| `..` 栈非空 | — | `pop()` | 正常相对回退 |
| 尾部斜杠 | 原串以 `/` 结尾且栈非空 | 结果补 `/` | 保留目录语义 |
| 深度扫描 | 逐段累加深度，≥2 后置 `r = true`（在保护区） | 之后若再出现普通段 → `i = true` | 检测「`/mnt/user-data/x/../../etc`」这类**先深入再退出**的路径 |
| 最终判定 | `!i && 原串.startsWith("/mnt/user-data/") && 重建串.startsWith("/mnt/user-data/")` | 布尔 | **双重前缀校验**：归一化前后都必须在同一沙箱根下 |

关键设计点（确证 + 一句推断）：

- 输出是布尔，不是清洗后的路径——调用方拿到的只是「能不能共享」。
- 哨兵串以 `\0` 开头，`startsWith("/mnt/user-data/")` 必然失败，等于双重保险（**推断**，但 `\0` 前缀无法与 `/` 比较是确证）。
- 「先下潜再回退」检查故意用 `n >= 2` 而不是 `>= 1`：`/mnt/user-data` 本身深度为 2，进入其孙目录后才算受保护区（**推断**，依据取值 2 与根名段数一致）。

### 10.3 与 Read 入参校验的配合（确证）

```js
// c05b96c7f:4328-4335
case "file_path":
  return t !== t.trim() || !(t.startsWith(Af) || t.startsWith(jf)) || t.includes("//")
    ? null                                    // 首尾空白 / 不在 /mnt/user-data/ 或 /home/claude/ / 含双斜杠 → 拒
    : (Ji(t, 1024) ?? null);                  // 长度上限 1024
// c05b96c7f:4312-4317
var kf = new Set(["mine","shared","all"]), Af = "/mnt/user-data/outputs/", jf = "/home/claude/";
function Mf(e) { return e.startsWith(Af) && e.length > 23 ? e.slice(23) : e; }   // 展示时剥 23 字符前缀
```

即：**卡片显示**用 `Mf()` 把 `/mnt/user-data/outputs/`（23 字符）剥掉，只显示相对名；
**校验**用 `uc/dc` 决定该路径能否出现在共享会话里。

---

## 11. 排版度量 / Typography（逐元素四要素）

> rem 基准：`--cds-rem-scale` 默认 **1**（16px）；仅在 iOS `font:-apple-system-body` 时变为 `calc(16/17)≈0.941`（`c6a992d55…css` `@supports (font:-apple-system-body)`）。下表按 **16px 基准**换算，并给变量名。

### 11.1 字体族

| 位置 | font-family | 来源 |
| --- | --- | --- |
| 卡片外壳 / 标题行文字 | `--cds-font-sans` → `.font-sans` | `cc1aae219:13530`（`font-sans`），`.font-sans{font-family:var(--cds-font-sans)}` |
| 文件路径（meta / 文件名） | 同上（sans，非 mono） | `cc1aae219:13433`（无 `font-mono`） |
| 读到的文件内容（Read 结果） | **`--cds-font-mono`** | `.text-code{font-family:var(--cds-font-mono)}`；`Pw` 内 `<pre><code>` 亦走 `code,pre` 默认 mono |
| 行号列（diff gutter） | **`--cds-font-mono-ui`** | `c5dc59ef8:314`（`font-mono-ui`） |
| 数字/计数（`tabular-nums` 处） | sans + `font-variant-numeric: tabular-nums` | `cc1aae219:15249` |
| 文档阅读模式（prose） | `--cds-font-sans`；`data-prose-font=serif` 时切 `--cds-font-voice` | `.prose[data-prose-font=serif]{--_prose-font-body:var(--_prose-face-serif)}`；`--_prose-face-serif:var(--cds-font-voice, ui-serif, Georgia, "Times New Roman", serif)` |
| `epitaxy-document-plaintext-line[data-mono]` | `--cds-font-mono` | `.epitaxy-document-plaintext-line[data-mono]{font-family:var(--cds-font-mono);…}` |
| `epitaxy-document-source` | CodeMirror，`--cds-font-mono` 系 | `.epitaxy-document-source{--cds-font-size-code:var(--document-code,.8125rem)}` |

**完整 fallback 栈（确证，逐字）**：

```css
/* mono —— .text-code / pre / code 走这条 */
--cds-font-mono: var(--cds-font-mono-override,)
                 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
                 "Liberation Mono", "Courier New", monospace;
--cds-font-mono-ui: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
                    "Liberation Mono", "Courier New", monospace;

/* sans */
--cds-font-system: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
                   var(--font-cjk-sans-fallback), sans-serif;
--cds-font-sans:   var(--cds-font-system);
--font-anthropic-sans: "anthropic-sans", var(--font-sans-fallbacks);
--font-sans-fallbacks: system-ui, "Segoe UI", Roboto, Helvetica, Arial,
                       var(--font-cjk-sans-fallback), var(--font-script-fallbacks), sans-serif;

/* serif（文档阅读模式） */
--cds-font-voice: var(--font-anthropic-serif, ui-serif), ui-serif, Georgia, "Times New Roman", serif;
--font-anthropic-serif: "anthropic-serif", "Anthropic Serif Fallback Georgia",
                        "Anthropic Serif Fallback Times", "Anthropic Serif Fallback DejaVu",
                        "Anthropic Serif Fallback Noto", Georgia, "Arial Hebrew",
                        "Noto Sans Hebrew", "Times New Roman", Times,
                        var(--font-cjk-serif-fallback), var(--font-script-fallbacks), serif;
```

**等宽字体特性（确证，很关键）**：

```css
.font-mono,[class*=font-mono],code,pre,kbd,samp{
  font-variant-ligatures:none;
  font-feature-settings:"calt" 0, "liga" 0;
}
```

→ 代码块**强制关闭连字**（`fi`/`=>`/`!=` 不会被合成合字），保证字符数与列宽一一对应。

### 11.2 字号

| 位置 | 变量 | rem | px | 证据 |
| --- | --- | --- | --- | --- |
| 文件内容（Read 结果代码块，非 hub） | `--text-xs`（`!text-xs`） | 0.75rem | **12px** | `cc1aae219:17036`、`.text-xs{font-size:var(--text-xs)}`、`--text-xs:.75rem` |
| 文件内容（hub/紧凑） | `--cds-font-size-code`（`!text-code`） | 0.75rem | **12px** | `Pw` 内 `C ? "!text-code" : "!text-sm !leading-relaxed"`（`c62cd56ac:24`） |
| `--cds-font-size-code` 实际值 | — | 0.75rem | **12px** | `--cds-font-size-code:calc(.75rem * var(--cds-rem-scale,1))`（`c6a992d55…css`） |
| 卡片标题行 / 文件名 | `--cds-font-size-body` | 0.8125rem | **13px** | `.text-body`、`--cds-font-size-body:calc(.8125rem * …)` |
| 截断提示（默认密度） | `--cds-font-size-caption` | 0.6875rem | **11px** | `.text-caption`、`cc9e4071f:8`（`px-1 pt-1.5` + `text-caption`/`text-footnote`） |
| 截断提示（紧凑密度） | `--cds-font-size-footnote` | 0.75rem | **12px** | `.text-footnote`、`cc9e4071f:8`（`px-1 pt-1.5` + `text-caption`/`text-footnote`） |
| 行号列（diff gutter） | `--text-xs` | 0.75rem | **12px** | `c5dc59ef8:314`（`text-xs`） |
| 参数/次级说明（`text-[0.6875rem]`） | 字面量 | 0.6875rem | **11px** | `c62cd56ac:57`、`.text-\[0\.6875rem\]{font-size:.6875rem}` |
| 文档 prose 正文 | `--document-body` = `.9375rem` | 0.9375rem | **15px** | `.epitaxy-document-page{--document-body:calc(.9375rem * …)}` |
| 文档 prose 内代码 | `--document-code` = body − .125rem | 0.8125rem | **13px** | `.epitaxy-document-prose{--cds-font-size-code:var(--document-code,.8125rem)}` |
| 聊天密度 s / l | `--document-body` 0.875rem / 1rem | — | **14px / 16px** | `[data-chat-text-size=s|l] .epitaxy-document-page` |
| 文件名胶囊 | `--cds-font-size-body` | 0.8125rem | **13px** | `c2fd10b8d:1453`（`text-body`） |

**prose vs 代码模式的字号差**：文档阅读模式正文 **15px**（`0.9375rem`）、行高 **24px**（`×1.6`）；
代码/源码模式 **13px**（`--document-code`）、行高 **20.02px**（`×1.54`）。
工具卡片内代码 **12px**。→ 三档明确：12 / 13 / 15。

**行号列比内容小一档**：diff 行号 12px vs 内容 `font-mono-ui text-xs` 12px —— 实际**同档**（`c5dc59ef8:314` 与 `319` 都写 `text-xs`），
唯一「小一档」的是**截断提示 11px < 内容 12px**。→ 需求里「行号通常比内容小一档」在本产品**不成立**（这是确证的反例）。

### 11.3 字重

| 位置 | 值 | 变量/类 | 证据 |
| --- | --- | --- | --- |
| 内容正文（代码块） | **400**（继承） | `--cds-font-weight-regular:400` | 无显式 weight，继承 `--font-weight-normal` |
| 卡片标题 / 文件名 | **400** | `.text-body` 不带 weight；`al` 组件默认 regular | `cc1aae219:13421-13436` |
| 语言/标题条（`<pre>` 上方 `_`） | **500**（有 title）/ **450**（var-settings 归零） | `font-sans font-medium` / `font-mono font-[450] [font-variation-settings:normal]` | `c62cd56ac:54-60` |
| 截断提示 | **400** | `.text-caption` / `.text-footnote` 无 weight | `cc9e4071f:8`（`px-1 pt-1.5` + `text-caption`/`text-footnote`） |
| 文档 prose h1/h2 | **500** | `font-weight:500` + `--cds-font-wght-medium` | `.epitaxy-document-prose h1{font-weight:500}` |
| 文档 prose h3/h4 | **600** | `--cds-font-wght-semibold` | 同上 |
| `.font-base-bold` | **500** | `font-weight:var(--cds-font-weight-medium)` | `c6a992d55…css` |
| `.font-small-bold` | **580** | `--cds-font-weight-semibold:580` | 同上 |
| 参数 label（dl/dt） | 400（`font-normal`） | `font-sans … font-normal text-muted` | `c3b2e82df:332` |

**variable font 的 wght 轴（确证，两套）**：

```css
/* 浅色 / 系统字体：普通数值 */
--cds-font-weight-regular:400; --cds-font-weight-medium:500;
--cds-font-weight-semibold:580; --cds-font-weight-bold:600;
--cds-font-grad-semibold:180; --cds-font-grad-bold:200;

/* 深色（[data-theme=claude][data-mode=dark]）：轴值 */
--cds-font-wght-regular:"wght" 360; --cds-font-wght-medium:"wght" 460;
--cds-font-wght-semibold:"wght" 540; --cds-font-wght-bold:"wght" 560;
/* 用法 */
font-variation-settings: var(--font-opsz-axis,) var(--cds-font-axis-wght,) "GRAD" var(--cds-font-grad,0);
```

→ 深色主题把字重**从 400/500/580/600 降到 360/460/540/560**，并叠 `GRAD` 轴补偿暗底视觉变粗。这是 Claude 的「暗色不加粗」策略。

### 11.4 字距（letter-spacing）

| 位置 | 值 | 证据 |
| --- | --- | --- |
| 文件内容 / 代码块 | **未设置**（继承 `normal` = `0em`） | `Pw`/`ZG` 无 tracking 类 |
| 卡片标题 / 文件名 | **未设置** | `cc1aae219:13433` 仅 `truncate min-w-0` |
| 截断提示 | **未设置** | `cc9e4071f:8` |
| 行号列 | **未设置**，靠 monospace + `padStart` + `tabular` 特性对齐（无 `tabular-nums` 类） | `c5dc59ef8:310-319` |
| 文档 prose h1 | **−.012em** | `.epitaxy-document-prose h1{letter-spacing:-.012em}` |
| Markdown h1/h2/h3（`epitaxy-markdown`） | **−.01em** | `c19e90103…css` `.epitaxy-markdown h1{letter-spacing:-.01em}` |
| 可用 token | `--tracking-tight:-.025em`、`--tracking-normal:0em`、`--tracking-wide:.025em` | `c6a992d55…css` |

**负 tracking 只出现在标题**（文档/markdown 的 h1–h3），内容与行号一律 0。

`tabular-nums` 的使用点（确证）：
```css
.tabular-nums{font-variant-numeric: … var(--tw-numeric-spacing,) …}
```
调用处：tool status 的耗时数字 `font-base tabular-nums opacity-[0.65]`（`cc1aae219:15249`）、
diff 表 `.epitaxy-document-csv{font-variant-numeric:tabular-nums}`（`c3fde7009…css`）、
Monaco 行号 `.line-numbers{font-variant-numeric:tabular-nums;text-align:right}`（`c5aee9dbd…css:47815`）。
**Read 卡片与 diff 自绘行号都没有显式 `tabular-nums`**（靠等宽字体天然对齐）。

### 11.5 行高与度量

| 项目 | 值 | 证据 |
| --- | --- | --- |
| 代码块（Read 卡片内，被 `!text-xs` 覆盖后） | `--text-xs--line-height` = `calc(1/.75)` = **1.3333** → **16px @12px** | `--text-xs--line-height:calc(1 / .75)`；覆盖点 `cc1aae219:17036` |
| 代码块（`Pw` 默认，未被覆盖时） | `--text-sm--line-height` = `calc(1.25/.875)` = **1.4286** → **20px @14px** | `--text-sm--line-height:calc(1.25 / .875)` |
| 代码块（hub） | `--cds-leading-code` = `calc(1.0625rem)` = **17px**，@12px = **1.4167** | `--cds-leading-code` |
| 卡片标题 | `--cds-leading-body` = `calc(1.1875rem)` = **19px** @13px = **1.4615** | `.text-body` |
| 截断提示 | caption `calc(1.0625rem)` = **17px** @11px；footnote `calc(.9375rem)` = **15px** @12px | `--cds-leading-caption` / `--cds-leading-footnote` |
| 行号列 | **1.375rem = 22px**（行高与 `min-height` 同值，锁死行盒） | `c5dc59ef8:319` |
| diff 行 | `minHeight: 1.375rem` = 22px，`lineHeight: 1.375rem` | `c5dc59ef8:444`、`333` |
| 文档 prose | `--cds-leading-prose` = `calc(var(--document-body) * 1.6)` = **24px** @15px | `.epitaxy-document-prose` |
| 文档代码行 | `--document-code-leading` = `calc(var(--document-code) * 1.54)` = **20.02px** @13px | `.epitaxy-document-page` |
| 文档 plaintext `[data-mono]` 行 | `line-height:1.5` | `.epitaxy-document-plaintext-line[data-mono]` |

**行号列宽度计算**（确证，两种）：

```js
// A. diff 自绘行号（c5dc59ef8:310-311）
let a = e?.toString().padStart(n, " ") || " ".repeat(n);   // n = charWidth（位数）
let s = `${n * 0.6 + 0.5}rem`;                             // 宽度 = 位数×0.6 + 0.5rem
// 2 位 → 1.7rem = 27.2px；3 位 → 2.3rem = 36.8px；5 位 → 3.5rem = 56px
// B. shared-10 行号（shared-10:4155，代码块内可选行号）
minWidth: `${String(t).length}.25em`   // 注意：这是模板串拼接（"3.25em"），位数不同宽度并非严格线性
```

右对齐方式：A 用 `flex … justify-end` + `text-align` 缺省；Monaco 用 `text-align:right`；
document plaintext 不排行号。**都不用 `ch` 单位**。

**折叠阈值 / 默认行数上限**（确证）：

| 项目 | 值 | 证据 |
| --- | --- | --- |
| Read 结果内容折叠高度 | `max-h-[150px]` = **150px**（≈9 行 @16px 行高） | `cc1aae219:13890` |
| 展开壳内容区（`JH`） | `max-h-[200px]` = **200px**；宽屏 `max-h-[4000px]` | `cc1aae219:13332-13333` |
| 审批卡读内容 | `yj = 6` × 行高 → `maxHeight = 6 * lineHeight`（**6 行**） | `c96d752d0:12383`、`12464` |
| 高亮放弃阈值 | **204800 字节** | `shared-10:4410` |
| 文档纯文本分块阈值 | **131072 字符** | `c3fde7009:513` |
| `truncated` UI 判定 | 无（后端 `is_truncated`） | 第 5.2 节 |
| 参数截断提示判定 | 行值带 `truncated:true` 标记 | `c3b2e82df:336-342` |

**`tab-size` 与长行策略**（确证）：

```css
.epitaxy-document-plaintext{white-space:pre-wrap;tab-size:4;overflow-wrap:anywhere}
.\[tab-size\:4\]{tab-size:4}   .\[tab-size\:2\]{tab-size:2}
```

- Read 结果代码块：`wrapLongLines: !0`（`c62cd56ac:43`）+ `white-space:pre-wrap` + `break-words`（`c62cd56ac:9`）+ 外层 `overflow-x-auto`
  → **软换行优先，同时保留横向滚动**（两者叠加：`pre-wrap` 下长行会折，`overflow-x-auto` 只在无法折时生效）。
- 文档纯文本：`pre-wrap` + `overflow-wrap:anywhere` + `tab-size:4`；`[data-mono]` 行改为 `white-space:pre`（**该行不折，横向溢出**）。

**图片缩略图尺寸**（确证）：

```
tool-image-thumbnail:  36 × 28 px   (w-9 h-7)，圆角 6px，hover 旋转 2°
图片 tile（附件）:     120 × 120 px 起（minWidth/minHeight=120），单图最大高 320px，多图最大高 160px，多图单块最大宽 240px
文件胶囊:              高 32px，图标框 24×24px
移除按钮（pill）:      16 × 16px
```

### 11.6 颜色层级

| 元素 | 浅色 | 深色 | 变量 |
| --- | --- | --- | --- |
| 内容文字（代码块） | `#0b0b0b`（gray-900） | `#f0efec`（gray-50） | `--cds-text-primary` |
| 卡片标题 / 文件名 | `#898781`（gray-400，**muted**） | `#898781` | `--cds-text-muted`（`.text-muted`，`cc1aae219:13422`） |
| 行号（diff gutter） | 跟随主题 `comment` token 色（代码主题注释色） | 同 | `I = g.comment?.color`（`shared-10:4327`）, 传入 `style.color`（`shared-10:4155`） |
| 行号（Monaco/编辑器） | `--vscode-editorLineNumber-foreground` | 同 | `c5aee9dbd…css:47815` |
| 截断提示（正常） | `#898781` | `#898781` | `text-muted` |
| 截断提示（错误） | `#8e2626`（red-600） | `#ec7e7e`（red-300） | `--cds-text-danger` = `--cds-role-danger-600` / `-300` |
| 读取失败标签 | 同上 `#8e2626` / `#ec7e7e` | — | `.text-danger{color:var(--cds-text-danger)}` |
| 失败代码块底 | `--cds-bg-danger` | — | `className: "!bg-danger"`（`cc1aae219:16999`） |
| 文件胶囊文字 | `#52514e`（gray-600） | `#c3c2b7`（gray-200） | `--cds-text-secondary`（`text-secondary`） |
| 胶囊/卡片边框 | `--cds-border` = `--cds-alpha-2`（`hsl(gray-900 / 10%)`） | `hsl(gray-0 / 10%)` | `--cds-border` |
| 内容块底 (`bg-bg-000/30`) | `surface-3` 30% | `surface-3` = `#20201f` | `.bg-bg-000/30{background-color:color-mix(in oklab, var(--cds-surface-3) 30%, transparent)}` |

浅色/深色 token 对照（确证）：

```
浅色: --cds-surface-0..#3 = gray-20 #f9f9f7 / gray-10 #fcfcfb / gray-0 #fff / gray-0 #fff
      --cds-text-primary = neutral-900 = gray-900 #0b0b0b
      --cds-text-secondary = neutral-600 = gray-600 #52514e
      --cds-text-muted = neutral-400 = gray-400 #898781
深色: --cds-surface-0..#3 = gray-900 #0b0b0b / gray-850 #151515 / gray-830 / gray-800 #20201f
      --cds-text-primary = gray-50 #f0efec
      --cds-text-secondary = gray-200 #c3c2b7
      --cds-text-muted = gray-400 #898781
```

---

## 12. 完整 CSS（摘录关键选择器与数值）

### 12.1 工具卡片外壳

```css
/* Tailwind 组合，≡ 换算后 */
.tool-card {
  border-radius: var(--msg-block-radius, 0.5rem);   /* 8px */
  border: 0.5px solid var(--cds-border);            /* 1px 的半步，alpha-2 */
  display: flex; flex-direction: column;
  font-family: var(--cds-font-sans);
  line-height: normal;
  margin-block: 0.75rem;                            /* my-3 */
  /* 展开时 */
  background: var(--cds-surface-3);                 /* bg-bg-000 */
  box-shadow: var(--cds-shadow-sm);
}
/* 收起 hover */
.tool-card:hover { background: var(--cds-surface-0); }   /* hover:bg-bg-200 */

/* 行头 */
.tool-row { display:flex; flex-direction:row; align-items:center;
            padding: 0.5rem 0.625rem;               /* py-2 px-2.5 */
            border-radius: var(--msg-block-radius,0.5rem); }

/* 展开内容壳（JH） */
.tool-detail-wrap { margin: 0.25rem 0.625rem 0.5rem;   /* mx-2.5 mt-1 mb-2 */
                    border-radius: 0.5rem;             /* rounded-lg */
                    border: 0.5px solid var(--cds-border);
                    background: var(--cds-surface-3); }
.tool-detail-body { display:flex; flex-direction:column; gap:0.5rem;
                    max-height: 200px; overflow-y:auto; padding:0.5rem; }
.tool-detail-body code, .tool-detail-body pre { font-size: 0.75rem !important; line-height:1.0625rem !important; }
```

### 12.2 Read 内容块

```css
.read-content-shell {                                 /* cc1aae219:13886 */
  border: 0.5px solid var(--cds-border);
  border-radius: 0.75rem;                             /* rounded-xl */
  margin: 0.25rem 0.625rem 0.5rem;
  overflow: hidden;
  background: color-mix(in oklab, var(--cds-surface-3) 30%, transparent);
}
.read-content-scroll { max-height: 150px; overflow-y: auto; }

.code-block__code { font-size: var(--msg-code-font-size) !important; }   /* 默认 0.75rem */
.code-block__code .linenumber:after {
  content: attr(data-line-number);
  -webkit-user-select: none !important; user-select: none !important;
  pointer-events: none !important;
}
```

### 12.3 文档阅读器（Read 不走，但属「读取类结果」）

```css
.epitaxy-document-page{
  --document-body: calc(.9375rem * var(--cds-rem-scale,1));          /* 15px */
  --document-code: calc(var(--document-body) - .125rem);             /* 13px */
  --document-code-leading: calc(var(--document-code) * 1.54);        /* 20.02px */
  --document-measure: calc(var(--document-body) * 36);               /* 540px */
  --document-rail-min-gutter: 4.75rem;
  container-type: size; }
[data-chat-text-size=s] .epitaxy-document-page{--document-body:calc(.875rem * …)}   /* 14px */
[data-chat-text-size=l] .epitaxy-document-page{--document-body:calc(1rem * …)}      /* 16px */

.epitaxy-document-column{
  box-sizing: content-box; max-width: var(--document-measure,34rem);
  --document-pad: clamp(1.25rem, 6cqi, 4rem);
  --document-gutter: calc(50cqi - min(var(--document-measure,34rem)/2, 50cqi - var(--document-pad)));
  --document-bleed: max(0px, var(--document-gutter) - 2rem);
  padding-inline: var(--document-pad); margin-inline: auto;
  padding-block: clamp(2rem,6cqi,3.5rem) 6rem; }

.epitaxy-document-prose{
  --cds-font-size-prose: var(--document-body,.9375rem);
  --cds-leading-prose: calc(var(--document-body,.9375rem) * 1.6);    /* 24px */
  --cds-font-size-code: var(--document-code,.8125rem);
  --cds-leading-code: var(--document-code-leading,1.25rem);
  --cds-prose-code-color: var(--cds-text-primary);
  overflow-wrap: break-word; }
.epitaxy-document-prose :is(p,li,dd,blockquote,figcaption){ text-wrap: pretty; }
.epitaxy-document-prose :is(h1,h2,h3,h4){ text-wrap: balance; }
.epitaxy-document-prose h1{ font-size:1.75em; font-weight:500; line-height:1.15; letter-spacing:-.012em;
                             font-variation-settings:var(--cds-font-wght-medium,normal); }
.epitaxy-document-prose h2{ font-size:1.35em; font-weight:500; line-height:1.25; }
.epitaxy-document-prose h3{ font-size:1.125em; font-weight:600; }
.epitaxy-document-prose h4{ font-size:1em;     font-weight:600; }

.epitaxy-document-plaintext{ white-space:pre-wrap; tab-size:4; overflow-wrap:anywhere; }
.epitaxy-document-plaintext-line[data-hang]{ display:flex; }
.epitaxy-document-plaintext-line > .epitaxy-document-plaintext-lead{ white-space:pre; flex:none; }
.epitaxy-document-plaintext-line > .epitaxy-document-plaintext-lead + span{ flex:1; min-width:0; }
.epitaxy-document-plaintext-line:empty:before{ content:"\200B"; }
.epitaxy-document-plaintext-line[data-mono]{
  font-family: var(--cds-font-mono); white-space: pre;
  font-size: .8125em; line-height: 1.5; }

.epitaxy-document-source{
  --cds-font-size-code: var(--document-code,.8125rem);
  --cds-leading-code: var(--document-code-leading,1.25rem);
  --diffs-font-size: var(--cds-font-size-code);
  --diffs-line-height: var(--cds-leading-code); }
.epitaxy-document-source .cm-content{ padding-block: var(--cds-pad-xl) 4rem; }
.epitaxy-document-source .cm-editor:not(.cm-focused) .cm-activeLine{ background-color: #0000; }
.epitaxy-document-source .cm-editor:not(.cm-focused) .cm-activeLineGutter{ color: inherit; }

.epitaxy-document-image-chip{ vertical-align:middle; max-width:100%; display:inline-flex; }
.epitaxy-document-csv{ border-collapse:separate; border-spacing:0; border:1px solid var(--cds-border);
                       border-radius:var(--cds-radius,.375rem); text-align:start;
                       font-variant-numeric: tabular-nums lining-nums; width:100%; }
```

### 12.4 代码块 / 行内代码 / 滚动条

```css
.epitaxy-codeblock{ width:100%; margin-block: var(--codeblock-bump); }
.epitaxy-code-chip{
  font-family: var(--cds-font-mono);
  font-size: calc(var(--chat-body,var(--cds-font-size-body)) - 1px);   /* 13px-1 = 12px */
  background: var(--cds-alpha-1); color: var(--code-chip-ink,var(--cds-text-primary));
  border-radius: 4px; padding-block:1px; padding-inline:2px; line-height:1.4; }
.epitaxy-root :is(a,button,[role=button]) > .epitaxy-code-chip{
  --code-chip-ink: var(--cds-text-accent); font-family:inherit; font-size:inherit;
  line-height:inherit; background:0 0; }

.epitaxy-code-scroll{ scrollbar-width:auto; scrollbar-color:auto; overflow-x:auto; }
:is(.epitaxy-table-scroll,.epitaxy-code-scroll)::-webkit-scrollbar{ width:8px; height:8px; background:0 0; }
:is(.epitaxy-table-scroll,.epitaxy-code-scroll)::-webkit-scrollbar-track{ background: var(--cds-alpha-1); }
:is(.epitaxy-table-scroll,.epitaxy-code-scroll)::-webkit-scrollbar-thumb{
  background: var(--cds-alpha-3); background-clip:padding-box;
  border:2px solid #0000; border-radius:9999px; }
:is(.epitaxy-table-scroll,.epitaxy-code-scroll)::-webkit-scrollbar-thumb:hover{ background: var(--cds-alpha-4); }

/* 高亮/滚动的 diffs 变量（代码块与 diff 共用一套） */
.epitaxy-root .epitaxy-diff{
  --diffs-font-size: var(--cds-font-size-code);
  --diffs-line-height: var(--cds-leading-code);
  --diffs-font-family: var(--cds-font-mono);
  --diffs-header-font-family: var(--cds-font-sans);
  --diffs-addition-color-override: var(--cds-text-git-added);
  --diffs-deletion-color-override: var(--cds-text-git-removed);
  --diffs-modified-color-override: var(--cds-text-accent);
  --diffs-gap-inline: var(--cds-pad-md);
  --diffs-gap-block: var(--cds-pad-xs); }
```

### 12.5 附件胶囊 / 图片

```css
.epitaxy-pill-body{ position:relative; box-shadow:0 0 0 .5px #0003; }
.epitaxy-root .epitaxy-pill-body:after{
  content:""; border-radius:inherit; pointer-events:none; position:absolute; inset:0;
  box-shadow: inset 0 0 0 .5px #fff3; }
.epitaxy-root .epitaxy-pill-body--flat,
.epitaxy-root .epitaxy-pill-body--tile,
.epitaxy-root .epitaxy-pill-body--flat:after,
.epitaxy-root .epitaxy-pill-body--tile:after{ box-shadow:none; }
.epitaxy-root .epitaxy-pill-body:focus{ box-shadow: var(--cds-focus-shadow); }

/* 文件胶囊（Tailwind 组合） */
.file-chip{
  display:flex; align-items:center; gap:5px; max-width:100%;
  height:32px; padding-inline: 2px 6px;
  border-radius: 4px; background: var(--cds-fill-secondary);
  box-shadow: var(--shadow-field); color: var(--cds-text-secondary);
  font-size: 13px; line-height: 19px; user-select: text; }
.file-chip__icon{ height:24px; min-width:24px; border-radius:4px;
                  background: var(--cds-alpha-2); padding-inline:2px; }

/* 图片 tile */
.img-tile{
  position:relative; flex-shrink:0; display:flex; align-items:center; justify-content:center;
  border-radius: 8px; overflow:hidden;
  border: 0.5px solid var(--cds-border-strong);
  background: var(--cds-alpha-2); box-shadow: var(--cds-shadow-sm); }
.img-tile--interactive{ cursor: zoom-in; }
.img-tile--interactive:hover{ border-color: var(--cds-border-stronger); }
.img-tile__media{ display:block; max-width:100%; max-height: 320px; }   /* max-h-80 */
.img-tile--several .img-tile__media{ max-height: 160px; }               /* max-h-40 */
.img-tile--square{ width:120px; height:120px; }
.img-tile--square .img-tile__media{ position:absolute; inset:0; width:100%; height:100%; object-fit: contain; }
.img-tile--several{ max-width: min(100%, 240px, calc(50% - var(--cds-gap-sm)/2)); }

/* 上传态动画（shared-styles） */
.file-thumbnail-fade-in{ animation: .3s ease-out file-thumbnail-fade-in; }
.file-thumbnail-grow-in{ animation: .3s ease-out file-thumbnail-grow-in; }
.file-thumbnail-upload-pulse{
  animation: file-thumbnail-upload-pulse 1.2s cubic-bezier(.4,0,.6,1)
             var(--placeholder-reveal-delay,.5s) infinite; }
@keyframes file-thumbnail-fade-in{ 0%{opacity:0} }
@keyframes file-thumbnail-grow-in{ 0%{opacity:0;max-width:0} }
```

### 12.6 行号槽（编辑器 / 编辑器类预览）

```css
/* CodeMirror（文件预览面板） */
.cm-lineNumbers .cm-gutterElement{ padding:0 3px 0 5px; min-width:20px;
                                   text-align:right; white-space:nowrap; }
.cm-gutter{ display:flex !important; flex-direction:column; flex-shrink:0;
            box-sizing:border-box; min-height:100%; overflow:hidden; }
&light .cm-activeLineGutter{ background-color:#e2f2ff; }
&dark  .cm-activeLineGutter{ background-color:#222227; }

/* Monaco（diff 编辑器） */
.monaco-editor .margin-view-overlays .line-numbers{
  font-variant-numeric: tabular-nums; text-align:right; vertical-align:middle;
  box-sizing:border-box; cursor:default; display:inline-block;
  position:absolute; bottom:0; }
.monaco-editor .line-numbers{ color: var(--vscode-editorLineNumber-foreground); }
.monaco-editor .line-numbers.active-line-number{
  color: var(--vscode-editorLineNumber-activeForeground); }
```

### 12.7 排版 utility 的真实数值（换算表）

```css
.text-code{ font-size: var(--cds-font-size-code); line-height: var(--cds-leading-code);
            font-family: var(--cds-font-mono); }            /* 12px / 17px */
.text-body{ font-size: var(--cds-font-size-body); line-height: var(--cds-leading-body); }  /* 13px / 19px */
.text-caption{ font-size: var(--cds-font-size-caption); line-height: var(--cds-leading-caption); } /* 11px / 17px */
.text-footnote{ font-size: var(--cds-font-size-footnote); line-height: var(--cds-leading-footnote); } /* 12px / 15px */
.text-xs{ font-size: var(--text-xs); line-height: var(--text-xs--line-height); }  /* 12px / 16px */
.text-sm{ font-size: var(--text-sm); line-height: var(--text-sm--line-height); }  /* 14px / 20px */
.font-small{ font-family: var(--cds-font-sans); font-size: var(--cds-font-size-caption);
             font-weight: var(--cds-font-weight-regular); line-height: var(--cds-leading-caption); }
.font-base{ font-family: var(--cds-font-sans); font-size: var(--cds-font-size-body);
            font-weight: var(--cds-font-weight-regular); line-height: var(--cds-leading-body); }
.font-mono{ font-family: var(--cds-font-mono); }
.font-mono-ui{ font-family: var(--cds-font-mono-ui); }
.w-9{ width: calc(var(--spacing) * 9) }        /* 2.25rem = 36px */
.h-7{ height: calc(var(--spacing) * 7) }       /* 1.75rem = 28px */
.h-10{ height: calc(var(--spacing) * 10) }     /* 2.5rem  = 40px */
.rounded{ border-radius: var(--cds-radius) }                    /* 0.375rem = 6px */
.rounded-md{ border-radius: var(--radius-md) }                  /* 0.375rem = 6px */
.rounded-lg{ border-radius: var(--radius-lg) }                  /* 0.5rem  = 8px */
.rounded-xl{ border-radius: var(--radius-xl) }                  /* 0.75rem = 12px */
.rounded-card{ border-radius: calc(var(--cds-radius) + calc(.25rem * var(--cds-rem-scale,1))) } /* 10px */
```

---

## 13. 未确认项

1. **Read 卡片内容是否含行号**：我按「`Pw` 未传 `showLineNumbers`」与「真实 transcript 内容自带 `N\t`」判定为无 gutter；但没有在运行中的应用里截屏对照，无法排除某条渲染分支（如 `XG` 的 `uK` 路径）另行加行号。
2. **`Dw` 的 5 个调用点中，Read 具体命中哪一个**：`XG`(17947) 与 `uK`(17476) 都可能，取决于 `hubSimpleToolParams` 与 `display_content`，未做条件穷举。
3. **PDF 内嵌查看器的实体**：只确证 `displayFileType:"rich"` + `file-sandboxed-preview` + `mn(content, type)`；未能定位到具体 PDF 渲染实现（仓内 `pdfjs-dist` 检索无 UI 侧命中，可能由 Chromium 内建 viewer 或主进程托管）。
4. **`epitaxy-user-attachments` 的间距**：无专属 CSS 规则，靠 Tailwind `flex flex-wrap` 默认 `gap:0`；未确认是否有祖先容器注入 `gap`。
5. **截断阈值的确切来源**：`is_truncated` 由后端产生，未在桌面端产物中找到产生该字段的判定代码（主进程 bundle 为 6.9MB，未做全量符号追踪）。
6. **`epitaxy-document-image-chip` 的触发条件**：只确证它是一个 inline-flex 包装（`c19e90103:7033/7048`），未追踪到「文档内图片何时用 chip 而非 `<img>`」的判定。
7. **`--msg-code-font-size` 的默认值**：只在 utility 变体里看到显式值 `0.75rem`，未找到 `:root` 级默认声明；`.code-block__code{font-size:var(--msg-code-font-size)!important}` 在未赋值时是否会失效，未验证。

---

## 14. 附：本次用到的 pretty 产物索引

| 文件 | 用途 |
| --- | --- |
| `pretty/cc1aae219-Bd1YvDXP.pretty.js` | 工具卡片外壳、Read 内容块、图片、truncated、错误态 |
| `pretty/c05b96c7f-DdfnpDBP.pretty.js` | 工具名归一化、路径函数 `dc/uc`、路径白名单 `Vf` |
| `pretty/c52b02f3f-BUL_S2rP.pretty.js` | Hub 版 Read verb 表 |
| `pretty/c8af22d2e-DN8v2vy8.pretty.js` | 流式「Reading {fileName}…」文案 |
| `pretty/c62cd56ac-BM3qknKn.pretty.js` | 代码块组件 `Pw` |
| `pretty/shared-10-BduvWhe8.pretty.js` | shiki 高亮、worker 引导、行号 span、204800 阈值 |
| `pretty/cc9e4071f-COsmd4CO.pretty.js` | `Output truncated` 组件全文 |
| `pretty/c3b2e82df-DMrtfvpA.pretty.js` | 参数截断提示、参数 dl 排版 |
| `pretty/c3fde7009-BauRduZk.pretty.js` | 文档阅读器（plaintext / source / prose） |
| `pretty/c2fd10b8d-Bp0nmcSY.pretty.js` | 用户附件、图片 tile、snippet/annotation 胶囊 |
| `pretty/c0fbbe82d-DQB0tYd-.pretty.js` | `epitaxy-pill-*` 组件与键盘交互 |
| `pretty/cd2efac6e-DCWkGXIV.pretty.js` | 文件预览、PDF 分类、预览失败页 |
| `pretty/ca2ef848d-CKbIdz6g.pretty.js` | 本地读取错误码映射 `QY` |
| `pretty/c4ea84cb3-C26r6m4X.pretty.js` | `local_read_failed` 等文案 |
| `pretty/c5dc59ef8-CagaXj31.pretty.js` | diff 行号槽度量（对照用） |
| `pretty/shared-104-A_oIUFQK.pretty.js` | 文件类型判定（`isPdf` / `displayFileType`） |
| `pretty/c64baa838-Dmxf9-qc.pretty.js` | `lineOffset` 滚动锚点 |

