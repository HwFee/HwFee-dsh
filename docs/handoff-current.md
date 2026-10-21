# 当前交接：开发由用户叫停（2026-10-20 17:35）

> **2026-10-20 18:25 更新：第 3 节已解决，predict 首次在真实应用里产出预测并通过 Tab 接受。** 根因有三层，全部有实机证据；见 3.1–3.3。第 3 节保留原始记录，供后来者对照「症状 → 根因」的推导过程。

本文件记录用户要求停止开发时的状态，补充原始任务清单 `docs/handoff.md`，不替代仓库规则 `AGENTS.md`。

**接手第一步：第 3 节（predict 设置行）与第 4 节（Git Bash）均已解决；先读第 5 节看还剩什么。**

## 1. 停止时的状态

- 工作区：`C:\Users\17445\Desktop\HwFee-dsh`
- 平台：Windows；Node `v24.16.0`、npm `11.13.0`。
- DSH 应用：**正在运行**，2026-10-20 17:24 由用户手动重启（**没有带 `--remote-debugging-port`，无 CDP、无 DevTools**）。Web GUI 端口 17:24 起为 `127.0.0.1:50264`。
- Desktop profile：`C:\Users\17445\.dsh\profiles\desktop\`，六个插件都是 `link:`。
- 本轮没有提交、推送、发布 npm、创建 tag 或 release。
- 工作区里还有更早几轮（含 16:06–16:09 被中断的那一轮）的未提交改动；`git status` 里的改动不能都算在本轮名下。
- `.work/` 仍被 gitignore；本轮证据都在里面，换机器前确认是否保留。
- 用户已明确叫停开发；只有收到新的继续指令才恢复实现、验证或应用操作。
- **2026-10-20 20:05 起有另一个会话在并行修改本仓库**：`plugins/system-fonts` 的「界面字号」与 `plugins/cds-theme/client/src/styles.js`。最终形态是 `uiFontSize` 10–20px 步进器（见 2.5）。**该会话已于 21:16 完成并重建**：四个插件的产物新鲜度检查全部通过，五套测试全绿，`node tools/audit.mjs` all checks passed。工作区里这些文件的改动不是本会话的，但它们与本会话的 amber/UI 字阶改动已一起构建、一起实测。

## 2. 本轮已完成并验证

### 2.1 通用设置里「默认 shell」下方的粗线（用户已确认「细线 ok 了」）

**根因不是一条粗线，是两条 0.5px 线落在相邻的两个设备像素上。**

1. `cds-theme` 给设置行画底线，选择器是 `[data-slot="settings.general.item"] > *`。
2. 槽位里某个条目渲染失败时，宿主用**空的 `div[data-slot-error]`** 顶替（`dsh-client-ui-renderer` 的 `SlotErrorBoundary`）。它高度 0，却仍是槽位的直接子节点，于是又继承一条 0.5px 底线。
3. 实测：`.work/shots/shell/row.png` 里其它分隔线占 1 个设备像素（灰度 224），Default shell 下方占 2 个（y=900、901）。空出来的那一格正是 order 44 那一行，而它当时就不见了。

**修复**（`plugins/cds-theme/client/src/styles.js` → `settingsRules()`）：

- 底线只画在**非空**的槽位单元上：`> *:where(:not(:empty):not([data-slot-error]))`。
- 必须用 `:where()` 把守卫的特异性留在 `(0,1,0)`。直接写 `:not(...)` 会变成 `(0,3,0)`，压过宿主与本主题的 `:last-child` 清线规则，每个 section 的最后一行都会多一条线——这一点是浏览器 fixture 抓到的，纯文本单测抓不到。
- 清线规则保持宿主的写法 `> *:last-child`。
- 代价：如果最后一个子节点恰好是死格，它的前一行会保留底线（与宿主自己的 `:last-child` 盲点相同），已接受并在注释里写明。

**证据**：

- 真实截图逐像素扫描：`.work/shots/shell/row.png`（双像素 vs 单像素）。
- 浏览器 fixture（真 Chrome，`.work/fixture/`）：修前空 crash 格 `border-bottom: 1px`、高度 1px；修后 0px / 0px，行线从 2 像素变 1 像素。图：`.work/shots/fixture-before.png`、`.work/shots/fixture-after.png`。
- 单测：`plugins/cds-theme/test/css.test.mjs` 的 `the settings hairline only claims cells that hold a row`；已反向验证：改回旧选择器会红。
- 用户重启后确认细线正常。

### 2.2 predict 三项补修（A/B/C）

| 项 | 修法 | 回归测试（都做过「改回旧代码会红」） |
|---|---|---|
| A 目录 RPC 的 `{ok:false}` 卡在 loading | 成功回调里先 `settle` 成 error 再抛；同步抛错也归一到 rejection；`retry()` 先清 `inflight` 再发新 RPC | `test/picker.test.mjs`：`an ok:false catalogue answer is a retryable error, not a stuck spinner` |
| B 首次配置与预测请求竞态 | 新增 `ensureConfigured()`：先等配置队列排空，仍 dirty 才串行重试一次，失败就不发（失败关闭）；耗时的 suggestion 不进队列 | `test/client.test.mjs`：`a suggestion waits for the configuration write already on the wire`、`a configuration that keeps failing drops the suggestion instead of using defaults` |
| C 取消监听与测试替身 | `waitAborted()` 改成可 `cancel()`，`runPrediction` 在 `finally` 里退订；composer 输入监听改 `{capture, passive}`；替身 `stream: () => new Promise()` 换成真正挂起的异步生成器；新增 `prepareCall` 永不返回的超时用例 | `test/host.test.mjs`：`a completed prediction leaves no abort listener behind`、`a prepareCall that never settles still times out` |

**另外修掉的两处残留**：

- `plugins/cds-theme/test/typography.test.mjs`：UI 字族令牌（`--dsw-font-family-ui`）加进 `buildTypographyTokens()` 时没同步计数，130 vs 131。改成按 `TYPOGRAPHY_ROLES.length` 计算。
- `git-bash` / `predict` 的 `ctx.locale.register()` 改成显式 `return` 的块体写法，`tools/audit.mjs` 的 `checkLocaleDisposers` 才认得出 disposer。

**验证**：`plugins/cds-theme`、`plugins/predict`、`plugins/git-bash` 三套 `npm test` 全绿；`node tools/audit.mjs` → all checks passed；三个 `client/client.js` 都重新构建且 `--check` 通过。

### 2.3 predict 首次端到端跑通（18:25）

三处修复见第 3 节（点号服务名、`source.kind`、ghost 叠层）。此外，用户提出「参考官方会话标题插件」的思路，实际排查中确认了两件事：

- 官方 `dsh-session-title` 用的也是 `ctx.on('session/event', …)`，说明这个接缝在真实宿主里是有效的；predict 的接缝没有问题，问题在它自己对消息形状的假设。
- 标题插件的 `sessionTitleUserMessageOf()` 过滤 `source.kind === 'user'`，是判断「真实用户消息」的正确参照。

`appendSuggestion()` 里对 `session.appendPluginRecord` 的依赖**当前不在链路里**：预测走「客户端 turn/end → `predictSettings/suggestion` RPC → 宿主 pending promise」这条路，不需要往会话日志写记录。那段代码是早期设计的残留，是否删除待定（保留不影响功能）。

### 2.4 「界面字体」行归位 + 两个测试系统问题（19:20）

- `plugins/system-fonts/client/src/panel.js` 的 UI 行注册 order 从 **145 改成 15**，界面字号 16、两个滑块 17/18。展开字体组后顺序变成：内容字体 → 代码字体 →（代码字号）→ 终端字体 →（终端字号）→ 界面字体 → 界面字号 → 行距 → 字距。此前 UI 行被排到所有行之后，看起来和字体调节无关。
- 回归守卫：`.work/e2e-font-rows.mjs` 三个场景（折叠 / 展开顺序 / 打开 UI 字体菜单），每场景一张截图，落在 `.work/shots/font-rows/`，逐张看过。
- **测试系统问题一**：`test/cordis.test.mjs` 一直没接进 `npm test`，UI 行加进来后它按 5 行写死的断言已红，而 `npm test` 全绿。已接进 test 脚本（`build --check && manifest && fonts && cordis && host && ui-font-role`），并同步全部 5→6 / order 断言。
- **测试系统问题二**：`fonts.test.mjs` 的自建 harness 在失败时会 `process.exit(1)`，但因为没接进链路的 cordis 先红时会被误读；现在整条链的退出码已验证为 0。
- 当前 `system-fonts` 套件：fonts 125、cordis 5、host 20、ui-font-role 5、ui-scale 6，全绿；`node tools/audit.mjs` all checks passed。
- 新增仓库规则：**所有实机验证必须有截图**（AGENTS.md 第七节第 3 步）。

### 2.5 界面字号（20:40）

- **形态**：与宿主「字号大小 / 代码字号 / 终端字号」一致的**像素步进器**（14 px + 上下 chevron），不是百分比滑块。默认未设置时显示 14px；范围 10–20；设置行在「界面字体」之后、行距之前。
- **实现分两段**（详见 AGENTS.md 第十二节）：
  1. `typography.js` 写 `--dsh-font-size-ui: <n>px`，驱动 cds-theme 的 UI 字阶令牌（工具摘要、复制按钮等）；
  2. `uiscale.js` 按 `size / 14` 给 `[data-slot="sidebar"]` 与 `[data-shortcut-modal="settings"]` 的文本节点写内联字号与行高——宿主侧栏/设置行写死的 14px/12px 只有这样能放大。
- **明确不用 `zoom`**：实测会让设置页整体变大、侧栏被固定宽度的列裁切（`.work/shots/font-rows/04/05/09*.png`）。用户要求「只放大文字、布局不动」，E2E 断言的就是“字号 14→16、宽度 800/280 不变”。
- **验证**：`.work/e2e-ui-size.mjs` 五个场景、五张截图（`.work/shots/ui-size/01..05`），逐张看过；`test/ui-scale.test.mjs` 六个用例（不碰正文、不叠乘、还原、保留原有内联值、后挂载节点）。
- 期间修正的两个测试问题：cds-theme 的动效令牌基线因新增规则位置而红（规则已移除，恢复原基线）；`cordis.test.mjs` 已接进 `npm test`。

## 3. 已解决：通用设置里「选择模型那一行」不见了（2026-10-20 18:25）

用户原话「一选择模型那一行不见了」的正确断句是: **一选择模型，那一行就不见了**——不是「行一开始就不在」。14:26 截图里那个空 crash 格，是用户点过模型菜单之后留下的。

### 3.1 根因一：`remote.session` 是点号服务名，不是 `remote` 的属性

实机控制台原文（带 CDP 启动、打开设置、点「预测模型」后抓到）：

```
Error: cannot get property "remote.session" without inject
    at Object.get (dsh-app://app/assets/index-…js)
    at Object.load (…/dsh-predict/client.js)
slot entry crashed in 'settings.general.item': Error: cannot get property "remote.session" without inject
```

- 网关以 `remote.<namespace>` 注册命名空间服务（`dsh-api-gateway/lib/client.browser.js` 的 `remoteServiceKey()`，`super(ctx, remoteServiceKey(name))`）。`remote.session` 是一个**服务名**。
- 插件原来写 `const remote = ctx.get('remote')`，再读 `remote?.session?.modelCatalog`。Cordis 的 traceable 代理在读取命名空间属性时走 `Reflect.get(ctx, 'remote.session')`，而该 ctx 的 fiber 没有 `inject: ['remote.session']`，于是抛错。
- 抛错发生在 `catalog.load()`，即**用户打开模型菜单的那一刻**，所以行平时正常、一点菜单就整行被 React 错误边界换成空 `div[data-slot-error]`。
- 修法：`ctx.get('remote.session')` 惰性解析（`plugins/predict/client/src/lifecycle.js` 的 `remoteSession()`），不增加启动顺序耦合；服务缺失时走已有的 `remote-unavailable` 可重试路径。
- 回归测试：`test/picker.test.mjs`「the catalog reads the dotted remote.session service, never a property of remote」，已反向验证（改回旧读取会红）。

### 3.2 根因二：用户消息的 `source.kind` 是 `'user'`，不是 `'user-rpc'`

宿主的消息来源表写得很清楚（`dsh-api-session-controller/lib/typert.host.js` 的 `MessageSourceMap`）：

```
'user-rpc': { kind: 'user'; rpcId: SessionRequestId; … }
```

**键**是 `user-rpc`，**kind** 是 `'user'`。predict 的 `rebuildConversation()` 与 `trackEvent()` 都在过滤 `source.kind !== 'user-rpc'`，于是真实用户消息全部被丢掉：

- `userTurns` 永远是 0 → `shouldPredict()` 每一轮都返回 `first-turn` → **一次预测都不会启动**；
- 实机证据：新会话第二轮后 `__dshPredictDebug.reason` 仍是 `skipped:first-turn`。

修法：两处过滤器改为 `kind !== 'user'`（与官方 `dsh-session-title` 的 `sessionTitleUserMessageOf()` 一致）；`lib/request.js` 的缺省来源同步改为 `{ kind: 'user' }`。测试夹具同步改成宿主的真实形状，并新增回归测试「a composer message (key user-rpc, kind user) counts toward the first-turn rule」，已反向验证。

### 3.3 根因三：预测出来了，但被输入框座位层盖住

修好 3.1 / 3.2 后预测真的产出了，但截图里看不见。`elementFromPoint` 与 DOM 检查给出：

- ghost 是 `<body>` 的直接子节点，`position: absolute`，`z-index: 1`；
- 宿主的输入框外层 `.Dc7zOa_composerSeat` 是 `position: sticky; z-index: 7`。

于是整个输入框座位层画在 ghost 上面：元素存在、坐标正好在光标处、文字颜色 `rgb(118,118,118)`，用户看到的却是一个空输入框。修法：`plugins/predict/client/src/ghost.js` 的叠层 `z-index` 改为 50——高于应用自身的 sticky/定位层（≤10），低于宿主的菜单与对话框（100 / 1000 / 1100）。回归测试「the overlay paints above the composer seat and below host menus」，已反向验证。

### 3.4 实机验证（2026-10-20 18:20，CDP）

- 第三轮 `turn/end` 后 `__dshPredictDebug = { reason: null, turnSeq: 39 }`，ghost 文本「再说一句关于天气的话。」；
- 第四轮 ghost「今天天气不错，适合出门走走。」，截图 `.work/shots/predict-ghost-crop3.png` 中可见，位置在光标处；
- Tab：ghost 消失、草稿变成同样的文字、消息行数不变（未发送）；
- 测试会话 `session-ecfb669a-…` 已按 AGENTS.md 第七节第 4 步删除。

### 3.5 原始记录（2026-10-20 17:35，保留）

用户 17:24 重启后报告：「一选择模型那一行不见了，细线 ok 了」。这一行在 14:26 的截图里也已经不见了；粗线正是它失败后留下的空 crash 格。当时没有 CDP、没有 DevTools，渲染器控制台从未被读到，所有说法都只是源码推断。事后证明：**「行一开始就不在」这个推断是错的**——行一直在，崩在用户点菜单的那一刻。

## 4. Git Bash 默认 shell：模式切换已修，执行按宿主能力分流（2026-10-20 19:45）

### 4.1 先修了一个更基础的 bug：模式切换从来没到过宿主

设置行在**浏览器进程**，`run_shell` 在**宿主进程**。客户端原来用 `ctx.emit('git-bash/mode')` 发布选择，这个 Cordis 事件只到浏览器监听器——宿主永远停在 `DEFAULT_MODE`（`auto` → Git Bash）。症状：把「默认 shell」改成 Windows PowerShell，设置行显示 PowerShell，`run_shell` 仍然跑 Git Bash。**这是静默的**，因为行是客户端渲染的，显示的一直是用户选的值。

修法（`plugins/git-bash/lib/mode-route.js` + `client/src/lifecycle.js`）：

- 宿主新增 `GET/POST /dsh-git-bash/mode`，带同源头围栏（自定义头 + Host/Origin/Sec-Fetch-Site，照 `dsh-system-fonts` 的成熟做法）。POST 写入模式，GET 读回当前值（排障用）。
- 客户端每次发布都同时发这个 POST；应用启动时也会把存储的模式推给宿主。
- 实机证据：UI 切到 Windows PowerShell 后 `GET /dsh-git-bash/mode` → `{mode:"pwsh"}`；切回「自动」→ `{mode:"auto"}`。

### 4.2 执行路径：PowerShell 走宿主，Git Bash 只能直连（并如实标注）

`run_shell` 现在：

- **PowerShell 模式**：`& '<pwsh.exe>' -NoProfile -NonInteractive -Command '<script>'` 交给 `ctx.shell`，沙箱 / 取消 / 工作目录 / 进程生命周期都归宿主。结果头部带 `· host`。
- **Git Bash 模式（Windows）**：**不能**委托。实测沙箱里的 pwsh 无法创建 MSYS 进程：`NtCreateDirectoryObject(...) 0xC0000022`；带 `-lc` 的 bash 子进程一律在启动时死掉。因此保留插件自带的 `execFile`，结果头部带 `· direct`，并附一句「did not cross the sandbox」。不静默降级。
- **POSIX**：只有一种 shell，走宿主（`· host`）。
- 工作目录：未显式传 `workdir` 时，通过可选的 `ctx.workingDirectory.ensure(agent, signal)` 取会话目录（以前其实一直跑在宿主进程 cwd，工具描述与实现不符）。

### 4.3 实机证据（2026-10-20 19:42，会话日志）

```
[pwsh · C:/Program Files/PowerShell/7/pwsh.exe] exit 0 · host
7

[gitbash · C:/Program Files/Git/bin/bash.exe] exit 0 · direct
Ran directly: the Windows host sandbox cannot start Git Bash (nested MSYS process creation is denied), so this command did not cross the sandbox.
shell=/usr/bin/bash
```

回归测试：`test/mode-route.test.mjs`（围栏、校验、GET/POST）、`test/tool.test.mjs` 的 `shouldDelegate` 与 `· host` / `· direct` 渲染。都验证过改回旧行为会红（mode-route 是新测试；委托选择用旧逻辑会返回 false）。

### 4.4 仍然没做的

- **真正“接管”**（让 Git Bash 成为 native 工具的解释器）仍未实现。唯一路径是路线 1：插件提供 `ShellExecutor` 并在 profile 禁用 `pwsh-sandbox` + `tool-pwsh`，代价是原生 PowerShell 工具消失；而 Windows 上 `bash-sandbox` 被宿主显式 `disabled`，`bash-local` 又固定调 PATH 里的 `bash`（Windows 上是 WSL 替身）。当前的分流是刻意选择：不破坏原生 `pwsh`，也不假装 Git Bash 已经接管。
- 审批升级仍归原生 `pwsh` 工具；`run_shell` 遇到沙箱拒绝只能如实报错。

## 5. 更早交接里仍未动的项目

- ~~工具调用摘要文字变橙~~ **已修（2026-10-20 20:05）**：目标元素确认是宿主的 `.toolAmber` / `.subtoolAmber` 与轨迹 `.ZNyiNW_span[data-timeline-span="tool"]`，它们消费 `--dsw-alias-state-warn-label` 作为「amber 类别」色。cds-theme 原来把这个令牌覆盖成警告橙 `#e8590c`，于是每条工具摘要都像警告。现改为宿主的 amber 字面量（light `#dd8629` / dark `#f7ad31`），`warn-primary/secondary/tertiary` 仍保留主题色。回归测试 `tokens.test.mjs`「the tool-summary token keeps the host amber」。
- ~~思考区遮挡~~ **已修（2026-10-21 08:45）**：真凶是**滚动渐隐遮罩打在 sticky 标题上**，不是文字颜色或渲染 bug。`[data-step-process-body]`（思考组滚到 400px 的内容容器）上既有宿主的 `.fadeTop` 类（`02-ChatGroupSeat.module.css:80-88`，`mask-image: linear-gradient(#0000 0, #000 24px 100%)`），也有 cds-theme 用稳定属性 `[data-scroll-up]` 重写的同一份 24px 渐隐。而这个容器里的行**正好 24px 高**（`08-ReasoningRow.module.css:6-8`），展开后的思考行又把自己的 `[data-disclosure-header]` 以 `position:sticky; top:0` 钉在同一个元素里（`:13-18`）——于是遮罩把「思考」两个字和它下面第一行推理正文一起羽化，用户看到的就是「被盖住」。CSS 遮罩无法对后代豁免，所以修法是**顶边不再羽化**：`[data-step-process-body][data-scroll-up] { mask-image: none }`（0,2,0 属性选择器，顺带盖住宿主的 `.fadeTop` 类），底边保留参考的 alpha 阶梯。证据：同一节点 mask 开/关的对照截图 `.work/think/ab-01-masked.png`（糊）/ `ab-02-mask-off.png`（清晰）；回归测试 `css.test.mjs`「the step body feathers its bottom edge and never its top edge」，已验证把旧规则改回去它变红。
- ~~字体隔离验收~~ **已做（2026-10-20 18:45）**：UI 字族选 Anthropic Serif 后，设置行/导航计算字族变 serif，对话正文仍是 anthropic-sans；UI 字阶 `--dsw-font-*` 的字族也走 UI 角色。截图 `.work/shots/ui-font-serif.png`。新增 UI 字号角色：`--dsw-font-size-ui` 默认 = 正文大小，13 档界面字阶按 delta 跟随（实测 13px → 17px @ 正文 18px）。
- ~~GenUI 最终验收~~ **已做（2026-10-20 19:05）**：`node .work/e2e.mjs` → **7 passed, 0 failed**。两个原失败是**验收脚本**的错误假设（replay 把滑块本地状态当成提交参数；dark 伪造属性而不是走真实主题设置），已修正脚本并重跑；截图在 `.work/shots/e2e/`。
- ~~predict README~~ **已补**（`plugins/predict/README.md`，`npm pack --dry-run` 无警告）。
- 发布：npm 发包 / 安装矩阵 / Releases 仍未执行（需要用户授权，且是外发动作）。

### 5.1 收尾（2026-10-21 08:50）

- ~~`node tools/audit.mjs` 的两条 freshness 红~~ **已修**：`plugins/system-fonts` 与 `plugins/usage-stats` 的 `tools/build-client.mjs` 都 `import { buildSync } from 'esbuild'`，而这两个目录的 `node_modules` 里没有 esbuild（`cds-theme`/`predict`/`git-bash`/`genui` 都有）。表现是审计把「构建脚本直接崩了」当成 stale 报出来，`npm test` 的第一项也会一起红。修法就是在这两个目录各跑一次 `npm install`（各装 2 个包，devDependency 已在清单里）。现在六套 `npm test` 全绿、`node tools/audit.mjs` → **all checks passed**。
- ~~profile 被安全模式削过~~ **已恢复**：2026-10-20 23:45 构建后刷新页面导致 web boot 失败，红框里的「禁用第三方插件」把 `dsh.profile.bundles` 从 8 条削到 2 条、并从 patch 删掉 `permission` / `locale` / `session-log-deepseek` 三行。`bundles` 已回到 8 条（base、web-app + 六个插件），三行宿主配置已按 `cordis.patch.yml.bak-1792511115240` 补回（文件里留了注释说明来源）。`node tools/preflight.mjs` 全绿。**仍未改回的两处**是安全模式写的值：`ui-settings.enabled: false`（备份里是 `true`）与 `agent-default-model.model: qoder-cn/dfmodel`（备份里是 `qwen-cn/deepseek-v4.1-flash-1017` + `reasoningEffort: high`）——这两处属于用户偏好，未擅自改。
- **「停止生成」气泡显示两个 Esc 不是 bug**：宿主的 `response.stop` 命令写死 `keys: ["Esc", "Esc"]`，而 `installStopShortcut` 用 `StopSequence` 实现「两次 Esc 之间有时间窗，第二次才取消」（`.repro/bundles/dsh-client-ui-conversation.js` 的 `StopSequence.press()`）。两个键帽是这层语义的正确表达，主题只提供 `--dsw-alias-tooltip-bg` / `-key-bg`，不参与生成内容。要改成单个键帽等于对快捷键撒谎，不做。
- 仍然只剩一件：**发布**（npm / 安装矩阵 / Releases），属外发动作，等授权。

## 6. 接手前的固定动作

```powershell
# 在仓库根
node tools/preflight.mjs                 # profile bundles / link / patch / cookies
node tools/launch-desktop.mjs            # preflight 通过后带 CDP 启动
node .work/cdp.mjs targets               # 确认 dsh-app:// 页面在列表里
```

```powershell
# 三个插件的门槛
cd plugins/cds-theme; npm test
cd ../predict;        npm test
cd ../git-bash;       npm test
node tools/audit.mjs
```

**不要**在 e2e 之后留下测试会话；清理范围见 `AGENTS.md` 第七节第 4 步。**不要**在没有授权的情况下发布、推送、打 tag。