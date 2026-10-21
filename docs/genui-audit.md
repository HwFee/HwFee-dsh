# genui 对照审计 · Generative UI against MCP Apps

*对 `plugins/genui` 的一次外部对照审计：拿官方 MCP Apps 规范、智谱 ZCode 的配套实现、以及宿主自身的约束来检验这个插件，逐条判定「该学什么、该丢什么」。每条结论带证据位置；实测过的标 `实测`。*

审计日期：2026-10-20。对照的三份材料：

| 材料 | 位置 | 性质 |
|---|---|---|
| MCP Apps 规范（SEP-1724，2026-01-26） | `modelcontextprotocol/ext-apps` → `specification/2026-01-26/apps.mdx` | 官方扩展规范，ZCode 采用的就是它 |
| `create-mcp-app` 技能 | `ext-apps/plugins/mcp-apps/skills/create-mcp-app/SKILL.md` | 官方实现指南 |
| ZCode 配套插件 | `zai-org/zcode-plugins` → `plugins/zcode-mcp-app-dev/`（v0.1.1） | 智谱的宿主侧约定 + 技能写法 |
| 宿主约束 | `skills/dsh-plugin-guide/`（本地知识库） + `@deepseek-ai/dsh-tools` 源码 | DSH 自身的红线 |

---

## 一、结论先行

审计前，这个插件**三个缺陷会让功能在真实使用中不可用或说假话**：

| # | 缺陷 | 严重度 | 状态 |
|---|---|---|---|
| 1 | `parameters` 用了 `defineTool` 的作者方言，`register()` 要的是原始 JSON Schema；每次请求都被 provider 以 `is not of type "object"` 拒绝，**工具从未可调用** | 致命 | 已修 + 回归测试 |
| 2 | 卡片只能看不能答。按钮改本地状态后没有任何出口，用户的选择**永远回不到模型** | 高 | 已修（`interact`）+ 实测 |
| 3 | `skill.js` 告诉模型 `globalThis` 与 `eval` 被屏蔽，**实测两者都能跑**；且 `globalThis` 一个属性就绕开了表中所有掩码 | 高 | 已修 + 回归测试 |

修完后 59 项测试通过，`node tools/audit.mjs` 全绿，并在运行中的应用里跑通「点按钮 → 用户消息 → 模型据此执行」的闭环。

---

## 二、缺陷 1：方言混用，工具从不可调用

**证据（实测）**。修复前的会话在真实应用里直接报：

```
Invalid schema for function 'render_ui':
{"description":"…","required":true,"type":"string"} is not of type "object"
```

**根因**。宿主存在两套 schema 方言：

- `ParameterSchemaSpec` —— `{ title: { type: 'string', required: true } }`，**只**在 `defineTool()` 内部合法
- 原始 JSON Schema —— 根上有 `type`，requiredness 是根数组

`defineTool` 会把前者编译成后者（`packages/core/tools/src/schema.ts: parameterSchemaSpecToJsonSchema`）。而 `ctx.tools.register()` 把 `definition.parameters` 当作**线上 schema 直接投影给模型**（`dsh-tools/lib/index.js: schemaOf()`），不做编译。

本插件不能用 `defineTool` —— 它属于宿主的 node_modules，profile 里解析不到（`实测`：`require('@deepseek-ai/dsh-tools')` → `MODULE_NOT_FOUND`）。因此必须**手写原始 JSON Schema**。

**为什么之前没被发现**。行激活正常、客户端 bundle 正常加载、卡片样式表已注入——一切看起来都对。错的只是工具调不起来。这是 AGENTS.md 反复强调的那类静默失败。

**修复**。`lib/index.js` 的 `parameters` 改成 `{ type: 'object', additionalProperties: false, required: ['title','code'], properties: {…} }`。两条回归测试钉死根形状与关键词子集，**并已验证改回旧写法会红**：

- `test/render-tool.test.mjs`「the registered parameters are a raw JSON Schema, not the defineTool spec」
- `test/skill.test.mjs`「both halves of the definition use the enforced JSON Schema dialect」

第二个是**旧测试改的**：它原来断言 `parameters.title.required === true`——把 bug 当成了契约。这类测试比没有测试更糟。

---

## 三、缺陷 2：卡片没有出口（MCP Apps 的 `ui/message`）

**规范怎么做的**。MCP Apps 把「视图能回话」当作一等能力：

- `ui/message` —— 视图向对话追加一条消息（通常 role=user）
- `ui/update-model-context` —— 替换供后续回合使用的上下文
- `tools/call` —— 视图可以调用工具（含只对 app 可见的工具）

**原实现**。只有渲染和 `useState`。按钮点了会高亮，但没人知道。一个自证闭环的假控件。

**修复**。给片段注入第三个参数 `interact(text)`：

- 片段侧在 `client/src/sandbox.js`：`interact` 排在 `h` 之后、掩码之前；未提供桥时抛一句「needs a host bridge」而不是 `not a function`
- 归一化只在沙箱一处：非空字符串才发，其余拒绝（测试覆盖 `'   '`、`null`、`{text}`）
- 组件侧在 `client/src/card.js`：把投递结果渲染成卡片外的状态行，成功 4 秒后自动消失（定时器在 unmount 时清理）
- 桥在 `client/src/lifecycle.js: createConversationBridge()`：`sessions.scope(sessionId)` → `conversation.send(text)`。这是宿主自己的发送路径，等同于用户在输入框里发一条消息

**为什么桥放在 `inject` 而不是组件里**。组件拿不到服务，只能收到值；而 `sessions.scope(id)` 只在插件 `apply` 的上下文里合法。这与宿主自己的 `conversation-queue-dock` 用的是同一套写法。

**实测闭环**（运行中的应用，CDP 驱动）：

1. 模型画卡片，三个按钮「每天 / 每周 / 手动」
2. 脚本点击「每天」
3. 卡片显示 `Sent to the conversation`
4. 对话里出现用户消息「把发布节奏设为「每天」。」
5. 模型据此**建了一个每天 10:00 的定时任务**

**降级**。`sessions` 服务缺失、`scope()` 抛错、`conversation.send` 不存在——任一情况返回 `null`，卡片正常渲染但无 `interact`。缺失在调用时以句子告知，不隐藏。

---

## 四、缺陷 3：skill 说了假话（`globalThis` / `eval`）

**实测对照**（`compileCard` 直接驱动）：

| 片段 | 修复前 | skill 声称 |
|---|---|---|
| `typeof globalThis` | 返回 `string`（**能跑**） | 被屏蔽 |
| `globalThis.fetch(...)` | 抵达真实 `fetch` | 被屏蔽 |
| `eval('1+1')` | 返回 `2`（**能跑**） | 被屏蔽 |
| `new Function(...)` | 抛错 | 被屏蔽 |
| `window` / `document` / `localStorage` | 抛错 | 被屏蔽 |

**两个不同性质的问题**：

1. `globalThis` **可以**被屏蔽（它不是保留字，strict mode 也不禁止），之前漏了。这不是取舍，是漏洞：其余所有掩码都只差一个属性就被绕过。已加入 `REDIRECTS`，并有回归测试（已验证移除后变红）。
2. `eval` **无法**被屏蔽：strict mode 禁止把 `eval`/`arguments` 用作绑定名，`new Function('eval', …)` 在编译期就抛。**放弃 strict mode 去换这一条是坏交易**——strict mode 挡的是 `leaked = 1` 这种往页面上挂全局的真实数据风险，而片段本来就是任意代码，再求值一次不给它新东西。

所以处理方式是**改说真话**：skill 表格拆成「被屏蔽」与「`eval` 无法屏蔽，别依赖它」两行，模块注释写明已知逃逸（构造器链仍可抵达 realm）。

**学到了什么**：文档与代码的分歧，只能靠一条「把文档声明当断言来跑」的测试来终结。现在 `test/sandbox.test.mjs` 的 `every documented redirect` 逐条驱动每个掩码名；`test/skill.test.mjs` 检查 skill 提到的每个名字都在表里。

---

## 五、MCP Apps 的取舍表

| 规范能力 | 取/舍 | 理由 |
|---|---|---|
| **工具 + 视图配对**（`_meta.ui.resourceUri`） | **取** | 本插件就是 `render_ui` + keyed toolview，同构 |
| **视图回话**（`ui/message`） | **取** | 缺了它卡片就是图片，见第三节 |
| **无 UI 宿主降级成文字** | **取** | 卡片读不出时显示原因与源码；模型侧 `output.render` 返回文字确认 |
| **`interact` 从点击而非渲染调用** | **取** | 在渲染中 `await` 会挂住组件；skill 明写 |
| **尺寸协商**（`size-changed`） | **取（按需）** | 宿主容器本就按内容自适应，`max-height: 520px` 是唯一硬约束 |
| **主题令牌 + 亮暗模式** | **取（已有）** | 全部走 `--dsw-alias-*`，与 `useHostStyles` 同一思路 |
| **双 iframe + 独立源 + CSP** | **舍（记录原因）** | slot 直接渲染 React；套 iframe 会把宿主 React 与令牌继承挡在外面，而对「已在跑 bash 的调用者」无安全收益。见 README「安全边界」 |
| **`ui://` 资源协议** | **舍** | 片段的运输载体是工具参数（会话日志），不是独立资源；引入资源层只增加一次取回 |
| **`ui/update-model-context`** | **舍（有等价物）** | `interact` 走真实用户消息，语义更强：它留下可回放的用户回合 |
| **app-only 工具**（`visibility: ["app"]`） | **舍** | 本插件只有一次工具调用，没有服务端可回访的会话态 |
| **`ui/request-display-mode`（全屏/PiP）** | **舍（待评估）** | 宿主有右栏 slot，但没有与卡片联动的显示模式声明；需要先确认宿主 API |

---

## 六、ZCode 配套实现学到的东西

**它的结构**。`zcode-plugins` 是个市场：`marketplace.json` + 每个插件一个目录，含 `.zcode-plugin/plugin.json`（清单）、`skills/<name>/SKILL.md`（技能）、可选 `references/`（宿主扩展说明）。智谱把「怎么做 UI 插件」本身做成了一个**技能插件**（`zcode-mcp-app-dev`），而不是散在文档里。

**可取的四点**：

1. **技能即交付物**。他们不写一份「MCP App 指南」网页，而是发一个能装的插件。本插件的 `generative-ui` 技能同理——装在包里，模型随包获得。
2. **技能里只写宿主特有的部分，通用部分指向官方**。`developing-mcp-apps/SKILL.md` 第 11–13 行：标准 API「读已安装的 SDK 类型与官方 quickstart」，本文件只写 ZCode 约定。**避免抄一份会过时的规范**——这正是我们 skill 里「主题令牌列表」这种内容要小心的原因。
3. **验证清单可执行**。它列出 `typecheck / lint / test / test:artifacts / validate.py / build_dist.py`，并要求「在检出目录之外测试构建产物」，且「报告没有执行的检查」。对应到本仓库就是 `npm test` + `audit.mjs` + 真机截图。
4. **能力探测而非假设**。`getHostCapabilities()` 再决定是否启用可选操作；缺少必需能力要**明确报错**，不许静默改变持久化语义。本插件的 `createConversationBridge` 逐级 `get` + 判类型，缺哪级返回 `null`，同一原则。

**要丢的两点**：

1. **不要把插件做成 MCP 服务器**。它的形态是 stdio 进程 + `ui://` 资源；DSH 的插件是 Cordis 行 + 客户端 bundle，套 MCP server 会多一个进程和一层协议，换不来任何东西。
2. **不要抄它的 `plugin.json` 清单体系**。DSH 的清单真相在 `package.json`（`dsh.bundle` / `dsh.client`）+ `cordis.patch.yml`，两套并存就是又一次「包名四个位置」事故。

---

## 七、宿主知识库纠正的两点

`skills/dsh-plugin-guide/SKILL.md` 直接命中两处：

- 第 39 行：「工具 `parameters` 是 **DSH 自己的方言，不是 JSON Schema**」。这句话对 `defineTool` 成立，对**裸 `register()` 反而不成立**——裸注册要的就是原始 JSON Schema。这条正是缺陷 1 的来源，知识库的措辞值得补一句区分（已在本文记录，未改第三方库）。
- 第 45 行：「UI 插件只渲染 slot 里的 React 组件；**不 `require` 任何 Harness Client 包**」。本插件已合规（`client/inject` 只有两个包 ID，运行时不 require）。这条与「B 计划里用宿主 primitives」冲突，保持现状。

---

## 八、仍未做

| 项 | 为什么没做 |
|---|---|
| 双 iframe 隔离 | 见第五节：成本真实，收益对当前调用者为零；需要处理不可信数据时再做 |
| 卡片内 `globalThis` 的彻底封堵 | 构造器链仍可逃逸；只靠参数掩码做不到，需要 realm 隔离 |
| 折叠分组内卡片的可达性 | 宿主把已完成工具调用收进「已完成」分组；插件无法改宿主的折叠策略，已在 README 告知用户 |
| 发布到 npm / 市场 | 需 `npm version patch` + 发包 + 装矩阵；本轮只做代码与验证 |
