# README 截图清单

本文件记录 `README.md` 引用的每一张截图：文件、拍的是什么、证明了哪个插件。
截图来自**真实运行的应用**（`dsh-app://` 渲染器，CDP `Page.captureScreenshot`），
不是示意图，也没有裁剪、遮挡或隐藏。

拍摄环境（2026-10-22）：

- 会话：真实新建的演示会话「六个插件演示」，模型 `DeepSeek-Flash`（= `magpie/qoder-cn/dfmodel`）
- reasoning effort 拍摄时 `High`；拍完已改回用户原本的 `Default`。因此 `screenshot-home-zh.png`
  底栏显示 `Default`（该图为还原后重拍），其余截图底栏显示 `High`（拍摄当时状态）。
- 提示只发了两条，没有让模型写文件或联网：
  1. 用卡片展示本周使用量（7 天条形图 + 总量）
  2. 给一段 6 行 Python 快速排序代码块，然后运行 `pwd`
- 主题 Light、语言 en（`screenshot-home-zh.png` 为临时切到中文后拍摄，拍完切回 en）
- 视口 1600 CSS px 宽，PNG 均为 1600 宽（个别为完整一屏 1240/1060/820 高）

## 新图（9 张，全部在 `assets/` 根下）

| 文件 | 画面里能看到什么 | 证明了哪个插件 |
|---|---|---|
| `screenshot-home-en.png` | 空白会话首页：英文主标题「Into the Unknown / Preview」+ 图标，下方统计面板（Sessions 166、Messages 28K、Total tokens 7B、Active days 6、Peak hour 4PM、Favorite model `qoder-cn/dfmodel`、年度活跃热力图、对比文案），再下方是输入框与模型标识 `DeepSeek-Flash High` | **dsh-cds-theme** 的首页 hero（标题与品牌图由该插件渲染）；**@hwfee/dsh-usage-stats** 的统计面板随首页图一起入镜 |
| `screenshot-home-zh.png` | 同一首页的中文版：「探索未至之境 / 预览版」、统计面板中文标签（总览/模型/全部/30 天/7 天、会话 168、消息 29K、总 token 7.1B、活跃天数、高峰时段、常用模型）、中文占位文案「描述你想要构建的内容」、右下模型标识 `DeepSeek-Flash Default` | **dsh-cds-theme** 的中文 hero 与整体界面语言；**@hwfee/dsh-usage-stats** 面板中文化（随首页图入镜） |
| `screenshot-plugins.png` | Plugins 页 Installed plugins 分组，六个插件逐行列名并带开关：Claude Design System Theme、Generative UI、Git Bash as default shell、Next Prompt、dsh-system-fonts、Usage statistics，全部为启用态；上方还能看到 Experimental plugins 分组 | 六个插件的**安装与激活**状态（列出 `dsh.bundle` 是否真的挂载成一行） |
| `screenshot-chat-card.png` | 演示会话里一条中文提示「用卡片展示本周使用量…」→ `Completed in 1m 8s` → 一张卡片：标题「本周用量・7 天」、指标「69.4 亿 tokens / 最近 7 天・截至 10-22」、7 根 clay 色柱（周五→周四）及轴标签、悬停读数「周日 10-18 24.1亿 tokens・7,182 条消息」、卡片下方一句结论；再往下是第二条提示、代码块和 `pwd` 输出 | **@hwfee/dsh-genui**（模型用 `render_ui` 画出的真实 React 卡片，运行在 `sandbox="allow-scripts"` 帧里）；卡片配色与圆角来自 **dsh-cds-theme** |
| `screenshot-code.png` | 第二条提示「再来一段 6 行 Python 快速排序代码块，然后运行 pwd」→ `Completed in 4s` → 一整块 Python 代码（`def quicksort(xs):` 起，语法高亮的 def/if/return/for/in 关键字、运算符），下方是正文「pwd 输出：C:\Users\17445\Desktop\HwFee-dsh。没有写任何文件。」 | **dsh-cds-theme** 的代码块样式（CDS 代码表面、圆角、语法配色、内边距）；代码内容是真实模型输出 |
| `screenshot-tools.png` | 展开的工具体验：`Completed in 4s` →「Ran commands」组里一条 `Print current working directory` 工具行，展开后是带 `$` 提示符的命令行 `$ pwd`，下面是真实 stdout（`Path` + `C:\Users\17445\Desktop\HwFee-dsh`）；同一屏还能看到 Think 行、代码块与 `pwd 输出` 结论 | **@hwfee/dsh-git-bash**（`run_shell` 工具卡：`$` 提示符、命令面、stdout 面均已生效，且是**成功**而非拒绝卡） |
| `screenshot-settings-theme.png` | 设置 → Theme：Theme mode 三段（Light 选中 / Dark / System）、Accent colour 四个色块（clay 选中）、Surface warmth 100%、Corner radius 100%、Elevation 100%、Component refinement 开关（开）、Thinking-label colour 开关（关），每行都有说明文字 | **dsh-cds-theme** 的主题控件（模式、accent、表面暖度、圆角、阴影、组件精修、思考标签配色） |
| `screenshot-settings-fonts.png` | 设置 → General 中展开的字体组：Font size 14 px、Text font `Anthropic Sans`、Code font `Anthropic Mono`、Inline code 12 px、Terminal font `Anthropic Mono`、Terminal font size 13 px、**Interface font `Anthropic Sans`**、**Interface size 14 px** | **dsh-system-fonts**（把内容/代码/终端三个宿主字体行加上自有的「Interface font / Interface size」放进同一个可折叠组里，按 order 排在字体行之后） |
| `predict-ghost.png` | 演示会话底部输入框为**空**时，里面出现一段浅灰色预测文字「用 python 运行一下 quicksort([3,1,2,5,4])，把输出贴出来验证」，与占位符不同色、未发送；上方是真实的卡片/代码块/`pwd` 输出 | **@hwfee/dsh-predict**（空输入框上的灰色预测文本；实测按 Tab 会把该句写进输入框，证明可接受而非截图产物） |

## 归档老图（7 张，在 `assets/archive/`）

以下旧截图已用 `git mv` 移入 `assets/archive/`，文件名保持原样，历史可追溯。
它们拍摄于 2026-10-19～20，早于本轮 UI 改动（代码块内边距、字体行、新卡片），
所以不再被 README 引用。

| 文件 | 说明 |
|---|---|
| `assets/archive/screenshot-chat.png` | 旧对话截图 |
| `assets/archive/screenshot-code.png` | 旧代码块截图 |
| `assets/archive/screenshot-settings.png` | 旧设置页截图 |
| `assets/archive/screenshot-zh.png` | 旧中文截图 |
| `assets/archive/screenshot-fonts.png` | 旧字体组截图 |
| `assets/archive/screenshot-en.png` | 旧英文截图 |
| `assets/archive/predict-ghost.png` | 旧 predict 浅影截图（新的同名图已放在 `assets/` 根下） |

## 已知限制

- **没有单独拍 usage-stats 面板的特写**：它就是空白会话首页上那块统计面板，
  已随 `screenshot-home-en.png` / `screenshot-home-zh.png` 入镜，不再重复。
- **predict 的浅影只在输入框为空时出现**（`plugins/predict/client/src/ghost.js` 的 `target()`
  要求编辑器为空），所以 `predict-ghost.png` 是空输入框状态，不是「打了半句话」。
  若以后改了这条规则，这张图需要重拍。
- **没有拍 Account 设置页**：该页显示余额与掩码手机号，为避免把账号信息带进公开仓库而跳过。
- 演示会话「六个插件演示」保留在用户侧栏里，未删除。
