# 发布说明 · Publishing

这个仓库里的插件可以走两条分发路径。**两条都需要一个公开可访问的来源** —— DSH 的插件市场没有中央服务器，它只是一个你自己托管的 JSON 索引，索引里的每个版本都要指向一个能被拉取到的地方（npm 包或公开 git 仓库）。

## 路径一：npm 包（推荐）

### 1. 登录

当前 registry 是 `npmmirror.com`（镜像，不能发布）。`publishConfig.registry` 已经把三个包钉到官方源，但**登录也要登到官方源**：

```bash
npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
```

### 2. 名字冲突

`dsh-usage-stats` **已被占用**（`lanlandeni`，2 个月前发布，见 <https://www.npmjs.com/package/dsh-usage-stats>）。发之前必须改名，例如：

```bash
cd plugins/usage-stats
# 改成你自己的 scope，发布到 npm 时不会冲突
npm pkg set name=@hwfee/dsh-usage-stats
npm run build && npm test
```

另外两个名字当前可用：
- `dsh-cds-theme` ✅ 未被占用
- `dsh-system-fonts` ✅ 未被占用

发布前再确认一次：

```bash
npm view dsh-cds-theme --registry=https://registry.npmjs.org
npm view dsh-system-fonts --registry=https://registry.npmjs.org
```

任何一条返回版本号就说明被占了。

### 3. 检查产物新鲜度

`npm test` 的第一项就是产物检查，过不了会直接失败：

```bash
cd plugins/cds-theme && npm run build && npm test && cd ../..
```

### 4. 发布

```bash
# 先看包里到底有什么，7.5 MB 主要是 fonts/
cd plugins/cds-theme && npm pack --dry-run && cd ../..

cd plugins/cds-theme && npm publish && cd ../..
cd plugins/system-fonts && npm publish && cd ../..
cd plugins/usage-stats && npm publish && cd ../..
```

### 5. 验证

```bash
npm view dsh-cds-theme --registry=https://registry.npmjs.org
```

---

## 路径二：git（免 npm 账号）

市场条目的 `source` 支持 git：

```json
{
  "type": "git",
  "url": "https://github.com/<你>/HwFee-dsh.git",
  "commit": "<40 位 commit sha>",
  "path": "plugins/cds-theme"
}
```

要求：仓库**公开**，`commit` 必须是真实的完整 sha（不能是分支名，市场会拒绝非常量引用）。用 `git rev-parse HEAD` 取。

缺点：git 源没有版本语义，每次更新都要改索引里的 commit。适合「先发出去再说」。

---

## 路径三：让市场索引指向本机（只给自己用）

DSH 的市场索引是一个 URL 列表，可以指向 `file://`？**不行** —— schema 只接受 `^https?://`。本地测试得起一个 HTTP 服务：

```bash
# 在仓库根目录
npx http-server market -p 8787
# 然后在 DSH 设置 → 插件 → 市场源里填 http://127.0.0.1:8787/index.json
```

也可以直接改 profile 的 patch：

```yaml
- id: plugin-market
  config:
    indexes:
      - http://127.0.0.1:8787/index.json
```

注意 `ui-plugin-market` 这个界面插件当前是 `absent`（未挂载），所以市场界面可能根本不显示。命令行可用的替代是直接装：

```bash
dsh plugin --profile desktop add dsh-cds-theme
```

---

## 索引文件

`market/index.json` 已按 `@deepseek-ai/dsh-plugin-market` 的服务契约写好（`MarketSearchResult` / `MarketPlugin` / `MarketVersion`）。

发布前需要改两处：

| 位置 | 现在 | 要改成 |
|---|---|---|
| 每个 `plugins[].icon` | `https://raw.githubusercontent.com/HwFee/HwFee-dsh/...` | 你的真实 GitHub 用户名 |
| `dsh-usage-stats` 的 `name` | `dsh-usage-stats` | 改名后的真实包名 |

`publishTimestamp` 已按实际打包时间写入。

---

## 字体的事

`plugins/cds-theme/fonts/` 里有六个 **Anthropic 商业字体**（`AnthropicSans/Serif/Mono`），它们和 anthropic.com 线上文件字节一致，没有随插件再分发的授权。两个思源字体是 SIL OFL，可以自由分发。

这些字体已经被提交进 git 历史（提交 `027262e`），所以**公开仓库 = 分发它们**。如果要规避：

```bash
# 从当前树移除（历史仍在）
git rm --cached plugins/cds-theme/fonts/Anthropic*.woff2
echo 'plugins/cds-theme/fonts/Anthropic*.woff2' >> .gitignore

# 连历史一起清掉（会改写所有 commit hash，慎用）
git filter-repo --path-glob 'plugins/cds-theme/fonts/Anthropic*' --invert-paths
```

移除后需要改 `client/src/font-assets.js` 与 `fonts.js` 的字体栈，主题会回退到系统 serif/sans，观感会变。

## 当前已知问题

- `dsh-usage-stats` 名字冲突（见上）。
- 市场索引里的 icon URL 需要真实的 GitHub 用户名。
- `ui-plugin-market` 界面插件在当前离线包里是 `absent`，市场页可能不显示；不影响用 `dsh plugin add` 安装。
- `tools/` 不在各包的 `files` 字段里，所以**安装后的包跑不了 `npm test`** 和 `npm run build`。这是有意的：用户只需要提交好的产物。
