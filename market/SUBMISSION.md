# 市场提交材料 · Market submission

条目放在 `market/catalog/`，每个插件一个 YAML。**完整流程见 [SUBMISSION-FLOW.md](SUBMISSION-FLOW.md)**；这份文件只记录材料内容与当前状态。

目标市场是 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（`dshmarket.com` 与 `awesome-dsh-plugin.com` 的 catalog 数据源）。

## 当前状态

| 条目 | category | 状态 |
|---|---|---|
| `cds-theme` | `theme` | ✅ 已收录（维护者直接合入 main） |
| `system-fonts` | `ui` | ✅ 已收录（描述经维护者改正） |
| `usage-stats` | `usage` | ✅ 已收录 |
| `genui` | `ui` | ⏳ [PR #8392](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8392) 待合并 |
| `git-bash` | `tools` | ⏳ PR #8392 待合并 |
| `predict` | `ui` | ⏳ PR #8392 待合并 |

PR #8392 只新增上述三条并在两个 README 各加三行，未改动任何既有条目（市场规则要求 PR 不碰与自己无关的条目）。

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

## 需要作者确认的一点（历史）

`cds-theme` 内联了 6 个 Anthropic 商业字体（约 660 KB），无再分发授权，提交到公开目录等于向公众分发。该条目已被收录——当时的决定是随包发布并在 PR 里如实说明，`market/PUBLISHING.md` 记录了移除方法与后果。