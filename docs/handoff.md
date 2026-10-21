# 交接文档 · 2026-10-20

本文只记录三件事：**没有做什么**、**预期是什么**、**结果是什么**。

仓库根 `AGENTS.md` 的规则全部有效，先读它。

---

## 一、发包与安装矩阵（完全没做）

### 1.1 发布到 npm

**没有做什么**：`@hwfee/dsh-genui`、`@hwfee/dsh-git-bash`、`@hwfee/dsh-predict` 三个包一个都没有发布。

**预期**：三个包都出现在 npm 上，版本号各为 `0.1.0`；`npm view <name> versions` 能列出它们，tarball URL 返回 200。

**结果**：
- `@hwfee/dsh-genui` 在 npm 上 **404**（从未发布过）。
- `@hwfee/dsh-git-bash`、`@hwfee/dsh-predict` 同样从未发布。
- 已有版本：`dsh-cds-theme@0.1.4`、`@hwfee/dsh-usage-stats@0.1.2`、`dsh-system-fonts@0.1.1`。
- 本地 `~/.npmrc` 的默认 registry 是 `registry.npmmirror.com`（只读镜像）。`//registry.npmjs.org/:_authToken` 已配置，`npm whoami --registry=https://registry.npmjs.org` 返回 `hwfee`，token 可用。

### 1.2 安装矩阵

**没有做什么**：没有跑 `market/test-install-paths.ps1`，没有跑 `market/verify-mount.ps1`。没有产出新的 `market/install-matrix.md`。

**预期**：五条安装路径（npm 包名 / 包名@版本 / Release tarball URL / 本地 tarball / `link:` 路径）每条都验证「安装成 profile 层」而不只是「命令没报错」，每条验完卸载再装。结果写进 `market/install-matrix.md` 并提交。

**结果**：`market/install-matrix.md` 已存在但内容是旧版本（三个老包），没有覆盖三个新包。

### 1.3 Git tag 与 Release

**没有做什么**：没有创建 `genui-v0.1.0`、`git-bash-v0.1.0`、`predict-v0.1.0` 三个 tag，没有上传 tarball 到 GitHub Releases。

**预期**：按 `AGENTS.md` 的 `<plugin>-v<version>` 规则打 tag；scoped 包的资产名去掉 scope（`hwfee-dsh-genui-0.1.0.tgz`）。

**结果**：没有 tag，没有 Release 资产。

---

## 二、「你画预测」插件（功能不工作）

插件在 `plugins/predict/`，Host 半边、客户端 ghost 文字、设置行、全部单测都已写完（54 项测试通过）。

**没有做什么**：没有让它真正产出过一次预测。

**预期**：每轮回答结束后，输入框里出现一行浅色文字预测用户下一句；按 Tab 填入输入框但不发送；打字即消失；新会话第一轮不预测；连续失败 3 次后冷却 10 轮；可在设置里关掉或指定模型。

**结果**：
- 单测全过（解析、上下文、两条规则、退避、ghost 显隐、占位符互斥）。
- **实机一次预测都没出现过**，E2E 第二轮始终是 `SKIP`。
- 已定位的失败点：`plugins/predict/lib/index.js` 的 `appendSuggestion()` 里有
  `if (typeof session.appendPluginRecord !== 'function') return false`，
  而 `Session` 实例上**没有**这个方法，所以该函数永远返回 `false`，一条记录都没写进会话日志。
- 因此客户端从未收到任何建议——客户端侧 `globalThis.__dshPredictDebug` 始终为 `null`。
- 未验证：宿主侧第三方插件能否 `import '@deepseek-ai/dsh-session'`（`link:` 安装下模块解析未实测）。
- 未验证：`ctx.on('session/event', …)` 监听器是否真的被触发（加过探针，探针本身也没输出）。

**已知的额外事实**（不是结论，是观察）：
- Host 与 Client 是两个进程，`ctx.emit` 跨不过去。
- 客户端 bundle 的 `require` 模块表只有 11 个种子包，其中没有 `dsh-session`。
- 客户端 `ctx.sessions.binding(id)` 返回的对象含 `eventSource`，`eventSource.getSnapshot().entries` 是原始事件数组；`ui-chat` 自己在用这个。
- `turn/end` 是 session 事件，`ctx.on('turn/end')` 收不到。

---

## 三、Git Bash 插件（基本完成，两处未验证）

插件在 `plugins/git-bash/`，91 项测试通过。

**没有做什么**：没有验证「切换模式后，`run_shell` 工具真的用新 shell 执行」。

**预期**：选「自动」用 Git Bash；选「Windows PowerShell」用 PowerShell；选「Git Bash」用 Git Bash；切换后下一次工具调用立即生效。

**结果**：
- 三种模式在本机的解析都正确（`auto` → Git Bash，`pwsh` → PowerShell 7，`gitbash` → Git Bash）。
- 设置行显示三选一，切换持久化，E2E 4/4 通过。
- **`run_shell` 工具一次都没有被模型实际调用过**，三种模式下命令是否真的跑在对应 shell 里，未验证。
- 设置行的横线颜色与相邻行不一致（git-bash `rgba(20,20,20,0.1)`，genui `rgba(20,20,20,0.06)`）。已去掉本行的 border，**改动后未重新验证**。

**没有做什么**：没有让 Git Bash 真正接管宿主的默认 shell。

**预期**（用户明确选定）：替换 `ctx.shell`，让 Git Bash 成为默认解释器；PowerShell 保留为可选工具。

**结果**：没有接管。`plugins/git-bash/cordis.patch.yml` 只插入自己一行，没有禁用宿主的 `pwsh-sandbox`。宿主的 `tool-bash` / `tool-pwsh` 仍按平台互斥组装，Windows 上仍是 PowerShell 为默认。`run_shell` 是**并列的第二个工具**，不是默认 shell。

---

## 四、UI 字体（做了一半，cds-theme 测试红）

**没有做什么**：没有让 `cds-theme` 的测试重新通过。

**预期**：`cds-theme` 全部测试绿（改动前是全部通过）。

**结果**：`cds-theme` 现在是 **55 通过 / 1 失败**。失败的是 `test/css.test.mjs:1024`「the three motion curves are tokens: unconditional and exact」——该测试逐字节比对 `/* ---- motion tokens:` 之后的整块内容，而新增的 `uiFontRules()` 输出被插在了它后面，顺序变了。断言失败，输出差异显示 `body { font-family: var(--dsw-font-family-ui) !important; }` 出现在了预期之外的位置。

**功能本身**：UI 字体角色已实现并实测有效——设 `--dsh-font-family-ui: Georgia` 后，按钮/侧栏变成 Georgia，对话正文保持 Anthropic Sans。设置行「界面字体」已出现，默认显示 `Anthropic Sans`（不再是「默认字体」）。

**没有做什么**：没有验证「在设置里选一个 UI 字体后，UI 真的变、正文不动」。

**预期**：选任意字体后只有界面控件变化。

**结果**：只用手写 CSS 变量验证过隔离，没有走设置行的下拉菜单实测。

---

## 五、genui 的横线（改了，没验证）

**没有做什么**：没有重新验证改动的效果。

**预期**：genui 设置行的底边与相邻行颜色一致（都是 `rgba(20,20,20,0.1)`）。

**结果**：去掉了 `.dsh-genui-setting-row` 自己的 `border-bottom`（原来写 `l1` = 0.06，与相邻行的 `l2` = 0.10 不一致）。改动后重新构建并跑了单测（全过），但**没有重启应用看实际效果**。

---

## 六、文档（部分完成）

**已完成**：
- `AGENTS.md` 新增第十二节「字体角色」，记录 UI 角色为什么存在、三处必须同时成立、以及 `sanitize()` 白名单漏键会导致 React #185。
- `AGENTS.md` 新增第七节「开发一个新插件的完整流水线」（由子代理写入）。
- `docs/genui-audit.md`：genui 对照 MCP Apps 的审计。
- `plugins/genui/README.md`、`plugins/git-bash/README.md`。

**没有做**：`plugins/predict/README.md` 不存在。

**预期**：每个插件都有面向使用者的 README（安装、入口、能填什么）。

**结果**：predict 没有 README；`package.json` 的 `files` 里列了它，`npm pack` 会警告文件不存在。

---

## 七、仓库当前状态

**测试**（实测，2026-10-20）：

| 插件 | 结果 |
|---|---|
| `plugins/cds-theme` | **55 通过 / 1 失败** |
| `plugins/system-fonts` | 7 通过 / 0 失败 |
| `plugins/genui` | 107 通过 / 0 失败（含 vendor 11、typography 6、title-placement 13） |
| `plugins/git-bash` | 91 通过 / 0 失败 |
| `plugins/predict` | 54 通过 / 0 失败 |
| `plugins/usage-stats` | 未在本轮改动，未重跑 |

`node tools/audit.mjs` 的产物预算全部在范围内；`git-bash` 未声明 budget（audit 输出为 note，不是失败）。

**profile 状态**（`~/.dsh/profiles/desktop/`）：
- `dsh.profile.bundles` 有 8 条，含 `@hwfee/dsh-git-bash`、`@hwfee/dsh-predict`。
- `@hwfee/dsh-git-bash`、`@hwfee/dsh-predict` 以 **junction** 形式安装（Windows 下 `ln -s` 会静默退化成目录拷贝，必须用 `fs.symlinkSync(target, link, 'junction')`）。
- `ui-settings` 行被改成 `enabled: true`（原本是 `false`，导致设置面板打不开、插件设置行无处挂载）。改动前备份在 `cordis.patch.yml.bak-before-settings`。
- 「界面字体」行依赖 `cds-theme` 与 `system-fonts` 同时为最新构建。

**未提交**：`docs/genui-audit.md`、`docs/handoff.md`(本文)、`plugins/genui/`、`plugins/git-bash/`、`plugins/predict/` 全部是 untracked。`plugins/cds-theme/`、`plugins/system-fonts/` 的改动也未提交。

---

## 八、环境相关（会重复踩的）

**应用起不来时**：

- 日志在 `~/AppData/Roaming/@deepseek-ai/dsh-desktop/logs/`。
- 常见原因之一是 `~/.dsh/profiles/desktop/` 下的文件被外部流程改写。本轮至少发生过一次：`cordis.patch.yml` 从 9 行被削到 6 行（丢了 `permission`、`locale`、`session-log-deepseek`），另有 `package.json` 的 `bundles` 被从 6 条削到 2 条。
- `node tools/preflight.mjs` 可检查 profile 完整性；`node tools/launch-desktop.mjs` 自检后带 CDP 启动。
- 另一个独立故障：Electron 的 auth cookie 会随每次启动累积（本机曾积到 71 个），堆多了会卡在「Loading plugins…」。`node tools/reset-auth-cookies.mjs` 可清理（需应用关闭）。

**应用正在运行时**，`~/.dsh/profiles/desktop/` 与 `Network/Cookies` 都被占用，文件读写可能静默失败。

**构建**：`plugins/*/client/src/styles.js` 与 `lib/skill.js` 里的 CSS/正文是模板字符串。**注释中出现反引号会让构建失败**，报 `Expected ";" but found "..."`，指向的行号是注释本身。本轮因此失败过至少 5 次。

**CDP**：`.work/cdp.mjs` 是临时的 CDP 驱动（`.work/` 被 gitignore）。启动应用时需带 `--remote-debugging-port=9222`。
