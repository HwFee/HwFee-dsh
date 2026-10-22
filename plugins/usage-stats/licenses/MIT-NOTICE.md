# 第三方归属 · Third-party attribution

本插件（`@hwfee/dsh-usage-stats`）以 **MIT** 发布。

## 1. 取用了什么

「参考」面板样式（`data-dus-style="compact"`）的**视觉规格**来自：

- **项目**：[Nwflower/dsh-claude-style](https://github.com/Nwflower/dsh-claude-style)
- **版权**：Copyright (c) 2026 Nwflower
- **许可**：MIT（上游仓库根目录 `LICENSE`；其 `packages/client/src/features/sodium/LICENSE` 是**另一份**许可，见第 3 节）

**具体到哪几条规格**（都只是数字与排布关系，不是代码）：

| 规格 | 值 |
|---|---|
| 卡片宽度 | 480px，居中 |
| 卡片表面 | 一层浅 wash，无描边、无投影 |
| 指标格 | 三列平铺，比卡面深一档 |
| 热力图 | 直接画在卡上，无独立底衬、无内边距 |
| 说明行 | 上方无分隔线 |
| 字号 | 12/18 芯片、13/18 数值 |

**实现方式**：按上述规格在本插件里**独立重写**，落成纯 CSS + 宿主设计令牌（`--dsw-alias-*`、`--dsw-radius-*`），没有复制上游的任何源码文件、构建产物或资源。因此这里记录的是**设计规格的来源**，也是 MIT 归属义务的落点。

## 2. 没有取用的内容（以及为什么）

上游仓库里还有几样**不在 MIT 之内**的东西。它们**一件都没有**进入本插件：

| 上游内容 | 许可 | 本插件是否包含 |
|---|---|---|
| **Sodium 引擎**（动效/渲染引擎） | PolyForm Shield | 否。没有引入代码，也没有引入依赖。 |
| **Anthropic 商业字体**（六款） | 商业授权，无再分发权 | 否。没有字体二进制；字体栈只用系统/宿主字体。 |
| **螃蟹插画与图像资源** | 不在 MIT 内 | 否。没有图像资源，图标是本插件自己的 `icon.svg`。 |

**强调色不是上游那个蓝。** 上游把数据蓝写死；本插件改读宿主令牌 `--dsw-alias-state-business-primary`，也就是用户主题里的项目 accent——这样换主题时热力图跟着变，而不是钉在一个外部项目选的颜色上。

## 3. MIT 许可全文（上游）

以下是上游 MIT 许可的完整文本，按其要求随本归属声明一并保留：

```
MIT License

Copyright (c) 2026 Nwflower

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 4. 范围说明

- 本文件覆盖**本插件**的归属。仓库中其他插件各有自己的归属记录。
- 本插件**零运行时依赖**：`package.json` 没有 `dependencies`，`devDependencies` 只有构建期的 `esbuild`（MIT）。
- 若上游将来变更许可，本插件取用的仍只是上表那几条**数字与排布关系**；它们不构成对上游代码的再分发。

---

*Last reviewed: 2026-10-22.*
