# dsh-system-fonts

DeepSeek Harness 的字体与排印插件。本插件的字族下拉框**替换**宿主的三个字体输入框（内容 / 代码 / 终端），字号仍归宿主的步进器管；另加**行距**与**字距**两根微调。界面文案跟随宿主语言：中文界面纯中文，英文界面纯英文。

*A font & typography plugin for DeepSeek Harness. Its family dropdowns **replace** the host's three family inputs (text / code / terminal); font sizes stay on the host's steppers. Adds **line-height** and **letter-spacing** sliders. UI copy follows the host language — pure Chinese in a zh UI, pure English in an en UI.*

- **界面、内容、代码、终端各占一个字体槽**；走宿主 theme 服务的 `setFontFamily`，与宿主共享同一份持久化状态。
  *Text / code / terminal each get a family slot, routed through the host theme service's `setFontFamily` so the plugin and host share one persisted state.*
- **只做字族，不做字重**：每档的字重由主题的 `font` 简写决定，本插件**从不写** `font-weight`（早先的字重档已移除）。
  *Families only — never weights. Each step's weight comes from the theme's own `font` shorthand; the plugin emits no `font-weight` at all (the earlier weight picker was removed).*
- **字体从 Windows 读**：GDI 集合 + 注册表 Fonts 键 + 逐文件元数据合并。
  *Families are enumerated on Windows from GDI + the registry Fonts key + per-file metadata.*
- **字号不碰**：正文 / 代码 / 终端字号都由宿主的步进器控制，本插件不写。
  *Sizes are left alone — all three stay on the host's own steppers.*

## 安装 · Install

```bash
dsh plugin --profile desktop add link:C:/Users/17445/Desktop/dsh-system-fonts
```

装完**必须完全退出并重开 DeepSeek Harness** —— 插件加载发生在 profile 组装期。
*A full restart is required — plugin load happens at profile assembly time.*

打开后在 **设置 → 通用** 里点开「字号大小」右侧的展开箭头（「更多字体设置」）：三个字体下拉就长在宿主的**可折叠字体区**里，各自紧跟在被它替代的官方族名行之后 —— 正文字体 / 代码字体 / 代码字号 / 终端字体 / 终端字号，最后是「行距」「字距」两根滑杆，拖动即时生效。官方族名输入框被隐藏，字号步进器保留不变；折叠时本插件的行随之收起（不显示为独立设置项）。

*In **Settings → General**, open the disclosure on the "Font size" row ("More font settings"): the three family dropdowns live **inside the host's collapsible font region**, each directly after the official family row it replaces — text font / code font / code size / terminal font / terminal size — with the line-height and tracking sliders last, live-applied. The official family inputs are hidden while the size steppers stay; while the region is collapsed the plugin's rows are hidden with it (they never show as standalone settings entries).*

- **行距 / Line height**：markdown 各档 `line-height` 百分比（**50–100**，只紧不松）。
- **字距 / Letter spacing**：`letter-spacing` on `[class*="markdown"]`，−0.30em ~ +0.30em，0 为宿主默认。

### `link:` 还是 `file:` · link vs file

| 写法 | 行为 | 用途 |
|---|---|---|
| `link:…` | 软链到源码目录 | **改插件用这个** —— 编辑 + 重启即生效 |
| `file:…` | 拷一份进 profile | 交付 / 固定版本 |

两者都已用 `link:` 装进 `desktop` 与 `web` profile。移除：
*Both profiles already use `link:`. Remove with:*

```bash
dsh plugin --profile desktop remove dsh-system-fonts
```

## 它到底改了什么 · What it overrides

| 覆写的东西 | 落点 | 覆盖范围 |
|---|---|---|
| `--dsw-font-family` | `:root, body` | 侧栏 / 按钮 / 设置页 + 会话正文 |
| `--ds-font-family-code` | `:root, body` | 行内代码 / 代码块 |
| `--dsh-font-family-terminal` | theme service | 终端（经宿主 `setFontFamily` 持久化） |
| `markdown-*` 的 `-line-height` 与简写 `/lh` | `:root, body` | 行高按「行距」缩放；**不写 `font-weight`** |
| `letter-spacing` | `[class*="markdown"]` | 正文字符间距 |
| 影子根注入 | 标题栏 shadow DOM | Windows 标题栏菜单条的字族 / 字号（无字重） |

**族名写入委托给宿主 theme 服务。** 面板提交一个族名时调 `theme.setFontFamily(role, value)` —— 规范化、持久化、`theme/change` 事件都由宿主做，插件下拉与宿主输入框因此共享一份状态；宿主端改字体也会经 `theme/change` 镜像回插件下拉。theme 服务缺席时（部分宿主）回退到本地 `localStorage` 写入。
*Family writes are delegated to the host theme service. Committing a family calls `theme.setFontFamily(role, value)` — normalize/persist/`theme/change` are all the host's, so the dropdowns and host inputs share one state and edits on either side mirror through `theme/change`. When the service is absent the bridge falls back to local `localStorage`.*

**落点必须是 `:root, body`。** 宿主把 30 档字阶声明在 `body{}`，族名 token 放 `:root{}`；只覆写 `:root` 打不进去。
*The write must land on `:root, body` — the host declares the scale on `body`.*

**字号不冻结。** 行距改写只换简写的 `/lh` 段，`var(--dsh-content-font-size,14px)` 与字重 token 原样保留，宿主改字号、主题改字重都照常生效。
*Sizes are never frozen — the row-spacing rewrite only touches the shorthand's `/lh` segment; the font-size var and any weight token pass through untouched.*

选中字族**前置**到宿主栈之前不替换它，尾部 `"PingFang SC", "Microsoft YaHei"` 继续兜住中文。
*The chosen family is prepended to the host stack, not replacing it — the CJK tail keeps catching 汉字.*

## 字重归主题 · Weights belong to the theme

宿主排印是 **30 档阶梯**，每档的 `font` 简写自带字重，`font-weight` 在 DSH CSS 里出现 **357 次**、几乎不继承。字重由**主题**决定（CDS 主题的 Anthropic 字面自带 400/500/600/700 的层级），所以本插件只改字族与行高，**不提供也不写任何字重**；早先「字重按整阶平移」的控件已删除。
*The host's typography is a 30-step scale whose `font` shorthands carry their own weights; `font-weight` appears 357 times in DSH's CSS and is almost never inherited. The theme decides those weights (the CDS theme's Anthropic faces bring the 400/500/600/700 hierarchy), so this plugin changes families and line-heights only — it exposes no weight control and emits no weight declaration. The earlier "shift the whole scale" picker is gone.*

## 为什么用 `!important` · Why !important

宿主内联写 token、阶梯各档自带选择器；`!important` 作者声明才稳压。压得住同元素声明，压不住继承 —— 所以落点必须含 `body`。
*The host writes tokens inline and each step carries its own selectors; an `!important` author declaration wins — and landing must include `body` because `!important` can't beat inheritance.*

## 字体清单从哪来 · Where the catalogue comes from

三源取并集：
*Three sources, unioned:*

1. **PowerShell + `InstalledFontCollection`** —— GDI 规范族名（CSS 可解析，但无字重、无中文名）。
2. **注册表 Fonts 键**（HKLM + HKCU）—— 本地化显示名 + 每族装的字重（逐条拆解；字重只作为清单数据返回，界面不再使用）。
3. **逐文件 `GlyphTypeface` 元数据** —— 每个字体文件声明的 `Win32FamilyNames` + OpenType 字重，让 `PingFang SC` 与 `苹方-简` 归进同一族。

合并约 **388 族**，首次枚举 ~3 s，进程内缓存；下拉底部「重新读取系统字体」强刷。
*~388 families; ~3 s first enumeration, cached per-process; the footer's refresh item forces a re-read.*

### 为什么不走浏览器 · Why not the browser

`queryLocalFonts` 在 DSH 用不了 —— 宿主从未启用它，权限处理器在 Electron 主进程。
*Local Font Access is unusable — the host never enabled it and the permission handler lives in the Electron main process.*

### 读不到会怎样 · Failure mode

两源皆失败时下拉退化为**手写族名**并说明原因。
*When both fail the dropdown degrades to a free-text family name with a note.*

## 开发 · Development

```bash
npm ci            # esbuild only (dev-time; no runtime dep)
npm run build     # client/src/* -> client/client.js (committed artifact)
npm test          # freshness check + all suites
npm run verify    # end-to-end: real enumeration + actual stylesheet
```

bundle 由 `client/src/` 用 esbuild 打成宿主模块加载器格式；CSS 由测试钉住。
*The bundle is built from `client/src/` into the host's module-loader format; the emitted CSS is pinned by tests.*

## 已知限制 · Known limits

- **只在 Windows 有清单**；其他平台 `supported: false`，下拉退化为手写。
  *Catalogue is Windows-only; elsewhere the dropdown degrades to a free-text name.*
- **字阶清单静态**（30 档，按 0.2.0-rc.2）。宿主加档则新档不会被「行距」缩放。
  *The 30-step scale is static; new host steps are not line-height-scaled.*
- **终端字族持久化但即时视觉待宿主消费** —— 写入经 `setFontFamily` 正常持久化，但 xterm 读 `rawOptions.fontFamily`，宿主尚未消费 `--dsh-font-family-terminal`，视觉可能要宿主跟进才生效。
  *Terminal family persists through `setFontFamily`, but xterm reads `rawOptions.fontFamily` — live visual may wait on the host consuming the var.*
- **硬写 `font-family` 的不归它管**（luckysheet、内嵌编辑器）。
  *Components that hard-code `font-family` are out of scope.*
- **原生弹出菜单够不着** —— 系统菜单字体由 Windows 决定。
  *Native popup menus follow Windows, not the plugin.*
- **行是挂载后用 DOM 搬进宿主可折叠字体区的**（槽位无法注入组内）。宿主折叠时该区不存在，行会归位到槽位并 `display:none`，绝不留在被删除的区域里；找不到可识别的结构时，行留在原槽位顺序且可见、不遮蔽任何官方输入框；卸载时完全还原。
  *The rows are moved INTO the host's collapsible font region after mount (a slot cannot inject there). While collapsed the region does not exist: the rows are re-seated in the outlet and hidden — never left inside a removed region. If the host shape is not recognized the rows stay visible at their slot positions and nothing is hidden; dispose restores the host DOM.*
- **本插件只往「通用」里加 5 行，不再做页面内的分组容器**。早期版本曾把外观相关的行收进一个自建容器、置于「通用」顶部；用户要求「外观」与「通用」同级，该页面现由 `cds-theme` 以真正的 `settings.section` 提供（`settings.appearance.item` 子账本），本插件的那套容器已删除。字体行仍在「通用」→「字号大小」的折叠区里（见上一条），不受影响。
  *This plugin contributes 5 rows to 通用 and no longer builds an in-page grouping container. An earlier build collected the appearance-ish rows into a container of its own at the top of General; the user wanted 外观 as a SIBLING of 通用, which `cds-theme` now provides as a real `settings.section` (child ledger `settings.appearance.item`), so that container is gone. The font rows still live inside 通用 → 「字号大小」's collapsible region (see above) and are unaffected.*
- **宿主「没有偏好」不等于「清空我的选择」**。宿主的三个字族字段是 `volatile()` 的，重启后快照一律为 `""`；早期版本把该空值直接镜像覆盖本地，导致正文/代码/终端三个字体在下次启动时一起丢失（用户报的是「终端字体重开后又变回默认」，实际三个角色都受影响）。现在改为：宿主有值则宿主为准（唯一真源），宿主为空而本地有值时把本地值**重新写回宿主管线**，双方收敛到用户的选择。
  *An empty host family is NOT an instruction to forget the choice. The host's three family fields are `volatile()`, so a restart reports `""` for every role; the old code mirrored that emptiness over the store and erased all three roles at once (the user noticed it on the terminal, which was simply the most recent pick). Now a host value always wins, while an empty host value meets a stored choice by re-asserting that choice through the host pipeline.*
- **新文案必须两种语言同时加**：`locale/zh.json` 与 `locale/en.json` 的 `strings` 键集必须一致（测试会断言），界面语言由宿主切换，中英各纯一语言。测试还断言字典键集与「行真正用到的键」完全相等 —— 加了字符串却没接上会被判失败，而不是留成死键。
  *A new string goes into both `locale/zh.json` and `locale/en.json` — the key sets must match (asserted by tests); the host language decides, and each UI is monolingual. The suite also asserts the dictionary key set equals the set the rows actually exercise, so an unused string fails instead of lingering as a dead key.*
- **旧配置自动升级**：早期版本存过 `uiWeight` / `codeWeight`，读出时直接丢弃（不报错、不迁移），只会保留字族 / 行距 / 字距。
  *Old payloads that still carry `uiWeight` / `codeWeight` load fine — the removed fields are ignored (no error, no migration); families, line-height and tracking survive.*
- 设置存 `localStorage`，不是 profile。
  *Settings live in `localStorage`, not the profile.*
