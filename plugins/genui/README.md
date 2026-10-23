# @hwfee/dsh-genui · 生成式界面

DeepSeek Harness（DSH）的生成式 UI 插件：模型调用 `render_ui`，把你正在做的那件事**就地画成一张可交互卡片**——条形图、对比表、表单、配置开关——而不是先写成一段话再让你自己想象。

卡片不是图片。它的按钮能改状态，也能把选择交给你确认后**发回对话**，所以模型可以接着你的选择往下做。

## 安装与卸载

```bash
dsh plugin --profile desktop add @hwfee/dsh-genui
```

装完或卸完**必须彻底退出并重开 DSH**：客户端 bundle 在页面启动时加载，只刷新页面不够。

卸载：

```bash
dsh plugin --profile desktop remove @hwfee/dsh-genui
```

## 你会看到什么

模型调用 `render_ui` 后，界面作为回答正文显示；旧宿主和轨迹视图保留工具行回退：

- **标题与源码入口** —— 标题支持位置设置；源码按需展开，不显示体积徽标或额外外框
- **卡片正文** —— 模型写的界面，跑在沙箱 frame 里，用宿主主题令牌着色，亮暗模式自动跟随；高度由卡片自己上报，随内容变化
- **脚注** —— 模型写的一句话：为什么这里用卡片而不是文字
- **确认条**（仅当卡片请求发消息时出现）—— 在 frame **外面**，显示待发送的那句话，以及「发送这条选择 / 丢弃」两个按钮

卡片出错时不会白屏：解析失败、渲染抛错、参数读不出来，都会在卡片位置显示原因，并把源码留在开关后面。

**关于折叠**：支持回答节点的宿主会把界面放在正文，避开已完成工具分组；仅工具行回退路径受宿主的工具折叠行为影响。

## 怎么让它画得好

插件通过 DSH 的 `systemPrompt.section` 注册简短的主动使用规则，模型不必等用户说“画卡片”才考虑调用。详细示例放在内置 `generative-ui` 技能中；技能服务缺失时，提示词和工具描述仍提供最小调用示例。

适合主动使用的场景是趋势、分布、多方案探索和可调参数的解释。简单事实仍用文字，普通表格用 Markdown，静态图用 Mermaid，修改项目用项目工具。最终是否调用由主模型判断；这不保证每轮都生成界面，也没有额外运行分类模型。

frame 内置六个 React 组件，主题、键盘操作和窄窗口布局由组件负责：

| 组件 | 用途 |
|---|---|
| `ui.BarChart` | 可选择的条形图，支持负数与零轴 |
| `ui.LineChart` | 趋势图，悬停、点击或聚焦数据点读取值 |
| `ui.Metric` | 一个指标及补充说明 |
| `ui.Tabs` | 受控视图选择按钮组 |
| `ui.Select` | 带标签的下拉选择 |
| `ui.Range` | 带数值与单位的滑块 |

模型可以写很短的代码，例如：

```js
const [rate, setRate] = React.useState(6)
return h('div', {style: {display: 'grid', gap: 16}},
  h(ui.Range, {label: '变化率', value: rate, min: -20, max: 30, unit: '%', onChange: setRate}),
  h(ui.BarChart, {data: [
    {label: '起点', value: 100},
    {label: '结果', value: 100 * (1 + rate / 100)}
  ]}))
```

`React`、`h`、`interact`、`timers` 与旧调用兼容，新增的 `ui` 不改变工具入参。图表筛选、滑块和视图切换只更新本地状态，不发送消息。只有用户明确要把选择交给模型时才用 `interact`。

界面采用宿主主题 token；主题切换通过快照更新，不重载 iframe，也不重置当前控件。iframe 重新挂载、刷新会话时仍会从原始工具调用重建，暂未提供跨重载的控件状态持久化。

主要参考 OpenAI 公开的 Apps SDK UI 与 Apps SDK Examples；社区方案比较、当前实现和后续分类器接入边界见 [架构记录](../../docs/genui-architecture.md)。

## 卡片能做什么，不能做什么

**能：** 读数据、算数、画图、用 `useState` 做本地交互（选中、展开、输入）、用定时器做动画、读自己那个 frame 的 `window.innerWidth` 做响应式、把选择通过 `interact(text)` 交给用户确认。

**不能：** 联网（frame 的 CSP 关掉了 `fetch` / `XMLHttpRequest` / WebSocket 与远程图片）、读宿主的页面 / 存储 / cookie（opaque origin 下这些是**读不到**，不是「藏起来」）、自己把消息发进对话（`interact` 只生成一条待确认请求）。

## 安全边界（按当前实现写）

**隔离靠的是 iframe，不是一串被屏蔽的变量名。** 卡片代码跑在一个 `sandbox="allow-scripts"`、**没有** `allow-same-origin` 的 iframe 里，所以那个文档是 **opaque origin**：`parent.document`、`localStorage`、宿主的 cookie 与 RPC 面都读不到——跨源窗口会直接拒绝这些属性访问。旧版把代码放在宿主 realm 里再屏蔽若干全局名，那种做法一个属性跳转就能绕过（`h.constructor("return localStorage")()`），相关实现已经删除。

| 层 | 做法 |
|---|---|
| **origin** | `srcdoc` + `sandbox="allow-scripts"`，没有 `allow-same-origin`。没有写 `allow` 属性，也就是说**没有额外授予任何权限**；具体哪些能力被禁由浏览器对该 `sandbox` 值的实际执行决定，本文不逐项断言 |
| **CSP**（frame 文档内的 meta） | `default-src 'none'`；`connect-src 'none'`；`img-src` / `media-src` 只允许 `data:`、`blob:`；`font-src data:`；`object-src` / `frame-src` / `child-src` / `form-action` / `base-uri` 全 `'none'`；脚本只认每次渲染新生成的 nonce（`script-src 'nonce-…' 'unsafe-eval'`，编译模型代码需要 eval 语义，作用域就是这个 frame） |
| **导航** | 卡片试图加载另一个页面时，宿主收到 `load` 事件后撤掉 `srcdoc` 并显示「试图加载另一个页面，已被拦下」，源码仍在 |
| **React 实例** | frame 自带在构建时打包的 React / ReactDOM / Scheduler（MIT，`licenses/` 随包分发），不连 CDN、不碰宿主的模块表；卡片里拿不到宿主那个 React 实例 |
| **主题** | 宿主把**计算后的主题值**做一份快照用 `postMessage` 送进去，主题切换时再推一次；frame 不读宿主的样式表 |
| **消息** | 每条来自 frame 的消息都要通过三重身份校验：`event.source` 必须是宿主自己创建的那个窗口、`event.origin` 必须是 `"null"`、载荷里的随机 token 必须与写进那个文档的一致。类型只有 `height` / `interact` / `failed` 三种 |
| **回话** | `interact(text)` 只生成一条 **pending 请求**（≤2000 字符且 ≤2000 字节、控制字符拒绝、一次只能挂一条、同一卡片限速 1 秒且最多 20 条）。宿主在 frame **外面**画「发送这条选择 / 丢弃」两个按钮；只有用户真的点下去，`conversation.send` 才会执行。frame 合成不出这个点击——它碰不到宿主 DOM，`postMessage` 也不携带用户手势 |
| **取消** | 点「丢弃」直接作废，不发任何东西；上一条还没确认时，卡片再调 `interact` 会被忽略（不会顶掉你正在看的那句话） |

**不承诺什么。** CSP 挡住的是**成文的那批网络 API**，不是「物理上不可能联网」：浏览器扩展、系统代理或将来新增的 API 都可能构成通道。真正的保证来自 opaque origin，不是那一行 `connect-src`。同理，frame 里的 `window` / `document` 是它**自己的**，它可以在自己的文档里读写——但那个文档里没有宿主的任何状态。

**代码仍然来自模型。** 这层隔离保证的是「卡片读不到宿主的 DOM、宿主存储与 cookie，也不能自己替你说话」，不是「卡片里的代码一定无害」。它依旧会在自己的 frame 里执行模型写的一切；卡片自己收到的数据（你让它画的内容、发给它的参数）当然就在那个 frame 里，本节的承诺与这些数据无关。

**跨机验收状态**：单元测试覆盖 frame 文档构造、CSP、消息校验、pending 门与主题快照；真实应用的端到端集成验收独立进行，本文不引用未完成的验收结果。

## 与官方 MCP Apps 的关系

[MCP Apps](https://github.com/modelcontextprotocol/ext-apps)（2026-01-26 成为 MCP 官方扩展）用 `ui://` 资源 + 沙箱 iframe + JSON-RPC over `postMessage` 交付 UI，工具通过 `_meta.ui.resourceUri` 关联视图，视图用 `ui/message` 把消息送回对话。

本插件现在跟它同构的地方有三处：**工具 + 视图配对**、**在沙箱 iframe 里渲染**、**视图能回话（但由宿主确认后发出）**。不同在于资源交付方式——这里不用 `ui://` 资源协议，而是宿主用 `srcdoc` 现场构造那份文档，因为卡片代码来自本次工具调用，没有独立可寻址的资源需要托管；隔离本身仍然是 opaque origin + CSP。

## 第三方代码

frame 里的 React / ReactDOM / Scheduler 是构建时打进产物的（MIT），许可证随包分发在 `licenses/`，来源与版本见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

## 开发者

```bash
cd plugins/genui
npm test            # 新鲜度检查 + 清单契约 + 全部单测（数字以输出为准）
npm run build       # 一次生成当前 frame runtime 和 client/client.js（两份产物都提交进 git）
```

目录职责、改包名的四个位置、发布流程见仓库根 [AGENTS.md](../../AGENTS.md)。改动 `client/src/` 后必须 `npm run build`，否则 `npm test` 的新鲜度检查会红，而用户拿到的是旧产物。
