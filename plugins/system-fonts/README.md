# dsh-system-fonts

DeepSeek Harness 的字体与排印定制插件。本插件将宿主原有的三个字体输入框（内容 / 代码 / 终端）替换为本地字族智能下拉选择器，字号调节仍交由宿主原生步进器管理；同时新增**行距**与**字距**两项实时微调滑块。界面文案严格适配宿主语言设置（中文环境显示中文，英文环境显示英文）。

*A font & typography plugin for DeepSeek Harness. Its family dropdowns **replace** the host's three family inputs (text / code / terminal); font sizes stay on the host's steppers. Adds **line-height** and **letter-spacing** sliders. UI copy follows the host language — pure Chinese in a zh UI, pure English in an en UI.*

- **界面、内容、代码、终端各占一个独立字体槽位**：通过宿主 theme 服务的 `setFontFamily` 统一存取，与宿主保持完全同步的持久化状态。
  *Text / code / terminal each get a family slot, routed through the host theme service's `setFontFamily` so the plugin and host share one persisted state.*
- **专注字族配置，解耦字重管理**：排印中各字阶的字重均遵循当前主题的 `font` 简写规格，本插件**不主动声明** `font-weight`，避免破坏主题原生的字重梯度（早先版本的字重微调项已移除）。
  *Families only — never weights. Each step's weight comes from the theme's own `font` shorthand; the plugin emits no `font-weight` at all (the earlier weight picker was removed).*
- **原生枚举 Windows 本地字体**：智能融合 GDI 字体集、注册表 Fonts 键及字体文件 OpenType 元数据，呈现完整的本地字族清单。
  *Families are enumerated on Windows from GDI + the registry Fonts key + per-file metadata.*
- **保留宿主字号控制权**：正文、代码与终端的字号均由宿主原生步进器控制，插件不作干预。
  *Sizes are left alone — all three stay on the host's own steppers.*

## 安装与使用 · Installation

```bash
dsh plugin --profile desktop add link:C:/Users/17445/Desktop/dsh-system-fonts
```

> [!IMPORTANT]
> 安装完成后**必须彻底退出并重启 DeepSeek Harness** —— 插件的加载与依赖注入执行于 Profile 组装初始化阶段。
> *A full restart is required — plugin load happens at profile assembly time.*

启动后进入 **设置 → 通用**，展开「字号大小」右侧的箭头（「更多字体设置」）：三个字族下拉选择器无缝嵌入宿主原生的**可折叠字体配置区**内，分别紧随其所替代的官方族名项之后 —— 依次为「正文字体 / 代码字体 / 代码字号 / 终端字体 / 终端字号」，末尾附带「行距」与「字距」调节滑块，拖动即可实时生效。原生文本输入框已被隐藏，原生字号步进器完好保留；折叠该区域时，插件新增的配置行亦会联动收起。

*In **Settings → General**, open the disclosure on the "Font size" row ("More font settings"): the three family dropdowns live **inside the host's collapsible font region**, each directly after the official family row it replaces — text font / code font / code size / terminal font / terminal size — with the line-height and tracking sliders last, live-applied. The official family inputs are hidden while the size steppers stay; while the region is collapsed the plugin's rows are hidden with it (they never show as standalone settings entries).*

- **行距 / Line height**：微调 Markdown 各级字阶的 `line-height` 百分比（范围 **50%–100%**，紧凑排版）。
- **字距 / Letter spacing**：作用于 `[class*="markdown"]` 的 `letter-spacing`（范围 −0.30em ~ +0.30em，0 为宿主默认值）。

### 安装协议比较：`link:` 与 `file:` · link vs file

| 协议 | 行为特征 | 推荐场景 |
|---|---|---|
| `link:…` | 软链指向本地源码目录 | **本地开发与持续更新推荐** —— 编辑代码、构建并重启宿主后立即生效 |
| `file:…` | 完整复制插件包到 Profile 存储 | 生产交付 / 固定特定版本分发 |

当前环境已通过 `link:` 软链安装至 `desktop` 与 `web` 两个 Profile。卸载命令如下：
*Both profiles already use `link:`. Remove with:*

```bash
dsh plugin --profile desktop remove dsh-system-fonts
```

## 覆写机制与作用域 · Overridden Tokens & Scope

| 覆写目标 | 作用域 | 生效范围与机制 |
|---|---|---|
| `--dsw-font-family` | `:root, body` | 侧边栏、按钮、设置界面及会话正文 |
| `--ds-font-family-code` | `:root, body` | 行内代码与代码块 |
| `--dsh-font-family-terminal` | Theme Service | 终端环境（通过宿主 `setFontFamily` 实现持久化存储） |
| `markdown-*` 的 `-line-height` 与简写 `/lh` | `:root, body` | 行高按配置比例动态缩放；**严格不声明 `font-weight`** |
| `letter-spacing` | `[class*="markdown"]` | Markdown 正文字符间距 |
| Shadow Root 注入 | 标题栏 Shadow DOM | Windows 原生风格标题栏菜单条的字族与字号 |

**字族状态统一托管至宿主 Theme 服务**：
面板提交字族变更时调用 `theme.setFontFamily(role, value)` —— 数据格式规范化、本地持久化与 `theme/change` 事件广播均由宿主统一负责。插件下拉菜单与宿主原生输入框因此共享单一数据源，任何一端的修改均能实时双向同步。在宿主未暴露 Theme 服务的极端环境下，插件会自动优雅降级为本地 `localStorage` 存储。
*Family writes are delegated to the host theme service. Committing a family calls `theme.setFontFamily(role, value)` — normalize/persist/`theme/change` are all the host's, so the dropdowns and host inputs share one state and edits on either side mirror through `theme/change`. When the service is absent the bridge falls back to local `localStorage`.*

**覆写作用域必须同时包含 `:root, body`**：
宿主将 30 档字阶直接声明在 `body` 作用域上，而字族 Token 位于 `:root`；若仅覆写 `:root`，样式优先级无法覆盖 `body` 上的内联样式。
*The write must land on `:root, body` — the host declares the scale on `body`.*

**字号与字重动态响应**：
行距计算仅动态更新 `font` 简写中的行高（`/lh`）分量，宿主字号变量 `var(--dsh-content-font-size, 14px)` 以及主题定义的字重 Token 均被完好保留，宿主字号缩放与主题字重调节均不受影响。
*Sizes are never frozen — the row-spacing rewrite only touches the shorthand's `/lh` segment; the font-size var and any weight token pass through untouched.*

**字体回退策略**：
用户选中的字族会被前置追加至宿主字体栈的最前端，尾部的 `"PingFang SC"`, `"Microsoft YaHei"` 等 CJK 回退链保持完整，确保中文字符渲染始终稳定可靠。
*The chosen family is prepended to the host stack, not replacing it — the CJK tail keeps catching 汉字.*

## 字重归属主题规范 · Weights Belong to the Theme

宿主排印系统定义了 **30 级排印阶梯**，每档的 `font` 简写均内置了具象字重；且 DSH 原生样式中包含 **357 处** `font-weight` 声明，极少依赖继承。排印体系的视觉字重梯度应当由主题层级统筹管理（例如 CDS 主题内置的 Anthropic 字族具备规范的字重体系），因此本插件专注调节字族与行高，**不提供也不主动声明任何字重**；早先版本中「字重整阶平移」的实验性控件已彻底移除。
*The host's typography is a 30-step scale whose `font` shorthands carry their own weights; `font-weight` appears 357 times in DSH's CSS and is almost never inherited. The theme decides those weights (the CDS theme's Anthropic faces bring the 400/500/600/700 hierarchy), so this plugin changes families and line-heights only — it exposes no weight control and emits no weight declaration. The earlier "shift the whole scale" picker is gone.*

## 样式特异性设计 · Why !important

宿主在组件层内联写入 Token，且各字阶带有特定选择器；采用带 `!important` 的作者样式规则才能确保稳定覆盖。同时由于样式规则能够压制同元素声明却无法穿越层叠继承，因而选择器必须显式命中 `body`。
*The host writes tokens inline and each step carries its own selectors; an `!important` author declaration wins — and landing must include `body` because `!important` can't beat inheritance.*

## 字体清单获取机制 · Where the Catalogue Comes From

通过三路数据源并集计算生成：
*Three sources, unioned:*

1. **PowerShell + `InstalledFontCollection`** —— 枚举 GDI 规范族名（确保 CSS 安全解析，但不含字重分级与本地化中文名称）。
2. **注册表 Fonts 键**（遍历 HKLM 与 HKCU）—— 提取本地化显示名称与各字族安装的字重规格（逐条解析；字重信息仅用于元数据清单，UI 不做字重干预）。
3. **逐文件 `GlyphTypeface` 元数据解析** —— 读取字体文件内部声明的 `Win32FamilyNames` 及 OpenType 字重属性，将 `PingFang SC` 与 `苹方-简` 等不同别名智能归并为同一字族。

合并后收录约 **388 个字族**，首轮枚举耗时约 3 秒，结果在进程生命周期内常驻缓存；下拉列表底部提供「重新读取系统字体」选项以支持手动强制刷新。
*~388 families; ~3 s first enumeration, cached per-process; the footer's refresh item forces a re-read.*

### 为什么不使用浏览器原生 API · Why Not the Browser

Web 标准的 `queryLocalFonts` 在当前 DSH 环境中不可用：宿主未开放该接口权限，且权限校验逻辑位于 Electron 主进程中。
*Local Font Access is unusable — the host never enabled it and the permission handler lives in the Electron main process.*

### 降级容错机制 · Failure Mode

当系统字体枚举失败时，下拉选择器将优雅降级为**手动输入字族名称**文本框，并附带错误提示信息。
*When both fail the dropdown degrades to a free-text family name with a note.*

## 本地开发与测试 · Development

```bash
npm ci            # 安装构建依赖（仅需 esbuild，零运行时依赖）
npm run build     # 编译客户端代码：client/src/* -> client/client.js（纳入版本控制）
npm test          # 执行产物新鲜度检查及全部测试用例
npm run verify    # 端到端验证：真实字体枚举与样式表输出校验
```

客户端 Bundle 通过 esbuild 将 `client/src/` 编译为宿主专用的模块加载格式；样式输出规范由单元测试严格锁定。
*The bundle is built from `client/src/` into the host's module-loader format; the emitted CSS is pinned by tests.*

## 边界与已知限制 · Known Limits

- **本地字体枚举仅支持 Windows 平台**：其他操作系统环境下 `supported: false`，字族选择自动降级为手动文本输入。
  *Catalogue is Windows-only; elsewhere the dropdown degrades to a free-text name.*
- **字阶定义基于固定快照（30 档，对应 0.2.0-rc.2）**：若宿主未来新增排印字阶，新字阶将不会被「行距」滑块联动缩放。
  *The 30-step scale is static; new host steps are not line-height-scaled.*
- **终端字族生效依赖宿主支持**：终端字族设置已通过 `setFontFamily` 正常持久化，但由于底层 xterm 组件读取 `rawOptions.fontFamily`，在宿主尚未正式消费 `--dsh-font-family-terminal` 变量前，终端界面的即时视觉呈现可能需要等待宿主适配。
  *Terminal family persists through `setFontFamily`, but xterm reads `rawOptions.fontFamily` — live visual may wait on the host consuming the var.*
- **硬编码样式的第三方内嵌组件不在覆写范围**（例如 Luckysheet 表格组件、部分内置独立编辑器）。
  *Components that hard-code `font-family` are out of scope.*
- **原生弹出菜单由系统接管**：Windows 原生上下文菜单字体由操作系统全局外观控制，Web 样式无法干预。
  *Native popup menus follow Windows, not the plugin.*
- **动态 DOM 搬移与折叠状态联动**：由于宿主扩展槽位无法直接注入至折叠容器内部，插件设置行在挂载后通过 DOM 操作移动至宿主「字号大小」折叠区内。当折叠区收起销毁时，设置行会自动归位至原始槽位并设为 `display:none`，杜绝孤儿 DOM 节点；若宿主结构发生重大变更无法识别，设置项将保持在原始槽位呈现，不影响原生功能；插件卸载时完整复原宿主 DOM 结构。
  *The rows are moved INTO the host's collapsible font region after mount (a slot cannot inject there). While collapsed the region does not exist: the rows are re-seated in the outlet and hidden — never left inside a removed region. If the host shape is not recognized the rows stay visible at their slot positions and nothing is hidden; dispose restores the host DOM.*
- **设置面板设计规范对齐**：本插件仅向「通用」面板贡献 5 行设置，不再维护独立的面板内分组容器。外观相关的独立配置页面已由 `cds-theme` 通过标准的 `settings.section`（子账本 `settings.appearance.item`）统一提供。
  *This plugin contributes 5 rows to 通用 and no longer builds an in-page grouping container. An earlier build collected the appearance-ish rows into a container of its own at the top of General; the user wanted 外观 as a SIBLING of 通用, which `cds-theme` now provides as a real `settings.section` (child ledger `settings.appearance.item`), so that container is gone. The font rows still live inside 通用 → 「字号大小」's collapsible region (see above) and are unaffected.*
- **空配置保护与持久化状态对齐**：宿主的字族状态字段具备易失性（`volatile()`），重启后状态快照初始为空。为避免空白快照错误冲掉本地已有配置，插件采取双向对齐逻辑：当宿主存在非空配置时以宿主为准；当宿主值为空且本地存在历史偏好时，主动将本地配置重新写回宿主管线，保证用户偏好持久有效。
  *An empty host family is NOT an instruction to forget the choice. The host's three family fields are `volatile()`, so a restart reports `""` for every role; the old code mirrored that emptiness over the store and erased all three roles at once (the user noticed it on the terminal, which was simply the most recent pick). Now a host value always wins, while an empty host value meets a stored choice by re-asserting that choice through the host pipeline.*
- **国际化字典完备性约束**：新增文案必须同步维护 `locale/zh.json` 与 `locale/en.json`，且两者的键集合必须完全对称。测试套件会严格断言字典键集合与运行时实际调用的键名完全匹配，任何冗余或未使用的废弃键均会导致测试阻断。
  *A new string goes into both `locale/zh.json` and `locale/en.json` — the key sets must match (asserted by tests); the host language decides, and each UI is monolingual. The suite also asserts the dictionary key set equals the set the rows actually exercise, so an unused string fails instead of lingering as a dead key.*
- **旧版配置向前兼容**：早期版本遗留的 `uiWeight` 与 `codeWeight` 字段在读取时自动丢弃并平滑迁移，保留有效的字族、行距与字距配置。
  *Old payloads that still carry `uiWeight` / `codeWeight` load fine — the removed fields are ignored (no error, no migration); families, line-height and tracking survive.*
- **配置存储位置**：用户个性化偏好存储于本地 `localStorage`，不随 Profile 跨环境分发。
  *Settings live in `localStorage`, not the profile.*
