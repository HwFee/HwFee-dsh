# 上游归属 · Attribution

这个插件是 **`dsh-codex-effort-slider`** 的移植（port），不是独立重写。

- 上游仓库：<https://github.com/Microqian2th/dsh-codex-effort-slider>
- 上游版本：`1.1.2`
- 许可证：MIT，版权人 `dsh-codex-effort-slider contributors`（2026）
  —— 全文见同目录 [`UPSTREAM-LICENSE.txt`](UPSTREAM-LICENSE.txt)，逐字保留，未作修改。
- 本仓库包名：`@hwfee/dsh-codex-effort-slider`（MIT）

MIT 允许再分发与修改，条件是保留上述版权声明与许可声明。本目录就是那个保留动作。

## 移植自上游的部分

下列模块的算法、常量与交互语义是**逐字移植**的，注释里对「为什么是这个数值」的解释也一并
保留（那些是上游作者实测得出的，删掉就等于下次有人把它改回去）：

| 本仓库文件 | 上游对应 |
|---|---|
| `client/src/motion.js` | `lib/client.js` 的「连续运动引擎」段（`MOTION` / `MOTION_REDUCED` / `MOTION_FAST`、`motionStep`、`decayPointerSpeed`、`releaseIndexFor`） |
| `client/src/levels.js` | 同文件的纯函数段（`modelOf` / `levelsOf` / `effectiveEffortId` / `indexOfLevel` / `clamp01` / `indexFromPct` / `pctFromIndex` / `detentTargetIndex`） |
| `client/src/energy.js` | 同文件的能量层与星空段（颜色曲线、`PARTICLES`、`starDurationFor`、`starDelayFor`、`knobOffsetOf`） |
| `client/src/bridge.js` | 同文件的 DOM 桥段（`findEffortRow` / `findValueElement` / `findSeatEffort` / 行内样式的写入与还原顺序） |
| `client/src/styles.js` 的轨道、旋钮、能量层、星空规则 | 同文件的 `CSS` 数组 |
| `client/src/settings.js` 的 schema 与版本迁移 | 同文件的 `SETTINGS_SCHEMA` / `SETTINGS_VERSION` / `readSettings` / `writeSettings` |
| `client/src/directory.js` | 同文件的 `createDirectoryAccess` |
| `client/src/component.js` 的引擎接线、节流写回、乐观值与回滚 | 同文件的 `CodexEffortSlider` |

**`levels.js` 里唯一不逐字的是 `resolveLevels`**：它的兜底判据被改成三态，见下面第 12 条。
上表列的是该文件里仍然逐字的部分，别因为「这个文件在表里」就认为整个文件与上游一致。

## 本仓库做的修改（逐项，无隐藏差异）

1. **模块拆分**：上游是一个 2700 行的 `lib/client.js` 单文件（无构建步骤）。这里按职责拆成
   `client/src/*.js`，用 esbuild 打包成 `client/client.js`。这是形状变化，行为不变。
2. **每帧读布局 → 拖动时测量 + `ResizeObserver`**：上游在 `pctAt()` 里每次 `pointermove` 调
   `getBoundingClientRect()`。这里改成拖动开始时测一次、元素尺寸变化时由 `ResizeObserver`
   重测（`createTrackMetrics`），指针路径只做算术。**运动数学与手感一行未改。**
3. **`prefers-reduced-motion` 从「放缓」改为「完全停止」**：上游确实有 2.6× 的放缓，但它绑在
   「简洁动画」这一档上（`effectiveReducedMotion = motionMode() === "quick"`），**与系统偏好
   无关**——上游读系统偏好的 `systemReducedMotion()` 只用于面板提示，它自己的注释写着
   「仅用于面板提示，不影响任何行为」。本仓库的规则是「不是慢一点，而是不动」（AGENTS.md
   第五节）：系统要求减少动态时**不渲染任何粒子**、媒体查询也禁用扫光、旋钮直接跳位而不做
   补间，且**优先于设置里选的档位**（`component.js:127-131` 把模式强制成 `'reduced'`）。
   这是有意偏离上游的两处**用户可感知行为**之一；另一处是第 12 条的档位兜底判定——那一处是
   修正上游的 bug，这一处是刻意的可访问性选择。
4. **shell 走宿主 token，能量层保持原色**：外壳（轨道底、刻度点、错误文字、焦点环、设置面板
   及其字体/阴影/圆角）改用 `--dsw-*` 令牌，字体读**消费端**的 `--dsw-font-family-ui`
   （`styles.js` 的 `UI_FONT`）——注意不是 `--dsh-font-family-ui`：那是 `dsh-system-fonts`
   写进去的**设置**变量，组件读的是主题发布的 `--dsw-` 那个（AGENTS.md 第十二节）。
   蓝→紫渐变、白色旋钮、星尘粒子**保持上游取值**，因为那组颜色是功能的编码，不是主题色。
5. **可撤销的生命周期**：上游在模块顶层调用 `installStyles()` 且不回收，全局监听器也不移除，
   设置面板用 `innerHTML` 字符串拼。这里样式、面板、全部 `document` 监听器、DOM 桥（含
   `MutationObserver`）、目录访问器都由同一个 `ctx.effect` 的 disposer 收回；面板用 DOM 调用
   构建，没有 HTML 字符串。
6. **DOM 桥的语义校验**（安全加固）：上游用「打开的那颗席 + 恰好两个 menuitem → 第 2 行」定位
   目标行。这里额外要求**第 1 行是模型行**（`模型`/`Model`）才认第 2 行是推理等级行——否则
   composer 里任何一个两行的下拉（权限、计划、附件）都可能被误装一条推理滑条。
7. **`MutationObserver` 回调只做廉价判断**（性能）：上游回调直接 `scan()`，而 `scan()` 会
   全文档 `querySelectorAll`；流式输出时每 token 都触发。这里回调只检查 mutation records
   （被移除的是不是我们那一行 / 新增节点是否 `role="menu"` 或带 `aria-haspopup`），命中才
   合并到**一帧最多一次**的 `scan`，`dispose()` 会取消未执行的帧。
8. **写回绑定模型身份**（正确性）：队列里的档位 id 记下当时的 `provider`/`model`，`flush()`
   时若模型已切换或该档位已不存在于新模型的列表，**丢弃这次写回**。模型切换时清空 draft、
   乐观值、待发队列并重锚运动引擎。
9. **目录访问每次读都重新解析**（正确性）：`getSnapshot`/`subscribe` 都重新调
   `directoryFor()`，这样会话重绑导致的目录实例替换能被发现；只持旧实例会读到一个没人再写的
   store。
10. **双实例仲裁从全局锁改为行标记**：上游用 `window.__cesActiveSliderOwner` 加提前 `return
    null`（那会绕过 Hook），这里在目标行上打 `row.__cesOwner`，dispose 时删除。
11. **设置存储键保持上游值**：`dsh-codex-effort-slider.settings`，schema 版本仍是 3，所以
    已安装上游版本的用户升级后动画模式不丢。
12. **`resolveLevels` 的兜底判定从「两态」改成「三态」**（正确性，**这是本仓库真正的行为修正**，
    不是移植）：上游为了扛住「切模型时档位列表瞬时为空」，在活列表为空时用缓存兜底，判据是
    `liveKey === null || cache.key === null || liveKey === cache.key` —— 于是三种完全不同的
    情况被压成同一个答案：
      · 目录短暂为空（切模型/刷新目录的中途）→ 应该兜底；
      · **目录明确回答「这个模型没有推理档位」（模型存在、但条目里没有 `reasoning` 块）** →
        不该兜底，那是模型自己的答案；
      · 身份未知（`liveKey === null`，目录还没认出这个模型）→ 也不该兜底，没有身份就没有
        「缓存属于它」的证据。
    上游把后两种也当成第一种，于是给一个没有档位的模型继续渲染上一个模型的档位，拖一下就会
    写回一个该模型拒绝的 effort id。这里新增 `reasoningSupport(state)` 给出 `true` / `false`
    / `null` 三态（`levels.js:84`），`resolveLevels` 的第四个参数接收它：
    `reasoning === false` 直接返回空列表，`liveKey === null` 直接返回空列表，只有「身份相同
    且不是明确无推理」才复用缓存（`levels.js:116`，`component.js:186` 传入）。
    **删掉这一条会怎样**：改回上游那个布尔判断，`test/levels.test.mjs` 里
    「resolveLevels refuses the cache when the model DEFINITIVELY has no reasoning」和
    「…when the identity is UNKNOWN」会红；线上表现是滑条为一个没有档位的模型保留上一个模型
    的刻度与写回目标。移植当时组件测试就撞在这上面：基线日志里前两个用例通过，第三个
    「the control is ABSENT when the model advertises no reasoning levels」一路重渲染直到
    **OOM**（`FATAL ERROR: Reached heap limit`，256 MB 堆耗尽，见
    `.work/ces-final/02-npmtest-baseline.log` 尾部），修好之后再跑就是绿的
    （同目录 `03-component-after-fix.log`）。**`.work/` 是 gitignore 的，新克隆没有这两份
    日志**，所以判据以 `test/levels.test.mjs` 的两条为准，不要去翻日志。
13. **`settings.js` 里的 `motionMode()` 导出了、但组件没有调它**（移植痕迹，**非行为差异**）：
    上游的 `motionMode()` 既被自身内部调用（`lib/client.js:351`、`:1895`、`:2275` 等），也被导出。
    拆分之后 `component.js:128-131` 内联了同一个「三值归一」（`quick`/`fast`/其它 → `full`），
    因为它必须先折进系统偏好：`reduced ? 'reduced' : …`，而 `motionMode()` 的契约是不看系统。
    所以这里保留 `motionMode()` 作为可单测的纯函数（`test/settings.test.mjs` 覆盖），
    生产路径走内联那一份。**风险**：同一条规则有两份实现，改一处忘另一处就会不一致——
    真要改三值归一，两处一起改。不是死代码，不要因为「没有调用点」而删掉。
14. **`constants.js` 的 `BASE_SPEEDUP` 没有引用点**（**继承自上游，不是本仓库引入的**）：
    上游在 `lib/client.js:63` 声明、`:2679` 经由测试用的内部导出表暴露，正文里没有任何计算
    引用它（实际时长由 `STARFIELD_DURATION_MEAN` 与 `MAX_SPEED_FACTOR` 决定，见同文件注释）。
    移植保留了声明与上游注释，因为注释记录了「所有速度 ×4」这个来自用户的决定；**不删**——
    删掉会让下一个人以为这个倍率从未存在过，从而在调星速时重新发明一遍。

如果将来要跟上游对比差异，**先看这一节**，不要假设「长得不一样就是抄错了」。
