# 主题覆盖审查（自查，替代子代理）

子代理连续两轮未产出文件，以下为同范围自查结果。交叉核对项已标注。

---

## 一、内联字面色（CSS 无法触及）

扫描 25 个 bundle 的全部 `style:` 对象，只找到两处字面颜色，都**不该改**：

| 位置 | 内联值 | 判定 |
|---|---|---|
| 品牌 loading 圆环 | `conic-gradient(rgb(65,225,172) → rgb(101,142,255))` | **保留**。DeepSeek 品牌标识，属 artwork，主题不接管 |
| KaTeX 公式错误 | `color: "#cc0000"` | **保留**。仅在公式语法错误时出现，非常规界面元素 |

除这两处外，全部内联 style 都是布局（`left` / `gridColumn` / `width`），不涉及颜色。
**结论：内联字面色不是本主题的失效来源。** 唯一例外是 Shiki 的 token 色，已在 `theme-defects.md` 缺陷 2 处理。

---

## 二、静态调色板泄漏

共 **16 处**直接消费 `--dsw-static-*`，其中 11 处在 `frontend.css`、5 处在组件 bundle。
详细清单见 [`static-palette-leaks.md`](static-palette-leaks.md)。

**要修的（蓝色残留，P1）**

| 位置 | 消费的静态令牌 |
|---|---|
| 文件类型图标 `.md` / `.html` / 代码 | `--dsw-static-deepseek-500` |
| 文件类型图标 Word | `--dsw-static-deepseek-450` |
| Context meter messages 段 | `--dsw-static-blue-450` |
| Toast 操作链接 | `--dsw-static-deepseek-400` |

以上四处都能通过**宿主已抽好的中间变量**重绑（`--dsh-file-type-default-color`、`--meter-tint`），不需要动静态层。

**要修的（深色泛蓝，P2）**

Plan / Schedule / Deliverables 卡片吃 `--dsw-static-neutral-850`（`#212123`，**色相 240 偏蓝**），
与主题深色底座 `#151515`（中性）冲突。亮色侧 `#fafafa` vs 画布 `#fcfcfb` 只差 1.017，**不修**。
三处都有局部中间变量（`--plan-card-fill` / `--card-fill` / `--changes-fill`），可组件级重绑。

**不修的**

| 位置 | 原因 |
|---|---|
| `--dsw-static-neutral-00` 50% 白（卡片图标底） | 半透明白，任何底色上都读作提亮，无语义色相 |
| 右侧栏 hero 图标 `neutral-200/700` | 纯灰，且仅在引导页 |
| `green` / `amber` / `red` 文件类型色 | 与主题状态色同族，色相本就该保留 |

---

## 三、交互态覆盖

逐一核对 `styles.js` 的规则与宿主的态：

| 区域 | 静止 | hover | focus-visible | active | selected | disabled |
|---|---|---|---|---|---|---|
| 输入框卡片 | ✅ 令牌 + 规则 | ✅ 有规则 | ✅ `:focus-within` | ✅ 无（宿主无此态） | — | — |
| 代码块 | ✅ | — 宿主未定义 | — | — | — | — |
| 菜单 | ✅ 双环 | 宿主 | 宿主 | — | — | — |
| 设置行（宿主） | ✅ 令牌 | 宿主 | ✅ 全局环 | 宿主 | ✅ 已修 | 宿主 |
| 插件自有控件 | ✅ | ✅ | ✅ | ✅ | ✅ | — |

**发现一处缺口**：`styles.js` 的全局焦点环覆盖了 `body :focus-visible:not(:read-write)`，
但**没有为 `prefers-reduced-motion` 做降级** —— 唯一的过渡是 `[data-composer-card]` 的 box-shadow 与
`[data-composer-chip]` 的背景色，两者都是 120–200ms 的短过渡，不构成动效问题。
**判定：不构成缺陷，记录备查。**

---

## 四、对比度

已由 `test/tokens.test.mjs` 在**明暗两套 + 四个强调色预设**下逐对断言，当前 60 项测试全过。
覆盖：正文/次级/三级/caption、侧栏、输入框、卡片、链接、品牌文字、按钮白字、半透明气泡与悬停洗色。

历史缺陷（已修）：caption 曾用 `#a5a5a5` 得 2.40:1，低于大字号 3.0 底线。

---

## 五、修复优先级

| P | 项 | 改动位置 |
|---|---|---|
| P1 | 文件类型图标蓝色 | `styles.js` 重绑 `--dsh-file-type-default-color` |
| P1 | Context meter 蓝段 | `styles.js` 重绑 `--meter-tint` |
| P1 | Toast 链接蓝色 | `styles.js` 覆盖 `[class*="action"]` 的 color |
| P2 | 三种卡片深色泛蓝 | `styles.js` 重绑各自中间变量 |
| — | 品牌 loading 环、KaTeX 错误色 | 不改，已说明理由 |
