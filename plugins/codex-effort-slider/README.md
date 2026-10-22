# @hwfee/dsh-codex-effort-slider

Codex 风格的**推理等级滑条**，给 DeepSeek Harness（DSH）。

它把宿主模型菜单里那条「推理等级」行加高，在下面铺一条可拖动的连续滑条：
**一档一色，越往右越"通电"** —— 填充从蓝渐变到紫罗兰，高档位亮起紫色星云与错峰星尘粒子，
官方那一行右端的档位文字（`High` / `Max`）也跟着变色。`Off` 档保持官方灰。

> **移植声明**：本插件是 [`Microqian2th/dsh-codex-effort-slider`](https://github.com/Microqian2th/dsh-codex-effort-slider)（MIT，v1.1.2）的移植，
> 保留上游版权声明。完整归属与**逐项修改清单**见 [licenses/NOTICE.md](licenses/NOTICE.md)，
> 上游许可原文见 [licenses/UPSTREAM-LICENSE.txt](licenses/UPSTREAM-LICENSE.txt)。动画数学、档位判定与视觉取值来自上游，
> 不要在没有对照 NOTICE 的情况下"顺手修正"它们。

## 用法

| 操作 | 结果 |
|---|---|
| **拖动** | 跟手连续运动；拖到哪一档就即时切换到哪一档 |
| **右键**（或长按 600ms、或聚焦后 `Shift+F10`） | 打开设置面板 |
| **键盘** | 聚焦滑条后 `←/→` 或 `↑/↓` 逐档，`Home`/`End` 到两端；`Esc` 关闭设置 |

设置项（即时生效并记住）：

| 设置 | 可选 | 说明 |
|---|---|---|
| **动画效果** | 快速动画 / 简洁动画 / 完整动画 | 三种手感。**快速**复刻 Codex 桌面版：旋钮不跟手、一档一格、约 70–85ms 吸附；**完整**最跟手 |
| **已到达档位的刻度点** | 亮白显示 / 与未到达同色 / 隐藏 | 轨道上那些定位小点 |

设置存在 `localStorage` 的 `dsh-codex-effort-slider.settings`（**沿用上游键名与 schema 版本**），
所以从上游版本升级过来时动画模式不会丢失。

## 它不做什么

- 不在输入框工具行加任何东西（没有胶囊、没有浮层）。
- 不注入消息、不订阅回合事件、不构造会话内容——结构上没有这条路。
- **不装饰不属于自己的菜单**：只有「模型菜单根面板」且第一行是模型行（`模型`/`Model`）时，
  才认定第二行是推理等级行。权限、计划、附件这类两行下拉不会被误装滑条。
- 当前模型没有推理档位、或目录尚未加载时，**不渲染控件**（一个不能用的滑条会骗人）。

## 减少动态效果

系统开启「减少动态效果」时，本插件**完全停止**粒子与扫光（不是放慢），也不构建粒子节点；
旋钮直接跳到目标档位而不做补间。**功能和写回不受影响**——这是唯一有意偏离上游的**动画行为**
（上游的 2.6× 放缓绑在「简洁动画」那一档，与系统偏好无关），原因见 NOTICE 第 3 条。

这个判断**优先于设置里选的动画模式**：系统要求减少动态时，快速/简洁/完整三种都按上面的方式
停止（`client/src/component.js:127-131` 直接把模式置为 `reduced`）。设置面板底部那行说明写的
就是这一条；两处必须一起改。

## 安装

**这是本地开发版本，尚未发布到 npm。** 下面的 `dsh plugin add @hwfee/dsh-codex-effort-slider`
现在会失败（404），因为 registry 上没有这个名字。等你把这个包发布出去之后，它才会成立。

从本地构建产物安装（`npm pack` 打一个 tgz，再让 DSH 装它）：

```powershell
cd plugins/codex-effort-slider
npm run build && npm test          # 先确认产物新鲜、测试全绿
npm pack                            # 产出 hwfee-dsh-codex-effort-slider-0.1.0.tgz
dsh plugin --profile <profile> add (Resolve-Path .\hwfee-dsh-codex-effort-slider-0.1.0.tgz)
```

`npm pack` 的 tgz 只包含 `files` 白名单里的东西（`lib`、`client/client.js`、`locale`、
`licenses`、patch、图标、README），所以它验证的正是发布包的内容，而不只是工作区。

开发时也可以直接 `link:` 到本目录；`client/client.js` 是**提交进 git 的产物**，改了
`client/src/` 必须 `npm run build`。

DSH Desktop 的 `desktop` profile 由应用独占管理，请走 **设置 → 插件 → 添加插件**。
**装完必须完全退出并重开应用**：client bundle 在页面启动时加载，刷新不够。

发布之后，上面那条按包名安装的命令才会取代 `npm pack` 这一步。

## 验证状态

| 层 | 状态 |
|---|---|
| `npm run build` + `--check` | 产物由 esbuild 生成，构建脚本从 `package.json` 读包名注册 id，并在**两条路径**上都执行 factory（防「注释里一个反引号炸掉 web boot」） |
| `npm test` | 8 个测试文件、**161 项全过**（本机 256 MB heap、约 19s）：档位算术、运动引擎、能量与粒子、设置与迁移、DOM 桥、清单契约、Host 半边，以及真实 React 18 + jsdom 的 21 项组件集成测试 |
| inject 核对 | `dsh.client.inject` 的 3 个包 ID 逐条与**真实 app.asar** 条目核对存在且 `pkg.name` 一致（renderer / conversation / model-selection，均 0.2.1-rc.2） |
| 静态审计 | 仓库级 `node tools/audit.mjs`（相对仓库根，不是插件目录）全部通过（不安全 DOM / eval / observer 释放 / storage guard / effect disposer） |
| 离线 fixture | [`fixture/index.html`](fixture/index.html) 由 `node tools/fixture-offline.mjs` 从**当前** `client/client.js` 生成，截图 [`fixture/01-all-presets.png`](fixture/01-all-presets.png)。`npm test` 的清单契约会核对页面内嵌的产物与 `client/client.js` 逐字节一致、且页面自报的字节数确实是字节数（不是字符串长度）——改了产物忘记重生成，它会红 |
| **真机** | **未验证**。本插件从未安装到任何真实 profile，因此「在真实应用里出现并写回档位」这一条没有证据。请勿把离线 fixture 的结果当作真机通过 |

## 维护要点

- **包名出现在四个地方**，改名必须同时改：`package.json.name`、`cordis.patch.yml` 的 `name`、
  构建产物注册的 id（构建脚本自动读清单，不要手写）、profile 的依赖与 `bundles`。
- **`dsh.client.inject` 是包 ID 不是服务名**，它决定冷启动时 `require('react')` 能否解析；
  缺了它，插件会「装上、挂载、然后什么都不做」。
- 生命周期：样式表、设置面板与它的全部 `document` 监听、DOM 桥（含 `MutationObserver`）、
  目录访问器都由同一个 `ctx.effect` 的 disposer 收回。停用插件后，宿主菜单上由**本插件**
  写过的痕迹被逐项恢复：我们加的行高与内边距、`flex-wrap`、行内自绘的 `box-shadow`、
  宿主档位文字与折叠座位标签的 `color`（各自恢复到**各自原有的内联值**）、以及我们
  append 进去的那个容器节点。**不是**把整行"逐字节复原"——宿主在自己重渲染时写下的
  内联样式仍归宿主，我们只撤自己写过的那几项。

## License

MIT。上游版权归 `dsh-codex-effort-slider contributors`（2026），见 `licenses/`。
