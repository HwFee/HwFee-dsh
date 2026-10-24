# Release verification · 2026-10-24

本次发布源码为 `70b93ce`，已推送 `master`。外部推理滑条的 33 个文件已在 `2ba9ae2` 删除，未发布、未启用。仓库保留六个插件，其中五个发新版本，字体插件保持 0.1.3。

## 分发

五个新版本：主题 0.1.8、生成式 UI 0.1.2、Git Bash 0.1.2、下一句 0.1.2、用量统计 0.1.4。每个包有独立 Release tag。

官方 npm 版本记录、tarball HEAD 和 GET 均通过；五份 Release 资产重新下载后，与上传 npm 的 tarball 逐字节相等，SHA-1 与 npm dist.shasum 一致，SHA-512 与 dist.integrity 一致。完整哈希见 [publish-record.md](publish-record.md)。初次上传后的短窗口曾返回 404，等待后全部转为 200；没有重复发布或继续烧版本号。

## 本地检查

| 检查 | 结果 |
|---|---|
| 根目录 `npm run build`、`npm test` | 六个插件通过；新鲜度检查、清单契约及各插件测试均执行 |
| `node tools/audit.mjs` | 通过；保留脚本原有的人工复核提示 |
| `node plugins/cds-theme/tools/verify.mjs` | 通过 |
| `node market/check-release-assets.mjs` | 六个包通过，只有两个 OFL 思源子集内联，无商业字体字节或散落字体 |
| `market/test-mount-criteria.ps1` | 41 条判据通过 |
| `market/verify-mount.ps1` | 官方 npm 锁定版本安装，六个包的 patch 行解析、bundle id、Host apply 和配置组装均通过；[完整输出](mount-verification-2026-10-24.md) |

纯逻辑测试的截图：**不适用：纯逻辑单测**。假 DOM 的单元测试也不构成真实界面验证；真实渲染器检查如下。

## 真实应用与截图

DSH 0.2.1-rc.3 的真实渲染器：海洋专项 17/17，通过三种鲸鱼颜色、变色、点击反馈、持续游动、深色模式、减少动态效果和窄窗口场景；首页、持续变化、设置打开与未处理异常检查 4/4。额外采样确认鲸鱼眼睛位置发生移动。截图逐张查看。

本地证据位于 `.work/shots/ocean-revision/` 和 `.work/shots/rc3-compat/40–44*.png`，日志为 `.work/release-20261024-ocean-live.log`、`release-20261024-live.log`、`release-20261024-motion.log`。截图保留在本地，不随本次 git 提交。

另建 `.work/release-observation-home-20261024/`，六个插件均从官方 npm 按当前版本实体安装，依赖中没有 link。启动后首页有海洋、用量面板和字体样式，slot 错误为零；首页截图为 `.work/shots/release-20261024-npm-observation.png`，已查看。原用户 profile 未更换安装来源。

插件列表的 DOM 读取包含六个插件，slot 错误为零。**该列表的原生窗口视觉检查 SKIP**：独立实例尚未配置账号，原生窗口停在欢迎界面；后台列表截图的补拍无效，不能用它声称列表视觉通过。没有操作登录或 API Key 界面。

## 安装矩阵的限制

[完整矩阵](install-matrix.md) 为 34 条：32 PASS、1 条预期失败（git 子目录）、1 条实际失败（未锁定的 predict）。所有包的**锁定版本、Release URL、本地 tarball、link 路径**均通过；六包当前锁定版本的挂载验证另行全部通过。

未锁定 predict 实测解析为 0.1.1，宿主因它要求 rc.2 而拒绝在 rc.3 上安装，并回滚该临时 profile。其他几个未锁定包名也解析到上一版，版本已在矩阵逐项记录，不能把这些安装视为当前新版本的验证。

本次另核对了应用打包的 pnpm 11.28.5 源码：`C:/DSHTry/resources/runtime/primary-runtime/dependencies/pnpm/dist/pnpm.mjs:177535` 的默认值是 `"minimum-release-age": 24 * 60`。旧记录里 `config get` 返回 undefined，并不能证明没有默认等待期。本次没有修改等待期，也没有为不兼容旧版添加豁免；README 和市场索引使用已验证的固定版本。

## 市场

`market/index.json` 已重新生成，包含六个当前版本，来源均为 npm。主题、字体与生成式 UI 三个现有条目的描述已提交 [PR #9162](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9162)。本地 README 生成验证通过，上游 `check` 和 `Submission gate` 均通过；PR 尚待维护者合并，后续状态以 PR 页面为准。
