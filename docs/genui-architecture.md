# genui：公开实现调研与本轮改动

调研日期：2026-10-22。以 OpenAI 的公开实现为主，对照八条主要社区路线。这里记录已查看的公开文档和源码；不声称还原 ChatGPT 内部未公开的交互界面生成或触发系统。

## 参考来源与取舍

| 来源 | 查到的机制 | 对 DSH 的取舍 |
|---|---|---|
| [OpenAI Apps SDK UI](https://github.com/openai/apps-sdk-ui) | 主题 token、React 组件；源码 SegmentedControl/Slider 使用受控 value/onChange 和 Radix，Button 区分状态与尺寸 | 主参考：组件负责外观与交互，模型组合组件与数据。用 DSH 自身 token 实现轻量组件，不向宿主注入 Tailwind 或另一套全局样式 |
| [OpenAI Apps SDK Examples](https://github.com/openai/openai-apps-sdk-examples) | 工具关联视图；`structuredContent` 进入组件；`useHostStyles`/`useDocumentTheme` 同步宿主主题；另有 widgetState 与窗口 globals 的适配示例 | 保留 DSH 原生工具和回答节点、iframe 主题快照。本轮补齐样式根和 token 同步；没有伪造 window.openai 或声称完整兼容 Apps SDK |
| [Vercel AI SDK](https://github.com/vercel/ai/blob/main/packages/ai/README.md) | 统一模型接口、结构化输出、工具与 UI 框架集成 | 借鉴模型层和界面层分工；DSH 已有 agent loop/llm 服务，避免再跑一套会话循环 |
| [json-render](https://github.com/vercel-labs/json-render) | 组件 catalog、schema、registry 和流式渲染 | 借鉴稳定组件目录；本轮提供六个可复用组件。尚未新增 JSON UI 协议或部分文档流式渲染 |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) | 工具/UI 绑定、runtime adapters、消息部分与交互反馈 | 回答节点继续作为主要显示路径，不替换整个聊天壳 |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) | 后端工具渲染、共享状态、人工确认与持久对话 | 区分本地探索和对话动作；本地控件不发送消息，明确的采用操作才进入确认条 |
| [AG-UI](https://github.com/ag-ui-protocol/ag-ui) | 事件协议连接 agent、界面与状态 | 参考事件与状态分工；DSH 已有会话事件，不叠加第二条事件总线 |
| [A2UI](https://github.com/a2ui-project/a2ui)（原 Google 路径已迁移） | 声明式组件/数据模型、ID 引用和增量更新、跨框架 renderer | 可作为未来结构化视图路线；本轮保持既有调用兼容，不新增未经适配的协议依赖 |
| [Tambo](https://github.com/tambo-ai/tambo) | 组件 schema、模型选组件、流式 props 与可更新组件状态 | 参考组件注册与状态区分。本轮不依赖其云服务；当前 README 已公告 Tambo Cloud 于 2026-10-31 关闭，源码可自托管 |
| [OpenUI](https://github.com/thesysdev/openui) | 紧凑 UI 语言、从组件库生成提示词、流式 parser/renderer | 借鉴减少临时 DOM 代码的方向；不为本轮引入新语言和解析器 |

OpenAI 的直接源码依据：

- [工具与模板关联](https://github.com/openai/openai-apps-sdk-examples/blob/main/pizzaz_server_node/src/server.ts)。
- [工具结果输入组件](https://github.com/openai/openai-apps-sdk-examples/blob/main/src/use-widget-props.ts)。
- [宿主主题适配示例](https://github.com/openai/openai-apps-sdk-examples/blob/main/src/host-theming/App.tsx)。
- [widgetState 适配示例](https://github.com/openai/openai-apps-sdk-examples/blob/main/src/use-widget-state.ts) 与 [globals 的外部状态订阅](https://github.com/openai/openai-apps-sdk-examples/blob/main/src/use-openai-global.ts)。
- [SegmentedControl](https://github.com/openai/apps-sdk-ui/blob/main/src/components/SegmentedControl/SegmentedControl.tsx)、[Slider](https://github.com/openai/apps-sdk-ui/blob/main/src/components/Slider/Slider.tsx)、[Button](https://github.com/openai/apps-sdk-ui/blob/main/src/components/Button/Button.tsx)。

新组件为本仓库独立实现，没有复制这些项目的源码、添加其运行时依赖或引入外部模型服务；原有 vendor CSS 的来源与许可证保持不变。

## 本轮已落地

1. **主动使用规则独立成一层。** `plugins/genui/lib/guidance.js:2` 提供短、稳定的规则；`lib/index.js:48` 将其注册进 systemPrompt，而详细配方继续由技能提供。普通 DSH 中 tools 服务本身依赖 systemPrompt，故 tools 就绪时可读取它；极简组合缺少提示词服务时仍保留工具。规则增强主模型判断，不保证调用率，也不强制每轮使用 UI。
2. **增加组件层。** `client/src/frame/ui-kit.js:3` 统一处理图表数据与数值边界，提供 BarChart、LineChart、Metric、Tabs、Select、Range。代码继续是原有 JS 函数体，增加 ui 参数；原来四个参数的位置、工具 schema 和历史调用回放格式不变。
3. **修复未生效的样式根。** 原 iframe 内没有 `.dsh-genui-card`，但 vendor 和新组件样式都以它为祖先。本轮在 frame 根上补齐该类，使已有组件样式真正命中。
4. **修复快照与运行时接收的不一致。** 快照会收集 `--ds-*` 与 `--viz-*`，旧运行时只应用 `--dsw-*`/`--dsh-*`，丢失了代码字体和图表色。`client/src/frame/theme.js:2` 统一应用四种命名空间，并在新快照中清除已不存在的旧值；iframe 元素与内部文档使用一致的 color-scheme。
5. **修复构建滞后一轮。** 原脚本先构建 client，再生成 frame JSON；client 因而嵌入磁盘上的旧 frame。本轮 `tools/build-client.mjs:82` 通过内存输入，把本次生成的 frame 直接交给本次 client 构建；检查模式保持只读，单次 build 后 --check 即通过。
6. **修正测试对外部时间戳的耦合。** 合成“健康 profile”不应因当前工作区其他插件的 mtime 提示而失败；测试仍要求退出码为零、无失败项，并且只允许独立的 freshness 提示。生产 preflight 未改动。

当前链路：用户消息 → 主模型读主动使用规则与工具描述 → 选择 render_ui → 校验旧格式调用 → 回答节点 → iframe 内组合组件 → 本地状态变化；仅明确的对话动作进入宿主确认条。DSH 已有回答节点与确认条，本轮补强触发规则、组件和运行时，不把既有机制算作新实现。

## 可选分类模型与尚未实现的部分

分类服务可以使用远端或本地模型；本轮没有接入或启动它。建议按消息事件调用，服务常驻但不持续空转推理，分类只返回展示建议，由主模型决定最终内容和是否使用工具。接入还需要服务地址、模型标识、接口协议，以及超时/取消策略；不需要先更换渲染层。

尚未实现：模型生成中途的部分 UI 展示、完整 JSON/DSL 视图协议、跨刷新控件状态持久化、卡片与模型之间的通用共享状态协议。主题切换保持已挂载控件的状态，重新挂载则从原始工具参数重建。公开 Apps SDK 的这些能力不能仅靠替换 CSS 获得。

## 验证范围

- genui 全量 npm test：159 通过、0 失败；构建新鲜度、仓库 audit、git diff --check 均通过。
- 第 159 条这个数字会随改动增长，判断是否丢了覆盖要看逐项场景，不看总数。
- 回归守卫分别覆盖提示词接线、frame 样式根、四种 token 命名空间与构建 frame 嵌入。临时撤去这些修复时测试失败，恢复后通过。
- Chromium 使用真实 genui/client.js 和自带的 iframe runtime，宿主槽位由离线 fixture 提供，数据为明确标注的示例；不是已安装 DSH 桌面的端到端测试。
- 浏览器覆盖滑块改变结果、下拉改变点数、键盘读取点值、切换图形、选择条形、主题切换不重置状态/重载 iframe、本地探索不发送消息、采用配置后宿主确认、窄屏、负数/零轴、空数据。每个可见场景均有截图并查看。
- 纯逻辑/结构单测不适用截图；相应可见行为由浏览器场景补充。
- 尚未连接真实模型评估自动触发成功率；提示词接线通过不等于模型必然选择该工具。

预览与日志：`/workspace/scratch/dsh-review/genui-*`。代码留在工作区，未提交、推送或发布。
