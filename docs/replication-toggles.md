# 复刻项与开关约定 · Replication items ship with toggles

本仓库按**参考仓库逐项复刻**（`.reference/open-claude-ui`）。用户要求把这套工作方式固定下来：

1. **一项一项地做。** 每次只交付一个可指认的复刻项（例如"消息操作栏悬停显现"、"滚动渐隐遮罩"、"热力图今天固定右下角"），不把多项打包进同一次改动。
2. **每一项都带一个自己的开关。** 开关放进对应插件的设置行（`dsh-cds-theme` 走「主题定制」页，`dsh-usage-stats` 走自己的设置行，`dsh-system-fonts` 同理），默认值 = 复刻后的样子，关掉 = 回到宿主原样。这样用户能逐项对照"复刻前 / 复刻后"。
3. **开关命名与文案双语**：zh / en 各一份，纯语言，不用 `中文 · English` 混排；键集必须对齐。
4. **开关只影响该项。** 状态键独立、sanitize 容错（旧配置读入不报错），并有一条测试钉住"这个开关只改它该改的东西"（例如两令牌开关就断言恰好 2 个令牌差异）。样式表类开关用**逐字节重建**的方式证明可逆：把捕获的规则块删掉重建期望值，断言 `off === expected`。
5. **代价要低。** 令牌级开关只重注册令牌（几 KB），不重建样式表；不要把 880 KB 的内联字体块拖进任何开关路径（见 `plugins/cds-theme/README.md` 的双 `<style>` 说明）。
6. **验收后删开关。** 用户确认某个复刻项"就是这个样子"之后，开关和它的状态键一起删掉，**规则留下并常驻**（默认态就是复刻态）。删开关时不要顺手改规则文本——`plugins/cds-theme/test/rule-baseline.mjs` 钉住逐字节内容，改一个字符就红。

**这条约定现在有机械检查。** `tools/audit.mjs` 的 `switches` 检查会读每个插件的 `DEFAULT_STATE` 与其设置行，断言**每个布尔状态键都有对应设置行**（否则用户没法对照，直接判失败），并打印每个插件的开关清单。它**刻意不检查反方向**：`key:` 在本仓库还用于 stat id、菜单项、tab id（`key: 'tokens'`、`key: 'models'`…），反查会误报 13 条；宁可漏报也不误报，理由写在检查函数里。

---

## 现行开关清单（2026-10-18，全部复刻项已固化）

### `dsh-cds-theme` —「主题定制」页（与「通用」同级的分区，id `appearance`，order 1）

| order | 行 id | 状态键 | 说明 |
|---|---|---|---|
| 10 | `dsh-cds-theme-mode` | —（读宿主 `theme.getTheme().preference`） | 主题模式：浅色 / 深色 / 跟随系统 |
| 18 | `dsh-cds-theme-accent` | `accent` | 品牌强调色（四预设） |
| 19 | `dsh-cds-theme-warmth` | `warmth` | 表面暖度 0–100 |
| 22 | `dsh-cds-theme-radius` | `radiusScale` | 圆角比例 0.5–1.5 |
| 24 | `dsh-cds-theme-elevation` | `elevation` | 阴影强度 0–200 |
| 26 | `dsh-cds-theme-refine` | `refine` | 组件细化（门控整组组件规则） |
| 29 | `dsh-cds-theme-thinking-blue` | `thinkingLabelBlue` | 深度思考提示用原版蓝（只切 2 个令牌） |
| 39 | `dsh-cds-theme-paste-as-file` | `pasteAsFile` | 长文本粘贴存为文件引用 |
| 43 | `dsh-cds-theme-prefer-theme-cjk` | `preferThemeCjk` | 中文优先用内嵌思源字体 |
| 44 | `dsh-cds-theme-hero-ripple` | `heroRipple` | 首页背景点击波纹（空白会话的字形场 + 水波） |

「通用」只留 `dsh-cds-theme-enabled`（order 30，`enabled` 主开关）。

**共 9 行 + 1 行主开关。当前在册的复刻项开关只有一个：`heroRipple`（44）。**

### 复刻开关的完整去向（10 项）

**在册（正在对比中）—— 1 项**

| 项 | order | 说明 |
|---|---|---|
| `heroRipple` 首页背景点击波纹 | 44 | **不是从参考仓库抄的** —— 参考仓库里没有这个效果的源码（只有静态环境光晕）。它还原的是 Claude Code 桌面版上线约一天的首页特性（[#102952](https://github.com/anthropics/claude-code/issues/102952)）：空白首页里问候语与输入框背后的发光代码字形，点击从光标处荡开圆圈。因为属于"按描述还原"而非"照着实现"，按本文件第 2 条它带着自己的对比开关。实现见 `plugins/cds-theme/client/src/ripple.js`，规则见 `heroRippleRules()` |

**固化（规则常驻，开关删除）—— 5 项**

用户看过并认可，按本文件的约定把对比开关删掉、外观成为默认：

| 项 | 外观 |
|---|---|
| `codeBlockDetails` | 代码块横幅语言标签（Mono 10.5/12/500 大写 .05em）+ 折叠行 |
| `markdownBody` | Markdown 表格的闭合发丝线框、表头着色、引用块节奏 |
| `markdownScope` | 助手正文的列表、任务列表、强调与链接；设置行与状态键已删除，随组件精修固定生效 |
| `footnotes` | 脚注区 12/15 三级色 + 上方半像素线 + 上标等宽数字。**宿主对 `.footnotes` 没有任何样式**，这是它唯一的样式来源 |
| `statTypography` | 输入框统计胶囊与两个用量弹层的等宽数字 + dt/dd 阶梯 |
| `buttonSpring` | 本插件自有控件（`.dct-swatch` / `.dct-toggle` / `.dct-mode-cube`）按压的 15 阶弹簧 |

这三项**不在 `refine` 之下** —— 它们是本插件的排印与动效词汇，不是组件细化。`enabled` 是唯一能整体关掉它们的开关。

**删除（规则与开关一起移除）—— 4 项**

用户看不出差别，每项的实测原因：

| 项 | 原 order | 原因 |
|---|---|---|
| `attachments` 附件卡 | 31 | 我的圆角 10px、底色 `bg-layer-2`；宿主本来就用 **12px 和近白底** —— 差 2px 和一级色阶，实尺寸看不出来 |
| `statusPulse` 状态点呼吸 | 34 | 钩子是真的，但目标是鲸鱼图标，宿主给它 **`contain: strict`**，缩放动画被自己的容器裁掉 |
| `concentricRadius` 同心圆角 | 35 | 单条 `border-radius: calc(sm + 4px)`，**差 4px** |
| `disclosurePolish` 统一折叠体例 | 38 | 7 条里 6 条被宿主行高 `_row_k7ery_26` 吸收；第 7 条**凭空加了一条宿主没有的分隔线**，用户评价「难看的要死」 |

**已否决**：`segmentedThumb`（用户说「挺垃圾的」）。

order **27 / 28 / 31 / 32 / 33 / 34 / 35 / 36 / 37 / 38 全部断言空置**，防止被静默复用。

### `dsh-usage-stats`

| order | 行 id | 说明 |
|---|---|---|
| 40 | `dsh-usage-stats-panel-height` | 用量面板高度 240–520 |
| 41 | `dsh-usage-stats-units` | 数字单位：**一个开关**，开 = 万/亿，关 = K/M/B |

两行都优先注册到「主题定制」页（`settings.appearance.item`），3 秒内有界等待，主题页不存在时一起回落到「通用」。

**数字单位从三选一改成了开关。** 原来是「跟随语言 / 短式 K-M-B / 万-亿」三个分段按钮，用户看不懂「短式」是什么意思 —— 三个标签回答一个是非问题，其中「跟随语言」是唯一需要额外解释的状态，这本身就是它不该作为状态的证据。现在是一个开关，描述里两端都给了例子。

---

## 核对宿主钩子：只查 `lib/client.js` 会得出错误结论

这是本仓库最贵的一课，记在这里防止重犯。

应用界面的 DOM 由**两套**代码产生：

1. `plugins` 挂钩的 `@deepseek-ai/dsh-client-ui-*` 包 —— `lib/client.js`，共 **76 个**；
2. **`@deepseek-ai/dsh-web-frontend/dist/assets/index-*.js`**（约 940 KB）—— 应用外壳、通用组件、Markdown 渲染器都在这里。

我在验收轮里连续三次判断「某个 `data-*` 钩子不存在、规则是空的」，**全部是错的**：我只扫描了第 1 类。`data-disclosure-header`、`data-menu-material`、`data-footnotes` 都真实存在于第 2 类里（`index-*.js`，分别约在 639 KB / 649 KB / 846 KB 偏移处）。

**正确做法**：从 `app.asar` 提取时，路径前缀是 **`dsh/node_modules/@deepseek-ai/...`**（`dsh/` 后面还跟着 `node_modules`），并且**必须同时提取 `dsh-web-frontend/dist/assets/` 下的 js 与 css**。只提 `lib/client.js` 会漏掉外壳。

代价：基于错误结论我差点删掉四个**其实生效**的开关。最后是靠用户说「我关了那个按钮线就消失了」才回头查对的 —— **用户的观察优先于我的静态扫描**。


### `dsh-system-fonts`
5 行（内容/代码/终端字体 + 行距 + 字距），注册在「通用」，由 `merge.js` 搬进宿主字号折叠区内部。**不是复刻开关**，是功能行。

### `dsh-reasoning-effort`
1 行思考强度滑块。档位完全由提供商声明，未声明则整行不渲染。**不是复刻开关**。

---

## 待补开关的复刻项

截至本文件更新时**没有排队中的项**。参考仓库下一波可借鉴项见 `docs/reference-next-wave.md`，那里列出的 A/B 档已全部交付（A 档六项 + B 档两项），剩余条目要么需要宿主暴露新钩子，要么属于"自己造功能"而非"复刻参考"。

**例外与它的性质。** `heroRipple`（44）不是参考仓库里的一项，它复刻的是 Claude Code 桌面版自己上线过一天的首页效果。参考仓库只提供设计语言（暖灰表面、陶土强调色、弹簧曲线），效果本身是按公开描述重建的。因此它属于"新产品行为"，只应该作为**新增功能**评估，不要据此认为参考仓库还有未吸收的动效条目。
