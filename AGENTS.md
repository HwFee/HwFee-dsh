# 开发与维护规则 · Working on this repository

本仓库是 **DeepSeek Harness（DSH）插件的集合**。每个插件是 `plugins/<name>/` 下的独立包，有自己的清单、bundle 补丁、构建脚本与测试，可单独安装、升级、停用。

这份文件写给**下一个人**（人或 agent）：它记录的不是理想做法，而是这个仓库实际踩过的坑，以及为什么现在的形状是这样。每条规则后面都跟着「违反会怎样」，因为这里的失败多数是**静默**的——测试全绿，应用却起不来。

---

## 一、动手之前先知道的三件事

**1. 这个仓库的产物是提交进 git 的。** `client/client.js` 不是构建缓存，是发布物。`link:` 安装让 profile 直接读工作区，DSH 启动时不构建。所以你改了 `client/src/` 却忘记 `npm run build`，用户拿到的是**旧代码**，而 `npm test` 会红——它的第一项就是新鲜度检查。

**2. 插件的失败方式通常是静默的。** 名字对不上 → 行不激活 → 面板消失，**没有报错**。bundle id 对不上 → 整个 web boot 挂掉，用户看到「应用无法启动」。这两类都已真实发生过。

**3. 本地能跑不等于发布成立。** profile 用 `link:` 绕过了 npm，所以 npm 上的包可能是旧的、坏的、甚至不存在。**修好的东西只有重新发包才算交付。**

---

## 二、目录与职责

```
plugins/<name>/
  package.json          清单：name / version / dsh.bundle / dsh.client / files / publishConfig
  cordis.patch.yml      bundle 补丁，一行 insert，name 必须等于包名
  client/src/           浏览器源码（ESM）
  client/client.js      构建产物，提交进 git
  lib/index.js          Host 半边
  locale/               en.json / zh.json —— 插件列表里的标题与描述
  icon.svg              插件图标
  test/                 node:test 套件
  tools/build-client.mjs  构建 + `--check` 新鲜度检查
docs/                   证据文档，不是概述
tools/                  仓库级审计与基准脚本
market/                 发布与市场提交材料
skills/                 第三方知识库（自带 LICENSE/NOTICE，勿改）
```

**为什么 `client/client.js` 要提交**：`link:` 安装指向源码目录，profile 启动时不会替你构建。不提交产物 = 插件装上去是空的。

**为什么 `docs/` 里是证据不是总结**：`cds-spec.md` 每个数值带 `文件:行号`，冲突有裁定表；`host-hooks.md` 记录哪些 `data-*` 可靠、哪些是盐化哈希。改实现前先查它们，别重新猜一遍。

---

## 三、新增一个插件

按顺序做，每步都有验收标准。

### 1. 建目录与清单

从现有插件复制结构，最少要这些字段：

```jsonc
{
  "name": "<包名>",                 // 唯一真相，见第四节
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "icon": "./icon.svg",
  "license": "MIT",
  "author": "…",
  "publishConfig": {                // 没有这两行，发布必失败
    "access": "public",
    "registry": "https://registry.npmjs.org"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },   // 决定它能否作为 profile 层安装
    "client": {
      "inject": ["@deepseek-ai/dsh-client-ui-renderer"],  // 包 ID，不是服务名
      "platform": "web",
      "immediately": true
    }
  },
  "files": ["lib", "client/client.js", "cordis.patch.yml", "icon.svg", "README.md"],
  "exports": { ".": { "default": "./lib/index.js" }, "./client": "./client/client.js", … }
}
```

**验收**：`node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` 不报错。

### 2. 写 bundle 补丁

```yaml
- insert:
    - id: <插件 id>
      name: '<包名>'      # ← 必须与 package.json 的 name 完全一致
```

**`id` 与 `name` 是两回事**：`id` 是插件身份，还常被用作 `localStorage` 键前缀和设置行 id 前缀，**改名会丢用户设置**；`name` 是包解析目标，**改名必须与包名同步**。

### 3. Host 半边

`lib/index.js` 必须导出 `name` 和 `apply`。只有 `name` 没有 `apply`，Cordis 会拒绝该插件（`invalid plugin, expect function or object with an "apply" method`），entry 变成没有 fiber 的僵尸行，客户端 bundle 永远不进 boot 图——症状同样是「插件消失了」。

即使 Host 半边什么都不做，也要写一个空的 `apply()`。

### 4. 客户端源码与构建

源码放 `client/src/`，入口 `index.js`。构建脚本**从 package.json 读包名**：

```js
const PACKAGE_NAME = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name
// …
'  id: ' + JSON.stringify(PACKAGE_NAME) + ',\n' +
```

**绝对不要在构建脚本里硬编码 id。** 这是本仓库最贵的一次教训：`dsh-usage-stats` 改名为 `@hwfee/dsh-usage-stats` 时，patch 行改了、构建脚本里那行没改，结果 bundle 用旧 id 注册，宿主重试后抛出 `client-modules: duplicate factory registration`，**整个 web boot 挂掉**，应用无法启动。

### 5. 测试

最少要有的四类：

| 类型 | 断言什么 | 参照 |
|---|---|---|
| 清单契约 | patch name == 包名；`main`/`exports`/`files` 指向的文件存在 | `test/manifest.test.mjs`（三个插件都有，可直接复制） |
| 纯逻辑 | 算法、解析、格式化——不碰 DOM | 各插件的 `*.test.mjs` |
| DOM 行为 | 用假 DOM 驱动标记、监听、清理 | `cds-theme/test/hero.test.mjs` |
| 回归守卫 | **每个修过的 bug 一条**，且验证过「改回旧代码它会红」 | `cds-theme/test/ripple.test.mjs` 的反馈环那条 |

**回归测试必须证明它抓得住 bug。** 写完后手动把代码改回错误形态，确认测试变红，再还原。只写断言不验证，等于没写——`ripple` 的 canvas 尺寸反馈环一开始就是「有测试但测试用假尺寸绕过了」，所以线上照样炸。

### 6. 接进 `npm test`

```jsonc
"test": "node tools/build-client.mjs --check && node test/manifest.test.mjs && node test/xxx.test.mjs && …"
```

新鲜度检查放第一位，清单契约放第二位——这两类失败最快、最致命，不该等慢测试跑完才暴露。

---

## 四、包名出现在四个地方，必须同时改

改 `package.json.name` 是本仓库**最危险的编辑**，因为它静默破坏整个应用，而不只是插件。已经发生过两次。

| # | 位置 | 不一致的后果 |
|---|---|---|
| 1 | `package.json` 的 `name` | 其余三处的真相来源 |
| 2 | `cordis.patch.yml` → `insert[].name` | Loader 无法把行解析到包，行**永不激活**，插件**无声消失**。实测表现：`cordis_inspect_query` 显示该行 `status: "inactive"`，而其它一切看起来都正常 |
| 3 | 客户端 bundle 的 `__ModuleLoader__.load({ id })` | 宿主按包名给每个 client-module 图行建键。id 不符 → 行永远匹配不上注册 → loader 走单资源 URL 重试 → bundle **第二次执行** → `client-modules: duplicate factory registration`。**web boot 直接挂**，用户看到「应用无法启动」 |
| 4 | profile 的依赖键与 `bundles` 条目 | pnpm 装不上，或 bundle 不被组装 |

**改名清单**（照着做，别凭记忆）：

```sh
# 1. 改清单
#    2. 改 patch 行（同一提交）
#    3. 重新构建 —— id 从清单来，构建后必须核对
npm run build
grep -A2 '__ModuleLoader__.load' client/client.js   # id 应等于新包名
#    4. 改 profile（.dsh/profiles/<profile>/package.json 的 dependencies 与 bundles）
#    5. 重建 profile 的 node_modules 链接（scoped 包要在 @scope/ 目录下建）
#    6. 重建 pnpm-lock.yaml：cd <profile> && pnpm install --lockfile-only
```

**不要改的东西**：`PLUGIN_ID` 之外的内部 id。`STORAGE_KEY`、`SETTINGS_ROW_ID`、`LOCALE_NS`、路由路径都属于用户数据或跨插件契约，改它们会丢设置或让别人的测试失败。`usage-stats` 改包名时只动了 `PLUGIN_ID`，其余全部保留——这是正确示范。

**重启才算生效**：bundle 在页面启动时加载，浏览器已经取过模块图。改完 bundle 只刷新页面**不够**，必须退出应用重开。

---

## 五、改插件时的硬规则

### 只能命中稳定钩子

- ✅ 宿主故意暴露的 `data-*`（`[data-composer-card]`、`[data-code-block-banner]`、`[data-conversation-content]`…）
- ✅ 有意的字面量类（`.md-code-block`）
- ✅ 宿主自己的中间变量（`--dsl-code-block-*`）
- ✅ 自己的标记属性（`data-cds-table`、`data-cds-greeting`）——**从稳定锚点结构化找到目标，再打自己的标记**
- ❌ 盐化 CSS-Modules 类（`.RlGAzG_card`、`._markdown_1ypvv_5`）——宿主每次构建都变

**找不到稳定钩子时**：走令牌（token）、走结构查找后自己打标记，或者**别改**。三种都可以接受，"凑合选个可能稳定的类"不可以。

### 令牌与样式

- `ctx.theme.overrideTokens` 的每个值必须是 `{ light, dark }` 对；裸字符串会在 theme 服务里抛错。调用点有 `assertPairs` 守着。
- `--dsw-elevation-*` 声明在 `body, body *` 上，**内联写在 `body` 上无效**，必须用带 `!important` 的样式表规则。
- 不要用 `linear` 或 `ease-in-out` 这类通用缓动；用 `palette.js` 里的 CDS 曲线。
- 组件规则默认放在 `refine` 开关之下；纯令牌不放在任何开关下。

### 生命周期

- 每个 `ctx.effect(...)` 必须返回清理函数。观察器要 `disconnect`，监听器要 `removeEventListener`，定时器要 `clear`。
- 可选服务一律 `ctx.get('name')`，并在 `apply` 内判断；`ctx.<service>` 只对 `inject` 里声明过的服务合法。
- DOM 标记必须**幂等**且**可撤销**：`setAttribute` 同值无害，`stop()` 要能摘干净。
- 不要删除 React 管理的节点。要隐藏就设 `display: none` 并在 dispose 时还原。

### 性能

- 不要在每帧读布局（`getBoundingClientRect`）。要尺寸用 `ResizeObserver`。
- 监听器用 passive，不 `preventDefault`、不 `stopPropagation`——除非该项功能本身要求。
- 流式输出期间新增节点极多：MutationObserver 回调里只做指针比较之类的最廉价判断，查询要合并到一帧一次。
- 尊重 `prefers-reduced-motion`：不是「慢一点」，而是**不动**。

### 字体与资产

- 字体可以内联为 `data:` URL（桌面壳 `dsh-app://` 下 `file://` 和相对路径都不行），代价是体积。内联后**不要再把原字体目录打进包**，那是重复。
- 内联是否成立要**验证产物**，不能看源码：`fontSourcesFor()` 在读 `file://` 基准前就返回内联值，所以源码里看不出分支是否会被走到。用产物自己的 `__ModuleLoader__` 入口加载并调用相关函数来确认。
- 商业字体（如 Anthropic 的六款）**没有再分发授权**。仓库里存了不等于可以公开分发，详见 `market/PUBLISHING.md`。

---

## 六、验证：提交前跑什么

```sh
# 在改动过的插件目录内
npm run build
npm test                          # 新鲜度 + 清单契约 + 全部单测

# 仓库级
node tools/audit.mjs              # 产物预算、unsafe DOM、eval、观察器释放、开关契约
cd plugins/cds-theme && node tools/verify.mjs    # 主题自身的 73 项断言
```

当前基线（2026-10-20）：

| 插件 | 测试数 | 版本 |
|---|---|---|
| `dsh-cds-theme` | 393 | 0.1.4 |
| `dsh-usage-stats` | 114 | 0.1.2 |
| `dsh-system-fonts` | 7 | 0.1.1 |

数字会随改动增长，**以实际运行结果为准**，不必回头改这张表；它只用来发现"某次改动把测试弄丢了"。

`tools/audit.mjs` 里有一条**产物预算**：`client/client.js` 有硬上限，因为它是每次页面加载都要解析的东西。超过时不要直接调大数字——先看是不是重复打包了字体或依赖。

---

## 七、发布：改完不等于交付

`client/client.js`、`lib/`、`cordis.patch.yml`、`package.json` 全在发布包里。**本地 `link:` 安装看不见这个问题**：profile 直接读工作区，永远是最新的。

### 发布流程

```sh
cd plugins/<name>
npm version patch --no-git-tag-version   # npm 不允许覆盖已发布版本
npm run build && npm test
npm publish                              # 需要带 bypass 2fa 的 token
```

**验证只有两条命令算数**：

```sh
npm view <name> versions --registry=https://registry.npmjs.org     # 版本出现在列表里
curl -sI https://registry.npmjs.org/<name>/-/<name>-<version>.tgz  # 200，不是 404
```

`npm publish` 打印的 `+ name@version` 和 "being processed" **只代表客户端接受了上传**，不代表 registry 已提交。只看这两行会误判成"发成功了"。

### 已知环境限制

- 本机 `~/.npmrc` 默认 registry 是 `registry.npmmirror.com`，**只读镜像，不能发布**。所以每个包的 `package.json` 里必须有 `publishConfig.registry`。
- 发布需要 `bypass 2fa` 的 granular token；普通 token 会得到 `E403 ... 2FA ... required`。
- 镜像站同步有延迟：刚发布的包在镜像上可能还指向旧版本，`dsh plugin add` 因此可能装到错的版本甚至失败（`ERR_PNPM_TARBALL_EXTRACT`）。等一会儿或临时指定官方源。

### 版本被 npm 卡死

`409 Cannot publish over previously staged version "<v>"` 意味着该版本进了 npm 暂存区且**无法清除**：`npm stage` 在 npm 11 不存在，registry 也没有对应接口（[npm/cli#9889](https://github.com/npm/cli/issues/9889)）。

- 这不是「还在扫描」，等待无效。
- 卡死**按版本**而不是按包：换一个新版本号通常能过（实测 `0.1.2`、`0.1.3` 卡死，`0.1.4` 两分钟上线）。
- 但**一次失败不代表包坏了**——换号后先用 tarball URL 确认，再决定下一步。不要连着烧掉一串版本号。

### 卡死版本台账

| 包 | 版本 | 首次出现 | 结果 |
|---|---|---|---|
| `dsh-cds-theme` | `0.1.2` | 2026-10-20 | 卡死，tarball 404，从未恢复 |
| `dsh-cds-theme` | `0.1.3` | 2026-10-20 | 卡死，tarball 404，从未恢复 |
| `dsh-cds-theme` | `0.1.4` | 2026-10-20 | 已发布，两分钟上线 |

**发布原则**：不要让一次发行依赖单次发布成功。代码先进仓库（那是真相来源，`link:` 直接读它），npm 随后；npm 徽章只是便利，允许滞后。

---

## 八、分发与市场

| 渠道 | 要求 | 状态 |
|---|---|---|
| npm | `dsh.bundle` + 已发布版本 | 三个包已上线 |
| **git 源（子目录）** | **不可用** —— pnpm 只装仓库根，`&path:` 被忽略 | 已验证失败 |
| Release tarball URL | 无需 npm 账号 | 可用，见 Releases |
| 本地 `link:` | 开发用 | 可用 |
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（19k star） | `dsh.bundle` 即可，**不要求 npm** | PR #8189 已提交 |
| [2BingLing/dsh-market](https://github.com/2BingLing/dsh-market) | 打 `dsh-plugin` topic，每日自动扫描 | 已打 topic |

**git 子目录装不了**这条要记住，它看起来应该可行但不行：

```sh
# 两种写法都失败
git+https://github.com/HwFee/HwFee-dsh.git#<sha>&path:/plugins/xxx
https://github.com/HwFee/HwFee-dsh/tree/<sha>/plugins/xxx
```

要 git 安装，仓库根必须**就是**插件根（一仓一插件）。

市场索引的 `MarketSource` 虽然定义了 `type: 'git'`，但实测条目写 git 源时市场解析不出可安装目标；`index.json` 里的条目应使用 npm 源。

---

## 九、profile 不是仓库，别手改着玩

`.dsh/profiles/<profile>/` 是**每台机器的状态**，不属于本仓库。改它要谨慎：

- 它已经被外部流程改写并覆盖过两次，一次把 `bundles` 从 11 条削到 2 条、`cordis.patch.yml` 从 11 条削到 5 条，导致应用起不来。
- **改前先备份**到仓库外的临时目录。
- `package.json` 与 `pnpm-lock.yaml` 必须一致，否则启动失败。改完依赖后跑 `pnpm install --lockfile-only`。
- scoped 包的符号链接必须在 `node_modules/@scope/` 子目录里，不能直接放 `node_modules/` 下。

---

## 十、提交与文档

- **一次改动的范围要可陈述**：改了哪个插件、哪个行为、要不要发包。无关的拉链式改动分开提交。
- **提交信息写「为什么」**：不是 "fix bug"，而是「patch 行的 name 还是旧包名，导致行无法解析、插件静默不激活」。
- **行为变了就改文档**：`README.md` 面向使用者（安装、入口、能填什么），`AGENTS.md` 面向维护者（规则、坑、为什么这样）。两者不重复。
- **`docs/` 里的证据带引用**：改了某个令牌值，同步改它旁边的 `文件:行号` 注释，否则证据失效。
- **不要提交**：`.reference/`、`.repro/`、`.work/`、`.dsh-paste/`、`node_modules/`、截图工具产生的 `SnowShot_*.png`。真截图放 `assets/` 并在 README 里按名引用。

---

## 十一、这份文件自己的规矩

这里的每条规则都对应一次真实故障。**新增规则时写清楚「违反会怎样」**——只说「应该这样」的规则，下一个人会绕过它。

规则过期比没有规则更糟。当某条规则的原因不再成立（宿主改了钩子、npm 修了 bug），**删掉它并说明为什么**，而不是留着让后来者猜。
