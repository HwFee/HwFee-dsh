# 交接：当前状态（2026-11-01）

只写现在成立的事实。历史过程在 git 与 `market/SUBMISSION.md` 的发布记录里，这里不重述。

## 1. 已发布版本

| 包 | 版本 | 渠道 |
|---|---|---|
| `dsh-cds-theme` | 0.1.10 | npm + `cds-theme-v0.1.10` Release |
| `dsh-system-fonts` | 0.1.3 | npm + `system-fonts-v0.1.3` Release |
| `@hwfee/dsh-usage-stats` | 0.1.5 | npm + `usage-stats-v0.1.5` Release |
| `@hwfee/dsh-genui` | 0.1.2 | npm + `genui-v0.1.2` Release |
| `@hwfee/dsh-git-bash` | 0.1.2 | npm + `git-bash-v0.1.2` Release |
| `@hwfee/dsh-predict` | 0.1.2 | npm + `predict-v0.1.2` Release |

`plugins/context-rail` 仍只从源码使用，不在上述六包内。

完整哈希（tarball SHA-1 / SHA-256 / npm integrity）见 [`../market/publish-record.md`](../market/publish-record.md)，逐路径安装结果见 [`../market/install-matrix.md`](../market/install-matrix.md)。

## 2. 渠道

- **npm 官方源**与**GitHub Release 资产**是仅有的两个安装渠道；市场（awesome-dsh-plugin / dsh-market）只用来发现插件。
- 镜像站不作为渠道维护。本机 `~/.npmrc` 已指向 `https://registry.npmjs.org`。
- 不锁版本的安装会落到上一版：pnpm 从本地状态解析 `latest`（实测 `pnpm view` 报 0.1.10、`pnpm add` 却装 0.1.8）。安装一律钉版本，或用 `market/install-all.ps1`。
- 安装步骤见 [`install-plugins.md`](install-plugins.md)。

## 3. 本机环境事实

- `dsh` 不在 PATH 时用 `%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`，当前 `0.2.1-rc.5`。
- 发布 token 只在 **User** 作用域：`[Environment]::GetEnvironmentVariable('NPM_TOKEN','User')`。不要写进 npmrc。
- 宿主归档 `app.asar` 为本机打了 `hunk-lines` 补丁（编辑卡片真实行号的前提），备份在同目录 `app.asar.bak-<时间戳>`。**DSH 每次升级都会覆盖它**，升级后需重新 `node tools/patch-asar.mjs apply --patch hunk-lines`。
- 桌面版与 Web 版 profile 都以 `link:` 指向 `.claude/worktrees/deepseek-harness-reinstall-380998/plugins/*`；改完 `client/src/` 必须在**该目录**重建 bundle，并彻底退出重开 DSH。

## 4. 交付前跑什么

```sh
node tools/install-deps.mjs                       # 首次/换机器：给所有插件装 dev 依赖
cd plugins/<name> && npm run build && npm test
node tools/audit.mjs                              # 仓库级：产物预算、unsafe DOM、观察器泄漏
node market/check-release-assets.mjs --dir plugins/<dir>
pwsh market/test-install-paths.ps1 -Only <dir>
pwsh market/verify-mount.ps1 -Package <包名>
```

矩阵报告与挂载结果必须提交。发布顺序与判定标准见 [`../market/SUBMISSION-FLOW.md`](../market/SUBMISSION-FLOW.md)。

## 5. 遗留项

- 编辑卡片的真实行号依赖宿主补丁；不打补丁的记录显示 `—` 与「文件行号不可用」，不会伪造。
- `dsh-cds-theme@0.1.9` 已在 npm 上标记 deprecated（`npm deprecate`），提示升级到 0.1.10；npm 不允许删除已发布版本，所以这是能做到的极限。
- `tools/patch-asar.mjs` 已支持 rc.2 与 rc.5 两套变体（含 rc.5 改名后的前端资产），`status` 会在未登记的构建上报告 unavailable 而不是猜测；两个补丁的 `--dry-run` 已在本机整包验证（framing / 偏移 / 每个成员 sha256 一致）。说明见 [`../patches/README.md`](../patches/README.md)。
- 不锁版本的解析问题出在 pnpm 一侧，本仓库用 `market/install-all.ps1` 规避，未从根上修 pnpm。
