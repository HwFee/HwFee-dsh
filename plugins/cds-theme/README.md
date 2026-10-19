# dsh-cds-theme

DeepSeek Harness 的 **Claude Design System (CDS)** 完整主题插件：将宿主整套 `--dsw-*` 设计令牌精准映射至 CDS 规范，呈现中性灰表面阶梯、陶土橙强调色、`hsla(0,0%,8%,α)` 发丝边框、双层弥散阴影与三层焦点环，并对输入框、代码块、消息行、聊天 Markdown 正文进行深度的组件级视觉打磨，将思考状态提示重塑为陶土呼吸微光。插件内嵌 6 个 Anthropic 官方可变字体文件（Sans/Serif/Mono × Roman/Italic），将 Claude 7 阶字号阶梯与暗色字重光渗补偿映射至宿主排印令牌，并将首页问候语替换为标准的衬线 Display 排印。Markdown 表格优化为闭合发丝边框、浅底表头、完整单元格内边距与等宽数字；引用块补齐对称下边距。设置文案严格适配宿主语言（中英文界面纯净无混杂）；提供「深度思考提示使用原版蓝」等细粒度调节开关。

*A Claude Design System (CDS) theme for DeepSeek Harness. It remaps the host's whole `--dsw-*` token set to CDS: a neutral-grey surface ladder, a clay-orange accent, `hsla(0,0%,8%,α)` hairline borders, a two-layer diffuse shadow, a three-layer focus ring, plus component-level refinement for inputs, code blocks, message rows and the chat markdown body, and a clay breathing glint for the thinking label. Six real Anthropic variable faces ship in `fonts/` (Sans/Serif/Mono × Roman/Italic); the Claude 7-tier type ladder and dark-mode weight compensation ride the host's typography tokens, and the hero greeting uses the reference's serif display type. Chat markdown tables become a closed hairline frame with a tinted header, restored cell insets and tabular numerals, and blockquotes get the bottom margin the host leaves out. Settings copy follows the host language — pure Chinese in zh, pure English in en — and a “thinking-label colour” switch restores the host's original blue for the “Deep diving…” line only.*

提供明暗两套配色方案。设置项划分为两个面板：**主题定制**承载主题模式切换及八个外观旋钮（强调色预设、表面暖度、圆角比例、阴影强度、组件级细化、思考提示配色、长文本粘贴智能转存、中文优先使用主题字体），**通用**设置中则保留「启用 CDS 主题」总开关 ——「主题定制」在设置侧边栏中与「通用」「账户」同级呈现（拥有专属滑块图标），而非挤占「通用」面板。**命名遵循明确的区分约定**：因宿主在「通用」面板中原生包含名为「外观 / Appearance」的色彩模式行（浅色 / 深色 / 跟随系统），故本插件专属页面命名为「主题定制 / Theme」，并在页面导语中明确指引原生明暗模式的位置。

*Two palettes (light/dark). The rows live on two settings pages: **Theme** carries the theme-mode row plus eight appearance knobs (accent, surface warmth, radius, elevation, component refinement, the thinking-label colour, long-paste-as-a-file and prefer-calibrated-Chinese), while **General** keeps only the “Enable CDS theme” master switch. Theme is a real page in the settings sidebar — a sibling of General and Account, with its own slider glyph — not a group inside General. The name is deliberately distinct from the host's own 「外观 / Appearance」 row (the light/dark/system cubes, which stay in General), and the page intro says so.*

## 它做了什么 · What it does

| 层 Layer | 机制 Mechanism | 覆盖 Coverage |
|---|---|---|
| **配色令牌** Tokens | `ctx.theme.overrideTokens` | 131 个配色/形状令牌：表面阶梯、文本三阶、边框四档、品牌双轨、状态色、代码 diff、菜单/侧栏/气泡、滚动条、onboarding |
| **字体** Faces | 构建时内联 `data:font/woff2`（`file://` 基址作源码运行的回退） | 6 个可变 woff2，字体族名与参考完全一致：`anthropic-sans` / `anthropic-serif` / `anthropic-mono`（`wght 300–800, opsz 16–48`），在任意文档 origin 下都能加载 |
| **排印** Typography | `ctx.theme.overrideTokens` | 130 个排印令牌：17 个 markdown 角色 × 6 个宿主变量 + 文本/代码字族角色 + 13 级 UI 阶梯 × 2 个 token；7 阶字号、行高、每个参考元素的字重与暗色减薄 |
| **形状与动效** Shape & motion | 同上 same | 圆角六档（输入框 28→**20px**，气泡 20→**18px**）、阴影三档、CDS 缓动曲线 |
| **海拔阴影** Elevation | 插件样式表 `!important` | `--dsw-elevation-panel/prominent/soft` |
| **组件细化** Refinement | 插件样式表 stylesheet | 输入框三态阴影、焦点环、代码块、菜单双环、滚动条、思考标签的陶土呼吸微光、消息操作栏悬停显现、滚动渐隐遮罩、代码块横幅/折叠头细节 |
| **Markdown 正文** Markdown body | 结构定位 + 自有 `data-cds-table` 属性 + 插件样式表 | 聊天表格：合拢 `.5px` 发丝框 + 10px 圆角、表头浅底、恢复首尾列内边距、末行去重线、等宽数字；引用块补回下边距（**已验收，常驻**） |
| **问候语衬线** Hero serif | 结构定位 + 自有 `data-cds-greeting` 属性 | 空白会话标题换成参考的衬线 display 排印（38px / 1.2 / wght 330 / opsz 48） |
| **双语设置** Bilingual settings | `ctx.locale.register` + 槽位 `locale:` | 10 行设置（20 条标题/说明） + 4 个色板名 + 3 个主题模式名，zh 纯中文、en 纯英文，切语言即重渲染 |
| **设置页** Settings pages | `settings.section` + 自有子槽位 `settings.appearance.item` | 「主题定制 / Theme」是与「通用」「账户」同级的一页（`order: 1`），九个外观行（「主题模式」+ 八个旋钮）挂在自己的子账本上；总开关仍在「通用」。宿主没有设置外壳时全部行回落到通用列表 |
| **中文优先** Prefer Chinese | `body` 上重声明完整 `--font-anthropic-*` 组合 + 设置开关 | 默认开启：正文/代码的中文先命中内嵌、校准字重的思源黑体，再落到系统字体；首页问候语仍走思源宋体。关闭即恢复原顺序。手选字体始终优先，字体大 `@font-face` 表不重建 |
| **主题模式** Theme mode | `theme.getTheme().preference` / `theme.setTheme(id)` / `theme/change` | 浅色 / 深色 / 跟随系统，**与宿主那一行是同一个持久化偏好**（同一写入入口），两处不可能分叉；宿主那行用 CSS 藏在「通用」里 |
| **设置页图标** Nav icon | 结构定位 + 自有内联 SVG（`assets/appearance-icon.svg`） | 宿主 `navIcon(id)` 是硬编码 if-chain、未知 id 一律回落到齿轮；主题页因此没有自己的图标。插件按标签找到侧栏按钮，插入同心方框的 SVG 并隐藏宿主齿轮（可还原），两侧尺寸与描边跟随宿主的 Medium/Regular 两档 |

### 为什么令牌必须走 `overrideTokens`

宿主的 layout 把当前主题的令牌**内联写在 `<body>` 上**：

```js
for (const [name, value] of Object.entries(snapshot.active.tokens))
  body.style.setProperty(name, value)
```

内联声明压过任何同等重要性的样式表规则。所以「用 CSS 改 `--dsw-alias-bg-base`」是**无效**的 —— 必须换掉令牌表本身。`overrideTokens` 就是那个接口：它在活动主题之上叠一层，按明暗两种配色分别取值，layout 完全不需要知道有这一层存在。排印令牌（`--dsw-font-markdown-*`、`--dsw-font-family`、`--ds-font-family-code`）走同一个通道，原因相同：宿主自己也把它们声明在 `body` 上，只有令牌层能改。

*The host layout inlines the active theme's tokens onto `<body>`. An inline declaration beats any same-importance stylesheet rule, so editing `--dsw-alias-bg-base` from CSS does nothing — the token map itself must be swapped. `overrideTokens` is that interface. The typography tokens travel the same seam for the same reason: the host declares them on `body` too.*

### 为什么阴影必须走样式表

`--dsw-shadow-lv*` 声明在 `body` 上，内联可覆盖。但 `--dsw-elevation-*` 声明在 **`body, body *`** 上 —— 每个后代元素各自持有一份声明，body 的内联值**到不了子元素**。所以这一层必须用带 `!important` 的样式表规则。详见 [`docs/host-hooks.md`](../../docs/host-hooks.md) 第 7 节。

*`--dsw-shadow-lv*` is declared on `body`, so an inline override works. But `--dsw-elevation-*` is declared on **`body, body *`** — every descendant carries its own copy, so a `body` inline value never reaches the children. That layer must come from an `!important` stylesheet rule.*

### 为什么字体单独占一个 `<style>`

插件写两个 `<style>`：静态字体块（`STYLE_ID + '/fonts'`，六个 `@font-face`，浏览器里是约 970 KB 的内联 `data:font/woff2`）**每次激活只写一次**；状态相关规则（约 7.9 KB）进 `STYLE_ID` 标签，设置变更只重写后者。改动前每次切换都会重建/重新解析整张 ~977 KB 的样式表并重新注册六个字族，这是“点一下卡一下”的来源。字体块在模块作用域缓存，`buildCss` / `buildCssFor` 的输出保持逐字节不变 —— 拆分只发生在 DOM 写入层（`indexOf`/`slice` 剪掉缓存块）。主开关关闭时**只清空规则标签，字体标签保留**（字族令牌已回到宿主默认，`@font-face` 无人引用；删掉它们会让全文档字形回退系统字体并触发整页字体重排，那正是“关闭很慢”的原因）；只有插件卸载才移除两个标签。

*Two `<style>` tags: the static font block (`STYLE_ID + '/fonts'`, six `@font-face` faces = ~970 KB of inlined data URLs in the browser) is written ONCE per activation, while the state-dependent rules (~7.9 KB) live in `STYLE_ID` and are the only thing rewritten on a settings change. Before the split every toggle rebuilt and re-parsed a ~977 KB sheet and re-registered six faces — that was the lag. The font string is cached at module scope; `buildCss`/`buildCssFor` output stays byte-identical (the split is a DOM-write concern: slice the cached block out with `indexOf`). With the master switch OFF only the rules tag is emptied and the fonts tag is KEPT (the family tokens revert to host defaults, so the faces are unreferenced; removing them would drop every glyph to a system fallback and force a full-document font re-layout — that was the “turn OFF is slow” report); only teardown removes both tags.*

### 为什么 `enabled` 的开关不会自激

宿主主题服务在 `overrideTokens()` 内部**同步**发布 `theme/change`，而本插件自己也订阅该事件并调用 `bridge.sync()`。没有重入保护时：外层注册还在 `overrideTokens()` 里没拿到 disposer，重入的 sync 又注册一层并把旧层替换掉，外层随后保存的是**已失效层的 disposer** —— 之后的“关闭”就永远释放不掉（表现为「只有打开有效，关闭没反应」，重入还会递归爆栈并被设置存储的 try/catch 吞掉）。`createThemeBridge` 现在一次只允许一个 sync 在飞（`syncing` 标志），注册与释放都原子完成；测试驱动 `false→true→false→true` 全链路，断言字族标签只写 1 次、每次开启只有 1 个活动层、每次切换最多 1 次规则标签写入。

*The host theme service publishes `theme/change` synchronously from inside `overrideTokens()`, and this plugin subscribes and calls `bridge.sync()` from it. Without a re-entrancy guard the outer registration had not yet stored the disposer when a nested sync registered a replacement layer; the outer call then kept the disposer of the replaced layer, so every later OFF silently did nothing (the symptom “only ON works”, plus a recursive overflow swallowed by the settings store). `createThemeBridge` now allows one sync at a time (`syncing`), so register/release are atomic. The test drives false→true→false→true end to end and asserts the fonts tag is written once, exactly one active layer per ON, and at most one rules-tag write per flip.*

## 字体 · Fonts

`fonts/` 里是 6 个真实的 Anthropic 可变字体（从 anthropic.com 的 web 字体包取样，`wght 300→800`；Sans/Serif 另有 `opsz 16→48`）。`client/src/fonts.js` 用参考完全一致的族名声明它们：

| 字体族 Family | Roman | Italic | 用途 Role |
|---|---|---|---|
| `anthropic-sans` | `AnthropicSans-Roman-Web.woff2` | `AnthropicSans-Italic-Web.woff2` | 正文、UI 文本（`--dsw-font-family`） |
| `anthropic-serif` | `AnthropicSerif-Roman-Web.woff2` | `AnthropicSerif-Italic-Web.woff2` | 首屏问候语（`--font-anthropic-serif`） |
| `anthropic-mono` | `AnthropicMono-Roman-Web.woff2` | `AnthropicMono-Italic-Web.woff2` | 代码、行内代码（`--ds-font-family-code`） |

### 中文回退 · The CJK fallback

Anthropic 的三个字体族**没有任何 CJK 字形**（实测：`AnthropicSans-Roman` 625 个码位、CJK 统一表意文字 0 个，`unicode-range` 一个都没写，与 anthropic.com 线上文件的 SHA256 完全一致）。所以中文必须另有回退，而回退选谁**由字重阶梯决定，不是审美决定**。

主题会发出 **8 个字重**（`typography.js` 的 `WEIGHTS`）：`330 / 360 / 400 / 460 / 500 / 550 / 580 / 660`，其中 `360/460/550` 是暗色视网膜补偿——**它是暗色模式读起来和浅色一致的全部机制**。

| | 苹方 PingFang SC | 思源黑体 Noto/Source Han Sans |
|---|---|---|
| 字重 | 静态：本机只有 Regular 400 + Semibold 600 | **可变 100–900** |
| 8 个字重能呈现几种 | **2 种**（6 个值互相不可辨） | **8 种全部可辨** |
| 暗色补偿 | 全部失效 | 全部生效 |
| 随主题分发 | 不可（`All rights reserved` + Apple 商标，无许可字段） | 可（SIL OFL 1.1） |

因此选**思源黑体**。两款字体骨架几乎相同（同字号下字面高度差 1.3%），差别只在这个。

**为什么需要轴偏移。** 思源在相同名义字重下比 Anthropic Sans 细约 17%（实测竖干，同 em：Anthropic 400 = 0.0943，思源 400 = 0.0758）。而字体回退是**按字符**的，`font-weight` 却是**整段一个值**——中文不可能向浏览器要一个和英文不同的数字。`avar` 表正是为此存在：它在插值前把用户坐标映射到设计坐标。于是 `font-weight: 400` 会画出竖干等宽于 Anthropic Sans 400 的那个设计字重。

断点是**按浏览器实测校准**的，不是按轮廓坐标：第一版用轮廓测量，Chrome 自己的插值和栅格化让它偏细 0.8–6.3%。校准后残差 0.0–0.7%（330–580），660 档 -2.8%——主题的 bold 竖干比思源 900 轴顶还宽，这一档只能留一点点偏细，不伪造映射。

| CSS 字重 | 330 | 360 | 400 | 460 | 500 | 550 | 580 | 660 |
|---|---|---|---|---|---|---|---|---|
| avar 映射到设计坐标 | 404 | 441 | 490 | 567 | 622 | 705 | 754 | 850 |

**为什么是子集。** 全量思源可变字体 5.37 MB（宋体 7.70 MB），内联成 base64 是 17.5 MB 的提交产物。所以随主题走的是 7000 常用字 + 全套 CJK 标点 + ASCII：`NotoSansSC-Shifted-VF.woff2` 1.72 MB（可变 + avar）、`NotoSerifSC-Shifted-330.woff2` 1.22 MB（静态，问候语只用 330 一档）。子集外的生僻字落到栈里**下一档的同一款字体**（`"Noto Sans SC"` 就在后面），所以仍是思源，只是没有轴偏移——单个字看不出来。重新生成用 `python tools/build-cjk-fonts.py`。

**顺带修掉参考仓库的一个缺陷。** 参考的 `--font-anthropic-serif` 结尾是 `var(--font-cjk-sans-fallback)`——**衬线栈后面挂的是黑体**，所以首屏问候语里英文是衬线、中文是黑体，一个行内两种骨架。本插件改用 `--font-cjk-serif`（思源宋体），问候语现在是一个字体。

| 字体族 Family | 文件 | 用途 Role |
|---|---|---|
| `anthropic-cjk` | `NotoSansSC-Shifted-VF.woff2` | 中文正文、UI 文本 |
| `anthropic-cjk-serif` | `NotoSerifSC-Shifted-330.woff2` | 中文首屏问候语 |

*Anthropic's three families carry NO CJK glyphs at all (measured: 625 codepoints in `AnthropicSans-Roman`, zero CJK unified ideographs, no `unicode-range`, byte-identical to the file anthropic.com serves today). Chinese therefore needs a fallback, and the choice is decided by the WEIGHT LADDER, not by taste: the theme emits eight weights (`330/360/400/460/500/550/580/660`), three of which are the dark-mode retinal compensation. Stock PingFang is two static files, so it collapses those eight into two; Noto/Source Han is variable, so all eight survive, and it is SIL OFL so it can ship. Source Han is ~17% lighter than Anthropic Sans at the same nominal weight, and `font-weight` is one value for a whole run while fallback is per-character — so an `avar` table remaps user-space weight onto the design coordinate whose stem matches. The breakpoints are calibrated against BROWSER-rendered stems (outline coordinates landed 0.8-6.3% light); residual error is 0.0-0.7% for 330-580 and -2.8% at 660, where the theme's bold is wider than Noto's 900 axis ceiling. The faces are a 7000-ideograph subset (~3 MB total instead of 13 MB) because a full pair would inline to 17.5 MB; a rarer glyph falls through to the same installed family a rung later. The reference's serif stack is also fixed here: it ended in the SANS CJK chain, so Chinese in the greeting rendered as a sans beside a serif Latin.*

`@font-face` 的六个 `src` **在构建时内联为 `data:font/woff2`**：`client/src/font-assets.js` 导入 `fonts/` 里的二进制，`tools/build-client.mjs` 用 esbuild 的 `dataurl` loader 把每个 woff2 变成 data URL，所以 `client/client.js` 里没有任何路径。这是唯一在**桌面外壳**（文档 origin 为 `dsh-app://app`）里能真正加载字体的方式：路由地址会落到 app 协议处理器上 404，`file://` 被当作本地资源拦截，绝对 `http://127.0.0.1:<port>` 又是跨源且路由没有 CORS 头。data URL 没有 origin、不需要 token、不经过 CSP。

代码里只剩**一条**回退（`fontSourcesFor`，用于没有构建 loader 的源码运行）：Host 注入的 `file://` 基址 `__CDS_THEME_FONT_BASE__`（`webserver/index-inject` 行，运行时由 `import.meta.url` 计算）。原先还有第二条——同源路由 `/dsh-cds-theme/fonts/<file>`——**已删除**：它所在的 URL 分支在任何一个能构建出来的产物里都不会进入（见 `lib/index.js` 的长注释：内联表总是被填满；缺少二进制时构建直接失败而不是回退；桌面外壳的 `dsh-app://app` origin 也解析不了路由地址）。路由删除后如果还发它的 URL，那是一个必然 404，所以客户端也不再生成。

`fonts/` 在 `package.json` 的 `files` 里，`link:` 安装直接指向本目录。字体只靠内联数据，重建 `client/client.js` 后刷新页面即可。

*The six `@font-face` sources are INLINED as `data:font/woff2` at build time (`font-assets.js` + esbuild's `dataurl` loader), so `client.js` carries no path. That is the only delivery that works in the desktop shell (`dsh-app://app` origin: route-relative URLs 404 in the app protocol handler, `file://` is blocked, absolute `http://…` is cross-origin without CORS). ONE fallback remains in `fontSourcesFor` for source runs without the build loader — the Host-injected `file://` base. The same-origin `webServer` route that used to be the other fallback is DELETED: its branch is unreachable in every buildable configuration (the inline table is always populated; a build without the binaries fails outright; the app origin cannot resolve a route URL), and emitting its URL after deletion would be a guaranteed 404.*


## 字体栈 · Font stacks

字体栈**在 CJK 那一段有意偏离参考**，其余逐字保留。参考 CSS（`.reference/open-claude-ui/code-examples/cds-theme.css:205-213`）的 CJK 链是四个 macOS 族名——Windows 上一个都不命中，中文落到系统默认；macOS 上命中，但命中的是**静态版**苹方，8 个字重同样塌成 2 个。所以两平台都不对，必须换。

```css
/* 参考保留：四个 macOS 族名仍然逐字在这，只是退到最后 */
--font-cjk-sans-sc: "PingFang SC";
--font-cjk-sans-tc: "PingFang TC";
--font-cjk-sans-jp: "Hiragino Sans";
--font-cjk-sans-kr: "Apple SD Gothic Neo";

/* 新增：随主题走的中文回退，排在最前 */
--font-cjk-sans: "anthropic-cjk", "Noto Sans SC", "Source Han Sans SC", <上面四个>, "Microsoft YaHei";
--font-cjk-serif: "anthropic-cjk-serif", "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, var(--font-cjk-sans);
--font-cjk-sans-fallback: var(--font-cjk-sans);          /* 参考的旧名指向新链 */

--font-sans-fallbacks: system-ui, "Segoe UI", Roboto, Helvetica, Arial, var(--font-cjk-sans), sans-serif;
--font-anthropic-sans: "anthropic-sans", var(--font-sans-fallbacks);
--font-anthropic-serif: "anthropic-serif", ui-serif, Georgia, "Times New Roman", var(--font-cjk-serif), serif;
--font-anthropic-mono: "anthropic-mono", ui-monospace, "Cascadia Mono", Consolas, var(--font-cjk-sans), monospace;
```

三处具体改动，每处都有理由：

1. **CJK 链最前面是 `anthropic-cjk`** —— 真正随主题分发的思源黑体，见上一节。
2. **衬线栈挂 `--font-cjk-serif` 而不是 `--font-cjk-sans-fallback`** —— 参考的写法让衬线栈后面跟黑体，首屏问候语里中英文是两个骨架。这是参考的缺陷，不是取舍。
3. **等宽栈补 `"Cascadia Mono", Consolas`** —— 参考只有 `ui-monospace, monospace`，Windows 上 `ui-monospace` 不可靠，中文又要有回退，所以显式点名系统等宽。

*The stack departs from the reference ONLY in the CJK rungs, for a reason each: the reference's CJK chain is four macOS family names — none resolve on Windows, and on macOS they resolve to the STATIC PingFang, so the theme's eight weights collapse to two there as well. Both platforms are wrong, so the shipped chain puts the real shifted Source Han face first and keeps the reference names behind it as a last resort. The serif chain is also repointed at the SERIF CJK face: the reference ended it in the sans chain, so Chinese in the greeting rendered as a sans beside a serif Latin — a defect, not a tradeoff. The mono chain gains an explicit Windows monospace before its CJK rung, because `ui-monospace` is unreliable there.*

## 排印 · Typography

字号/行高/字重逐角色对齐参考的 7 阶阶梯（`docs/v1/01-…md:341-380`）、内容矩阵（`:427-456`）与语义原子类（`:531-547`）。`+ var(--dsh-content-font-delta)` / `+ var(--dsh-code-font-delta)` 保留宿主「内容字号 / 代码字号」设置对整条阶梯的缩放。

| 角色 Role | 字号/行高 Size/Leading | 字重 Light / Dark | 来源 Source |
|---|---|---|---|
| `base` 正文 | 14 / 20 | 400 / 360 | :436 |
| `base-strong` 强调 | 14 / 20 | 660 / 660 | :394 |
| `h1` | 20 / 25 | 580 / 550 | :353 + :452 |
| `h2`, `h3` | 15 / 20 | 580 / 550 | :352 + :452 |
| `h4` | 14 / 18 | 580 / 550 | :352（按 1.29 行高插值） |
| `code` 行内代码 | 12 / 14 | 500 / 460 | :447 |
| `code-block` 代码块 | 12 / 17.5 | 400 / 360 | :446 + `tabular-nums` |
| `code-block-small` 思考日志 | 11.5 / 16 | 400 / 360 | :440 |
| `small` | 12 / 16 | 400 / 360 | :433/:438/:453 |
| `table` | 13 / 18 | 400 / 360 | :448/:455（插值） |
| `table-head` | 13 / 18 | 500 / 460 | 同上 + :392 |

### UI 界面字重 · UI-chrome weights

宿主非 markdown 的 `--dsw-font-*` 是 13 级字号阶梯（11 / 12 / 13 / 14 / 16 / 20 / 24px），每级只有 regular 400 与 strong 500 两个字重。参考给每个语义角色钉了字重（`.text-caption-regular` … `.text-title-medium`，`:531-547`），主题把这 13 级按角色映射到补偿表的四个梯级 —— 不新造字重，并且每个 token 同时覆盖 `font` 简写与 `-font-weight` 子令牌（宿主组件两种写法都在用）：

| Host step | 尺寸 / 行高 | 映射角色 | 字重 L / D | 参考 |
|---|---|---|---|---|
| `--dsw-font-xxxs-11` | 11 / 14 | caption regular | 400 / 360 | :535 |
| `--dsw-font-xxxs-strong-11` | 11 / 14 | caption medium | 500 / 460 | :536 + :392 |
| `--dsw-font-xxs-12` | 12 / 18 | 12px regular | 400 / 360 | :535 梯级（12px 无 regular 原子类） |
| `--dsw-font-xxs-strong-12` | 12 / 18 | 12px medium（按钮/页脚/选择器/附件名） | 500 / 460 | :438/:443/:444/:450 |
| `--dsw-font-xs-13` | 13 / 20 | footnote regular | 400 / 360 | :535 梯级 |
| `--dsw-font-xs-strong-13` | 13 / 20 | footnote medium | 500 / 460 | :538 |
| `--dsw-font-s-14` | 14 / 22 | body regular | 400 / 360 | :540 |
| `--dsw-font-s-strong-14` | 14 / 22 | body medium | 500 / 460 | :541 |
| `--dsw-font-base-16` | 16 / 24 | regular（参考无 16px 角色） | 400 / 360 | :391 |
| `--dsw-font-base-strong-16` | 16 / 24 | medium（参考无 16px 角色） | 500 / 460 | :392 |
| `--dsw-font-m-18` | 16 / 28 | medium（参考无 18px 角色） | 500 / 460 | :392 |
| `--dsw-font-l-20` | 20 / 28 | title medium | 500 / 460 | :545 |
| `--dsw-font-xl-24` | 24 / 32 | semibold 标题/身份（600 不是参考字重） | 580 / 550 | :393 |

### 元素 → 字重对照 · Element → weight

参考内容矩阵里的每一项，宿主要么有令牌/变量承载，要么把字重硬编码在盐化 CSS Modules 里（主题规则禁止命中）。`ELEMENT_WEIGHTS`（`client/src/typography.js`）就是这张表的机器可读版本，测试逐行断言：

| 元素 Element | 字重 L / D | DSH 载体 Carrier | 参考 |
|---|---|---|---|
| 助理身份名 assistant name | 580 / 550 | 不存在（DSH 无该元素） | :433 |
| 模型版本微标 model badge | 500 / 460 | 不可寻址（no token） | :434 |
| 消息时间戳 timestamp | 400 / 360 | 不可寻址（no token） | :435 |
| 助理正文 body | 400 / 360 | `--dsw-font-markdown-base` | :436 |
| 用户气泡 user bubble | 400 / 360 | 继承正文梯级（无独立声明） | :437 |
| 消息操作按钮 action buttons | 500 / 460 | 不可寻址（no token） | :438 |
| 思考触发器 thinking toggle | 500 / 460 | 不可寻址（no token） | :439 |
| 思考日志 raw thought | 400 / 360 | `--dsw-font-markdown-code-block-small` | :440 |
| 输入框 composer | 400 / 360 | 不可寻址（no token） | :441 |
| 占位符 placeholder | 400 / 360 | 不可寻址（no token） | :442 |
| 输入区页脚 composer footer | 500 / 460 | 不可寻址（no token） | :443 |
| 模型选择器 model selector | 500 / 460 | 不可寻址（no token） | :444 |
| 发送按钮 send button | 580 / 550 | 不可寻址（纯图标按钮） | :445 |
| 代码块 code block | 400 / 360 | `--dsw-font-markdown-code-block` | :446 |
| 行内代码 inline code | 500 / 460 | `--dsw-font-markdown-code` | :447 |
| 工件标题 artifact title | 580 / 550 | 不可寻址（no token） | :448 |
| 代码语言标签 language tag | 500 / 460 | `--dsl-code-block-banner-font`（宿主中间变量）+ `[data-code-block-banner]` 钩子（10.5/12、大写、字距 .05em） | :449 |
| 附件名 attachment name | 500 / 460 | 不可寻址（no token） | :450 |
| 附件大小 attachment size | 400 / 360 | 不可寻址（no token） | :451 |
| 模态标题 modal title | 580 / 550 | 不可寻址（no token） | :452 |
| 分段标签 segmented tab | 400 / 360（激活 500） | 不可寻址（no token） | :453 |
| 按钮 SM/MD | 500 / 460 | 不可寻址（no token） | :454-455 |
| 快捷键键帽 kbd | 580 / 550 | 不可寻址（no token） | :456 |
| 首屏问候语 greeting | 330 / 330 | `[data-cds-greeting]`（插件自有钩子） | :547 |

不可寻址的元素**不猜钩子、不硬套**：宿主在盐化 CSS Modules 里直接写 `font-size` / `font-weight`（例如 `ReasoningRow .title { font-weight: 400 }`、`InputBar .select { font-size:13px; font-weight:500 }`、附件名 14px/500），没有 `data-*` 钩子或字体令牌可以合法到达；列在这里是为了明确「参考值是什么、为什么没改」，而不是假装已经复刻。

*Every element the reference pins is mapped to a DSH carrier in `ELEMENT_WEIGHTS`: markdown tokens, the UI-chrome steps above, the host's documented `--dsl-code-block-banner-font` variable plus the published `[data-code-block-banner]` hook for the language tag, or this plugin's own `[data-cds-greeting]` hook. Elements whose weight the host hard-codes in salted CSS Modules (thinking toggle, action buttons, composer, model selector, send button, artifact title, attachment name/size, modal title, tabs, buttons, kbd) are documented as not-addressable rather than approximated.*

暗色视网膜光渗逆补偿（`:383-414`）落在每个 `{light,dark}` 对里 —— **浅色与深色的差异本身就是补偿机制**：

| 语义字重 | Light | Dark | 幅度 |
|---|---|---|---|
| Regular 正文 | 400 | 360 | −40 |
| Medium 操作/强调 | 500 | 460 | −40 |
| Semibold 标题 | 580 | 550 | −30 |
| Bold 重强调 | 660 | 660 | 0（参考 `"wght" 660` 两列相同） |

字重通过 `font-weight` 数值写进可变字体（`@font-face` 声明 `font-weight: 300 800`，浏览器把数值映射到 `wght` 轴），因此 330/360/460/550/580/660 都是**真实的轴位移**，不是静态字重取整。markdown 角色和 13 级 UI 阶梯都走同一套 `{light,dark}` 对。代码块额外带 `font-variant-numeric: tabular-nums`（`:446`），数字列不跳动。

*Weights are written as numbers into the variable faces, so 330/360/460/550/580/660 are real axis moves; both the markdown roles and the 13 UI-chrome steps carry `{light,dark}` pairs. The dark values are the retinal-irradiation compensation — the light/dark difference IS the mechanism. Code blocks carry `tabular-nums`.*

### 首屏问候语为什么是衬线 · The serif greeting

参考把首屏问候语定为衬线 display 排印（`:547`：`2.375rem` = 38px、行高 `1.2`、Light `wght 330`、`"opsz" 48`）。**字重就是参考的 330** —— 不是宿主标题的 500，也不是标题梯级的 580/550；暗色不参与减薄（补偿表 `:389-394` 只覆盖 400/500/580/660，display 行只有一个 Light 值）。这些数字只存在于 `typography.js` 的 `GREETING_DISPLAY` 一处，样式表由它生成，测试按 `.font-display` 行逐字断言。

宿主的标题元素没有任何稳定钩子 —— 它的类名是盐化 CSS-Modules 名（`Hqq-bq_headline`），绝对不能作为选择器。`client/src/hero.js` 的做法：

1. 从宿主**有意公开**的槽位锚点定位：`[data-slot="conversation.hero.workspace"]` 找到 workspace 行，`[data-slot="conversation.input.dock"]` 在存在时校准「同一个 composer 栈」；hero 壳是栈的**第一个子元素**（usage-stats 会把 dock 出口挪到 workspace 行之前，所以不能用「workspace 行的前一个兄弟」这种假设）。
2. 用真实标题的结构签名确认：标题内部必须有 `[data-slot="conversation.hero.brand.mark"]`（鱼形 brand mark 的槽位出口），且不得包含 composer 卡片/输入框。
3. 给标题写一个插件自有的 `data-cds-greeting` 属性，由样式表的 `[data-cds-greeting]` 规则上色上字。没有任何盐化类参与。
4. 整个操作幂等（重复 `setAttribute` 是 no-op）、可回退（`stop()` 清掉所有标记）、结构不符时**不改动**（返回 null，标题保持继承的无衬线）。MutationObserver 监听 body，按动画帧合并重扫（React 每次空白→对话→空白都会重建标题）。

*The reference pins the greeting to serif display type (38px/1.2/wght 330/"opsz" 48). The weight is the reference 330 — not the host headline's 500 and not the semibold 580/550 title rung — and it does not thin in dark mode (the compensation table covers 400/500/580/660 only). All values live once in `GREETING_DISPLAY`, and the stylesheet is generated from it. The host's headline has no stable hook, so `hero.js` locates it from stable slot anchors, confirms the real headline by its brand-mark slot outlet, writes its own `data-cds-greeting` attribute, and lets the stylesheet paint it. Idempotent, removable on dispose, and a no-change no-op when the layout differs.*

## Markdown 正文 · Markdown body

> **这一项已验收，开关已删除**：标记与规则现在无条件生效（只在 `enabled && refine` 内），用户明确要求保留效果、去掉设置项。详见下方「已验收并删除的开关」。

宿主的 Markdown 表格 CSS 是「渲染难看」的根因：没有外框、表头没有底色，首列 `padding-left:0`、末列 `padding-right:0`（文字贴着容器边缘），每一行（含最后一行）都带一条底发丝线，也没有圆角。这些规则全部挂在盐化类 `._tableScroll_1ypvv_192` 上，主题**不能**用类名命中；而 `md-table-wide` 只在 ≥4 列的宽表上出现，`md-table-fill` 在宿主样式表里根本没有规则。

`client/src/markdown.js` 沿用问候语的「结构定位 + 自有属性」做法：

1. 从宿主**有意公开**的 `[data-chat-flow]` 钩子（`docs/host-hooks.md` §4.2）出发，找到流内的 `table`。
2. 只标记表格的父元素——宿主渲染器的表格滚动容器（`div.<盐化 tableScroll>…>table`，table 是它唯一的元素子节点）。父元素签名不符（例如将来宿主直接把表渲染进 Markdown 根）就**不标记**，否则会给整条消息套一个框；`[data-chat-flow]` 之外的表格（工件预览、设置页文案）一律跳过。
3. 写 `data-cds-table` 属性，样式表只命中 `[data-cds-table]`；整个操作幂等、可回退，`stop()` 清掉所有标记。
4. MutationObserver 只在**新增的、可能包含表格的节点**上重扫（流式输出会不停改文本和属性，但文本不可能变出表格），并按动画帧合并——比问候语的「每次变化全树重扫」更省。

样式表规则（**无条件**发出，只受 `refine` 门控 —— 这一项的开关已随验收删除）：

```css
[data-cds-table] { box-sizing:border-box; border:.5px solid var(--dsw-alias-border-l1); border-radius:var(--dsw-radius-md); background:var(--dsw-alias-bg-base); width:100% !important; max-width:100% !important; margin-left:0 !important; padding-left:0 !important; overflow-x:auto !important; padding-bottom:0 !important }
[data-cds-table] table { width:100% !important; max-width:100% !important }
[data-cds-table] th { background:var(--dsw-alias-bg-module-platform); border-bottom:.5px solid var(--dsw-alias-border-l1) !important }
[data-cds-table] th, [data-cds-table] td { padding:10px 14px !important; max-width:none !important; overflow-wrap:anywhere }
[data-cds-table] th:first-child, [data-cds-table] td:first-child { padding-left:14px !important }
[data-cds-table] th:last-child, [data-cds-table] td:last-child { padding-right:14px !important }
[data-cds-table] tbody tr:last-child td { border-bottom:none }
[data-cds-table] td { font-variant-numeric:tabular-nums !important }
[data-cds-table] table code { font-size:.875em !important }
[data-chat-flow] blockquote { margin:16px 0 !important }
```

- **框画在滚动容器上，不画在 `table` 上**，但容器并不等于表格所在的位置——宿主有三件事同时捣乱：`table { width:max-content }`（表只按内容宽，容器是整宽块）、宽表变体 `overflow-x:hidden`（滚动条只在 hover 出现，超宽就静默裁掉）、以及宽表变体的**出血**（`.v5IAXa_body .md-table-wide`：`width: calc(100% + lead + spare)`、`margin-left: calc(-1 * lead)`、`padding-left: lead`，把容器往正文列外撑、再补等量左内边距）。第一版「只画框」三个坑全踩：框比列宽、最后一列被切半字、宽表左边多一条 ~100px 死槽。现在这一项接管几何：取消出血（`width/max-width:100%`、`margin-left/padding-left:0`）、容器 `overflow-x:auto`（宁可出滚动条也不静默裁）、表 `width:100%` 填满框、单元格 `max-width:none`（宿主给每列封顶 `min(30vw,320px)`，留着它会再次让框比表宽）。这些都在覆盖宿主同特异性声明、且可能落在我
  们的样式表之后，所以要 `!important`；`box-sizing:border-box` 让半像素边框不额外撑宽内容列。
- 表内文字**不再降字号**：表格与表头都走正文字号（14/20，`--dsw-font-markdown-table` / `-table-head` 两个 token 改映射）。参考仓库其实没有表格排印规范——它唯一的表格证据是 storybook，其中一张演示表是 Tailwind `text-xs`（12/16）、另一张根本不带字号类（继承正文 14）。第一版抄了 `text-xs`，渲染出来表格比它自己的段落还小，按用户判定改回正文行，表头只保留 medium 字重差。
- 表内代码：宿主硬写 `11px`，在 14px 正文旁读起来像脚注；改成 `.875em`（宿主自己行内代码对正文的比例）。
- 带 `!important` 的都是覆盖宿主同名声明的属性（宿主的表 CSS 特异性相同、且可能在我们的样式表之后落地）：`th` 底边、单元格内边距与列宽上限、`td` 的 `font` 简写会重置的 `font-variant-numeric`、`table code` 的字号、以及引用块 `margin`。
- 覆盖「最后一行也带底发丝线」：边框负责收口，最后一行不再画第二条线（1-border 纪律）。
- 引用块：宿主写的是 `margin:16px 0 0`，下边距为 0，引用会直接顶到下一段；这里补成上下对称的 16px。`hr` / `ul-ol` / `li` 未动。
- 等宽数字：参考要求所有计数区域（含表格）用 `tabular-nums`（`docs/v1/01-…md:497-505`）。

*The host's own table CSS is the root cause: no outer frame, no header fill, first-column / last-column padding zeroed, a hairline under every row including the last, and no radius. All of it hangs off the salted `._tableScroll_1ypvv_192`, so the theme cannot name it; `md-table-wide` appears only on wide tables and `md-table-fill` has no rule at all. `markdown.js` takes the greeting's route — walk from the published `[data-chat-flow]` hook, mark the table's scroll wrapper (the table's only element child) with the plugin's own `data-cds-table`, and paint only that attribute. The marker is idempotent, removes every mark on dispose, skips tables outside the flow, and leaves a table whose parent is not a dedicated wrapper alone. The observer re-sweeps only for added nodes that can contain a table, coalesced onto one frame. The frame is drawn on the wrapper — a border on the table itself would scroll away — but the wrapper is not where the table sits, and the item had to take its geometry: the host sizes the table to `max-content` inside a full-width block whose wide-table variant sets `overflow-x: hidden` AND bleeds the wrapper out of the prose column (`width: calc(100% + lead + spare)`, `margin-left: -lead`, `padding-left: lead`). The first version framed that wrapper and inherited all three failures — a frame wider than the columns, a last column cut mid-glyph, and a dead gutter on the left of wide tables. The bleed is now cancelled, the wrapper scrolls (`overflow-x: auto`, never a silent clip), the table is fitted to it (`width: 100%`), and the host's per-column `min(30vw, 320px)` cap is dropped so the table cannot end up narrower than its own frame. Type comes from the host's table tokens, which the typography layer now maps to the BODY row rather than a step down — the reference pins no table row, and its storybook is self-inconsistent (one demo table is `text-xs`, another inherits prose), while the rendered result of 12/16 was a table smaller than its own paragraphs. Every `!important` covers a same-specificity host declaration that may land after this sheet. The last row drops its hairline because the frame closes the table; blockquotes get the 16px bottom margin the host leaves at 0; `hr`/lists/`li` stay host-owned. `tabular-nums` follows the reference's counting-region rule.*

## 思考微光 · Thinking shimmer

宿主的“深度思考中…”标签会扫过一条 `currentColor` 实心光带；在陶土配色下它读起来像一条硬色块。主题只改**装饰层的填充**，保留宿主扫光的全部几何（`transform` 关键帧、时长、延迟、`mask-image` 都在宿主自己的 `.sweep` 元素上）：

```css
[data-shimmer-decoration] {
  background: linear-gradient(90deg, transparent 0%, var(--dsw-alias-label-deep-diving-shimmer) 50%, transparent 100%) !important;
  opacity: 0.6 !important;
  filter: blur(1px);
  animation-timing-function: var(--cds-ease-pulse) !important;
}
```

- `[data-shimmer]` / `[data-shimmer-decoration]` 是宿主发布的稳定钩子（证据：`.repro/css/web-frontend-index.pretty.css` —— `[data-shimmer-text]:after` 复制文字、`._sweep_… [data-shimmer-decoration]{background:currentColor}` 画装饰层）；选择器不碰任何盐化类。
- 三条视觉声明带 `!important`，因为宿主的 `.sweep [data-shimmer-decoration]` 是「类 + 属性」特异性；**没有**任何 `animation-name` / `animation-duration` / `transform` / `mask-image` 声明，所以几何与参考时序不变。
- 曲线用参考的呼吸脉冲令牌 `--cds-ease-pulse`（`cubic-bezier(.4, 0, .2, 1)`，`cds-theme.css:199`、`docs/v1/01-…md:608`），定义在 `EASING.pulse`（`palette.js`）并由样式表 `:root` 暴露；不在规则里内联字面量。
- 钩子不存在时规则自然失配，主题其余部分照常工作。

*The host sweeps a solid `currentColor` band across the thinking label. The theme only softens the decoration fill — a transparent→clay-shimmer→transparent gradient at 60% opacity with a 1px blur — and leaves every geometric property to the host's own `.sweep` element. The selector uses only the published `[data-shimmer-decoration]` hook; the timing function is the reference `--cds-ease-pulse` token (defined once in `EASING.pulse`). An absent hook simply never matches.*

## 设置 · Settings

设置页有两处，都跟随宿主语言（纯中文 / 纯英文）：

**设置 → 主题定制**（`settings.section` id `appearance`，`order: 1` —— 排在「账户」(-10)、「通用」(0) 之后，「模型」(10)、「内置插件」(15)、「智能体预设」(20) 之前）：

| 行 Row | 取值 Range | 说明 Notes |
|---|---|---|
| **主题模式 · Theme mode** | 浅色 / 深色 / 跟随系统 | **页面第一行**（`order: 10`，与宿主那一行在「通用」里的次序相同）。选中态跟随**持久化偏好**（`theme.getTheme().preference`），写入走 `theme.setTheme(id)` —— 宿主自己的「唯一偏好写入入口」。所以它和宿主原本那一行是同一个偏好，两处永远不会分叉；宿主把偏好改了（快捷键、另一处界面），这里经 `theme/change` 立刻跟上。*first row; the same durable preference as the host's own row, written through `theme.setTheme` and re-read on `theme/change`.* |
| 品牌强调色 · Accent | 陶土橙 / 赭石 / 砂金 / 石墨 | 驱动光标、焦点环、选中态、链接 *drives cursor, focus ring, selection, links* |
| 表面暖度 · Surface warmth | 0–100% | 0 = 宿主原色，100 = CDS 暖灰 *0 = host greys, 100 = CDS warm* |
| 圆角比例 · Corner radius | 50–150% | 整条 CDS 圆角阶梯的缩放 *scale of the radius ladder* |
| 阴影强度 · Elevation | 0–200% | 双层弥散阴影的不透明度 *diffuse-shadow opacity* |
| 组件细化 · Refinement | 开 / 关 | 关掉只保留配色与排印令牌。**消息操作栏悬停显现、滚动渐隐遮罩、代码块细节与 Markdown 正文都属于这一组，没有单独开关**（用户已验收，效果常驻）*off keeps colour + typography tokens only. The hover-revealed message actions, the scroll fade masks, the code-block details and the markdown body all live inside this gate — no per-item switches.* |
| **深度思考提示用原版蓝 · Thinking-label colour**（29） | 开 / 关 | 只改「正在深度求索 / Deep diving…」这行提示的标签色与 shimmer：开 = 宿主原蓝（`#7d9ade`/`#3a61b5`、`#a2befe`/`#4767b5`），关 = CDS 陶土（默认）。**只动这两个令牌** —— 强调色、品牌蓝色阶梯、引导页光环、焦点环全都保持不变 *blue only for the “Deep diving…” line + its shimmer; off is the clay default. Exactly two tokens — the accent, brand ramp, onboarding rings and focus ring never change.* |
| **附件卡 · Attachment cards**（31） | 开 / 关 | 用户消息里的文件行：10px 圆角 + 浮起表面、悬停发丝线提亮、文件名最长 120px、类型与大小一行改等宽 + 等宽数字。**没有做**：120px 桌面磁贴、悬停删除按钮、上传进度条 —— 宿主在这一行里根本不渲染它们 *the user-message file row; the tile, remove button and upload bar have no counterpart in this row.* |
| **脚注 · Footnotes**（33） | 开 / 关 | 脚注区 12/15、次级颜色、上方半像素分隔线；正文上标编号改等宽 + 等宽数字。这一项**完整可做** *12/15 tertiary block with a half-pixel rule; superscripts in tabular Mono. Nothing is skipped.* |
| **运行指示呼吸 · Running pulse**（34） | 开 / 关 | 运行中的指示：1.2 秒闪烁 + 3 秒陶土呼吸（`scale .86→1`、`brightness .96→1.06`），作用在宿主实际渲染的那个图形上；`prefers-reduced-motion: reduce` 时整段动画消失。**没有做**：三点波 —— 这一行里根本没有点 *the mark the host renders gets the 1.2s blink and the 3s breathe; the three-dot wave has no target here, and reduced motion wins.* |
| **同心圆角 · Concentric corners**（35） | 开 / 关 | 菜单表面改为**从内部圆角反推**：`outer = --dsw-radius-sm + 4px`（列表真实的 4px 内边距）。100% 时算出来仍是 12px（与已验收的值相同），把圆角滑杆推到 50–150% 时外圈才跟着内圈走，而不是各走各的。**没有做**：composer 卡片 —— 它的真实内边距是 8px，套公式得 16px，与已验收的 20px 不符，所以保持原样 *the menu material derives its outer radius from the inner one; the composer's measured inset yields 16px, not the approved 20px, so it keeps its pinned value.* |
| **用量数字 · Usage numbers**（37） | 开 / 关 | 输入框统计胶囊的数字与两个用量弹层里的数值改用等宽数字（CDS 的计数区规则），弹层的 `<dl>` 走 CDS 两列体例：`dt` 次级 12/15、`dd` 主色 12/15 等宽、6px 列间距、同一基线。**没有做**：参考稿的四色记忆仪表 —— 宿主不渲染那个 SVG，也没有挂点 *tabular figures in the stat pills and both usage popovers, plus the CDS dt/dd ladder; the reference's four-colour gauge has no mount point and is not faked.* |
| **折叠行 · Fold rows**（38） | 开 / 关 | 宿主共享的折叠原语一处改、全应用生效：表头 12/16/500、16px 箭头按 `--cds-ease-snap` 旋转、正文 12/18 次级色、行间 `.5px` 分隔线（单笔触纪律：表头不额外画边框，末尾那条重置为 0）。箭头所在的类名是盐化的，所以按**结构**取（`> :first-child`）*one fold language for every collapsible row via the shared hooks; the chevron is reached structurally, never by its salted class.* |
| **按钮弹簧 · Button spring**（36） | 开 / 关 | 本主题自己的控件（色板 / 开关 / 模式方块）按压时用参考的 15 阶弹簧。三条曲线令牌（`--cds-btn-spring`、`--cds-ease-rise`、`--cds-ease-fall`）**始终存在** —— 它们是令牌不是观感，只有消费它们的按压过渡跟随本开关。**没有做**：宿主 markdown 里的按钮（盐化类） *press movement on this plugin's own controls; the three curve tokens are always defined, only the consuming transitions are gated. The host's markdown buttons are salted and out of reach.* |
| **长文本粘贴存为文件引用 · Long paste as a file reference**（39） | 开 / 关 | 纯文本粘贴超过 2000 字或 30 行时，先经宿主自己的文件入口存进工作区 `.dsh-paste/`，再以 `@` 引用插入输入框（与拖入真实文件得到同一个 chip）。任何一步失败都在 2 秒内回退成普通文本粘贴，粘贴内容不会丢。关掉 = 宿主原本的粘贴，不做任何拦截。order 40/41 属于 usage-stats 在同一页上的两行，42 空缺 *a plain-text paste of 2,000 characters or 30 lines is saved into `.dsh-paste/` and inserted as an @ reference; any failure falls back to plain text within 2 s; off leaves the host's paste untouched.* |
| **首页背景点击波纹 · Home backdrop with click ripples**（44） | 开 / 关 | 只在**新会话空白态**（`[data-content-phase="hero"]`）：问候语与输入框背后浮出一层很淡的代码字形，每次点击从光标处荡开水波，波纹所过之处的字形亮起并转为强调色。关掉 = 画布、监听与半透明输入卡一起移除，回到宿主原样。详见下面「首页背景与点击波纹」一节 *blank-session only: faint code glyphs behind the hero, a water ripple from every click; off removes the canvas, the listener and the see-through card together.* |

**新会话的输入框限高不是设置项。** 它没有开关、没有行：纯 CSS、只作用于 `[data-content-phase="hero"]`，理由与做法见上面「新会话输入框的限高」一节。

**设置 → 通用**：只剩一行「启用 CDS 主题 · Enable CDS theme」（开 / 关，关掉释放全部令牌覆盖；字体标签保留，只清空规则标签）。它是插件总开关，不是外观旋钮，所以不跟着外观行搬走。

宿主原本那两行 —— **「外观 / Appearance」**（浅色 / 深色 / 跟随系统的三个方块）和 **「字号大小」** 组 —— 仍由宿主注册在「通用」里，注册无法搬动它们。本插件把**前者**完整重建成了上面那行「主题模式」（写入走宿主同一个偏好入口，所以两边不会分叉），并用一条 CSS 把宿主那份藏起来。**「字号大小」组刻意留在「通用」**：不搬、不藏、不重建 —— 这是用户的明确决定，不是遗漏，详见「已知限制」。

*Two pages. **Settings → Theme** carries the theme-mode row plus the thirteen appearance knobs; **Settings → General** keeps only the master switch. The host's own 「外观 / Appearance」 cube row is rebuilt as our 主题模式 row (same durable preference, same write entry) and the host's copy is hidden with CSS. The 字号大小 group deliberately stays in General — neither moved, hidden nor rebuilt, by the user's explicit decision (see Known limits), not by omission.*

### A 档批次的边界 · Where the A-tier batch stops

六项里留下五项，每一行都写清了「什么没做、为什么」。这些不是待办，是**宿主不提供实现位置**的结论：

| 项 | 做了什么 | 没做什么（原因） |
|---|---|---|
| 附件卡 | 消息里那一行的圆角 / 表面 / 悬停发丝线 / 120px 文件名 / 等宽等宽数字 | 桌面磁贴、悬停删除按钮、上传进度条 —— `data-message-attachments` 这一行里宿主只渲染 `span[title] > 图标 + 名称 + 类型·大小`，那三样在别处或不存在 |
| 脚注 | 12/15、次级颜色、半像素上分隔线、上标等宽等宽数字 | 无 —— 这一项完整 |
| 运行指示 | 1.2 秒闪烁 + 3 秒呼吸，作用在宿主实际渲染的那个图形上 | **三点波**：`data-chat-running` 里只有一个视觉隐藏的 `role="status"`、一个 `.5px` 分隔线和一个 APNG 鲸尾，没有点 |
| 同心圆角 | 菜单表面 = `--dsw-radius-sm` + 列表真实 4px 内边距 | **composer 卡片**：真实内边距是 8px（`.RlGAzG_row { padding:2px 8px 6px }`，卡片本身没有水平内边距），套公式得 16px，而验收过的是 20px。公式没错，是这一件容器不适用 |
| 按钮弹簧 | 自有控件上的按压过渡 + 三条常驻曲线令牌 | **宿主的 markdown 按钮**：盐化类，按纪律不碰 |

**第六项「分段控件」已整项删除**（`segmentedThumb`，order 32）。它当初只能复刻静止态 —— 本宿主的「对话 / 轨迹」是**下划线标签栏**，参考实现却在胶囊轨道里滑一个内联定位的独立元素，而这里无法注入元素；复刻出来的结果是一颗静止胶囊加一条被压掉的下划线，用户看过之后判定观感差，于是开关、状态键、规则与文案一并删掉，order 32 留在空洞里不再复用。`typography.js` 里那行 `segmented tab` 证据**保留** —— 它记的是**参考稿**的 `:453` 元素与「无令牌载体」这一事实，与本插件删掉的规则无关，至今仍然成立。

*Five items shipped; each row states what was skipped and why — these are conclusions, not TODOs. **A sixth, the segmented control, was deleted outright on the user's verdict**: it could only reproduce the resting look (this host's control is an underline tab bar, and the reference's sliding indicator needs an injected element), the result read as a static pill with a suppressed underline, and the switch, state key, rules and copy are all gone with order 32 left vacant. The `segmented tab` row in `typography.js` is KEPT — it records the reference spec's `:453` element and the fact that it has no token carrier, which is independent of the deleted rule and still true. The concentric formula is correct but the composer is not a valid subject for it: its measured inset is 8px, which yields 16px against the approved 20px, so it keeps its pinned value. The three curve tokens are always emitted because they are vocabulary, not a look.*

### 为什么「主题定制」叫这个名字 · Why the page is called 「主题定制 / Theme」

宿主自己有一行就叫「外观 / Appearance」——那是「通用」里浅色 / 深色 / 跟随系统的三个方块（`ui-theme/lib/client.js:2046` 注册 `settings.general.item`，id `appearance`）。本插件最初也把分区叫「外观 / Appearance」，于是设置里出现两个不同的「外观」。用户的原话：「深色和浅色这个不是也叫『外观』吗 自己再起个名字做一下区分」。

所以分区改叫 **「主题定制 / Theme」**（`order: 1`，导航栏 188px 装得下）。**重命名后那一行又搬回了这一页**（见上），所以导语不再指向「通用」，而是直接说明这页现在管浅色/深色：

| 语言 | 导航名 | 导语 |
|---|---|---|
| zh | 主题定制 | 主题的配色与形状：浅色或深色、强调色、表面暖度、圆角、阴影，以及逐项复刻的组件细节。 |
| en | Theme | The theme’s colour and shape: light or dark, accent, surface warmth, radius, elevation and the replicated component details. |

标签是**语言切换时重解析的 thunk**（`label: () => t('appearance.nav')`，宿主的 `resolveSlotLabel` 每次 revision 变化都会重调），所以切语言时侧栏那一项当场改名，不需要重新注册。

### 「主题模式」怎么读写、宿主那行怎么藏 · The row's data path and the CSS hide

**为什么是重建而不是搬家。** 两个设置页在 DOM 层面是**互斥**的：`ui-settings-general:338` 用 `renderSlot('settings.section', …, { only: active })` 只渲染当前页，渲染器 `ui-renderer:1220` 把列表过滤到那一个 id；而一个子槽位只能有**一个**声明它的 entry（`SlotCore.register` 对重复声明直接抛错）。所以宿主的行搬不过来，只能重建 —— 只要重建出来的控件写的是**同一个持久化入口**就是安全的。

| 方向 | 调用 | 证据 |
|---|---|---|
| 读 | `theme.getTheme().preference` | `ui-theme:1693`；快照 `{ preference, fontSizes, fontFamilies, active, themes, revision }` |
| 写 | `theme.setTheme(id)` | `ui-theme:1712`，注释原文「the only user preference write entry」，写经 settings scope 并 `publish()` |
| 订阅 | `ctx.on('theme/change', …)` | `publish()` 里 `this.ctx.emit("theme/change", this.snapshot)` |

读的是 **`preference`（持久化偏好）而不是 `active`（解析后的主题）**：选「跟随系统」时 `active` 会解析成 light 或 dark，用 `active` 会让那个方块永远显示未选中。写走 `setTheme`，它自己会拒绝未注册的 id，所以不可能写进一个非法值。

**宿主那一行怎么藏。** 用 CSS，**不摘节点** —— 在 React 的提交里移除/搬走宿主拥有的节点正是本仓库已经踩过一次的 `removeChild` 崩溃类问题；`display:none` 让 React 的树保持完整，最坏情况只是「行没藏住」，页不会坏。也没有东西要在 dispose 时还原：规则撤掉就行，DOM 从没被动过。

```css
body [data-slot="settings.general.item"] > *:has(button[aria-pressed]:not([role="switch"])) { display: none !important }
```

**这条规则只藏一行，而且只藏这一行。** 「字号大小」组**不在范围内**：它按用户的决定留在「通用」，既不重建也不隐藏 —— 不要为了「统一」再加一条规则，那会删掉一个用户明确要保留的设置入口。规则的注释里也写了这一点。

选择器为什么长这样（都对着已发布渲染器核过）：

1. **`:has()` 挂在「行」上，不能挂在出口上。** 列表槽位只发出**一个** `div[data-slot="settings.general.item"]`（`display:contents`），所有行是它的**直接子元素**（`ui-renderer:1122-1127`、`:1203-1221`）。所以 `[data-slot=…]:has(… )` 会命中出口本身 —— 那会把整个「通用」页隐藏掉。必须写成 `> *:has(… )`。
2. **`aria-pressed` 是唯一的。** 把注册进这个槽位的全部 8 个包查了一遍（locale、chat、conversation、permission-presets、settings-general、settings-session-log、shortcuts、theme），`aria-pressed` **只出现在 `theme`**，也就是那三个方块。注意 `aria-expanded` / `aria-controls` 都**不是**唯一的（6 个包有 `aria-expanded`：语言行、权限行、输入行为、字号组…），这正是「只藏方块行」在可证明性上更稳的原因。
3. **`:not([role="switch"])`** 兜住未来某个也报 `aria-pressed` 的开关，避免把整行带走。

它**证明不会**误伤的东西：规则限定在 `settings.general.item` 内，所以本插件自己的强调色方块（`aria-pressed`，在 `settings.appearance.item`）与「主题模式」方块（同页）都不在范围内；`enabled` 开关是 `role="switch"` + `aria-checked`，没有 `aria-pressed`，不命中；菜单类行（三个 `aria-haspopup`）、纯文本行、纯滑杆行都不命中。测试用一个复刻宿主标记的 fixture 把这些正反例逐条钉住，并反向证明「同一形状若出现在通用里会命中 —— 因此槽位作用域是承重的」。

**闸门是「服务在不在」**：`themeMode.available()` 同时门控「行渲不渲染」和「规则发不发」。没有主题服务时既不渲染行、也不隐藏宿主行 —— 否则用户会失去切换主题的唯一入口。这条规则**只随总开关走，不随 `refine` 走**（它不是组件细化，关掉细化的人仍然需要一个能点的主题开关）。

*The row is a REBUILD, not a move: the two pages are mutually exclusive in the DOM and a child slot has exactly one declaring entry, so the host row cannot be reparented. It reads `getTheme().preference` (the persisted choice — reading the resolved `active` would leave the 跟随系统 cube permanently unselected), writes through `setTheme(id)` (the host's own single write entry), and follows `theme/change`. The host's cube row is hidden with `display: none`, never detached — the `removeChild` crash class — and the `:has()` is scoped to the ROW (`> *:has(…)`) because the list slot emits one `display:contents` outlet holding every row; targeting the outlet would blank the whole page. `aria-pressed` is unique to the cube row across all eight packages that register into the slot, whereas `aria-expanded` is shared by six of them — which is why that shape is not used at all. The rule hides exactly ONE row: the 字号大小 group stays in General by the user's explicit decision (see Known limits), not because a replacement is still pending. Every rule is slot-scoped, so our own cubes and the `enabled` switch cannot match, and a reverse-proof test fails if that scope is ever dropped. Both the row and the rule are gated on the theme service being present, so the host row is never hidden without a replacement.*

**Under `system`, an OS light/dark flip repaints the row but never changes which cube is selected** — which looks like a bug and is not. The host's media listener is `if (this.preference !== "system") return; this.publish()`, so a flip does publish `theme/change` while `preference` stays `"system"`; the row re-reads it and keeps 跟随系统 selected. With a pinned preference the host emits nothing and the row is untouched. Both branches are tested.

*Under `system` an OS flip re-emits `theme/change` (the host publishes only when the preference is `system`), so the row wakes and re-reads `preference` — still `system`, so 跟随系统 stays selected: the flip changes the resolved theme, never the choice.*

### 导航图标为什么是插件自己画的 · Why the nav icon is ours

宿主的 `navIcon(id)`（`ui-settings-general/lib/client.js:244-266`）是一条**硬编码 if-chain**：`account` / `models` / `agent-presets` / `plugins` / `archived-sessions` 各有自己的图标，**其余 id 一律回落到齿轮**（`IconSettingsOutlineMedium`）。槽位注册只能给 `id` / `order` / `label` / `locale` / `children` / `inject` / `store`，**不能给图标** —— 所以主题页一开始和「通用」共用同一个齿轮，这正是用户指出的问题。

合法路径与 `hero.js` / `markdown.js` 相同：**结构定位 + 自有内容**，不碰任何盐化类名。

- 定位：设置弹窗是稳定钩子 `[data-shortcut-modal="settings"]`（`docs/host-hooks.md` §1.8）；入口是其中的 `button`，判定条件是「直系 `<span>` 的文本等于本分区的标签（中英任一）」并且「有一个直系 `<svg>`」，或「按钮已带本插件标记」（语言切换后标签变了也认得出）。
- 写：**先插入我们的 `<svg>`**（带 `data-cds-appearance-icon`），**再把宿主 `<svg>` 设为 `display: none`** —— 不 `remove()` 宿主节点。后者是 React 拥有的节点，从 React 跟踪的父节点里摘掉它是 `removeChild` 崩溃的那一类问题；`display:none` 让 React 的树保持完整，最坏情况只是「图标没换成功」。
- 还原：`stop()` 移除我们的 `<svg>`、把宿主 `<svg>` 的**原 `display` 值**写回去（不是简单清空）、清掉按钮标记；标记本身幂等，两次 sweep 不产生第二次写入。
- 降级：没有设置弹窗、标签被改名、按钮里没有 `<svg>` —— 一律返回 `null`，宿主的齿轮原样保留，其它导航项一个都不动。

图标本体是**两个同心的圆角方框**（`viewBox 0 0 16 16`、`fill="none"`、`stroke="currentColor"`、圆角端帽/连接、`aria-hidden="true"`、Medium `stroke-width` 1.3 / Regular 1），跟随宿主自己的两档命名（nav 实际用的是 Medium）。尺寸读宿主那颗齿轮的 `width`，所以宿主换 20px 档时它也跟着变。源码在 [`assets/appearance-icon.svg`](assets/appearance-icon.svg)，浅/深两套背景下的两档尺寸对照页在 [`assets/preview.html`](assets/preview.html)。

**为什么改掉「三条滑轨」。** 第一版就是三条滑轨 + 三个滑块，而宿主「插件 / Plugins」那一项用的 `IconPersonalizationOutlineMedium` **也是三条横轨各带一个圆滑块**（从已安装包体里取出的真实几何：3 个 `circle` + 3 段带缺口的横轨）。于是同一列侧栏里出现了两个一模一样的滑杆图标 —— 用户报了**两次**。这个母题从此归「插件」所有，不许再用。

**为什么是这套同心方框。** 拿全部五个宿主导航图标量过（齿轮 / 滑轨 / 绳结环 / 数据库圆柱 / 人像）：**它们全部由 path 与 circle 构成，五个里没有一个 `rect`**。一对同轴对齐、同心嵌套的圆角矩形在其中的出现次数是零。语义上也对得上：外框 = 表面，内框 = 表面里的形状，框间距 = padding，圆角 = 圆角比例 —— 正是这一页在调的东西；它同时呼应本插件在插件列表里那张「两层错开表面」的图。几何上两框**严格同心**（中心都在 8,8，四边间距相等），内框圆角比外框小，所以「外圆角 = 内圆角 + 间距」这条同心圆角关系在图标内部就成立。

*The glyph is two concentric rounded frames. The first version was a three-track slider triptych — and the host's `IconPersonalizationOutlineMedium` for the 插件 entry is also three tracks with round knobs (3 circles + 3 gapped tracks, extracted from the shipped bundle), so the nav column showed the same sliders twice; the user reported it twice and that motif now belongs to 插件. Measured against all five shipped nav glyphs (gear / sliders / knot-ring / database cylinder / person), every one is built from paths and circles — **no `rect` anywhere in the five**, so a concentric pair of rounded rectangles cannot be confused with any of them. It also carries meaning: outer surface, inner shape, gap = padding, inner radius tighter than the outer — the 同心圆角 relation this theme applies elsewhere, and the same two-surface idea as the plugin's own list artwork.*

### 「外观」为什么是一页而不是一个分组 · Why it is a page

用户的原话：「外观分组放错位置了吧 他应该放到跟通用的那个 跟通用应该是同一级的 不是放在通用里面的」。所以它走宿主的 `settings.section` 槽位，而不是在「通用」里再套一个容器：

```js
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section',
  id: 'appearance',
  order: 1,
  label: () => t('appearance.nav'),   // 语言切换时重解析的 thunk
  locale: 'dsh-cds-theme',            // 注入 t 到页面组件
  children: { 'settings.appearance.item': { kind: 'list', scope: 'root' } },
}, AppearanceSection))
```

页面组件拿到的 `renderSlot` 是**宿主注入的 prop**，不是插件自己造的路由：

```js
function AppearanceSection({ renderSlot, t }) {
  return <div className="dct-section">
    <p className="dct-section-intro">{t('appearance.intro')}</p>
    {renderSlot('settings.appearance.item', {})}
  </div>
}
```

这条通路在宿主里是**通用机制**，不是「内置插件」页的特例：`dsh-client-ui-renderer/lib/client.js:753-755` 写明「entry 声明了 `children` 就给 `renderSlot`」；`:342-355` 的 `boundRenderSlot` 只接受本 entry 自己声明过的 key（否则抛 `SlotOwnershipError`）；宿主自己的最小示例就是 `GeneralSection`（`ui-settings-general:635-639`），只做 `renderSlot('settings.general.item', {})` 一件事。`settings.section` 本身是设置外壳在 `sidebar.settings` 的 children 里声明的 list 槽（`ui-settings-general:1258-1261`），导航按 `order` 排序、label 走 `resolveSlotLabel`（`function CI(e){return typeof e=="function"?e():e}`，`web-frontend-index.js`），所以 thunk 会在语言 revision 变化时重跑。

**降级，不留半成品。** 只有「分区注册成功 **且** 全部外观行落到 `settings.appearance.item`」才留在分区模式；其余情况（宿主没有设置外壳、`register` 被拒、分区注册了却没声明子槽位）一律把全部行注册回 `settings.general.item`，即加分区之前的行为，并 `console.warn` 一条。设置外壳的挂载时机不保证早于本插件，所以走分区的那条路有一个 3 秒上限的等待（`SECTION_WAIT_MS`），分区一挂上就取消；超时同样回落。行绝不会停在一个没人渲染的槽位里，也不会出现「主题定制」页是空的、行却还在通用里。

*The section is registered through the host's `settings.section` slot with its own child ledger; the body projects that ledger through the `renderSlot` prop the renderer injects for every entry that declares `children` (`ui-renderer:753-755`), which is the same path the host's own `GeneralSection` uses. Anything short of “section registered AND every appearance row landed on the child slot” falls back to registering all rows into `settings.general.item` with one warning — no empty Theme page, no rows stranded on a slot nobody renders. The wait for the settings shell is bounded at 3 s and cancelled the moment the section mounts.*

### 已验收并删除的开关 · Verified items whose switches were removed

按 `docs/replication-toggles.md` 的约定：**开关只为对照而存在，用户验收后开关就删掉、效果常驻。**

| 复刻项 | 曾用开关 | 现在 |
|---|---|---|
| 代码块细节 · Code-block details | `codeBlockDetails`（order 27） | **已删**。6 条规则无条件发出（只在 `refine` 内）：横幅 Mono 10.5/12/500/大写/.05em、标题重置、`.5px` 横幅缝、12/16/500 折叠头 + 悬停主色 |
| Markdown 正文 · Markdown body | `markdownBody`（order 28） | **已删**。10 条规则 + `data-cds-table` 标记无条件生效；标记跟随 `enabled && refine` |

**规则文本逐字节未变。** 删掉的只是两个 `if (state.X !== false)` 守卫与两行设置项；两个规则块的发出文本与删除前完全一致。`test/rule-baseline.mjs` 保存了删除前抓取的原文，`test/css.test.mjs` 逐字节比对它 —— 谁改动了其中一个字符都会红。

**旧配置不会复活成隐形模式。** 旧 `localStorage` 负载若仍带 `codeBlockDetails: false` / `markdownBody: false`，`sanitize()` 只返回已知状态形状，这两个字段直接被丢弃，因此发出的样式表与默认状态**逐字节相同**（有测试）。它们也**不再是状态**：`DEFAULT_STATE` 与 `sanitize()` 里都没有这两个键，`styles.js` 里也没有任何读取它们的分支。

*Following `docs/replication-toggles.md` — a switch exists only for comparison and is deleted once the user verifies the item, with the behaviour staying permanently on. Both switches are gone (rows at orders 27/28 deleted, locale keys removed, state keys removed from `DEFAULT_STATE`/`sanitize`); their 6 and 10 rules are now unconditional inside `refine`, and the table marker follows `enabled && refine`. The rule text is byte-identical to the pre-removal sheet, pinned by `test/rule-baseline.mjs`. A legacy payload still carrying `false` for either field is dropped by `sanitize()` and emits the identical sheet — it cannot resurrect as an invisible mode.*

### 新会话输入框的限高 · Bounding the new-session composer

**问题。** 曾经有一个 `compactHero` 运行时（开关在 order 42）：空白会话里它测量 `[data-composer-seat]`，一旦输入框比「静息高度」高出 6px 就收起问候语和用量面板。**seat 包住的是整个 hero composerStack** —— 问候语、用量面板、workspace 行、输入框全在里面 —— 所以收起问候语会让它刚量过的 seat 变矮，判定随即翻转、问候语回来、seat 又变高：**自我激发的布局抖动**。

**现在的做法：纯 CSS，不测量、不观察、不重试。**

| 目标 | 做法 |
|---|---|
| 只作用于新会话 | 每条规则都挂在宿主自己的 `[data-content-phase="hero"]` 上（宿主 `dsh-client-ui-conversation` 用 `hero = shellPhase === 'blank'` 得出该相位）；进行中的会话一个字节都不受影响 |
| 文本最多约 8 行或 30vh | 把宿主的 `--dsh-composer-text-max-height`（seat 上默认 336px）改成 `min(30vh, calc(192px + 8 * var(--dsh-content-font-delta, 0px)))`；读这个变量的正是输入框自己的 `[data-input-scroll]`（`_scroll` 的 `max-height`），**它是唯一的文本滚动容器** —— 不加包装、不写 JS 高度 |
| 页面放不下时顶部仍可达 | `[data-conversation-scroll]` 用 `justify-content: safe center`，并在它前面声明 `flex-start` 作为不支持 `safe` 时的回退；同时 `overflow-y: auto`，所以整栈溢出时页面自己从顶部往下滚 |
| seat 不再遮挡 | `[data-composer-seat]` 保持自然高度（`flex: 0 0 auto`）与常规流（`position: static`）。宿主只在 `active` 相位才让 seat 变 sticky，所以这是**防御性约束**，不是纠正 |

**旧配置无害。** 旧的 `localStorage` 里若仍有 `compactHero`，`sanitize()` 直接丢弃，样式表逐字节不变；`DEFAULT_STATE` 里也没有这个键。

*The retired `compactHero` runtime measured `[data-composer-seat]`, which wraps the whole hero composerStack: hiding the greeting lowered the seat it had just measured, so the decision flipped back — a self-feeding layout loop. What ships instead is CSS only, scoped to the host's own `[data-content-phase="hero"]`: the host variable `--dsh-composer-text-max-height` is lowered to `min(30vh, 8 host line heights)` and read by the input's own `[data-input-scroll]`, the single text scrollport; `[data-conversation-scroll]` keeps `overflow-y: auto` and centres with `safe center` (`flex-start` declared first as the fallback), and the seat stays in normal flow (a defensive constraint — the host's sticky seat is active-phase only) so the page, not the seat, owns overflow. An active conversation is never touched, and a leftover `compactHero` storage key is dropped by `sanitize()`.*

### 首页背景与点击波纹 · The blank-session backdrop

**它不是从参考仓库抄来的。** 我在 `.reference/open-claude-ui` 里 grep 了 `ripple` / 水波 / 涟漪 / canvas / pointer，**没有这个效果的源码** —— 最接近的只有 `ReasoningAmbientGlow` 的静态环境光晕，与点击无关。真正对应的是 Claude Code 桌面版 2.37337.1 → 2.42304.0 上线过约一天的首页实验特性：空白首页、文件夹选择器后面浮着一层发光代码字形，每次点击从光标处向外扩散圆圈（[anthropics/claude-code#102952](https://github.com/anthropics/claude-code/issues/102952)）。所以这是**按描述还原**，实现写在 `client/src/ripple.js`，不是移植。

**为什么是 canvas，不是纯 CSS。** 波纹要按「每个字形到推进中波前的**距离**」决定亮度 —— 这是逐字形、逐帧的状态，CSS 无法对点击位置求距离；而一个字形一个 DOM 节点等于每帧付一次样式重算。一个 canvas、一次 rAF，字形是笔画而不是元素。

**波纹刻意没有圆环。** 第一版画了一个描边圆（`ctx.arc` + `ctx.stroke`）向外扩，用户看到后第一句话就是「不要有圆环啊」—— 一条闭合硬线扫过暗场，读起来是雷达扫描，不是水波。参考仓库对这个效果没有实现（`ripple` / `glyph` / `code symbol` 全分支搜索：0 命中），但它**唯一的**环境光晕先例 `ReasoningAmbientGlow.tsx` 里的 `AmbientLightFieldCanvas` 说明了这家的做法：只用 `createRadialGradient` + `fillRect` 的柔光，从不 `stroke`。所以现在点击只送出一圈**弥散的亮度前波**，波前的位置由「哪些字形被点亮」表达，空地方什么也不画 —— 这正是它读起来像氛围而不像仪表的区别。

字形本身也不是文字色：第一版用正文色（近黑）画 `async` / `const` 这类**可读单词**，结果像散落的错字。现在只用标点符号（`{` `}` `<` `>` `;` `/` `#` …），读不成任何词，颜色只有强调色，并加 `shadowBlur` 让它成为光点。

**图层的放置要点。**

| 目标 | 做法 |
|---|---|
| 在问候语与输入框**背后**，不是盖在上面 | 画布挂在 `[data-conversation-content]`（对话 body）的第一个子节点；body 上加 `isolation: isolate` 造出层叠上下文，画布 `z-index: -1` —— 于是它画在该层叠上下文自己的背景之上、所有常规流后代之下 |
| 只在空白会话 | `isolation` 规则挂在 `[data-content-phase="hero"]` 上。`active` 相位里宿主的 sticky seat 用 `z-index: 7` 与 header 的 8/9 竞争，在那里造层叠上下文会重定这场竞争的基准 —— 空白会话没有这些 z-index，所以在那里隔离是零代价 |
| 波纹能透过输入框 | 空白会话的 `[data-composer-card]` 改成 `color-mix(in srgb, var(--dsw-specific-input-major) 82%, transparent)`。原版正是让字形从文件夹选择器和输入条背后透出来；不透明卡片会把波纹在卡片边缘切断，而用户的光标通常就在卡片上。82% 留住了文字对比度，也不碰进行中会话的输入框 |
| 点击不被拦截 | `pointerdown` 监听挂在 body 上（passive、不捕获、不 `preventDefault`、不 `stopPropagation`）。点击点在卡片、选择器、问候语上都会冒泡上来，波纹照常从光标处扩散 |
| **尺寸测量绝不读画布自己** | `<canvas>` 是**替换元素**：CSS 没钉住盒子时，`getBoundingClientRect()` 返回的是**位图尺寸**。第一版量画布、乘 DPR、写回属性，于是每次观测都放大一次 —— 实测 1000×742 的区域被撑出 25973×13013 的位图（约 1.3 GB），看起来「已挂载、可见」，实际什么也画不出来。现在量**父元素**，CSS 侧另有 `width/height: 100%` 兜底，两道独立防线 |

**性能与降级。** 双档帧预算：有波纹时 30fps（否则涌动的光会顿），空闲时 6fps（4% 不透明度下看不出差别，但唤醒次数降到六分之一 —— 首页是用户会长时间停留的地方）；`document` 隐藏时停循环；`prefers-reduced-motion: reduce` 时只静态画一帧、不循环、不产生波纹；同屏波纹上限 4 个；MutationObserver 只在**空白会话**里对新增元素调度一次检查，而检查本身是指针比较，不是文档查询 —— 流式回答每秒新增的成百上千个节点不会触发任何布局读取。宿主结构不认识（没有 body、没有 scroll 容器）就完全不挂载，不留监听。

*No ring, on purpose. The first version stroked a circle (`canvas.arc` + `stroke`) travelling outward; the verdict was immediate — it reads as a radar sweep, not water. The reference repo has no implementation of this effect (zero hits grepping `ripple` / `glyph` / `code symbol` across every branch), but its one ambient-canvas precedent, `AmbientLightFieldCanvas` in `ReasoningAmbientGlow.tsx`, does show the house technique: soft `createRadialGradient` fills, never strokes. A click now sends a diffuse front of light, and the front's position is expressed by WHICH glyphs are lit — nothing is drawn in empty space. The glyphs are punctuation only (never legible words) in the accent colour with a shadow, so they read as glow rather than as stray characters. Measurement never reads the canvas itself: a canvas is a replaced element, so its own rect reports the BITMAP size, and the first version's measure→multiply→write-back loop inflated a 1000×742 area to a 25973×13013 bitmap (≈1.3 GB) while looking mounted and visible. Two budgets: 30 fps while a ripple is alive, 6 fps when idle. Reduced motion gets one static frame, the pointer listener is passive and non-interfering, and the mutation path never reads layout.*



**问题。** 字体栈里 `--font-sans-fallbacks` 以 `system-ui` 开头，而它对中文同样有效，于是**系统字体在思源黑体之前命中**：内嵌的、做过 `avar` 字重校准的 CJK 面色其实一直没轮到。

**做法。** 一条只改字体顺序、不动字体本体的动态 CSS（`fonts.js` 的 `preferredCjkStackCss`）：

| 目标 | 做法 |
|---|---|
| 中文先命中校准面 | 在 `body` 上**重新声明完整**的 `--font-anthropic-{sans,mono,serif}` 组合：`anthropic-sans → anthropic-cjk → 原系统回退尾`；Mono 与 Serif 同理（Serif 用 `anthropic-cjk-serif`，首页问候语不会变黑体） |
| 为什么在 `body` 而不是 `:root` | 自定义属性里的 `var()` 在**声明它的元素**上就已求值并继承。只在 `:root` 改底层 fallback，已解析的 `--font-anthropic-*` 不会重算 —— 顺序看起来没变 |
| 大字体表不重建 | 动态块只有三条声明，绝不包含 `@font-face`；`FONT_STYLE_ID` 的 5 MB 面表始终只写一次 |
| 手选字体仍然优先 | 不动 `--dsh-font-family-text` / `--dsh-font-family-code`，也不写 `--dsw-font-family`，所以设置里的字体选择照旧胜过默认栈；system-fonts 的 `!important` 整体替换同样保留 |
| 关掉即回原顺序 | 显式 `false` 时该块**一字节都不发出**，样式表等于旧版；旧负载没有这个字段则默认**开启** |

**限制。** 这是**默认字体栈**的改动，不是对用户选择的覆盖：在设置里手选过字体（或由 system-fonts 选过）时，那个选择仍然生效，其中文回退也仍由那份选择决定。

## 双语设置 · Bilingual settings

设置行与插件清单跟随宿主语言，机制与 `plugins/usage-stats` 相同：

- `client/src/locales.js` 持有 `en` / `zh` 两个**扁平、键集相同**的字典（30 个键：`appearance.nav` / `appearance.intro` 是设置页的导航名与导语，`modeRow.*` 是主题模式那行与三个方块，其余 `accent.*`、`warmth.*`、`radius.*`、`elevation.*`、`refine.*`、`thinkingBlue.*`、`pasteFile.*`、`preferThemeCjk.*`、`enabled.*`）。两个已删除的复刻项不再有文案 —— 残留一条字符串就是在邀请别人把设置项加回来。
- 激活时 `ctx.locale.register('dsh-cds-theme', { en, zh })`；槽位注册带 `locale: 'dsh-cds-theme'`，outlet 把 `t(key, params)` 作为 prop 注入并在切语言时重渲染整行。「外观」分区的 `label` 是同样的 `t` 包成的 **thunk**，导航每次重解析都会重新调用它，所以切语言时连侧栏那一项的名字都会跟着变。
- `locale/en.json` / `locale/zh.json` 只承载插件清单的 `meta.title` / `meta.description`（Plugin Manager 不激活插件也会读它们），两边的键集完全一致。
- 没有 `t` 的场合（单测、没有 locale 服务的宿主）回退到**完整的英文表**，不会渲染原始 key。
- 中文界面不出现英文文案，英文界面不出现中文文案；旧的 `中文 · English` 混排字符串已全部删除。

*The rows and the plugin-inventory copy follow the host language exactly like usage-stats: flat en/zh dictionaries with identical key sets, `ctx.locale.register`, and `locale: 'dsh-cds-theme'` on the slot registration so the outlet injects `t` and re-renders on a switch. `locale/*.json` carries only the inventory `meta.*`; the two locales have identical key sets. A missing `t` falls back to the complete English table, never to raw keys.*

## 安全升级 · Upgrade safety

组件规则只命中宿主**有意暴露**的钩子：

*Component rules only touch hooks the host **deliberately** exposes:*

- `data-*` 属性：`[data-composer-card]`、`[data-composer-input]`、`[data-code-block-banner]`、`[data-menu-material]`、`[data-chat-flow]`、`[data-shimmer]`、`[data-shimmer-decoration]`、`[data-cds-greeting]`（插件自有）、`[data-cds-table]`（插件自有）
- 宿主刻意公开的字面量类：`.md-code-block`
- 宿主自己的中间变量：`--dsl-code-block-*`
- 宿主槽位锚点：`[data-slot="conversation.hero.workspace"]`、`[data-slot="conversation.input.dock"]`、`[data-slot="conversation.hero.brand.mark"]`

**不碰哈希类**（`.RlGAzG_card`、`._markdown_1ypvv_5`）—— 它们每次宿主构建都变，命中失败还静默无报错。没有稳定钩子的组件（侧栏根、用户气泡）走令牌或干脆不动；表格滚动容器这类「必须改但没有钩子」的元素用结构标记 + 自有属性（`data-cds-table`），绝不猜哈希。

*No salted CSS-module classes — they re-hash every build and fail silently. Components without a stable hook go through tokens or stay untouched; an element that must be styled but has no hook (the table's scroll wrapper) gets a structural mark with the plugin's own attribute (`data-cds-table`) instead of a guessed hash.*

升级后若某个组件样式错位，把「组件细化」关掉即可恢复配色与排印而丢掉细化，不必卸载。

*If a component mis-renders after a host update, turn **Refinement** off — colour and typography stay, the refinement drops, no uninstall needed.*

## 安装 · Install

```bash
cd plugins/cds-theme && npm ci && npm run build && cd -

dsh plugin --profile desktop add link:C:/Users/17445/Desktop/HwFee-dsh/plugins/cds-theme
```

装完**完全退出并重开 DSH**（新插件要在启动时装入 profile；字体本体已内联进 bundle，不依赖 Host 路由）。移除：

*A full restart is required for a new install (the plugin is loaded into the profile at startup); the font bytes are inlined in the bundle, so they do not depend on the Host routes. To remove:*

```bash
dsh plugin --profile desktop remove dsh-cds-theme
```

## 开发 · Develop

```bash
npm test          # 产物新鲜度 + 336 个单测 / 17 个套件 · freshness check + 336 unit tests over 17 suites
npm run build     # client/src/* -> client/client.js
npm run verify    # 打印字体/排印/问候语/双语/设置页/主题模式/导航图标/微光+主开关/B 组常驻/已验收常驻的代码块与正文规则证据表 · prints the evidence tables
```

**命名与图标**：`appearance.nav` / `appearance.intro` 在两个语言里都是**与宿主「外观 / Appearance」那一行不同**的词（`主题定制` / `Theme`）；图标侧：markup 的每个属性（`viewBox 0 0 16 16`、`fill="none"`、`stroke="currentColor"`、圆角端帽/连接、`aria-hidden`）、两档描边**只差 `stroke-width`**、只有 `currentColor` 一种着色、字形是「两个同心圆角方框」（唯一的两种图元都是 `rect`，五个宿主导航图标里一个 `rect` 都没有；三条轨道那个母题属于「插件」，已被回归测试封死）、`assets/appearance-icon.svg` 与代码逐字节一致、构建产物内联了 path 数据且**不含任何 `file://` 或绝对路径**；marker 侧：按标签找到按钮（中英任一）、忽略其它导航项、忽略「只有标签没有 `<svg>`」的宿主行、插入后隐藏宿主图形（节点仍在原位）、二次 sweep 不重复写入、语言切换后靠标记仍认得按钮、20px 档跟随宿主尺寸、`stop()` 还原宿主的**原 `display` 值**并清空所有标记、设置弹窗晚于插件挂载时会靠 observer 补一次、没有导航时不写任何东西。

*Naming and icon coverage: both locales use a word distinct from the host's own 「外观 / Appearance」 row; the icon markup carries every host-icon attribute (`viewBox 0 0 16 16`, `fill="none"`, `stroke="currentColor"`, round caps/joins, `aria-hidden`), the two rungs differ ONLY in `stroke-width`, only `currentColor` is used, the mark is three straight tracks plus three equal knobs (no arcs, no `rect` — which rules out the gear and the sun/moon), the `assets/` SVG equals what the code draws byte for byte, and the artifact inlines the path data with no `file://` or absolute path. The marker finds the button by label in either language, ignores other entries and a label-only row, inserts before the host glyph and hides it in place, writes nothing on a second sweep, still recognises the button after a language switch, follows a 20px host rung, restores the host's ORIGINAL `display` value and clears every mark on dispose, catches a settings dialog that mounts later via the observer, and writes nothing when there is no nav.*

**主题模式与宿主行隐藏**：store 读的是 `preference` 而不是解析后的 `active`（否则「跟随系统」永远不亮）、未知值回落到 `system`、`setPreference` 只接受三个 id 且**只写一次**、宿主 `setTheme` 抛错时返回 `false` 并 warn（不伪造成功、持久值不变）、写与外部 `theme/change` 都会通知订阅者、一个订阅者抛错不影响其余；行侧：三个方块的值/文案顺序、`aria-pressed` 逐值跟随持久化偏好、点击调用宿主写入、外部变更后重新渲染（组件不持有自己的副本）、**`system` 下操作系统翻转明暗时被唤醒但选中方块仍是「跟随系统」**、偏好被钉住时宿主不发事件且行不受影响、**没有服务时整行不渲染**、中英各出各的文案；隐藏规则侧：**恰好一条**规则默认存在且 body 为 `display: none !important`、**`:has()` 必须挂在行上（`> *:has(`）绝不能在出口上**（否则整页消失）、没有服务时**恰好**少这一条且其余规则逐字节不变、`refine=false` 时仍在、不含任何盐化类名；fixture 侧：命中宿主方块行、**不命中**字号组 / 三个菜单行（`aria-haspopup`）/ 普通开关行 / 本插件 `enabled` 开关；以及那条要长期保留的**反证**：同一形状若注册进「通用」会命中我们自己的行 → 所以槽位作用域是承重的，谁把作用域「简化」掉这条测试就会红。

*Coverage for the theme-mode work: the store reads the persisted `preference` (not the resolved `active`), falls back on unknown values, rejects anything outside the three ids, writes exactly once, reports a throwing host write instead of faking success, notifies on both its own write and an external `theme/change`, and survives a throwing subscriber; the row renders the three cubes in the host's order with the host's words, tracks the persisted preference through `aria-pressed`, calls the host write path on click, re-renders after an external change (it holds no copy of its own), is woken by an OS flip under `system` while keeping 跟随系统 selected, is untouched when the preference is pinned, renders nothing without the service, and is bilingual; exactly ONE hide rule exists by default with `display: none !important`, pins that `:has()` sits on the ROW (`> *:has(`) and never on the outlet — which would blank the page — vanishes exactly when the service is absent with every other rule byte-identical, survives `refine=false`, and names no salted class; and the fixture proves it matches the host's cube row while matching none of the font group, the three menu rows, a plain toggle row, or our `enabled` switch. The reverse proof — the same shape would match if registered inside General, so the slot scope is load-bearing — is kept deliberately: it fails the moment someone simplifies the scope away.*

**A 档与 B 档复刻批次（七个开关）**：每一项都断言 `off` **恰好**移除它自己那一段、其余样式表逐字节不变（用抓取的原文重建期望的样式表来比，而不是列举选择器）；七项都不改任何令牌（`buildTokens` 逐一相同）；`test/rule-baseline.mjs` 里钉住了每一段的原文，改一个字符就红；同心圆角是例外 —— 它不是新增规则而是覆盖 `[data-menu-material]` 的 `border-radius`，所以断言的是「只有这一个声明变了」，并且 `off` 必须回到 `--dsw-radius-lg`、on 必须是 `calc(--dsw-radius-sm + 4px)`，同时验证 8 + 4 = 12 在 100% 时与已验收值相同、在更大比例下两者才分叉；三条曲线令牌在 `buttonSpring=false` 与 `refine=false` 下都必须仍在，而按压过渡必须消失；按钮弹簧的每一条选择器都必须是本插件自己的 `.dct-*`（不得出现宿主 markdown 类名）；状态点的那一段必须带 `prefers-reduced-motion: reduce` 且关掉时整段消失；六段都不得出现盐化类名或写死的调色板颜色。

**设置页**：分区注册形状（`name` / `id: appearance` / `order: 1` / `locale` / 子账本声明）逐字段断言；`label` 是 thunk 且 en/zh 各出各的词、同一个 options 换字典即换名；页面组件确实通过注入的 `renderSlot` 渲染子账本（intro 在上、账本在下）、没有 `renderSlot` 时只 warn 不崩；**行迁移**：九个外观行全部落到 `settings.appearance.item`、`settings.general.item` 只剩 `enabled`、两侧 id 不重叠、行序是 10/18/19/22/24/26/29/39/43 与 30、每行保留原组件与 `locale`；**降级**：没有 `settings.section` 账本时十行全部回通用并 warn 一条、`register` 被拒时同样回落且不留空页、分区注册了却没声明子槽位时把它撤掉再回落、完全不给分区定义时保持加分区之前的行为、设置外壳迟迟不出现时 3 秒上限后回落、等待期内的分区一出现就取消等待并接管、回落后迟到的子槽位声明不会重复注册；`dispose` 撤掉分区 + 全部行 + 计时器。

单测覆盖：令牌全部是 `{light,dark}` 对、**两套配色下每个前景/背景组合都达到 WCAG AA**（含四个强调色预设与其 hover 态）、明暗 hover 方向、圆角缩放、阴影 alpha 缩放、样式表不含哈希类、不变量、`refine=false` 与 `enabled=false` 的降级行为；字体文件存在且是 WOFF2、6 个 `@font-face` 的族名/字重轴/`src` 回退顺序、字体栈与参考逐字一致、构建产物内联 6 个 data URL 且不含机器路径；**双 `<style>` 拆分**：字体块缓存且只写一次、设置变更只重写规则标签（假 DOM 统计 `textContent` 写入次数）、`buildCssFor` 输出逐字节不变、**主开关关闭时字体标签保留而只清空规则标签**、重新开启不重建字体、卸载两个标签都移除；**主开关收敛**：宿主同步发布 `theme/change`、插件监听者的重入被守卫（`false→true→false→true` 不抛错、每次开启只有一个活动层、注册次数有界、每次切换最多写一次规则标签）；排印 130 个令牌逐个对参考表、明暗只差字重、13 级 UI 阶梯全部映射、24 个元素的「元素→字重」表逐行对参考行号、不可寻址元素不虚构载体、所有字重落在 `wght 300–800`、`tabular-nums`、问候语 display 行（38/1.2/330/opsz 48）逐字；问候语结构定位（含 usage-stats 挪动 dock、无会话无 dock、结构不符降级）、幂等与卸除清理；思考微光规则只命中 `[data-shimmer-decoration]`、渐变/透明度/模糊/`--cds-ease-pulse` 与「不动几何」不变量；**B 组效果常驻**：`refine` 为真时悬停显现与滚动渐隐规则无条件发出（同样的 3 + 3 条、选择器/曲线/alpha 阶梯不变）；`refine=false` 时整组消失；旧负载里残留的 `revealActions` / `scrollFades` 字段被 `sanitize()` 忽略且不影响任何输出；**已验收并删除的开关**：`codeBlockDetails` 与 `markdownBody` 不再是状态（`DEFAULT_STATE` / `sanitize()` 里都没有），携带它们的旧负载被丢弃且发出**逐字节相同**的样式表，`styles.js` 里也没有任何读取它们的分支；行号规则已随 `data-line-numbers` 删除 —— 宿主只在自身 `numbered` 变体上挂该钩子，聊天代码块不可达；`desktopTitlebar` 开关已整体删除，旧负载里的该字段被 `sanitize()` 丢弃且不产生任何规则；**思考标签开关**默认关闭、旧负载 tolerated、只换 2 个令牌（标签 + shimmer）且其余令牌逐一相同、两态都通过 `assertPairs`、切换会重新注册令牌层但不改任何 CSS；没有任何设置（含旧 `keepBrandBlue` 负载）会切换强调/品牌蓝轨；en/zh 键集一致且纯语言、面板文案全部走 `t`、清单 JSON 完整；Host 半边注入 `file://` 基址；字体路由**已删除**（分支不可达），故测试反向钉住：产物必须内联全部 6 个 face，且 `client.js` 与 `fontSourcesFor` 都**不得再出现** `/dsh-cds-theme/fonts/`；**Markdown 正文**：标记只在 `[data-chat-flow]` 内命中表格滚动容器（table 是唯一元素子节点的父元素），流外表格与「父元素不是专用容器」的布局都不标记，重复扫描不写 DOM、离开流后的陈旧标记会被清掉、`stop()` 清空全部标记并断开 observer，observer 只对可能含表格的新增节点重扫（纯文本变更不触发）；两套规则块（代码块细节 6 条、Markdown 正文 10 条）**常驻发出**，`test/rule-baseline.mjs` 与删除前抓取的原文**逐字节比对**（改一个字符就红），`refine=false` 时整项消失、`enabled=false` 无样式表、规则不含任何宿主表格类名。

*The replication batches: for each of the seven switches, `off` removes EXACTLY its own emitted block and leaves the rest of the sheet byte-identical (the expected sheet is rebuilt from the captured block rather than compared selector by selector); none of the six moves a token; each block is pinned verbatim in `test/rule-baseline.mjs`; the concentric item is the exception — it overrides one declaration rather than adding a rule, so the test asserts that exactly `border-radius` differs, that `off` restores the pinned literal, that `inner + inset` reproduces the approved value at 100% and diverges as the slider moves; the three curve tokens survive both `buttonSpring=false` and `refine=false` while the press transitions do not; every button-spring selector is one of this plugin's own `.dct-*` classes; the status block carries its `prefers-reduced-motion` escape and leaves with the item; and no block names a salted class or a hard-coded palette colour.* *Coverage: every token is a `{light,dark}` pair; every foreground/background pair meets WCAG AA in both palettes; the **settings-page registration** (name/id `appearance`/order 1/locale, the child-ledger declaration, the locale-following label thunk in both languages, the body rendering that ledger through the injected `renderSlot`, and the warn-not-crash path when it is absent), the **row migration** (all eight appearance rows on `settings.appearance.item`, only `enabled` left on `settings.general.item`, no overlap, orders 18/19/22/24/26/27/28/29 + 30 unchanged, components and locale intact), and every **fallback** (no section ledger, a refused registration, a section that never declares its child slot, no section definition at all, the bounded wait expiring, the section arriving inside the wait, and a late child declaration not double-registering); font files, `@font-face` declarations, the inlined data URLs and the fallback ordering; the reference stacks verbatim; the **two-`<style>` split** (cached static font block written once, a settings change rewriting only the rules tag — counted through a fake DOM's `textContent` writes — byte-identical `buildCssFor` output, **the fonts tag surviving `enabled=false`** while only the rules tag is emptied, no font rebuild on re-enable, teardown removing both); the **master switch converging** (the host publishes `theme/change` synchronously, the listener re-entry is guarded: `false→true→false→true` never throws, exactly one active layer per ON, bounded registrations, at most one rules-tag write per flip); all 130 typography tokens against the reference tables; all 13 UI-chrome steps mapped; the 24-row element→weight table checked line by line, with not-addressable elements documented instead of invented; every weight inside the `wght 300–800` axis; `tabular-nums`; the greeting display row (38/1.2/330/opsz 48); the hero structure lookup including every degradation path; the shimmer rule's hook-only selector, gradient/opacity/blur/`--cds-ease-pulse` and its untouched-geometry invariant; the **B-group effects unconditional under `refine`** (both 3-rule sets — the reference swift curve + secondary action colours with host geometry untouched, and the `[data-step-process-body][data-scroll-*]` 24px multi-step alpha masks with no mask at an attribute-less edge and `data-overflow-below` deliberately untouched — are emitted for every setting combination, disappear with `refine=false`, and retired `revealActions`/`scrollFades` payload fields are ignored); the **removed per-item switches** (`codeBlockDetails` / `markdownBody` are no longer state: `DEFAULT_STATE` and `sanitize()` do not carry them, a legacy payload with either field emits a byte-identical sheet, and no branch in `styles.js` reads them); code-block line numbers deliberately absent (the host only mounts `data-line-numbers` on its own `numbered` variant); the retired `desktopTitlebar` switch stays retired and emits nothing from a legacy payload; **the thinking-label switch** (2 tokens only — label + shimmer — every other token identical, `assertPairs` in both states, no CSS change at all); no setting flips the accent/brand blue track; en/zh key parity and purity, every visible row string going through `t`, the inventory JSONs; the Host half publishing the `file://` base and serving real WOFF2 bytes over its routes; and the **markdown body** (the marker only inside `[data-chat-flow]`, a table's sole-element-child wrapper as its parent, out-of-flow tables and non-wrapper layouts skipped, idempotent sweeps, stale marks removed, `stop()` clearing every mark and the observer, a pure-text mutation not re-triggering a scan; both rule blocks — 6 code-block-detail rules and 10 markdown-body rules — are emitted unconditionally under `refine`, pinned BYTE-IDENTICALLY against the pre-removal sheet by `test/rule-baseline.mjs`, `refine=false` drops them, `enabled=false` emits no sheet, a legacy `false` is dropped and changes nothing, and no host table class is named anywhere in the sheet).* (both 3-rule sets — the reference swift curve + secondary action colours with host geometry untouched, and the `[data-step-process-body][data-scroll-*]` 24px multi-step alpha masks with no mask at an attribute-less edge and `data-overflow-below` deliberately untouched — are emitted for every setting combination, disappear with `refine=false`, and retired `revealActions`/`scrollFades` payload fields are ignored); the **per-item replication switch** (`codeBlockDetails` removes exactly its 6 banner/disclosure rules — reference Mono 10.5/12/500 uppercase .05em label, title reset, the half-pixel banner seam, 12/16/500 disclosure row — all keyed on `[data-code-block-banner]` / `[data-disclosure-header]`; it lives under `refine`, leaves every other rule byte-identical, re-registers no token layer, rebuilds no font sheet, and old payloads without the field default to on; the line-number rules are gone because the host mounts `data-line-numbers` only on its own `numbered` variant, which the chat renderer never enables; the deleted `desktopTitlebar` switch's legacy payload field is dropped by `sanitize()` and emits no rule); the **thinking-label switch** (default off, old payloads tolerated, exactly 2 tokens swapped — label + shimmer — every other token identical, both states pass `assertPairs`, re-registers the layer without touching any CSS, and no setting — including a legacy `keepBrandBlue` payload — switches the accent/brand blue track); en/zh key parity and purity; and the Host route serving real WOFF2 bytes. **Markdown body**: the marker only marks table scroll wrappers inside `[data-chat-flow]` (the parent whose only element child is the table), never tables outside the flow and never a layout whose parent is not a dedicated wrapper; repeated sweeps write no DOM, a stale mark is removed when its table leaves the flow, `stop()` clears every mark and disconnects the observer, and the observer re-sweeps only for added nodes that can contain a table (text mutations do not); `markdownBody` off removes exactly its 8 rules (frame / header / three inset rules / last-row hairline / tabular numerals / quote rhythm) with every other rule byte-identical, disappears with `refine=false`, emits nothing with `enabled=false`, defaults on for legacy payloads, changes no token, and the sheet names no host table class.*

## 已知限制 · Known limits

- **有 17 个参考元素没有可寻址的 DSH 载体。** 宿主把这些元素的字重硬编码在盐化 CSS Modules 里（思考触发器 `font-weight:400`、输入区选择器 `13px/500`、附件名 `14px/500`、快捷键键帽 `11px`、primitives 按钮/弹窗/分段标签等），没有字体令牌也没有稳定 `data-*` 钩子。主题**不猜钩子**：这些元素在 `ELEMENT_WEIGHTS` 里标为 `not-addressable` 并在上表列出参考值，等宿主暴露令牌后再接。助理身份名在 DSH 里根本不存在（`none`）。*Seventeen reference elements have no addressable DSH carrier — the host hard-codes their weight in salted CSS Modules with no font token or stable `data-*` hook. They are listed as `not-addressable` with the reference value instead of being approximated; the assistant identity name does not exist in DSH at all.*

- **正文/标题的字距（letter-spacing）无法对齐参考。** 参考仓库只在一个场景规定了字距（工件语言标签 `letter-spacing: 0.05em`）——这个场景现在**已经可达**：宿主的横幅发布了 `[data-code-block-banner]` 钩子，`codeBlockDetails` 开关就用它下发 10.5px/12、500、大写与 `.05em` 字距。正文与标题参考本身没有字距规范，宿主也没有对应的字体令牌，所以主题不下发全局字距——设置里的「字距」滑块 0 即宿/主题原值，只有手动拖动才会偏离。*The only reference letter-spacing case (the artifact language tag, 0.05em) is now reachable via the published `[data-code-block-banner]` hook and is applied by `codeBlockDetails`; body/title tracking has no reference spec and stays host-owned.*
- **C13 的字体栈裁定被有意推翻。** `docs/cds-spec.md` 当初按「仓库里没有真实 Anthropic 字体」裁定删掉 `anthropic-*` 候选、只留系统回退。本插件现在**真的内嵌**了 6 个可变字体，所以保留参考原始字体栈（`css:205-213` 逐字）才是正确的。*C13 assumed no binary faces existed; this plugin ships them, so the reference stacks stay verbatim.*
- **暗色字重取 460 / 550。** `docs/cds-spec.md:706-708`（C15）倾向 P0 样式表的 465 / 560；本实现按参考表格 `:391-394` 与任务要求取 460 / 550（≤10 刻度的差异）。**Bold 取 660 / 660**：参考该行两列都是 `"wght" 660`，可变字体按轴值写。*C15 prefers 465/560; this ships the v1-01 table's 460/550 (≤10 units). Bold is 660 in both palettes per the axis column.*
- **CJK 回退链是参考的 macOS 族名。** Windows 上 `PingFang`/`Hiragino`/`Apple SD Gothic Neo` 都不存在，中文会落到 `sans-serif` 系统默认 —— 这是参考自身的栈，照抄不改成 Windows 族名。*The CJK rungs are the reference's macOS names; on Windows they fall through to the system default, exactly like the reference.*
- **问候语按参考换掉宿主的 26px/500。** 参考把首屏问候定为 38px / 1.2 / wght 330 的衬线 display；若宿主未来的 hero 结构不再匹配（无 brand-mark 槽位、hero 不再是栈首子元素等），标记会 no-op，标题停留在宿主原样。*The greeting replaces the host's 26px/500 with the reference display type; if the layout stops matching, the hook degrades to no change.*
- **宽表（≥4 列）保留宿主的全出血布局。** 宿主给宽表的滚动容器加了负 `margin-left` 与等量的 `padding-left`，把表格借到正文列两侧的空白里（`.v5IAXa_body .md-table-wide`），给横向滚动留出视野。边框画在容器外缘，所以**宽表的框会比正文列宽**——这是宿主的设计，主题只画框、不改它的尺寸或内边距。*Wide tables (4+ columns) keep the host's full-bleed layout: the host borrows the empty space on both sides of the text column with a negative margin and matching padding. The frame follows the wrapper's outer edge, so a wide table's frame is wider than the prose column — the host's design, which this item does not resize.*
- **表格标记是结构性的。** 它要求表格位于 `[data-chat-flow]` 内、父元素是「唯一元素子节点就是 table」的滚动容器。宿主若把表格直接渲染进 Markdown 根，标记会跳过（不会误给整条消息套框），表格回到宿主原样；`[data-chat-flow]` 之外的表格永远不标。*The table mark is structural: in-flow table, parent whose only element child is the table. A host that renders tables straight into the markdown root is skipped (never a whole-message frame), and tables outside the flow are never marked.*
- **字族默认是 Anthropic，但用户选择优先。** 两个字族令牌走宿主自己的偏好变量（`var(--dsh-font-family-text, …)` / `var(--dsh-font-family-code, …)`），所以在 Settings 里选的字族会赢；字重则完全由本主题决定（font 插件的权重旋钮已移除），不存在第二个所有者。*Families route through the host's own preference variables, so a family picked in Settings wins; weights are owned solely by this theme now that the font plugin's weight knob is gone.*
- **字体本体是构建时内联的 data URL。** 代价是 `client/client.js` 约 1.0 MB（6 个 woff2 约 660 KB → base64 约 880 KB）；换来的是 `dsh-app://`、http(s)、`file://` 三种 origin 下都能加载。重建 bundle 后刷新页面即可，字体不需要 Host 路由或重启。*The faces are inlined as data URLs at build time (~1.0 MB bundle for ~660 KB of woff2): the price of loading on `dsh-app://`, http(s) and `file://` alike. Rebuild and refresh; fonts need no Host route or restart.*
- **思考微光不改宿主扫光几何。** 规则只替换装饰层填充、透明度、模糊与缓动曲线；扫光的 `transform` / 时长 / 遮罩全部留给宿主。宿主若移除 `[data-shimmer-decoration]`，规则静默失配，标签回到宿主的实心扫光，主题其余部分不受影响。*The shimmer rule only replaces the decoration fill, opacity, blur and easing; the sweep's transform/duration/mask stay the host's. If the host drops the hook the rule simply never matches.*
- **`.md-code-block` 是字面量类。** 宿主目前有意公开它，但仍属内部实现；若将来改成哈希，代码块细化会静默失效（配色令牌不受影响）。*`.md-code-block` is a literal class the host currently exposes on purpose; if it ever becomes a hash, code-block refinement silently stops (the colour tokens are unaffected).*
- **代码块行号 —— 宿主只在自身的 `numbered` 变体上挂 `data-line-numbers`，聊天里的普通 markdown 代码块不渲染行号，因此主题不提供行号样式（也不伪造）。** *Code-block line numbers — the host mounts `data-line-numbers` only on its own `numbered` variant; ordinary markdown code blocks in chat render no line numbers, so the theme ships no line-number styling (and does not fake them).*
- **字号刻意留在「通用」，不是漏搬。** 「字号大小」组**不搬、不藏、不重建**，这是**用户的明确决定**（用户对负责人单独说明过：字体组不要动）。这一条要按决定来读，不要当成本项的遗留缺口：本项只重建了浅色/深色方块，字号仍由宿主原样提供在「通用」里。因此 `themeModeRules()` 里**只有一条规则**（方块行），不要为了「统一」再去加字号那条 —— 那会删掉一个用户明确要保留的设置入口。*Font sizing deliberately stays in 通用 — this is the user's explicit decision, not an omission. This item rebuilds only the light/dark cubes; the 字号大小 group is neither moved, hidden nor rebuilt. `themeModeRules()` therefore contains exactly ONE rule (the cube row); do not add a second one "for consistency" — that would remove a setting the user asked to keep.*
- **「主题模式」在 `system` 下跟随系统翻转，但选中的永远是「跟随系统」。** 宿主的 `ThemeRuntime` 构造器里那个 `prefers-color-scheme` 监听器是 `if (this.preference !== "system") return; this.publish()`（`ui-theme`，注释「prefers-color-scheme listener」），所以**偏好为 `system` 时操作系统换明暗会重新发布 `theme/change`**，本行被唤醒后重读 `preference` —— 仍然是 `system`，选中的方块不变（变的是解析后的主题，不是用户的选择）。偏好被钉在 `light` / `dark` 时宿主那个监听器直接 return，不发事件，本行也不受影响。两种情况都有测试钉住。*Under `system`, an OS light/dark flip re-emits `theme/change` (the host's media listener publishes only when `preference === 'system'`), so the row is woken and re-reads `preference` — which is still `system`, leaving 跟随系统 selected: a media flip changes the resolved theme, never the choice. With a pinned preference the host emits nothing and the row is unaffected.*
- **「主题模式」与宿主那行是同一个偏好，但隐藏是单方面的。** 本插件藏起宿主那一行、把三个方块重建在自己的页面上，两边都写 `theme.setTheme(id)`，所以**状态**不会分叉；但如果宿主将来给那一行加上本插件没料到的控件（比如新的偏好值），隐藏就会把那个新控件一起藏掉 —— 因为选择器是按「一行里有 `aria-pressed` 方块」判定的。`setPreference` 只接受 `light` / `dark` / `system`，宿主新增的值既不会被写坏，也不会出现在我们的行里。*The two rows share one preference through `setTheme`, so state cannot fork; but the hide is one-sided — a future host control added to that row would be hidden along with it. Only the three known ids are accepted, so a new host value can never be written, but it also would not appear in our row.*
- **「主题定制」页是延迟注册的。** `settings.section` 由设置外壳声明，外壳的挂载时机不保证早于本插件，所以分区那条路带一个 3 秒上限的等待；超过就回落到通用列表并 warn 一条。极端情况下（设置外壳在插件加载 3 秒后才出现）用户会看到行在通用里、没有「主题定制」页 —— 这是有意的降级，不是半成品：行永远只在恰好一个被渲染的槽位里。*The section rides the settings shell's declaration, whose mount order is not guaranteed, so that path has a 3 s bound and falls back to the General list with a warning. In the extreme case (the shell appearing later than that) the rows are simply in General and there is no Theme page — a deliberate degradation, never a half state.*
- **导航图标是一次 DOM 写入，不是注册能力。** 宿主的 `navIcon(id)` 是硬编码 if-chain，槽位注册没有图标字段，所以本插件只能按标签找到侧栏按钮、插入自己的 `<svg>` 并把宿主那颗设为 `display:none`。宿主若把导航改成虚拟列表、换掉按钮结构或把标签本地化成第三种语言，标记就找不到按钮 —— 那时宿主的齿轮原样保留（不会坏，只是没换）。图标不参与无障碍树（`aria-hidden`），可访问名始终来自标签文本。*The nav icon is one DOM write, not a registration capability: the host's `navIcon(id)` is a hardcoded if-chain with no icon field on a slot registration, so the plugin finds the button by its label, inserts its own `<svg>` and hides the host's with `display:none`. A host that virtualises the nav, changes the button shape or localises the label into a third language simply leaves its own gear in place (degraded, never broken). The icon is `aria-hidden`; the accessible name stays the label text.*
- **不改栏宽与侧栏内边距。** 它们是 JSX inline style 并与拖拽动画耦合，CSS 强改会破坏交互。*Column widths and sidebar padding are JSX inline styles coupled to the drag animation — CSS overrides break the interaction.*
- **不接管组件动效。** 宿主用 Framer Motion 弹簧，CSS 够不着；主题只换缓动曲线与时长令牌，不伪造弹簧。*Component motion runs on Framer Motion springs, unreachable from CSS.*
- **文档区选色仍是蓝色。** 这是刻意的：陶土色选区压在陶土色文字上不可读，且用户对选区颜色有系统级预期。*Text selection stays blue on purpose.*
- **首页波纹只在空白会话，且它撑不住“全程可见”。** 效果挂在 `[data-content-phase="hero"]`，进入对话即停循环并清空画布。波纹在**输入卡那一段**是否看得见，取决于卡片的 82% 半透明之外还剩多少背景对比：深浅两套配色都测过，但如果你自己把「表面暖度」压到 0（宿主冷灰）同时把强调色换成石墨，波纹经过卡片时可能淡到看不出——那是配色组合的问题，不是效果没运行。*Blank sessions only: entering a conversation stops the loop and clears the canvas. Whether the wave reads THROUGH the composer card depends on how much contrast the 82% card leaves over the chosen palette; at warmth 0 plus the graphite accent it can be too faint to see — a palette combination, not a dead effect.*
- **首页波纹的层叠依赖两条声明同时成立。** body 上的 `isolation: isolate` 与画布上的 `z-index: -1` 是一对：`isolation` 让 body 成为层叠上下文，`z-index: -1` 才落在“背景之上、内容之下”。宿主若把 `[data-conversation-content]` 改成自带背景色，画布会藏到那层背景后面（效果消失但不报错）；若删掉 `isolation` 而保留 `z-index: -1`，画布会沉到整列背景之后——同样是静默消失。两条规则都在 `heroRippleRules()` 里，改动时必须一起改。*The layering needs both declarations: `isolation: isolate` on the body and `z-index: -1` on the layer. A host that gives the body its own background hides the layer behind it, and dropping `isolation` while keeping `z-index` sends it behind the whole column — both silent, both in `heroRippleRules()`, which must be changed as a pair.*

## 参考 · Reference

- [`docs/cds-spec.md`](../../docs/cds-spec.md) —— CDS 规范，逐值附 `文件:行号`，含 18 处来源冲突的裁定表 *CDS spec with `file:line` citations per value and an adjudication table for the 18 source conflicts*
- [`docs/host-hooks.md`](../../docs/host-hooks.md) —— 宿主可覆写点勘察 *survey of host override points*
- [`.reference/open-claude-ui`](../../.reference/open-claude-ui) —— 参考项目（MIT，只读）*reference project (MIT, read-only)*
