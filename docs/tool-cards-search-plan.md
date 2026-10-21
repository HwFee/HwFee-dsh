# 工具卡片逆向 · 搜索类 / 规划类 / 代理类

> **性质**：新增的独立条目。补参考仓库 `.reference/open-claude-ui` 未覆盖的一块 ——
> 搜索引擎（Grep/Glob/WebSearch/WebFetch）、规划（TodoWrite/Plan）、代理（Task/子代理）、问答（AskUserQuestion）
> 这些 tool card 的结构、状态机与排印。
>
> **版本**：本机 Claude Desktop **2.42304.2**（参考仓库针对 v2.37337.1，见 `docs/typography-cross-check.md` §3.0）。
>
> **与 `docs/typography-cross-check.md` 的关系**：
> 该文 §5 是「工具卡片排版总览」，本文 §9 是「搜索/规划/代理类的逐元素排版明细」，两者值一致。
> 本文 §9.1 关于 `--cds-rem-scale` 的说法已被 typography-cross-check §1.1 / §5.1b 修正：
> **该变量在 `@supports(-apple-system-body)` 内，桌面端不生效，1rem = 16px**。
> 文中所有 px 值按 1rem=16px 计算，结论不受影响。
>
> **证据约定**：`<chunk>.pretty.js:N` 指 `C:\Users\17445\Desktop\rea\claude-ui-re\pretty\` 下格式化后的行号。
> 未标注「推断」的条目均为代码/字符串/CSS 直接读到的确证。

---

## 范围

Grep、Glob、WebSearch、WebFetch、TodoWrite、Task（子代理）、Plan 模式 / ExitPlanMode、AskUserQuestion，以及它们共用的 tool row 外壳、citation 角标、统一 CSS 与排版度量。

分析对象：Claude Desktop 2.42304.2，`ion-dist` 静态产物。pretty 后的行号均指 `claude-ui-re/pretty/<chunk>.pretty.js`。
凡未标注「推断」的条目，均为代码/字符串/CSS 中直接读到的**确证**。

---

## 0. 先纠三个容易踩的坑

| 假设 | 事实 | 证据 |
| --- | --- | --- |
| `plan-first` / `plan-led` / `plan-first-compact` 是计划模式布局 | **不是**。这是升级页（定价卡）的实验分组，实验键 `claudified_upgrade_plan_name_first`，取值被 `df()` 归一为 `plan-first` / `plan-first-compact`，`Ld()` 归一为 `plan-led` | `cf683581d-PyKO20ye.pretty.js:14120-14131`、`:13646-13648` |
| Grep/Glob 有独立的「文件+行号+匹配行」结果卡 | **聊天 transcript 里没有**。Grep/Glob 走通用 tool row（`XG`），按 read 语义展示文件内容预览（`max-h-[150px]`）。「文件+行号+匹配行」的列表是**文件浏览器 find-in-files 面板**（`?` 搜索），属不同 surface | `cc1aae219:16879-16941`（`["open_file","view","read","grep","glob"].includes(n)`）、`cccc2cf0a:5260-5345`（`PS` 面板） |
| 引用角标是数字上标 | **不是**。搜索结果引用渲染为**圆角药丸 chip**（站点名 / 标题 + hover 出 `ArrowUpRight`），多引用时显示 `+ N`。数字脚注编号只存在于 markdown 纯文本导出路径 | `c89efce1a-Dx_6wz2f.pretty.js:2449-2504`、`:2716-2443`、`shared-4-DZQ4lVmS.pretty.js:1265-1271` |

---

## 1. 统一外壳：tool row

搜索类与代理类全部复用同一个 header 组件 `XH`（`cc1aae219-Bd1YvDXP.pretty.js:13343-13540`）。`Read/Edit/Bash` 也用它，差异只在折叠策略与 body。

### 1.1 DOM / testid 树

```
div  .rounded-[var(--msg-block-radius,0.5rem)] border-[0.5px] flex flex-col font-sans leading-normal my-3 border-border-300
     │  collapsed: +hover:bg-bg-200 ; expanded: +bg-bg-000 shadow-sm
     │  mt-2/mt-3、mb-2/mb-3 由 isFirstBlockOfMessage / isLastBlockOfMessage 决定（:13530-13533）
 └ button[data-testid="tool-row-header"]            ← 仅在可点击时挂 testid（:13499）
    或 a（有 href 时，:13485-13496，target=_blank rel=noopener noreferrer）
    class .group/row flex items-center rounded-[var(--msg-block-radius)] w-full
          px-2.5  justify-between  py-2  text-text-300  cursor-pointer        (:13394-13402)
    ├ div .flex items-center gap-2 min-w-0 flex-1
    │  ├ div .flex items-center justify-center text-text-500 shrink-0      ← 图标位（TimelineGroup 模式隐藏）
    │  └ div .flex items-center gap-1 min-w-0 text-body text-start text-muted
    │     ├ <text>  .truncate min-w-0                                      ← 主文案
    │     ├ span[data-testid="tool-row-caret"]  CaretDown size=xs           (:13441-13450)
    │     │    .inline-flex shrink-0 transition-transform  + 图标尺寸类 zH.SHORT
    │     │    收起时：-rotate-90 opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100
    │     └ (secondaryElement 插槽 :13453)
    └ div .flex items-center gap-1.5 shrink-0
       ├ p  .ps-1 text-muted font-small shrink-0 whitespace-nowrap        ← secondaryText（结果数/域名）
       └ secondaryIcon（ArrowOutSquare 等）
```

- 主文案外层固定 `text-body`（`:13421`），因此在 transcript 内被 `.epitaxy-transcript-typography` 覆写为 `--chat-body`（见 §9.2）。
- `hideCaret` 传 `true` 时不渲染 caret（WebFetch、子代理行、memory 搜索行都这样）。

### 1.2 三种 renderMode 的折叠差异

| 模式 | 结构 | 折叠行为 | 证据 |
| --- | --- | --- | --- |
| `Standard` | 上面那棵带边框的卡 | header 点击 → `isExpanded` → body 挂 `bg-bg-000 shadow-sm`；未展开悬停 `bg-bg-200` | `:13528-13538` |
| `TimelineGroup`（transcript 内默认） | 走 `KH`/`GH` 轨道：左侧 1px 竖线 + 状态点，无卡片边框 | 由外层 timeline 统一控制，行本身 `px-0` | `:13394-13397`、`:13512-13527`、`:13250-13300` |
| 折叠容器 | body 用 `qH`（`overflow-clip`）或 `JH`（`overflow-hidden`，内容盒 `mx-2.5 mt-1 mb-2 rounded-lg border-[0.5px] border-border-300 bg-bg-000`，`max-h-[200px] overflow-y-auto`） | 展开才渲染（`e || Vm()`） | `:13313-13342` |

### 1.3 与其它工具卡的折叠策略对比

| 工具 | 默认是否折叠 | 关键实现 |
| --- | --- | --- |
| Bash | 展开（结果直接可见） | `cc1aae219:13590+` |
| Read/Write/Edit（`_U`） | 展开，内容盒 `max-h-[150px] overflow-y-auto` | `:13826-13904` |
| **WebSearch** | **展开**（结果列表直接可见）；仅当 `collapsibleWebSearchRows` 开启才折叠并显示 caret | `:14849-14988`，`hideCaret: !d`（`:14978`） |
| **WebFetch** | 只有 header，无 body | `:14636-14721` |
| **Task（子代理）** | 折叠，展开才渲染子工具列表 | `:14432`（`M = b && w ? l : []`） |
| **TodoWrite** | 展开，列表直接可见 | `cb6930dae:3626-3629` |
| **AskUserQuestion** | 独立卡（非 tool row） | `ccae33cda:1039-1186` |
| **ExitPlanMode** | 独立审批卡（`epitaxy-approval-card`） | `c96d752d0:14346-14368`、`:4775+` |

> 推断：transcript 里同一 turn 最多显示 3 个工具行（`maxVisibleTools: _ = 3`，`cc1aae219:15645`），其余折进「N steps」——这是**行级**折叠，与上表**卡内**折叠是两套机制。

---

## 2. Grep / Glob

### 2.1 图标

```js
case "glob":
case "grep":
  return y(X, { name: "Search", customSize: t, className: "text-text-500" });
```
`cc1aae219:13992-13994`；默认 `t=16`。规范化名来自 `Af()`，`file_search → glob`（`shared-130:17885`）。

### 2.2 头部文案模板（两套并存，按 surface 取）

**A. 会话状态句（sidebar / 状态条）** —— `cccc2cf0a:12856-12871`

| 工具 | 有 detail | 无 detail |
| --- | --- | --- |
| Read | `Reading {file}` | `Reading a file` |
| **Grep** | **`Searching for {pattern}`**（id `XgFMQ2uC6Q`） | **`Searching files`**（`WCIAidgueo`） |
| **Glob** | — | **`Finding files`**（`7P+BfHK5OP`） |

**B. 工具卡动词式（verb + meta）** —— `c52b02f3f-BUL_S2rP.pretty.js:932-940`

```js
case "Grep":
case "Glob":
  return {
    verb: "Searched",              // 0ZuuhwjU4n
    runningVerb: "Searching",      // IfE0if3ytt
    meta: a("pattern"),            // 直接展示原始 pattern，不截断
    failedVerb: "Failed to search",// 5TBFjwTdcs
  };
```
最终串由 `KH()` 拼成 `[verb|runningVerb|failedVerb, meta].join(" ")`（`c96d752d0:31549-31561`），即：
`Searching foo` → `Searched foo` → `Failed to search foo`。

**C. 代码引擎（Code / Cowork 会话）** —— `c96d752d0:11323-11325`

```js
case "Grep": case "Glob":
  return { action: "search", meta: p("pattern") };   // qyQ7t4RyYE
```

**D. 分组汇总（多工具折叠时的动词）** —— `shared-130:17979-17982`

```
glob  → "Looked for files" (8XsqEcZQPV)
grep  → "Searched files"   (ZdOS6uyq8n)
```

### 2.3 结果条目

聊天卡的 Grep/Glob **没有结果列表**。`XG` 把 `grep/glob` 归到 `read` 分支（`cc1aae219:16935-16941`），body 是文件内容预览：

```
div .border-[0.5px] border-border-300 rounded-xl mx-2.5 mt-1 mb-2 overflow-hidden bg-bg-000/30 text-xs
 └ scrollable  .max-h-[150px] overflow-y-auto
     └ <pre> .p-3 text-sm text-text-300 whitespace-pre-wrap overflow-x-auto > <code>{fileText}
```
（`:13886-13901`；`text-sm` = `.875rem`/14px，`text-xs` = `.75rem`/12px）

- **最多显示行数**：由 `max-h-[150px]` 决定，非行数硬限。按 14px/行高 `text-sm` 无显式 leading（继承 `--cds-leading-body` 20px）≈ 7.5 行；紧凑密度（19px）≈ 7.9 行。**推断**：实际可见 7 行左右，超出滚动。
- **无结果**：聊天卡没有专门的「No matches」文案（`grep` 走 read 分支，空结果即没有 body）。`No matches in file contents`（`9d9rQzQPVA`）属于 **find-in-files 面板**（`cccc2cf0a:5281`），不要混用。

### 2.4 文件浏览器里的 find-in-files（对照，非工具卡）

`cccc2cf0a:5260-5345`，`PS` 组件：

| 状态 | 文案 |
| --- | --- |
| 无 query | `Type after ? to search in files`（`Tx2alpU2nm`） |
| 正则非法 | `Invalid regular expression`（`9U7wSIt+Qa`） |
| 加载中 | 骨架 `C` |
| 0 结果 | `No matches in file contents`（`9d9rQzQPVA`） |
| 单文件命中过多 | `More matches in this file.`（`6XzD/WRhU9`），行高 `h-control`，`app-list-row` |
| 总数截断 | `Only {count, plural, one {# match is} other {# matches are}} shown. Keep typing to narrow.`（`8//Rlb3ezL`） |

条目结构：文件行（`NS`，`showPath:true`，`ArrowUpRight` 标记 `data-testid="file-tree-link-mark"`）+ 每个命中行（`FS`，key = `relativePath:line:column`，行号列 `min-w-[2.5ch] text-footnote text-muted-as-secondary tabular-nums text-end`，`:5405`）。

---

## 3. WebSearch

组件 `sW`（`cc1aae219-Bd1YvDXP.pretty.js:14849-14988`），导出 `cW`；TimelineGroup 包装 `pG`（`:16290-16310`）。

### 3.1 标题状态机（确证，逐分支）

| 条件 | 文案 | id |
| --- | --- | --- |
| 无结果且未结束 / 无 query 且有 titleOverride | `Searching the web` | `5KajyzHSXj` |
| `is_error && !cancelled && 结果数==0` | `Couldn’t complete this search.` + 空格 + `<span class="text-muted">{query}</span>` | `PF2CCf1+ZX` |
| 正常完成、有 query | `{query}`（原文，不加引号、不加粗） | — |
| cancelled / 被停止 | `Stopped searching the web` | `bCLH7sVUr7` |
| is_error 但有结果 | `Searching the web` | `5KajyzHSXj` |
| 完成 | `Searched the web` | `4+310Bnuvz` |

`titleOverride` 优先（`dG()` → `block.message`，`:16284-16286`），即服务端下发的整句会覆盖上述模板。

### 3.2 结果数（secondaryText）

```js
N && C > 0 ? "{count, plural, one {# result} other {# results}}"   // s88ium+h8p
: (w && !D && !E && A) ? "...{count:0}..." : undefined            // 空数组 → "0 results"
```
`:14901-14912`。渲染为 header 右侧 `p.ps-1 text-muted font-small tabular-nums?` —— 实际类名只有 `ps-1 text-muted font-small shrink-0 whitespace-nowrap`（`:13459`），**没有** `tabular-nums`。

### 3.3 结果数据来源

`S = x(() => sS(t), [t])`，`sS` = `c730da5ef-BsFiq_pk.pretty.js:36-84`：
- 优先解析 `content[]` 里的 `type:"knowledge"`（`title / url / metadata.site_domain / metadata.favicon_url`）；
- 否则找文本里的 `Links:`，其后必须是 JSON 数组，只保留 `url` 为 string 的项，`siteDomain = new URL(url).hostname`。

字段：`{title, url, siteDomain, faviconUrl}`。**没有摘要（snippet）字段**，也没有缩略图。这是硬结论：WebSearch 结果行只显示「favicon + 标题 + 域名」。

### 3.4 结果列表（两种渲染器）

`z = Fx()`：真 → 新版 `result-list`（`nW`/`tW`，`:14730-14832`）；假 → 旧版带框列表（`:15959-14970`）。

**新版 `result-list`**（`:14747-14832`）

```
div[data-testid="result-list-box"] .@container rounded bg-alpha-1 p-1 font-sans text-footnote
 ├ div .min-w-0 px-1.5 pt-1 pb-0.5 break-words text-secondary > <bdi>Results</bdi>   ← label
 └ div[role=list][data-testid="result-list"] .grid
      grid-template-columns: [28px] minmax(30%,1fr) fit-content(40%)… 20px            (:14741-14746)
      └ div[role=listitem] .group/result-row col-span-full grid grid-cols-subgrid
           items-center rounded-sm px-1.5 py-1.5 text-start no-underline
           +cursor-interactive hover:bg-fill-ghost-hover
         ├ span .flex size-4 items-center justify-center text-primary  ← favicon（28px 列）
         ├ <bdi> .truncate text-primary                                  ← 标题
         ├ span .ps-5 text-muted   (每个 detail 列，域名)                 ← fit-content(40%)
         └ CaretRight size=xs .justify-self-end text-muted
              opacity-0 group-hover/result-row:opacity-100 [@media(hover:none)]:opacity-100
```
末尾 `+{count} more`：`div[data-testid="result-list-more"] .px-1.5 py-1 text-muted`（`:14822-14827`）。`tW` 支持 `moreCount` 入参，但 **WebSearch 调用时没传**（`:14952-14956` 只传 `items / label / detailColumns`）。

**新版行数上限：无。** `sW` 直接 `S.map(...)` 全量渲染（`:14964-14967`），`B`（`result-list` items）也是 `S.map`（`:14918-14945`），没有任何 slice 或上限常量。

> 易混淆点：`wG`（`:16343-16353`）里确有 `CG = 64` → `rows.length > 64 ? slice(0,64)`，但那是**另一族工具**（hub simple params 的通用结果表）的封装，WebSearch 走的不是它。本报告曾误把 64 套到 WebSearch 上，此处更正。

`AG()`（`:16376-16411`）给每个 item 的 `subtitles` 做列数裁剪：存在域名列时 `slice(0,1)`，否则 `slice(0,3)`（`DG=3`, `OG=1`，`:16373-16382`）—— 这只影响 `wG` 那条路径。

**旧版**

```
div .border-[0.5px] border-border-300 rounded-lg p-1 mx-2.5 mt-1 mb-2
    max-h-[150px] overflow-y-auto bg-bg-000/50
 └ div .flex flex-col gap-1
    └ a[target=_blank][rel=noopener noreferrer] .flex flex-row gap-3 items-center py-1.5
          w-full px-2 rounded-md transition-colors hover:bg-bg-200           (:14254-14263)
      ├ img favicon size=12 fadeInOnLoad
      ├ div .w-0 flex-grow truncate font-small text-text-300                ← 标题
      └ div .text-xs text-text-400 shrink-0                                 ← 域名（cS(url)）
```
`max-h-[150px]` + 行高 ≈ 6 行可见（`py-1.5`=6px×2 + 12px 行 ≈ 24px/行）。

### 3.5 点击行为

行本身是 `<a href={url} target="_blank" rel="noopener noreferrer">`，`onClick` 里 `preventDefault()` 后调 `onResultClick(url)`（`:14930-14942`、`:14248-14253`）。
**推断**：点击走应用内链接处理（`onResultClick` 由宿主传入，通常打开内嵌预览或侧栏），而不是裸浏览器外链；`target=_blank` 只在未拦截时兜底。旧版行同样拦截。

### 3.6 引用编号 / citation

WebSearch 结果行**没有编号**。引用角标在助手正文里，见 §8。

### 3.7 折叠开关

`collapsible = collapsibleWebSearchRows`（`:16305`）。开启时 `hideCaret: !d` → 显示 caret，body 包 `qH`（`overflow-clip`）；关闭时 caret 隐藏、body 常驻。全局开关来自 `Ga("webSearchRowsCollapsed")`（`:21657`）。

---

## 4. WebFetch

组件 `$U`（`cc1aae219:14636-14721`），宿主分支 `zG`（`:16453-16474`）；另一套独立实现 `QQ`（`:26168-26238`，带外链确认弹窗）。

### 4.1 标题状态机

| 状态 | 渲染 | id |
| --- | --- | --- |
| 流式、有 hostname | `Reading {hostname}` | `pWSKVH/h6d` |
| 流式、无 hostname | `Reading a page` | `nxxRes7Qf3` |
| 失败 | `Couldn’t read` + ` ` + `<span class="text-text-400" dir=auto>{title或url}</span>` | `FaF0pZhJOG` |
| 取消 | `Stopped reading the page` + ` ` + muted title | `hgLumeKZVX` |
| 完成（`noUrlLabel=false`） | `{title}`，否则回退 `{url}` | — |
| 完成（`noUrlLabel=true`） | `Read a page` | `XJU1UZCozL` |

第二套（`QQ`）：`Fetching from {hostname}` / `Fetching from site` / `Failed to fetch <b>{title}</b>` / `Fetched <b>{title}</b>`，其中 `<b>` 被替换成 `span.text-muted-as-secondary > bdi`（`:26193-26217`）。

### 4.2 URL / 域名展示

- 主位是 **title**（或用 URL），**不做截断省略**（`truncate` 由 header 的文本容器统一加）。
- 右侧 `secondaryText = hostname`（`x = GU(v)`）**仅**在成功路径与 `titleOverride` 路径赋值；失败（`w`）与取消（`C`）分支不赋值 `M`，故右侧不显示域名（`:14670-14694`，`M` 只在 14671 与 14693 赋值）。
- `secondaryIcon`：完成且非停止时挂 `ArrowOutSquare`（`:14711`）。
- 图标：`<Ar url={v} size={l} fadeInOnLoad fallbackSvg={<Globe/>} />`，即站点 favicon，失败回退 Globe（`:14702-14707`）。注意 `url` 传的是 `A = c ? void 0 : v`，即**输入仍在流式时 favicon 不加载**（`:14666`）。
- `href` + `handleClick` 只在**未停止且未失败**时生效（`href: T ? void 0 : b`，`:14699`）。

### 4.3 抓取正文的呈现

**卡内不呈现正文。** `children: g` 只放 egress 提示（`jK`，`orgUuid` 命中时显示「组织网络策略拦截了该网站」）。没有摘要、没有可展开全文。
> 证据：`cc1aae219:14718`（`children: g`），`zG` 不传 children（`:16453-16473`）；`QQ` 的 children 只有 `g && <jK/>`（`:26233`）。

### 4.4 失败 / 超时 / 拦截提示

错误码 → 文案（`ZQ`，`:26137-26166`）：

| error_type | 文案 |
| --- | --- |
| `INVALID_URL` | The URL provided is invalid |
| `URL_NOT_FOUND` | Could not find this URL |
| `RATE_LIMIT_EXCEEDED` | Access to this website has been restricted due to rate limits |
| `ROBOTS_DISALLOWED` | This website has blocked Claude via robots.txt rules |
| `URL_TOO_LONG` | The URL provided is too long |
| `EGRESS_BLOCKED` / `SITE_BLOCKED` | Access to this website is blocked |
| `PERMISSIONS_ERROR` | The URL was not provided by the user nor was it contained in any web search/fetch results |
| `UNKNOWN_ERROR` / `SERVER_ERROR` / `CLIENT_ERROR` | An unknown error occurred |
| `undefined` | 不显示 |

- 企业网络拦截额外一条：`Your organization’s network settings block this website. Ask your admin to allow it.`（`IvbP2tBTa6`，`:18303-18313`）。
- **没有超时专用文案**；超时与其它错误同归 `UNKNOWN_ERROR`（**推断**，`ZQ` 无 timeout 分支）。
- 外链确认弹窗：`LC`，`onConfirm: () => window.open(url, "_blank", "noopener,noreferrer")`（`:26218-26235`）。

---

## 5. TodoWrite

### 5.1 入口与数据

`TodoWrite` / `TaskCreate` / `TaskUpdate` 三者归一到 `todo` kind（`cb6930dae:3626-3629` → `Lu`），`TaskStop` 也归到 todo（`c05b96c7f:5302-5305`）。
解析：`c28efd0ef-D4wDCd_R.pretty.js:49-91`

```js
TodoWrite: e.clear();                                  // 整体替换，不是增量
  id = o.id ?? `todo-${index}`
  content = o.content ?? o.text ; status = r(o.status) // completed|in_progress|其它→pending
  activeForm = o.activeForm
TaskCreate: id = toolUseId || `task-${size}`, status 初始 pending
TaskUpdate: status === "deleted" → 删除；否则就地更新 content/status/activeForm
```
状态归一：`e === "completed" ? "completed" : e === "in_progress" ? "in_progress" : "pending"`（`:8-10`）。

工具行动词（`c52b02f3f:1039-1047`）：空数组 → `Cleared todos`（`QesC5nGO2a`），否则 `Updated todos`（`rw+BezBPAV`）；运行中 `Updating todos`（`yIOz3cdgmn`）。

### 5.2 待办列表 UI（transcript 内）

`Lu`（`cb6930dae-cMUr1OjZ.pretty.js:3887-3907`）

```
ul .flex flex-col gap-xs text-body select-text py-xs
 └ li .flex items-start gap-1
       completed → "text-secondary [--code-chip-ink:currentColor]"        (mutedDone=true)
                   或 "line-through decoration-1 text-secondary"           (默认)
       其它      → "text-primary"
    ├ span 状态 glyph（ua，:457-492）
    │   completed  → Check（普通）/ CheckCircleFilled（mutedDone），text-primary 或 text-secondary
    │   in_progress→ 旋转 spinner（spin 默认 true）或 DotsCircle，text-primary
    │   pending    → Placeholder，text-muted-as-secondary
    │   每种都带 sr-only：done / in progress / not done
    └ div .epitaxy-markdown-inherit-color min-w-0 flex-1
        └ 文本（走 markdown 渲染器 Nn，支持行内 code/链接）
```

**关键排版事实**：完成项**只加删除线并降色，不降字重** —— `li` 上没有 `font-*` 类，`ul` 是 `text-body`（继承 400）。删除线粗细 `decoration-1` = `text-decoration-thickness:1px`（CSS 确证，见 §9.4）。

### 5.3 进度计数「3 of 7」

两处，格式不同：

| 位置 | 格式 | 证据 |
| --- | --- | --- |
| 状态栏 Progress 分区摘要 | `{done} of {total}`（id `hd07WZo2x3`） | `cf74bc599-C-uiMSfs.pretty.js:10639-10647` |
| 多代理 phase 头 | `{done}/{total}`（id `ihIcdpwqY4`），`tabular-nums` | `c96d752d0:52993-52997` |
| 子代理汇总 | `{done} of {total} agents done, {running} running, …` | `c96d752d0:52586-52592` |
| 问题卡翻页 | `{position} of {count}`（`GW+MSxzG18`） | `ccae33cda:1021-1025` |

### 5.4 是否是持久浮层

- transcript 内：普通工具卡，随消息滚动，**不是**浮层。
- 「持久」形态有两个，且**都不是 TodoWrite 卡本身**：
  1. **状态栏 Progress 分区**：`ag`（rollup section）+ `pD`，标题 `Progress`（`sIMS7iH+wa`），摘要 `{done} of {total}`，内容 `Lu` 包在 `px-xs py-1` 里（`cf74bc599:10637-10648`、`:10766-10776`）。
  2. **Status 浮卡** `qS`（`cf74bc599:6648-6679`）：`epitaxy-root text-body text-primary rounded-card bg-alpha-1`，header `Status`（`tzMNF3jWoU`）+ 关闭按钮（`Dismiss status`），全部完成或手动关闭即 `null`。
     推断：这是 Cowork/Code 会话里的悬浮状态块，`rounded-card` + `bg-alpha-1` 而不是 border，符合浮层视觉。

### 5.5 侧栏 Todo 轨道（rail）样式

`c4038fd41-pNwXVTBb.pretty.js:23-97`（紧凑 rail 版本）：

- 每条：`div.group/todo .relative flex items-stretch gap-2.5 py-1.5`（默认 `pe-6`）；`cb6930dae` 的非紧凑版本是 `div.group/todo flex relative`（`:390`）。
- 轨道：`span.absolute left-1/2 w-0.5 -translate-x-1/2 bg-alpha-2`，未完成段用 `bg-alpha-3` 覆盖（`:329-340`）。
- 当前项 knob：`size-[7px] rounded-full bg-current text-muted-as-secondary shadow-[0_0_0_2px_var(--panel-card-surface,var(--cds-surface-1))]`（`:362-367`）；clay 主题变体用 `S` 组件 size 8（`:351-361`）。
- 末项完成：`CheckCircleFilled`，`absolute left-1/2 top-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--panel-card-surface,…)] text-secondary shadow-[0_0_0_2px_…]`（`:342-347`）。
- 折叠先前步骤：`A(e)` = `max(0, 前导 completed 数 - 2)`（`:88-93`，常量 `k = 2`）→ 按钮文案 `{count, plural, one {# earlier step} other {# earlier steps}}` / 展开后 `Hide earlier steps`（`:177-182`）。
- 折叠动画：`grid-rows-[0fr]`↔`[1fr]`（`transition-[grid-template-rows] duration-base ease-out`，`:103`）。

### 5.6 非紧凑编号列表（Code 会话 / 面板）

`K`（`c4038fd41:384-441`）：

| 状态 | 勾选/序号样式 | 文字 |
| --- | --- | --- |
| completed | `div.w-6 h-6 rounded-full bg-fill-accent-hover` + `Check size-xs text-bg-100` | `span.text-muted-as-secondary line-through transition-colors duration-200` |
| in_progress | `div.w-6 h-6 rounded-full bg-alpha-1 border border-accent-200` + `span.text-xs font-bold text-muted-as-secondary`{number} | `span.text-primary`，内容取 `activeForm \|\| content` |
| pending | `div.w-6 h-6 rounded-full bg-alpha-1` + 序号 | `span.text-secondary` |

行距：`div.pb-3 text-sm flex-1 min-w-0 pe-6`，末项 `pb-0`（`:406`）。

### 5.7 终端视图里的 todo

`cf6989767-CXXjtvjM.pretty.js:435-448`：`☒`（completed，class `terminal-todo-done`）/ `☐`（`terminal-todo-active`）；CSS `.epitaxy-terminal-view .terminal-todo-done{color:#6e6b64;text-decoration:line-through}`（`:36`）。

---

## 6. Task / 子代理

### 6.1 卡片结构

`FU`（导出 `IU`，`cc1aae219:14374-14496`），入口 `GG`（`:16765-16805`）。

```
XH  (= tool row shell)
 ├ icon: Agent size=sm（header） / size=md（iconSize="md"）  text-text-500
 ├ text: description（截断到 Kr(...)）或 "Running subagent"（XGkVpOO9dA）
 ├ secondaryText: <span.flex items-center gap-1 text-sm>
 │     [Done|Failed|Stopped] [· {n} steps]  CaretRight size=sm
 │     CaretRight: transition-transform duration-200，展开时 rotate-45       (:14417-14431)
 ├ hideCaret: true                                                          (:14439)
 └ onClick 仅当有子块时可切换                                                (:14440)
   children（展开后，:14447-14492）
   └ div .overflow-hidden > div .mt-1 > MU（嵌套 timeline，borderless autoCollapse=false）
       └ 每个子块：
          asStepRow（子代理自己的 transcript）→
            div .flex items-start gap-xs ps-xs
             ├ span[data-testid="subagent-elbow"] .flex h-control w-3 shrink-0 items-center
             │   └ span .size-3 -translate-y-1/2 rounded-es-chip border-s border-b border-strong
             └ div .min-w-0 flex-1 > 子工具行
          否则 → div > 子工具行
```

- `outcome` 取值来自 tool result：`t ? (Mp(t) ? "stopped" : t.is_error ? "failed" : "done") : undefined`（`:16778`）。
- `steps` 数只统计 `type==="tool_use" && !gy(e)` 的子块（`:16780`）。
- **子代理的实时消息不内联显示**：展开只列子工具调用行（`renderSubagentBlock`），不含子代理的正文/思考。正文通过 hand-back 以 `[Subagent hand-back]` 框架的独立消息出现（`c7d4a4512:1946`、`:2104`）。
- 文案：`Report from subagent` / `Message from subagent`（`c96d752d0:22840-22842`）、`Sent by a subagent`（`:15473`）。

### 6.2 `epitaxy-agent-cell-*` 七状态视觉（CSS 原文）

`c96d752d0:52512-52514`（inline style 注入）：

```css
.epitaxy-agent-cell{background-color:#0000;border:1px solid #0000;
  transition:background-color .16s,border-color .16s,opacity .16s,filter .16s}
.epitaxy-agent-cell:hover{filter:brightness(.9)}
[data-mode=dark] .epitaxy-agent-cell:hover{filter:brightness(1.1)}
.epitaxy-agent-cell--done{background-color:var(--cds-alpha-3)}
.epitaxy-agent-cell--running{background-color:var(--cds-fill-accent);
  animation:epitaxy-agent-pulse var(--epitaxy-pulse-dur,2.8s) ease-in-out var(--epitaxy-pulse-delay,0s) infinite}
.epitaxy-agent-cell--stalled{background-color:var(--cds-fill-warning)}
.epitaxy-agent-cell--error{background-color:var(--cds-fill-danger)}
.epitaxy-agent-cell--stopped,.epitaxy-agent-cell--pending{border-color:var(--cds-alpha-3)}
.epitaxy-agent-cell--ghost{border-color:var(--cds-alpha-3);
  animation:2.2s ease-in-out infinite epitaxy-agent-ghost-pulse}
@keyframes epitaxy-agent-pulse{0%,to{opacity:1}50%{opacity:.72}}
@keyframes epitaxy-agent-ghost-pulse{0%,to{opacity:.25}50%{opacity:.9}}
@media (prefers-reduced-motion:reduce){.epitaxy-agent-cell{transition:none}
 .epitaxy-agent-cell--running{animation:none}
 .epitaxy-agent-cell--ghost{opacity:.45;animation:none}}
```

几何（`p1`，`:52601-52606`）：`span.epitaxy-agent-cell shrink-0 rounded-xs`，`width/height = u1 = 6px`（`:52515`），网格 `gap = d1 = 2px`（`:52516`）。

脉冲抖动（`I0e`，`:52594-52600`）：`--epitaxy-pulse-dur` = `2.4 + frac(i·0.7549)·1.4` s（2.4–3.8s），`--epitaxy-pulse-delay` = `-frac(i·0.618)·dur`。

状态中文含义（`f1`，`:52531-52538`）：

| class | 语义键 | 英文文案 | 视觉 |
| --- | --- | --- | --- |
| `--pending` | `pending` | **Queued**（`Cnm0QAkWnp`） | 透明底 + 1px `alpha-3` 描边 |
| `--running` | `running` | **Running**（`nDyaq/M7Oj`） | 实心 accent 蓝 + 2.4–3.8s 呼吸（opacity 1↔0.72） |
| `--stalled` | `stalled` | **Stalled**（`k8l06lFyli`） | 实心 warning 黄 |
| `--done` | `done` | **Done**（`JXdbo8Vnlw`） | `alpha-3` 灰底（20% 中性色） |
| `--error` | `error` | **Failed**（`vXCeIi67rj`） | 实心 danger 红 |
| `--stopped` | `stopped` | **Stopped**（`1LBny5MvRa`） | 透明底 + `alpha-3` 描边（与 pending 同视觉，靠 tooltip 区分） |
| `--ghost` | `ghost`（`h1`） | **More agents may appear**（`s8hQbj7ac0`） | 透明底 + `alpha-3` 描边 + 2.2s 幽灵脉冲（0.25↔0.9） |

> `--stopped` 与 `--pending` 的 CSS 完全相同（同一规则合并），语义区分只在 aria/tooltip 层。

Hover 提示（`_1`，`:52614-52658`）：`os` tooltip，`delay: 150`，`hoverable: false`，`closeOnClick: false`，`trackCursorAxis: "both"`，内容 = 状态词或 summary，`detail` = 该 agent 的 label。

### 6.3 汇总文案与网格

`N0e`（`:52574-52593`）：

```
total === 0 → "Waiting for agents to start"   (puP9QWxX+t)
stopped > 0 → "{done} of {total} agents done, {stopped} stopped, {error} failed"   (2ZhM3AN1KC)
否则        → "{done} of {total} agents done, {running} running, {stalled} stalled, {error} failed"  (ANPBErKpM2)
```
（`running` 传的是 `running - stalled`）

网格容量（`v1`，`:52660-52704`，常量 `:52515-52522`）：
- 单行模式：`repeat(auto-fill, 6px)`，`gap:2px`，`maxHeight: 6px`；
- wrap 模式：`maxRows = O0e = 4` 行 × `w0e = 8px` 行距 → `maxHeight = 4*8-2 = 30px`；`cols` 指定时 `repeat(cols, 6px)`；
- 容量换算：单行 `E0e = 36` 个，wrap `D0e*n = 35*4 = 140` 个；
- 超出容量按比例配额 + 最大余数法分配（`j0e`，`:52540-52558`），并出现 ghost cell（`anticipate`）。
- 每个 agent 的明细表（`q0e`，`:52830-52867`）：表头 `Agent / Model / Tokens / Time`，行高 `gridAutoRows: 16px`，`gap-x-sm gap-y-1`，列模板三档响应式（`:52818-52823`）。

---

## 7. Plan 模式

### 7.1 「计划」的三处 UI

| 位置 | 组件 | 说明 |
| --- | --- | --- |
| 聊天内的计划正文 | `Ru`（`cb6930dae:3908-3938`） | 待批准/运行中：左侧 2px 竖线引用块；已批准：✓ + `Plan approved` |
| 审批卡 | `aDe`（`c96d752d0:4775-5170`），挂载条件 `tool.name === "ExitPlanMode"`（`:14346-14368`） | `epitaxy-approval-card` 外壳 |
| 计划面板（侧栏） | `Iv`（`cccc2cf0a:1417-1433`），滚动容器 `Mv` + `data-epitaxy-plan-scroll` | 全文 + 内联评论 + Tasks |

**`plan-first` / `plan-led` / `plan-first-compact` 与计划模式无关**，见 §0。

### 7.2 计划面板结构（`epitaxy-plan-scroll`）

```
div[data-epitaxy-plan-scroll]  = Mv (:1343-1349)
  class: h-full select-text overflow-y-auto [contain:strict]
         [scrollbar-gutter:stable_both-edges] p-lg
  └ div.mx-auto.max-w-[68ch]
      ├ Sv（可选）→ div.mb-[var(--chat-item-gap)] flex items-center gap-1
      │             text-caption text-muted-as-secondary   ← "Select any text to leave a comment for Claude"
      ├ fa(font=sans, size=sm) > Av（markdown，`yf.Provider value="prose"`）
      └ after: Nv → section.mt-pad-lg
                 h2.kg.mb-1.25 "Tasks"（yhU1etXT1A）
                 + Lu（todo 列表）
```
- 空态：`No plan yet`（`iKKWKBxt8H`）/ `Claude writes the plan here as it explores. Keep chatting.`（`tRF6CXCuTR`）；加载中 `Loading…`；加载早期消息失败 `Couldn’t load earlier messages` + `If Claude wrote a plan earlier in this session, it can’t be shown here.`（`:1388-1413`）。
- 滚动锚点只用于**选区评论**：`a.current?.closest("[data-epitaxy-plan-scroll]")`（`:1120`, `:1173`）。
- **最大高度 / 滚动**：面板本身 `h-full`，滚动由 `overflow-y-auto` + `[contain:strict]` 承担；`p-lg` = `--cds-pad-lg`（comfortable 16px / base 12px）。
- 选区评论高亮 CSS（`c96d752d0:73658-73661`）：`::highlight(epitaxy-plan-selection){color:highlighttext;background-color:highlight}`，Windows 走 `-recolor-builtin`（`#0041c6`）。

### 7.3 批准 / 修改按钮

`aDe` 的 actions 区（`:5072-5165`），外壳 `div.epitaxy-approval-actions flex flex-wrap justify-between gap-x-1 gap-y-[8px]`：

**默认态**

| 位置 | 按钮 | 行为 / 快捷键 |
| --- | --- | --- |
| 左 | `Reject`（`VzIOKf1uNn`，secondary） | `re({kind:"reject", feedback:""})` |
| 左 | `Revise…`（`PA0R7vOPMW`，secondary） | `shortcut: "esc"` → 进入反馈态 |
| 右 | （多选项时）`dpe` 下拉主按钮 | `onPrimaryClick → accept(targetMode=S)`，`shortcut: "cmd+enter"`，`aria-label: "More accept options"`（`8dbgSEhrkR`） |
| 右 | `Accept and allow edits`（`Iaq0DNUS9V`，secondary） | 当 `S !== "default" && defaultAcceptAllowed`，`shortcut: "cmd+shift+enter"` |
| 右 | `Return to terminal`（`sKG0MoMglY`） | 仅 `isUltraplanMode` |

**反馈态**（`K = A || hasComments`）

| 按钮 | 说明 |
| --- | --- |
| `Back`（`cyR7KhiuaU`，secondary） | 有内联评论时隐藏（`[@container_(max-width:420px)]:hidden` 反而不是这条，注意区分） |
| `Revise`（`p4J+lV5p5N`，primary） | 提交 `reject` + feedback |

- 接受目标模式的文案（`MT`，`:4766-4771`）：`Accept` / `Accept and allow edits` / `Accept and auto mode` / `Accept and bypass permissions`。
- 反馈输入：`textarea rows=3`，`aria-label="Plan feedback"`（`5+lBxMnx8m`），placeholder 依内联评论有无切换：
  - 有评论 → `Anything else to add?`（`7A3gQkZ3c/`）
  - 无评论 → `What should change? (optional)`（`99X62wRl9v`）
- 键盘：`cmd+enter` 接受（shift 时 `targetMode=default`）、`esc` 进入 Revise、`cmd+shift+enter` 接受并回 default 模式（`:4958-4996`）。
- 内联评论列表 `oDe`（`:5171-5225`）：`ul.flex max-h-[176px] scroll-p-[8px] flex-col gap-1 overflow-y-auto -m-[8px] p-[8px]`，每项 `li.flex items-center gap-0.5 rounded-[5px] bg-alpha-1 pe-1.25 hover:bg-alpha-2`，含 `ChatSimple xs` 图标 + 选中文本（`text-caption text-muted-as-secondary`）+ 评论正文（`text-body text-primary`）+ 删除按钮。
- 头部：`Claude proposed a plan`（`uwYMasx1yw`）+ 右侧 `Open plan` 链接（`/5O7cdFfl5`）。
- 卡壳：`MC` = `epitaxy-approval-card relative isolate flex flex-col rounded-card p-[12px] gap-[12px] max-h-[60vh] origin-top @container animate-code-approval-promote`（`c12c146ad-JEShQW8k.pretty.js:118-119`）。`card` 呈现模式下额外：`--approval-card-pad-l/r: var(--cds-pad-lg)`、`border-radius: calc(var(--cds-radius) + .25rem)`（`cb6930dae:504`）。

### 7.4 计划相关的状态文案

| 场景 | 文案 | id | 证据 |
| --- | --- | --- | --- |
| ExitPlanMode 运行中 | `Proposing a plan` | — | `shared-130:14785` |
| ExitPlanMode 完成 | `Proposed a plan` | `g2/R6xvgIA` | `shared-130:18051-18052` |
| 工具动词 | `Proposed plan` / `Proposing plan` / `Failed to propose plan` | `OOujErWXBR` / `WZ2fCj8VUf` / `TBvKNM6xbZ` | `c52b02f3f:1055-1061` |
| EnterPlanMode | `Started planning` / `Making a plan` | `qha/thgxcv` / `lYgHzdY14t` | `c52b02f3f:1048-1054` |
| `update_plan` 结果 | `Created a plan` / `Plan rejected` / `Plan not approved` / `Following a plan` | `aXfQ2L8ErF` / `7wJz7kSrLT` / `2eSX+DXCfe` / `UJdVFK2KyY` | `shared-130:17761-17772` |
| 正文内已批准 | `Plan approved`（`CheckCircle`, `text-success`） | `htmyA3WAQx` | `cb6930dae:3924-3928` |

跨会话审批弹窗（`rc-plan-dialog`，`frame-shell-chrome-CAw-tYzh.pretty.js:51545-51665`）：`Review plan` 标题、`pre.max-h-[320px] overflow-auto whitespace-pre-wrap rounded bg-surface-1 p-md text-caption`、`Reject…` / `Approve plan` / `Reject plan`、拒绝理由 `textarea.maxLength=1300`、截断/空计划禁用批准。

---

## 8. AskUserQuestion

三套 UI 并存：新版 `epitaxy-question-card`（`ccae33cda-CLjcZCAe.pretty.js`）、旧版 question card（`c05b96c7f:1347-1536`）、回答回执 `epitaxy-question-receipt`（`cb6930dae:518-560`）。

### 8.1 `epitaxy-question-card` 结构

`nn`（`ccae33cda:779-1186`）：

```
rt = 审批卡外壳（c12c146ad:126-144）
  className: "epitaxy-question-card max-w-[480px] outline-none"
  role="group"  aria-label="{question}"
  CSS 覆写：gap:0; max-height:none; padding:0; overflow:clip   (cb6930dae:504)

 ├ div .bg-alpha-1 px-lg flex gap-md py-md [items-center | items-start]
 │  ├ 题干：text-body text-primary select-text break-words        (单行题)
 │  │   或 text-body-semibold text-primary text-balance {title}
 │  │      + div[data-engine-confirm-body] text-body text-secondary text-pretty {body}
 │  └ 翻页器（仅 count>1）：span .-my-xs -me-sm flex shrink-0 items-center gap-xs
 │       text-caption text-muted-as-secondary
 │       [CaretLeft ghost iconOnly] "{position} of {count}" [CaretRight ghost iconOnly]
 │
 ├ Te（滚动区）> div.flex.flex-col
 │  ├ 每个选项 tn：
 │  │   button.epitaxy-answer-option flex w-full items-start gap-md px-lg py-lg
 │  │          text-start focus-visible:outline-hidden hide-focus-ring focus-visible:shadow-focus
 │  │   aria-pressed={selected}
 │  │   ├ 单选 → Rt（epitaxy-radio-mark）/ 多选 → fe（勾选框）
 │  │   └ div .flex min-w-0 flex-1 flex-col gap-xs select-text
 │  │       ├ div .text-body text-primary                        ← label
 │  │       └ div .text-body text-secondary                      ← description（可选）
 │  └ Other 行：
 │     div.epitaxy-answer-option relative grid grid-cols-[auto_1fr]
 │        items-start gap-x-md gap-y-sm px-lg py-lg
 │       ├ button.absolute.inset-0（透明覆盖，aria-label="Other"）
 │       ├ 勾选标记 + span "Other"
 │       └ textarea（选中后出现）placeholder "Type your own answer here"
 │            rows=1 autosize maxHeight: calc(4lh + 2*pad-sm)
 │
 └ div.epitaxy-approval-actions flex items-center justify-end gap-sm px-lg pb-lg pt-md
    ├ Skip（secondary，/4tOwTiCH6）
    └ Next / Submit（primary，shortcut "cmd+enter"，最后一题显示 Submit）
```

CSS 分隔线：`.epitaxy-root .epitaxy-answer-option+.epitaxy-answer-option{border-top:1px solid var(--cds-border)}`（`cb6930dae:504`）。

### 8.2 单选 / 多选 / 自定义

- **单选**：`Rt`（`:654-662`）

```js
span[aria-hidden][data-checked][data-unchecked].epitaxy-radio-mark
  children: checked ? span.epitaxy-radio-mark-dot : null
```
```css
.epitaxy-radio-mark{width:var(--cds-checkbox,1rem);height:var(--cds-checkbox,1rem);
  border:1px solid var(--cds-border-strong);background:0 0;border-radius:9999px;
  flex-shrink:0;justify-content:center;align-items:center;display:flex}
.epitaxy-radio-mark[data-checked]{background:var(--cds-fill-accent);border:0}
.epitaxy-radio-mark-dot{width:calc(var(--cds-checkbox,1rem) - calc(.625rem*var(--cds-rem-scale,1)));
  height:同;background:var(--cds-on-accent);border-radius:9999px}
```
即：16px 圆环（`--cds-checkbox` comfortable = `1rem`），选中后填充 accent 并内嵌 6px 白点（`1rem - .625rem`）。

- **多选**：同一个 `tn` 组件，`isMultiSelect` 时把 `Rt` 换成 `fe`（勾选框组件），`aria-pressed` 语义不变；选中集合含 `-1` 表示「Other」。
- **自定义输入**：选中 Other 后渲染 autosize textarea，Enter 不提交（需 `cmd/ctrl+Enter`），合成输入（`isComposing`/`keyCode 229`）被排除。
- **跳过**：`Skip` → 写入 `"[No preference]"`（`Vt()`，`:667-681`）；回读时 `"[No preference]"` → `{selected:[], skipped:true}`（`Ht()`，`:682-691`）。
- **默认值**：非多选默认选中第 0 项（`qt()`，`:730-732`）；多选/无选项默认空。

### 8.3 回答回执（receipt）

`da`（`cb6930dae-cMUr1OjZ.pretty.js:518-560`）：

```
div.epitaxy-question-receipt.epitaxy-card-outline
    flex w-full max-w-[480px] flex-col overflow-clip rounded-lg select-text
    + .epitaxy-question-receipt-enter（入场动画）
 └ 每对问答：
     div .flex flex-col gap-0.5 px-lg py-md          (无 recap)
     或 div .flex flex-col gap-sm px-lg py-md        (有 recap)
        ├ div[dir=auto] .text-body text-secondary break-words   ← recap
        └ div .flex flex-col gap-0.5
            ├ div .text-body font-medium text-primary break-words     ← question
            ├ div .text-body text-secondary [overflow-wrap:anywhere]  ← answer（自由文本）
            └ ul .list-disc ps-5 text-body text-secondary             ← 多选时逐项 li>bdi
```

CSS（`cb6930dae:504`）：

```css
.epitaxy-question-receipt{margin-bottom:var(--chat-item-gap)}
.epitaxy-question-receipt>div+div{border-top:1px solid var(--cds-border)}
.epitaxy-question-receipt-enter{animation:.2s ease-out epitaxy-approval-inline-enter}
@keyframes epitaxy-approval-inline-enter{0%{opacity:0}to{opacity:1}}
```

回执状态文案（`ma`，`:583-592`）：`Skipped`（`djZCU5enGS`）/ `Replied in chat`（`gHrEoDJAVv`）/ `Not answered`（`v3Sw1mnhHS`）。
跨端一致化：`Ki()` 会把 `"[User dismissed — do not proceed, wait for next instruction]"` 归一成 `dismissed`（`cb6930dae:240`）。

### 8.4 旧版 question card（`c05b96c7f`）

```
div[data-ask-user-question] .outline-none p-4 my-4
   未提交：+ rounded-xl border border-border-300 border-0.5 bg-surface-3
   已提交：+ relative ms-[var(--msg-block-inset,0.5rem)]（无边框，走 Yc 回执列表）
 ├ 题干行：div.mb-4.flex.items-center.justify-between
 │    span.font-base.text-primary {question} + span.font-small.text-secondary "{current}/{total}"
 ├ 选项区：div.overflow-hidden.rounded-lg.border.border-border-300
 │    每项 button .flex w-full items-center justify-between p-3 compact:p-2
 │              text-start transition-colors
 │              选中 bg-accent-900/40 / 高亮 bg-surface-0 / hover:bg-surface-0
 │              非首项 border-t border-border-300
 │       ├ 多选框 div.h-4.w-4.rounded.border（选中 border-accent-000 bg-accent-000）
 │       ├ span.font-base.text-primary {label}
 │       │  + span.mt-0.5.font-small.text-muted-as-secondary {description}
 │       └ 序号 span.h-6.w-6.rounded.font-small（选中 bg-accent text-primary）
 └ 操作行：div.mt-4.flex.items-center.gap-3
      Back（rounded-lg border bg-surface-1 px-3 py-2 text-sm）
      Skip（rounded-lg border bg-surface-1 px-4 py-2 text-sm）
      Next/Submit（primary，animate-question-submit-in）
```
（`:1395-1536`、`:1209-1234`、`:1283-1305`）

### 8.5 新版选项行尺寸（composer 内联版，`shared-5-BcqPJtUL`）

```js
oE = "[--cds-question-row-h:2.75rem] compact:[--cds-question-row-h:2.25rem]"
lE = "group/row flex w-full items-center gap-2.5 min-h-[var(--cds-question-row-h)] py-1.5
      compact:py-1 px-2.5 compact:px-2 text-start rounded-xl …
      hover:bg-alpha-1 focus-visible:[box-shadow:inset_0_0_0_1px_var(--cds-fill-accent)]"
mE = "flex flex-col [--cds-question-list-limit:min(45vh,420px)]
      max-h-[var(--cds-question-list-limit)] overflow-y-auto scroll-fade-y"
dE = "flex-1 min-w-0 bg-transparent text-sm text-primary placeholder:text-muted …"
fE = "relative flex size-7 compact:size-6 shrink-0 items-center justify-center rounded-lg …"
pE = "h-[0.5px] bg-alpha-2 mx-3 transition-opacity duration-150"
```
（`:9066-9083`）→ 行高 44px（compact 36px），列表上限 `min(45vh, 420px)`。

---

## 9. 排版度量 / Typography

> 全部 Tailwind 类已换算为实际 CSS 值。变量解析基准见 §9.1。

### 9.1 度量基线（必须先读）

| 事实 | 值 | 证据 |
| --- | --- | --- |
| 根字号 | `:root{font-size:calc(100% * env(preferred-text-scale,1))}` → 桌面默认 16px | `c6a992d55-sXiDGMFQ.css` @ 1763724 |
| rem 缩放 | `--cds-rem-scale:calc(16 / 17)` **仅**在 iOS `-apple-system-body` 环境下生效；桌面为 1，故 `1rem = 16px` | 同上 @ 6832 附近 |
| 密度 | 应用默认 `data-density="comfortable"`（React 默认 `G("comfortable")`） | `shared-frame-BfjMqbuN.pretty.js:1125`、`:1330` |
| Tailwind 间距基数 | `--spacing: .25rem`（4px） | CSS @ 13450 |
| 圆角 | `--radius-xs .125rem` / `-sm .25rem` / `-md .375rem` / `-lg .5rem` / `-xl .75rem`；`rounded-card` = `calc(var(--cds-radius) + .25rem)` | CSS @ 290669-290871 |

**comfortable 密度令牌**（`c6a992d55-sXiDGMFQ.css`，`.cds-root[data-density=comfortable]`）：

```css
--cds-font-size-caption:.75rem;   /* 12px */  --cds-leading-caption:1.0625rem;   /* 17px */
--cds-font-size-footnote:.8125rem;/* 13px */  --cds-leading-footnote:1.0625rem;  /* 17px */
--cds-font-size-code:.8125rem;    /* 13px */  --cds-leading-code:1.1875rem;      /* 19px */
--cds-font-size-body:.875rem;     /* 14px */  --cds-leading-body:1.25rem;        /* 20px */
--cds-font-size-heading:.9375rem; /* 15px */  --cds-leading-heading:1.25rem;
--cds-font-size-prose:1rem;       /* 16px */  --cds-leading-prose:1.5rem;
--cds-icon:1.25rem; --cds-h-control:2rem; --cds-h-control-nested:1.375rem;
--cds-pad-xs:.375rem; --cds-pad-sm:.5rem; --cds-pad-md:.75rem; --cds-pad-lg:1rem; --cds-pad-xl:1.5rem;
--cds-gap-xs:.5rem;  --cds-gap-sm:.75rem; --cds-gap-md:1rem;  --cds-gap-lg:1.75rem; --cds-gap-xl:2.5rem;
--cds-checkbox:1rem;
```

**compact 密度（`.cds-root` 基础块）**，供对照：

```css
--cds-font-size-caption:.6875rem /*11px*/  --cds-leading-caption:1.0625rem /*17px*/
--cds-font-size-footnote:.75rem   /*12px*/  --cds-leading-footnote:.9375rem  /*15px*/
--cds-font-size-code:.75rem       /*12px*/  --cds-leading-code:1.0625rem     /*17px*/
--cds-font-size-body:.8125rem     /*13px*/  --cds-leading-body:1.1875rem     /*19px*/
--cds-font-size-prose:.875rem     --cds-leading-prose:1.25rem
--cds-pad-xs:.25rem --cds-pad-lg:.75rem --cds-gap-xs:.375rem --cds-gap-md:.75rem --cds-checkbox:.875rem
```

**transcript 覆写**（真正决定聊天里字号的一层）：

```css
.epitaxy-root .epitaxy-transcript-typography{
  --chat-body:calc(.875rem * var(--cds-rem-scale,1));   /* 14px */
  --chat-leading:1.42857;                                /* 20px */
  --chat-turn-gap:calc(var(--chat-body)*var(--chat-leading)*.75);
  --chat-item-gap:calc(var(--chat-body)*var(--chat-leading)*.5);   /* 10px */
  font-size:var(--chat-body); line-height:var(--chat-leading);}
[data-chat-text-size=s] .epitaxy-transcript-typography{--chat-body:calc(.8125rem*…)}      /* 13px */
[data-chat-text-size=l] .epitaxy-transcript-typography{--chat-body:calc(.9375rem*…); --chat-leading:1.46667}  /* 15px */
.epitaxy-root .epitaxy-transcript-typography :where(.text-body)…{
  font-size:var(--chat-body); line-height:var(--chat-line,var(--chat-leading));}
```
（CSS @ 1787586 起）—— 即：**transcript 内的 `.text-body` 一律是 14px/20px**，不管卡片原本写的是 `text-body` 还是 `text-body-semibold`；例外是 `[data-transcript-row] [data-cds=AssistantMessage]` 与 `[data-code-own-row]`，它们回落到 `--cds-font-size-body`。

### 9.2 字体族

| 位置 | font-family | 来源 |
| --- | --- | --- |
| 卡片标题（tool row 主文案） | 卡壳 `font-sans` → `var(--cds-font-sans)` = `var(--cds-font-system)` = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "PingFang TC", "Hiragino Sans", "Apple SD Gothic Neo", sans-serif` | `cc1aae219:13530`（`font-sans`）+ CSS `--cds-font-sans` |
| 若 `--font-ui` 路径生效（旧主题） | `var(--font-ui)` = `var(--font-anthropic-sans)` = `"anthropic-sans", var(--font-sans-fallbacks)`；fallback = `system-ui, "Segoe UI", Roboto, Helvetica, Arial, <CJK 回退>, sans-serif` | CSS `--font-ui` / `--font-anthropic-sans` / `--font-sans-fallbacks` |
| 搜索 query / 结果标题 / 域名 | **inherit 卡片字体**（sans），非等宽 | `result-list` 容器 `font-sans text-footnote`（`cc1aae219:14748`）；旧版行无 `font-mono` |
| WebFetch 的 URL（`noUrlLabel` 场景） | 同上 sans；**只有** `textDir="auto"`，无 `font-mono` | `cc1aae219:14692-14710` |
| Todo 列表项 | 继承 `ul.text-body` 的 sans | `cb6930dae:3889` |
| 计划正文 | `fa(font="sans", size="sm")` + `yf.Provider value="prose"`；prose 的 `--_prose-font-body: var(--_prose-face-sans) = var(--cds-font-sans)` | `cccc2cf0a:1340`、CSS `.prose` |
| 子代理名 / 状态词 | sans（`text-sm` 行内 span） | `cc1aae219:14420` |
| AskUserQuestion 选项 | sans（`text-body`，无 mono） | `ccae33cda:755`、`:770-772` |
| 等宽出现的地方 | ① `font-mono-ui` = `var(--cds-font-mono-ui)` = `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`；② `text-code` = `var(--cds-font-mono)`（同为 ui-monospace 栈）+ 13px/19px | CSS `.font-mono-ui`、`.text-code` |

**结论**：WebSearch 的 URL/域名**不用等宽**；等宽只用于代码、路径 chip（`epitaxy-code-chip`）、以及 `text-code` 装饰类。

### 9.3 字号（逐元素）

| 元素 | class / 变量 | comfortable | compact | 证据 |
| --- | --- | --- | --- | --- |
| tool row 主文案 | `text-body`（transcript 内 → `--chat-body`） | 14px / 20px | 13px / 19px | `cc1aae219:13421` + CSS |
| tool row 右侧次要文案（结果数、域名） | `font-small` | **12px** / 17px | 11px / 17px | `cc1aae219:13459`；`.font-small` = `--cds-font-size-caption` |
| 搜索行内 "+N more" | `text-muted`（无字号类 → 继承） | 继承 14px | — | `cc1aae219:14824-14826` |
| `result-list` 容器 | `text-footnote` | **13px** / 17px | 12px / 15px | `cc1aae219:14748` |
| result-list 标题 | 继承 + `text-primary` | 13px | 12px | `:14780` |
| result-list 域名列 | `ps-5 text-muted`（继承字号） | 13px | 12px | `:14785` |
| result-list label（"Results"） | `px-1.5 pt-1 pb-0.5 text-secondary` | 13px | 12px | `:14753-14757` |
| 旧版结果行标题 | `font-small` | 12px | **11px** | `cc1aae219:14274` |
| 旧版结果行域名 | `text-xs` | 12px（`.75rem` 固定，不随密度） | 12px | `:14282` |
| WebSearch 标题（查 query 的展示位置） | 就是 tool row 主文案 | 14px | 13px | — |
| WebFetch 标题 | 同上 | 14px | 13px | — |
| WebFetch 域名（secondary） | `font-small` | 12px | 11px | `:13459` |
| Todo 列表项 | `text-body` | 14px / 20px | 13px / 19px | `cb6930dae:3889` |
| Todo 序号圆（非紧凑） | `text-xs` | 12px | 12px | `c4038fd41:433`、`:439` |
| Todo 折叠按钮 | `text-caption` | 12px / 17px | 11px / 17px | `c4038fd41:174` |
| 计划面板正文 | `prose`，`--_prose-size: var(--cds-font-size-prose)` | **16px** / 24px | 14px / 20px | CSS `.prose`；`cccc2cf0a:1340` |
| 计划面板 "Tasks" 标题 | `kg as h2`（组件默认 heading 样式） | `--cds-font-size-heading` 15px | 14px | `cccc2cf0a:1365` |
| 计划引用块（聊天内） | `text-body` | 14px | 13px | `cb6930dae:3913` |
| 子代理名 | `text-body`（header） | 14px | 13px | `cc1aae219:14436` |
| 子代理状态/步数 | `text-sm`（`.875rem` 固定） | 14px | 14px | `cc1aae219:14420` |
| 审批卡标题（Proposed a plan） | `text-footnote-medium` | 13px / 17px | 12px / 15px | `c73f45bc3:6231` |
| 问题卡题干 | `text-body` / `text-body-semibold` | 14px | 13px | `ccae33cda:1055`、`:1062` |
| 问题卡选项 label | `text-body text-primary` | 14px | 13px | `ccae33cda:770` |
| 问题卡选项 description | `text-body text-secondary` | 14px | 13px | `ccae33cda:772` |
| 问题卡翻页计数 | `text-caption` | 12px | 11px | `ccae33cda:1009` |
| 回执 question | `text-body font-medium` | 14px | 13px | `cb6930dae:526` |
| 回执 answer / choices | `text-body text-secondary` | 14px | 13px | `cb6930dae:530`、`:538` |
| **citation chip** | `font-small`（外层 chip） | **12px** | 11px | `c89efce1a:2458` |
| citation 预览卡标题 | `text-body font-medium` | 14px | 13px | `c89efce1a:2543` |
| citation 预览卡站点名 | `text-caption` | 12px | 11px | `c89efce1a:2548` |

**引用角标字号（明确回答）**：不是上标 `sup`，而是 `font-small` 药丸 —— comfortable 下 **12px / 17px**，compact **11px / 17px**；chip 高度 `h-[18px]`，`rounded-full`，`px-1.5`（6px），最大宽 `max-w-[180px]`（`c89efce1a:2453-2458`）。

### 9.4 字重

| 元素 | font-weight | 变量 / 轴 | 证据 |
| --- | --- | --- | --- |
| tool row 主文案（含搜索 query） | **400**（未加粗） | `--cds-font-weight-regular` | `cc1aae219:13421` 只给 `text-body`，无 `font-medium` |
| 搜索 query 的强调方式 | 靠**颜色**：标题 `text-muted`，错误时才 `text-danger`；query 段用 `<span class="text-muted">` 与主句区分 | — | `:13421-13424`、`:14887-14893` |
| result-list 标题 | 400（继承） | — | `:14780` 无字重类 |
| 旧版结果行标题 | 400 | `.font-small` 含 `--cds-font-weight-regular` | CSS `.font-small` |
| 旧版结果行标签（"Analytics" 之类 tag） | **500** | `font-medium` | `shared-7:8742` |
| Todo 已完成项 | **保持 400**，只加 `line-through` + 降色 | 确证：li 上无字重类，颜色 `text-secondary` | `cb6930dae:3894` |
| Todo 进行中项 | 400 | — | `:3894` |
| Todo 折叠按钮 | 400 | `text-caption`（无字重） | `c4038fd41:174` |
| 计划面板 rollup 标题 | **500** | `text-footnote-medium` → `--cds-font-weight-medium: 500` | `c73f45bc3:6231` |
| 计划审批卡头部 label | 400 | `text-footnote font-normal`（`:6190` 的 `Kv`） | `c73f45bc3:6190` |
| 子代理名 | 400 | — | `:13421`（同一容器） |
| 子代理状态词（Done/Failed/Stopped） | 400 | `text-sm` | `cc1aae219:14420` |
| 代理 phase 标题 | `ks` 组件（非加粗，靠 active 着色） | — | `c96d752d0:52984-52988` |
| 问题卡题干 | 400 / **580**（`text-body-semibold`） | `--cds-font-weight-semibold: 580`；轴 `wght 560` | CSS `.text-body-semibold` |
| 回执 question | **500** | `font-medium` | `cb6930dae:526` |
| 危险/强调数字 | `font-bold` = 600，轴 `wght 660` | — | CSS `.font-bold` |
| citation chip 文本 | **400** | `font-normal` 显式声明 | `c89efce1a:2465` |

**variable font 的 wght 轴用法**（确证）：字号类与字重类同时设置两个互补属性 ——

```css
.text-body-medium{font-weight:var(--cds-font-weight-medium);           /* 500 */
  --cds-font-axis-wght:var(--cds-font-axis-wght-medium);
  font-variation-settings:var(--font-opsz-axis,) var(--cds-font-axis-wght,) "GRAD" var(--cds-font-grad,0)}
```
- `--cds-font-axis-wght-regular: ` （空）；
- Tailwind 的 `.font-medium` 直连数值时写 `--cds-font-axis-wght:"wght" 460`，`.font-semibold` → `"wght" 560`，`.font-bold` → `"wght" 660`；
- `--font-opsz-axis` 取 `"opsz" 20/24/28/48`；
- `--cds-font-grad-semibold:180`、`--cds-font-grad-bold:200` 通过 `"GRAD"` 轴注入；
- 字体文件：`anthropic-sans` variable，`font-weight:300 800`（CSS `@font-face`）。

### 9.5 字距

| 元素 | letter-spacing | 证据 |
| --- | --- | --- |
| 全局默认 | `normal`（`--tracking-normal: 0em`，未显式用时浏览器默认） | CSS tokens |
| 搜索/计划/待办/子代理卡所有文本 | **无 letter-spacing 类** → `normal` | 逐一核对上述组件的 className |
| 分区小节标题（如 `text-caption ... uppercase tracking-wide`） | `tracking-wide` = **`.025em`** | `cc1aae219:25326`（"uppercase tracking-wide mb-1"，用于某个 caption 分组头） |
| 可用的负 tracking | `.tracking-tight` = **`-.025em`**，但**未**用于本范围任何元素 | CSS `.tracking-tight` |
| citation chip | `normal` | `c89efce1a:2453-2477` 无 tracking |

**Todo 进度计数（`3 of 7`）是否 tabular-nums**：
- **状态栏 Progress 摘要**（`{done} of {total}`）：**否** —— 该 `<span>` 无 `tabular-nums`（`cf74bc599:10641-10647`）。
- **多代理 phase 的 `{done}/{total}`**：**是** —— 显式 `tabular-nums`（`c96b…:52992` / `:52993-52997`，父 span 带 `tabular-nums`）。
- **问题卡 `{position} of {count}`**：**否**（`ccae33cda:1021-1025`）。
- 其他带 `tabular-nums` 的：工具行计时 `font-base tabular-nums opacity-[0.65]`（`cc1aae219:15249`）、`result` 列计数（`cb6930dae:1400`）、find-in-files 行号列（`cccc2cf0a:5405`）。
- `tabular-nums` 的实际声明：`font-variant-numeric: var(--tw-ordinal,) var(--tw-slashed-zero,) var(--tw-numeric-figure,) var(--tw-numeric-spacing,) var(--tw-numeric-fraction,)` 其中 `--tw-numeric-spacing: tabular-nums`。

**uppercase 用在哪**：仅在资源类型 tag —— `text-[0.625rem] … uppercase font-medium`（`shared-7:8742`，10px + uppercase + 500）；`cccc2cf0a:8806` 有一处 `first-letter:uppercase`（仅首字母）。本范围里状态词（Running/Queued/Done）**不是** uppercase，直接用句首大写。

### 9.6 行高与几何度量

| 度量 | 值 | 证据 |
| --- | --- | --- |
| tool row 高度 | `py-2`（8px×2）+ 20px 行 = **36px**；有 `secondaryElement` 时 `py-1`（4px）→ 28px | `cc1aae219:13398` |
| tool row 左右内边距 | `px-2.5` = **10px**（TimelineGroup 模式 `px-0`） | `:13396` |
| 图标与文字间距 | `gap-2` = **8px** | `:13406` |
| 主文案与 caret 间距 | `gap-1` = **4px** | `:13421` |
| caret 尺寸 | `size=xs`（12px）+ `zH.SHORT` 尺寸类 | `:13449` |
| 卡内外边距 | `my-3`（12px），首块 `mt-2`（8px），末块 `mb-2` | `:13530-13533` |
| 卡边框 | `0.5px` solid `--cds-border` | `:13530` |
| 卡圆角 | `var(--msg-block-radius, 0.5rem)` = 8px | `:13530` |
| 结果列表容器（旧版） | `max-h-[150px] overflow-y-auto`，`p-1`（4px），`gap-1`（4px），`rounded-lg`（8px） | `:14962-14964` |
| 结果行（旧版） | `py-1.5`（6px）、`gap-3`（12px）、`px-2`（8px） | `:14259-14262` |
| 结果列表（新版） | `rounded bg-alpha-1 p-1`，行 `px-1.5 py-1.5`，图标列 28px，尾列 20px | `:14748`、`:14741-14746` |
| 结果列表最多显示条数 | **不限**（`S.map` 全量）；旧版靠 `max-h-[150px]` 约束可视高度 | `cc1aae219:14964-14967`；`:14962` |
| WebFetch body | **无**（不渲染正文） | `:14718` |
| Todo 勾选框尺寸 | `--cds-checkbox` = **16px**（comfortable）/ 14px（compact）；旧版多选框 `h-4 w-4` = 16px；紧凑 rail knob `7px` | CSS `--cds-checkbox`；`c05b96c7f:1222`；`c4038fd41:364` |
| Todo 行内 gap | `gap-1` = **4px**（transcript 版）；rail 版 `gap-2.5` = **10px**（`2.5 × --spacing 4px`），轨道列固定 `w-5` = **20px** | `cb6930dae:3894`；`c4038fd41:290`、`:327` |
| Todo 行垂直内边距 | `py-xs` = 6px（comfortable `.375rem`）/ 4px（compact `.25rem`）；rail 版 `py-1.5` = **6px** | `cb6930dae:3889`；`c4038fd41:290` |
| Todo 删除线 | `line-through` + `decoration-1` → **`text-decoration-thickness:1px`**；无 `underline-offset` | `cb6930dae:3894`；CSS `.decoration-1` |
| Todo 删除线的垂直位置 | 由字体默认 `text-decoration` 定位控制，未覆写 `text-underline-offset`（该属性不影响 line-through） | 同上 |
| Todo 序号圆 | `w-6 h-6` = **24px**，`rounded-full` | `c4038fd41:426`、`:432`、`:438` |
| Tab 状 track | `w-0.5` = **2px** 竖条，`left-1/2 -translate-x-1/2` | `c4038fd41:331` |
| Todo 行距（非紧凑） | `pb-3` = 12px，末项 0 | `c4038fd41:406` |
| **计划面板最大高度 / 滚动** | `h-full` + `overflow-y-auto` + `[contain:strict]` + `[scrollbar-gutter:stable_both-edges]`；内文宽 `max-w-[68ch]`；内边距 `p-lg` = **16px** | `cccc2cf0a:1344`、`:1347` |
| 计划滚动锚点属性 | `data-epitaxy-plan-scroll`（非类名，供 `closest()` 用） | `cccc2cf0a:1084`、`:1340` |
| 计划审批卡 | `max-h-[60vh]`，`p-[12px]`，`gap-[12px]`，`rounded-card`（= `--cds-radius` + 4px；comfortable `--cds-radius: .5rem` → **12px**） | `c12c146ad:118-119`、CSS `--cds-radius` comfortable |
| 计划反馈 textarea | `rows=3` | `c96d752d0:5065` |
| 内联评论列表 | `max-h-[176px]`，`p-[8px]`，`gap-1`（4px），`rounded-[5px]` | `c96d752d0:5175-5181` |
| **子代理嵌套缩进** | `ps-xs` = **6px**（`--cds-pad-xs: .375rem`）+ 肘部列 `w-3` = **12px** + 行 `gap-xs` = **8px** → 每层首项相对父级缩进 **26px**；嵌套列表容器另有 `mt-1` = 4px | `cc1aae219:14449`、`:14472`、`:14477`；CSS `--cds-pad-xs` / `--cds-gap-xs` |
| 子代理肘部图形 | `size-3`（12px×12px），`rounded-es-chip`（= `--cds-h-control-nested/4` = 22/4 = **5.5px**），`border-s border-b border-strong`（1px） | `cc1aae219:14474-14480`、CSS `.rounded-es-chip` |
| 子代理展开箭头 | `CaretRight size=sm`，展开 `rotate-45`（指向右下），`duration-200` | `:14423-14428` |
| 代理 cell | **6px × 6px**，`gap 2px`，`rounded-xs` = **2px**；单行最大高 6px；wrap 最大高 30px | `c96d752d0:52515-52516`、`:52604-52605`、`:52672-52680` |
| 代理明细表行高 | `gridAutoRows: 16px` | `c96d752d0:52838` |
| 问题卡宽 | `max-w-[480px]`；回执同 | `ccae33cda:1044`；`cb6930dae:522` |
| 问题卡内边距 | `px-lg py-md` 头部（16/12px），选项 `px-lg py-lg`（16/16px），actions `px-lg pb-lg pt-md`（16/16/12） | `ccae33cda:1051`、`:755`、`:1157` |
| 问题卡选项间距 | `gap-md`（16px 横向）、`gap-xs`（8px 纵向图文） | `ccae33cda:755`、`:768` |
| 问题卡选项分隔线 | `border-top: 1px solid var(--cds-border)`（相邻选项之间） | `cb6930dae:504` |
| 单选圆环 | 16px，border 1px；内点 6px | CSS `.epitaxy-radio-mark` |
| 问题卡列表上限（composer 版） | `min(45vh, 420px)`；行高 44px / compact 36px | `shared-5:9066`、`:9079` |
| citation chip | `h-[18px]`，`rounded-full`，`px-1.5`（6px），`max-w-[180px]`，边框 `0.5px` | `c89efce1a:2453-2458` |
| citation 预览卡 | `--preview-card-min-w/max-w: 337px`（多引用）/ `310px`（单引用） | `c89efce1a:2367`、`:2434` |
| WebSearch 结果数上限 | 无上限（旧版仅用 `max-h-[150px]` 限高滚动） | `cc1aae219:14964-14967`、`:14962` |
| todo 折叠阈值 | 前导已完成项 - **2**（`k = 2`） | `c4038fd41:88-93` |

**动效数值**（与本范围相关）

| 动效 | 参数 | 证据 |
| --- | --- | --- |
| 代理 running 呼吸 | `2.4–3.8s`（`2.4 + frac·1.4`），`ease-in-out`，`infinite`，负 delay 错峰 | `c96d752d0:52594-52600` |
| 代理 ghost 脉冲 | `2.2s ease-in-out infinite`，opacity `.25 ↔ .9` | `c96d752d0:52513` |
| 代理 hover | `filter:brightness(.9)`（深色 `1.1`），`transition .16s` | 同上 |
| todo 新行入场 | `step-in .22s var(--cds-ease-out)`：`opacity 0 + translateY(4px)` | CSS `@keyframes step-in` + `.motion-safe:animate-progress-step-in` |
| todo 轨道生长 | `rail-grow .22s`：`scaleY(0)` | CSS `@keyframes rail-grow` |
| todo knob 入场 | `knob-in .18s`：`opacity 0 + scale(.4)` | CSS `@keyframes knob-in` |
| todo 轨道微光 | `todo-rail-shimmer`：`translateY(-100%) → 100%`；`prefers-reduced-motion` 或 `html[data-reduce-motion=true]` 下 `display:none` | CSS `@keyframes todo-rail-shimmer` |
| 审批/回执入场 | `.16s` / `.2s ease-out epitaxy-approval-inline-enter`（opacity 0→1） | `cb6930dae:504` |

### 9.7 颜色层级

底色/文字令牌解析链（全部确证）：

```css
/* 中性阶 */
--cds-neutral-900: 浅 #0b0b0b (gray-900) / 深 #fff (gray-0)
--cds-neutral-600: 浅 #52514e (gray-600) / 深 #a5a49a (gray-300)
--cds-neutral-400: 浅 #898781 (gray-400) / 深 #6d6b67 (gray-500)
--cds-surface-0:   浅 #f9f9f7 (gray-20)  / 深 #0b0b0b (gray-900)
--cds-surface-1:   浅 #fcfcfb (gray-10)  / 深 #151515 (gray-850)
--cds-surface-3:   浅 #fff    (gray-0)   / 深 #20201f (gray-800)
--cds-border:      var(--cds-alpha-2)     --cds-border-strong: var(--cds-alpha-3)
--cds-alpha-1: hsl(from var(--cds-neutral-900) h s l / 5%)
--cds-alpha-2: hsl(from var(--cds-neutral-900) h s l / 10%)
--cds-alpha-3: hsl(from var(--cds-neutral-900) h s l / 20%)
--cds-alpha-4: …/35%   --cds-alpha-5: …/50%
```

| 元素 | 颜色（浅） | 颜色（深） | 变量 / 类 | 证据 |
| --- | --- | --- | --- | --- |
| tool row 主文案（含搜索 query） | `#898781`（muted） | `#6d6b67` | `text-muted` → `--cds-text-muted` | `cc1aae219:13421-13424` |
| tool row 悬停/展开 | `#52514e`（secondary） | `#a5a49a` | `group-hover/row:text-secondary` | `:13424-13425` |
| 错误态工具名 | `--cds-text-danger` = 浅 `#8e2626`(red-600) / 深 `#ec7e7e`(red-300) | 同左 | `text-danger`（`.text-danger,.text-danger-000{color:var(--cds-text-danger)}`） | `cc1aae219:14147`；CSS |
| 卡边框 | `rgba(11,11,11,.10)` | `rgba(255,255,255,.10)` | `--cds-border` = `alpha-2` | `:13530` |
| 卡背景（折叠） | `#f9f9f7` | `#0b0b0b` | `hover:bg-bg-200` → `--cds-surface-0` | `:13531` |
| 卡背景（展开） | `#fff` | `#20201f` | `bg-bg-000` → `--cds-surface-3` | `:13534` |
| 结果列表容器（新版） | `alpha-1` = `rgba(11,11,11,.05)` | `rgba(255,255,255,.05)` | `bg-alpha-1` | `cc1aae219:14748` |
| 结果行标题 | `--cds-text-primary` | 同左 | `text-primary` | `:14780` |
| 结果行域名 | `--cds-text-muted` | 同左 | `text-muted` | `:14785` |
| 结果行 hover | `--cds-fill-ghost-hover` | 同左 | `hover:bg-fill-ghost-hover` | `:14769` |
| 结果列表容器（旧版） | `bg-bg-000/50` = `#ffffff` 50% | `#20201f` 50% | `bg-bg-000/50` | `:14962` |
| 旧版结果标题 / 域名 | `text-text-300` = secondary / `text-text-400` = muted | 同左 | `.text-text-300/.text-text-400` | `:14274`、`:14282` |
| **Todo 已完成项** | `--cds-text-secondary` **+ line-through** | 同左 | `text-secondary` | `cb6930dae:3894` |
| Todo 进行中项 | `--cds-text-primary` | 同左 | `text-primary` | `:3894` |
| Todo 未开始项 | `--cds-text-primary`（transcript 版）/ `text-secondary`（非紧凑版） | 同左 | 见证据 | `cb6930dae:3894`；`c4038fd41:418` |
| Todo 序号圆（完成） | `--cds-fill-accent-hover` = **`#3987e5`**（blue-400） | 同左 | `bg-fill-accent-hover` | `c4038fd41:426` |
| Todo 序号圆（进行中）边框 | `--cds-fill-accent-hover`（`border-accent-200` 映射到它） | 同左 | `border-accent-200` | `c4038fd41:438` |
| Todo 序号圆（未开始） | `--cds-alpha-1` | 同左 | `bg-alpha-1` | `:432` |
| Todo 轨道 | `--cds-alpha-2`，已走过段 `--cds-alpha-3` | 同左 | `bg-alpha-2` / `bg-alpha-3` | `:331`、`:337` |
| 计划引用块边框 | `--cds-border` | 同左 | `border-s-2`（默认 color） | `cb6930dae:3913` |
| "Plan approved" | `--cds-text-success` = 浅 `#0ca30c`(green-400) / 深 `green-600` | 同左 | `text-success` | `cb6930dae:3924` |
| 子代理状态词 | `text-sm` 继承行色（`text-muted`） | 同左 | — | `cc1aae219:14420` |
| 子代理肘部线 | `--cds-border-strong` = `alpha-3` | 同左 | `border-strong` | `:14479` |
| 问题卡头部底 | `--cds-alpha-1` | 同左 | `bg-alpha-1` | `ccae33cda:1051` |
| 问题卡选项 hover | `--cds-alpha-1` | 同左 | `focus-visible`/hover 见 CSS | `ccae33cda:755` |
| 问题卡选中圆环 | `--cds-fill-accent` = **`#2a78d6`**(blue-450)；点 `--cds-on-accent` = `#fff` | 同左 | `--cds-fill-accent` / `--cds-on-accent` | CSS `.epitaxy-radio-mark[data-checked]` |
| 回执卡描边 | `--epitaxy-card-outline: 0 0 0 1px var(--cds-border)`（box-shadow 实现，占位不撑布局） | 同左 | `.epitaxy-card-outline` | CSS @ 1785837 |
| **citation chip 底** | `bg-bg-200` = `--cds-surface-0` = **`#f9f9f7`** | `#0b0b0b` | `bg-bg-200` | `c89efce1a:2458` |
| **citation chip 文字** | `--cds-text-secondary` = **`#52514e`**，hover `--cds-text-primary` | `#a5a49a` → `#fff` | `text-text-300` / `group-hover/tag:text-text-200` | `:2465` |
| citation chip 描边 | `--cds-border` = `alpha-2` | 同左 | `border-border-300`（0.5px） | `:2458` |
| citation chip hover 底 | `--cds-bg-accent` = 浅 `blue-100 #cde2fb` / 深 `blue-800 #032042`；描边 `accent-100/60` | 同左 | `group-hover/tag:bg-accent-900` | `:2459` |
| citation chip 尾部箭头渐变 | `from-accent-900/0 via-accent-900/100 via-30% to-accent-900/100`，图标 `text-accent-100` = `--cds-fill-accent` | 同左 | `:2482-2489` |

**`epitaxy-agent-cell` 七状态色（逐条，hex + 变量）**

| 状态 | 变量 | 解析后 hex（浅/深一致，均为角色色） | 额外视觉 |
| --- | --- | --- | --- |
| `--done` | `--cds-alpha-3` | `hsl(from neutral-900 h s l / 20%)` → 浅 `rgba(11,11,11,.20)`；深 `rgba(255,255,255,.20)` | 无动画 |
| `--running` | `--cds-fill-accent` → `--cds-role-accent-450` → `--cds-blue-450` | **`#2a78d6`** | `epitaxy-agent-pulse`，`2.4–3.8s`，opacity 1↔.72 |
| `--stalled` | `--cds-fill-warning` → `--cds-role-warning-200` → `--cds-yellow-200` | **`#fab219`** | 无动画 |
| `--error` | `--cds-fill-danger` → `--cds-role-danger-450` → `--cds-red-450` | **`#d03b3b`** | 无动画 |
| `--stopped` | 仅 `border-color: --cds-alpha-3`，背景透明 | 描边 `rgba(11,11,11,.20)` / `rgba(255,255,255,.20)` | 无动画 |
| `--pending` | 同 `--stopped`（同一条 CSS 规则） | 同上 | 无动画 |
| `--ghost` | 仅 `border-color: --cds-alpha-3`，背景透明 | 同上 | `epitaxy-agent-ghost-pulse` `2.2s`，opacity .25↔.9 |

> `--stalled` 只在 `running` 计数里做扣减（`r = Math.min(stalled, running)`，`c96d752d0:52561`），即「停滞」是运行态的子状态：先画 running 再替换为 stalled。

---

## 10. 未确认项

1. **Grep 结果卡**：聊天 transcript 里没有 Grep/Glob 专用结果列表组件（无「文件:行号 + 匹配行」渲染）。若存在，只可能在 Code 会话的 tool body 渲染器（`cb6930dae` 的 `Tu`）之外、由 `c96d752d0` 的 `XAe` 分支处理，但我未定位到把 `Grep.output` 解析成行的代码。需要真实会话 JSONL 里一条 Grep tool_result 做交叉验证。
2. **`Grep` 无结果文案**：未找到工具卡专属文案（只有 find-in-files 面板的 `No matches in file contents`）。推断：Grep 空结果只显示 `Searched {pattern}` + 空 body。
3. **WebFetch 正文**：确认卡内不渲染正文，但**未确认**是否存在「内嵌预览面板」（点击后打开 side pane）。`onUrlClick` 由宿主注入，实现不在我读到的 chunk 里。
4. **WebSearch 摘要/缩略图**：确证数据模型只有 `{title,url,siteDomain,faviconUrl}`，没有 snippet/thumbnail 字段。若服务端 `knowledge` 项带更多字段，`sS` 会直接丢弃。
5. **citation 点击后的打开目标**：`c89efce1a` 里是 `<a target=_blank>` 且 `onClick` 会拦截调用 `f(citation)`（埋点）后仍执行默认跳转；是否在应用内打开，取决于 `lr`（preview card）外层与宿主路由，未闭合。
6. **`--cds-text-warning` / `--cds-text-success`（深色）的具体 hex**：只解析到 `--cds-role-warning-600` / `--cds-role-success-600` 这一级，其指向的 `yellow-600` / `green-600` 数值未取到。
7. **计划面板是否有 max-height 上限**：确认 `h-full` + `overflow-y-auto`，但上游 pane 容器的实际高度约束未追（属 pane 布局范围）。
8. **`epitaxy-agent-cell` 的 `--cds-fill-accent` 在深色模式是否换色**：CSS 中 `--cds-role-accent-450` 只有一处定义（`blue-450`），未见 dark 覆写；若主题层另有覆盖，未读到。
9. **TodoWrite 卡的「持久浮层」判定**：`qS`（Status 卡）确证是浮层视觉，但它在 DOM 中的挂载点（是否 fixed/sticky）未追到，属推断。

