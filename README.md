# HwFee-dsh — 插件集合

DeepSeek Harness（DSH）的插件集合。每个插件是 `plugins/` 下的独立包：各自有清单、补丁、构建脚本与测试，可单独安装、单独停用。

## 插件

| 插件 | 目录 | 作用 |
|---|---|---|
| `dsh-cds-theme` | [`plugins/cds-theme`](plugins/cds-theme) | Claude Design System 主题：把宿主 `--dsw-*` 令牌整体重映射到 CDS 的暖灰表面、陶土橙强调色、双环焦点与有机动效，并对输入框、代码块、消息行做组件级细化。 |
| `dsh-system-fonts` | [`plugins/system-fonts`](plugins/system-fonts) | 字体插件：内容字体 / 代码字体各一槽，可选字重、行距、字距。只改排印，不动配色。 |

两者互不依赖，可分别启用；同时装也安全 —— 主题只管颜色、形状与阴影，字体插件只管字族、字重与行距，没有重叠的令牌。

## 安装

```bash
# 在插件目录内先构建产物（link: 安装不会自动构建）
cd plugins/cds-theme && npm ci && npm run build && cd -

dsh plugin --profile desktop add link:C:/Users/17445/Desktop/HwFee-dsh/plugins/cds-theme
```

装完**必须完全退出并重开 DeepSeek Harness**：插件的加载发生在 profile 组装期，正在运行的进程不会热加载它。

用 `link:` 而不是 `file:`，profile 里指向源码目录，改完源码重启 DSH 即可生效，不必重装。

移除：

```bash
dsh plugin --profile desktop remove dsh-cds-theme
```

## 开发

每个插件目录内独立运行：

```bash
npm test          # 校验产物新鲜度 + 全部单测
npm run build     # client/src/* -> client/client.js
```

`client/client.js` 是**提交进仓库的产物**：`link:` 安装指向源码目录，profile 启动时不会替你构建，所以产物必须与源码同步。`npm test` 的第一项就是新鲜度检查（`build-client.mjs --check`），产物过期会直接失败。

## 目录结构

```
plugins/
  cds-theme/
    client/src/      客户端源码（ESM），esbuild 打包成宿主模块格式
    client/client.js 提交的产物
    lib/index.js     Host 半边（空实现：主题是纯浏览器关注点）
    locale/          en.json / zh.json —— 插件列表里的标题与描述
    icon.svg         插件图标
    test/            node:test 单测
    tools/           构建脚本
  system-fonts/
    ...              同上结构
docs/
  cds-spec.md        CDS 设计系统规范（从参考仓库逐行取证）
  host-hooks.md      宿主 DOM/CSS 可覆写点勘察
```

## 参考

`docs/` 下的两份文档是本仓库实现的依据，不是概述：

- [`docs/cds-spec.md`](docs/cds-spec.md) —— 从 `.reference/open-claude-ui` 逐行提取的设计系统规范，含 18 处 `AGENTS.md` 与 `cds-theme.css` 冲突的裁定表。
- [`docs/host-hooks.md`](docs/host-hooks.md) —— 宿主哪些 `data-*` 是可靠样式锚点、哪些是哈希类、以及 `--dsw-elevation-*` 为什么必须用 `!important` 样式表而不能走内联令牌。

`.reference/open-claude-ui` 是参考项目的一个干净克隆（MIT），只读，不参与构建。
