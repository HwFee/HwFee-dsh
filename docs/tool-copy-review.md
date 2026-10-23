# 工具面板复制按钮复核

## 2026-10-23（二）：成对显隐、read 行内定位、长输入与新会话悬停卡

用户提出三条：read/write 的复制与 inspect 应与编辑卡片一样位于工具行；所有工具的这两个按钮必须同时出现、同时消失；新会话页输入大段文字后输入框被挤出屏幕。

- **成对显隐**。[tool-chrome-styles.js](../plugins/cds-theme/client/src/tool-chrome-styles.js) 让 `[data-search] / [data-read] / [data-diff] / [data-terminal]` 与 `[data-cds-tool-body]`、`[data-cds-diffrow]`、`.dsh-gb-tool-request` 共用同一个 hover 归属：复制与 inspect 的 opacity/pointer-events 由同一个容器驱动，过渡时长统一走 `--cds-copy-reveal`。此前 `[data-read]` 只显示复制、不显示 inspect，是真实的不同步缺陷，由新增守卫先抓红再修复。复制成功、键盘焦点都只改图标，不再延长或单独保留其中一个。
- **read 的按钮回到工具行**。[tool-chrome.js](../plugins/cds-theme/client/src/tool-chrome.js) 的 `readRow()` 只在卡片展开（`aria-expanded="true"`）时，把 banner 与其定位祖先标为 static、把 banner 自身归零，让宿主原有的 Copy / Inspect 节点以行根为参照落在 `3px / 0` 与 `3px / 26px`；React 节点、文案、点击回调和剪贴板内容一律不动，折叠态完全不受影响。搜索与 Shell 仍留在面板内。
- **write/edit** 本就复用 [diffview.js](../plugins/cds-theme/client/src/diffview.js) 的工具行，未另造组件。
- **新会话长输入**。根因不是文本区没限高（它已限到 192px），而是整张 composer 卡在 789px 窗口里长到 842px：页面虽可滚动，却没有任何东西保证底部操作行可见。[hero-composer.js](../plugins/cds-theme/client/src/hero-composer.js) 用 ResizeObserver 只观察 hero 卡片与页面滚动容器，在编辑器聚焦且卡片底边越界时，按差值滚动现有滚动容器——不新增滚动层、不 sticky、不改尺寸、不隐藏内容。实测 45 行时卡片底边 841.59→772.93（<789），760×460 窗口发送按钮 436.26（<460），清空后回到 scrollTop 0 且文本区 52px。手动向上滚动不会被抢回。
- **侧栏会话悬停卡**。[session-preview-styles.js](../plugins/cds-theme/client/src/session-preview-styles.js) 用宿主自己的 `--dsh-hover-preview-fade` 中间变量 + `[data-slot="sidebar.session.row.hover"]` 结构定位到那张卡，替换宿主写死的 `#2C2C2E` 深色底与 `#fff/#cfd3d6/#adb2b8` 三档冷灰，改为 `bg-overlay` / `label-primary / secondary / tertiary` / `radius-lg` / `elevation-prominent`。只改颜色与圆角，不碰 display、position、pointer-events，普通短 tooltip 不匹配。
- **测试**：主题 547、Shell 157、usage 114 全过；主题 verify、仓库 audit、`git diff --check` 通过。新增 4 条反向证明（旧的不同步 owner、折叠态也搬按钮、滚动可见性缺失、沿用写死深色）都先让测试变红再恢复绿。`hero-composer.test.mjs` 与 `session-preview.test.mjs` 已接入 `npm test`。
- **限制**：这台机器上宿主的会话悬停预览卡当前不渲染（hover 2.5s 后 `[data-slot="sidebar.session.row.hover"]` 仍不存在），所以该项只有静态与单测覆盖，没有对比截图；其余三类均为已安装包的真实界面验证。

## 2026-10-23：轨迹入口与复制相邻，收紧用量面板

原生工具、Shell 和编辑/新建文件卡片的轨迹入口现为 18×18 控件内的 12×12 SVG，统一放在复制左侧、间隔约 8px，同一面板悬停时显示，移开即隐藏。编辑卡片的入口移到复制所在的标题行；正文里不再留第二个入口或按钮行。

- [tool-chrome.js](../plugins/cds-theme/client/src/tool-chrome.js) 从稳定工具钩子识别原生“查看 / Inspect”按钮，保留 React 节点与原回调，只管理可撤销标记。角标位置不是写死常量：标记在面板挂载时量一次复制按钮的实际几何，把偏移写成 `--cds-trace-top` / `--cds-trace-right`，因此宿主三种不同的复制位置（搜索卡自己的 9px/14px 标题栏、代码 banner、裸角落）都能对齐；窗口缩放时清掉旧偏移并重测一次，停用与卸载会一并还原。[tool-chrome-styles.js](../plugins/cds-theme/client/src/tool-chrome-styles.js) 只负责图标本身。[diffview.js](../plugins/cds-theme/client/src/diffview.js) 与 [tool-view.js](../plugins/git-bash/client/src/tool-view.js) 直接传递宿主的 inspect 回调。
- 搜索结果下方的第二个卡片来自宿主同时输出结构化列表和截断后的完整文本。现在只对格式完整、含存储路径及 read/grep 提示的恢复文本收起重复列表，显示无边框提示；未识别文本和错误保持原样。
- 用量面板删去小说行上方横线与 padding，改为 4px 间距；面板内边距 8px 12px。热力图隐藏滚动条但保留横向滚动，高度预算不再预留 12px 滚动条空间。当前机器通过实际设置滑块将高度 348→332，实测小说行底部至内容区末端 5px，加外壳 8px 后总留白约 13px；源码默认高度仍为 344。
- 三个插件构建及完整 npm test、主题 verify、仓库 audit、diff whitespace 检查通过。回归已反向验证：恢复按钮占行、重复恢复文本、额外卡片框、写死角标位置、吞掉回调、旧滚动条预留、缩放不重测时测试失败，恢复后通过。不适用：纯逻辑单测截图；假 DOM/React 树单测亦以真实界面场景补充。
- 真实桌面截图：[.work/shots/tool-trace-installed](../.work/shots/tool-trace-installed/) 为用量面板浅/深/窄屏、深色与高度设置；[.work/shots/tool-trace-final](../.work/shots/tool-trace-final/) 为三个面板悬停显示与移出隐藏。已逐张检查，实测三个面板的图标与复制间距为 8.33px / 8px / 8px，垂直中心偏差 ≤0.33px。

代码及构建产物通过本地 tarball 和插件管理服务应用到 desktop profile，运行时确认新组件已加载；ui-settings.enabled 已通过宿主设置服务开启并持久化。临时设置辅助包已移除，空白验证会话已归档。未提交、推送或发布 npm 包。

## 2026-10-23：统一为仅悬停显示

编辑 diff 展开后，焦点留在标题上，旧的行级 `focus-within` 规则使复制按钮持续可见。现在 diff、代码 banner、旧版 read/search/diff/terminal 和 git-bash 的复制控件仅由容器悬停显示；移开鼠标即隐藏，焦点及复制成功状态均不延长显示。

- `plugins/cds-theme/client/src/styles.js` 移除三类控件的焦点显示分支；`plugins/git-bash/client/src/styles.js` 同步移除焦点显示分支。
- 两个插件的构建及完整 `npm test` 通过，主题 verify、仓库 audit 和 `git diff --check` 通过。git-bash 的进程超时测试首次并行运行时未能在 500ms 内启动子进程，单独重试及随后完整运行通过。
- 新增回归守卫覆盖主题和 shell 的显示选择器；主题守卫在修改实现前已失败，确认能抓住旧规则。
- 在真实 DSH 桌面渲染器中，以实际 diff 组件输出和四种受控卡片验证 CSS：悬停时 opacity 为 1；移开鼠标、保留焦点时 opacity 为 0、pointer-events 为 none。此验证不调用模型，不创建会话。
- 截图及测量在 `.work/shots/hover-repair/`，已逐张查看。构建产物已备份后同步至本机 desktop profile，并完整退出重开 DSH；重启后主题正常加载，旧 diff 焦点规则不存在。本次为本机修复，未发布 npm 包。

下文保留此前复核记录；其中允许键盘焦点显示的行为已由以上规则替换。

本轮范围：grep/glob 复制按钮，以及其他工具面板的同类 UI 遗漏与边界行为。genui 改造按用户要求暂缓。

## 已修复

1. **搜索面板漏接统一按钮。** 旧规则只覆盖 `data-code-block-banner`，SearchBlock 的 `data-search` 面板使用独立的文字按钮。旧版 ReadBlock、DiffBlock、TerminalBlock 也有此形态。
   - `plugins/cds-theme/client/src/native-copy.js:14` 从稳定 surface 属性和头部结构定位文字复制按钮，只写入插件自己的标记；不删除 React 子节点、不替换点击处理器、不修改原有无障碍名称。
   - `plugins/cds-theme/client/src/styles.js:1079` 接入已有复制 token：18px 控件、12px 图标、透明背景、成功对勾。原文字继续作为无障碍名称与宿主反馈来源。
   - `plugins/cds-theme/client/src/lifecycle.js:221` 让标记跟随 enabled/refine；关闭、停用和卸载时清除观察器、待执行帧和标记。
2. **键盘聚焦时按钮仍可能透明。** 旧规则只显示被聚焦的子按钮，而其父 banner 仍为 opacity:0。
   - `plugins/cds-theme/client/src/styles.js:311` 改为显示有焦点后代的 banner。展开工具行本身不会让复制栏常驻。

## 验证

- 主题 `npm test`：524 通过，1 跳过（只读参考仓库未附带）；构建新鲜度通过。
- 主题 verify、仓库 audit、git diff --check：通过。
- 新回归测试已经接入 npm test；临时撤去标记和父容器聚焦修复时失败，恢复实现后通过。
- 结构与生命周期测试覆盖四类旧面板、中英文成功反馈、排除文件/展开按钮、无结果、聊天外不标记、延迟挂载、合并更新、忽略无关流式文本、移除节点、取消待执行帧、再次启用。
- Chromium 预览采用 npm `@deepseek-ai/dsh-web-frontend@0.0.1-rc.5` 内 SearchBlock 的实际组件源码/CSS 和本仓库主题构建产物；示例数据、受控剪贴板适配器。不是完整 DSH 桌面验证。
- 浏览器验证覆盖浅色/深色/390px 窗口、悬停、复制成功及衰退、失败不误报、折叠后仍复制全文、无结果无按钮、键盘父容器显示、精修关闭/恢复、插件停用还原、复制按钮无障碍名称保留。每个视觉场景均有截图并已查看。
- 纯逻辑及结构单测：截图不适用；对应可见行为由以上浏览器场景补充。

截图和运行日志在工作区 `/workspace/scratch/dsh-review/`，前缀为 `grep-`、`copy-`；不打进发布包。本轮没有提交、推送或发包。
