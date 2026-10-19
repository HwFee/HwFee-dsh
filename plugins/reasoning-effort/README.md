# dsh-reasoning-effort

把当前模型的**思考强度**做成一条离散滑块，拖动即通过宿主自己的写入路径改掉下一次请求的 reasoning effort。

*A discrete slider for the current model's thinking effort. Moving it changes the next request's reasoning effort through the host's own write path.*

行在 **设置 → 通用**，文案跟随宿主语言（中文界面纯中文，英文界面纯英文）。

*The row lives in **Settings → General**; its copy follows the host language.*

## 它解决什么 · What it does

宿主的思考强度藏在输入框的模型菜单里：点开「模型」→ 再点进「强度」→ 选一档。这个插件把它提成一条滑块，一次拖动直达。

更重要的约束是：**档位完全由提供商决定**。宿主的模型目录里，只有声明了 `reasoningEfforts` 的模型才有强度可选；没声明的模型（例如本机 profile 里的 `xiaomi/mimo-v2.6-pro`）在宿主自己的菜单里也**没有**强度那一行。这个插件严格照抄这条规则。

*The host hides effort two levels deep in the composer's model menu. This plugin surfaces it as one slider — under one hard constraint: the stop list is whatever the provider advertises. A model that declares no `reasoningEfforts` has no effort row in the host's own menu either, and it has none here.*

## 档位从哪来 · Where the stops come from

一次读三样东西，全部走宿主已有接口：

| 读什么 Read | 从哪读 From | 与宿主同源 Same path the host uses |
|---|---|---|
| 当前会话 | `sessions.list` 中 `retainedBy.mainView > 0` 的那一行 | `ui-workspace` 的 `mainSessionId()` 就是这个判据 |
| 当前选择 | `sessions.binding(id).session.projections.faceOf('modelSelection')` 的 `next` | 输入框提交时读的同一个投影（`ui-conversation`） |
| 档位表 + 默认档 | `remote.session.modelCatalog()` 的 `groups[].models[].reasoning` | `ui-model-selection` 的 `ModelCatalogDirectory` 调的就是它 |

`reasoning.efforts[]` 的**长度**就是滑块档数 `N`，`reasoning.defaultEffort` 就是「默认」徽标所在的档。两者都不是常量，也不做补足或裁剪。

### `remote.session` 是独立服务，必须单独注入 · The namespace is its own service

这一点踩过一次坑，写在这里防止再犯：`api-gateway` 把**每一个** Remote 命名空间挂成独立的 Cordis 服务 —— `RemoteNamespaceService` 的构造是 `super(ctx, 'remote.' + name)`，即服务名就是字面量 `remote.session`。

所以 `remote.session` **不是** `remote` 服务上的属性。在只注入了 `'remote'` 的 fiber 里读 `ctx.remote.session`，Cordis 会抛：

```
cannot get property "remote.session" without inject
```

宿主自己的 `ui-model-selection` 正是把两者都声明了：`inject = [..., 'remote', 'remote.session']`。本插件照做，并且在注入回调里把解析好的命名空间直接交给控制器 —— 控制器对属性读取另有 try/catch 兜底，但正常路径不再依赖它。

*`api-gateway` mounts each Remote namespace as its own Cordis service (`super(ctx, 'remote.' + name)`), so `remote.session` is not a property of `remote`: reading it from a fiber that did not inject `'remote.session'` throws `cannot get property "remote.session" without inject`. The host's own model-selection package injects both names; this plugin does the same and hands the resolved namespace to the controller.*

*Three reads: the session the main view retains, the durable `modelSelection` projection, and the Host model catalog. `efforts.length` **is** `N`; `defaultEffort` **is** the Default stop. Neither is a constant.*

## 写入路径 · The write path

一次调用，与宿主自己改强度时**完全相同**：

```js
remote.session.selectModel({
  sessionId,                      // 当前会话
  provider: current.provider,     // 当前提供商，不改
  model: current.modelId,         // 当前模型，不改
  reasoningEffort: chosen.id,     // 只改这一项
})
```

对应宿主 `ui-model-selection/lib/client.js`：

- `ModelDirectory.select()` 在 `:880` 处提交的就是这个 payload；
- `chooseEffort()`（`:1445`）把 `{ provider: state.current.provider, model: state.current.model, reasoningEffort: effort }` 交给它 —— 改强度就是**用当前模型重投一次**；
- 那个类把 `ctx.remote.session` 作为 `sessions` 参数收下，所以 `this.sessions.selectModel` 就是 `remote.session.selectModel`。本插件走同一个入口。

**没声明的档位本地就拒写**，不发请求：模型刚换、旧档位还在时，`isAdvertised()` 会挡住它，而不是把一个宿主不认识的 id 发过去。

*One call, byte-identical to the host's own effort change: the current provider/model plus the new effort. A level the model does not advertise is refused locally — never sent.*

## 外观 · The look

滑轨几何套用参考组件的视觉语言（`.reference/open-claude-ui/code-examples/ModelSelectorEffort.tsx`）：胶囊药丸形、陶土填充、14px 圆点、发丝分隔、`max` 档的琥珀色警告块、默认徽标。全部走 CDS 令牌 —— 一个色值都没有硬编码，所以它跟随用户实际在跑的主题。

```css
/* 轨道：一条扁平药丸，陶土填充到拇指 */
.dre-slider::-webkit-slider-runnable-track { height: 6px; border-radius: 9999px;
  background: linear-gradient(to right,
    var(--dsw-alias-state-business-primary) 0 var(--dre-fill, 0%),
    var(--dsw-alias-border-l1) var(--dre-fill, 0%) 100%); }

/* 拇指：14px 陶土圆点 + 物理投影 */
.dre-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
  width: 14px; height: 14px; margin-top: -4px; border: 0; border-radius: 9999px;
  background: var(--dsw-alias-state-business-primary);
  box-shadow: 0 1px 2px hsla(0, 0%, 8%, .18);
  transition: box-shadow .12s cubic-bezier(.16, 1, .3, 1); }

/* 焦点：CDS 三层环；呼吸微光只在允许动效时出现 */
.dre-slider:focus-visible::-webkit-slider-thumb {
  box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base),
    0 0 0 1.5px var(--dsw-focus-ring-color),
    0 0 6px 1px var(--dsw-alias-state-business-tertiary); }

@media (prefers-reduced-motion: no-preference) {
  .dre-slider:focus-visible::-webkit-slider-thumb {
    animation: dre-breathe 2.4s cubic-bezier(.4, 0, .2, 1) infinite; }
}

/* 档位刻度：每档一根 2px 短柱，越过的档位用陶土 */
.dre-tick { position: absolute; top: 0; width: 2px; height: 6px; border-radius: 9999px;
  background: var(--dsw-alias-border-l3); transform: translateX(-50%); }
.dre-tick[data-past="true"] { background: var(--dsw-alias-state-business-primary); }

/* max 档的警告：参考的琥珀色块，走宿主自己的 warn 令牌 */
.dre-warning { display: flex; gap: 6px; padding: 6px 8px; border-radius: 8px;
  background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-state-warn-label);
  font-size: 11px; line-height: 15px; }
```

只有 `.dre-*` 类（插件自有）出现在选择器里，没有盐化 CSS-Modules 类。

*Only this plugin's own classes appear in selectors; no salted CSS-Modules class. No hardcoded palette value.*

## 降级矩阵 · Degradation matrix

**`N` 是当前模型声明的档数，不是五。**

| 情况 Case | 渲染 Renders |
|---|---|
| 读不到当前会话（主视图没有 retained 会话） | 一行说明，无控件 *one line, no control* |
| 目录还在加载 | 「正在读取模型目录…」*one quiet line* |
| 目录读取失败 | 记录失败状态（`catalogStatus: 'error'`），不吞异常 *the failure is recorded, never swallowed* |
| 宿主没有 `remote.session` 命名空间 | 不注册该行（依赖没齐）*the row is not registered — its dependencies never resolve* |
| 宿主没有 `modelCatalog` / `selectModel` | 插件照常加载，整行不渲染 *loads, renders nothing* |
| 宿主不支持转发事件（`$on` 抛错） | 行照常注册，只是目录不再实时刷新 *row registers; catalog just stops live-updating* |
| `N === 0`（提供商未声明 `reasoningEfforts`） | **整行不渲染** *nothing at all* |
| `N === 1` | **只读标签**（不是单档滑块）*a read-only label — a one-position slider is a dead control* |
| `N === 2` | 两档滑块 *two stops* |
| `N === 3` | 三档滑块 *three stops* |
| `N === 5` | 五档滑块 *five stops* |
| 其他 `N` | `N` 档滑块，`min=0`、`max=N-1` *`N` stops, `min=0`, `max=N-1`* |
| 换到档位更少的模型 | 档数立即跟随；旧档位不在新列表中时，落到新模型的 `defaultEffort`，没有默认则落到第一档 *stop count follows, stale level clamps to the new default or the first stop* |
| 写入被宿主拒绝（如 `session/writer-held`） | 显示宿主错误；拇指不动（它读的是持久投影），不谎报成功 *the host error is shown; the thumb never moved* |
| 写入了模型没声明的档位 | 本地拒写并提示 *refused locally, with the reason* |
| 目录增删了档位（`llm/adapters-updated` 等） | 重新拉取，档数随之变化 *refetched, stops follow* |

本机 profile 里的真实例子（`~/.dsh/profiles/web/cordis.patch.yml`，`magpie` 提供商）：

| 模型 Model | 声明档位 | 渲染 |
|---|---|---|
| `group/deepseek-v4.1-flash` | low / high / max | 三档滑块 |
| `stepfun-cn/step-5-preview` | low / medium / high | 三档滑块 |
| `devin/swe-2` | medium / high / max | 三档滑块 |
| `devin/gemini-4-argon` | low / medium / high | 三档滑块 |
| `devin/claude-sonnet-5-5` | low / medium / high / xhigh / max | 五档滑块 |
| `xiaomi/mimo-v2.6-pro` | **未声明** | **不渲染** |

## 文案 · Copy

参考组件的 `EFFORT_META` 只作为**按 id 查的文案表**，不是档位表：

| id | 中文 | English |
|---|---|---|
| `low` | 低 —— 简单问题的快速回答 | Low — Quick replies to simple questions |
| `medium` | 中 —— 轻松、日常的任务 | Medium — Light, casual tasks |
| `high` | 高 —— 日常工作的均衡档 | High — Balanced for everyday work |
| `xhigh` | 极高 —— 复杂、细致的工作 | Extra — Complex, detailed work |
| `max` | 最高 —— 最难的问题，耗时最长。 | Max — The hardest problems. Takes longest. |

`max` 档另有参考原文的告警（只在选中该档时出现）：

- 中文：可能消耗过多 token，导致响应时间变长，并触及用量上限。只在最难的任务上偶尔使用。
- English: May use excessive tokens resulting in long response times and may hit token limits. Use sparingly for the hardest tasks.

**其他 id**（`minimal`、`off`、`cordis.patch.yml` 里的自定义键）：用目录给的 `name`，**不编描述** —— 提供商没说过的语义，这里不替它说。

*The reference's five-level table is a copy lookup keyed by id, never the stop list. An id the reference does not name keeps the catalog's own name and gets no description.*

「默认 / Default」徽标取代了参考的 `Recommended`：参考把 `recommended` 硬编码成 `high`，这里只认真实的 `reasoning.defaultEffort`。

## 无障碍 · Accessibility

- 真正的 `<input type="range">`，`min=0`、`max=N-1`、`step=1`，键盘可操作（方向键、Home、End 均由浏览器原生提供）；
- `aria-valuetext` 是档位的**名字**而不是数字：`思考强度：高，第 2 档，共 3 档`；
- 刻度是 `aria-hidden` 的装饰，控件本身才是可达元素；
- 焦点环是 CDS 三层阴影；`prefers-reduced-motion: reduce` 时呼吸微光整条不出现，静态焦点环保留。

*Real range input, keyboard operable, `aria-valuetext` carries the level name, ticks are decorative, and the glow disappears under reduced motion while the focus ring stays.*

## 挪到「外观」页 · Moving to Appearance

现在注册在 `settings.general.item`（id `dsh-reasoning-effort`，order 28），所以它独立于任何其他插件就能用。宿主的「外观」页落地后，把它挪过去只需改 `client/src/lifecycle.js` 里的一行：

```js
scope.slots.inject('settings.general.item', function () {   // ← 改成 'settings.appearance.item'
```

其余部分（id、order、控制器、样式）都不用动。

*Registered on `settings.general.item` today. Moving to the Appearance page is a one-line slot-name change in `lifecycle.js`.*

## 安装 · Install

```bash
cd plugins/reasoning-effort && npm ci && npm run build && cd -

dsh plugin --profile web add link:C:/Users/17445/Desktop/HwFee-dsh/plugins/reasoning-effort
```

装完**完全退出并重开 DSH**（新插件要在启动时装入 profile）。

*A full restart is required for a new install.*

## 开发 · Develop

```bash
npm test          # 产物新鲜度 + 80 个单测 · freshness check + 80 unit tests
npm run build     # client/src/* -> client/client.js
```

五个测试文件：

- `test/levels.test.mjs`（25）—— 档位解析：0/1/2/3/5 档、未知 id 的文案回落、`defaultEffort` 徽标、换模型时的夹取、排序稳定性；
- `test/write.test.mjs`（17）—— 写入路径：payload 逐字段对宿主形状、未声明档位拒写、失败回滚、目录事件重载、服务缺失/销毁降级；
- `test/view.test.mjs`（14）—— 渲染：档数等于刻度数与 `max`、`aria-valuetext`、警告只在 `max`、0 档不渲染、1 档渲染标签；
- `test/wiring.test.mjs`（8）—— **接线回归**：`remote.session` 必须作为独立依赖注入、注入后行能读到目录并渲染滑块、拖动写出的 payload、Cordis 风格会抛错的 `remote.session` 属性读取不会让行卡死、目录读取失败会被记录、`$on` 抛错不影响注册；
- `test/locale.test.mjs`（16）—— 双语键集一致且语言纯净、占位符契约、样式表无盐化类/无调色板字面量/尊重减少动效。

## 已知限制 · Known limits

- **只读目录里有的档位。** 宿主明确「没有任意强度输入」（`ui-model-selection` README: *there is no arbitrary effort input*），所以这里也不提供文本框或自定义档。
- **改的是「下一次请求」。** 宿主语义：完整的 selection 在下一次请求生效；正在跑的 step 保持它开始时用的模型与强度。滑块因此不会打断进行中的回答。
- **不是全局设置。** 强度是**每个会话**自己的选择（与宿主一致），不是存储在本插件里的偏好；切换会话时滑块显示那个会话的档位。
- **需要 `sessions` + `remote`。** 两者缺失时插件照常加载但不注册行 —— 一条写不进去的滑块比没有更糟。
- **外观页尚未落地。** 现在在「通用」页；迁移见上一节。

## 参考 · Reference

- [`.reference/open-claude-ui/code-examples/ModelSelectorEffort.tsx`](../../.reference/open-claude-ui/code-examples/ModelSelectorEffort.tsx) —— 视觉语言与文案来源（胶囊 + 下拉，本项目改造成滑块）
- [`.reference/open-claude-ui/AGENTS.md`](../../.reference/open-claude-ui/AGENTS.md) —— CDS 令牌、药丸圆角、单笔触边框、动效纪律
- [`docs/host-hooks.md`](../../docs/host-hooks.md) —— 稳定钩子纪律
