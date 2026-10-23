# 用量统计插件 — 接口约定

三份代码并行开发，必须严格按本约定对接。任何一端想改签名，先改本文档。

包名 `dsh-usage-stats`，目录 `plugins/usage-stats/`。

---

## 1. Host 半边（`lib/`）

### `lib/usage-store.js`

```js
/** 解析好的会话日志聚合结果。 */
export async function aggregateUsage(options?: { force?: boolean }): Promise<Summary>
```

`Summary` 形状：

```js
{
  generatedAt: number,        // 毫秒时间戳
  sessions: number,           // 有 user/message 的会话数（含已从磁盘删除的，来自累计账本）
  messages: number,           // user/message + assistant/message 条数
  totalTokens: number,        // 所有 assistant/message 的 usage.totalTokens 之和
  activeDays: number,         // 出现过消息的不同日历日数（本地时区）
  peakHour: number,           // 0–23，消息最密集的小时（本地时区）
  perDay: Record<string, number>,   // 'YYYY-MM-DD' -> 该日消息条数
  perHour: number[24],        // 每小时消息条数
  perModel: Record<string, { tokens: number, messages: number }>,
}
```

日志读取要求：
- 目录 `path.join(os.homedir(), '.dsh', 'sessions')`，递归找 `*.zstd`。
- 文件是 **zstd 帧拼接**：按魔数 `28 B5 2F FD` 切帧，逐帧 `zlib.zstdDecompressSync` 后按行 `JSON.parse`。跳过解析失败的行/帧，不要抛。
- 只统计含 `type: 'user/message'` 的文件（其余是 seed/占位）。
- 计 token：`assistant/message` 的 `data.usage`，取 `totalTokens`，缺则 `inputTokens + outputTokens`。
- 取模型：`request/header` 的 `data.header.config.model`，以及 `model/selection` 的 `data.model`（后者更新）。
- 取时间：每条记录的 `time`（毫秒）。
- **缓存（三层）**：进程内与磁盘持久化的逐文件解析结果都按 `(文件路径, mtimeMs, size)` 失效；`force`（`?refresh=1`）绕过全部逐文件缓存并重读所有日志。完整策略、失效键与最坏陈旧度见下面的「负载模型」。
- **总量来自累计账本**（`lib/usage-ledger.js`）：每个会话一行（按 session id，见「累计账本」），会话继续写时整行替换，日志被删除时**不删行**。所以 `Summary` 是账本的并集，不是磁盘现状；`force` 只清逐文件缓存，**不清账本**。

### 负载模型 · load model

一次面板打开的成本由四层缓存共同决定，任何一层失效只会放大到它自己那一层：

| 层 | 位置 | 失效键 / 窗口 | 失效后的代价 |
|---|---|---|---|
| 客户端摘要缓存 | `client/src/summary-cache.js`，TTL **15 s** | 时间；`force` 直接绕过 | 一次 HTTP 往返（热 Host 3–13 ms） |
| 进程内逐文件缓存 | `lib/usage-store.js` | `(路径, mtimeMs, size)` 精确匹配 | 重新解压 + 解析该文件 |
| 磁盘逐文件缓存 | `lib/usage-cache.js`（**DSH 数据根下的 `cache/usage-stats/`**，按日志根哈希命名，原子写；写失败回落到 OS 临时目录） | 同上；`CACHE_VERSION` 不匹配 / 损坏 / 条目校验失败则整体或逐条忽略 | 该文件；全部失效 = 一次冷启动 |
| 目录遍历 memo | `lib/usage-store.js`，**1500 ms** | 时间 | 重新 `readdir` + `stat`（3–12 ms） |

- **热尾（hot tail）**：文件 mtime 在 **3000 ms** 内、且相对上次解析增长 **≤256 KB** 时，复用旧解析并给摘要打 `stale: true`；缓存条目保留旧 `(mtime, size)`，所以文件安静下来后下一次请求会精确重读一次。增长超过 256 KB（= 一整段新会话记录）一律重读。客户端收到 `stale` 后会在 **3500 ms** 后补一次增量请求（不是 `?refresh=1`）。
- **启动预热**：只有磁盘缓存已存在时才预热（缓存读取本身约 17 ms）。它排在后续事件循环轮次执行，并以 `background` 模式按 zstd 帧分批 yield，单轮阻塞不超过约 10 ms；首次运行没有缓存，故意保持惰性（避免 2.4 s 同步解析卡住宿主启动）。预热与首次请求共享同一个 in-flight promise（`aggregate()` single-flight），请求不会重复整趟扫描；`force` 会先等 in-flight 结束再全量重读，保证它总是最后的结果。
- **最坏显示陈旧度 ≈ 18 s**（15 s 客户端 TTL + 3 s 热尾窗口），且只影响「刚结束会话的最后几条记录」——下一次打开、TTL 过期或 `stale` 补请求都会纠正。这个数字可以接受，因为：面板只在空白会话出现（可见对话没有正在写入的日志），统计本身是历史聚合；已结束文件精确命中缓存（陈旧度 0）；`?refresh=1` 始终是真正的全量重读（实测 128 个文件全读，约 2.3 s）。
- **已知限制**：每台机器**第一次**打开（还没有磁盘缓存）要冷解析整个语料，**≈2.4 s**（128 个文件 / 约 50 MB 压缩 / 26k 个 zstd 帧，解压约占 80–90%）。它只发生一次；之后每次 DSH 重启约 **17 ms**（磁盘缓存命中，0 个文件重读）。并行解码（worker 池）是未来可选项，目前不做。
- **缓存位置与持久性**：缓存**不放 OS 临时目录**。Windows 的「磁盘清理 / 存储感知」会把临时目录按计划清空，清掉之后下次启动会静默退回 ≈2.4 s 冷解析、而界面上看不出任何原因——那正是用户报的"每次都要加载很长时间"。现在优先写到 **DSH 数据根**（`$DSH_HOME`，否则 `~/.dsh`）下的 `cache/usage-stats/`，与会话日志同树，持久性与 App 其余状态一致；只有该位置**写入失败**时才回落到临时目录（此时下一次启动仍会快，只是不跨清理周期）。两条路径都按日志根哈希命名，互不干扰；`hasPersistedUsageCache()` 只探测主路径，所以回落到临时目录时预热不会触发（宁可冷启动一次，也不读一个"可能还在也可能没了"的文件）。
- **账本开销**：进程内第一次统计时读一次账本（本机实测 279 行 / 62 KB / <2 ms），之后只在某行真的变化时原子重写；合并是每会话一次的常数工作，与文件数同阶，所以 `aggregate` 的整体成本仍由「要不要解压日志」决定。

### 累计账本 · lifetime ledger

`lib/usage-ledger.js`，文件是同目录下的 `ledger-<日志根哈希>.json`。它和解析缓存**不是一类东西**：解析缓存可丢（丢了只是变慢），账本丢了就找不回来（已删除的会话在磁盘上没有副本）。

| 方面 | 解析缓存 `parse-cache-<hash>.json` | 累计账本 `ledger-<hash>.json` |
|---|---|---|
| 键 | 文件绝对路径 `(路径, mtimeMs, size)` | session id（目录名去掉 `session-` 前缀） |
| 日志被删 | 条目**剪掉** | 行**保留** |
| 会话长大 | 条目替换 | 行替换（不是相加） |
| 文件损坏 / 版本不符 | 忽略，重读该日志 | 忽略，从现存日志重建 |
| 丢失的后果 | 一次冷解析（≈2.4 s） | 已删会话的统计永久丢失 |
| 删除它 | 无副作用 | **等价于「重置统计」** |

- **删除与归档的区别**：归档只往 `~/.dsh/storages/workspace.json` 的 `archivedSessionIds` 加一个 id，日志原地不动 → 无论有没有账本都会被统计。删除是真的删日志目录 → 只有账本还记得它。
- **账本只增不减**：`?refresh=1` 全量重读日志、清空解析缓存，但**不动**账本；唯一能让数字下降的办法是删掉 `ledger-<hash>.json`（或删掉整个 DSH 数据目录）。
- **写入失败**：与解析缓存同样的回落顺序（数据根 → OS 临时目录）；两处都写不进去时退化为「只在本次进程内累计」，日志一删就丢。
- **校验**：行复用 `usage-cache.js` 的 `sanitizeStats()`，字符串计数或非法 `perHour` 会被整行丢弃——否则一个字符串会污染之后所有总量。

### `lib/usage-route.js`

```js
export const USAGE_PATH = '/dsh-usage-stats/summary'
export function createUsageRoute(aggregate = aggregateUsage) => Route
```

`Route` 形状照抄 `plugins/system-fonts/lib/font-route.js` 的 `createFontRoute()`（`kind: 'exact'`，只允许 GET，`cache-control: no-store`，非 GET 返 405，异常返 500 且 body 带 `error` 字段）。`?refresh=1` 透传 `force: true`。

### `lib/index.js`

```js
export const name = 'dsh-usage-stats'
export function apply(ctx, options = {}) {}   // options.prewarm 供测试关闭预热
```

`apply` 里用 `ctx.inject(['webServer'], hostCtx => …)` 挂载路由，`hostCtx.effect(() => webServer.register(createUsageRoute()), 'dsh-usage-stats: usage summary route')`。`webServer` 或 `register` 缺失时 `console.warn` 并返回，不要抛。参考 `plugins/system-fonts/lib/index.js`。

同一个 effect 里做**启动预热**：仅当 `hasPersistedUsageCache()` 为真（上次运行留下了磁盘缓存）时，`setTimeout(…, 0)` 后调用 `aggregateUsage({ background: true })`；它在后续事件循环轮次执行并按帧 yield，避免阻塞启动。effect 的 disposer 取消尚未触发的 timer 并释放路由。

---

## 2. 客户端纯逻辑（`client/src/stats.js`）

全部是纯函数，**不碰 DOM、不 fetch**，可被 node:test 直接跑。

```js
// 目标日集合：range 为 0 表示不裁剪
export function dayKeysIn(perDay: Record<string,number>, days: number): string[]

// 在给定日期范围内重算总量
export function summarize(summary: Summary, range: number): {
  sessions, messages, totalTokens, activeDays, peakHour, perDay, perHour, perModel
}

export function formatNumber(n: number, scale: 'short'|'myriad'): string
               // 1234 -> "1.2K" (short) / "1,234" (myriad)
               // 123456789 -> "123M" (short) / "1.23亿" (myriad)
export function resolveUnitScale(mode: string, language: 'zh'|'en'): 'short'|'myriad'
export function formatHour(h: number): string     // 2 -> "2 AM"，14 -> "2 PM"

export function favoriteModel(perModel): { id, tokens, share } | null  // 按 tokens 排序

// 热力图网格：滚动布局，锚定「今天」向前回溯 7 天 × N 列（每列 7 格，全部填满）。
// 第 i 格（0 起）= 今天 − (N−1−i) 天；列 = floor(i/7)，行 = i mod 7，
// 所以**右下角永远是今天**（与今天是周几无关），同列内自上而下为旧→新。
// 窗口右端 = max(最后活跃日, 今天)：绝不画未来日期；日志比时钟新时以日志为准。
// 最后活跃日与今天之间的天是正常的「安静日」格（有日期、count 0）。
// pad 只用于第一个活跃日之前的格子（All 范围至少 26 列 = 182 格，向左补）。
export function buildHeatmap(perDay: Record<string,number>, range: number, now?: Date): {
  weeks: { key: string, count: number, level: number, pad?: true }[][],  // 固定 7 格一列；level 0..4；pad = 首个活跃日之前的补格（带日期、悬停显示日期，仅不出现在无障碍树）
  max: number,
}

// 趣味对比：从 BOOKS 里**随机挑一本**折算。只回数据不回句子：
// 面板把 title/titleEn + ratio 填进自己的 locale 字符串（book.less / book.more），
// 这样一句本地化文案只存在一份，stats.js 保持纯算术不碰语言。
export function bookComparison(totalTokens: number, random: () => number = Math.random): {
  title: string, titleEn: string, chars: number, ratio: number,
}
```

数字格式化口径：
- **一个格式化器**：`formatNumber(n, scale)` 覆盖面板里**所有**计数——六张卡、模型列表 token、热力图 tooltip 与 `aria-label`、书目对比的倍数——所以不存在一个调用点沿用旧单位。`scale` 是已解析的 `short` | `myriad`；未知值回落 `short`。
- **两种标度**：`short` = 短式 K/M/B/T（10³ 进制）；`myriad` = 万/亿/万亿（10⁴ 进制）。数字小于该标度最小单位时按**带千分位逗号的整数**输出（`999`、`9,999`），这是唯一出现逗号的地方。
- **舍入规则**：取能容纳该值的最大单位，四舍五入到该档的**有效数字**——K/M/B/万 2 位（`1.2K`、`12K`、`1.2万`），亿/万亿 3 位（`1.23亿`、`12.3亿`；这两档的总额在亿级，2 位会把百万级 token 误差藏掉）；去掉末尾的 `.0`。若舍入后到达下一档（`999,999` short → `1000K`），**向上升档**再格式化，所以结果是 `1M` 而不是 `1000K`；`99,999,999` myriad → `1亿` 而不是 `10000万`。按量级选最小单位保证**非零值永远不会显示成 `0.0万`**。
- **`auto` 在渲染时解析**：`resolveUnitScale(mode, language)` 里 `auto` → zh 用 `myriad`、en 用 `short`；显式 `short`/`myriad` 与语言无关。面板每次渲染都用 `t('book.lang')` 取当前语言，所以切换 UI 语言会立刻重排数字，而存储值仍是 `auto`。
- `formatHour`：12 小时制，`12 AM` 表示午夜，`12 PM` 表示正午（时间不是数量，不走单位表）。
- `bookComparison`：**每页随机挑一本**（`BOOKS` 均匀分布），不排序、不并排。`ratio = totalTokens / chars`，精确值不取整；句子由面板用 `book.less`（ratio < 1）或 `book.more` 拼，`ratio` 本身也过 `formatNumber`。`random` 是可注入的随机源，默认 `Math.random`，测试用固定值。

**随机范围与稳定性**：面板每挂载一次抽一次，抽中后整页固定不变（存进 state）。换范围、重新拉数据**不重抽**，免得数字抖动。下次打开新对话页再换一本。

**面板只渲染一行对比**，没有署名行也没有折算口径行：句子本身是本地化字符串（`book.less` / `book.more`），`book.lang` 字典项告诉面板用 `title`（zh，包《》）还是 `titleEn`（en，裸名）。

书目与字数（`BOOKS` 常量，`constants.js`）：

| 书名 | 英文名 | 约字数 |
|---|---|---|
| 红楼梦 | Dream of the Red Chamber | 73 万 |
| 三国演义 | Romance of the Three Kingdoms | 63 万 |
| 围城 | Fortress Besieged | 23 万 |
| 活着 | To Live | 12 万 |
| 骆驼祥子 | Rickshaw Boy | 10 万 |

字数是通行说法的约数，不要写成精确值；实际 token/字 比例随分词器变化，所以面板只给量级玩笑不给口径注脚。

---

## 3. 客户端界面（`client/src/panel.js`、`styles.js`、`lifecycle.js`、`index.js`）

### 生命周期

`lifecycle.js` 导出 `createLifecycle({ React, primitives, panel, fetchSummary, peekSummary, settings })`，返回 `apply(ctx)`：
- 用 `ctx.effect` 调 `ctx.locale.register('dsh-usage-stats', { en, zh })` 注册面板字典（`ctx.locale` 缺失则跳过，面板回落英文）。
- 用 `ctx.slots.inject('conversation.input.dock', …)` 注册一个 occupant，`id: 'usage-stats'`，`order: 5`，注册项带 `locale: 'dsh-usage-stats'`，outlet 因此把 `t(key, params)` 注入组件 props 并在切语言时自动重渲染。
- 用 `ctx.effect` + `settings-slot.js` 注册**两行设置**（面板高度 + 数字单位，作为同一列表；优先「主题定制」页，缺失时一起回退通用列表，见下节）；`ctx.effect` 的 disposer 调 `placement.dispose()` 取消等待计时器并移除两行。
- 组件收到的 props 是 dock 的 `zone` = `{ session, input }`。
- **只在空白会话渲染**：`session && session.blank === true && !session.running && !session.promptAttempted` 时渲染面板，否则返回 `null`。
  （这与宿主自己判定 hero 的 `conversationPhase()` 一致，见 `.repro/bundles/dsh-client-ui-conversation.js`）
- 挂载时通过 `summary-cache.js` 的 `load()` 取摘要：15 s TTL 内直接复用、否则后台刷新（旧摘要继续显示）；首帧用 `peekSummary()` 的缓存值，因此重新打开面板没有 loading 闪烁。失败时保留已有摘要，只有「什么都没拿到」才显示一行 `note.unavailable`。`stale` 响应会在 3.5 s 后补一次增量请求。
- **文案全部走 `t()`**：`client/src/locales.js` 持有 `{ en, zh }` 两个扁平字典（`key → "…{param}…"`），无 `t` prop 时组件回落到内嵌英文表；`en` 是完备集，缺 key 由宿主回落 `en`。

### 设置行：面板高度 + 数字单位（「主题定制」页，缺失时回退通用列表）

两行设置作为**一个列表**注册，永远落在同一页；用户要求把它们从通用设置挪到 **主题定制（cds-theme 的 `appearance` 设置页）**，`cds-theme` 不在时一起回退到通用列表（`settings-slot.js` 负责放置策略与有界等待）：

- **槽位**：优先 `settings.appearance.item`（`cds-theme` 的 `appearance` section 声明的子 ledger），两行都带 `locale: 'dsh-usage-stats'`：
  - 面板高度：`id: 'dsh-usage-stats-panel-height'`，`order: 40`；
  - 数字单位：`id: 'dsh-usage-stats-units'`，`order: 41`。
  主题页现有行是 18–30 且还会继续增长，40/41 保证两行永远排在最后且互不并列。子 ledger 超过 3000 ms 仍未声明（cds-theme 缺失/被禁用/降级）时，**两行一起**注册到 `settings.general.item` 并只警告一次；主题页之后才出现不会造成双行，主题页被移除时两行一起移回通用列表，注册被拒时先回滚已注册的行再回退。
- **高度控件**：range 输入 `240–520 px`、`step 4`、默认 `344`，右侧读数 `"<height> px"`；`aria-label` 用 `settings.height.title`，`aria-valuetext` 用读数。
- **单位控件**：三态 radio 组（`role="radiogroup"`，三个 `role="radio"` 的 `.dus-unit` 按钮）：`units.auto`（默认，跟随语言）/ `units.short`（固定 K/M/B）/ `units.myriad`（固定 万/亿），`aria-checked` 标出当前态。标题/描述用 `units.title` / `units.desc`；三种模式名各自有 zh + en 词条。
- **外观**：`.dus-row` 系列类，按 `docs/host-hooks.md` §5.3 的通用行配方——14/22 标题、12/18 三级色描述、`16px 0` 内边距、`.5px` 底分隔线、控件靠右；单位按钮是扁平分段控件（无边框、选中态一块浅底），**只用本插件自己的类名**，不碰宿主盐化类名。
- **状态**：`client/src/settings.js` 的 `createSettingsStore(localStorage)`；storage key `dsh-usage-stats/settings`，形状 `{ bodyHeight: number, units: 'auto'|'short'|'myriad' }`。旧负载没有 `units` 字段 → `auto`；`sanitizeSettings` / `clampUnits` 对非法模式同样回落 `auto`，高度照旧夹取并对齐 4px 网格；两个 setter 都只在值真变时持久化并通知。
- **生效（高度）**：值经 `bodyHeightStyle()` 写成面板根节点上的 `--dus-body-height`；两个标签页共用的 `.dus-body` 消费 `height: var(--dus-body-height, 344px)`（全表唯一的数字来源）。`.dus-models` 用 `height:100%` 填充它并在内部滚动；`.dus-overview` 同样 100% 填充、顶部对齐。面板与设置行共用同一个 store（`useSyncExternalStore`），拖动即时改变两个标签页的高度，**无需刷新**；值存 localStorage，重挂载/重启后仍在。
- **生效（缩小而非滚动）**：调小面板时总览的图形**等比例缩小**，绝不出现竖向滚动条。缩小顺序：① 热力格子的列宽上限（`--dus-heat-cell-max`，格子始终 `aspect-ratio:1` 保持正方）；② 间距与内边距（overview gap 10→6→4、热力条 padding 8→4→2、格子 gap 4→3→2、书目行的 foot gap 4→2）；③ 最后才动卡片文字（label 11/15→**10/12**、value 17/22→**15/18**，即下限；foot 字号恒为 12px，只收行高）。算术在 `client/src/layout.js`（纯函数、可单测），由 `bodyHeightStyle()` 把一串具体 px 长度写进内联样式：CSS 无法用一个长度除另一个长度，`container-type: size` + `cqh` 又表达不了分级顺序、也无法脱离浏览器断言。`.dus-overview` 因此是 `overflow-y: hidden`（仅作算术之外的一像素保险），不再是 `auto`。三档（roomy / tight / packed）的每个长度都列在 `LAYOUT_TIERS` 里，样式表只消费变量、变量默认值就是 roomy 档。**总览的两条缝分开声明**：卡片网格 `margin-bottom: var(--dus-overview-gap)`、书目行 `margin-top: var(--dus-foot-gap)`（4px / 2px）——`.dus-overview` 自己不再有统一 `gap`，因为统一 gap 只能给书目行与卡片↔热力条相同的留白；书目行上方的 `.5px` 横线已删除，`padding-top` 也一并去掉。**热力条不再预留横向滚动条高度**：`scrollbar-width: none` + `.dus-heat::-webkit-scrollbar { display: none }`（与 Models 列表同一处理），`overflow-x: auto` 保留以便滚轮/触控横向滚动，`HEAT_SCROLLBAR_RESERVE` 因此为 **0**。「面板底部总有一截空白」的根因就是那 12px：格子大小取整，底部余量 = reserve + 取整余数；多数用户历史不足约 308 天（1104px 面板约 44 列）、横条根本不会出现，于是那 12px 全是留白。
- **生效（单位）**：store 里的 `units` 是**模式**不是标度；`Panel` 每次渲染用 `resolveUnitScale(units, t('book.lang'))` 解析成 `short|myriad`，再传给 `formatNumber`，所以切换 UI 语言会立即重排数字而 `auto` 存储值不变。所有计数（六卡、模型行、热力 cell 的 tooltip 与 `aria-label` 的最大值、书目对比倍数）共用这一个格式化器；卡片的 `title` 与可见文本是同一个字符串，屏幕阅读器读到的数字与屏幕一致。

### `panel.js`

导出 `createPanel({ React, primitives, settings })` → `{ Panel }`。`Panel` 收 `{ session, fetchSummary, peekSummary, t }`：`fetchSummary` 是共享缓存（`summary-cache.js`）的 `load(options)`，`peekSummary` 是它的 `peek()`（首帧渲染上一份摘要，避免重新打开时闪 loading）。`settings` 是面板高度 + 单位模式 store（见上节）：面板用 `useSyncExternalStore` 订阅它，把高度写成根节点 `.dus-panel` 上的 `--dus-body-height` 内联自定义属性（两个标签页共用的 `.dus-body` 消费该变量，总高度不变时下方输入框不会跳动），并把 `units` 解析成当前标度后传给每个格式化调用。

布局（自上而下）：
1. **标签页**：`tab.overview` / `tab.models`（两个 pill，选中态用 `--dsw-alias-state-business-primary`）
2. **范围选择**：`range.all` / `range.30d` / `range.7d`（右上角，小 pill，选中用 `--dsw-alias-bg-module-platform` + 边框；tooltip 用 `range.*.hint`）
3. **六张指标卡**（3 列 × 2 行；视口 ≤560px 时 2 列 × 3 行）：`card.sessions` / `card.messages` / `card.tokens` / `card.days` / `card.peak` / `card.model`
   - 卡片：`background: var(--dsw-alias-bg-module-platform)`，`border-radius: var(--dsw-radius-md)`，无边框（CDS 单笔触纪律）
   - 标题用 `--dsw-alias-label-tertiary`，数值用 `--dsw-alias-label-primary` 半粗，`tabular-nums` 保持列对齐；字号来自 `--dus-card-label-size` / `--dus-card-value-size`（默认 11/17，最紧凑档 10/15 即下限）
   - 前四个计数走 `formatNumber(value, unitScale)`；`card.peak` 是时刻（`formatHour`），`card.model` 是模型 id，二者不是数量、不参与单位表。卡片的 `title` 直接复用同一个格式化字符串
4. **热力图**：`perDay` 的方块矩阵，格子 `aspect-ratio:1`、圆角 2px、间距来自 `--dus-heat-gap`；每周列 `flex:1 0 9px`，列宽上限是 `--dus-heat-cell-max`（JS 按面板高度算出的预算，默认 22px），`space-between` 把富余宽度摊进列间隙——整张图是一条紧贴面板左右缘的致密色带，只在历史很宽时横向滚动。**滚动布局、锚定今天**：总格数 = 列数 × 7，从今天向前回溯，第 i 格 = 今天 − (N−1−i) 天、列 = floor(i/7)、行 = i mod 7，因此**右下角永远是今天**（与今天是周几无关），同列内自上而下为旧→新；每列固定 7 格、全部填满，不需要「最后一列更短」的特殊渲染。**窗口右端是今天**（`end = max(最后活跃日, 今天)`）：绝不出现未来日期（日志比时钟新时以日志为准，不裁真实数据）；最后活跃日到今天之间的天是正常的安静日格（带日期、count 0），日历保持连续。`pad` 只用于**第一个活跃日之前**的格子：`All` 范围至少 26 列（182 格）向左补足，因此今天的格子永远落在最右下；7d/30d 不补、只画自己的窗口（仍以今天收尾）。安静格用 `label-tertiary 18% + bg-module-platform` 的可见灰格（不是留白），level 1..4 用 `--dsw-alias-state-business-primary` 对 `bg-base` 的 30/55/80/100% 阶梯。**热力图与书目对比恒为全时段**，不随 All/30d/7d 切换而重排——范围拨片只改统计数字（六卡、模型列表）；每格悬停显示日期。tooltip 的计数与整条色带的 `aria-label` 最大值都过 `formatNumber`，屏幕阅读器与可见文本使用同一个单位
5. **书目对比**：`bookComparison(totalTokens, random)` 返回**随机一本**的 `{title, titleEn, chars, ratio}`，面板用 `t('book.more'|'book.less', {title, ratio})` 渲染**单行**，无署名、无折算口径；`ratio` 也走 `formatNumber`（倍数可以是万/亿级）。**抽一次就固定**：挂载时用 `React.useState(() => Math.random())` 存 roll，换范围不重抽。
6. 「模型」标签页：按 tokens 降序的模型列表，每行模型 id + token 数 + 占比细条；token 数走 `formatNumber`，占比百分比不参与单位表

**样式一律走宿主令牌**（`--dsw-alias-*`、`--dsw-radius-*`），不要硬编码颜色，这样 CDS 主题插件装上就自动跟随。面板宽度 `max-width: var(--dsh-composer-card-max-width)`，与输入框同宽，居中。

**悬停气泡不许离开面板**（抖动的根因与止损）。气泡是 `.dus-panel` 里的绝对定位元素，用 `translate(-50%, calc(-100% - 6px))` 居中吊在格子上面。第一版把**中心点**夹在 `[28, width − 28]`，这只对 56px 宽的气泡成立；气泡实际最宽 240px，于是最后一列上 BOX 越过面板右缘约 50px（`.work/lead-hover` 实测 51.31px，气泡宽 163.66px）。面板之上是 `[data-conversation-scroll]`，宿主给它 `overflow-y: auto`，一个非 `visible` 轴会让另一个也算成 `auto` —— 越界因此变成那个容器的**可滚动溢出**：横向滚动条出现、`clientHeight` 从 856 掉到 846、垂直居中的 hero 栈整体上移、指针下的格子换了、`mouseleave` 收掉气泡、滚动条消失、栈又移回去。这个循环就是用户看到的「窗口抖动」。止损有三层，缺一不可：

1. `layout.js` 的 `tipCentre(centre, bubbleWidth, panelWidth, inset)` 夹的是**盒子**，并且要气泡自己的宽度；`panel.js` 用 `useLayoutEffect` 在**绘制前**量一次真实宽度并直接写回节点 `style.left`（测量宽度不可能靠猜，`TIP_MAX_WIDTH` 只是首帧的估计值）。
2. 气泡装在 `.dus-tip-layer` 里：`position:absolute; inset:0; overflow:hidden; pointer-events:none`，**恒定挂载**（无悬停时为空）。坐标仍是面板坐标系，但残余越界在面板这一层就被裁掉，任何祖先都拿不到溢出——这条保证是结构性的，不依赖算术刚好正确。
3. `.dus-tip` 的 `max-width` 同时受设计上限和面板宽度约束：`max-width: min(240px, calc(100% - 16px))`，窄面板下夹取仍然有解。

验收数据（`.work/lead-hover` 静态宿主副本 + 插件真实 `PANEL_CSS`，790×900）：修复前最后一列扫过时面板 `top` 在 229 与 234 之间跳、`clientHeight` 856↔846、滚动容器溢出 18px；修复后 `top` 恒为 234、溢出 0、气泡右缘距面板内缩 8px。

**模式选择器位置**：`Standard mode` 预设 chip 宿在 hero 的 workspaceRow，DOM 顺序本在面板之上。composer stack 是列向 flex，但 CSS `order` 无法把面板插到两个 `order:0` 兄弟之间（只能排到最前，压过标题），所以 `panel.js` 在挂载 effect 里用 `insertBefore` 把 dock outlet（锚点取 workspaceRow 内的 `data-slot="conversation.hero.workspace"`，稳定属性，不碰盐化类名）挪到 workspaceRow 之前——DOM 顺序变为 标题 → 面板 → chip 行 → 输入框。effect 卸载时还原 DOM；宿主结构变化时该移动自动 no-op 回退到原位，不破坏布局。

### `index.js`

```js
export const name = 'dsh-usage-stats'
export const inject = ['slots', 'locale']
export { apply }
```

`apply` 由 `createLifecycle` 生成。React 与 primitives 从宿主模块表 `require`，缺失时 `console.warn` 并跳过注册。

---

## 4. 测试

- `test/stats.test.mjs`：`stats.js` 的全部纯函数。必须覆盖 `formatNumber` 的**两套标度输出表**（0、1、999、1e3、1234、9999、1e4、12345、99999、999999、1e6、1234567、99,999,999、1e8、123456789、1e9，`short` 与 `myriad` 逐项断言）、舍入规则（999,999 short → `1M`、myriad → `100万`；99,999,999 myriad → `1亿`；非零值不出现 `0.0万`；小数与负数；非法输入 → `0`；未知 scale → short）、`resolveUnitScale`（auto 按 zh/en，显式模式压过语言，非法模式按 auto）、`formatHour` 的 0/11/12/13/23、`bookComparison` 的 ratio<1 与 ≥1、`buildHeatmap` 的滚动几何（第三参数注入固定 `now`）、**右下角 = 今天**（最后一格 key === 今天、其行号 === 6、列号 === 最后一列、任何格 key 都不晚于今天、每列恰好 7 格）、`pad` 只出现在首个活跃日之前、`summarize` 的 30 天裁剪。
  - `bookComparison` 用**注入的 `random`** 测：`() => 0` 应选中 `BOOKS[0]`，`() => 0.999` 应选中最后一本，`() => 0.5` 选中中间那本。另测每个 `BOOKS` 条目都出现在某个固定 `random` 值的结果里（保证随机源接得对），并断言返回值**不**含 `text`/`author`/`basis`/`charsText`（句子、署名、口径都已移到面板 locale）。
- `test/usage-store.test.mjs`：用临时目录构造几条合成 `session.v4.jsonl.zstd`（zstd 帧，用 `zlib.zstdCompressSync` 逐条拼接），断言聚合结果与缓存契约：进程内命中不重读（注入计数的 `readFile`）；`force` 全量重读；**磁盘缓存跨 store/重启复用**（0 次读）、损坏/版本不符/被投毒的条目被忽略、**删除的会话从解析缓存剪掉但账本保留**；**累计账本**（session id 含旧 `session-` 前缀归一、删掉的会话跨重启仍在摘要里、会话长大是替换不是相加、`force` 不清账本、损坏/投毒/旧版本账本被忽略）；**热尾**（小增量复用 + `stale: true`、超过 256 KB 必重读、沉降后精确重读一次）；**目录 memo** 的 1500 ms 窗口；**后台预热**的协作解析（按帧 yield、结果与同步解析一致）以及 `aggregate()` **single-flight**（请求加入 in-flight 预热；`force` 等它结束后再全量重读）。
- `test/layout.test.mjs`：`layout.js` 的缩小算术（纯函数）。断言档位常量与滑块范围一致（240–520、4px 步进；`HEAT_CELL_MAX = 22`；断点 560）；roomy 档复现固定高度 `147px`（卡片 55 × 2 + 6、卡片↔热力条 gap 10、书目行 foot gap 4 + 行高 17；此前是 `161.5px`，差额来自删掉的 `.5px` 横线与 8px `padding-top`）；**所有 71 个设置 × 三档网格行数（2/3 行）都满足 `fixed + band ≤ H`**（内容永不超出面板），且未触到 22px 设计上限时底部余量 `H − used < 7`（只允许整数取整，不允许再出现预留条）；格子大小在同一档内随高度单调不减、最高设置到达 22px 上限、最紧凑角落不低于 6px；档位切换时的回落幅度不超过一个档位的预算差；缩小顺序（图形 → 间距 → 字号）与 `CARD_LABEL_FLOOR = 10` / `CARD_VALUE_FLOOR = 15` 下限；`overviewVars()` 输出的是完整、纯 px、不含 `calc()`/`var()` 的具体长度；非法高度回落而不是抛错。
- `test/settings.test.mjs`：两个偏好 + 面板接线。覆盖默认高度 `344`、`clampBodyHeight`（越界夹取、非数值/布尔/数组回落默认、手改值对齐 4px 网格）、`sanitizeSettings` 丢弃未知字段、`loadSettings` 对空/坏 JSON/旧 payload 回落默认（**旧 payload 无 `units` → `auto`**）、`saveSettings` 在坏 storage 下不抛、store 只在值真变时通知且写盘、换一个 store 重挂载仍读到同一值；`clampUnits` 的三态与非法回落、`setUnits` 持久化且与高度共用 storage key；两行的 id 与 `order: 40/41`（不并列）；以及 **CSS 契约**：`.dus-body` 是唯一消费 `height: var(--dus-body-height, 344px)` 的规则（`.dus-models` / `.dus-overview` 只做 `height:100%` 填充）、`.dus-overview` 是 `overflow-y: hidden`（**不再是 `auto`**）、热力列宽上限是 `var(--dus-heat-cell-max, 22px)`、卡片字号走带下限的变量、`bodyHeightStyle()` 同时输出夹取后的高度和 `layout.js` 派生的一整套 px 长度。**单位接线**：同一份 summary 在 short / myriad / auto+zh / auto+en 下渲染出的六张卡、模型行、热力 `aria-label` 最大值、书目对比倍数逐项断言；卡片 `title` 与可见文本一致；`panel.js` 源码里不再有 `formatTokens`/`formatCount`；单位行渲出三个互斥 radio 并点击写入 store；生命周期把两行一起注册到主题页（id/order 断言）。另外锁定 zh/en 字典键集一致、设置行文案纯语言无 `中文 · English` 拼接。
- `test/settings-slot.test.mjs`：设置行的落位策略（纯函数 + 注入的 slots/timers）：主题页声明后**两行一起**落在 `settings.appearance.item` 且取消回退计时器；3000 ms 内未声明 → 两行一起回退 `settings.general.item` 且只警告一次；`waitMs<=0` 立即决定；回退后迟到的主题页声明不产生双行；主题页注册被拒时先回滚已注册行再整体回退；主题页消失时两行一起移回通用列表；`dispose()` 取消计时器并移除两行。
- `test/summary-cache.test.mjs`：客户端摘要缓存 + 面板接线：TTL 内不请求、过期后重取、并发挂载共享一个 in-flight、`refresh` 只绕过 TTL（不附带 `force`）、`force` 才真正全量重读、失败不污染缓存、面板首帧用 `peek()` 渲染（无 loading 闪烁）、普通挂载不传 force、`stale` 响应触发一次增量补请求（不是 `?refresh=1`）、卸载取消待触发的补请求。
- `test/tooltip.test.mjs`：热力图悬停气泡的落位，**走真实 `panel.js`**（一个约 90 行的 hooks 运行器驱动组件，不重写一份定位逻辑）。断言的是止损的那条不变量 —— **气泡的 BOX（不是中心点）始终留在面板内** —— 以及让它结构性成立的兜底（`.dus-tip-layer`）。用例：1104px 面板 + 实测 163.66px 宽的气泡，右缘不得越过 `panelWidth - 8`（旧的中心夹取会给出 1157.83，即截图里那次 50px 级越界）；已经居中放得下的气泡不被无谓挪动；首列从左边拉起；宽度尚未测量时的首帧落位也必须合法；284px 窄面板仍然在内；层恒定挂载（无悬停时为空）、悬停不新增第二个层、气泡排在面板最后；样式表里 `overflow: hidden` / `inset: 0` / `max-width: min(240px, calc(100% - 16px))` 与 `TIP_INSET` 对齐。这个文件**用变异测试反证过**：把夹取改回中心点，三条用例立即失败。

`npm test` = `build:check` + 上述七个测试文件（`stats` / `layout` / `tooltip` / `settings` / `settings-slot` / `summary-cache` / `usage-store`，共 158 个测试）。
