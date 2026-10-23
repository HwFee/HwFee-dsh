# 工具面板复制按钮复核

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
