export const PLUGIN_ID = 'dsh-system-fonts'
export const STORAGE_KEY = 'dsh-system-fonts/settings'
export const FONTS_API = '/dsh-system-fonts/fonts'

/**
 * The marker the host half requires on every catalogue request.
 *
 * A required custom header is what makes the route unreachable from a page the
 * user visits: an `<img>`/`<script>`/navigation cannot set one at all, and a
 * cross-origin `fetch` that does would send a CORS preflight the host never
 * answers, so the real request is never sent. Same-origin requests never
 * preflight, so this costs the panel nothing. Must match `lib/font-route.js`.
 */
export const FONTS_MARKER_HEADER = 'x-dsh-system-fonts'
export const FONTS_MARKER_VALUE = '1'
export const STYLE_ID = 'dsh-system-fonts-style'
export const PANEL_STYLE_ID = PLUGIN_ID + '/panel'

/**
 * The roles the host theme service (`dsh-client-ui-theme`) exposes:
 * `text` is the UI/content family, `code` the mono slot, `terminal` the
 * terminal's own family. 宿主主题服务的三个字体角色：正文/代码/终端。
 */
export const FONT_ROLES = ['text', 'code', 'terminal']

/**
 * Normalize a user-typed family the same way the host does: split on commas,
 * strip quotes/backslashes/`<>`/control characters, re-quote non-generic
 * names, and join with `", "`. Always returns a valid CSS family list, or
 * `''` for empty input — which the host reads as "clear the role".
 * 与宿主一致地规范化用户输入的族名：按逗号切分、去掉引号/反斜杠/尖括号/
 * 控制字符、给非通用名加引号、以 `", "` 连接。始终返回合法 CSS 族列表；
 * 空输入返回 `''`，宿主将其视为“清除该角色”。
 */
export function normalizeFontFamily(value) {
  const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong)$/i
  const parts = String(value == null ? '' : value).split(',')
  const out = []
  for (const raw of parts) {
    // Strip quotes, backslashes, <>, and C0 control chars — the same set the
    // host's own normalizeFontFamily removes. 去掉引号、反斜杠、尖括号、控制字符。
    const clean = String(raw).replace(new RegExp('["' + "'" + '\\\\<>\\u0000-\\u001f]', 'g'), '').trim()
    if (clean === '') continue
    out.push(GENERIC.test(clean) ? clean.toLowerCase() : '"' + clean + '"')
  }
  return out.join(', ')
}

/**
 * First family of a normalized CSS list, unquoted — the display name the
 * panel shows for a role. 取规范化 CSS 列表的第一个族名（去引号）作显示。
 */
export function firstFamily(list) {
  const first = String(list == null ? '' : list).split(',')[0].trim()
  return first.replace(/^["']|["']$/g, '')
}

// ---------------------------------------------------------------- defaults

/**
 * The host's own stacks, kept as fallbacks. A chosen family is PREPENDED,
 * never substituted: the tail still supplies the CJK families
 * ("PingFang SC", "Microsoft YaHei") that a Latin-only choice would
 * otherwise leave missing, and every glyph the chosen face lacks.
 */
export const DEFAULT_UI_STACK = [
  '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"PingFang SC"',
  '"Hiragino Sans GB"', '"Microsoft YaHei"', '"Helvetica Neue"', 'Helvetica',
  'Arial', 'sans-serif',
]
export const DEFAULT_CODE_STACK = [
  '"SF Mono"', '"JetBrains Mono"', '"Fira Code"', 'Consolas',
  '"Liberation Mono"', 'Menlo', 'Courier', '"PingFang SC"', '"Microsoft YaHei"',
  'monospace',
]

// ------------------------------------------------------- the type scale

/**
 * Every step of the host's typography scale (0.2.0-rc.2). This list is only
 * the FALLBACK set of names probed by the stylesheet builder: the live values
 * are read back from the document at apply time, so a host that changes its
 * scale still gets the right line-height scale.
 *
 * WEIGHTS ARE NOT OURS. Each step carries its own weight in the host's `font`
 * shorthand, and the theme decides it — this plugin never writes a
 * `font-weight`, only families, line-heights and letter-spacing.
 * 宿主 30 档字阶的档名清单；字重由宿主主题决定，本插件从不写 font-weight。
 */
export const SCALE_STEPS = [
  // UI chrome — consumes --dsw-font-family
  'base-16', 'base-strong-16', 'l-20', 'm-18',
  's-14', 's-strong-14',
  'xs-13', 'xs-strong-13',
  'xxs-12', 'xxs-strong-12',
  'xxxs-11', 'xxxs-strong-11',
  'xl-24',
  // Conversation content — consumes --dsw-font-family
  'markdown-base', 'markdown-base-italic',
  'markdown-base-strong', 'markdown-base-strong-italic',
  'markdown-h1', 'markdown-h2', 'markdown-h3', 'markdown-h4',
  'markdown-table', 'markdown-table-head',
  'markdown-small', 'markdown-small-italic',
  'markdown-small-strong', 'markdown-small-strong-italic',
  // Code — consumes --ds-font-family-code
  'markdown-code', 'markdown-code-block', 'markdown-code-block-small',
]

/**
 * The custom property the UI font role writes.
 *
 * NOT a host token: `FONT_ROLES` in `@deepseek-ai/dsh-client-ui-theme` is exactly
 * `['text', 'code', 'terminal']`, so there is no `setFontFamily('ui', …)`. This
 * variable is the plugin's own, and cds-theme publishes
 * `--dsw-font-family-ui: var(--dsh-font-family-ui, var(--dsw-font-family))`, so
 * leaving it unset means "the UI follows the body" — the documented default.
 */
export const UI_FAMILY_VARIABLE = '--dsh-font-family-ui'

/**
 * The host theme's own code-size axis, written on `body` by ui-layout's
 * presenter from the `code` role's preference.
 *
 * WHY SETTING IT ONLY MOVES INLINE CODE. The host derives
 * `--dsh-code-font-delta: calc(<this> - 11px)` from it, and cds-theme pins the
 * fenced-block / tool-card rungs at fixed sizes while letting ONLY the inline
 * chip ride that delta (`code(12)` in cds-theme's `typography.js`). Writing the
 * size is therefore the supported way to say "inline code is bigger"; writing
 * `--dsh-code-font-delta` directly is NOT — the theme owns that derived value
 * and a second writer would move every rung that reads it, then fight the theme
 * on the next `theme/change`.
 * 宿主的代码字号轴；主题据此派生 `--dsh-code-font-delta`，且只让行内代码档消费它。
 * 故写这个尺寸变量是「只放大行内代码」的正确做法，绝不能直接写 delta。
 */
export const CODE_SIZE_VARIABLE = '--dsh-code-font-size'

/**
 * The slot id of the inline-code size row.
 *
 * A constant because TWO modules need the same string: `panel.js` registers it,
 * and `merge.js` seats it right after the host's code-size row it replaces. A
 * typo in either copy is silent — the row would simply never be placed.
 * 行内代码字号行的槽位 id：panel.js 注册、merge.js 定位，两处必须是同一个字符串。
 */
export const INLINE_CODE_SIZE_ROW_ID = 'dsh-system-fonts-inline-code-size'

// ------------------------------------------------------------- state

export const DEFAULT_STATE = {
  /** Shared UI + content family. Empty = the host's own stack. 空 = 宿主默认字体栈。 */
  uiFamily: '',
  /**
   * The UI family override. Empty means "follow the body", which is the
   * default; a value writes `--dsh-font-family-ui` and only chrome moves.
   */
  uiFontFamily: '',
  /**
   * The UI font size in PIXELS, like the host's own 字号大小 row (14 px, 11 px)
   * and the two size rows inside the font group. 0 means "not set": the row
   * shows the host's 14 px chrome base and nothing is written. A value writes
   * `--dsh-font-size-ui` (the token ladder) and drives `uiscale.js`, which
   * enlarges the chrome's TEXT in place: font-size and pixel line-height are
   * written inline on text nodes inside the sidebar and settings dialog. No
   * container is resized and no `zoom` is used — the user asked for bigger
   * interface text, not a scaled layout.
   */
  uiFontSize: 0,
  /**
   * The INLINE-CODE size in PIXELS. 0 = "not set" (the row shows 12 px, the
   * theme's own chip rung, and nothing is written). A value writes the host's
   * `--dsh-code-font-size`, which the theme turns into
   * `--dsh-code-font-delta` — and only the inline-code rung consumes that, so
   * a fenced block, a tool card and the terminal keep their own sizes.
   * 行内代码字号：0 = 未设置；有值时写宿主 `--dsh-code-font-size`，
   * 主题据此派生 delta，只有行内代码档消费它。
   */
  inlineCodeSize: 0,
  codeFamily: '',
  /**
   * Terminal family — committed through `theme.setFontFamily('terminal')`
   * like the host's own row; kept here so the row still shows a value when
   * the theme service is absent. 终端字体——经宿主管线写入；服务缺席时本地留存。
   */
  terminalFamily: '',
  /**
   * Line-height multiplier on the markdown/content steps only, as a percent.
   * 100 = untouched; the host's own `line-height` sub-token and shorthand both
   * shift by the same ratio, so the step's own size→height relationship is
   * what changes — UI chrome line-heights (button rows, menus) stay put.
   * Range 50–100: row spacing tightens from the host's default, never loosens.
   */
  lineHeightPct: 100,
  /**
   * Letter-spacing added to markdown/content text, in hundredths of an `em`
   * (so 5 = 0.05em). `em` keeps it proportional to whatever size each step
   * resolves to; a fixed `px` value would look double-spaced on 11px code
   * and invisible on 24px headings.
   */
  trackingEm: 0,
}

/**
 * 50–100%: the slider tops out at the host's own 100%, so row spacing can
 * only tighten. The low end is NOT raised — a typed 50 must stay 50; an
 * earlier 80 floor silently swallowed it and made the control look dead
 * below 100%.
 */
export function clampLineHeight(value) {
  const n = Math.round(Number(value))
  if (!isFinite(n)) return 100
  return Math.min(100, Math.max(50, n))
}

/** ±0.30em in hundredths; beyond that text either touches or breaks up. */
export function clampTracking(value) {
  const n = Math.round(Number(value))
  if (!isFinite(n)) return 0
  return Math.min(30, Math.max(-30, n))
}

/**
 * The UI size is PIXELS, like every other size row. 0 means "not set" (the
 * row shows the host's 14 px chrome base); a real value is 10–20 px. Below 10
 * the chrome's fixed padding starts to swim; above 20 the settings rows no
 * longer fit their hosts' line boxes.
 */
export function clampUiFontSize(value) {
  const n = Math.round(Number(value))
  if (!isFinite(n) || n <= 0) return 0
  return Math.min(20, Math.max(10, n))
}

/** The host chrome's base text size — the 0/unset display value. */
export const UI_FONT_BASE_PX = 14

/**
 * The INLINE-CODE size is PIXELS with the same 0-means-unset convention as the
 * three host size rows and the UI size row above. 10 is the smallest readable
 * chip; 20 is where an inline chip stops fitting inside a 14–24 px line box
 * without pushing the leading of the paragraph it sits in.
 * 行内代码字号：px，0 = 未设置；10–20。
 */
export function clampInlineCodeSize(value) {
  const n = Math.round(Number(value))
  if (!isFinite(n) || n <= 0) return 0
  return Math.min(20, Math.max(10, n))
}

/**
 * The size an unset inline-code row displays: the theme's own chip rung
 * (cds-theme emits `calc(12px + var(--dsh-code-font-delta))` for inline code),
 * so the row never claims a size the user is not actually getting.
 */
export const INLINE_CODE_BASE_PX = 12

/** The text-scale factor for a state: 1 when unset, px / 14 otherwise. */
export function uiScaleFactor(state) {
  const size = clampUiFontSize(state === null || state === undefined ? 0 : state.uiFontSize)
  return size > 0 ? size / UI_FONT_BASE_PX : 1
}

// ------------------------------------------------------------- locale
//
// Panel copy lives in `locale/zh.json` + `locale/en.json` (the `strings`
// block) and reaches the rows through `locales.js` — registered on the host
// locale service under `dsh-system-fonts`, injected as `t` by the slot's
// `locale:` field. Every string is monolingual per dictionary; the old glued
// `中文 · English` constants are gone. 面板文案在 `locale/*.json`，经
// `locales.js` 注册进宿主 locale 服务，随界面语言切换。

/**
 * Coerce an arbitrary object into a valid state.
 *
 * Applied on the way IN as well as on load: clamping only inside the
 * panel's controls would leave every other caller (the reset button, a
 * future one) able to store a value the stylesheet cannot express.
 *
 * TOLERANT BY DESIGN: a payload written by an older build may still carry the
 * removed weight axes (`uiWeight`, `codeWeight` — and the never-shipped
 * `chromeWeight`/`bodyWeight` split). Those fields are simply dropped here, so
 * an existing install upgrades without a wipe or a load error.
 * 旧版本的 `uiWeight`/`codeWeight` 等字段直接忽略，老配置照常加载。
 */
export function sanitize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    uiFamily: typeof source.uiFamily === 'string' ? source.uiFamily : '',
    // THE UI ROLE MUST BE WHITELISTED HERE. `sanitize` rebuilds the state object
    // from this list, so a key it does not name is dropped on every save — the
    // row then read `undefined` forever and kept re-rendering, which React
    // reported as error #185 (maximum update depth) and the host swallowed into
    // an empty `data-slot-error` box.
    uiFontFamily: typeof source.uiFontFamily === 'string' ? source.uiFontFamily : '',
    uiFontSize: clampUiFontSize(source.uiFontSize),
    // Whitelisted for the same reason as `uiFontFamily` above: a key this list
    // does not name is dropped on every save, so the row would read `undefined`
    // forever and the setting would look saved while doing nothing.
    inlineCodeSize: clampInlineCodeSize(source.inlineCodeSize),
    codeFamily: typeof source.codeFamily === 'string' ? source.codeFamily : '',
    terminalFamily: typeof source.terminalFamily === 'string' ? source.terminalFamily : '',
    lineHeightPct: clampLineHeight(source.lineHeightPct),
    trackingEm: clampTracking(source.trackingEm),
  }
}
