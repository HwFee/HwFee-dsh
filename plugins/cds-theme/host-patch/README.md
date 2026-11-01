# host-patch — 让编辑卡片显示真实文件行号

这个目录随插件一起发布，用途只有一个：**修改宿主 DSH 的 `app.asar`**，让 `edit` / `write` 卡片知道每个改动在文件里的真实起始行。

主题本身不会、也不能自行改动宿主归档——插件运行在宿主进程里时归档被锁住，而且没人希望一个主题插件悄悄改安装目录。所以这一步必须由你手动执行一次。

## 为什么需要它

宿主的文件工具在生成 diff 时**丢掉了每个 hunk 的起始行号**：它只把文本交给渲染层，行号信息在这里消失。因此不打补丁时，卡片的行号列只能显示「本 hunk 内第 1、2、3 行」——主题不会拿它冒充文件行号，会显示 `—` 与「文件行号不可用」。

补丁做两件事：

1. 在宿主写 `meta.diffs` 时保留 `oldStart` / `newStart`；
2. 在浏览器侧重建 hunk 时不要把这两个字段再删一次。

## 使用

**先完全退出 DSH**（Windows 会在运行时锁住归档），然后在任意终端：

```sh
# 1. 看当前状态：哪些补丁已装、对应哪个宿主构建
node node_modules/dsh-cds-theme/host-patch/patch-asar.mjs status

# 2. 预演：只读，不改安装，输出一份候选归档
node node_modules/dsh-cds-theme/host-patch/patch-asar.mjs apply --dry-run --out candidate.asar

# 3. 真正应用（会在归档旁边写 app.asar.bak-<时间戳> 再替换）
node node_modules/dsh-cds-theme/host-patch/patch-asar.mjs apply

# 4. 回退
node node_modules/dsh-cds-theme/host-patch/patch-asar.mjs revert
```

装好后启动 DSH，新的 `edit` / `write` 卡片就带真实行号了。**旧会话不会变成有行号**：它们的起点在记录时已经丢失，卡片会继续显示 `—`。

如果不是从 npm/link 安装，而是在仓库里工作，把路径换成 `tools/patch-asar.mjs` 与 `patches/` 即可——文件是同一份（打包副本由 `tools/sync-host-patch.mjs` 生成，`--check` 会在两者不一致时失败）。

## 会改什么、不会改什么

- 只改动归档里两个（或三个）成员的文本：`dsh-tool-fs`、`dsh-client-ui-tool`，以及可选的 web 前端 bundle。
- 不碰账号、配置、会话或 profile；不联网。
- 每个被改的成员都会重算 sha256，重打包后整体校验 framing、偏移与逐个成员哈希。
- 需要安装目录的写权限；如果 DSH 装在 `Program Files` 下，用管理员终端。

## 两个必须知道的限制

1. **DSH 升级会覆盖 `app.asar`，补丁随之消失。** 每次升级后重新跑 `status`，再 `apply`。
2. **第二个补丁针对压缩过的前端 bundle**，它的定位串是构建产物：宿主一换构建，`status` 会报 `unavailable` 而不是"猜着打"。那时要么等本插件更新，要么只装第一个补丁（`--patch hunk-lines`）——它本身就足以让主题的卡片显示真实行号；第二个补丁只是让宿主自己那张卡片也能拿到行号。

## 高级

```sh
--patch hunk-lines       # 只装数据层（不依赖前端 bundle 的构建）
--asar <path>            # 指定归档路径（多个安装、预览通道）
--out <path>             # 只与 --dry-run 连用
--force                  # 强制重装（半装状态下先 revert）
```

`status` 的四种结论：`patched`、`unpatched`、`unavailable`（不是本工具认识的构建）、`partial`（被手工改过或上次中断）。`partial` 状态下先 `revert`，不要反复 `apply`。
