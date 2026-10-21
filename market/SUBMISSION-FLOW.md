# 发布与市场提交流程 · Release and market submission

这份文件是**一次完整交付的固定顺序**：从改完代码到出现在插件市场里。凡是「发版」「发布插件」「提交市场」「把新插件加到市场」这类请求，直接照此执行，不用再问先做什么。

它之所以单独成文：发布和市场提交各有一半故障是**静默**的——npm 显示成功但 tarball 404、安装成功但插件不挂载、条目描述与代码不符被维护者打回。下面的每一步都带「怎么算过了」，因为只看命令回显会把失败读成成功。

相关文件：

| 文件 | 管什么 |
|---|---|
| `market/PUBLISHING.md` | npm 认证与发布细节（token、403、卡死版本） |
| `market/SUBMISSION.md` | 市场目录的条目内容与仓库年龄门槛 |
| `market/test-install-paths.ps1` | 安装矩阵：5 条安装路径 + 跨用例 |
| `market/verify-mount.ps1` | 挂载验证：行名解析、bundle id、Host `apply` |
| `market/submit-to-catalog.ps1` | 只提交上游还没有的条目，开 PR |
| `market/install-matrix.md` | 最近一次矩阵的报告（提交进仓库） |

---

## 0. 先定范围

一次交付要能一句话说清：**哪个（些）插件、哪个版本、要不要发 npm / 建 Release / 提市场**。三个版本各自独立演进，发布 tag 按包分，不能共用一个。

**验收**：`plugins/<name>/package.json` 的 `version` 已经 bump，且没有改过已发布的版本号（npm 不允许覆盖）。

---

## 1. 构建与测试

```sh
cd plugins/<name>
npm run build
npm test
```

**验收**：`npm test` 退出码 0；第一项新鲜度检查通过（`client/client.js` 与 `client/src/` 同步）。回归测试若涉及 bug 修复，确认「改回旧代码会红」。

---

## 2. 发布到 npm

token 只从环境变量注入，不写进 `~/.npmrc`、不进仓库：

```sh
export NPM_TOKEN='npm_…'
npm publish --//registry.npmjs.org/:_authToken="$NPM_TOKEN"
```

推荐用现成脚本，它会按清单逐个 build → test → publish → 校验：

```sh
pwsh market/publish-pending.ps1
```

**注意 shell 展开**：`NPM_TOKEN='…' npm publish --…="$NPM_TOKEN"` 里 `$NPM_TOKEN` 在赋值生效前就展开成空，结果是 `ENEEDAUTH`。要么先 `export`，要么直接写值。

**验收**：不是看 `+ name@version`，而是下面两条都成立：

```sh
npm view <name> versions --registry=https://registry.npmjs.org
curl -sI https://registry.npmjs.org/<name>/-/<name>-<version>.tgz   # 200
```

卡在暂存区的版本（`409 Cannot publish over previously published versions`）无法清除，**换一个新版本号**，别连着烧版本号。

---

## 3. 建 Release（每个包一个）

tag 规则 `<plugin>-v<version>`；scoped 包的资产名**去掉 scope**：

```sh
cd plugins/<name> && npm pack --pack-destination <临时目录>
gh release create <plugin>-v<version> <临时目录>/<asset>.tgz \
  --title "<包名> <version>" --notes "…"
```

例：`@hwfee/dsh-usage-stats` → tag `usage-stats-v0.1.2`，资产 `hwfee-dsh-usage-stats-0.1.2.tgz`。

**验收**：资产 URL 返回 200，且资产 shasum 与 npm 上的 `dist.shasum` 一致。

---

## 4. 安装矩阵

```sh
pwsh market/test-install-paths.ps1
```

脚本自己从 npm 读实际版本（不写死），对每个包跑：npm 名、`包名@版本`、Release URL、本地 tarball、`link:`，外加 git 子目录（预期失败）、重复安装、卸载无残留、镜像安装。判据是**成为 profile 层**：`cordis.patch.yml` 存在 **且** 包名在 `dsh.profile.bundles` 里。

**验收**：报告写入 `market/install-matrix.md`；除 `git-subdir` 这一条预期失败外，不得有 FAIL。

**读报告要看 Installed 列，不要假设它等于 `latest`。** pnpm 的 `minimumReleaseAge`（供应链策略）会把发布不满阈值（约 24 小时）的版本排除出**范围解析**，所以未锁定安装可能落后一版。锁定版本与 Release tarball 不受影响。报告会逐包注明这一点；看到落后先核对时间，别当成发布失败。**但如果被回落的那个版本本身有缺陷（例如 bundle id 还是旧包名），未锁定安装就是坏的**——这时要么等窗口过去，要么在安装说明里写死版本。

---

## 5. 挂载验证

```sh
pwsh market/verify-mount.ps1
```

它检查矩阵看不到的东西：行 `name` 能在 `node_modules` 下解析、bundle 的 `__ModuleLoader__.load({ id })` 等于包名、Host 导出 `apply`、profile 能组装。

**验收**：输出 `ALL N PLUGIN(S) MOUNT CORRECTLY`。任何一条 FAIL 都不能发布——bundle id 不符会让**整个 web boot** 挂掉，不只是这个插件。

---

## 6. 更新市场材料

两处，缺一不可：

| 文件 | 更新什么 |
|---|---|
| `market/catalog/*.yml` | 新插件一条一个文件，文件名 `Owner__repo--plugins-<slug>.yml`；`url` 指子目录，`name` 是 `owner/repo#subname` |
| `market/index.json` | 插件清单、版本、发布时间与源码 commit |

**描述必须与代码一致。** 这是唯一会被维护者逐句核对的东西，也是本仓库真实被打回过一次的原因：`system-fonts` 的条目写了「plus weight / 另加字重」，而插件明确**从不写 `font-weight`**（字重归宿主主题）。维护者改正后直接收录，PR 关闭。写条目时按代码与 README 写，不要按「听起来更完整」写；含 `: ` 的英文描述要加引号。

分类选贴合插件实际行为的那个，不选希望它出现的位置；拿不准就选最近的，维护者会改。

---

## 7. 提交市场

```sh
pwsh market/submit-to-catalog.ps1            # 干跑：列出 pending、检查前置
pwsh market/submit-to-catalog.ps1 -Apply     # 建分支、复制条目、开 PR
```

脚本**只提交上游还没有的条目**（按文件名判断），已收录的不会重写——市场规则要求 PR 不得改动与自己无关的条目。本地条目与上游不一致时它会报告但不会静默提交；确需更新自己那条时加 `-Update`。

**验收**：PR 已创建（或已存在则给出 URL），CI 的 `dsh.bundle`、仓库年龄、README 再生成三项通过。

已知门禁：

| 门禁 | 说明 |
|---|---|
| 一个 PR 最多 3 条 | 超过会被 CI 拒绝；脚本在超过时直接停下并要求拆分 |
| 仓库满 1 天 | 对 `HwFee/HwFee-dsh` 已满足 |
| 描述属实 | 维护者会读代码；夸大与错误会被打回 |
| git 子目录不可安装 | `pnpm` 只装仓库根，`&path:` 被忽略——市场条目靠 npm 或 Release tarball，不靠 git 路径 |

---

## 8. 记录与提交

```sh
git add market/install-matrix.md market/catalog market/index.json AGENTS.md
git commit -m "…"
```

提交信息写**为什么**，不是「更新市场」。PR 链接写进 `market/SUBMISSION.md` 的状态表，方便下一个人核对。

**验收**：报告与条目都在仓库里；`git status` 没有遗漏的 `market/` 改动；PR 链接可点开。

---

## 完成判据

- [ ] `npm view` 与 tarball URL 都成立（不是只看 `npm publish` 的输出）
- [ ] 每个包有对应 `<plugin>-v<version>` Release，资产 200、shasum 与 npm 一致
- [ ] `install-matrix.md` 除预期的 `git-subdir` 外无 FAIL
- [ ] `verify-mount.ps1` 全绿
- [ ] `market/catalog` 与 `market/index.json` 覆盖本次的插件与版本
- [ ] 市场 PR 已开（或已收录），链接记录在 `market/SUBMISSION.md`
- [ ] 证据已提交进仓库

本流程是命令行审计与发布，**截图不适用**；涉及界面改动的实机验证仍按 `AGENTS.md` 第七节第 3 步逐场景截图。