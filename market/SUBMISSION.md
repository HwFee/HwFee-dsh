# 市场提交材料 · Market submission

条目放在 `market/catalog/`，每个插件一个 YAML。**完整流程见 [SUBMISSION-FLOW.md](SUBMISSION-FLOW.md)**；这份文件只记录材料内容与当前状态。

目标市场是 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（`dshmarket.com` 与 `awesome-dsh-plugin.com` 的 catalog 数据源）。

## 当前状态

| 条目 | category | 状态 |
|---|---|---|
| `cds-theme` | `theme` | ✅ 已收录（维护者直接合入 main） |
| `system-fonts` | `ui` | ✅ 已收录；界面字体和字号说明已提交 PR #9162 |
| `usage-stats` | `usage` | ✅ 已收录 |
| `genui` | `ui` | ✅ 已收录（[PR #8392](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8392) 已合并，2026-10-21T17:27Z） |
| `git-bash` | `tools` | ✅ 已收录（同一 PR） |
| `predict` | `ui` | ✅ 已收录（同一 PR） |

PR #8392 只新增了后三条并在两个 README 各加三行，未改动任何既有条目（市场规则要求 PR 不碰与自己无关的条目）。**它已经合并**——之前这张表写「待合并」，是记录过期，2026-10-22 用 `gh pr list` 核对后更正。

**历史待办（2026-10-24 已提交 PR #9162）：`system-fonts` 的上游条目描述落后于代码。** 上游条目写的是「内容、代码、终端三个字体槽 + 行距 + 字距」，
但 0.1.3 起还提供了界面字体、界面字号与行内代码字号两个像素步进器。按 §「描述必须与代码一致」，
下一次发布后应当用 `submit-to-catalog.ps1 -Apply -Update` 更新这一条自己的条目（`-Update` 是必须的：
脚本默认只提交上游没有的条目，正是为了避免 PR 去改动已有条目）。改写时要守住那条边界：
插件**从不写 `font-weight`**，所以任何「字重」措辞都不能出现在描述里。

**2026-10-22 更新：本地两条描述已改，尚未提交上游。**
`system-fonts` 补上了界面字体、界面字号与行内代码字号，措辞刻意不含 weight；
`genui` 原来写「网络、定时器、模块加载与 DOM 全局均被屏蔽」，那是同源求值时代的护栏描述——
代码已改成 opaque-origin 沙箱 iframe（`sandbox="allow-scripts"` 且不带 `allow-same-origin`），
所以描述改成「读不到宿主页面/存储/cookie、帧内 CSP 挡网络、发消息须用户确认」。
两条都逐句对过代码。**本次不新开 PR**：条目结构没变，只是描述措辞与版本推进，
而市场规则要求 PR 不碰与自己无关的条目；等确有结构性变更时再用 `-Update` 一次性提交。

### 2026-10-24 发布与市场更新

| 包 | 版本 | 分发 |
|---|---|---|
| `dsh-cds-theme` | 0.1.8 | npm 与 `cds-theme-v0.1.8` Release |
| `@hwfee/dsh-genui` | 0.1.2 | npm 与 `genui-v0.1.2` Release |
| `@hwfee/dsh-git-bash` | 0.1.2 | npm 与 `git-bash-v0.1.2` Release |
| `@hwfee/dsh-predict` | 0.1.2 | npm 与 `predict-v0.1.2` Release |
| `@hwfee/dsh-usage-stats` | 0.1.4 | npm 与 `usage-stats-v0.1.4` Release |

字体插件保持 0.1.3，六个当前版本已写入 `index.json`。五个新版本均验证了官方版本记录、tarball HEAD/GET 200，以及下载字节与 Release 资产的 SHA-1 一致。

[市场 PR #9162](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9162) 更新主题、字体与生成式 UI 三个现有自有条目；上游合并状态以 PR 页面为准。外部推理滑条已移出仓库，不发布、不启用。

验收证据见 [install-matrix.md](install-matrix.md) 和 [release-verification-2026-10-24.md](release-verification-2026-10-24.md)。不带版本的 predict 仍可能被解析为依赖 rc.2 的 0.1.1，安装说明已改用验证过的 0.1.2 和官方 registry。

### 2026-10-22 发布记录

| 包 | 版本 | npm | GitHub Release | 备注 |
|---|---|---|---|---|
| `dsh-cds-theme` | **0.1.7** | 已发布 | `cds-theme-v0.1.7` | 0.1.6 未在 npm 落地（见 `PUBLISHING.md` 卡死台账），0.1.7 为同内容换号；最终 npm `dist.shasum` 与 Release 资产**逐字节一致** |
| `dsh-system-fonts` | **0.1.3** | 已发布 | `system-fonts-v0.1.3` | 界面字体 + 两个像素步进器 |
| `@hwfee/dsh-git-bash` | **0.1.1** | 已发布 | `git-bash-v0.1.1` | 受限会话 spawn 前拒绝 + 进程树真正停止 |
| `@hwfee/dsh-usage-stats` | **0.1.3** | 已发布 | `usage-stats-v0.1.3` | `lib/usage-ledger.js` 首次发布 |
| `@hwfee/dsh-predict` | **0.1.1** | 已发布 | `predict-v0.1.1` | `lib/` 数据流改动首次发布 |
| `@hwfee/dsh-genui` | **0.1.1** | 已发布 | `genui-v0.1.1` | opaque-origin iframe 隔离 + 发送需确认 |

六个版本都已进 `market/index.json`（`node market/build-index.mjs` 生成，源类型全部 `npm`）。
安装矩阵与挂载结果见 [install-matrix.md](install-matrix.md)。

**cds-theme 在 npm 上的落地过程，如实记录**：0.1.6 发布返回成功但从未出现在 packument，
官方 tarball 一直 404；换号 0.1.7 后，`npm view` 先返回 0.1.7 而 tarball 仍 404 约 30 秒，
随后转为 200。**期间用 Release 资产验证过该包可安装**，所以交付不依赖 npm 通道。
最终 `dist.shasum` 与 Release 资产的 SHA-1 一致，两者是同一份字节。

第一次提交是 [PR #8189](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8189)：维护者读完代码后指出 `system-fonts` 的描述与实现相反——README 与代码都明确「从不写 `font-weight`，字重归宿主主题」，而条目写了「plus weight / 另加字重」。他删掉该词后把三个条目一起合入 main，PR 关闭。本地 `market/catalog` 已同步为改正后的文本。**这就是描述必须属实的实例**：市场的评审会逐句核对代码。

## 为什么是那个市场

| 市场 | star | 收不收本仓库 | 说明 |
|---|---|---|---|
| **awesome-dsh-plugin/awesome-dsh-plugin** | 19k+ | ✅ | `dshmarket.com` 的 catalog 数据源；只要 `dsh.bundle`，**不要求 npm 发布** |
| 2BingLing/dsh-market | 159 | ✅ | 靠 topic 自动扫描，仓库已打 `dsh-plugin` |
| dshworks/awesome-dsh-plugins | 21 | ⚠️ | 市场索引只收 npm 有包的条目，git-only 不收 |
| polang233/dsh-plugin-index | 2 | ❌ | 硬性要求公开 npm 版本 |

## 条目规则

- 文件名必须是 `Owner__repo--path.yml` 形式；monorepo 子包用 `HwFee__HwFee-dsh--plugins-<slug>.yml`。
- `url` 指向子目录，`name` 是 `owner/repo#subname`。
- 只有 `description.en` 必填；中文会被维护者补，但这个仓库两条都写。
- 英文描述含 `: `（冒号加空格）必须加引号，否则 YAML 把它当嵌套键。
- 分类按插件实际做的事选：`genui`/`predict` → `ui`（对照市场上同类条目），`git-bash` → `tools`。
- 一个 PR 最多 3 条；仓库需满 1 天（本仓库已满足）。

## 提交

```sh
pwsh market/submit-to-catalog.ps1            # 干跑：列出上游还没有的条目
pwsh market/submit-to-catalog.ps1 -Apply     # 开 PR
```

脚本只提交**上游没有的**条目；已收录的不会被重写。第一次提交用的是手工流程，现已自动化并做了这件事。

## 商业字体：不再随包分发（已解决）

`cds-theme` 曾经内联了 6 个 Anthropic 商业字体（约 711 KB base64），无再分发授权，而提交
到公开目录等于向公众分发。**这一条已经修掉**：公开构建从 0.1.6 起不再 import 这六个字面，
`@font-face` 改用 `local()` 引用——装了该字族的机器渲染效果不变，没装的回落到系统字族；
两个 SIL OFL 的思源子集仍然内联。

已经发生的两件事要记住，它们共同说明「靠人肉检查」不够：

1. 0.1.5 已经带着这六个字面发布到 npm 与 Releases。**已发布版本无法撤回**，能做的只有让新版本不再包含它。
2. 当时 `files` 字段里根本没有 `fonts/`，`npm pack --dry-run` 也看不出问题——字节藏在 `client/client.js` 的 base64 里。所以现在的拦截是 `market/check-release-assets.mjs`：解包真实 tarball，按 SHA-256 认字面。反向验证过它抓得住 0.1.5。
