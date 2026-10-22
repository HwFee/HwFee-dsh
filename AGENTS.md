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

**构建之后刷新页面不只是「不够」，而是会把应用弄挂**（实测 2026-10-20 23:45）：页面按启动时算出的 `rev` 去取 `plugins/??…&rev=…`，而磁盘上的 bundle 刚被重写，请求失败 → `client-modules: bundle script … failed to load` → `web boot: 2 entries did not activate`，用户看到「应用无法启动」的红框。更贵的是红框里那个「禁用第三方插件、备份 profile patch 并重启」：它会把 `dsh.profile.bundles` 从 8 条削到 2 条、并从 patch 里删掉若干宿主行，一次误操作要修两处（改回 `bundles` + 用 `cordis.patch.yml.bak-<ms>` 还原 patch）。

违反会怎样：你以为只是刷新一下，代价是一个起不来的应用和一份被削过的 profile，而用户无法分辨这跟「插件坏了」有什么区别。**改完 bundle 就退出应用重开，不要按 F5。**

### 反引号：构建能过，运行期才炸

`client/src/styles.js`（以及其他把整张 CSS 放进模板字符串的模块）里的注释**不能出现反引号**。一个 `` ` `` 会提前结束模板字符串，后面的文字变成 JavaScript。

两种形态都要认得：

| 形态 | 构建 | 运行期 |
|---|---|---|
| 注释里单个反引号，后面是普通单词（如 `` `text-code` `` 的其中半个） | **esbuild 报错** `Expected ";" but found "text"`，指向注释行 | 到不了运行期 |
| 注释里有**成对**反引号，中间是合法表达式（如 `` `.text - code` ``） | **构建成功** | 宿主报 `@hwfee/dsh-git-bash: import failed: code is not defined`，**整个 web boot 挂掉**，用户看到「应用无法启动」 |

第二种最贵：退出码是 0，产物是新的，`--check` 也过（它只比对内容是否最新）。实测发生在 2026-10-21。

**守卫已经进了构建脚本**：`tools/build-client.mjs` 在 `--check` 与正式构建**两条路径**上都会把产物写进临时文件、按宿主的 `__ModuleLoader__.load({id, factory})` 契约注册并**执行 factory**。factory 抛出就 `exit 1` 并打印「修源码，不要发」。已反向验证：把 `` `.text - code` `` 塞回注释后，`node tools/build-client.mjs --check` 输出 `client/client.js does not load: code is not defined`、退出码 1。

**为什么不能靠静态搜索。** 同一个文件里合法地存在反引号（模板字符串本身、`querySelector` 的模板参数），搜出反引号没有意义；只有真正执行 factory 才能分辨。

违反会怎样：截图里的那种红框。它看起来像「插件坏了」，实际是一个注释里的两个字符。

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

# 真机（改了用户看得见的东西就必须跑）
node tools/launch-desktop.mjs     # preflight 通过后带 CDP 启动
node .work/e2e.mjs                # 端到端断言 + 逐张截图，落在 .work/shots/e2e/

# 启动前自检（改过 profile 或准备实机验证时）
node tools/preflight.mjs          # profile bundles / link 安装 / patch 行 / cookie 堆积
```

按层看，每一层抓的东西不一样，任何一层都不能替代另一层：

| 层 | 命令 | 抓什么 |
|---|---|---|
| 新鲜度 | `npm test` 第一项 | 改了 `client/src/` 却没重建，产物是旧的 |
| 清单契约 | `npm test` 第二项 | patch 的 `name` 与包名不符，行永不激活 |
| 单测 | `npm test` 其余 | 算法、DOM 行为、每个修过的 bug |
| 静态审计 | `node tools/audit.mjs` | 产物超预算、unsafe DOM、eval、观察器泄漏 |
| 端到端 + 视觉 | `.work/e2e*.mjs` + 截图 | 真渲染器里的布局与交互——单测覆盖不到的 |
| 启动自检 | `preflight` + `launch-desktop` | profile 被削、link 失效、patch 损坏、cookie 堆积 |

**代码断言绿了不代表界面对。** 涉及 UI 的改动必须截图并**逐张看**：`genui` 的「标题居中」断言量的是标题盒子与卡片盒子，文字明显靠左时它照样通过——满宽行的盒子中心永远等于卡片中心。是截图发现的。完整流程见「七、开发一个新插件的完整流水线」第 3 步。

**应用起不来时，先跑 `node tools/preflight.mjs`，不要反复重启。** 它检查的都是"应用看起来正常、插件却不见"的静默故障，每条 FAIL 都附带修复命令。当前覆盖：

| 检查 | 抓的是什么 |
|---|---|
| `bundles` | `dsh.profile.bundles` 被削（例如从 6 条削成 2 条）→ 插件全部不挂载。**已发生两次** |
| `link` | `link:` 指向的目录缺 `cordis.patch.yml`、patch 的 `name` 与包名不符、`client/src` 更新了但 `client.js` 没重建 |
| `patch` | 配置文件被截断、行结构损坏 |
| `cookies` | `dsh-auth-*` cookie 堆积（宿主每次启动换端口、从不清理旧的）。超过 8 个要清 |

cookie 堆积的清理脚本单独一份：`node tools/reset-auth-cookies.mjs`（需应用关闭，会自动备份 `Cookies.bak`）。

当前基线（2026-10-20）：

| 插件 | 测试数 | 版本 |
|---|---|---|
| `dsh-cds-theme` | 393 | 0.1.4 |
| `dsh-usage-stats` | 114 | 0.1.2 |
| `dsh-system-fonts` | 7 | 0.1.1 |

数字会随改动增长，**以实际运行结果为准**，不必回头改这张表；它只用来发现"某次改动把测试弄丢了"。

`tools/audit.mjs` 里有一条**产物预算**：`client/client.js` 有硬上限，因为它是每次页面加载都要解析的东西。超过时不要直接调大数字——先看是不是重复打包了字体或依赖。

---

## 七、开发一个新插件的完整流水线

上面第二节讲目录、第三节讲骨架、第五节讲硬规则。这一节把它们串成**一条固定的流水线**：以后开发插件都按这个顺序做，每一步都有「做完的标志」，跳过任何一步都会在前面记录过的某类静默故障上翻车。

```
写代码 → 单元测试 → 端到端 + 截图 → 清理验证会话 → 发包 → 安装矩阵 → 观察期
```

### 1. 写代码

骨架照「三、新增一个插件」做：`package.json` → `cordis.patch.yml` → `lib/index.js`（必须有 `apply`）→ `client/src/` + 构建 → `test/` → 接进 `npm test`。那里已有验收标准，这里不重复。

**做完的标志**：`npm run build` 产出 `client/client.js`；`node -e "JSON.parse(...)"` 能解析清单；`lib/index.js` 导出 `name` 和 `apply`。

违反会怎样：这一步漏掉任何一项，后面所有测试都可能全绿而插件根本不挂载——patch 的 `name` 与包名不符或 Host 只导出了 `name`，行都不激活，**没有任何报错**。

### 2. 单元测试

```sh
npm test     # 新鲜度检查 → 清单契约 → 全部单测
```

**做完的标志**：全绿，且每条**回归测试**都验证过「把代码改回旧形态它会变红」。

违反会怎样：只写断言不验证，等于没写。`ripple` 的 canvas 尺寸反馈环当初就是「有测试，但测试用假尺寸绕过了真实路径」，线上照样炸。

**自建 harness 的测试文件也必须接进 `npm test`。** `dsh-system-fonts` 的 `test/cordis.test.mjs` 用真实 Cordis 激活插件，曾经没被写进 `test` 脚本：存量断言按 5 行写死，UI 字体行加进来后实际是 6 行，它一直是红的，而 `npm test` 全绿。直接跑 `node test/cordis.test.mjs` 才看得见。

违反会怎样：一条永远不跑的测试，和不存在没有区别——它保护的回归会悄悄回来，而 CI/本地都显示绿。**新增一个 `test/*.mjs` 时，同一提交里把它加进 `package.json` 的 `test` 脚本**，并在本地跑一次确认失败时退出码非 0。

### 3. 端到端 + 视觉验证

**E2E 不能只有代码断言，必须截图，并且逐张看。** 这是本仓库已经踩过的坑：`genui` 的「标题居中」几何断言量的是**标题盒子与卡片盒子**，而块级行是满宽的，盒子中心永远等于卡片中心——文字明显靠左时断言依然通过。只有截图能看见。断言本身也没错，错在量错了对象。

**每一条实机验证都必须留下截图，没有截图就不算验证过。** 这条没有例外：设置行、菜单、ghost、Tab 接受、刷新后的持久化，每个场景一张，落在 `.work/shots/<suite>/` 并按顺序命名。纯逻辑单测（不碰 DOM、不渲染界面）无法截图，必须在报告里**明确写「不适用：纯逻辑单测」**，而不是省略。写测试脚本时就把截图调用写进每个场景，不要等事后补——补拍出来的图往往证明不了当时的那条断言。

违反会怎样：一条「PASS」但没有截图的用例，和没跑过一样——它可能量错了对象、可能截的是别的状态。用户已经明确要求「所有测试必须有截屏支持」，漏图就是漏交付。

**第一步永远是真实应用，不是 fixture。** 先带 CDP 启动：

```sh
node tools/launch-desktop.mjs      # 先过 preflight，再以 --remote-debugging-port=9222 启动
node .work/cdp.mjs targets         # 确认 dsh-app:// 页面在列表里
node .work/cdp.mjs shot out.png    # 单张截图
node .work/cdp.mjs eval "<表达式>" # 在真渲染器里取值
```

E2E 脚本放在 `.work/`（已被 gitignore），用 `import { appTarget, connect, evaluate, screenshot } from './cdp.mjs'` 连上去，逐场景驱动。参照 `.work/e2e.mjs`（分场景、可单选）与 `.work/e2e-title.mjs`（带截图的设置项验证）。

**断言要量用户能看到的东西：**

- 文字的 **ink 边界**，不是容器盒子。用 `Range.selectNodeContents(el)` + `getBoundingClientRect()`；对满宽容器直接量 `el.getBoundingClientRect()` 得到的是布局盒，不是文字位置。
- **实际计算样式**：`getComputedStyle(el).display / justifyContent / color`，而不是你写进样式表的那行规则——规则可能没生效、或被宿主样式覆盖。
- 真实交互后的结果：点设置项要确认屏幕上**已经渲染的卡片**移动了，而不是重新挂载后才对。
- 刷新后的持久化、暗色下的令牌解析，都值得单独一条。

**每个场景都要截图，并逐张看。** 截图落在 `.work/shots/<suite>/`，命名带序号（`01-default-above`、`02-settings-row`）。命名是为了让「PASS 了但图不对」能立刻对上号。看的时候问的不是「有没有报错」，而是「这张图能不能证明这条断言」。

**`SKIP` 是合法的结果，但必须写清楚为什么。** E2E 会真的调用模型，模型可能不配合（没用 slider、没调工具、只回了文字）。这时脚本报 `SKIP` 并附带原因（见 `.work/e2e.mjs` 的 `record(..., 'skip', ...)`），**而不是让它悄悄 PASS**。一条绿的、其实什么都没测的用例，比一条红更危险。

违反会怎样：只跑断言不看图，就会交付一个「几何上正确、视觉上是错的」布局；而把跑不起来的场景记成 PASS，会让下一轮改动以为这条路径有覆盖。

### 4. 清理验证会话

E2E 是**真的在和你聊天**，每一轮都会在用户磁盘上留下会话：

```
~/.dsh/sessions/<workspace>/<session-dir>/
```

`<workspace>` 是工作区路径的哈希化名字（例如 `--C-Users-17445-Desktop-HwFee-dsh--`）。不清理，用户的侧栏里就多出一串「调用 render_ui 画一张……」的测试会话——**测试污染了真实数据**，而且下次 E2E 再跑会更难分辨哪些是新的。

先列出来，再删：

```sh
node .work/list-test-sessions.mjs   # 按时间列出，E2E 开头的行带 E2E 标记
```

该脚本靠**提示词标记**（`E2E_MARKERS`）识别自己的会话。新插件的第一轮 E2E 不在它的标记表里，会显示为普通会话——这时按 **mtime + 提示词**人工确认，只删本轮创建的那几个目录：

```powershell
# 先关闭应用，避免会话文件被占用；确认目录名后再删
Remove-Item "$env:USERPROFILE\.dsh\sessions\<workspace>\<session-dir>" -Recurse -Force
```

**不要整个 `<workspace>` 目录删掉**——那里面混着用户的真实会话。也不要为了省事删掉「看起来像测试」的会话：误删用户对话无法恢复。

**做完的标志**：`list-test-sessions.mjs` 的 `e2e` 计数回到验证前的数字。

违反会怎样：测试会话留在侧栏，用户会以为插件在乱开对话；更糟的是后续排查「某个对话为什么坏了」时，证据已经被测试数据淹没。

### 5. 发包

```sh
cd plugins/<name>
npm version patch --no-git-tag-version   # npm 不允许覆盖已发布版本
npm run build && npm test
npm publish                              # 需要 bypass 2fa 的 token
```

**只有这两条命令算数**（详见「八、发布」）：

```sh
npm view <name> versions --registry=https://registry.npmjs.org     # 版本出现在列表里
curl -sI https://registry.npmjs.org/<name>/-/<name>-<version>.tgz  # 200，不是 404
```

`npm publish` 打印的 `+ name@version` 只代表客户端接受了上传。**「本地 `link:` 能跑」不构成发布成立的任何证据**——profile 读的是工作区。

违反会怎样：版本实际卡在 npm 暂存区、tarball 404，而你以为已经发了。用户 `dsh plugin add` 拿到的是旧版本，症状与他们报告的任何 bug 都无法区分。

### 6. 安装矩阵验证

```sh
pwsh market/test-install-paths.ps1        # 跑完自动写 market/install-matrix.md
pwsh market/verify-mount.ps1              # 挂载验证：row name 能解析、bundle id 匹配、Host 导出 apply
git add market/install-matrix.md && git commit -m "Record install matrix for <versions>"
```

每条路径都要覆盖，每个包各一遍：

| 路径 | 验证什么 |
|---|---|
| npm 包名 | 用户最常走的那条 |
| 包名@版本 | 锁定版本时能否装到**新版** |
| Release tarball URL | 没有 npm 账号也能装 |
| 本地 tarball（`npm pack`） | 发布包内容完整（`lib`/`client`/patch/icon 都在） |
| `link:` 路径 | 开发路径仍可用 |

**每条路径验证完要先卸载再重装。** 只装一次通过，说明不了「重复安装」和「卸载后重装」也行——那才是用户升级插件时真正走的动作。脚本对每条路径用全新一次性 profile，并单列 `remove-clean` 与 `double-install` 两个用例；手工补跑时按 **装 → 验层 → 卸 → 确认无残留 → 再装** 的顺序做一遍，确认第二次仍落到同一个版本。

判据不是「命令没报错」，而是包是否成为 profile **层**：`cordis.patch.yml` 存在 **且** 名字出现在 `dsh.profile.bundles` 里。只有 `dependencies` 一条是半安装，插件不挂载。

**做完的标志**：矩阵报告全绿（`git 子目录` 那条是预期的 FAIL），报告已提交。

违反会怎样：源码干净、本地能跑，而用户装的是旧占位包（`ERR_PNPM_TARBALL_EXTRACT`），或装上了却永不激活。这三类故障都只在真装时暴露。

### 7. 观察期

发布并记录矩阵之后，再做一次**真实安装 + 真实启动**：

```sh
node tools/preflight.mjs     # bundles / link / patch / cookies
node tools/launch-desktop.mjs
```

然后在应用里确认：插件出现在插件列表、面板/设置项真的渲染出来、Host 侧没有 `duplicate factory registration` 或 `invalid plugin` 报错。

**做完的标志**：从 npm 装上的版本（不是 `link:`）在真实应用里可见、可用。

违反会怎样：矩阵只证明「包能装成层」，不证明「层能跑起来」——`duplicate factory registration` 会让整个 web boot 挂掉，而安装矩阵是绿的。**重启才算生效**：bundle 在页面启动时加载，改完只刷新不够。

---

## 八、发布：改完不等于交付

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

### 发布凭据：只从环境变量读，不写进 npmrc

**token 放在环境变量里，由发布命令在调用时注入**，不要写进 `~/.npmrc`、更不要进仓库：

```sh
# 三个候选名，按顺序取第一个非空的
$env:NPM_TOKEN  ·  $env:NODE_AUTH_TOKEN  ·  $env:NPM_AUTH_TOKEN

# 发布时注入（--//registry.npmjs.org/:_authToken=… 是「本次命令专用」的配置键）
npm publish --//registry.npmjs.org/:_authToken=$env:NPM_TOKEN
```

现成的脚本：`pwsh market/publish-pending.ps1`——它按清单逐个 `build → test → publish → 校验版本与 tarball`，token 缺失时直接退出并打印设置方法。

**为什么不能靠 `~/.npmrc` 里那一条。** 本机 `~/.npmrc` 确实有一个 `//registry.npmjs.org/:_authToken`，但 2026-10-21 实测它已失效：`npm whoami --registry=https://registry.npmjs.org` → `E401`，`npm publish` → `PUT … E404`（npm 用 404 回应「无权限」，不是「包不存在」）。粒度 token **本来就不支持 `whoami`**，所以 `whoami` 401 不能单独当作失效证据；判据是 publish 的实际返回。

**环境变量必须在启动应用的进程里可见。** 在终端里 `setx`/`$env:NPM_TOKEN=…` 之后，**已经在跑的 DSH 进程看不到新值**（子进程继承的是启动时的环境快照）。要么在设置后重启应用，要么让 agent 通过一个能读到它的终端来完成发布。

违反会怎样：agent 拿着一个失效 token 反复 publish，每次都是 404，看起来像「包名错了」或「registry 抽风」，于是去改包名、烧版本号——真正的原因只是凭据没到进程里。

### 版本被 npm 卡死

`409 Cannot publish over previously staged version "<v>"` 意味着该版本进了 npm 暂存区且**无法清除**：`npm stage` 在 npm 11 不存在，registry 也没有对应接口（[npm/cli#9889](https://github.com/npm/cli/issues/9889)）。

- 这不是「还在扫描」，等待无效。
- 卡死**按版本**而不是按包：换一个新版本号通常能过（`0.1.4` 两分钟上线）。
- 但**一次失败不代表包坏了**——换号后先用 tarball URL 确认，再决定下一步。不要连着烧掉一串版本号。
- **「404」不等于「永久卡死」。** 见下方台账的结论修正：0.1.2 / 0.1.3 曾被判死，两天后都可用。

### 卡死版本台账

| 包 | 版本 | 首次出现 | 结果 |
|---|---|---|---|
| `dsh-cds-theme` | `0.1.2` | 2026-10-20 | 当天数百分钟级未落地；2026-10-22 实测 tarball 200 且在 packument 里，**已可用** |
| `dsh-cds-theme` | `0.1.3` | 2026-10-20 | 同上：当天长时间未落地；2026-10-22 实测 tarball 200 且在 packument 里，**已可用** |
| `dsh-cds-theme` | `0.1.4` | 2026-10-20 | 已发布，两分钟上线 |
| `dsh-cds-theme` | `0.1.6` | 2026-10-22 | 已上传未见版本；观察窗口内未落地 |
| `dsh-cds-theme` | `0.1.7` | 2026-10-22 | 已上传未见版本；观察窗口内未落地 |

**结论修正（2026-10-22 实测）**：这个包上「长时间 pending」与「永久卡死」在短窗口内**不可区分**。0.1.2 / 0.1.3 曾按 404 判死并记进本表，两天后两者 tarball 都是 200、都在 packument 里——当时的判断只是"当天没等到"。所以判死需要更长窗口，或在交付层面改走 Release 资产（`<plugin>-v<version>` tag 的 tgz 可装，实测 `dsh plugin add <release-url>` 落到目标版本，不依赖 npm）。

**发布原则**：不要让一次发行依赖单次发布成功。代码先进仓库（那是真相来源，`link:` 直接读它），npm 随后；npm 徽章只是便利，允许滞后。

---

### 发布后必须跑安装矩阵，并留下笔记

**每次发布或推送之后，跑 `market/test-install-paths.ps1`，并把结果提交。** 这不是可选项。流水线里的位置见「七、开发一个新插件的完整流水线」第 6 步；下面是判定细节与踩过的陷阱。

```sh
pwsh market/test-install-paths.ps1        # 跑完自动写 market/install-matrix.md
git add market/install-matrix.md && git commit -m "Record install matrix for <versions>"
```

**为什么不能只看代码。** 下面三类故障都是在源码里完全看不出来的，只有真装一遍才会暴露：

| 故障 | 代码里看起来 | 实际症状 |
|---|---|---|
| patch 的 `name` 指向不存在的包 | 一行 YAML，毫无异常 | 行永不激活，插件**无声消失** |
| 产物用旧模块 id 注册 | 产物是构建出来的，源码干净 | **整个 web boot 挂掉**，应用无法启动 |
| 镜像站还在发旧的占位包 | 完全无关 | 安装报 `ERR_PNPM_TARBALL_EXTRACT`，重试一分钟后失败 |

第三类只在国内镜像（本机默认 registry）下出现——**那正是中国用户走的路**。

**脚本怎么判定成功。** 它不只看命令有没有报错，而是检查包是否真的变成了 profile **层**：`cordis.patch.yml` 存在 **且** 名字出现在 `dsh.profile.bundles` 里。只有 `dependencies` 一条不算——那正是 pnpm 成功、插件却不挂载的半安装状态。

矩阵之后再跑一次挂载验证，它检查矩阵看不到的东西：

```sh
pwsh market/verify-mount.ps1        # 逐包：row name 能解析到包、bundle id 匹配、Host 导出 apply
```

**两个必须知道的验证陷阱**（都实测踩过）：

| 陷阱 | 现象 | 正确做法 |
|---|---|---|
| 改工作区的 `cordis.patch.yml` 来测 | 检查依然全绿 | npm 安装是**实体拷贝**，不是符号链接。要测坏名字，必须改 profile 里 `node_modules/<pkg>/` 下的副本 |
| 用 `--dump-config` 判断挂载 | 坏 name 也 dump 成功、exit 0 | 它只**回显** patch 文本，不校验包能否解析。真正的判据是 row name 能否在 `node_modules` 下找到目录 |
| 用 Node 的 `execFileSync('dsh', …)` | `spawnSync dsh ENOENT` | `dsh` 是 PowerShell 函数，不是 .exe。验证脚本要用 PowerShell 写 |

`market/prove-mount-guard.ps1` 就是这套判据的自检：它故意把已安装副本的 name 改坏，确认检查会失败，再还原确认通过。改动验证逻辑后跑它。

**每条路径都要覆盖**，每个包各一遍：npm 包名、包名@版本、Release tarball URL、本地 tarball、`link:` 路径；外加跨用例：git 子目录（应当失败）、重复安装、卸载后无残留、镜像站安装。

**版本号必须从 npm 实时读取，不能写死。** 写死的话，发布失败时脚本会拿旧版本去测，然后通过——它测的根本不是你要发的东西。

**Releases 按包分 tag**：三个包版本独立演进（`cds-theme 0.1.4` / `system-fonts 0.1.1` / `usage-stats 0.1.2`），共用一个 tag 无法表达。规则是 `<plugin>-v<version>`，例如 `cds-theme-v0.1.4`。**scoped 包的资产名要去掉 scope**：`@hwfee/dsh-usage-stats` 的 tarball 是 `hwfee-dsh-usage-stats-<v>.tgz`，写错就是 404。

**报告要提交进仓库。** 跑过但不记录的矩阵，等于没人能事后核查。报告里包含实测版本、每条路径的实际安装版本、以及失败时的原始报错。当前基线见 [market/install-matrix.md](market/install-matrix.md)。

---

## 九、分发与市场

| 渠道 | 要求 | 状态 |
|---|---|---|
| npm | `dsh.bundle` + 已发布版本 | 六个包已上线 |
| **git 源（子目录）** | **不可用** —— pnpm 只装仓库根，`&path:` 被忽略 | 已验证失败 |
| Release tarball URL | 无需 npm 账号 | 可用，见 Releases |
| 本地 `link:` | 开发用 | 可用 |
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（19k+ star） | `dsh.bundle` 即可，**不要求 npm** | 前三个已收录；新条目见 `market/SUBMISSION.md` |
| [2BingLing/dsh-market](https://github.com/2BingLing/dsh-market) | 打 `dsh-plugin` topic，每日自动扫描 | 已打 topic |

**git 子目录装不了**这条要记住，它看起来应该可行但不行：

```sh
# 两种写法都失败
git+https://github.com/HwFee/HwFee-dsh.git#<sha>&path:/plugins/xxx
https://github.com/HwFee/HwFee-dsh/tree/<sha>/plugins/xxx
```

要 git 安装，仓库根必须**就是**插件根（一仓一插件）。

市场索引的 `MarketSource` 虽然定义了 `type: 'git'`，但实测条目写 git 源时市场解析不出可安装目标；`index.json` 里的条目应使用 npm 源。

### 市场提交走单独流程文件

一次「发版 / 提交市场」不是一条命令，而是一条固定顺序，写在
[market/SUBMISSION-FLOW.md](market/SUBMISSION-FLOW.md)：

```
构建与测试 → npm 发布并校验 → 每包一个 Release → 安装矩阵 → 挂载验证
→ 更新 market/catalog 与 index.json → 开市场 PR → 记录并提交
```

**凡是遇到发布、发版、建 Release、提交插件市场这类请求，直接按该文件执行，不必再问步骤顺序。** 其中两条不能跳：

- `market/test-install-paths.ps1` 生成的 `market/install-matrix.md` 与 `market/verify-mount.ps1` 的结果，必须随本次改动一起提交进仓库；
- 完成后把版本、PR 链接记进 `market/SUBMISSION.md` 的状态表。

文件里还记着两个容易被误判的现状：**未锁定**安装可能落到上一版（实测：显式指定官方源、不带版本号，装到的仍是前一版；**成因未定位**——该机 `npm config get minimum-release-age` 与 `pnpm config get minimumReleaseAge` 都是 `undefined`，profile 的 `pnpm-workspace.yaml` 也没有该键，所以不要沿用「pnpm 的 minimumReleaseAge 导致」这个旧归因；发布后可靠的只有锁定版本与 Release 资产），以及市场条目描述必须与代码一致——`system-fonts` 曾因写了「plus weight」被维护者核对后改正，而插件从不写 `font-weight`。

违反会怎样：npm 显示成功但 tarball 404、安装成功但行永不激活、条目描述与代码不符被打回——这三种都发生在「命令看起来成功」之后，只有按顺序走到矩阵、挂载验证和条目核对才会暴露。

---

## 十、profile 不是仓库，别手改着玩

`.dsh/profiles/<profile>/` 是**每台机器的状态**，不属于本仓库。改它要谨慎：

- 它已经被外部流程改写并覆盖过两次，一次把 `bundles` 从 11 条削到 2 条、`cordis.patch.yml` 从 11 条削到 5 条，导致应用起不来。2026-10-20 又发生一次：`bundles` 从 6 条削到 2 条，四个插件全部消失，而应用本身正常启动——**看起来像插件坏了，其实是 profile 被改**。`node tools/preflight.mjs` 现在能在启动前抓住它。
- **改前先备份**到仓库外的临时目录。
- `package.json` 与 `pnpm-lock.yaml` 必须一致，否则启动失败。改完依赖后跑 `pnpm install --lockfile-only`。
- scoped 包的符号链接必须在 `node_modules/@scope/` 子目录里，不能直接放 `node_modules/` 下。

### 用 `link:` 安装时，更换安装来源会清空工作区源码

**现象（2026-10-22 实测）**：把六个插件从 `link:` 换成 npm/Release 实体后，`plugins/` 下 **245 个 tracked 文件全部变成删除**，六个插件目录**变空**，`git status` 满屏 ` D`。`plugins/*/node_modules` 也一并消失。

**原因**：profile 的 `node_modules/<pkg>` 是指向工作区 `plugins/<pkg>` 的 **symlink**。`install_bundle` 实体化时先删除这个 symlink 指向的内容——也就是**仓库里的插件源码本身**，不只是那个链接。删除动作发生在工作区，不在 profile 副本里。

**为什么这次没丢**：那 245 个文件此前已 commit 并 push 到远端，逐项核对 `git cat-file -e HEAD:<path>` **0 个不在 HEAD**，`git checkout -- plugins/` 全量恢复，恢复后 `git diff --stat -- plugins/` 为空（与 HEAD 逐字节一致）。`plugins/` 之外无任何删除。

**违反会怎样**：如果当时源码没有 commit + push，这 245 个文件就是**不可恢复的丢失**——包括 `client/client.js` 这种已发布的构建产物，以及只存在于工作区的未提交修复。工作区里唯一的那份副本，会被一次"升级插件"抹掉。

**正确做法**：

1. **实体化安装、更换安装来源之前，先 `git add` + `commit` + `push`**。这是唯一让恢复成为可能的动作，不是可选的稳妥习惯。
2. **不要在唯一的副本上做 `link:` 升级**。要么先把源码推到远端，要么在一个已有的实体安装（非 link）的 profile 上升级。
3. **升级后立刻 `git status -- plugins/`**。出现成片 ` D` 就是它，`git checkout -- plugins/` 可全量恢复（前提见第 1 条）。
4. 恢复 `node_modules` 要逐包 `npm install`（它是 gitignore 的，不在 git 里），然后用 `npm run build --check` 确认产物与提交版本一致——**产物与源不一致比缺依赖严重得多**。

这条与「profile 不是仓库」是同一类危险的两面：profile 里的 link 让工作区成为 profile 的一部分，于是对 profile 的操作就是对工作区的操作。

---

## 十一、提交与文档

- **一次改动的范围要可陈述**：改了哪个插件、哪个行为、要不要发包。无关的拉链式改动分开提交。
- **提交信息写「为什么」**：不是 "fix bug"，而是「patch 行的 name 还是旧包名，导致行无法解析、插件静默不激活」。
- **行为变了就改文档**：`README.md` 面向使用者（安装、入口、能填什么），`AGENTS.md` 面向维护者（规则、坑、为什么这样）。两者不重复。
- **`docs/` 里的证据带引用**：改了某个令牌值，同步改它旁边的 `文件:行号` 注释，否则证据失效。
- **不要提交**：`.reference/`、`.repro/`、`.work/`、`.dsh-paste/`、`node_modules/`、截图工具产生的 `SnowShot_*.png`。真截图放 `assets/` 并在 README 里按名引用。

---

## 十二、字体角色：宿主有三个，我们加了第四个

宿主的 `@deepseek-ai/dsh-client-ui-theme` 里 `FONT_ROLES` **正好是** `['text', 'code', 'terminal']`，而且全部组件都读同一个 `--dsw-font-family`。也就是说：**一个按钮和一段正文共享同一个字族**，字体选择器分不开它们。

`dsh-system-fonts` 在这一层上加了 **UI 角色**，做法分三处，缺一处就不成立：

| # | 位置 | 做什么 | 缺了会怎样 |
|---|---|---|---|
| 1 | `cds-theme/client/src/typography.js` | 发布 `--dsw-font-family-ui: var(--dsh-font-family-ui, var(--dsw-font-family))` | 回落值必须是 `--dsw-font-family` 本身，不能重抄 Anthropic 字体栈——抄了就把 UI 字体冻结在这版主题上，以后改正文角色再也到不了它 |
| 2 | `cds-theme/client/src/styles.js` `uiFontRules()` | `body` 用 UI 变量，`[data-conversation-content]` 用正文角色 | 只做第一步的话，改 UI 字体会把每条回复一起改掉。这两条必须成对存在 |
| 3 | `system-fonts` 的 slot + `bridge.setFamily('ui')` | 写 `--dsh-font-family-ui`；`sanitize()` 白名单要含 `uiFontFamily` | 宿主的 `setFontFamily` **没有** `ui` 这个 role，会抛 `invalid font role`；白名单漏了则每次保存都丢掉这个键 |

**为什么默认是「跟随正文」。** 变量本身写成 `var(--dsh-font-family-ui, var(--dsw-font-family))`——没设值时直接落到正文角色，所以默认行为就是现状，不需要任何额外代码。

**三个必须同时成立的键**（每个设置状态键都是这三件事，`uiFontFamily` 曾经只做了第一件）：

```
DEFAULT_STATE    初始值
sanitize()       白名单——它重建整个 state 对象，没列出的键在每次保存时被静默丢掉
slot             读它的那一行
```

`uiFontFamily` 漏在 `sanitize` 里时，组件读到 `undefined` → 反复渲染 → React 报 **#185（maximum update depth）** → 宿主把异常吞成空的 `<div data-slot-error>`，**行根本不出现，控制台也没有说人话的错误**。`test/ui-font-role.test.mjs` 现在断言「`DEFAULT_STATE` 的每个键都能活着穿过 `sanitize`」，这条比逐键断言更能防下一次。

**两行不要自己画横线。** cds-theme 有一条 `[data-slot="settings.general.item"] > *` 给所有设置行画 `border-l2` 的底线。插件行如果自己写 `border: 0.5px solid var(--dsw-alias-border-l1)`，**特异性输给那条**（单类选择器 vs 属性+子代），结果反而显示成主题的 `l2`——看起来「这条线特别粗」，实际是两条规则打架。设置行**不要自己画线**，让主题画。

**`EFFECTIVE_FONT_VAR` 要跟上。** 新增角色只加 slot 不够：`effectiveDefaultFamily()` 靠这张表把「空值」翻译成「当前实际生效的字族名」。漏了 `ui` 时，未设置的 UI 行永远显示「默认字体」，而另外三行显示 `Anthropic Sans`——同一个状态，两种说法。

**UI 字号：像素步进器 + 两段式实现。** 宿主的 UI 字阶 `--dsw-font-*`（11–24px 共 13 档）在组件里多数是**写死的 px**，改「字号大小」只动正文。cds-theme 先补了令牌角色：`--dsw-font-size-ui`（`var(--dsh-font-size-ui, var(--dsh-content-font-size, 14px))`）、`--dsw-font-size-ui-delta`（`calc(... - 14px)`），`uiShorthand()` 把每一档写成 `calc(<宿主 px> + delta)`。必须用 delta 而不是换成一个尺寸：直接设成正文大小会抹平 11/12/13/14/16/20/24 的层级。

但令牌只覆盖消费 UI 字阶的控件（工具摘要、代码块复制按钮）。宿主的侧栏、设置行标题/描述在盐化 CSS Modules 里写死 `14px/12px`，CSS 钩不到。所以 `system-fonts` 加了两样东西：

| 位置 | 做什么 |
|---|---|
| 设置行「界面字号」 | **像素步进器**，与宿主「字号大小 / 代码字号 / 终端字号」同款：72×36 圆角 plate、数值右对齐、9×9 chevron 上下箭头、`px` 在 plate 外。默认未设置，显示 14px；范围 10–20。**不要做成百分比滑块**——同一组里其他字号都是 px，单位不一致会被一眼看出。 |
| `uiscale.js` | 按 `uiFontSize / 14` 的比例，给 `[data-slot="sidebar"]` 与 `[data-shortcut-modal="settings"]` 里的**文本节点**写内联 `font-size` 与 `line-height`（仅当 line-height 是 px）。每个元素只记录一次基线，重复应用不会叠乘；设回 14px 会逐元素还原原始内联状态。 |

**为什么不用 `zoom`。** `zoom` 缩放整个子树和容器盒子：设置页会整体变大、侧栏文字会被固定宽度的列裁掉（实测 `.work/shots/font-rows/04/05/09*.png`）。用户要的是「界面文字变大、布局不动」——只有逐文本节点写字号能做到。改这个模块后跑 `test/ui-scale.test.mjs`（六个用例：只碰文本节点、不碰正文、不叠乘、还原、保留原有内联值、后挂载节点）与 `.work/e2e-ui-size.mjs`（五张截图：侧栏 14 / 行 14 / 设置 16 / 侧栏 16 / 还原）。

**「界面字体」必须和内容/代码/终端字体排在一起。** 字体组展开后，顺序是 内容字体 → 代码字体 →（代码字号）→ 终端字体 →（终端字号）→ 界面字体 → 界面字号 → 行距 → 字距。决定这个位置的是 system-fonts 的注册 `order`：三个宿主角色 12–14、**UI 字体 15、界面字号 16**、两个滑块 17–18。UI 字体与界面字号没有对应的宿主行可替换，`merge.js` 把它们和滑块一起放到折叠区末尾——所以它必须排在滑块之前。

这条踩过一次：UI 行最初注册成 `order: 145`，展开时被排到行距/字距后面，看起来和字体调节完全无关。**新增字体角色时，order 要接在字体行之后、滑块之前**，否则行会在视觉上脱离这一组。验证用 `node .work/e2e-font-rows.mjs`，三个场景各一张截图（折叠 / 展开 / 菜单）。

---

## 十三、生成式 UI（genui）的边界

**1. 注入的 vendor CSS 必须把每一条选择器都限定在卡片根下。** genui 移植了 ZCode 的 `visualize.css`，上游是给整页用的：`svg`、`h1`、`th`、`code`、`.table`、`.text-warning` 都是全局选择器。这张表注入的是**宿主的页面**，不是卡片自己的文档。移植脚本必须遍历规则树：`@media` / `@supports` 递归处理，`@keyframes` / `@font-face` 跳过，其余选择器统一加 `.dsh-genui-card` 前缀。

违反会怎样：第一次是 `svg { display: block }` 把应用里每个内联图标变成块级，文件引用图标变成单独一行；第二次是页面类（`.table`、`.text-warning`）作用到宿主文字，用户看到工具摘要/卡片外文本被染色，关掉 genui 才消失。**一个手工维护的 BARE 列表挡不住新选择器**——`test/vendor-css.test.mjs` 现在遍历整张表，任何不以 `.dsh-genui-card` 开头的选择器都会红。

**2. 模型返回的可能是组件函数，不是元素。** 契约写的是「返回 React 元素的函数体」，但模型经常写 `return function Card() { … }`。React 会忽略函数子节点，于是工具报告成功、卡片只有标题、正文空白。`client/src/frame/runtime.js` 在返回值是大写开头的函数（或带 `isReactComponent` 的类）时用 `React.createElement` 挂载它。

违反会怎样：「说渲染好了但什么都没有」——卡片 body 为空，模型和用户都以为成功。**当前没有测试守这条**：`test/sandbox.test.mjs` 随同源沙箱一起删掉了，那条断言没有搬进 `test/frame.test.mjs`。这是已知缺口，不是「已覆盖」——补测试时把它搬进 frame 套件。

> 历史背景：旧实现是同源求值 + 掩码全局，探针必须 `try/catch`，因为被掩码的全局是 Proxy、`get` 会抛。那段代码和那个约束都已不存在——现在没有掩码列表，因为卡片碰不到宿主。

**3. 模型片段只在没有 `allow-same-origin` 的沙箱帧里执行。** 卡片的 iframe 是 `sandbox="allow-scripts"` 且**不带** `allow-same-origin`，所以它的文档是 opaque origin：宿主页面、宿主存储与 cookie 对它不可读，不是被遮住而是读不到。帧内 CSP 再挡掉成文的网络 API、导航、嵌套帧与表单。判据在 `client/src/frame-html.js`（帧文档与 CSP）与 `client/src/frame/runtime.js`（帧内运行时），边界本身由 `test/frame.test.mjs` 按来源、origin、token 三个维度断言。

违反会怎样：一旦加上 `allow-same-origin`，帧与宿主同源，卡片就能读到宿主的 DOM、`localStorage` 和 cookie——实测过的三条 `SecurityError` 全部消失，隔离退化成「同一页面里的另一个 div」。

**4. `interact()` 只是请求，发送由宿主确认。** 卡片调用 `interact(text)` 后，宿主在**帧外**渲染一条确认行显示待发送的原句，只有用户点那个按钮才会进 `conversation.send`；丢弃则什么都不发，已有 pending 时再来一次请求会被忽略而不是顶掉。

违反会怎样：直接把 `interact` 接到 `conversation.send`，等于卡片能替用户说话——这正是本版修掉的两个问题之一（另一个是同源执行）。

**5. `client/src/frame/runtime.bundle.json` 也是必须提交的构建输入。** 它是帧内运行时（含构建期打包进去的 React、ReactDOM 与 scheduler）的产物，被 `client/client.js` 内嵌。`tools/build-client.mjs --check` 会同时校验它与 `client/client.js`。

违反会怎样：只提交 `client/client.js` 而不提交 `runtime.bundle.json`，fresh clone 上 `npm test` 的第一项就红，而本地因为文件在磁盘上一直绿——和「改了源码没重建」是同一类静默失败。

**6. 卡片就是答案，正文不要复述。** `lib/skill.js` 明确要求：画了卡片之后，正文最多一句引导或结论，不要再把卡片里的数字/标签列一遍。模型写代码时也常把同一组信息画成多页签——那是它的设计，不是插件行为。

违反会怎样：同一信息出现两遍，卡片的存在反而拉长阅读。

**7. `exclusive: true` 是「这一条事件只归我」，不是「我也要看这一条」。** 宿主的 `dispatchInput` 在某个 Definition 认领了事件后，会跳过**同一 target 上所有非 exclusive 的 Definition**（`dsh-client-ui-conversation/lib/client.js:2838`）。所以认领必须精确到「自己发起的那个 call」；列车式的 `tool/result` 一律认领，等于把全部工具结果从宿主自己的行里抢走。

违反会怎样：**工具行全部变成琥珀色的「已停止」，正文没有输出**。宿主拿不到结果，步骤关闭时 `interruption()` + `projectBlock` 会把每个调用投影成合成的 `{ isError: true, error: { code: 'interrupted' } }`（`dsh-client-ui-chat/lib/client.js:10312`、`:10351`），行状态是 `stopped`，颜色来自 `--dsw-alias-state-warn-label`。这不是 CSS 泄漏：关掉 genui 的两个 `<style>` 标签，行色一个像素都不变——`test/answer-node.test.mjs` 现在钉死「结果只 update、不 exclusive」。

## 十四、如何派遣出这个子代理

**1. 子代理默认且固定使用 `magpie / qoder-cn/dfmodel`，不准改动。** 本仓库派遣子代理时，provider 固定为 `magpie`，model 固定为 `qoder-cn/dfmodel`（目录显示名 `DeepSeek-Flash`）。除非用户之后明确要求换模型，不得替换为主代理模型、修改默认模型配置或调整允许列表。派遣只使用现有路由，不需要改 profile。

当前 GPT 调用链使用的 `subagent` 参数如下；将 `description` 和 `prompt` 换成实际任务即可：

```json
{
  "description": "执行指定任务",
  "prompt": "这里填写子代理需要完成的具体任务与约束。",
  "provider": "magpie",
  "model": "qoder-cn/dfmodel",
  "reasoning_effort": "high"
}
```

默认推理档位为 `high`；本次已按 `magpie / qoder-cn/dfmodel` + `high` 派遣成功并完成任务。`cwd` 需要时取当前任务工作目录。返回 agent id 后等待完成通知，或用 `send_message` 继续同一个子代理。（2026-10-22 那批调用用的是 `low`，属更早档位记录。）

违反会怎样：把主代理的 GPT 路由当作子代理默认值，或为了排障更换模型、修改允许列表，会违背用户固定子代理模型的要求。

**2. 可选参数用省略表达，空字符串不是省略。** `list_subagent_models` 的原始约定是：`{}` 列出允许的 provider；只传 `provider` 列出允许模型；同时传 `provider` 与 `model` 查询精确模型及推理档位。只有已确认默认值解析为上述固定路由、且当前接口允许省略时，才能省略 `subagent` 的模型字段；当前 GPT 接口优先使用上面的已验证完整参数。只有工具明确支持时才能用 `null`。

违反会怎样：2026-10-22 实测，`{"provider":"","model":""}` 被拒绝为 `provider must be non-empty`；反复发送同样参数不会得到模型列表。

**3. 发现报错时核对配置，停止猜测和重复调用。** provider 是宿主注册的路由名；模型自称 GPT，不能据此推断 provider 叫 `openai` 或 `codex`。`qoder-cn/dfmodel` 整体是 model ID，不按 `/` 拆分。遇到 `not allowed for this Session` 时只读核对允许列表，不输出凭据，也不修改配置。当前接口无法省略参数时，用 `{"provider":"magpie","model":"qoder-cn/dfmodel"}` 精确查询；只有输入、配置或实现发生相关变化才重试原失败调用。

违反会怎样：猜 provider 或拆错 model ID 会连续撞上会话路由限制；填空字符串重试会陷入同一错误循环。

**4. 区分已验证事实与未确认原因。** 本次 GPT 侧可见签名把模型发现的两个参数表示成必填字符串，DSH 原始定义却允许省略；另一条子代理调用链以 `{}` 成功返回 provider 列表。具体哪层改变了 schema 尚未定位，本次按用户要求只记录经验，未修复转换链。子代理自述和模型目录只能证明声明的模型标识或显示名，服务端实际模型需要额外的上游证据。

违反会怎样：未取得转换前后证据就归因于 DSH 或 Magpie，或把系统提示中的模型名当成服务端实测结果，会误报根因和模型身份。

## 十五、这份文件自己的规矩

这里的每条规则都对应一次真实故障。**新增规则时写清楚「违反会怎样」**——只说「应该这样」的规则，下一个人会绕过它。

规则过期比没有规则更糟。当某条规则的原因不再成立（宿主改了钩子、npm 修了 bug），**删掉它并说明为什么**，而不是留着让后来者猜。
