# HwFee-dsh — DSH 插件集合

DeepSeek Harness（DSH）的插件集合。每个插件是 `plugins/` 下的独立包：各自有清单、补丁、构建脚本与测试，可单独安装、单独停用。

![英文界面](assets/screenshot-en.png)

![中文界面](assets/screenshot-zh.png)

*同一套插件在英文与中文界面下的样子：CDS 主题的暖灰表面与陶土橙强调色、首页衬线问候语、用量统计面板，以及输入框与代码块的组件级细化。*

## 设计来源 · Design provenance

**本项目的设计语言来自 [open-claude-ui](https://github.com/Caho1/open-claude-ui)** —— 那是对 Anthropic **Claude Design System (CDS)** 的干净室逆向还原，MIT 许可。这里的东西不是在另起炉灶：令牌阶梯、双环焦点、有机动效曲线、单笔触边框纪律、以及大量组件规格，都是从那套规范里逐项取出来的。

具体怎么取：

- `docs/cds-spec.md` 是从参考仓库**逐行取证**的规范，每个数值都带 `文件:行号`，对源内 18 处冲突有裁定表；
- `plugins/cds-theme/client/src/palette.js` 里每个颜色都附了规范出处，改值必须同步改引用；
- 参考仓库本身是只读克隆，放在 `.reference/`（**不入库**），只作证据，不参与构建。

有一项例外要讲清楚：**首页点击波纹不是从参考仓库来的**。那套规范里没有这个效果的实现（`ripple` / `glyph` / `code symbol` 全分支搜索 0 命中），它还原的是 Claude Code 桌面版上线过约一天的首页实验特性（[anthropics/claude-code#102952](https://github.com/anthropics/claude-code/issues/102952)）。不过它仍然**踩在 CDS 的技术结论上**：参考仓库唯一的 canvas 环境光晕实现（`ReasoningAmbientGlow.tsx` 里的 `AmbientLightFieldCanvas`）说明这家的做法是径向渐变柔光、从不描边 —— 波纹正是照这条做的，也因此没有圆环。

*The design language comes from [open-claude-ui](https://github.com/Caho1/open-claude-ui), a clean-room reverse-engineered Claude Design System under MIT. Token ladders, the dual-ring focus, the organic motion curves, the single-stroke border discipline and many component specs are taken from that reference, item by item, with file:line citations kept in `docs/cds-spec.md`. The one exception is the home-screen click ripple: that effect is not in the reference repo at all (zero hits for `ripple` / `glyph` / `code symbol` across every branch), and reconstructs a Claude Code desktop feature that shipped for about a day — though it still follows the reference's one canvas precedent, which draws light with radial gradients and never strokes.*

## 插件

| 插件 | 目录 | 作用 |
|---|---|---|
| `dsh-cds-theme` | [`plugins/cds-theme`](plugins/cds-theme) | Claude Design System 主题：把宿主 `--dsw-*` 令牌整体重映射到 CDS 的暖灰表面、陶土橙强调色、双环焦点与有机动效；组件级细化输入框、侧栏、消息行、代码块与 Markdown 正文；首页衬线问候语；空白会话的代码字形背景与点击波纹；长文本粘贴转文件引用；「主题定制」设置页。 |
| `dsh-system-fonts` | [`plugins/system-fonts`](plugins/system-fonts) | 字体插件：内容字体 / 代码字体 / 终端字体各一槽，可选字重、行距、字距。只改排印，不动配色。 |
| `dsh-usage-stats` | [`plugins/usage-stats`](plugins/usage-stats) | 用量统计：会话数、消息数、token 总量、活跃天数、高峰时段与热力图，范围可选全部 / 30 天 / 7 天。 |
| `dsh-reasoning-effort` | [`plugins/reasoning-effort`](plugins/reasoning-effort) | 思考强度滑块：档位数量**由提供商实际声明决定**，未声明则不出现整行。 |

四个插件互不依赖，可分别启用。装在一起也安全 —— 各自只碰自己的令牌与槽位，没有重叠的所有权。

## 安装

```bash
# 在插件目录内先构建产物（link: 安装不会自动构建）
cd plugins/cds-theme && npm ci && npm run build && cd -

dsh plugin --profile desktop add link:C:/Users/17445/Desktop/HwFee-dsh/plugins/cds-theme
```

装完**必须完全退出并重开 DeepSeek Harness**：插件的加载发生在 profile 组装期，正在运行的进程不会热加载它。

用 `link:` 而不是 `file:`，profile 里指向源码目录，改完源码重启 DSH 即可生效，不必重装。

移除：

```bash
dsh plugin --profile desktop remove dsh-cds-theme
```

## 开发

每个插件目录内独立运行：

```bash
npm ci           # 依赖（只需 esbuild）
npm test         # 校验产物新鲜度 + 全部单测
npm run build    # client/src/* -> client/client.js
```

`client/client.js` 是**提交进仓库的产物**：`link:` 安装指向源码目录，profile 启动时不会替你构建，所以产物必须与源码同步。`npm test` 的第一项就是新鲜度检查（`build-client.mjs --check`），产物过期会直接失败。

`.gitattributes` 把换行固定为 LF。这不是洁癖：产物是逐字节比对的，Windows 默认的 `core.autocrlf=true` 会让 checkout 出的源码带 CRLF，esbuild 再把它们写进 bundle，于是干净克隆上的新鲜度检查必然失败 —— 实测多出 83 字节，正好是进入 bundle 的换行数。

## 仓库级检查

```bash
node tools/audit.mjs                       # 产物预算、unsafe DOM、eval、观察器释放、开关契约
cd plugins/cds-theme && node tools/verify.mjs   # 主题自身的 73 项断言
```

## 目录结构

```
plugins/
  cds-theme/
    client/src/      客户端源码（ESM），esbuild 打包成宿主模块格式
    client/client.js 提交的产物
    lib/index.js     Host 半边（字体路径注入 + 长粘贴路由）
    locale/          en.json / zh.json —— 插件列表里的标题与描述
    icon.svg         插件图标
    test/            node:test 单测
    tools/           构建与验证脚本
  system-fonts/      ... 同上结构
  usage-stats/
  reasoning-effort/
docs/
  cds-spec.md                    CDS 设计系统规范（从参考仓库逐行取证）
  host-hooks.md                  宿主 DOM/CSS 可覆写点勘察
  reference-absorption-ledger.md 参考项吸收台账
  replication-toggles.md         复刻项与开关约定
  perf-audit.md                  性能测量与预算依据
skills/
  dsh-plugin-guide/              第三方插件开发知识库（自带 LICENSE / NOTICE）
tools/                           仓库级审计与基准脚本
```

## 参考

`docs/` 下的文档是本仓库实现的依据，不是概述：

- [`docs/cds-spec.md`](docs/cds-spec.md) —— 从 `open-claude-ui` 逐行提取的设计系统规范，含 18 处源内冲突的裁定表。
- [`docs/host-hooks.md`](docs/host-hooks.md) —— 宿主哪些 `data-*` 是可靠样式锚点、哪些是哈希类、以及 `--dsw-elevation-*` 为什么必须用 `!important` 样式表而不能走内联令牌。

`.reference/open-claude-ui` 是参考项目的一个干净克隆（MIT），只读，**已列入 `.gitignore`**，不参与构建。

## 第三方内容

`skills/dsh-plugin-guide/` 是独立第三方知识库（Apache-2.0），内含 DeepSeek 官方文档的 MIT 归档。它自带 `LICENSE` 与 `NOTICE.md`，并按自己的约定排除了 `downloads/`。分发前请以它的 NOTICE 为准。
