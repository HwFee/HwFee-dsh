# 安装全部插件（不含 context-rail）

本仓库六个可装插件一条命令装齐。`context-rail` 需要从源码构建，不在这次安装范围里，脚本默认就跳过它。

支持的渠道只有两个：**npm 官方源** 与 **GitHub Release 资产**；市场（dsh-market / awesome-dsh-plugin）只用来发现插件。镜像站（npmmirror）不再作为安装渠道。

---

## 1. 一条命令

在仓库根目录：

```powershell
pwsh market/install-all.ps1 -Profile desktop
```

它做四件事：

1. 逐个向 `https://registry.npmjs.org` 问**当前最新版本**；
2. 用 `dsh plugin --profile desktop add <包名>@<版本> --registry=https://registry.npmjs.org` 安装；
3. 读回 profile 的 `package.json`，逐个核对声明版本；
4. 打印 `OK` / `MISMATCH`。

只想看它要装什么，加 `-DryRun`；只装其中几个，加 `-Only cds-theme,usage-stats`；确实需要 context-rail 时加 `-IncludeContextRail`（它要求仓库里已经构建过）。

**为什么脚本自己解析版本。** `dsh plugin add <包名>` 把 `latest` 交给 pnpm 解析，而 pnpm 12 在这台机器上会从本地缓存给出旧答案：实测 `pnpm view dsh-cds-theme version` 返回 `0.1.10`，同一条命令加 `--registry=https://registry.npmjs.org/` 却装出 `0.1.8`。脚本改用 `npm view` 取版本再显式钉住，绕开了这一步。

---

## 2. 手动安装（等价命令）

一次一条，版本写死，任何一条失败不会影响其他：

```powershell
dsh plugin --profile desktop add dsh-cds-theme@0.1.11 --registry=https://registry.npmjs.org
dsh plugin --profile desktop add dsh-system-fonts@0.1.3 --registry=https://registry.npmjs.org
dsh plugin --profile desktop add @hwfee/dsh-usage-stats@0.1.5 --registry=https://registry.npmjs.org
dsh plugin --profile desktop add @hwfee/dsh-genui@0.1.2 --registry=https://registry.npmjs.org
dsh plugin --profile desktop add @hwfee/dsh-git-bash@0.1.2 --registry=https://registry.npmjs.org
dsh plugin --profile desktop add @hwfee/dsh-predict@0.1.2 --registry=https://registry.npmjs.org
```

没有 npm 账号也能装：把包名换成 Release 资产地址，例如

```powershell
dsh plugin --profile desktop add https://github.com/HwFee/HwFee-dsh/releases/download/cds-theme-v0.1.10/dsh-cds-theme-0.1.10.tgz
```

资产名规则：scoped 包去掉 scope（`@hwfee/dsh-usage-stats` → `hwfee-dsh-usage-stats-0.1.5.tgz`）。

装完**必须彻底退出并重开 DSH**：bundle 在页面启动时加载，只刷新不够。

---

## 3. 验证

- **设置 → 插件**：六个开关都在，且版本号与上表一致。
- **设置 → 主题定制**：主题各调节项出现（`dsh-cds-theme`）。
- **设置 → 通用 → 字体**：内容/代码/终端/界面四个字体行（`dsh-system-fonts`）。
- 新会话首页：问候语、用量面板、`render_ui` 卡片、输入框里的补全建议。
- 命令行核对：

```powershell
node -e "const j=require(process.env.USERPROFILE+'/.dsh/profiles/desktop/package.json');console.log(j.dependencies)"
```

---

## 4. 升级

重跑第 1 节即可；`dsh plugin add` 对已装包会跳到新版本。只想升级一个：

```powershell
dsh plugin --profile desktop add dsh-cds-theme@0.1.11 --registry=https://registry.npmjs.org
```

**从 0.1.9 升到 0.1.10 是必须的**：0.1.9 把正文填充规则写到了所有后代上，代码块里的高亮词、链接、行内代码会掉成无衬线；0.1.10 修好了这一点，并把「回到底部」按钮还给宿主。

---

## 5. 卸载

```powershell
dsh plugin --profile desktop remove @hwfee/dsh-predict
```

卸完同样要退出重开。`dsh plugin remove` 之后 `cordis.patch.yml` 与 `dsh.profile.bundles` 里不应再出现该包；残留会让启动装配报错。

---

## 6. 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| 装到的版本比发布版本旧 | pnpm 的 `latest` 解析走了本地缓存 | 用本仓库的 `market/install-all.ps1`，或手写 `包名@版本` |
| `ERR_PNPM_TARBALL_EXTRACT` | 镜像站与官方源不一致 | 命令里带 `--registry=https://registry.npmjs.org` |
| 插件列表里没有条目 | 只写进了 `dependencies`，没成为 profile 层 | 重跑安装；确认 `cordis.patch.yml` 存在且包名在 `dsh.profile.bundles` 里 |
| 应用起不来 | bundle 与页面启动时算出的 rev 不一致 | 不要按 F5，彻底退出后重开 |
| 编辑卡片没有真实行号 | 宿主归档未打补丁 | 见下节 |

**编辑卡片真实文件行号**：需要宿主保留每个 hunk 的起点，而宿主在生成 diff 时丢掉了它。补丁**随主题包一起发布**，所以从 npm 或 Release 安装的用户也能直接用：

```powershell
node node_modules/dsh-cds-theme/host-patch/patch-asar.mjs status
node node_modules/dsh-cds-theme/host-patch/patch-asar.mjs apply --patch hunk-lines
```

只在仓库里工作时把路径换成 `tools/patch-asar.mjs`（同一份文件，打包副本由 `tools/sync-host-patch.mjs` 生成，`npm run test:tools` 会在两者不一致时报错）。

应用前要完全退出 DSH（Windows 会锁住归档）。**DSH 每次升级都会覆盖 `app.asar`**，升级后要重新应用；备份文件名是 `app.asar.bak-<时间戳>`，用同一条命令 `revert` 回退。说明见 [`../plugins/cds-theme/host-patch/README.md`](../plugins/cds-theme/host-patch/README.md)。
