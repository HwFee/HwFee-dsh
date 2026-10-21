# Third-party notices

## ZCode `visualize` design system

`visualize.css` (and its generated sibling `visualize.css.js`) are derived from:

- **Project:** zai-org/ZCode
- **Path:** `apps/zcode-cli/packages/visualize-plugin/skills/visualize/assets/visualize.css`
- **License:** Apache License 2.0
- **Copyright:** Zhipu AI / Z.ai (ZCode contributors)

### What was changed

The port is **not** a byte-for-byte copy. `tools/port-visualize-css.mjs` replaces
the upstream token layer:

1. Every `--background`, `--foreground`, `--card`, `--border`, … declaration is
   re-pointed at a DSH theme alias (`--dsw-alias-*`) instead of ZCode's
   `--color-*` host variables.
2. The six chart series colours are rebuilt from DSH's brand and state palette,
   because DSH exposes one accent rather than ZCode's six hand-picked hues.
3. `light-dark()` fallbacks are dropped: DSH switches themes with
   `body[data-ds-dark-theme]`, not `prefers-color-scheme`, so an imported
   fallback would disagree with the user's theme choice.
4. The type scale is mapped onto `--dsh-content-font-size*`.

The component rules below the token layer are copied verbatim. Re-running the
script against a newer upstream file reproduces the port.

### Apache-2.0 obligations

This package is distributed under the MIT license. The Apache-2.0 material above
is included under Apache-2.0's terms; this notice satisfies its attribution
requirement, and the modified files carry a header naming the origin. Apache-2.0
text: <https://www.apache.org/licenses/LICENSE-2.0>.

No ZCode runtime code is included: the plugin does not ship their JavaScript,
their MCP bridge, their vendor libraries (D3, Lucide, Floating UI), or the
`Tweak` runtime. Only the stylesheet is ported.
