# 市场提交材料 · Market submission

三个插件的条目已经写好，放在 `market/catalog/`。这是给 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（**19,420 star**，`dshmarket.com` 与 `awesome-dsh-plugin.com` 的数据源）用的。

## 为什么是那个市场

| 市场 | star | 收不收本仓库 | 说明 |
|---|---|---|---|
| **awesome-dsh-plugin/awesome-dsh-plugin** | **19,420** | ✅ | `dshmarket.com` 的 catalog 数据源；只要 `dsh.bundle`，**不要求 npm 发布** |
| 2BingLing/dsh-market | 159 | ✅ | 靠 topic 自动扫描，已给仓库打了 `dsh-plugin` |
| dshworks/awesome-dsh-plugins | 21 | ⚠️ | 市场索引只收 npm 有包的条目，git-only 不收 |
| polang233/dsh-plugin-index | 2 | ❌ | 硬性要求公开 npm 版本 |

## 一个硬性阻塞：仓库要满 1 天

`awesome-dsh-plugin` 的 CI 会检查仓库年龄：

> The repo is at least **1 day old**. This is checked automatically.

本仓库创建于 `2026-10-19T07:55:57Z`，**必须等到 2026-10-20 07:55Z 之后**才能提 PR，否则 CI 直接红。这不是对插件的评价，只是过滤「PR 前几分钟才建好的仓库」。

## 提交步骤（满 1 天后）

### 1. Fork 并克隆

```bash
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone
cd awesome-dsh-plugin
```

### 2. 复制三个条目

```bash
cp <本仓库>/market/catalog/*.yml data/plugins/
ls data/plugins/ | grep HwFee
```

文件名必须正好是 `HwFee__HwFee-dsh--plugins-cds-theme.yml` 这种形式（`owner__repo--path`，路径分隔符变 `-`）。

### 3. 本地校验

```bash
npm ci
node scripts/generate-readme.mjs
git status   # README 应自动多出三行
```

如果 `generate-readme.mjs` 报错，说明 YAML 有问题，先修。

### 4. 开 PR

```bash
git checkout -b add-hwfee-plugins
git add data/plugins/ README.md README.zh.md
git commit -m "Add HwFee DSH plugins: CDS theme, system fonts, usage stats"
git push -u origin add-hwfee-plugins
gh pr create --title "Add HwFee DSH plugins (3)" --body-file <PR 正文>
```

## 三个条目的内容

| 文件 | category | 插件 |
|---|---|---|
| `HwFee__HwFee-dsh--plugins-cds-theme.yml` | `theme` | Claude Design System 主题 |
| `HwFee__HwFee-dsh--plugins-system-fonts.yml` | `ui` | 字体与排印 |
| `HwFee__HwFee-dsh--plugins-usage-stats.yml` | `usage` | 用量面板 |

分类取自它允许的取值表（`theme` / `ui` / `usage` 都在表内），且按「插件实际做的事」选，不是按希望出现的位置。

## PR 正文草稿

```markdown
Adds three plugins from https://github.com/HwFee/HwFee-dsh, a monorepo with
one plugin per `plugins/*` directory.

All three declare `dsh.bundle.patch` → `./cordis.patch.yml` and ship the built
client artifact in the package, so `dsh plugin add` works from the subdirectory:

| entry | category | what it does |
|---|---|---|
| `#cds-theme` | theme | Remaps the host's tokens onto CDS warm-grey surfaces and the clay accent; refines composer, sidebar, message rows, code blocks and markdown body. |
| `#system-fonts` | ui | Font slots for content / code / terminal, plus weight, line height and letter spacing. Typography only. |
| `#usage-stats` | usage | Sessions, messages, total tokens, active days, peak hour, favourite model and a heatmap, over all time / 30d / 7d. |

Monorepo layout per contributing.md: `url` points at the subdirectory,
`name` is `owner/repo#subname`.

One note on `#cds-theme`: its package inlines six Anthropic web fonts as
base64 (~660 KB). The design language itself comes from
[open-claude-ui](https://github.com/Caho1/open-claude-ui) (MIT), and the
README states which parts are derived from it and which are not.

The repo has the `dsh-plugin` topic. Verified against dsh `0.2.1-rc.2`.
```

## 需要作者确认的一点

`#cds-theme` 内联了 **6 个 Anthropic 商业字体**（AnthropicSans / Serif / Mono，共约 660 KB），无再分发授权。提交到公开目录等于向公众分发。

维护者会实际阅读代码。这一条要不要在 PR 里主动说明，或者先移除字体，由作者决定 —— `market/PUBLISHING.md` 里有移除方法和后果（英文衬线会回退到系统字体）。
