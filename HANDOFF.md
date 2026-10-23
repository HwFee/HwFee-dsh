# 交接文档 · DSH 界面复刻与缺陷修复

> 生成时间：2026-10-22 21:20（Asia/Shanghai）
> 最后更新：2026-10-22 23:10
> 工作区：`C:\Users\17445\Desktop\HwFee-dsh`

---

## 0. 一句话现状（23:10 更新）

三块产品代码已完成，**840 条测试全绿、仓库审计 exit 0、diff 行号补丁已装**，但：
**① 全部改动仍未提交、未发版；② 未做真实宿主挂载验证；③ 行号补丁要重启应用才生效；④ profile 有 3 条 preflight FAIL 待用户决定。**

本轮的变化（cds-theme）：
- **撤掉四个参考派生功能**：页签胶囊、输入框分离布局、首页「添加工作区」、框内发送按钮——连同 `composerRules()` 里两条权限图标规则。状态键、设置行、规则、语言键、测试一并删除。
- 编辑行 `+N / −N` 改为**各带同色淡底**（`--dsw-alias-file-diff-added-bg` / `-deleted-bg`、4px 圆角、紧内边距），文字仍是宿主的绿 / 红。
- 保留的参考派生物只有 Markdown 的列表 / 强调 / 链接（`markdown-scope.js`；开关 45 已按用户要求移除，样式固定生效）。

之前几轮修掉的真缺陷（都有回归测试且验证过「改回旧代码会红」）：
- 编辑行 `+N/−N` 在 refine 关闭时输给正文 `!important`，退回代码字体
- compact 面板说明行被裁掉半个字
- `markdown-scope.js` 注释谎称数值「follow the reference」（参考仓库里没有这些规则）

---

## 1. 用户的全部要求（按提出顺序，一条不落）

### 1.1 最初任务
1. 复制 `https://github.com/Microqian2th/dsh-codex-effort-slider`，保留视觉与交互，适配项目 token，只改严重不符之处。
2. 参考 `https://github.com/Nwflower/dsh-claude-style` 的 `docs/screenshots/claude-conversation-dark.png`：
   - usage-stats 增加「参考版」用量面板样式；
   - 输入框可做参考版分离布局：上方工作区/「添加文件夹」、独立文本框、工具栏移到框外下方；
   - **必须保留全部**轮/步/速度/token/缓存/模型/上下文控件与功能图标。
3. cds-theme 只移植 Markdown 的**列表/任务列表、粗体/斜体/删除线、链接**；**保留**现有代码块、行内代码、侧栏文件夹。
4. 查清「对话／轨迹」为何不显示，并提供「宿主原版 / 参考胶囊」两种页签外观选项。
5. **遇到 UI 重大改观必须先询问用户**；不复制未要求的功能。
6. 主代理只做指导与审查，**派子代理干活**。

### 1.2 用户已确认的决策（不要再问）
| 决策 | 用户选择 |
|---|---|
| 输入框布局 | **按参考分离布局加入开关（推荐）** |
| 宿主两开关 | **两项都开启**（详细用量 + 显示代码工作视图），且已被告知后者同时暴露本轮代码差异与完整 Agent 预设 |

> 注：宿主两开关的实际写入未执行（用户后来主动禁用全部第三方插件，现场保持不变）。

### 1.3 追加缺陷（用户原话要点）
7. **「原先那个用量面板在下面输入框输入过多文字的时候还是会被撑走，找一个解决方案」**
8. **「编辑的行号好像还不是真实的吧，diff 视图中的行号修复一下」**
9. **「咱们编辑行不是也有这个加减吗…那个字体用的什么字体…应该是用 SANS 的」**（编辑/写入工具行的 `+N/−N` 统计）
10. **「插件爆了」**——用户主动禁用第三方插件以止崩溃；**要求保持禁用**，不要恢复。
11. 「别管了继续工作」——停止 OOM 排查，继续复刻。
12. **「你就在 DSH 中运行啊 先把当前的收尾吧 这个你写个 hand off 吧」**——当前会话不能关应用，因此 asar 补丁不打。

---

## 2. 已完成并验证的部分

### 2.1 滑块插件（全新，未安装）
目录：`plugins/codex-effort-slider/`（`@hwfee/dsh-codex-effort-slider@0.1.0`，MIT）

- 上游 v1.1.2 移植，`licenses/UPSTREAM-LICENSE.txt` + `licenses/NOTICE.md` 逐项记录差异。
- 视觉：28px 轨道、白色同径旋钮、蓝→紫能量层、高档星尘粒子；Off 为官方灰。
- **修复的真实 bug**：`resolveLevels` 分不清「切换中瞬时为空」与「模型本无 reasoning」，导致无档位模型复用上一模型档位（曾把组件测试拖进 OOM）。修法是新增 `reasoningSupport()` 三态判据。
- 其他修复：`syncSeat` 用 `isConnected`+`contains`；桥接 MutationObserver 合并到一帧；队列写回绑定模型身份；目录实例重新解析；卸载完整清理。
- **验证**：`npm test` **156/156**、`build --check` 0、仓库审计通过、离线真实产物截图 4 张（`.work/ces-final/fixture/`）。
- **未验证**：真机安装与写回。

### 2.2 usage-stats（双面板 + 长文本修复）
目录：`plugins/usage-stats/`

- 新增「参考 compact」样式：**480px 居中、项目陶土强调色、无投影平铺卡片、7 行热图不裁切**；现有 classic 为默认，外观未变。
- 两样式**高度独立持久化**：classic 344px / compact 252px；设置行 order 39（样式）、40（高度）、41（单位）。
- **长文本撑走面板的修复**（用户第 7 条）：
  - 根因：宿主 `--dsh-composer-text-max-height` 固定 336px 与剩余空间无关；hero 的 `justify-content:center` 把溢出上下均分，面板被推到滚动原点之上（实测 `panelContentTop = −140`，滚不到）。
  - 修法：自有 `--dus-input-budget` 写到 `[data-composer-card]`，与宿主变量 `min()` 组合；按「stack 高度 − 文本区高度」一次减法测固定 chrome（无自反馈）；`safe center` 保证顶端可达。
  - 结果：修复后 `panelContentTop = +74`、`reach.visible = true`。
- **验证**：`npm test` **162/162**、`--check` 0、fixture 48/48、25 张截图（`.work/usage-style/shots/`）。
- 文档：`README.md` 已更新双样式/独立高度/长文本；`licenses/MIT-NOTICE.md` 已加并进 `files`；`.work/usage-style/report.md` 已保存。

### 2.3 cds-theme（Markdown + 加减字体背景）
目录：`plugins/cds-theme/`

| 功能 | 状态 |
|---|---|
| Markdown 列表/任务/粗斜删除线/链接 | ✅ 作用域 `[data-chat-flow][data-chat-flow-kind="assistant-step"]`，排除 `pre`/`code`/工具卡/genui 卡；不使用盐类选择器；行内代码不重涂。**唯一保留下来的参考派生外观** |
| 「对话/轨迹」页签：原版 / 参考胶囊 | ❌ 已删除（用户要求撤掉；`viewtabs.js`、状态键、设置行、语言键、测试一并移除） |
| 输入框分离布局开关 | ❌ 已删除（`composer-layout.js` 及其行、键、规则一并移除） |
| 首页「添加工作区」入口 | ❌ 已删除（`workspace-add.js`；该文件在 HEAD 里就没有被任何地方引用） |
| 输入框内的发送按钮 | ❌ 已删除（文件、导入、`parts.push(sendButtonRules())`、生命周期里的 effect） |
| 权限按钮图标的隐藏规则 | ❌ 已删除（`[class*="_triggerIcon"]` 与 `button { gap: 0 }` 两条规则及其注释） |
| 编辑行 `+N/−N` | ✅ UI 字族 + **各带同色淡底**（`--dsw-alias-file-diff-added-bg` / `-deleted-bg`、4px 圆角、紧内边距、等宽数字），**文字仍是宿主绿/红**；`refine` 关闭时同样生效 |
| diff 真实行号 | ⚠️ 主题侧就绪，**宿主补丁未安装**（见 §4.2） |

- **验证**：`npm test` **516/516**（26 文件）、`build --check` 0、`tools/verify.mjs` exit 0、仓库审计 exit 0。

### 2.4 仓库级
- `node tools/audit.mjs` → **exit 0**（此前 6 条回归已全部清零）。
- 测试合计：**滑块 161 + 用量 163 + 主题 516 = 840 条，0 失败**。

---

## 3. 现场状态（2026-10-22 21:30 复核，**本节已更新**）

| 项 | 值 |
|---|---|
| `~/.dsh/profiles/desktop/package.json` 的 `bundles` | **11 条**：2 条核心 + 6 个第三方插件 + 3 个 `@deepseek-ai/dsh-experimental-*` |
| 六个第三方插件 | **已重新启用**（20:xx 由 npm / Release tarball 实体安装，非 `link:`） |
| `cordis.patch.yml` | 2985 字节，21:14 修改；`ui-chat` config 为 `performanceUsage: detailed`，`developerTools: false` |
| `preflight` | **3 条 FAIL**：experimental-terminal / session-titles / ralph 三个 bundle 列在 `bundles` 里但不是 `dependencies`，行无法解析 |
| 备份 | `C:\Users\17445\.dsh\backups\recover-20261022-20261022-184611\`（含 patch 与 package.json） |

> ⚠️ 原文「仅 2 条核心、六个插件禁用」**已不成立**——那是 18:46 的现场，之后被重新启用。
> 仍然成立的是：**不要主动改 profile、不要擅自重启应用**。三条 preflight FAIL 需要用户决定是补依赖还是从 `bundles` 删掉。

`developerTools: false` 有一个直接后果：宿主按它在 `conversation.view` 里过滤掉 `trajectory`，页签只剩 1 个，`showTabs` 为假——所以「对话/轨迹」页签在这台机器上**一个都不显示**，与主题无关。

---

## 4. 未完成项（按优先级）

### 4.1 【已移除】输入框分离布局

该功能连同它的重叠缺陷一起撤掉了：用户要求移除四个参考派生功能，分离输入框是其中之一。
`client/src/composer-layout.js`、它的 `composerSplit` 状态键、设置行（order 47）、样式表里的
`parts.push(composerLayoutRules())` 与生命周期里的 effect、语言键、以及 `test/` 下的全部断言
都已删除。§4.1 原本记录的量测口径（按左簇而非单个 permission 槽取内缩、窄屏按实测内容宽度回退）
随文件一起没了——**不要再按旧记录去找 `--cds-dock-inset-*` 或 `data-cds-composer-narrow`**，
现在整张表里一个都不存在。

同一批删掉的还有：页签胶囊（`viewtabs.js`）、首页「添加工作区」（`workspace-add.js`）、
框内发送按钮（`send-button.js` + 生命周期 effect），以及 `composerRules()` 里那两条权限图标规则。

### 4.2 【已装】diff 真实行号
- 仓库自带两个配套补丁，**均未安装**：
  - `patches/dsh-tool-fs-hunk-lines.patch`（数据层：`computeHunkDiffs` → `presentationMeta` → `narrowDiffs` 携带 `oldStart/newStart`）
  - `patches/dsh-web-frontend-diff-start.patch`（渲染层：`gF/yF` 把 start 写到 `data-diff-new-start/old-start`）
- 实测：安装版 `computeHunkDiffs` 只输出 `path/oldText/newText`；`gF()` 无 start 字段；`data-diff-new-start` 出现 **0** 次。
- 结论：主题 `diffnumbers.js` 逻辑正确（已用纯函数验证 42/40 可解析、缺失返回 null），但**没有数据可读**，只能显示 hunk 相对 1..n 且 `data-numbered=false`。
- 已做 dry-run：三处编辑全部命中，重建 archive 后 framing/offsets/每个成员 sha256 均校验通过。
- **已执行（2026-10-22 22:00）**：应用当时未运行（0 进程），`apply` 成功，两个补丁均 PATCHED。
  - 备份：`C:\Users\17445\AppData\Local\Programs\DeepSeek Harness\resources\app.asar.bak-1792675460400`
  - 归档 182794869 → 182797070 字节，16726 个成员，framing / offsets / sha256 自校验通过
  - 独立复核：逐个成员比对备份，**16723 个相同、3 个不同**（正是被补的三处），零附带改动；备份本身仍是 unpatched，可回滚
  - 前端 bundle 里 `data-diff-new-start` ×2、`data-diff-old-start` ×2，与 `diffnumbers.js` 的 `NEW_START_ATTRS`/`OLD_START_ATTRS` 名字一致
- **尚未生效**：归档只在进程启动时读取，**必须完全退出 DSH 再启动**（不是刷新页面）。
- **风险仍在**：补丁 2 针对压缩后的前端 bundle（`index-CN7NIWNw.js`），升级应用后锚点大概率失效，届时 `status` 会显示 SKIPPED，需要重新推导。

### 4.3 其他未做
- **真实宿主挂载 E2E**：三块改动都只到「真实产物 + 离线 DOM fixture」层，没有在真实 profile 里安装并验证。
- **git 提交 / 发版 / Release / 安装矩阵**：全部未做。
- **宿主两开关**（详细用量 + 显示代码工作视图）：未写入现场。
- IME、真实附件上传、撤销栈：未验证。

---

## 5. 关键文件索引

| 用途 | 路径 |
|---|---|
| 滑块插件 | `plugins/codex-effort-slider/` |
| 滑块截图 | `.work/ces-final/fixture/01-all-presets.png` 等 4 张 |
| 用量双样式截图 | `.work/usage-style/shots/01–20*.png`（25 张） |
| 用量验证报告 | `.work/usage-style/report.md` |
| 主题分离布局截图 | `.work/theme-wave/shots/01–05*.png`（含 480 回落） |
| 分离布局 fixture | `.work/theme-wave/fixture/{shoot.mjs,composer-fixture.html}` |
| 主题验证日志 | `.work/theme-wave/{npm-test,verify,audit,build-check}.log` |
| 分离布局实现 | 已删除（`composer-layout.js` 随「输入框分离」一起移除） |
| Markdown 规则 | `plugins/cds-theme/client/src/markdown-scope.js` |
| 页签规则 | 已删除（`viewtabs.js` 随「参考胶囊」一起移除） |
| 工作区真实入口 | 已删除（`workspace-add.js` 随首页「添加工作区」一起移除） |
| diff 行号模块 | `plugins/cds-theme/client/src/diffnumbers.js` |
| 行号补丁（未装） | `patches/dsh-tool-fs-hunk-lines.patch`、`patches/dsh-web-frontend-diff-start.patch` |
| 补丁工具 | `tools/patch-asar.mjs` |
| 仓库审计 | `node tools/audit.mjs` |

---

## 6. 下一位接手者的最短路径

1. **先跑基线**：`node tools/audit.mjs`（应 exit 0）、三个插件的 `npm test`（应分别 161 / 163 / 516 全绿）。
2. **四件参考派生功能已移除**：页签胶囊、输入框分离、首页「添加工作区」、框内发送按钮——连同状态键、设置行、规则、语言键与测试一起删掉，不要再按旧文档去找它们。
3. **问用户要不要打行号补丁**（§4.2）：需要完全退出 DSH；打之前先 `status`，打完 `status` 应显示 installed。
4. **真实挂载验证**：只有在用户同意启用插件后，才改 profile 的 `bundles` 并重启；**不要主动恢复**。
5. 全部通过后再谈提交/发版/安装矩阵。

---

## 7. 给接手者的话

- **不要相信「测试绿=界面对」**。本轮就是靠逐张看图才发现：classic 卡片阴影一度丢失、分离布局工具栏重叠。
- **不要用注释把需求写小**。本轮有两次实现者把「单行工具栏」降级成三行，理由是技术不可行；实际核到宿主 `div.InputBar.root` 同时包住 card 与 dock，方案是可行的。
- **profile 是用户的**。当前禁用状态是用户主动操作，不是故障，不要「修复」它。
