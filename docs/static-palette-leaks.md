# 静态调色板泄漏清单（自查）

宿主把颜色分成两层：**alias 层**（`--dsw-alias-*`，语义令牌）与**静态层**（`--dsw-static-*`，原始色阶）。
本插件只覆盖 alias 层。任何**直接**消费静态层的规则都不会被主题影响，会保留宿主原色 ——
在暖灰 + 陶土的整体基调里，这些就是"冷色补丁"。

本清单由自查产出，等 `audit-token-coverage.md` 回来后再交叉核对。

---

## 已确认：蓝色残留（P1）

| 位置 | 声明 | 影响 |
|---|---|---|
| 文件类型图标 | `--dsh-file-type-default-color: var(--dsw-static-deepseek-500)` | `.md` / `.html` / 代码文件图标保持 DeepSeek 蓝 |
| 文件类型图标（Word） | `var(--dsw-static-deepseek-450)` | 同上 |
| Context meter | `--meter-tint: var(--dsw-static-blue-450)` | 上下文用量条的 messages 段仍是蓝 |
| Toast 操作链接 | `color: var(--dsw-static-deepseek-400)` | toast 里的"撤销"等链接是蓝 |

来源：`.repro/frontend.css`（`._code_1wejo_8`、`._html_1wejo_20`、`._markdown_1wejo_28`、`._word_1wejo_48`、`._action_l6cvn_55`）与 `.repro/bundles/dsh-client-ui-conversation.js`（`_2WTFBq_colorMessages`）。

**为什么 token 层修不了**：这些是静态层的直接引用，不是 alias。覆盖 `--dsw-static-deepseek-*` 会同时改掉所有其他消费方，副作用不可控。

**可用接缝**：宿主把其中一部分抽成了中间变量（`--dsh-file-type-default-color`、`--meter-tint`），可以在组件作用域重绑，这是最小副作用的修法。

---

## 已确认：中性灰与暖灰色相冲突（P2）

Plan / Schedule / Deliverables 三种卡片用自己的中间变量吃静态中性灰：

```css
--plan-card-fill: var(--dsw-static-neutral-50);   /* #fafafa */
--plan-card-hover: var(--dsw-static-neutral-100);
body[data-ds-dark-theme] { --plan-card-fill: var(--dsw-static-neutral-850); }  /* #212123 */
```

**量化**：

| 对比 | 比值 | 结论 |
|---|---|---|
| `#fafafa` vs 主题画布 `#fcfcfb` | 1.017 | 亮色下几乎不可见，**不修** |
| `#212123` 色相 240（偏蓝）vs 主题深色底座 `#151515`（中性） | — | 深色下卡片泛蓝，与暖灰底座冲突，**要修** |

来源：`.repro/bundles/dsh-client-ui-plan.js`（`KuQXFq_card`）、`dsh-client-ui-schedule.js`（`QSKnSa_card`）、`dsh-client-ui-deliverables.js`（`kuvljq_card`）。

**修法**：这三处都用了 `--plan-card-fill` / `--card-fill` / `--changes-fill` 这类**局部中间变量**，在样式表里按组件名重绑即可，不需要动静态层。

---

## 判定为不需要修

| 位置 | 原因 |
|---|---|
| `--dsw-static-neutral-00` 50% 白用于卡片图标底 | 是半透明白，在任何底色上都读作"提亮"，无语义色相 |
| 右侧栏 hero 图标 `--dsw-static-neutral-200/700` | 纯灰，且该区域是引导页，出现频率低 |
| `--dsw-static-green-*` / `amber-*` / `red-*` 用于文件类型 | 与主题状态色同族，色相本来就该保留 |

---

## 待办

- [ ] 交叉核对 `audit-token-coverage.md`（子代理产出后）
- [ ] 修 after 审查确认：文件类型图标、context meter、toast 链接的蓝色
- [ ] 修深色下三种卡片的泛蓝色相
