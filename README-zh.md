[English](README.md) | **简体中文**

# HwFee-dsh

给 **DeepSeek Harness (DSH)** 做的六个插件：一套按 Claude Design System 重做的主题、一个换字体的插件、一张新对话页上的用量面板、生成式界面卡片、下一句预测，以及让 Git Bash 当默认 shell。

六个包互相独立，各自有自己的构建和测试，可以只装一个，也可以随时关掉或卸掉，不会互相改对方的令牌。

## 直接装（已发布到 npm）

| 包 | 是什么 |
|---|---|
| [`dsh-cds-theme`](https://www.npmjs.com/package/dsh-cds-theme) | CDS 主题：配色、排印、圆角、阴影、组件细节 |
| [`dsh-system-fonts`](https://www.npmjs.com/package/dsh-system-fonts) | 正文 / 代码 / 终端 / 界面四个字体下拉，加行距与字距 |
| [`@hwfee/dsh-usage-stats`](https://www.npmjs.com/package/@hwfee/dsh-usage-stats) | 新对话页上的用量看板 |
| [`@hwfee/dsh-genui`](https://www.npmjs.com/package/@hwfee/dsh-genui) | `render_ui`：让模型用一张可交互卡片回答 |
| [`@hwfee/dsh-predict`](https://www.npmjs.com/package/@hwfee/dsh-predict) | 输入框里的灰色「下一句」，Tab 填入 |
| [`@hwfee/dsh-git-bash`](https://www.npmjs.com/package/@hwfee/dsh-git-bash) | Git Bash 当 shell，附带 `run_shell` 工具 |

**版本号看 npm 页面，别抄这份文档**——每页右上角就是当前 latest，链接跨版本一直有效：

```bash
npm view dsh-cds-theme version --registry=https://registry.npmjs.org
```

在命令行里跑，或者在 DSH 的 **设置 → 插件 → 添加插件** 输入框里直接填包名：

```bash
dsh plugin --profile desktop add dsh-cds-theme
dsh plugin --profile desktop add dsh-system-fonts
dsh plugin --profile desktop add @hwfee/dsh-usage-stats
dsh plugin --profile desktop add @hwfee/dsh-genui
dsh plugin --profile desktop add @hwfee/dsh-predict
dsh plugin --profile desktop add @hwfee/dsh-git-bash
```

**装完或卸完之后，彻底退出并重开 DSH。** 插件是在启动组装 Profile 的时候挂载的，不重启不会生效。

卸载：

```bash
dsh plugin --profile desktop remove dsh-cds-theme
dsh plugin --profile desktop remove dsh-system-fonts
dsh plugin --profile desktop remove @hwfee/dsh-usage-stats
dsh plugin --profile desktop remove @hwfee/dsh-genui
dsh plugin --profile desktop remove @hwfee/dsh-predict
dsh plugin --profile desktop remove @hwfee/dsh-git-bash
```

> **国内镜像会慢一步。** 很多机器的默认 registry 是 `registry.npmmirror.com`，那是只读镜像，比官方源晚同步。版本找不到、或报 `Unexpected end of TAR archive` 时，锁版本并从官方源装：
> ```bash
> dsh plugin --profile desktop add dsh-cds-theme@<版本> --config.registry=https://registry.npmjs.org
> ```
> **不锁版本的安装可能落后一版。** pnpm 的 `minimumReleaseAge` 会把刚发布不久的版本排除在范围解析之外，所以 `add <包名>` 可能装到更旧的版本，而 `add <包名>@<版本>` 一定拿到你点的那个。

---

## 长什么样

| 对话页（工具调用与思考状态） | 代码块与 Diff 渲染 |
| :---: | :---: |
| ![对话页](assets/screenshot-chat.png) | ![代码块](assets/screenshot-code.png) |

| 「主题定制」设置页 | 新对话页（衬线问候语 + 用量面板） |
| :---: | :---: |
| ![主题定制](assets/screenshot-settings.png) | ![中文首页](assets/screenshot-zh.png) |

| 通用设置里的字体行 | 下一句（输入框里的浅色预测） |
| :---: | :---: |
| ![字体设置](assets/screenshot-fonts.png) | ![浅色预测](assets/predict-ghost.png) |

<details>
<summary>英文界面预览（文案随宿主语言切换）</summary>

![英文首页](assets/screenshot-en.png)

</details>

---

## 六个插件分别干什么

### 1. `dsh-cds-theme` — 整套外观重做

参考的是 [Caho1/open-claude-ui](https://github.com/Caho1/open-claude-ui)（MIT，对 Anthropic Claude Design System 的逆向整理），但我没有原封不动照抄——觉得顺眼的留下来，水土不服的按自己的判断改了。

- **319 个设计令牌**：走宿主的 `ctx.theme.overrideTokens` 直接换掉令牌表（DSH 把主题令牌内联写在 `<body>` 上，单写 CSS 覆盖不了）。其中配色 173 个（暖灰表面阶梯、陶土橙 `#d97757` / `#c6613f`、`hsla(0,0%,8%,α)` 发丝边框、双层弥散阴影、三层焦点环）、排印 133 个、圆角/阴影/缓动 13 个，明暗两套配色。
- **中文排印**：2 个做过 `avar` 字重轴校准的思源黑体/宋体子集，8 档字重下中文与英文笔画粗细一致。**包里只内联这两个**；6 个 Anthropic 拉丁字面只声明 `local()` 引用：本机装了才用上，没装就回落系统字体，见下面专节。
- **组件级打磨**：首屏问候语换成衬线 Display（38px / wght 330）；聊天里的 Markdown 表格加上闭合发丝外框、浅底表头和等宽数字；代码块浅色下是白底、深色下 `#1a1a19` 暖黑；思考提示改成柔和的呼吸微光。
- **独立的「主题定制」设置页**：在设置侧栏里和「通用」同级。里面有浅色/深色/跟随系统、4 种强调色（陶土 / 赭石 / 砂金 / 石墨）、表面暖度、圆角比例、阴影强度、组件细化开关、思考提示保留原版蓝、长文本（>2000 字或 >30 行）粘贴自动转 `@` 文件引用、中文字体优先开关。
- **首页点击波纹（半成品，可关）**：还原 Claude Code 桌面版上线一天就撤掉的空白页代码字形背景 + 点击光波。目前效果还比较粗糙，在「主题定制」最底下留了开关，不喜欢随时关掉。

详见 [`plugins/cds-theme/README.md`](plugins/cds-theme/README.md)。

### 2. `dsh-system-fonts` — 换字体、调行距

这个插件只管字族和间距，绝不碰配色，也不写任何 `font-weight`（字重阶梯归主题管，乱插一脚会把层次全搅乱）。

- **四个字体槽**：正文 / 代码 / 终端沿用宿主自己的行，另外补一个**界面字体**（默认跟随正文）；再加两个像素步进器（界面字号、行内代码字号），跟宿主自己的字号行挨着。
- **读取本机已装字体**：在 Windows 上合并 GDI 字体集、注册表 `Fonts` 键和字体文件里的 OpenType 元数据，中英文名字归到同一族。
- **行距与字距滑块**：行距 50%–100%，字距 −0.30em ~ +0.30em，拖动实时生效。

详见 [`plugins/system-fonts/README.md`](plugins/system-fonts/README.md)。

### 3. `@hwfee/dsh-usage-stats` — 看自己花了多少 Token

在新对话页标题下方加一张统计卡片，数据直接从本机 `~/.dsh/sessions` 的会话日志里算出来，不上传任何东西。

- **六个指标 + 模型排行**：会话数、消息数、总 Token、活跃天数、高峰时段、最常用模型；切到「模型」标签页能看每个模型的消耗占比，右上角可以切「全部 / 30 天 / 7 天」。
- **活跃度热力图 + 书目折算**：右下角固定是今天，往前铺满整周；底下随机抽一本书（《红楼梦》《三国演义》《围城》《活着》《骆驼祥子》）折算你用掉的 Token 相当于几本书。
- **带磁盘缓存**：DSH 的日志是多段 zstd 帧拼在一起的，第一次打开需要约 2 秒冷解析，之后缓存在 `~/.dsh/cache/usage-stats/`，每次重开约 20 毫秒。面板高度（240–520px，默认 344）和数字单位（万/亿 或 K/M/B）可以在「主题定制」页调。

详见 [`plugins/usage-stats/README.md`](plugins/usage-stats/README.md)。

### 4. `@hwfee/dsh-genui` — 生成式界面卡片

模型调 `render_ui`，回答就地渲染成一张可交互的 React 卡片，而不是先写成一段话：条形图、对比表、表单、开关都在里面。卡片上的按钮能改状态；它想发消息时只提出请求，**要你点一下确认**才会真的发出去。

- **跑在沙箱 frame 里。** 卡片是独立文档、opaque origin，读不到应用的页面、存储与你浏览器的 cookie；那个文档里网络被挡住，表单也提交不出去。CSP 与消息校验的确切细节见 [`plugins/genui/README.md`](plugins/genui/README.md)。
- **只有你的点击能发消息。** 卡片可以请求发送，但那只是卡片下方的一条待确认请求；点 **「发送这条选择」** 才真的进入对话，点「丢弃」什么都不发。
- **自带 React，不连 CDN。** React / ReactDOM / Scheduler 在构建时打进 frame 产物（MIT，许可证随包），所以卡片碰不到宿主那个 React 实例。
- **卡片高度由卡片自己报。** 渲染后 frame 上报内容高度，图变高、表单展开都不会被裁掉，也不会在对话里长出一条内部滚动条。
- **内置一个 skill**，教模型什么时候值得用卡片、frame 里能用什么、怎么用宿主令牌着色让明暗两套都成立。
- **出错看得见**：解析失败、渲染抛错、frame 试图跳转到别的页面、参数读不出来，都会在卡片位置显示原因，并把源码留在开关后面。

**它不承诺什么**：不承诺「任何情况下都绝对连不上网络」（CSP 挡的是成文的网络 API，扩展与代理不在其内），也不承诺模型写的代码无害——那些代码照样会执行，只是读不到应用的页面、存储与 cookie。

详见 [`plugins/genui/README.md`](plugins/genui/README.md)。

### 5. `@hwfee/dsh-predict` — 下一句

每轮回答结束后，根据当前对话预测你下一句想说什么，用浅灰文字提示在输入框里。按 **Tab** 填入，不发送。

- **旁路**：`turn/end` 之后走宿主自己的 LLM 服务，关闭推理，不写会话日志、不占回合，失败也不会在对话里留下错误。
- **会把最近几轮对话发给你配置的 provider**：每次预测都是一次短请求，内容是你最近的输入与回复，走和正常回合相同的供应商、凭据与计费。插件自己不建连接；不想让这些片段离开本机就关掉这一行设置。
- **会退避**：连续失败 3 次就安静 10 轮；单次预测超过 20 秒直接放弃。
- **模型可选**：默认跟随当前模型，也可以从宿主模型目录里固定一个。

详见 [`plugins/predict/README.md`](plugins/predict/README.md)。

### 6. `@hwfee/dsh-git-bash` — Git Bash 当 shell

加一个 `run_shell` 工具，以及通用设置里的 **默认 shell** 行，三种模式：自动 / Windows PowerShell / Git Bash。

- **找的是真正的 Git for Windows bash**，不是 `C:\Windows\System32\bash.exe` 那个 WSL 替身：先看 `DSH_GIT_BASH`，再走 `git --exec-path`，最后试常见安装位置。
- **每条结果都写清在哪跑的**：`· host` 表示穿过宿主的 `ctx.shell`，并把会话的沙箱模式一起交给执行器；`· direct` 表示插件自己 spawn。
- **受限会话或策略不明时拒绝执行（fail closed）。** Git Bash 在 Windows 上进不了宿主沙箱，所以只读 / `workspace-write` / 判定不出沙箱模式的会话（策略服务缺失、取不到会话、模式不认识），`run_shell` 会在**启动任何进程之前**报错。提示给的是「改用 Windows PowerShell」「改写成等价 PowerShell 命令」或「把这件事交给用户决定」——不会让你放宽沙箱模式。只有明确的 `danger-full-access` 会话才允许直接跑 Git Bash。自动模式仍按原来的规则选 shell，会话策略只决定这条命令能不能跑，插件不会暗中换解释器。
- **取消会传播**：中止信号会交给实际执行的执行器，已经取消的调用不会启动命令。
- **找不到也不消失**：解析不出 shell 时，设置行会说明是哪一项配置不对。

详见 [`plugins/git-bash/README.md`](plugins/git-bash/README.md)。

---

## 字体版权

有 6 个 **Anthropic** 网页可变字体（Sans / Serif / Mono × Roman / Italic）是商业字体，**没有再分发授权**。它们**不在本仓库里**：只是开发者本机的未跟踪工作副本，已写进 `.gitignore`，fresh clone 根本不含这些文件。一旦内联进 npm 包，就等于把它们发给每一个安装的人。

**当前构建实际怎么做（2026-10-22 在提交进 git 的产物上核实）：**

| | |
|---|---|
| 内联成 `data:font/woff2` | **2 个** —— 两个思源（Noto）子集，SIL OFL，由本项目做过 `avar` 校准 |
| 6 个 Anthropic 字面 | 只声明成 `local("Anthropic Sans" / "Anthropic Serif" / "Anthropic Mono")`，**包里零字节** |
| 对用户意味着什么 | 机器上装了这几个字族时，`local()` 会解析到已安装的那份；没装则字族栈回落到系统字体。两种状态的并排视觉比对目前**没有**做过 |
| 字面靠什么识别 | [`tools/font-licences.mjs`](tools/font-licences.mjs) 为每个字面保存一条 `sha256` 和前 96 字节（base64），不含二进制，所以四道闸门在没见过那 6 个文件的 clone 上照样生效 |
| 怎么保证不复发 | 构建阶段发现受限字面的字节就失败；`test/fonts.test.mjs` 复核产物**并**断言这 6 个文件仍未被 git 跟踪；`tools/audit.mjs` 覆盖所有产物和本机副本 drift；`market/check-release-assets.mjs` 打开真实 tarball 并按内容指名 |

- **修复之前发布过的版本是另一回事。** npm 上的 `dsh-cds-theme@0.1.5` 是旧构建，8 个字面全内联，不会追溯修改。装这个版本或更新的版本；旧 tarball 里确实带着那些字节。
- 复核方法、旧 tarball 里到底有什么、拉丁字面回落后界面会变成什么样，都记在 [`market/PUBLISHING.md`](market/PUBLISHING.md)。

---

## 其他安装方式（插件市场 / 离线包 / 源码）

DSH 里有三个地方能装插件，但它们填的东西不一样：

| 入口 | 填什么 |
|---|---|
| **命令行** `dsh plugin --profile desktop add <内容>` | npm 包名、`.tgz` 链接、或本地 `link:<目录>` |
| **GUI：设置 → 插件 → 添加插件** | 跟命令行一模一样 |
| **GUI：插件 → 发现**（要先开「自定义插件市场」） | 只能填下面那个 `index.json` 的市场地址，不能填包名 |

**方式 A：自定义插件市场**

在设置里开启「自定义插件市场」，填入：

```text
https://raw.githubusercontent.com/HwFee/HwFee-dsh/master/market/index.json
```

**方式 B：直接装 GitHub Release 的 `.tgz` 包**

Release 按包分 tag，因为六个包版本各自演进：

| | |
|---|---|
| Release 列表 | <https://github.com/HwFee/HwFee-dsh/releases> |
| tag 规则 | `<插件>-v<版本>`，例如 `cds-theme-v0.1.5`、`genui-v0.1.0` |
| 资产名 | 就是 `npm pack` 的文件名；scoped 包**去掉 scope** —— `@hwfee/dsh-genui` 是 `hwfee-dsh-genui-<版本>.tgz` |
| 完整地址形状 | `https://github.com/HwFee/HwFee-dsh/releases/download/<插件>-v<版本>/<资产名>` |

去 Release 页面点资产，别手拼地址——上面两条规则正好是手拼最容易错的地方（漏掉 `hwfee-` 前缀、或者把 `@scope/` 也写进去，都是 404）。

> 别用 `git+https://github.com/HwFee/HwFee-dsh.git#...&path:/plugins/...` 这种写法——DSH 底层的 pnpm 装 git 依赖时只认仓库根目录，忽略子目录参数，装上去不会生效。
>
> **也别从旧的共享 tag 装。** `v0.1.0` 那个 Release 还在、还能下，但里面是首发那三个包；`v0.1.1` 根本没有 Release。以按包分的 tag 为准。

**方式 C：本地克隆源码（改代码用）**

六个插件编译好的 `client/client.js` 都已经提交在仓库里，克隆下来直接 `link:` 就能用。如果你改了源码，重新 `npm run build` 再重启 DSH：

```bash
git clone https://github.com/HwFee/HwFee-dsh.git
cd HwFee-dsh/plugins/cds-theme
npm ci && npm run build
dsh plugin --profile desktop add link:.
```

---

## 仓库目录与测试

每个插件都有自己的 `npm test`：先查产物新鲜度，再查清单契约，然后跑各套单测。数字会随修改变动，所以 README 不再复述一个总数，以它打印的结果为准：

```bash
# 在任一插件目录里跑
cd plugins/cds-theme
npm test

# 在仓库根目录跑体积预算、DOM 安全、生命周期与产物新鲜度检查
node tools/audit.mjs
```

最近一次六套完整运行（提交进 git 的产物，全绿）：**2026-10-22**。

```text
HwFee-dsh/
├── plugins/
│   ├── cds-theme/        # CDS 主题
│   ├── system-fonts/     # 系统字体下拉 + 行距字距
│   ├── usage-stats/      # 新对话页用量看板
│   ├── genui/            # render_ui 生成式卡片
│   ├── predict/          # 下一句预测
│   └── git-bash/         # Git Bash + run_shell
├── market/               # 市场 index.json、catalog 条目、发布与安装脚本
├── docs/                 # 取证笔记：cds-spec.md、host-hooks.md 与各轮审计
├── assets/               # README 预览截图
├── patches/              # 宿主补丁（diff 行号、diff 起点）
└── tools/audit.mjs       # 全仓静态检查
```

> `skills/dsh-plugin-guide/` 是顺带放在仓库里的第三方插件开发资料（Apache-2.0），包含 DeepSeek 官方文档归档，和上面六个插件没有运行时依赖关系。
