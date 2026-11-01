# docs — 证据文档索引

这个目录放的是**证据**，不是概述：每个数值、每个钩子、每个取舍都要能对回代码或实机。面向使用者的说明在根 `README.md`，面向维护者的规则在 `AGENTS.md`。

安装与发布的操作步骤不在本目录：装插件看 [`install-plugins.md`](install-plugins.md) 与 [`../market/SUBMISSION-FLOW.md`](../market/SUBMISSION-FLOW.md)。

| 文件 | 记录什么 |
|---|---|
| [`host-hooks.md`](host-hooks.md) | 宿主暴露的稳定 `data-*` 钩子、插槽、令牌，以及哪些类名是盐化哈希不能选 |
| [`cds-spec.md`](cds-spec.md) | Claude Design System 的规格取证与逐项裁定（配色、排印、圆角、动效） |
| [`typography-cross-check.md`](typography-cross-check.md) | 排印令牌与宿主字阶的逐项对照 |
| [`tool-cards-diff.md`](tool-cards-diff.md) | 宿主 diff 卡片的 DOM、行号、展开器与主题自绘卡片的取舍 |
| [`tool-cards-read.md`](tool-cards-read.md) | read 卡片的行号来源与失败状态 |
| [`tool-cards-edit-write.md`](tool-cards-edit-write.md) | edit / write 卡片的投影数据与状态机 |
| [`tool-cards-shell.md`](tool-cards-shell.md) | shell 卡片的请求/输出结构 |
| [`tool-cards-bash-terminal.md`](tool-cards-bash-terminal.md) | Git Bash 与终端卡片的结构差异 |
| [`tool-cards-search-plan.md`](tool-cards-search-plan.md) | 搜索、计划、提问卡片的结构 |
| [`usage-stats-contract.md`](usage-stats-contract.md) | 用量面板的数据来源、聚合口径与缓存契约 |
| [`genui-architecture.md`](genui-architecture.md) | 生成式 UI 的帧隔离、运行时与消息通道 |
| [`genui-audit.md`](genui-audit.md) | 生成式 UI 的越界审计与结论 |
| [`rightbar-api-notes.md`](rightbar-api-notes.md) | 右侧栏相关的宿主 API 取证 |
| [`perf-audit.md`](perf-audit.md) | 性能基线：CSSOM 读取、观察器数量、产物预算 |
| [`replication-toggles.md`](replication-toggles.md) | 组件复刻开关的边界与判定 |
| [`reference-absorption-ledger.md`](reference-absorption-ledger.md) | 参考实现吸收台账：哪些做了、哪些没做、为什么 |
| [`reference-next-wave.md`](reference-next-wave.md) | 参考实现的下一批候选项 |
| [`handoff.md`](handoff.md) | 当前状态交接：已发布版本、渠道、环境事实、遗留项 |
| [`install-plugins.md`](install-plugins.md) | 安装全部插件（不含 context-rail）的分步教程 |
