# 工具卡片逆向 · Edit / Write / MultiEdit / NotebookEdit

> **性质**：新增的独立条目。补参考仓库 `.reference/open-claude-ui` 未覆盖的一块 ——
> 文件编辑类工具卡片的调用链、参数归一化、diff 交接、失败态、路径展示与排版度量。
>
> **版本**：本机 Claude Desktop **2.42304.2**（参考仓库针对 v2.37337.1）。
>
> **三条会改变其它结论的发现**：
> 1. **`write-failed` 与文件编辑无关**。它是 `.claude/launch.json` 写入失败的提示（i18n `lcjYzknAly`）。
>    真正的写文件失败是 `Failed to write {fileName}`（`XwVHW2tLEj`）。
> 2. **编辑卡从不展示原始 old_string / new_string 两段**。它们被当作"两个完整文件版本"，
>    构造成 structured patch 再交给 diff 组件（`Tu()` → `bu()` → `br()` → `p()` → `diffs-container`）。
> 3. **`MultiEdit` 只有一张 diff**，不是 N 张子卡：所有 `old_string` 用 `"\n…\n"` 拼成一个 before 文件。
>
> **⚠️ 字号口径修正（重要，与本文 §9 数值有关）**：
> 本文 §9 的 `code`=12px / `footnote`=12px / `body`=13px / `caption`=11px 是 **compact 档**的值。
> 桌面端默认 `data-density="comfortable"`（已确证：`shared-frame-BfjMqbuN.js` 的 `var la = G("comfortable")`，
> 且 `Ma()` 的解析链 `n ?? (r ? "comfortable" : e ?? t)` 中 `t` 即该默认值），
> comfortable 档应为 **code=13px / footnote=13px / body=14px / caption=12px**。
> 两组值都是真实存在的令牌档位，引用时务必标明档位 —— 详见 `docs/typography-cross-check.md` §2.1。
>
> **另**：`anthropic-mono` 字体已确证随包分发（`c5dbe0935-CQcSkHaI.woff2`，64 KB，`font-weight: 300 800`），
> 所以 `--cds-font-mono` 在 Windows 上确实解析到原版等宽字体，不是回退到系统栈。
>
> **证据约定**：`<chunk>.pretty.js:N` 指 `C:\Users\17445\Desktop\rea\claude-ui-re\pretty\` 下格式化后的行号。

---
## 范围

文件编辑类工具卡片：Edit / MultiEdit / Write / NotebookEdit / str_replace 系列。

> 目标版本：Claude Desktop 2.42304.2 · `ion-dist/assets/v1/`
> 只读静态分析。行号均指 `claude-ui-re/pretty/<chunk>.pretty.js`（由 `node pretty.mjs` 生成）。
> 标注约定：**【确证】**= 代码/字符串直接读到；**【推断】**= 由相邻关系推断，附依据。

## 0. 结论速览（先看这 8 条）

1. 编辑类工具卡片的**外壳**统一走 `YH`（`cc1aae219` L13343）= 一行「图标 + 动词 + 文件名 + 右侧附加元素」，展开后在同一个 `div` 里渲染 body。**【确证】**
2. `Edit` 的头部文案是 `Edited <文件名>` / `Editing <文件名>` / `Failed to edit <文件名>` 三态，走 `gU()`（`cc1aae219` L13800），i18n id `V+jPyROpXb` / `O2hMrU1FI9` / `RQQYxjFahq`。**【确证】**
3. 卡片主体**不显示原始 old_string / new_string 两段文本**，而是把它们构造成一个**完整的 before/after 文件 + structured patch**，再交给 diff 组件 `br()`（`c53a94863` L7）→ `ca817835b` → `@pierre` 风格的 `diffs-container`。**【确证】**
4. `MultiEdit` **没有每条 edit 的子卡**：`v()`（`c254f7f8c` L129）把所有 edits 的 old/new 用 `\n…\n` 拼成单个 before/after，最终只渲染**一张** diff。**【确证】**
5. `NotebookEdit` 只对 `replace`/`delete` 有 old→new；`insert` 时 `old_source` 不存在，等价于"纯新增一侧"。**单元格定位字段 `cell_id` 只用于校验 result 是否可信，UI 上不显示 cell id / cell number**。**【确证】**
6. `+N −M` 行数徽标有**三套实现**：现代卡片头部 `bC()` pill 变体（`c227f4d5e` L2859，`text-caption` 11px + `font-medium` 500 + 底色 + `tabular-nums lining-nums`）、紧凑行 `Vz()`（`c96d752d0` L24922，`text-body` 13px 纯文本 + `tabular-nums`）、旧版头部 `r1`（`cc1aae219` L27435，`text-xs` 12px + `font-mono` + 边框）。三者的加号色都是 git-added 系；**减号色不统一**：前两者用 `text-git-removed`，旧版用 `text-danger`。**【确证，已修正首版误判】**
7. **没有**针对单条 edit 失败的重试按钮；失败只有一个红色的 `Failed to edit <file>` 文案 + 可展开的 `Tool call details`（含原始 tool_result 文本）。**【确证】**
8. `write-failed` **与文件编辑无关**：它是 `.claude/launch.json` 写失败的提示（`cf580efe9` L214，i18n `lcjYzknAly`）。真正的写文件失败走 `Failed to write <fileName>`（i18n `XwVHW2tLEj`）。**【确证，重要更正】**

---

## 1. 工具名归一化：`fc` / `mc` 的完整用途

### 1.1 `fc` 集合（`c05b96c7f` L1010–1023）

```js
var fc = new Set([
  "create_file","open_file","update_file","view","read",
  "write","edit","str_replace","str_replace_editor",
]);
function pc(e) { return fc.has(e); }
```

`pc()` 的判定对象是**已经过 `hr()` 归一化的规范名**（调用点都写 `hr(o.name)` / `hr(t)`），不是原始 tool name。用途只有一处：**判断"这个工具的卡片是否可以作为文件行打开"**，即决定 `activateFilePath` 是否生效。

三处调用（全部确证）：

| 位置 | 代码 | 作用 |
| --- | --- | --- |
| `c05b96c7f` L7458 | `(pc(r) && (t === void 0 \|\| hc(k(e))))` | `e_()`：当工具结果还没到（`t===undefined`）或结果里有可用文件信息（`hc()`）时，**不**把它降级为纯文本行，而是保留为文件工具行 |
| `c05b96c7f` L7881 | `(r && pc(t) && hc(k(o)))` | 表格型结果（`display_content.type==="table"`）**不再**额外渲染成表格块，因为文件工具行更合适 |
| `c05b96c7f` L7918–7919 | `Be = !o.name.startsWith("mcp__") && kr(o.name) === o.name && pc(hr(o.name))`<br>`Ve = Be && hc(o.input) && n?.(o.id) !== void 0` | 计算行级标志 `Ve`（"是文件工具 且 有文件信息 且 结果已到"），后续用于 `activateFilePath`、头部 meta 是否可点击、`dt`（是否走文件行渲染）等一系列开关 |

注意 `"open_file"`、`"view"`、`"read"` 与 `"create_file"`、`"write"` 在同一集合里 —— 说明**读和写在 UI 层共用同一条"文件行"通路**，只在文案和 body 类型上分叉。

### 1.2 `mc` 数组（`c05b96c7f` L1024）

```js
var mc = ["file_path","path","content","file_text","old_str","new_str"];
```

只有一处使用（`c05b96c7f` L8138–8154）：

```js
Et = Be && n !== void 0 && n(o.id) === void 0 && !o.mcp_auth_required && (() => {
  let e = k(o);
  if (mc.some((t) => { let n = e[t]; return typeof n === "string" && n !== ""; })) return !1;
  let t = b_(e.description);
  return t === void 0 || (Tt ?? R).toLowerCase().includes(t.trim().toLowerCase());
})()
```

语义：**当工具结果还没到时，如果入参里已经出现任何"文件编辑类字段"，就不要把这一行渲染成"等待中/占位"状态**。也就是防止 `str_replace_editor` 这类流式传入 `old_str` 的工具，在结果未返回前闪成一个空的占位行。`Et` 随后并入 `Lt`（L8235–8255），`Lt` 决定这一行是否被标记为"需要 suppress cell"。

`mc` 覆盖的 6 个字段正好是两套工具族的并集：`file_path/old_str/new_str`（Claude Code 系）+ `path/content/file_text`（str_replace_editor / open_file 系）。**这是判断"某个工具是文件编辑类"的入参层判据**，与 `fc`（名字层判据）互补。

### 1.3 输入 schema 别名映射表

三张表分工不同，不要混用：

**(a) 规范名归一 `kH`（`shared-130-Bwsvvi4y` L17872–17927），入口 `FH()`/`PH()`（L17943–17956）**

| 原始工具名 | 规范名 | 备注 |
| --- | --- | --- |
| `read` / `open_file` / `close_file` | `read` | 关闭文件也被算作 read |
| `write` / `create_file` | `write` | |
| `edit` / `multi_edit` / `str_replace` / `str_replace_editor` / `update_file` | `edit` | **MultiEdit 归一后与 Edit 同类** |
| `notebook_edit` | `notebook_edit` | **单独一类**，不并入 `edit` |
| `delete_file` | `delete_file` | 卡片表里归为「文件」但规范名独立 |
| `file_search` | `glob` | |
| `present_files` / `send_user_file` | `share` | |
| `todo_write` | `plan` | |

`FH()` 有一层 MCP 保护：若规范名在 `AH` 白名单里且原始名带 `mcp__`/命名空间，返回 `undefined`（即不归一）。

**(b) 入参名 → 展示用的键值对（`shared-20-DvwjRCWU` L7540–7589）**

这张表决定**审批卡/预览**里哪些参数要展示、以什么形态展示：

| 工具 | keys（字段 → 呈现体裁） | required | shown 条件 | changeSides |
| --- | --- | --- | --- | --- |
| `Write` | `file_path`→line, `content`→block | `file_path` | `file_path` 是"普通路径"（`YD`） | `["content"]` |
| `Edit` | `file_path`→line, `old_string`→block, `new_string`→block, `replace_all`→flag | `file_path` | `file_path` 是普通路径**且** `replace_all !== true` | `["old_string","new_string"]` |

`YD()`（L7536）判据：`file_path` 字符串必须满足 `Fa(t) === t`（即**未被脱敏/未变形**）。
`lO()`（L7638）是"字段可否展示"的约束：`block`/`line` 要求是 string、长度 ≤ 1000、换行数 < 12、无控制字符、单行长 ≤ 1000；`flag` 要求 boolean。
`dO()`（L7667）是"两段文本能否做成 side-by-side diff"的度量：把 old/new 各自按 `\n` 切行、按 `rO()` 估算视觉宽度（ASCII 宽 1、非 ASCII 宽 8），要求总宽度 ≤ 16 个字符单位（`$D = 16`），且两段的共同前后缀行数 ≤ 4（`tO = 4`，见 `oO()` L7619）。

> **推断**：这张表只服务审批卡的内联预览（小 diff），不服务时间线里的完整 diff。依据：`uO()`（L7651）的调用方是 `_O()`（L7695），而 `_O()` 产出的是 `{lane:"live"|"polled", changeBody}` —— 侧栏 hover 卡用的东西。

**(c) 卡片文案表 `Vp`（`c05b96c7f` L5152–5197）**

这是**最长的一张表**，也是"编辑类工具卡片头部文案"的真正来源（46 个键）：

```
read: "Reading a file"            write: "Creating a file"        edit: "Editing a file"
str_replace: "Editing a file"     str_replace_editor: "Editing a file"
multi_edit: "Editing files"       notebook_edit: "Editing a notebook"
view: "Reading a file"            create_file: "Creating a file"
open_file: "Opening file"         update_file: "Updating file"
close_file: "Closing file"        delete_file: "Deleting file"
```

配套还有一张兼容表 `Hp`（L5198–5203），用于识别**历史遗留文案**（老版本写死的英文串），以便升级后仍能替换：

```js
Hp = { view:["Viewing file"], create_file:["Creating file"],
       str_replace:["Editing file"], present_files:["Presenting file(s)..."] }
```

`Gp(name, text)`（L5214）就是"这句话是不是这个工具的标准文案（含历史形态）"的判定器。

---

## 2. Edit 工具卡片

### 2.1 头部文案与模板

现代时间线走 `XG()`（`cc1aae219` L16879 定义，Edit 分支 L16945–17003）。

**文案生成**（L16952–16962）：

```js
l = R || (j
      ? fv(h, "edit", { streaming: r, isError: c, stopped: _ })
      : r ? `Editing ${n}`
      : _ ? h.formatMessage({defaultMessage:"Stopped editing {file}", id:"fqubJDzJLU"}, {file:n})
      : c ? h.formatMessage(LW.edit, { fileName: n })      // "Failed to edit {fileName}"
      : `Edited ${n}`)
```

| 状态 | 文案 | i18n id | 证据 |
| --- | --- | --- | --- |
| 流式中 | `Editing <name>` | `O2hMrU1FI9`（另一路径）/ 此处为字面量 `` `Editing ${n}` `` | `cc1aae219` L16957 |
| 完成 | `Edited <name>` | 字面量 `` `Edited ${n}` `` | L16962 |
| 被停止 | `Stopped editing {file}` | `fqubJDzJLU` | L16959 |
| 失败 | `Failed to edit {fileName}` | `RQQYxjFahq` | L16961 + L15860 |
| 记忆文件（`j===true`）走 `fv()` 专门分支 | — | — | L16954–16955 |

另有旧的工具卡表 `gU()`（`cc1aae219` L13800–13825）提供同一组模板的"通用版本"，其中：

- `create` → `Creating {fileName}`(`cuaMuzr//N`) / `Created {fileName}`(`5CvLCHBlfQ`)
- `edit` → `Editing {fileName}`(`O2hMrU1FI9`) / `Edited {fileName}`(`V+jPyROpXb`)
- `default` → 直接把文件名当文案

> **推断**：`gU()` 服务老式 `vU = A(_U)` 卡片（L13905），现代时间线用 `XG()` 里的模板；两者文案一致但 i18n key 不共享（`Edited {fileName}` vs 字面量 `` `Edited ${n}` ``）。

`n` 的取值（L16946–16950）：

```js
e = Gp(x) || D,                                   // x = file_path
t = dp(x) ? "Global instructions"(53DiPrdI5r) : "Folder instructions"(dqW6sjmil4),
n = j ? F : M || (e === "CLAUDE.md" ? `${t} (CLAUDE.md)` : e)
```

即：`CLAUDE.md` 会显示成 `Global instructions (CLAUDE.md)` / `Folder instructions (CLAUDE.md)`；否则显示 `display_file_name` 或文件名。

### 2.2 主体：不是两段原文，而是预算好的 diff

**关键结论：卡片主体从不直接展示原始 old_string / new_string 文本块。** 它把两段文本当成"两个完整文件版本"，算成 structured patch，再交给 diff 组件。

完整数据流（`c254f7f8c`）：

```
v(toolUse)          L129   构造 {path,name,oldFile,newFile}
  ├─ Edit:        s = old_string, c = new_string          L144-147
  ├─ MultiEdit:   s = edits.map(old_string).join("\n…\n")  L148-162
  ├─ Write:       c = content                             L141-143
  └─ NotebookEdit: c = new_source (+ old_source 从 result) L163-172
       ↓ 两段都做 o() 规范化（补尾换行）L7-15
b(toolUse)          L185   → 交给 p() / h() 算 diff
  ├─ p(): sidecar 路径 —— tool_result 自带 structuredPatch 时直接用 L65-84
  ├─ h(): 本地路径 —— jsdiff(createPatch) + parse L102-107，maxEditLength = 1000 (s=1e3, L16)
  └─ 单侧为空时（oldFile=="" 或 newFile==""）不跑 diff，直接标记 pureSide L204-225
       ↓
返回 { path, fileDiff, oldFile, newFile, counts:{additions,deletions}, pureSide, tooLarge }
```

**diff 组件的调用链（确证）**：

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 1. 工具卡 body 分发 | `cb6930dae` L3695–3713 | `if (t.kind === "diff" && v)` → 三分支：`v.fileDiff===null` 时按 `tooLarge` / `pureSide` 走非 diff 渲染；否则 `l(bu,{fileDiff: v.fileDiff})` |
| 2. `bu()` | `cb6930dae` L3534–3537 | `l(br, { fileDiff: e, onPostRender: t })` |
| 3. `br()` | `c53a94863` L7–20 | 包一层 theme/style，`diffIndicators:"classic"`、`backgroundColor: light-dark(...)`、`overflow:"wrap"`，然后渲染 `p`（来自 `ca817835b`） |
| 4. `p()` | `ca817835b` L12–16 | `e(n, { fileDiff: c, ...o })`，`n` 来自 `ca7ba268c`（即 `diffs-container` 组件） |
| 5. patch 解析 | `c19cfecfb` 导出 `t` = `C()`（L111）内部 `w()`（L118） | `parsePatchContent`：把 unified patch 解析成 hunks + `hunkContent`（context / change），并计算 `splitLineCount` / `unifiedLineCount` |

`fileDiff` 的两种来源：
- **sidecar**（`p()`，L65）：`toolUseResult.structuredPatch` 已经是结构化 hunk，且校验 `filePath`、`oldString/newString`（Edit）、`content`（Write）、`edits`（MultiEdit）与 input 完全一致 → `fromSidecar: true`，直接 `m()` 把 hunks 转成 patch 文本再 parse（L85–101）。
- **本地计算**（`h()`，L102）：用 `n`（jsdiff 的 `createPatch` 系）在 `maxEditLength = 1000` 上算，失败即视作 `tooLarge`。

`tooLarge` 的兜底渲染（`cb6930dae` L3818–3844，`Nu()`）：

```jsx
<p>Too many changes to show as a diff. Showing the removed and added text separately.</p>   // sLdRgk597T
<ToolOutput label="Removed text"><Pu side={oldFile} tint="deletions" /></ToolOutput>         // 6O4RroBqwq
<ToolOutput label="Added text"  ><Pu side={newFile} tint="additions" /></ToolOutput>         // MJXu81OWzM
```

`Pu()`（L3845–3860）用两块**只读代码视图**（`Dn`，非 diff）分别着色 `--cds-bg-git-removed` / `--cds-bg-git-added`，并在行号前加 `− ` / `+ ` 前缀（`content:"${e} "`）。

### 2.3 `replace_all` 的处理

- 审批预览：`replace_all === true` 时**不展示** old/new 两段（`shared-20-DvwjRCWU` L7580 `shown: (e) => YD(e) && e.get("replace_all") !== !0`）。
- 时间线 diff：**不做区分**，`v()`（`c254f7f8c` L144）只取 `old_string`/`new_string`，`replace_all` 只影响"文件内容如何被写回"（`c1ebb1aa4` L399–401 `at()` 的 `split/join` vs `indexOf` 替换），不影响 diff 的构造方式。

---

## 3. MultiEdit

### 3.1 edits 数组的字段名

从 `c254f7f8c` L50–64、L148–162 与 `ca288e1f2` L58–62 三处可确定：

```js
edits: [{ old_string: string, new_string: string }, ...]
```

`f(a,b)`（L50–64）逐项比对 `old_string` / `new_string`，字段名确证。`ca288e1f2` L61 也读 `r.new_string` / `r.old_string`。

`replace_all` 出现在 MultiEdit 的每条 edit 上（`c1ebb1aa4` L462 `at(e.content, t)` 里 `t.replace_all`），但**UI 不读**。

### 3.2 渲染方式：一张 diff，无子卡、无编号

`v()`（`c254f7f8c` L148–162）：

```js
case "MultiEdit": {
  let t = Array.isArray(e.input.edits) ? e.input.edits : [], n = [], r = [];
  for (let e of t)
    typeof e.old_string == "string" && n.push(e.old_string),
    typeof e.new_string == "string" && r.push(e.new_string);
  (s = n.join("\n\u2026\n")), (c = r.join("\n\u2026\n"));
  break;
}
```

即：**所有 old_string 用 `\n…\n`（U+2026 水平省略号）拼接成一个"before 文件"，所有 new_string 同样拼成"after 文件"**，然后走与 Edit 完全相同的 diff 流水线。结果：

- 只有 **1 张** diff 卡（同一个 `<bu fileDiff>`），不是 N 张子卡；
- **没有顺序编号**、没有 per-edit 的 title/状态；
- 拼接用的 `…` 行会作为"上下文行"出现在 diff 里（除非被 hunk 边界切掉）。

> **推断**：这种"拼接成两个伪文件再 diff"的做法会让跨 edit 的相邻片段被 diff 算法当作同一处变更合并显示；如果两条 edit 在语义上相差很远，中间会插入 `…` 行作为分隔。依据：`s/c` 的构造方式 + `h()` 直接把它当两个完整文件内容处理。

`editIndex` / `allEdits` / `activeEditIndex` 这一组字段只存在于**代码编辑器内部**（`cc8af9271` L3781–3815、L14821–14857），**不是**聊天里的 MultiEdit 卡片。**【确证，避免误判】**

### 3.3 "未应用/失败的单条"

**不存在**。`c254f7f8c` 的 `f()`（L50–64）只做"result 里的 edits 与 input 的 edits 是否逐项相同"的校验；任何一项不同 → 返回 `null` → 整个工具卡退回 sidecar 不可用，改用本地 diff 或单侧渲染。没有任何"第 N 条失败"的 UI 元素。

失败只能落到**整个工具**级别：`Failed to edit <file>`（`c52b02f3f` L922–931，`Edit`/`MultiEdit`/`NotebookEdit` 共用一个分支）。

### 3.4 分组计数里的 MultiEdit

在"一组动作"的摘要（`c24951e9f`）里，MultiEdit 只贡献 `edit` 类别的一个计数（`W` 集合含 `"edit"`，L244），不按 edits 数量计数。

---

## 4. Write / create_file

### 4.1 新建文件时的展示

`Write` 只有 `content` 一个正文参数（`c254f7f8c` L141–143）：

```js
case "Write": c = typeof e.input.content == "string" ? e.input.content : ""; break;
```

于是 `oldFile.contents === ""`，命中 L204–214 的"纯新增"分支：

```js
if (i.contents === "") return {
  path: n, fileDiff: null, fromSidecar:false, oldFile:i, newFile:a,
  counts: { additions: g(a.contents), deletions: 0 },   // g() = 数换行符
  pureSide: "additions", tooLarge: false,
};
```

即：**不跑 diff**，改为渲染**单侧只读代码视图**（`cb6930dae` L3701–3705）：

```jsx
<Pu side={v.newFile} tint="additions" baseUnsafeCSS={lu} />
```

所以"新建文件"看到的是**全文预览 + 绿色新增底色**（没有 `+` 号前缀，`Pu` 只在 `t==="additions"` 时给 `+`），**不显示行数摘要**（正文里没有独立行数字段；只有头部 `+N −0`）。

`g()`（`c254f7f8c` L108–122）就是行计数：数 `\n` 出现的次数，**不加 1**（与 `c980da984` 的 `e()` 不同，后者从 1 起算）。

### 4.2 覆盖已存在文件是否走 diff

**走 diff，且有一个特殊行为**。`Write` 的 `oldFile` 恒为空，但 `toolUseResult.type === "update"` 时 sidecar 会提供 `structuredPatch`：

`p()`（`c254f7f8c` L76–80）：

```js
} else if (e.name === "Write") {
  let t = typeof n.content == "string" && n.content === e.input.content,
      r = n.content === "" && n.type === "update";
  if (!t && !r) return null;
}
```

只要 sidecar 提供了 patch（`d(e.toolUseResult)` 非 null），`b()` 的 L193–203 就会用 `s = m(o, ...)` 走 diff 分支，`fromSidecar: true`。

> **推断**：`n.content === "" && n.type === "update"` 这条特殊分支对应"用 Write 清空一个已存在文件"——此时 result 不含新内容，但 patch 有效，故仍可出 diff。依据：L78 的判定与 L193 的 `fromSidecar` 分支顺序。

**头部动词区分 create / update**（`c52b02f3f` L908–921）：

```js
case "Write": {
  let n = t.toolUseResult?.type === "update";
  return { verb: n ? "Updated"(xrk6zgu9jU) : "Created"(ORGv1Q6rL/),
           runningVerb: n ? "Updating"(S8snIefvgB) : "Creating"(xhfdqvZYVo),
           meta: X(a("file_path")),
           failedVerb: "Failed to write"(7xuVQAUr4r), kind: c };
}
```

注意这里**没有 `metaIsCode`**，且 `meta` 走 `X()` = `oe()`（路径短名化），所以头部显示的是**文件名**而不是完整路径。

另一处（`c05b96c7f` L7313–7315）给出统一动词表：

```js
case "write": case "create_file": return "Created"(ETH2uhuxAQ);
```

以及"一组动作"里 `write` → `"created"`（`c24951e9f` L324–328）。

### 4.3 `write-failed` 的真正归属 【重要更正】

`cf580efe9` L209–215：

```js
Cr = Ve({
  "name-exists":  { defaultMessage: "A server with this name already exists in .claude/launch.json.", id: "eTcvIehHIy" },
  "write-failed": { defaultMessage: "Couldn't save this configuration. Try again.",              id: "lcjYzknAly" },
})
```

出现位置（L355、L363、L366、L446）：

```js
y("write-failed");                                   // 无 IPC 通道
y(n?.reason ?? "write-failed");                      // IPC 返回 !ok
y("write-failed");                                   // promise reject
...
o("p", { role:"alert", className:"text-footnote text-danger",
        children: f.formatMessage(Cr[v in Cr ? v : "write-failed"]) })
```

上下文是 `addServerFromCandidate`（开发服务器检测），文件是 `.claude/launch.json`。

**结论：`write-failed` 属于「dev server 配置写入失败」，不是文件编辑卡片的错误态。** 编辑类工具写文件失败用的是 `Failed to write {fileName}`（`cc1aae219` L15858，id `XwVHW2tLEj`）/ `Failed to write`（`c52b02f3f` L918，id `7xuVQAUr4r`）。

另有一个近似名 `state-write-failed`（`cfea69990` L41，`J+paViqyAW` = "Couldn't save the folder setting. Try again."），同样与编辑无关。

---

## 5. NotebookEdit

### 5.1 输入 schema（从真实 transcript 取的官方 schema）

`C:\Users\17445\.claude\projects\...\1b303a11-....jsonl` 内嵌的 `NotebookEdit` 定义：

```json
{
  "properties": {
    "notebook_path": {"type":"string","description":"The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)"},
    "cell_id":       {"type":"string","description":"The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified."},
    "new_source":    {"type":"string","description":"The new source for the cell"},
    "cell_type":     {"type":"string","enum":["code","markdown"]},
    "edit_mode":     {"type":"string","enum":["replace","insert","delete"],"description":"Defaults to replace."}
  },
  "required": ["notebook_path","new_source"],
  "additionalProperties": false
}
```

**没有 `cell_number` 字段**（全量 grep 所有 v1 chunk：0 命中）。`cell_id` 只在 `c254f7f8c` 出现（唯一下载点），`edit_mode` 同样只在 `c254f7f8c`。

### 5.2 UI 如何处理

`v()`（`c254f7f8c` L129–180）：

```js
let n = typeof e.input.file_path == "string" ? e.input.file_path
      : typeof e.input.notebook_path == "string" ? e.input.notebook_path
      : "file";                                                    // L131-135
...
case "NotebookEdit": {
  c = typeof e.input.new_source == "string" ? e.input.new_source : "";
  let t = e.toolUseResult;
  typeof t?.old_source == "string" &&
    t.notebook_path === n &&
    t.new_source === e.input.new_source &&
    t.cell_id === e.input.cell_id &&
    ((s = t.old_source), t.edit_mode === "delete" && (c = ""));     // L163-172
  break;
}
```

要点：

1. **`old_source` 只能从 toolResult 拿**，input 里没有旧内容。因此 NotebookEdit 的 diff **只有在 result 里带 `old_source` 时才成立**（sidecar 路径）；否则 `s === ""` 退化为"纯新增"。
2. `cell_id` 的作用**只是校验**：`t.cell_id === e.input.cell_id` 是 sidecar 可信的四个条件之一。**UI 从不显示 cell_id，也不显示 "Cell 3" 之类的定位文案**。
3. `edit_mode === "delete"` → `c = ""`，于是 `a.contents === ""` 命中 L215–225 的"纯删除"分支：`pureSide: "deletions"`，渲染 `Pu side={oldFile} tint="deletions"`（红色删除底色）。
4. `edit_mode === "insert"` → result 无 `old_source`（插入是纯新增），`s` 保持 `""`，走"纯新增"分支。
5. **`cell_type` 完全不参与 UI**（全量 grep 无 UI 侧读取）。

### 5.3 notebook 特有的展示差异

| 差异点 | Edit | NotebookEdit |
| --- | --- | --- |
| 路径字段 | `file_path` | `notebook_path`（`c05b96c7f` L6930 的路径候选列表、`c52b02f3f` L928、`c96d752d0` L11322 都专门处理） |
| 头部 meta | `X(a("file_path"))` | `X(a("file_path") ?? a("notebook_path"))`（`c52b02f3f` L928） |
| 头部动作词 | `Edited` / `Editing` / `Failed to edit` | **完全相同**（同一 case 分支，L922–931） |
| 流式文案 | `Editing a file…`(`z+N9LUeEWJ`) | `Editing notebook…`(`Di4TuBkw8m`)，`c8af22d2e` L234–235 |
| 批量文案 | `Editing # file…`(`YZXACcXzTz`) | 无独立批量文案 |
| 卡片表文案 | `Editing a file`(`T6OfUQMu8N`) | `Editing a notebook`(`YQEir3q/V5`)，`c05b96c7f` L5159 |
| 计数单位 | `{n, one {a file} other {# files}}`(`5+tW8GNGYS`) | `{n, one {a notebook} other {# notebooks}}`(`zv/vRnVi3+`)，`c24951e9f` L334–341 |
| body 类型 | `diff` | `diff`（`c52b02f3f` L658–662） |
| 审批卡 detail | `Wk()` 给出 `fileChange:"preview"\|"too_large"` | **不给**：`case "NotebookEdit": return {action:"edit", ...sj(p("notebook_path"))}`（`c96d752d0` L11321–11322，无 `fileChange`） |
| 图标 | `Edit` 图标 | `BookText` 图标（`cc1aae219` L13967–13968） |
| 审批卡 detail 文本 | `Wk()` 检查 `old_string/new_string` | 无 |

`Wk()`（`c96d752d0` L10856–10865）明确**不处理 NotebookEdit**：

```js
function Wk(e, t) {
  if (typeof t.file_path != "string") return;
  let n;
  if (e === "Write") n = [t.content];
  else if (e === "Edit") n = [t.old_string, t.new_string];
  else if (Array.isArray(t.edits) && t.edits.length > 0) n = t.edits.flatMap(...);
  else return;
  if (n.every(e => typeof e == "string")) return n.every(e => e.length <= 2e5) ? "preview" : "too_large";
}
```

注意它第一行就要求 `file_path` 是 string，而 NotebookEdit 只有 `notebook_path` → 直接 `undefined`。

---

## 6. 失败与错误态

### 6.1 错误文案一览

| 场景 | 文案 | i18n id | 位置 |
| --- | --- | --- | --- |
| 编辑失败（头部动词） | `Failed to edit` | `5VRRhWDkl9` | `c52b02f3f` L929 |
| 编辑失败（带文件名） | `Failed to edit {fileName}` | `RQQYxjFahq` | `cc1aae219` L15860、L16961 |
| 写失败（头部动词） | `Failed to write` | `7xuVQAUr4r` | `c52b02f3f` L918 |
| 写失败（带文件名） | `Failed to write {fileName}` | `XwVHW2tLEj` | `cc1aae219` L15858 |
| 读失败（带文件名） | `Failed to read {fileName}` | `sY6b1IqyXe` | `cc1aae219` L15859 |
| 通用失败 | `Failed` | `vXCeIi67rj` | `c05b96c7f` L7226、`c96d752d0` L25291、L20412 |
| 停止编辑 | `Stopped editing {file}` | `fqubJDzJLU` | `cc1aae219` L16959 |
| 全体失败（一组） | `Failed, used # tools` 类拼接 | — | `c05b96c7f` bg() L7272–7275 |
| 太多变更 | `Too many changes to show as a diff. Showing the removed and added text separately.` | `sLdRgk597T` | `cb6930dae` L3826 |
| 预览不可用 | `Preview unavailable — this change is too large to show here (over 200,000 characters). The full change appears in the conversation after it runs.` | `kHNf/0HpLo` | `c96d752d0` L11629 |
| 审批预告 | `Writes: {text}` / `Removes: {text}` / `Adds: {text}` | `P3lPZqYaIh` / `4dR3u0dN5E` / `sCAvu3FvHk` | `c96d752d0` L11604–11612 |

**关键：`old_string` 未找到 / 多次匹配这两种语义错误，UI 层没有专门文案。** 它们只是普通的 `is_error` tool_result，其原始错误字符串（由 agent 侧生成，如真实 transcript 里的 `<tool_use_error>String to replace not found in file.\nString: ...`）作为 `e.output` 原样显示。

### 6.2 展示位置与结构

失败时卡片头部的动词位换成 `Failed to edit`，红色的 `text-danger` 只出现在**状态词**上（`c734f318c` L643 `className: D("shrink-0", Tt.tone)`，`tone` 来自 `Oe()` 状态映射）。

body 走 `Tu()` 的 `e.isError && e.output` 分支（`cb6930dae` L3736–3753）：

```jsx
<ToolOutput slot="error-details" label="Tool call details"                    // vpHLQuUbO4
            className="flex flex-col gap-1.25">
  <div className={e.errorIsBenign ? undefined : "text-danger"}>{markdownOrRaw(n)}</div>
  <Au tool={e} />                                                             // 参数列表
</ToolOutput>
```

`ToolOutput`（`Z`，L3457–3469）是一个**可聚焦、可滚动**的容器：

```jsx
<div {...slotAttrs} tabIndex={0} role="group"
     aria-label={label ?? "Tool output"}          // rquV/vmixr
     className={`max-h-[400px] overflow-y-auto ${className}`} />
```

`uu = "max-h-[400px] overflow-y-auto"`（L3456）—— **错误详情与普通代码正文共用这个 400px 上限**。

`Au()`（L3780–3808）渲染入参键值对；`file_path` / `notebook_path`（`Du` 集合，L3776）会包成可点击的 `epitaxy-code-chip`。**注意：失败态也会展示入参**，包括完整的 `old_string` / `new_string`（`ju()` L3809–3816 对 `Ou` 集合外的 key 走 `whitespace-pre-wrap break-all` 原文输出）。

### 6.3 是否有"重试/查看更多"

- **卡片内没有 retry 按钮**（`cb6930dae` 全文 grep `Try again|Retry|retry` = 0 命中）。
- 唯一的 message 级重试是 `action-bar-retry`（`cc1aae219` L23111，渲染位置 L23104–23114），作用域是**整条 assistant 消息**，不是单个 tool call。
- "查看更多"只有两处折叠展开：
  - 错误/详情容器本身 `max-h-[400px] overflow-y-auto`（滚动，非展开）；
  - 审批卡的 `_j()`（`c96d752d0` L12349–12379）有 `Show more`(`aWpBzjCXKS`) / `Show less`(`qyJtWyZ0yt`) 切换，配合 `line-clamp-3`；
  - "变更文件列表"有 `See all`(`078WAre0KU`) / `Show {count} more`(`Z184O6N3fq`) / `Show less`（`c96d752d0` L54676–54705）。

---

## 7. 文件路径展示

### 7.1 头部 meta 的短名化

`c52b02f3f` L2180–2182：

```js
function X(e) { if (e) return oe(e); }        // oe = wd，来自 shared-52
```

`c05b96c7f` L7291–7293 的同类逻辑：

```js
var Eg = /[/\\]+$/, Dg = /[/\\]/;
function Og(e) { return e.replace(Eg, "").split(Dg).pop() ?? ""; }   // 取 basename
```

`Jg()`（L7385–7409）是"头部 meta 该显示什么"的总决策器，优先级：

1. `Artifact` 特殊分支（L7390）；
2. `Cg = ["query","url","title","skill"]`（L7286）按序取第一个非空（L7392–7396）；
3. `Tg = ["file_path","path","display_file_path","display_file_name"]`（L7288）按序取（L7397–7408）：
   - 先用 `jg()`（L7296–7300）判断"逗号分隔的多路径"（`Ag = /,\s*/`），多路径 → `zg()` 合成列表（L7341–7359：2 个用 `{first} and {second}`，3 个用逗号+and，更多用 `{first}, {second} and # others`）；若结果里仍有字母（`Rg()` L7337）→ 换成 `Bg()` 的 `# files`（L7360–7365）；
   - 单路径 → `Og()` 取 basename。

### 7.2 长路径截断（三段式）

真正做视觉截断的是 `c784da984`（`Qn` 组件，被 `cu()` 调用：`cb6930dae` L3446–3454）。

`t()`（L61–100）—— **"目录 + 文件名"两段结构**：

```js
let [h, g] = s(e, { posix: p });          // s() 拆成 [目录, 文件名]
_ = e.length - g.length;                   // 目录的长度偏移
v = m?.some(e => e >= _);                  // 高亮是否落在目录段
```

渲染：

```jsx
<span dir="ltr" className="flex min-w-0 items-baseline gap-1 overflow-hidden whitespace-nowrap">
  <span className={`max-w-full shrink-0 truncate ${v ? "text-secondary" : ""}`}>{目录}</span>
  {文件名 && <span className="flex min-w-0 text-footnote text-muted-as-secondary data-[clipped]:opacity-0">
               <n path={文件名} />
             </span>}
</span>
```

`n()`（L22–59）—— **文件名内部的"中间省略"**：

```jsx
<span dir="ltr" className="relative flex min-w-0 overflow-hidden whitespace-nowrap">
  <span className="min-w-0 truncate">{path 首段}</span>
  <span className="max-w-full shrink-0 truncate">{path 尾段}</span>
  {clipped && <span aria-hidden className="absolute inset-0 truncate text-start select-none">
                {head}…{tail}
              </span>}
</span>
```

即三层：
1. **目录段**：`truncate`（`text-overflow:ellipsis; overflow:hidden; white-space:nowrap`），`shrink-0` + `max-w-full`，高亮时 `text-secondary`；
2. **文件段**：`min-w-0` + `text-footnote`（0.75rem）+ `text-muted-as-secondary`；
3. **被裁剪时的覆盖层**：`absolute inset-0` + `text-start` + `select-none`，内容是 `head…tail` —— 保证"开头和结尾永远可见，中间打省略号"。

裁剪检测用 `ResizeObserver`（L70–81）：

```js
let r = parseFloat(getComputedStyle(e).fontSize) || 0,
    a = 末子元素.scrollWidth,
    o = 长子元素.scrollWidth,
    s = Math.min(o + a, Math.min(a, f * r) + (o > 0 ? r : 0));   // f = 5，即最多 5em
e.toggleAttribute("data-clipped", t < s - 1);
```

**`f = 5`（L60）是硬编码的"5 个字符宽"阈值**：只有当文件段可视宽度小于 `min(5em, 实际宽度)` 时才标记 clipped。即**文件名至少保留约 5 个字符**，不足则整体让位给省略层。

`d()`（L22）内部的 `u()`（L5–21）还支持 `positions` 参数做**命中高亮**：把搜索命中区间包成 `<span data-lit className="font-semibold text-primary">`（L14）。

### 7.3 路径分段高亮

数据来自字段 `display_path_segments`（`cc1aae219` L17158、L17184、L17193）。`rK(path_segments, display_path_segments)`（L17178–17180）：

```js
return t !== undefined && t.length > 0 ? t : e.map(e => cu(e));
```

即优先用 `display_path_segments`（已本地化的路径段），否则把 `path_segments` 逐段跑 `cu()`（`cu` 是本地化/短名映射）。

多文件时：`iK()`（L17181–17204）取 `a = rK(...)`，`o = a.length >= 2 ? a[0] : ""`（首段做 category），`s = a.at(-1)`（末段做 label），于是渲染成 `category › label`（`QG()` L17040–17055 的 `›` 分隔符）。

### 7.4 点击打开文件的行为：**内部状态 + 可选本地打开**，不是 IPC 直连

三层机制：

**(1) 首选：内部路由/状态 `SELECT_FILE`**

`cc1aae219` L22367（`dr` 处理器）：

```js
Ze({ type: "SELECT_FILE", path: e, toolType: t, messageId: s.uuid, entryPoint: "timeline_tool_pill" }), $e(!0), Zs(cr);
```

同一 `type:"SELECT_FILE"` 在 L11348、L22344、L23742、L27188、L27424、L27486、L27612 反复出现，`toolType` 取 `"view"` / `"create_file"` / `"str_replace"` / `"present_files"`，`entryPoint` 是分析埋点用的来源标签（`tool_cell_str_replace`、`tool_cell_view`、`timeline_computer_link` 等）。

**(2) 例外：`computer://` 协议走本地文件打开（这才是 IPC）**

`cc1aae219` L22336–22341：

```js
if (sr(n)) {                                        // sr = Lw，判 computer:// 前缀
  let e = t.replace("computer://", "");
  rt?.openLocalFile?.(u, e).catch(...);              // 真正的宿主 IPC
  return;
}
```

L22362–22364 同构（`encodeURIComponent(e)` 变体）。

**(3) 头部 meta 的点击（`onFileToolCellClick`）**

`cc1aae219` L20927–20951 → `mn(e)` 决策：

```js
if (t?.kind === "snapshot")      → onReadToolSnapshotClick(toolUseId)
if (t?.kind === "deliveredFile") → onOpenSavedFile(selectionPath, fileUuid)
if (t?.kind === "memory")        → onOpenMemoryPanel(path)
if (t?.kind === "artifact")      → onOpenArtifactPage(url)
if (e.opensPlan)                 → VK(conversationUuid, undefined)
let n = pn(e);                   // activateFilePath + canOpenFilePath 校验
if (n)                           → onFileToolCellClick(n, e.activateToolName)
```

`pn`（L20927–20930）要求同时满足 `activateFilePath !== undefined`、`activateToolName !== undefined`、`canOpenFilePath(activateFilePath)`。

`activateFilePath` 的来源是 `c05b96c7f` L8355–8356：

```js
activateFilePath: !Ct && dt && wt !== void 0 ? wt : void 0,      // wt = input.file_path ?? input.path
activateToolName: !Ct && dt && wt !== void 0 ? o.name : void 0,
```

即**只有 `dt`（Ve 家族的"文件工具 + 结果已到 + 有文件信息"）为真时头部才可点**。

**(4) 右键菜单**：`c856385e2` 的 `In()`（L1028–1104）提供 `preferDiff` 开关；开着且点中时**先走 diff 面板**而不是普通打开（L1098 `!oe(t) && f?.(e.path) && t.preventDefault()`）。菜单项含 `Open in Changes`(`xEmU/VQHSN`)、`Attach as context`(`6DN2BwXOYy`)。

---

## 8. 参数摘要（头部一行）

### 8.1 头部一行的组成

`YH`（`cc1aae219` L13343–13539）的 DOM 结构：

```
div.group/row  (button 或 a)
├── div.flex.flex-row.items-center.gap-2.min-w-0.flex-1
│   ├── div (icon)                                        ← tool-row-glyph
│   └── div.flex.items-center.gap-1.min-w-0.text-body
│       ├── span.truncate  (label)                        ← 动词 + 文件名
│       └── span[data-testid=tool-row-caret]              ← 展开箭头
└── div.flex.flex-row.items-center.gap-1.5.shrink-0       ← 右侧附加
    ├── p.ps-1.text-muted.font-small  (secondaryText)     ← 次级文本
    └── span (secondaryIcon)
```

对应类名常量（L13394–13402）：

```js
"group/row flex flex-row items-center rounded-[var(--msg-block-radius,0.5rem)] w-full",
x === UH.TimelineGroup && F ? "px-0" : "px-2.5",
w ? "gap-2" : "justify-between",
x !== UH.TimelineGroup && (w ? "py-1" : "py-2"),
"text-text-300",
N ? "!cursor-default" : "cursor-pointer",
```

外层卡片（L13528–13538）：

```js
"rounded-[var(--msg-block-radius,0.5rem)] border-[0.5px] flex flex-col font-sans leading-normal my-3 border-border-300",
!N && !r && "hover:bg-bg-200",
h ? "mt-2" : "mt-3",  g ? "mb-2" : "mb-3",
r && "bg-bg-000 shadow-sm",
```

### 8.2 摘要里显示的参数字段

现代时间线的 Edit 分支（`cc1aae219` L16984–17000）：**只有文件名 + 可选的行数变化**。

```jsx
secondaryElement:
  p || f ? <span className="flex items-center gap-2">
    {p && <CodeChip variant="neutral" className="!text-inherit">{p}</CodeChip>}   {/* p = 显示名 */}
    {f && <span className="flex items-center gap-1.5 text-xs font-mono leading-none">
      {d > 0 && <span className="text-forest-green">+{d}</span>}
      {u > 0 && <span className="text-danger">-{u}</span>}
    </span>}
  </span> : undefined
```

其中 `u = lS(v.old_str)`、`d = lS(v.new_str)`（L16963–16964），`lS` = 行数统计（`c980da984` 的 `e()`，**从 1 起算**，即 `"a\nb"` → 2 行）；`f = (u>0 || d>0) && !c && !_`（无错误、无停止）。

**注意这组行数来自 `toolUseResult.old_str / new_str`，不是 input 的 `old_string / new_string`** —— 也就是说**流式/失败时没有行数徽标**。

### 8.3 行数变化的三套实现对比

先说清绑定关系（**这是容易搞错的地方**）：

- `c96d752d0` L2141 `wl as np` → `np` = `c227f4d5e` L25118 `bC` = **`DiffIndicator` 的 pill 变体**（默认 `variant="pill"`）。
- `c96d752d0` L24922 `Vz` = 本文件内定义的**纯文本变体**（无边框、无底色）。
- `cc1aae219` L27435 `r1` = 旧版头部的**带边框 chip**。

使用位置：

| 变体 | 用在哪 | 证据 |
| --- | --- | --- |
| `bC`（pill，默认） | **现代工具卡头部**（`Step` 行的 `trailing`） | `c96d752d0` L25134 `diff: U && he && !le ? {adds,dels} : undefined` → L24832 `b(np, {additions:m.adds, deletions:m.dels})` |
| `Vz`（纯文本） | 紧凑/合并行路径 + 组摘要行 | L25314 `b(q_e, { isRunning:J, settled: U && he ? b(Vz,{adds:pe,dels:me}) : undefined })`；L54247 组摘要 |

三者的排版对比：

| | `bC` pill（头部） | `Vz` 纯文本 | `r1` 旧版 chip |
| --- | --- | --- | --- |
| 位置 | `c227f4d5e` L2859–2894 | `c96d752d0` L24922–24930 | `cc1aae219` L27435–27462 |
| 类名 | `inline-flex h-control-nested text-caption leading-[round(1.25em,1px)] font-sans font-medium [font-variant-numeric:tabular-nums_lining-nums] rounded-chip` + 每侧 `flex items-center gap-[1px] px-sm` | `flex gap-0.5 items-center text-body tabular-nums shrink-0` | `flex items-center gap-1.5 text-xs font-mono me-2 border-0.5 rounded px-1 py-0.5` |
| 字号 | `text-caption` = **11px** / 17px | `text-body` = **13px** / 19px | `text-xs` = **12px** / 16px |
| 字重 | **500**（`font-medium`） | 400 | 400 |
| 字体 | sans | sans | **mono** |
| 数字对齐 | `tabular-nums` + `lining-nums` | `tabular-nums` | 靠 mono 天然等宽 |
| 加号色 | `bg-git-added text-git-added`（**有底色**） | `text-git-added`（仅文字） | `text-forest-green`（硬编码 `#36884a`） |
| 减号色 | `bg-git-removed text-git-removed`（有底色） | `text-git-removed` | `text-danger` |
| 减号字符 | `\u2212`（`fC`，L2848） | `\u2212`（`qIe`，L24921） | `-`（ASCII） |
| 底色 | `var(--cds-bg-git-*)` 20% mix | 无 | 无 |
| 圆角 | `calc(var(--cds-h-control-nested)/4)` = 4.5px | 无 | `var(--cds-radius)` = 6px |
| 高度 | `h-control-nested` = 18px | 行高决定 | padding 2px + 12px 行高 |
| 无障碍 | `sr-only` 文本 `"{additions} added, {deletions} removed"`（`yo("diffIndicator",...)`，L2868） | 无 | tooltip `"{n} lines added, {m} lines removed"`（L27443–27446） |
| 零值处理 | `if (e === 0 && t === 0) return null`（L2869） | 由调用方保证 `he = pe>0 \|\| me>0` 才渲染 | `if (n===0 && r===0) return null`（L27448） |

### 8.4 审批卡里的字段摘要

审批卡（`c96d752d0` 的 `Kk()` L10867+）用另一套：`sj()`（L12269）产出 `{meta: Ba(e), detail: Uc(e,{singleLine:true}), clampTitle:true}`，即 `meta` 是 basename、`detail` 是单行化完整路径。`Wk()`（L10856）给出 `fileChange: "preview" | "too_large"`，阈值 **200,000 字符**（L10864）。

变更组渲染（`Mj()` L12726–12770）：

```jsx
{t.changeGroups.length ? <div className="flex flex-col gap-md">
  {t.changeGroups.map((e,t) => <div className="flex flex-col gap-0.75">
    <div className="text-footnote text-muted-as-secondary select-text">{e.heading}</div>
    <ul role="list" className="flex flex-col gap-0.75">
      {e.lines.map(l => <li data-sign={l.sign} className="flex gap-sm text-body text-secondary">
        {G ? <span className="flex h-[1lh] w-4 shrink-0 items-center">
               {l.sign && <Icon name={mj[l.sign].icon} className={mj[l.sign].className} />}
             </span> : null}
        ...
```

`mj`（L12321–12325）：`add`→`Add`/`text-git-added`，`remove`→`Minus`/`text-git-removed`，`change`→`ArrowClockwise`/`text-muted-as-secondary`。

---

## 9. 排版度量 / Typography

> 换算基准：`--cds-rem-scale` 默认 `1`（仅在 `@supports (font:-apple-system-body)` 的 iOS 风格环境下降为 `16/17`，见 `c6a992d55-sXiDGMFQ.css` 中 `--cds-rem-scale:calc(16 / 17)` 的 `:root` 块）。
> 因此 `0.8125rem = 13px`、`0.875rem = 14px`、`0.75rem = 12px`、`0.6875rem = 11px`。

### 9.1 设计令牌底座

`c6a992d55-sXiDGMFQ.css`（唯一样式表，1.79 MB 单行）：

```css
/* ⚠️ 下面是 .cds-root 基础块 = COMPACT 档。
   桌面端默认 comfortable，实际生效值见本节末尾的对照表。 */
/* 字号 */
--cds-font-size-caption: calc(.6875rem * var(--cds-rem-scale,1));   /* 11px → comfortable 12px */
--cds-font-size-footnote: calc(.75rem * var(--cds-rem-scale,1));    /* 12px → comfortable 13px */
--cds-font-size-code:    calc(.75rem * var(--cds-rem-scale,1));     /* 12px → comfortable 13px */
--cds-font-size-body:    calc(.8125rem * var(--cds-rem-scale,1));   /* 13px → comfortable 14px */
--cds-font-size-prose:   .875rem;                                   /* 14px → comfortable 16px，无 rem-scale */
--cds-font-size-heading: calc(.875rem * var(--cds-rem-scale,1));    /* 14px → comfortable 15px */
--cds-font-size-title:   calc(1.25rem * var(--cds-rem-scale,1));    /* 20px → comfortable 22px */

/* 行高 */
--cds-leading-caption: calc(1.0625rem * ...);   /* 17px（两档相同） */
--cds-leading-footnote: calc(.9375rem * ...);   /* 15px → comfortable 17px */
--cds-leading-code:    calc(1.0625rem * ...);   /* 17px → comfortable 19px */
--cds-leading-body:    calc(1.1875rem * ...);   /* 19px */

/* 字重 */
--cds-font-weight-regular: 400;
--cds-font-weight-medium:  500;
--cds-font-weight-semibold: 580;   /* 注意：不是 600 */
--cds-font-weight-bold:    600;
--cds-font-grad-semibold: 180;
--cds-font-grad-bold:     200;
```

**variable font 的加粗机制**：`font-weight` 只给数值，真正的字重轴走 `font-variation-settings`：

```css
.text-body-medium{
  font-size:var(--cds-font-size-body); line-height:var(--cds-leading-body);
  font-weight:var(--cds-font-weight-medium);
  --cds-font-axis-wght:var(--cds-font-axis-wght-medium);
  font-variation-settings:var(--font-opsz-axis,) var(--cds-font-axis-wght,) "GRAD" var(--cds-font-grad,0);
}
.text-body-semibold{ /* 同构，用 semibold 变量与 --cds-font-grad-semibold */ }
```

而 `--cds-font-axis-wght-*` 的初值是**空**（`--cds-font-axis-wght-medium: ;`），只有具体字体族支持 wght 轴时才被覆盖 —— 即**默认环境中 font-weight 生效、variation 是可选增强**。

### 9.2 字体族

```css
--cds-font-mono: var(--cds-font-mono-override,)
                 ui-monospace, SFMono-Regular, Menlo, Monaco,
                 Consolas, "Liberation Mono", "Courier New", monospace;
--cds-font-mono-ui: ui-monospace, SFMono-Regular, Menlo, Monaco,
                    Consolas, "Liberation Mono", "Courier New", monospace;
--cds-font-system: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
                   "PingFang SC", "PingFang TC", "Hiragino Sans",
                   "Apple SD Gothic Neo", sans-serif;
--cds-font-sans: var(--cds-font-system);
```

**第二套（`.cds-root` 内更晚出现，优先级更高）**：

```css
--cds-font-mono: var(--cds-font-mono-override,) var(--font-anthropic-mono,"SF Mono"),
                 "SF Mono", ui-monospace, Menlo, Consolas, monospace;
--cds-font-mono-ui: var(--font-anthropic-mono,"SF Mono"), "SF Mono",
                    ui-monospace, Menlo, Consolas, monospace;
--cds-font-sans: var(--font-anthropic-sans,var(--cds-font-system)), var(--cds-font-system);
--font-anthropic-sans: "anthropic-sans", var(--font-sans-fallbacks);
--font-anthropic-mono: "anthropic-mono", ui-monospace, monospace;
--font-sans-fallbacks: system-ui, "Segoe UI", Roboto, Helvetica, Arial,
                       var(--font-cjk-sans-fallback), var(--font-script-fallbacks), sans-serif;
```

**逐元素字体族：**

| 元素 | font-family | 来源 |
| --- | --- | --- |
| 卡片外壳 | `--cds-font-sans` | `cc1aae219` L13530 `font-sans`（→ `.font-sans{font-family:var(--cds-font-sans)}`） |
| 卡片标题/动词文本 | `--cds-font-sans`（继承外壳） | 同上 |
| 文件名（`CodeChip`，`p`） | `--cds-font-sans`（`.epitaxy-code-chip` 显式设 `var(--cds-font-mono)`；但 **`in a/button/[role=button]` 时被重置为 `inherit`** → 头部里实际是 sans） | `c19e90103-CuNz46ca.css`：`.epitaxy-code-chip{font-family:var(--cds-font-mono);...}` 与 `.epitaxy-root :is(a,button,[role=button])>.epitaxy-code-chip{...font-family:inherit;font-size:inherit;line-height:inherit;background:0 0}` |
| `old_string` / `new_string` 代码文本 | `--cds-font-mono` | `.epitaxy-root .epitaxy-diff{--diffs-font-family:var(--cds-font-mono)}` |
| `+N −M` 行数（现代头部 `bC`） | `--cds-font-sans` | `c227f4d5e` L2815 `font-sans` |
| `+N −M` 行数（紧凑 `Vz`） | `--cds-font-sans`（`text-body` 不改 family） | `c96d752d0` L24924 |
| `+N −M` 行数（旧版 `r1`） | `--cds-font-mono`（`font-mono`） | `cc1aae219` L27450 |
| 错误文案 | 继承 body 的 `--cds-font-sans` | `cb6930dae` L3749 只设 `text-danger`（颜色），未设 family |
| 入参键名（`Au`） | `--cds-font-mono`（`text-code`） | `cb6930dae` L3797 `className:"text-code opacity-70"` |
| 占位符代码视图 `Pu` | `--cds-font-mono`（同 diff 令牌） | `cb6930dae` L3845–3860 |
| 审批卡脚本块 | `--cds-font-mono`（`text-code`/`font: yg`） | `c19e90103` L4409 `yg = "var(--diffs-font-size,...)/var(--diffs-line-height,...) var(--diffs-font-family,...)"` |

**文件路径**：`c784da984` 的 `p()`/`d()` **不设 font-family**，完全继承。在头部（`/` 分隔的 inline 文本）里它是 **sans**；在 `Au()` 的入参列表里它被 `epitaxy-code-chip` 包住，在**非交互容器**中是 **mono**，在 `a`/`button` 里被重置为 sans。**结论：路径是"混合等宽"——同一个字符串在不同容器里可能 sans 也可能 mono。**

### 9.3 字号（逐位置，含 rem 与变量名）

| 位置 | 计算式 | 实际 px | 变量 / 类 | 证据 |
| --- | --- | --- | --- | --- |
| 卡片头部 label（动词+文件名） | `--cds-font-size-body` | **13px** | `text-body` / `--chat-body` | `cc1aae219` L13421 `text-body text-start`；`.text-body{font-size:var(--cds-font-size-body)}` |
| 同上，但被 transcript 覆写 | `--chat-body` 默认 `0.875rem` = 14px；`[data-code-own-row]` 内回落 `--cds-font-size-body` = 13px | **13–14px** | `--chat-body` | `.epitaxy-transcript-typography{--chat-body:calc(.875rem * ...)}` + `:where(.text-body){font-size:var(--chat-body)}` + `[data-code-own-row]{--chat-body:var(--cds-font-size-body)}` |
| `data-chat-text-size=s` | `0.8125rem` | **13px** | `--chat-body` | 同上 `[data-chat-text-size=s]` |
| `data-chat-text-size=l` | `0.9375rem` | **15px** | `--chat-body` | 同上 |
| 头部次要参数（`secondaryText`） | `.font-small` = `--cds-font-size-caption` | **11px** | `.font-small` | `cc1aae219` L13459 `ps-1 text-muted font-small` |
| 头部 `+N −M`（现代 `bC` pill） | `--cds-font-size-caption` | **11px** | `text-caption` | `c227f4d5e` L2815 |
| 头部 `+N −M`（紧凑 `Vz`） | `--cds-font-size-body` | **13px** | `text-body` | `c96d752d0` L24924 |
| 头部 `+N −M`（旧版 `r1`） | `--text-xs` | **12px** | `text-xs` / `--text-xs:.75rem` | `cc1aae219` L27450 |
| 代码正文（diff） | `--cds-font-size-code` | **12px** | `--diffs-font-size` | `.epitaxy-root .epitaxy-diff{--diffs-font-size:var(--cds-font-size-code)}` |
| 代码正文（兜底，无令牌时） | `13px` | 13px | 硬编码 | `c19e90103` L4402 `hg = {size:"13px", lineHeight:"20px", family:'"SF Mono", Monaco, ...'}` |
| 错误详情容器内文 | `text-body` | 13px | `text-body` | `cb6930dae` L3740 `gap-1.25 text-body whitespace-pre-wrap` |
| `` `Too many changes…` `` 提示 | `text-caption` | **11px** | `text-caption` | `cb6930dae` L3824 `font-sans text-caption text-secondary` |
| 审批卡变更组 heading | `text-footnote` | **12px** | `text-footnote` | `c96d752d0` L12740 |
| 审批卡变更组行 | `text-body` | 13px | `text-body` | `c96d752d0` L12753 |
| 文件路径（文件段） | `text-footnote` | **12px** | `text-footnote` | `c784da984` L94 |
| 入参键名 | `text-code` | **12px** | `text-code` | `.text-code{font-size:var(--cds-font-size-code);line-height:var(--cds-leading-code);font-family:var(--cds-font-mono)}` |
| 折叠提示（`Show more`） | `text-footnote` | 12px | `text-footnote` | `c96d752d0` L12370 `text-footnote text-muted` |

**卡片头部 vs 展开内容：字号不同。** 头部 label 13px（或 14/15px 随 chat 字号），展开后代码正文 12px。**代码比正文小一档**是一致的规律（`--cds-font-size-code` 与 `--cds-font-size-footnote` 同为 12px）。

### 9.4 字重

| 元素 | font-weight | 变量 | 证据 |
| --- | --- | --- | --- |
| 卡片外壳 | `normal`（不设） | — | `cc1aae219` L13530 `font-sans leading-normal` |
| 头部 label | 400 | 继承 | 无 `font-medium`/`font-semibold` |
| 代码正文 | 400 | `.text-code` 不设 weight | — |
| `+N −M`（紧凑 `Vz`） | 400 | 无 weight 类 | `c96d752d0` L24924 |
| `+N −M`（现代 `bC` pill） | **500** | `font-medium` → `--cds-font-weight-medium` | `c227f4d5e` L2815 |
| `+N −M`（旧版 `r1`） | 400 | 无 weight 类 | `cc1aae219` L27450 |
| 错误词（`Failed`） | 400（只有颜色 `text-danger`） | — | `c734f318c` L643 `D("shrink-0", Tt.tone)`，`tone` 只含 color 类 |
| 差分指示徽标 `DiffIndicator` | **500** | `font-medium` → `--cds-font-weight-medium` = 500 | `c227f4d5e` L2814 `font-sans font-medium [font-variant-numeric:tabular-nums_lining-nums]` |
| 命中高亮（路径搜索） | **600** | `font-semibold` | `c784da984` L14 `className:"font-semibold text-primary"` |
| 审批卡标题（`text-body font-semibold`） | 580 | `--cds-font-weight-semibold` | `c96d752d0` L3800 |

**没有任何编辑卡片元素把文件名加粗。** 文件名只靠 `text-primary`（亮）/ `text-secondary`（周围）做层级区分。

variable font 场景：见 9.1，`font-variation-settings: var(--font-opsz-axis,) var(--cds-font-axis-wght,) "GRAD" var(--cds-font-grad,0)`，与 `font-weight` **并存**（不是二选一）。

### 9.5 字距（letter-spacing）

- **代码正文：无 letter-spacing**。`.epitaxy-diff` 令牌块只设 font-size / line-height / family / 三种 color override / gap，**不含 letter-spacing**。所以是 `normal`。
- **`+N −M` 数字对齐**：
  - 现代头部 `bC`：`[font-variant-numeric:tabular-nums_lining-nums]`（L2815）—— tabular + lining 双锁。
  - 紧凑 `Vz`：`tabular-nums` 类 → `.tabular-nums{font-variant-numeric:var(--tw-ordinal,) var(--tw-slashed-zero,) var(--tw-numeric-figure,) var(--tw-numeric-spacing,) var(--tw-numeric-fraction,)}`，其中 `--tw-numeric-spacing:tabular-nums`。
  - 旧版 `r1`：**没有 tabular-nums**，靠 `font-mono` 天然等宽。
  - `DiffIndicator`（`c227f4d5e` L2815）：`[font-variant-numeric:tabular-nums_lining-nums]` —— 同时锁定 tabular + lining figures。
- **文件名截断时无 tracking 调整**：`c784da984` 全文无 `tracking-*`/`letter-spacing`。
- 全表 `letter-spacing` 规则只有 17 条，全部是 Tailwind 工具类（`tracking-[-.01em]`、`tracking-[.2em]` 等），**编辑卡片路径不引用其中任何一条**。

### 9.6 行高与度量

| 元素 | line-height | 计算 | 证据 |
| --- | --- | --- | --- |
| 代码正文（diff） | `--cds-leading-code` | `1.0625rem` = **17px**（ratio 12/17 ≈ 1.417） | `.epitaxy-root .epitaxy-diff{--diffs-line-height:var(--cds-leading-code)}` |
| 代码正文（兜底） | `20px` | 硬编码 | `c19e90103` L4403 |
| diff 单行最小高 | `min-height: 1lh; line-height: var(--cds-leading-code)` | 同上 | `cb6930dae` L600–601 `[data-line]{min-height:1lh;padding-inline:0;line-height:...}` |
| 头部 label | `--cds-leading-body` 或 `--chat-leading` | 19px 或 `1.42857` | `.text-body` + transcript 覆写 |
| 头部外壳 | `leading-normal` = 1.5 | — | `cc1aae219` L13530 |
| 旧版 `+N −M` | `leading-none` = **1** | — | `cc1aae219` L27450 |
| 现代 `+N −M`（`bC` pill） | `leading-[round(1.25em,1px)]` | 对 11px 字体 ≈ `round(13.75px)` = **14px** | `c227f4d5e` L2815 |
| `Too many changes…` | `--cds-leading-caption` | 17px | `text-caption` |
| 审批卡脚本块 | `--cds-leading-code` | 17px | `c19e90103` L4404 / `fj` 用 `DO * var(--cds-leading-code)`（`c96d752d0` L12292，`DO = 13`） |

**old_string / new_string 两段的展示形态与行高**：完全一致 —— 它们被合成到同一个 `fileDiff` 里，逐行走同一个 `<bu fileDiff={v.fileDiff}>`，共用 `--diffs-line-height`。**不存在"两段各自独立、行高不同"的情况**，因为根本没有两段独立的渲染块。

**多行文本最大高度与折叠阈值（确证数值）：**

| 容器 | 阈值 | 常量 | 证据 |
| --- | --- | --- | --- |
| ToolOutput / 代码正文 / 错误详情 | `max-height: 400px`，`overflow-y:auto` | `uu = "max-h-[400px] overflow-y-auto"` | `cb6930dae` L3456 |
| 兜底分离视图（`Removed text`/`Added text`） | `max-h-[200px]` | `Mu = "max-h-[200px] overflow-y-auto"` | `cb6930dae` L3817 |
| 旧版卡片内代码预览 | `max-h-[150px]` | 内联 | `cc1aae219` L13873、L13891 |
| 审批卡脚本 | `13 行 × --cds-leading-code + 2×--cds-pad-md` | `DO = 13` | `c96d752d0` L9191、L12292 |
| 审批卡备注文本 | `line-clamp-3` | 内联 | `c96d752d0` L12364 |
| diff 高度预留 | `min(行数 × 16 × (cdsRemPx/16), 400)` px | `du=16, fu=400, pu=320` | `cb6930dae` L3470–3487 |
| 变更预判（审批前） | 正文 > 200,000 字符 → `too_large` | 硬编码 `2e5` | `c96d752d0` L10864 |
| diff 计算上限 | `maxEditLength: 1000` | `s = 1e3` | `c254f7f8c` L16、L103 |
| 审批卡是否出 preview 的复杂度上限 | 单行 ≤ 1000 / 换行 < 12 / 宽度 ≤ 16 | `ZD=1e3, QD=12, $D=16, eO=40, tO=4` | `shared-20-DvwjRCWU` L7590–7594 |

**缩进与 tab-size：**

- diff 代码块：`tabSize: "var(--diffs-tab-size, 2)"`（`c19e90103` L4447）。`--diffs-tab-size` 由用户设置注入：`rf = pe?.tabSize ?? (M ? 2 : void 0)`，`af = { "--diffs-tab-size": rf }`（`cd2efac6e` L3311 附近）。**默认 2**（未设且非特定模式时为 `undefined` → 落回 `2`）。
- 全局 `html,:host{tab-size:4}`，`pre{tab-size:2}`（`c6a992d55` 中 `pre` 规则）。
- `.tab-1{tab-size:1}`、`.[tab-size:2]`、`.[tab-size:4]` 三个工具类存在但不被编辑卡片使用。
- 缩进引导线：`epitaxy-files-indent-guides`（`cd2efac6e`），属于代码编辑器面板，**不在 transcript 卡片内**。

### 9.7 颜色层级（浅色 / 深色两套）

**令牌链**（`c6a992d55-sXiDGMFQ.css`）：

```css
/* 浅色（:root 默认） */
--cds-gray-900:#0b0b0b;  --cds-gray-600:#52514e;  --cds-gray-400:#898781;  --cds-gray-50:#f0efec;
--cds-neutral-900:var(--cds-gray-900);  --cds-neutral-600:var(--cds-gray-600);  --cds-neutral-400:var(--cds-gray-400);
--cds-text-primary:var(--cds-neutral-900);     /* #0b0b0b */
--cds-text-secondary:var(--cds-neutral-600);   /* #52514e */
--cds-text-muted:var(--cds-neutral-400);       /* #898781 */
--cds-text-danger:var(--cds-role-danger-600) → var(--cds-red-600) = #8e2626;
--cds-text-git-added:#1e9e3c;
--cds-text-git-removed:#cd2054;

/* 深色（[data-mode=dark] / prefers-color-scheme:dark） */
--cds-text-primary:var(--cds-gray-50);         /* #f0efec */
--cds-text-secondary:var(--cds-gray-200);      /* #c3c2b7 */
--cds-neutral-400:var(--cds-gray-500);         /* #6d6b67 */
--cds-text-danger:var(--cds-role-danger-300) → var(--cds-red-300) = #ec7e7e;
--cds-text-git-added:#32d74b;
--cds-text-git-removed:#ff2c56;
```

**逐元素色值：**

| 元素 | 类 | 浅色 | 深色 | 证据 |
| --- | --- | --- | --- | --- |
| 卡片头部文件名 | `text-primary` | `#0b0b0b` | `#f0efec` | `cc1aae219` L25109 / L25250 |
| 头部外壳底色文本 | `text-text-300` | `#52514e` | `#c3c2b7` | `cc1aae219` L13399；`.text-text-300{color:var(--cds-text-secondary)}` |
| 头部次要参数 | `text-muted` | `#898781` | `#6d6b67` | `cc1aae219` L13459 |
| `+N`（现代 `bC`） | `text-git-added`（+ 20% 底色） | `#1e9e3c` | `#32d74b` | `c227f4d5e` L2856 |
| `−M`（现代 `bC`） | `text-git-removed`（+ 20% 底色） | `#cd2054` | `#ff2c56` | `c227f4d5e` L2857 |
| `+N`（紧凑 `Vz`） | `text-git-added` | `#1e9e3c` | `#32d74b` | `c96d752d0` L24926 |
| `−M`（紧凑 `Vz`） | `text-git-removed` | `#cd2054` | `#ff2c56` | `c96d752d0` L24927 |
| `+N`（旧版） | `text-forest-green` | **`#36884a`（硬编码，不随主题变）** | 同左 | `.text-forest-green{color:#36884a}` |
| `-M`（旧版） | `text-danger` | `#8e2626` | `#ec7e7e` | `cc1aae219` L27453 |
| diff 新增行号/文字 | `--diffs-addition-color-override` | `#1e9e3c` | `#32d74b` | `.epitaxy-root .epitaxy-diff{...}` |
| diff 删除行号/文字 | `--diffs-deletion-color-override` | `#cd2054` | `#ff2c56` | 同上 |
| diff 修改标记 | `--diffs-modified-color-override` | `--cds-text-accent` | 同 | 同上 |
| 兜底新增底色 | `var(--cds-bg-git-added)` | `color-mix(in srgb, #1e9e3c 20%, transparent)` | `color-mix(in srgb, #32d74b 20%, transparent)` | `cb6930dae` L3852–3853 |
| 兜底删除底色 | `var(--cds-bg-git-removed)` | `color-mix(in srgb, #cd2054 20%, transparent)` | `color-mix(in srgb, #ff2c56 20%, transparent)` | 同上 |
| 错误文案 | `text-danger` | `#8e2626` | `#ec7e7e` | `cb6930dae` L3749 |
| 停止/拒绝/阻止 | `text-secondary` | `#52514e` | `#c3c2b7` | `c96d752d0` L25279–25287 |
| 需审批提示 | `text-warning` | `--cds-role-warning-600` | `--cds-role-warning-300` | `c96d752d0` L25223 |
| 路径文件段 | `text-muted-as-secondary` | `= --cds-text-muted` = `#898781` | `#6d6b67` | `c784da984` L94 |
| 路径目录段（被高亮时） | `text-secondary` | `#52514e` | `#c3c2b7` | `c784da984` L88 |
| 命中高亮 | `text-primary` + 600 | `#0b0b0b` | `#f0efec` | `c784da984` L14 |
| 卡片边框 | `border-border-300` | `var(--cds-border)` = `var(--cds-alpha-2)` | 同（alpha 基于 `neutral-900`，深色下自动反相） | `cc1aae219` L13530 |
| 卡片底色（展开） | `bg-bg-000` | `var(--cds-surface-3)` = `var(--cds-gray-0)` = `#fff` | 深色 surface-3 | `cc1aae219` L13534 |

**`write-failed` 的颜色**（注意：属 dev-server 配置，不是文件编辑）：

```jsx
<p role="alert" className="text-footnote text-danger">
  {formatMessage(Cr[reason])}     // "Couldn't save this configuration. Try again."
</p>
```

`cf580efe9` L442–447。`text-footnote` = 12px / 15px 行高，`text-danger` 同上表。**是纯文本 `<p role="alert">`，无图标、无边框、无按钮。**

---

## 10. 完整 CSS（编辑卡相关，逐条摘录）

### 10.1 卡片外壳（Tailwind 编译产物，`c6a992d55-sXiDGMFQ.css`）

```css
/* 外层容器 */
.rounded-\[var\(--msg-block-radius\,0\.5rem\)\]{border-radius:var(--msg-block-radius,.5rem)}
.border-\[0\.5px\]{border-style:var(--tw-border-style);border-width:.5px}
.border-border-300,.border-border-400{border-color:var(--cds-border)}
.my-3{margin-block:calc(var(--spacing) * 3)}          /* --spacing:.25rem → 12px */
.mt-2{margin-top:calc(var(--spacing) * 2)}            /* 8px  */
.mt-3{margin-top:calc(var(--spacing) * 3)}            /* 12px */
.mb-2{margin-bottom:calc(var(--spacing) * 2)}         /* 8px  */
.mb-3{margin-bottom:calc(var(--spacing) * 3)}         /* 12px */
.hover\:bg-bg-200:hover{background-color:var(--cds-surface-0)}
.bg-bg-000{background-color:var(--cds-surface-3)}
.shadow-sm{--tw-shadow:var(--cds-shadow-sm);box-shadow:...}
.rounded-lg{border-radius:var(--radius-lg)}           /* .5rem  */
.rounded-xl{border-radius:var(--radius-xl)}           /* .75rem */
.rounded{border-radius:var(--cds-radius)}
```

### 10.2 编辑卡片专用（`epitaxy-*`，同一 CSS 文件）

```css
/* diff 容器的排版令牌 */
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

/* 卡片描边（有主题短路条件） */
.epitaxy-root .epitaxy-card-outline,
.epitaxy-root .epitaxy-card-outline-inset,
[data-mode=light][data-code-theme-light=claude-light] .epitaxy-root .epitaxy-diff:not(.epitaxy-fence),
[data-mode=dark][data-code-theme-dark=claude-dark]   .epitaxy-root .epitaxy-diff:not(.epitaxy-fence){
  --epitaxy-card-outline:0 0 0 1px var(--cds-border);
  box-shadow:var(--epitaxy-card-outline)
}
.epitaxy-root .epitaxy-card-outline-inset{box-shadow:inset var(--epitaxy-card-outline)}
.epitaxy-root .epitaxy-card-outline-overlay{outline:1px solid var(--cds-border);outline-offset:-1px}
.epitaxy-root .epitaxy-card-outline-overlay:focus-visible{
  outline-offset:2px;box-shadow:var(--cds-focus-shadow);outline:2px solid #0000
}
.epitaxy-root .epitaxy-card-outline-layer,.epitaxy-root .epitaxy-fence{position:relative}
.epitaxy-root .epitaxy-card-outline-layer:after{
  content:"";border-radius:inherit;
  box-shadow:inset 0 0 0 1px var(--cds-border),
             inset 0 0 0 1px var(--epitaxy-transcript-surface,var(--cds-surface-1));
  pointer-events:none;position:absolute;inset:0
}

/* 路径 chip */
.epitaxy-root .epitaxy-code-chip{
  font-family:var(--cds-font-mono);
  font-size:calc(var(--chat-body,var(--cds-font-size-body)) - 1px);
  background:var(--cds-alpha-1);
  color:var(--code-chip-ink,var(--cds-text-primary));
  border-radius:4px;
  padding-block:1px;padding-inline:2px;line-height:1.4
}
.epitaxy-root :is(a,button,[role=button])>.epitaxy-code-chip{
  --code-chip-ink:var(--cds-text-accent);
  font-family:inherit;font-size:inherit;line-height:inherit;background:0 0
}
.epitaxy-root :is(a,button,[role=button]):hover>.epitaxy-code-chip{
  background:hsl(from var(--cds-fill-accent) h s l / 10%)
}
```

### 10.3 运行时注入的内联样式（`cb6930dae` L593–602，`ha` 常量，用于 bash 卡片但共享同一机制）

```css
:host, [data-file], [data-diff] { --diffs-bg: transparent; }
:host { font-size: inherit; }
[data-file]{
  --diffs-font-size: 1em;
  --diffs-line-height: <--cds-leading-code>;
  --diffs-font-family: <--cds-font-mono>;
  --diffs-gap-inline: 0;
  --diffs-gap-block: 0;
  <jn>                                    /* 变量内联 */
}
[data-code]{ overflow: clip; }
[data-line]{ min-height: 1lh; padding-inline: 0; line-height: <--cds-leading-code>; }
[data-line]:hover{ background: transparent; }
```

编辑卡的等价版本是 `lu`（`cb6930dae` L3455）：

```css
[data-file]{ <jn> }
[data-line]{ min-height: 1lh; }
[data-code]{ padding-bottom: var(--diffs-gap-block, var(--diffs-gap-fallback)); overflow: clip; }
```

### 10.4 兜底分离视图配色（`cb6930dae` L3850–3857，JS 拼串）

```js
s = n + `[data-line]{background:${t};}
         [data-line-number]{background:${t};color:${o};}
         [data-line-number-content]::before{content:"${e} ";display:inline-block;min-width:1ch;color:${o};}`
// a=true（additions）: e="+", t="var(--cds-bg-git-added)",   o="var(--cds-text-git-added)"
// a=false(deletions): e="−", t="var(--cds-bg-git-removed)", o="var(--cds-text-git-removed)"
```

### 10.5 DiffIndicator（`c227f4d5e` L2812–2894）

```css
/* text 变体 */
-- 类串: "inline-flex items-center gap-xs shrink-0 text-caption leading-[round(1.25em,1px)]
          font-sans font-medium [font-variant-numeric:tabular-nums_lining-nums]
          rounded-chip border-0 p-0"
/* gap-xs → --cds-gap-xs = .375rem = 6px */
/* text-caption → 11px / 17px */
/* rounded-chip → calc(var(--cds-h-control-nested) / 4) */

/* pill 变体 */
.font-sans.font-medium{ font-weight:500 }
.rounded-chip{ border-radius:calc(var(--cds-h-control-nested) / 4) }   /* 1.125rem/4 = 4.5px */
/* 结构: h-control-nested（1.125rem = 18px），px-sm / px-[4px] py-[1px] */
.bg-git-added{ background-color:var(--cds-bg-git-added) }
.text-git-added{ color:var(--cds-text-git-added) }
.bg-git-removed{ background-color:var(--cds-bg-git-removed) }
.text-git-removed{ color:var(--cds-text-git-removed) }
/* hover: color-mix(in oklch, var(--cds-bg-git-*-added), white 8%) */
```

### 10.6 关键工具类换算表（Tailwind → 实际 CSS）

| 类 | 实际 CSS | 证据 |
| --- | --- | --- |
| `.text-body` | `font-size:var(--cds-font-size-body)` = 13px；`line-height:var(--cds-leading-body)` = 19px | `c6a992d55` @450430 |
| `.text-footnote` | 12px / 15px | @450641 |
| `.text-caption` | 11px / 17px | @450531 |
| `.text-code` | 12px / 17px + `font-family:var(--cds-font-mono)` | @438062 |
| `.text-xs` | `--text-xs:.75rem` = 12px，`line-height:calc(1/.75)` = 1.3333 | @451443 |
| `.text-heading` | 14px / 18px | @450849 |
| `.font-small` | sans + 11px + 400 + 17px | @437576 |
| `.font-sans` | `font-family:var(--cds-font-sans)` | @438568 |
| `.font-mono` | `font-family:var(--cds-font-mono)` | @438445 |
| `.font-mono-ui` | `font-family:var(--cds-font-mono-ui)` | @438518 |
| `.font-medium` | `font-weight:var(--cds-font-weight-medium)` = 500 | @458150 |
| `.font-semibold` | `var(--cds-font-weight-semibold)` = **580** | @458528 |
| `.font-bold` | `var(--cds-font-weight-bold)` = 600 | @457802 |
| `.tabular-nums` | `--tw-numeric-spacing:tabular-nums` → `font-variant-numeric:...tabular-nums...` | @470785 |
| `.text-primary` | `color:var(--cds-text-primary)` | @467879 |
| `.text-secondary` | `color:var(--cds-text-secondary)` | @468037 |
| `.text-muted` | `color:var(--cds-text-muted)` | @466990 |
| `.text-muted-as-secondary` | `color:var(--muted-as-secondary,var(--cds-text-muted))` | @467030 |
| `.text-danger` | `color:var(--cds-text-danger)` | @465373 |
| `.text-git-added` | `color:var(--cds-text-git-added)` | @465511 |
| `.text-git-removed` | `color:var(--cds-text-git-removed)` | @465867 |
| `.text-text-300` | `color:var(--cds-text-secondary)` | @468381 |
| `.text-forest-green` | `color:#36884a`（硬编码） | @465478 |
| `.max-h-[400px]` | `max-height:400px` | @156453 |
| `.leading-none` | `line-height:1` | @456857 |
| `.rounded-card` | `border-radius:calc(var(--cds-radius) + calc(.25rem * var(--cds-rem-scale,1)))` | @290411 |
| `.rounded-chip` | `border-radius:calc(var(--cds-h-control-nested) / 4)` | — |
| `.gap-xs` | `gap:var(--cds-gap-xs)` = 6px | — |
| `.px-2.5` | `padding-inline:calc(var(--spacing) * 2.5)` = 10px | @96973 |
| `.py-2` | `padding-block:calc(var(--spacing) * 2)` = 8px | — |
| `.border-0.5` | `border-width:.5px` | @297959 |
| `.shadow-xs` | `0 1px 2px 0 #0000000d` | @504210 |

### 10.7 间距 / 圆角令牌（`.cds-root` 默认，`c6a992d55`）

```css
--cds-radius: calc(.375rem * var(--cds-rem-scale,1));      /* 6px  */
--cds-radius-composer: calc(.75rem * var(--cds-rem-scale,1));
--cds-h-control: calc(1.5rem * ...);                       /* 24px */
--cds-h-control-nested: calc(1.125rem * ...);              /* 18px */
--cds-icon: calc(1rem * ...);
--cds-pad-xs: calc(.25rem * ...);   /* 4px  */
--cds-pad-sm: calc(.375rem * ...);  /* 6px  */
--cds-pad-md: calc(.5rem * ...);    /* 8px  */
--cds-pad-lg: calc(.75rem * ...);   /* 12px */
--cds-pad-xl: calc(1.25rem * ...);  /* 20px */
--cds-gap-xs: calc(.375rem * ...);  /* 6px  */
--cds-gap-sm: calc(.5rem * ...);    /* 8px  */
--cds-gap-md: calc(.75rem * ...);   /* 12px */
--cds-gap-lg: calc(1.25rem * ...);  /* 20px */
--cds-gap-xl: calc(2rem * ...);     /* 32px */
--cds-border: var(--cds-alpha-2);
--cds-alpha-1: hsl(from var(--cds-neutral-900) h s l / 5%);
--cds-alpha-2: hsl(from var(--cds-neutral-900) h s l / 10%);
```

---

## 11. 组件树（带 testid / class / 行号）

```
TranscriptRow
└── JIe({tool, ...})                                    c96d752d0 L24931
    ├── zz({tool,summary})                              L24879
    │   └── o.Row = Tu({tool,summary,inCard})           cb6930dae L3613
    │       ├── [非 diff 分支] 直接返回
    │       └── [diff 分支] L3695
    │           └── vu({inCard, reservePx, header, children})   L3489
    │               └── div.epitaxy-diff.epitaxy-code-card.rounded-lg.overflow-clip
    │                   └── Z({slot:"code", label:"Code", className:"max-h-[400px] overflow-y-auto"})  L3457
    │                       └── bu({fileDiff})          L3534
    │                           └── br({fileDiff,onPostRender})   c53a94863 L7
    │                               └── p({fileDiff,...})        ca817835b L12
    │                                   └── diffs-container      ca7ba268c
    │
    ├── UIe({state,label,meta,diff,...})                c96d752d0 L24790
    │   └── up.Step = St({...})                         c734f318c L559
    │       ├── span#label     .text-muted               L672
    │       ├── span#meta      .text-primary .min-w-0    L690
    │       ├── span#outcome   .shrink-0 + tone          L643
    │       ├── span[data-cds-row-toggle]                L221
    │       │   └── span (CaretRightFilled icon)         L204
    │       ├── span[data-cds-row-media]                 L778
    │       │   └── np = bC = DiffIndicator pill         c227f4d5e L2859
    │       └── div[data-cds-row-panel]                  L184
    │           └── bt({detail,open,actions,spacing})    L512
    │               ├── .font-sans.text-body.text-secondary   L518
    │               └── [actions] div.flex.h-[1lh]        L530
    │
    ├── [turnMark] ZAe({candidate,tail,step,...})        L24854
    └── [turn tail] Vz（纯文本变体）                       L24922
```

编辑卡专用的**旧版**分支（`cc1aae219`）：

```
Eh(...)                                                 L16xxx（Edit 分支 L16945）
└── SR({target, hover:false})   （文件引用/右键菜单上下文）
    └── XH = YH({...})                                  L13343
        ├── div.group/row                               L13395
        │   ├── div (icon: Edit / BookText / File)      L13408
        │   └── div.text-body.text-muted                L13419
        │       ├── span.truncate (label)               L13429
        │       └── span[data-testid="tool-row-caret"]  L13442
        └── [secondaryElement]                          L13456
            ├── CodeChip (variant neutral)              L16989
            └── span.text-xs.font-mono.leading-none     L16992
                ├── span.text-forest-green  "+N"        L16994
                └── span.text-danger        "-M"        L16995
```

---

## 12. 未确认项

1. **`zh()` / `Pe()` / `bo()` 等短名函数的确切实现**：`c05b96c7f` 里大量依赖（如 `zh(o)` 用于 failure 文案、`Pe(name,input)` 用于 Artifact 动作），但它们从 `shared-130-Bwsvvi4y` 导入，我没有逐个反解到最底层实现。不影响本文结论。
2. **`hr()`（工具名归一化的第一层）的完整实现**：`c05b96c7f` L5526、L7308 等调用 `hr(t)`，其定义在 `shared-130` 的 `cr`/`oo` 链路里，我确认了它返回的是 `kH` 表里的规范名（通过 `FH()`），但没读到 `pL()` 这一层的字符串预处理细节（大小写、`_`↔`-`、命名空间剥离顺序）。
3. **`--cds-font-mono` 在 Windows 上的实际解析值**：CSS 里给了两套定义（`ui-monospace, SFMono-Regular, Menlo, ...` 与 `var(--font-anthropic-mono,"SF Mono"), "SF Mono", ...`），后者在 `.cds-root` 内更晚出现故优先级更高。但 `--font-anthropic-mono` 指向的 `"anthropic-mono"` 字体是否随包分发、是否真的有 woff2，我未验证（`ion-dist` 下确有大量 woff2，但没逐个匹配 font-family）。
4. **`text-body` 在编辑卡片里到底用 13px 还是 14px**：取决于是否在 `.epitaxy-transcript-typography` 内、以及行上是否有 `data-code-own-row`。CSS 三条规则互相覆盖（`.text-body` → `:where(.text-body)` → `[data-code-own-row]`），我给出了三种情况的数值，但**没有确证 Edit 卡片在同一时刻命中哪一条**（需要真实 DOM 快照，而我没有运行应用）。
5. **`NotebookEdit` 的 `cell_type` 是否有任何 UI 影响**：全量 grep `<v1>/*.js` 中 `cell_type` 只在 schema/参数透传层出现，UI 层 0 命中。但可能存在我未 grep 到的动态拼接键名。
6. **`MultiEdit` 是否曾在旧版本有子卡**：`c254f7f8c` 里没有任何 "multi_edit_not_last"/"multi_edit_last" 类逻辑（那是 `artifacts` 工具的，`cc1aae219` L8701–8722）。历史版本无法从当前包确证。
7. **`edit_mode: "insert"` 时 UI 是否显示插入位置**：`c254f7f8c` 只处理 `delete` 特例，`insert` 与 `replace` 走同一路径（纯新增 vs diff）。**没有插入位置提示**（如 "after cell X"），但这也可能是我漏看的某处 tooltip。
8. **`--cds-font-axis-wght-*` 的实际覆盖值**：默认是空字符串，只有特定字体族加载时才被填。哪个字体族会填、填多少，我没有找到写入点。

