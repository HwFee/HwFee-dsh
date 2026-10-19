import { PLUGIN_ID } from './constants.js'

/**
 * The Claude Desktop typography ladder, remapped onto the host's
 * `--dsw-font-markdown-*` token vocabulary.
 *
 * WHY TOKENS AND NOT CSS. Every `--dsw-font-*` is declared on `body` by the
 * theme package's own base stylesheet (`theme-client.js` `gradient_shadow_
 * text_css_default`), and the layout presenter writes the composed token map
 * as INLINE custom properties on `<body>` — inline outranks the stylesheet.
 * `ctx.theme.overrideTokens` is therefore the only mechanism that can move
 * these values, and it requires a `{ light, dark }` pair per token.
 *
 * DARK-MODE WEIGHT THINNING HAPPENS IN THE PAIRS. Retinal irradiation makes
 * white-on-black text read 10–15% heavier; Claude compensates on the variable
 * font's `wght` axis (docs/v1/01-设计哲学与设计令牌体系.md:383-425):
 *
 *   Regular 400 → 360   Medium 500 → 460   Semibold 580 → 550   Bold 660 → 660
 *
 * The embedded faces probe `wght 300-800`, so these are real axis moves. Each
 * token below therefore carries the SAME size/leading/family in both halves and
 * differs only in weight — that pair IS the compensation mechanism.
 *
 * VALUE SOURCES (line numbers into docs/v1/01-设计哲学与设计令牌体系.md):
 *
 *   :341-380  the 7-tier ladder (caption/footnote/code/body/prose/heading/
 *             title) with desktop pixel values and leading ratios.
 *   :427-456  the content-to-typography matrix — AUTHORITATIVE for element
 *             values (on-screen label → size / leading / weight).
 *   :531-547  the semantic atom classes (`.text-caption-regular`,
 *             `.text-body-medium`, `.text-title-medium`, `.font-display`, …),
 *             which pin the weight of each UI role class.
 *   :383-414  the dark-mode weight compensation table (the pairs above).
 *
 * THE THEME OWNS EVERY WEIGHT. The reference pins a weight for every element
 * it lists, so this module remaps BOTH halves of the host's font surface:
 *
 *   - the 17 markdown/content roles (`--dsw-font-markdown-*`), and
 *   - the 13 UI-chrome size steps (`--dsw-font-xxxs-11` … `--dsw-font-xl-24`),
 *     which the host only ships at 400 (regular) / 500 (strong).
 *
 * `ELEMENT_WEIGHTS` below is the machine-checkable element→weight table: each
 * row names its DSH carrier, and rows DSH cannot address (the host hard-codes
 * the weight in a salted CSS Module) are marked, not silently approximated.
 *
 * Values the reference does not pin (exact h1/h2/h3/h4 px, table leading,
 * <small> leading) are INTERPOLATED within the ladder and marked "derived" in
 * the README typography table, citing the rows they interpolate. Weights, by
 * contrast, are never interpolated: every row below cites the reference line.
 *
 * SIZE SCALING IS PRESERVED. The host derives every markdown size from the
 * user's 内容字号/代码字号 settings through `--dsh-content-font-delta` /
 * `--dsh-code-font-delta` (theme-client.js). The target values below are the
 * DEFAULTS at the host's base sizes (content 14px, code 11px); the delta
 * expressions are kept so the settings slider still scales the ladder
 * instead of pinning it.
 */

/**
 * The four semantic weight rungs as `[light, dark]` — the compensation table
 * at :389-394, renamed by role rather than by CSS keyword.
 *
 * BOLD IS WRITTEN FROM THE AXIS COLUMN. The reference row (:394) lists light
 * `font-weight: 600` / `"wght" 660` and dark `"wght" 660`; the embedded faces
 * are variable and we drive them through `font-weight`, which the browser maps
 * onto the `wght` axis, so the value to carry here is the axis value 660 in
 * both palettes. `docs/cds-spec.md:710` calls out exactly this distinction:
 * the numeric `font-weight` fallback is for static faces, the axis value for
 * variable ones.
 *
 * NOTE ON THE THINNED RUNGS. `docs/cds-spec.md:706-708` (conflict C15) prefers
 * the P0 stylesheet's 465/560 over this table's 460/550, but the task's
 * acceptance values are the v1-01 table's 400→360 / 500→460 / 580→550, which
 * is what ships here (a ≤10-unit difference on a variable axis).
 */
export const WEIGHTS = {
  regular: { light: '400', dark: '360' },
  medium: { light: '500', dark: '460' },
  semibold: { light: '580', dark: '550' },
  bold: { light: '660', dark: '660' },
}

/**
 * The hero greeting's display row — `.font-display` at :547:
 * `2.375rem` (38px), line-height `1.2`, Light `wght: 330`, `"opsz" 48`.
 *
 * The weight is the REFERENCE 330 — not the host headline's 500 and not a
 * semibold title rung. The dark palette does not thin it: the compensation
 * table (:389-394) covers 400/500/580/660 only, and the display row is a
 * single Light value. styles.js builds the `[data-cds-greeting]` rule from
 * these constants so the rule and the documented reference cannot drift.
 */
export const GREETING_DISPLAY = {
  size: '38px',
  lineHeight: '1.2',
  weight: '330',
  variationSettings: '"opsz" 48',
  reference: 'docs/v1/01-设计哲学与设计令牌体系.md:547 (.font-display)',
}

/**
 * UI-chrome weight tokens: the host's non-markdown `--dsw-font-*` size ladder.
 *
 * The host ships every step at exactly two weights — regular 400 and strong
 * 500 — because DSH's UI chrome was designed around a two-weight system. The
 * reference assigns a weight per semantic role, so each step is mapped onto
 * the compensation rung that role belongs to (never a new value):
 *
 *   11px  caption tier        :535 (regular) / :536 (medium)
 *   12px  small UI / matrix   :453 (regular) / :438,:443,:444,:450 (medium)
 *   13px  footnote tier       :535 (regular) / :538 (medium)
 *   14px  body tier           :540 (regular) / :541 (medium)
 *   16px  no reference size   → regular/medium rung of the step class
 *   18px  no reference size   → medium rung
 *   20px  title tier          :545 `.text-title-medium` (500/460)
 *   24px  no reference size   → semibold title/identity rung :393 (600 is not
 *                                 a reference weight; titles are 580/550)
 *
 * `size`/`leading` are the host's own values (deliberately NOT remapped: this
 * task moves weights only), and every entry emits TWO tokens — the `font`
 * shorthand and the `-font-weight` sub-token — because the host's components
 * consume both forms.
 */
export const UI_ROLE_TOKENS = [
  { token: '--dsw-font-xxxs-11', size: '11px', leading: '14px', weight: 'regular',
    reference: ':535 .text-caption-regular' },
  { token: '--dsw-font-xxxs-strong-11', size: '11px', leading: '14px', weight: 'medium',
    reference: ':536 .text-caption-medium' },
  { token: '--dsw-font-xxs-12', size: '12px', leading: '18px', weight: 'regular',
    reference: ':535 caption-regular rung (12px has no regular atom class)' },
  { token: '--dsw-font-xxs-strong-12', size: '12px', leading: '18px', weight: 'medium',
    reference: ':438/:443/:444/:450 12px medium rows' },
  { token: '--dsw-font-xs-13', size: '13px', leading: '20px', weight: 'regular',
    reference: ':535 caption-regular rung (13px has no regular atom class)' },
  { token: '--dsw-font-xs-strong-13', size: '13px', leading: '20px', weight: 'medium',
    reference: ':538 .text-footnote-medium' },
  { token: '--dsw-font-s-14', size: '14px', leading: '22px', weight: 'regular',
    reference: ':540 .text-body-regular' },
  { token: '--dsw-font-s-strong-14', size: '14px', leading: '22px', weight: 'medium',
    reference: ':541 .text-body-medium' },
  { token: '--dsw-font-base-16', size: '16px', leading: '24px', weight: 'regular',
    reference: 'no 16px reference role → regular rung :391' },
  { token: '--dsw-font-base-strong-16', size: '16px', leading: '24px', weight: 'medium',
    reference: 'no 16px reference role → medium rung :392' },
  { token: '--dsw-font-m-18', size: '16px', leading: '28px', weight: 'medium',
    reference: 'no 18px reference role → medium rung :392' },
  { token: '--dsw-font-l-20', size: '20px', leading: '28px', weight: 'medium',
    reference: ':545 .text-title-medium (500/460)' },
  { token: '--dsw-font-xl-24', size: '24px', leading: '32px', weight: 'semibold',
    reference: 'no 24px reference role → semibold 标题/身份 rung :393' },
]

/**
 * The complete element→weight table the reference pins, with the DSH carrier
 * that implements it. `rung` names a WEIGHTS rung (or `display` for the
 * greeting's 330) and is the SINGLE source for light/dark.
 *
 * `carrier` is one of:
 *   'token'          a `--dsw-font-*` override in this module carries it
 *   'variable'       a documented host intermediate variable carries it
 *                    (`--dsl-code-block-*`, docs/host-hooks.md:438)
 *   'plugin-hook'    this plugin marks the element itself (hero greeting)
 *   'inherited'      no element-specific font declaration exists; the
 *                    body/markdown rung reaches it through inheritance
 *   'not-addressable' the host hard-codes the weight in a salted CSS Module,
 *                    so no token and no stable hook can reach it
 *   'none'           the element does not exist in DSH
 */
export const ELEMENT_WEIGHTS = [
  // ------------------------------------------------------------- chat flow
  { element: 'assistant identity name', reference: ':433', rung: 'semibold',
    carrier: 'none', detail: 'DSH renders no assistant identity-name element' },
  { element: 'model version badge', reference: ':434', rung: 'medium',
    carrier: 'not-addressable',
    detail: 'model-label plugin renders plain text + the primitives Tag; its CSS module declares no font token' },
  { element: 'message timestamp', reference: ':435', rung: 'regular',
    carrier: 'not-addressable',
    detail: 'MessageIconActions .timeStart/.timeEnd set font-size only; the weight inherits 400 and no token carries it' },
  { element: 'assistant body paragraph', reference: ':436', rung: 'regular',
    carrier: 'token', tokens: ['--dsw-font-markdown-base'] },
  { element: 'user bubble text', reference: ':437', rung: 'regular',
    carrier: 'inherited', detail: 'UserText.module.css declares no font; the body rung inherits' },
  { element: 'message action buttons', reference: ':438', rung: 'medium',
    carrier: 'not-addressable',
    detail: 'MessageIconActions buttons set no weight; their classes are salted' },
  // -------------------------------------------------------------- thinking
  { element: 'thinking accordion trigger', reference: ':439', rung: 'medium',
    carrier: 'not-addressable',
    detail: 'ReasoningRow .title hard-codes font-weight:400; the class is salted' },
  { element: 'raw thought log', reference: ':440', rung: 'regular',
    carrier: 'token', tokens: ['--dsw-font-markdown-code-block-small'] },
  // -------------------------------------------------------------- composer
  { element: 'composer textarea', reference: ':441', rung: 'regular',
    carrier: 'not-addressable',
    detail: 'InputBar .input inherits font-size and weight; no weight token exists' },
  { element: 'composer placeholder', reference: ':442', rung: 'regular',
    carrier: 'not-addressable',
    detail: 'the placeholder rule sets colour only; it inherits the weight' },
  { element: 'composer footer action', reference: ':443', rung: 'medium',
    carrier: 'not-addressable', detail: 'InputBar hard-codes the footer font in its CSS Module' },
  { element: 'model selector', reference: ':444', rung: 'medium',
    carrier: 'not-addressable', detail: 'InputBar .select hard-codes 13px/500' },
  { element: 'send button', reference: ':445', rung: 'semibold',
    carrier: 'not-addressable', detail: 'the send control is an icon-only button with no text font declaration' },
  // -------------------------------------------------------------- artifacts
  { element: 'code block', reference: ':446', rung: 'regular',
    carrier: 'token', tokens: ['--dsw-font-markdown-code-block'] },
  { element: 'inline code', reference: ':447', rung: 'medium',
    carrier: 'token', tokens: ['--dsw-font-markdown-code'] },
  { element: 'artifact title', reference: ':448', rung: 'semibold',
    carrier: 'not-addressable',
    detail: 'deliverables CSS hard-codes size/weight in salted classes' },
  { element: 'code language tag', reference: ':449', rung: 'medium',
    carrier: 'variable', variable: '--dsl-code-block-banner-font',
    detail: 'declared on .md-code-block, consumed by the banner (docs/host-hooks.md:438)' },
  { element: 'attachment file name', reference: ':450', rung: 'medium',
    carrier: 'not-addressable', detail: 'attachment .name hard-codes 14px/500' },
  { element: 'attachment file size', reference: ':451', rung: 'regular',
    carrier: 'not-addressable', detail: 'attachment .meta sets font-size only; weight inherits' },
  // --------------------------------------------------------------- controls
  { element: 'modal title', reference: ':452', rung: 'semibold',
    carrier: 'not-addressable', detail: 'the primitives dialog CSS declares no font token' },
  { element: 'segmented tab', reference: ':453', rung: 'regular',
    note: 'inactive 400 / active 500 — the active half is a component state, not a token',
    carrier: 'not-addressable', detail: 'primitives literal styles' },
  { element: 'buttons SM/MD', reference: ':454-455', rung: 'medium',
    carrier: 'not-addressable', detail: 'primitives literal styles' },
  { element: 'keyboard shortcut cap', reference: ':456', rung: 'semibold',
    carrier: 'not-addressable', detail: 'the shortcut chip sets font-size:11px with no weight' },
  // --------------------------------------------------------------- greeting
  { element: 'hero greeting', reference: ':547', rung: 'display',
    carrier: 'plugin-hook', detail: '[data-cds-greeting] carries the .font-display row' },
]

const TEXT = 'var(--dsw-font-family)'
const CODE = 'var(--ds-font-family-code)'

// Delta shorthands, exactly the host's own spellings. There is no
// `-secondary` delta any more: it existed only for the table rows, which now
// ride the body delta like every other content role.
const CD = 'var(--dsh-content-font-delta)'
const CODE_D = 'var(--dsh-code-font-delta)'

/** `14px + delta` at the default content size 14px. */
function content(px) { return 'calc(' + px + 'px + ' + CD + ')' }
/** `Xpx + code delta` at the default code size 11px. */
function code(px) { return 'calc(' + px + 'px + ' + CODE_D + ')' }

/**
 * One row per host role. `size`/`leading` are the LIGHT AND DARK default
 * values (identical in both palettes); `weight` names a WEIGHTS rung.
 *
 * | role | default | source |
 * |---|---|---|
 * | base (+italic) | 14/20 400·360 | matrix :436 assistant paragraph, pinned |
 * | base-strong (+italic) | 14/20 660·660 | :394 Bold = 重强调, derived |
 * | h1 | 20/25 580·550 | title tier :353 (18.82/23.5 ≈ 20px, ratio 1.25) + :452/:393, derived |
 * | h2, h3 | 15/20 580·550 | heading tier :352 + modal-title row :452 (15-16px/20px 580·550), derived |
 * | h4 | 14/18 580·550 | heading tier :352 interpolated at 14px (ratio 1.29), derived |
 * | code (inline) | 12/14 500·460 | matrix :447 inline code, pinned |
 * | code-block | 12/17.5 400·360 | matrix :446 code block, pinned |
 * | code-block-small | 11.5/16 400·360 | matrix :440 raw thought log, derived mapping |
 * | small (+italic) | 12/16 400·360 | 12px Sans rows :433/:438/:453 all lead 16px, derived |
 * | small-strong (+italic) | 12/16 660·660 | :394 Bold = 重强调, derived |
 * | table | 14/20 400·360 | **body tier, not a step down** — see below |
 * | table-head | 14/20 500·460 | same row + :392 Medium, derived |
 */
export const TYPOGRAPHY_ROLES = [
  // ------------------------------------------------------------- body tier
  {
    name: 'base', family: TEXT, weight: 'regular', style: 'normal',
    size: content(14), leading: content(20),
  },
  {
    name: 'base-italic', family: TEXT, weight: 'regular', style: 'italic',
    size: content(14), leading: content(20),
  },
  {
    // Markdown <strong> is 重强调 — the compensation table's Bold rung, which
    // deliberately does NOT thin in dark mode (its job is to stay emphatic).
    name: 'base-strong', family: TEXT, weight: 'bold', style: 'normal',
    size: content(14), leading: content(20),
  },
  {
    name: 'base-strong-italic', family: TEXT, weight: 'bold', style: 'italic',
    size: content(14), leading: content(20),
  },

  // ---------------------------------------------------------- heading tier
  {
    // Title tier (:353: 18.82px ≈ 20px, leading ratio 1.25 → 25px).
    name: 'h1', family: TEXT, weight: 'semibold', style: 'normal',
    size: content(20), leading: content(25),
  },
  {
    // Heading tier (:352 ≈ 15px per the mission's ladder rounding); the
    // 15px/20px/580 pairing is the modal-title row :452.
    name: 'h2', family: TEXT, weight: 'semibold', style: 'normal',
    size: content(15), leading: content(20),
  },
  {
    // The ladder defines ONE heading rung, so h2 and h3 share it — the same
    // collapse Claude Desktop's tier system makes.
    name: 'h3', family: TEXT, weight: 'semibold', style: 'normal',
    size: content(15), leading: content(20),
  },
  {
    // Heading tier interpolated at 14px (ratio 1.29 → 18px leading).
    name: 'h4', family: TEXT, weight: 'semibold', style: 'normal',
    size: content(14), leading: content(18),
  },

  // ------------------------------------------------------------------ code
  {
    // Matrix :447: Mono 12px / 14px / 500·460 — inline code is a medium badge.
    name: 'code', family: CODE, weight: 'medium', style: 'normal',
    size: code(12), leading: code(14),
  },
  {
    // Matrix :446: Mono 12px / 17.5px / 400·360, tabular-nums (a property, so
    // it lives in styles.js `codeRules`, not in a font token).
    name: 'code-block', family: CODE, weight: 'regular', style: 'normal',
    size: code(12), leading: code(17.5),
  },
  {
    // Matrix :440 raw-thought log: Mono 11.5px / 16px / 400·360.
    name: 'code-block-small', family: CODE, weight: 'regular', style: 'normal',
    size: code(11.5), leading: code(16),
  },

  // ------------------------------------------------------------ small tier
  {
    name: 'small', family: TEXT, weight: 'regular', style: 'normal',
    size: '12px', leading: '16px',
  },
  {
    name: 'small-italic', family: TEXT, weight: 'regular', style: 'italic',
    size: '12px', leading: '16px',
  },
  {
    name: 'small-strong', family: TEXT, weight: 'bold', style: 'normal',
    size: '12px', leading: '16px',
  },
  {
    name: 'small-strong-italic', family: TEXT, weight: 'bold', style: 'italic',
    size: '12px', leading: '16px',
  },

  // ----------------------------------------------------------------- table
  //
  // NO STEP DOWN. The reference repo has no markdown-table typography row at
  // all: its only table evidence is the storybook, where the demo tables are
  // inconsistent — one carries Tailwind `text-xs` (0.75rem/1rem = 12/16) and
  // another carries no size class at all, i.e. it inherits the prose body row.
  // The earlier version copied `text-xs` and turned every table into fine
  // print; the user's verdict on the rendered result was that tables read
  // SMALLER than the paragraphs above them, and the reference rendering they
  // compared against keeps them at body size. Both roles therefore use the
  // pinned body row (`:436` assistant paragraph, 14/20) and differ only in
  // weight: the header keeps the medium rung (500/460) instead of Tailwind's
  // UA bold, which is not a CDS weight.
  {
    name: 'table', family: TEXT, weight: 'regular', style: 'normal',
    size: content(14), leading: content(20),
  },
  {
    name: 'table-head', family: TEXT, weight: 'medium', style: 'normal',
    size: content(14), leading: content(20),
  },
]

/**
 * The `font` shorthand for one role in one palette, in the host's own spelling
 * (`italic 600 12px/20px var(--dsw-font-family)`). Weight 400 is omitted like
 * the host omits it, but the thinned dark value 360 MUST be spelled out.
 */
function shorthand(role, weightValue, styleValue) {
  const parts = []
  if (role.style !== 'normal') parts.push(role.style)
  if (weightValue !== '400') parts.push(weightValue)
  parts.push(role.size + '/' + role.leading)
  parts.push(role.family)
  return parts.join(' ')
}

/**
 * The `font` shorthand for one host UI step in one palette:
 * `[weight ]<size>/<leading> var(--dsw-font-family)`. Same spelling rules as
 * the markdown shorthand — 400 is omitted (the host omits it) but the thinned
 * dark values 360/460/550 are always spelled out.
 */
function uiShorthand(step, weightValue) {
  const parts = []
  if (weightValue !== '400') parts.push(weightValue)
  parts.push(step.size + '/' + step.leading)
  parts.push(TEXT)
  return parts.join(' ')
}

/**
 * Build the full `{ token: { light, dark } }` typography map.
 *
 * 17 markdown roles × 6 tokens (shorthand + family/size/weight/style/
 * line-height) = 102 entries, plus the two family-role tokens that make the
 * whole app render in the embedded faces, plus 13 UI-chrome steps × 2 tokens
 * (shorthand + weight) = 130 entries. The family roles are what move EVERYTHING
 * beyond markdown: components consume `--dsw-font-family` (text role) and
 * `--ds-font-family-code` (code role) — docs/host-hooks.md.
 */
export function buildTypographyTokens() {
  const out = {}
  const pair = function (name, light, dark) {
    out[name] = { light: String(light), dark: String(dark) }
  }

  // The family roles. Same value in both palettes — font families do not
  // compensate for the palette — but they stay pairs because the service
  // demands pairs and `assertPairs` re-checks at the call site.
  //
  // THE USER'S OWN PICK WINS. The host's own expression is
  // `--dsw-font-family: var(--dsh-font-family-text, <default stack>), <default>`,
  // so the font picker in Settings writes `--dsh-font-family-text`. Replacing
  // the whole property with the Anthropic chain (the previous shape) silently
  // discarded that preference: the picker looked broken because its choice
  // could never win. Routing through the host variable keeps the Claude faces
  // as the DEFAULT — which is what the replica means — while a user pick
  // overrides them exactly like it does without this theme.
  pair('--dsw-font-family',
    'var(--dsh-font-family-text, var(--font-anthropic-sans))',
    'var(--dsh-font-family-text, var(--font-anthropic-sans))')
  pair('--ds-font-family-code',
    'var(--dsh-font-family-code, var(--font-anthropic-mono))',
    'var(--dsh-font-family-code, var(--font-anthropic-mono))')

  for (const role of TYPOGRAPHY_ROLES) {
    const rung = WEIGHTS[role.weight]
    const base = '--dsw-font-markdown-' + role.name
    pair(base, shorthand(role, rung.light, role.style), shorthand(role, rung.dark, role.style))
    pair(base + '-font-family', role.family, role.family)
    pair(base + '-font-size', role.size, role.size)
    pair(base + '-font-weight', rung.light, rung.dark)
    pair(base + '-font-style', role.style, role.style)
    pair(base + '-line-height', role.leading, role.leading)
  }

  // The UI-chrome steps. The host declares both the shorthand and the
  // `-font-weight` sub-token and components consume both spellings, so both
  // are emitted; family/size/style/leading stay the host's own values.
  for (const step of UI_ROLE_TOKENS) {
    const rung = WEIGHTS[step.weight]
    pair(step.token, uiShorthand(step, rung.light), uiShorthand(step, rung.dark))
    pair(step.token + '-font-weight', rung.light, rung.dark)
  }

  return out
}

/** Every token name this module contributes, for tests and bookkeeping. */
export const TYPOGRAPHY_TOKEN_NAMES = Object.keys(buildTypographyTokens())

export { PLUGIN_ID }
