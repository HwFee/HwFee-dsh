# dsh-cds-theme

给 DeepSeek Harness (DSH) 做的 **Claude Design System (CDS)** 主题插件。参考自开源项目 [open-claude-ui](https://github.com/Caho1/open-claude-ui)（MIT），按自己的审美和宿主实际情况做了不少调整。

## 安装与卸载

在命令行运行，或在 DSH 的 **设置 → 插件 → 添加插件** 里直接输入 `dsh-cds-theme`：

```bash
dsh plugin --profile desktop add dsh-cds-theme
```

**装完或卸完后必须彻底退出并重开 DSH。**

卸载：

```bash
dsh plugin --profile desktop remove dsh-cds-theme
```

---

## 改了什么

| 模块 | 实现机制 | 具体改动 |
|---|---|---|
| **配色与形状令牌** | `ctx.theme.overrideTokens` | **173 个配色令牌**（明暗成对）：暖灰表面阶梯、文本三阶、`hsla(0,0%,8%,α)` 发丝边框、陶土品牌色双轨（`#c6613f` / `#d97757`）、圆角六档（输入框 28→**20px**，气泡 20→**18px**）、代码 diff 暖绿与陶红、三层焦点环 |
| **排印令牌** | `ctx.theme.overrideTokens` | **133 个排印令牌**：17 个 Markdown 角色 × 6 个变量 + 13 级 UI 字阶，对齐 CDS 7 阶字号与**暗色字重减薄**（正文 400→360、Medium 500→460、Semibold 580→550） |
| **内嵌字体** | 构建时内联 `data:font/woff2` | **只内联 2 个做过 `avar` 轴偏移校准的思源黑体/宋体子集**（SIL OFL，本项目自制子集），无网络请求，任意 origin 下直接加载。**6 个 Anthropic 字面（Sans/Serif/Mono × Roman/Italic）没有再分发授权，包里零字节**：它们只声明成 `local("Anthropic Sans" / "Anthropic Serif" / "Anthropic Mono")`，本机装了才生效，没装就回落到系统字体。构建与产物测试都会拦住受限字面重新混入，详见 [`market/PUBLISHING.md`](../../market/PUBLISHING.md) |
| **海拔阴影** | 插件样式表 `!important` | 双层弥散阴影（一层贴边、一层大半径散开），覆盖 `--dsw-elevation-panel/prominent/soft` |
| **组件与正文细节** | 结构定位 + 自有属性 + 样式表 | 首页问候语改衬线 Display（38px / wght 330）；聊天表格闭合 `.5px` 发丝外框 + 浅底表头 + 等宽数字；代码块浅色下是白底、深色下 `#1a1a19` 暖黑；思考提示改柔和呼吸微光；消息操作栏悬停显现；滚动渐隐遮罩 |
| **代码块默认换行** | `white-space: pre-wrap` + 隐藏 `aria-pressed` 按钮 | 所有代码块（含工具卡片里的 diff / 文件行）**默认自动换行**，并**移除**宿主右上角的「自动换行」开关——主题不再提供「不换行」这个状态。diff/read 的每一行是独立的行元素而不是 `<pre>`，所以单独有一条 `[data-code-wrap] [class*="_line_"]` 规则，并把 diff 的 `max-content` 网格列钉成 `minmax(0, 1fr)`，否则行内文字会溢出卡片被裁掉 |
| **工具调用卡片** | `[data-slot="tool.call.toolview"]` + `[class*="_ioCard"]` | 统一成参考实现的「一张卡」：展开体缩进到行下方，`输入`/`输出` 标签与分隔线去掉；请求变成带 `.5px` 发丝描边、12px 圆角、代码底色的代码块，响应变成无框流淌的次要色文本（高 220/280px 后内部滚动）。diff / read / terminal 等自有卡片同样套上这张卡（发丝框 + 12px 圆角 + 代码底），语言标签收进悬停显示的复制按钮 |
| **编辑 / 写入卡片（主题自绘 diff）** | `tool.call.toolview`，键 `edit` / `write`，`priority: 100` | 行和卡都由主题渲染：行号列（新增/上下文行印新文件行号，删除行回退旧文件行号）、`+`/`-`/空格字形、按语言分词的语法着色（`--shiki-token-*`）、以及**词级高亮**——配对的两行只把真正变化的 token 洗亮，看见的是「哪个词变了」而不是两行相像的文本。失败调用只渲染错误文本，行标题写成「编辑失败 <文件名>」；超长 hunk 收成 16 行 + 本地化展开器 |
| **「主题定制」设置页** | `settings.section` (`order: 1`) | 设置侧栏独立一页（与「通用」同级，同心双框图标），包含 10 个外观调节项；总开关留在「通用」 |

---

## 设置页里的旋钮

打开 **设置 → 主题定制**（在侧栏「通用设置」正下方）：

| 设置项 | 范围 / 选项 | 作用 |
|---|---|---|
| **主题模式** | 浅色 / 深色 / 跟随系统 | 与宿主原本在「通用」里的外观行读写同一个持久化入口（`theme.setTheme`），两边实时同步 |
| **品牌强调色** | 陶土橙 / 赭石 / 砂金 / 石墨 | 驱动光标、焦点环、选中态与链接。深色模式下悬停方向反过来（变亮而非变暗） |
| **表面暖度** | 0–100% | 0% 是宿主原本的冷灰，100% 是 CDS 暖灰阶梯 |
| **圆角比例** | 50–150% | 整体缩放整套圆角阶梯 |
| **阴影强度** | 0–200% | 调节双层弥散阴影的不透明度 |
| **组件细化** | 开 / 关 | 关掉后只保留配色与排印令牌，撤掉输入框、代码块、表格等组件级 CSS 规则 |
| **深度思考提示用原版蓝** | 开 / 关 | 只把「正在深度求索…」这一行和扫光恢复成 DSH 原版蓝，其余强调色保持不变 |
| **长文本粘贴存为文件引用** | 开 / 关 | 粘贴纯文本超过 2000 字或 30 行时，自动存进工作区 `.dsh-paste/` 并转成 `@` 文件引用 chip，不再把输入框撑老高；失败则 2 秒内回退普通粘贴 |
| **中文优先使用主题字体** | 开 / 关 | 正文和代码的中文优先走内嵌、校准过字重的思源黑体，问候语走思源宋体；手动选过字体时以手选为准 |
| **首页背景点击波纹（WIP）** | 开 / 关 | 新会话空白页背后的发光代码标点与点击水波。**目前还是半成品**，觉得碍眼可以直接关掉 |

**设置 → 通用设置** 里只留一行 **「启用 CDS 主题」** 总开关。关掉它，所有令牌和样式规则当场撤回，回到宿主原样。

---

## 几个关键的工程实现

### 1. 为什么令牌必须走 `overrideTokens`，而阴影必须写 `!important`

宿主的 layout 会把当前主题的所有令牌**作为内联样式直接写死在 `<body>` 上**（`body.style.setProperty(name, value)`）。在 CSS 里写 `:root { --dsw-alias-bg-base: ... }` 根本压不过内联样式，所以配色和排印一共 **319 个令牌**（173 配色 + 133 排印 + 13 圆角/阴影/缓动）全部走 `ctx.theme.overrideTokens`，直接替换宿主的令牌表。数字可用 `node tools/verify.mjs` 复现，它会打印 `override map size`。

唯独 `--dsw-elevation-*` 相反：宿主的样式表把它声明在 `body, body *` 上——每个子元素自己持有一份声明，`body` 上的内联变量根本继承不下去，所以海拔阴影必须用带 `!important` 的样式表下发。

### 2. 为什么内嵌了思源黑体，还专门改了 `avar` 轴表

Anthropic 的三个官方可变字体里**一个汉字都没有**（625 个码位，CJK 为 0），而且主题用了 8 档精细字重（`330 / 360 / 400 / 460 / 500 / 550 / 580 / 660`，其中 `360/460/550` 是深色模式防眩光渗色的减薄档）。

> **授权状态。** 这 6 个 Anthropic 字面是商业字体，本仓库**没有**拿到再分发授权；把它们内联进 npm 包等于向所有安装者分发。它们也**不在仓库里**——只是本机的未跟踪工作副本（`.gitignore` 精确列了这 6 个文件名），fresh clone 不含这些文件。公开构建因此只内联两个自制的思源子集，Anthropic 面改成 `local()` 引用（本机装了才生效）。判定逻辑在 `client/src/fonts.js` 的 `redistributable` 标记与 `fontSourcesFor()`；四道闸门（`tools/build-client.mjs`、`test/fonts.test.mjs`、`tools/audit.mjs`、`market/check-release-assets.mjs`）都靠 [`tools/font-licences.mjs`](../../tools/font-licences.mjs) 的静态指纹识别字面，所以没有那 6 个文件照样生效。复核方法与移除后的表现见 [`market/PUBLISHING.md`](../../market/PUBLISHING.md) 第 5 节。下面的 `avar` 校准对思源子集依然成立，与 Anthropic 字面是否在场无关。

- 系统自带的苹方在 Windows 上不存在，在 macOS 上又只有静态字重，8 档字重会直接塌缩成 2 档，暗色减薄彻底失效。
- 思源黑体虽然是可变字体，但在相同名义字重下竖干比 Anthropic Sans 细约 17%（实测 400 字重下 Anthropic 竖干 0.0943 em，思源只有 0.0758 em）。而 CSS 的 `font-weight` 是整段文字共用的，没法给中英文分别设数字。
- 解法是直接改思源子集字体里的 OpenType `avar` 表，在浏览器插值前把字重映射过去（比如 CSS 要 `400` 时，映射到思源设计坐标 `490`），让中文和英文笔画粗细严丝合缝。同时修了上游参考仓库把衬线问候语回退到黑体的毛病，补上了思源宋体 330 字重子集（`NotoSerifSC-Shifted-330.woff2`）。

### 3. 为什么拆成两张 `<style>` 标签

静态字体表里 2 个思源子集的 base64 加起来约 4.1 MB（8 个 `@font-face`，其中 6 个 Anthropic 面走 `local()`、不占字节）。如果和业务样式规则放在同一个 `<style>` 里，每次拨动开关或拖滑块都会触发浏览器重新解析整张大表并重注册字体，点一下卡一下。

现在拆成两张表：静态字体表（`STYLE_ID + '/fonts'`）激活时只写一次；状态变化时传 `omitFonts: true`，只重写几 KB 的业务规则表。连总开关关闭时也只清空规则表、保留字体表（因为令牌撤回后字体本来就没人引用了，删掉 `@font-face` 反而会强制整页重排）。

### 4. 不碰混淆类名（Salted CSS Modules）

宿主每次构建都会变 `.RlGAzG_card`、`._tableScroll_1ypvv_192` 这类哈希类名。本插件全部走宿主公开的 `data-*` 钩子（如 `[data-composer-card]`、`[data-chat-flow]`、`[data-shimmer-decoration]`）；像首屏问候语和 Markdown 表格滚动容器这种没有现成钩子的元素，通过 DOM 结构签名定位后打上插件自有的 `data-cds-greeting` / `data-cds-table` 属性，绝不硬猜哈希名。

### 5. 为什么 diff 卡片要自己渲染

宿主的 `DiffBlock` 把每行渲染成**纯文本节点**（行对象只有 `{ kind, text }`）。它能给整行上色，但 DOM 里根本没有 token 结构，所以**没法给关键字/字符串/数字分别上色，也没法指出哪一段才是真正改动的地方**——而这正是 diff 卡片存在的意义。所以主题在 `tool.call.toolview` 上接管了 `edit` / `write` 两个键（和 git-bash 插件接管 `run_shell` 是同一条缝），自己分词、自己配对改动的行、自己画单元格。

分词器 `client/src/tokenscan.js` 是零依赖的单行扫描器，覆盖 JS/TS、JSON、CSS 与 Markdown，其它一律降级成 `plain`；它保证**输出拼起来等于输入**（渲染时不会丢字符），并且**永不抛异常、游标永远前进**（在 React 渲染里抛异常会整行消失）。行号来自 `block.meta.diffs` 里的 `oldStart` / `newStart`；**装没装 `patches/dsh-tool-fs-hunk-lines.patch` 决定这两个字段在不在**——没有补丁时卡片退回「本 hunk 内 1..n」的编号，并在 `data-numbered="false"` 上如实标注，不会伪造文件行号。

### 6. 组件规则与视图注册同生共死

diff 卡片的所有规则都在 `diffCardRules()` 里，位于 `refine` 开关之下；视图的注册跟着同一个开关（`client/src/lifecycle.js`）。规则关掉却继续注册视图，等于用一张**没有样式的卡**替换掉宿主那张有样式的卡——比不接管更糟。所以关掉「组件细化」，对话里的 edit / write 行会干净地退回宿主自己的卡片。

---

## 本地开发与测试

```bash
npm ci           # 仅安装开发期打包工具 esbuild，零运行时依赖
npm run build    # 编译客户端产物：client/src/* -> client/client.js
npm test         # 产物新鲜度检查 + 清单契约 + 24 个测试文件（条数以输出为准）
npm run verify   # 打印令牌、排印、问候语、双语字典与规则表的核验报告（含 override map size）
```

更详细的规范出处（精确到上游参考仓库的 `文件:行号` 与 18 处冲突裁定）见仓库根目录的 [`docs/cds-spec.md`](../../docs/cds-spec.md) 和 [`docs/host-hooks.md`](../../docs/host-hooks.md)。
