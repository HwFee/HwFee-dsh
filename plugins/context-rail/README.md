# @hwfee/dsh-context-rail · 会话内上下文侧栏

DeepSeek Harness 的**会话内**信息侧栏：像 Claude Code 的 session rail 一样，开关在会话标题栏右侧的按钮排里，窗口够宽时自动展开，侧栏贴着会话内容流的右缘，**不占用宿主的原生右侧栏**——文件预览、文件树、终端照常在原生右栏打开。

## 它长什么样

三个圆角模块，自上而下：

| 模块 | 内容 | 数据来源 |
|---|---|---|
| 环境 | 工作目录（末段，悬停看全路径）、模型、会话标题、运行状态 | `workingDirectory` / `modelSelection` / `title` 投影 + 会话列表 |
| 上下文 | 标题右侧「26% 已用」、右对齐的 `~已用 / 窗口`、4px 分段条、系统提示 / 工具 / 消息 / 剩余四行（含占比） | `contextPressure` + `contextBreakdown` |
| 用量 | 输入、输出、缓存读、缓存写、合计 | `tokenUsage` |

标题行可点开合，chevron 随之转向。

## 打开方式

- **标题栏按钮**：会话标题右侧按钮排里新增一个「上下文侧栏」开关，`aria-pressed` 表示当前状态；
- **自动展开**：窗口宽度 ≥ **1180px** 时默认打开；用户点过开关后，以用户的显式选择为准（存 `localStorage` 的 `dsh-context-rail/open`）；
- **共存**：原生右侧栏打开时，会话列变窄，本侧栏跟着新的右缘左移，两侧同时可用；只有会话列窄到放不下「rail 328px + 正文 240px」时才收起，避免把正文压没。

## 它怎么做到的（以及为什么不用原生右栏）

原生右栏有一整套占用模型（标签、分屏、浮动），而且文件预览、文件树、浏览器、终端都在那里打开。把侧栏注册成其中的一个 tab，会与它们争空间，文件预览一开侧栏就得让位或挤在一起。

所以这个插件自己画：

1. 在 `conversation.session.header.utilities`（列表槽）里注册一个按钮——这是会话标题栏右侧的按钮排，宿主自己的「更多」等按钮也在这一排；
2. 按钮组件同时用 `ReactDOM.createPortal` 把侧栏渲染到 `document.body`，`position: fixed`；
3. 位置来自 `[data-conversation-content]` 的实测矩形：`top` 取内容区顶边（标题栏之下），`height` 取内容区高度，`right` 取视口右边缘到内容区右缘的距离。`ResizeObserver` 盯着内容区和 `[data-rightbar-col]`，窗口缩放、侧栏开合、右栏开合都会重算；
4. 打开时给 `body` 加 `data-dcr-open`，由 CSS 给**滚动容器** `[data-conversation-scroll]` 加 `padding-right: var(--dcr-rail-width)`——正文和输入框一起变窄，而不是被浮层盖住。留白必须加在滚动容器上而不是外层列上：加在外层列会把滚动条一起挤到内容与 rail 之间；加在滚动容器上，滚动条留在最右边，rail 再按 `calc(5px + 2px)`（滚动条宽度 + 宿主的 2px 外边距）往左让位，于是滚动条在 rail **右侧**的窄条里，而不是夹在中间；
5. **原生右栏不是隐藏理由**：它打开时会话列变窄，实测矩形随之变窄，侧栏跟着左移；是否显示只看「列宽 ≥ rail 宽 + 240px 正文」。

**没有一条 CSS 规则指向原生右栏。** `test/styles.test.mjs` 钉死这一点：插件可以读取 `[data-rightbar-col]` 的宽度，但不能给它写样式。

## 数据形状（宿主 0.2.1-rc.3）

```ts
interface ContextPressureProjection {
  pressureTokens?: number
  projectedTokens?: number   // 优先，宿主的 contextOccupancy 也用它
  contextWindow?: number
}
interface ContextBreakdownProjection {
  systemTokens: number
  toolsTokens: number
  messageTokens: number
}
interface TokenUsageProjection {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}
```

三者都是 `SessionProjectionMap` 的键，通过会话作用域的标准钩子 `useProjection(key)` 读取——按钮注册在 session 作用域的列表槽里，所以框架直接把这些钩子作为 props 递进来，没有 `ctx.sessions` 之类的旁路。

## 安装

```bash
dsh plugin --profile desktop add @hwfee/dsh-context-rail
```

开发：

```bash
cd plugins/context-rail && npm ci && npm run build
dsh plugin --profile desktop add link:.
```

**装完必须彻底退出并重开 DSH**；改完 bundle 也一样，别按 ⌘R（旧 rev 取模块图会把应用卡在启动失败的红框上，见仓库 `AGENTS.md`）。

## 一次真实的静默失败（回归守卫）

0.2.2 里我把「原生右栏是否打开」的判断删掉了，但同一段里 `observer.observe(native)` 还引用着已经删掉的变量。effect 一执行就抛 `ReferenceError: native is not defined`，React 把整个条目卸载——**按钮从未出现过，界面上没有任何报错**，宿主只在渲染层吞掉了它。

`test/effect.test.mjs` 就是为这类故障写的：用假 DOM 和假 hooks 真正执行一遍组件与 effect。把 `native` 那行放回去，它会立刻红：

```
✖ the component mounts and runs its effects without throwing
  ReferenceError: native is not defined
```

## 测试

```bash
npm test
```

- 产物新鲜度（含真实执行 factory）；
- 清单契约（patch 行名 = 包名、bundle id、依赖声明）；
- 纯逻辑（格式化、占用率、分段、合计、百分比）；
- 面板结构（三卡、标题是折叠按钮、四个分段宽度、占比列、空态）；
- 样式契约（圆角模块、固定定位的 rail、28px 开关、**不碰原生右栏**、打开时预留宽度）；
- 注册契约（只注册 `conversation.session.header.utilities`，降级不抛错）。

## 许可

MIT。
