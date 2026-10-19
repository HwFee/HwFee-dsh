import { PLUGIN_ID, STYLE_ID, FONT_STYLE_ID } from './constants.js'
import {
  SHADOWS, CODE_SURFACE, CODE_BORDER, CODE_BANNER,
  EASING, CDS_DURATIONS, RADII, ACCENT_PRESETS, CLAY,
} from './palette.js'
import { scaleShadow } from './tokens.js'
import { fontCss, preferredCjkStackCss } from './fonts.js'
import { GREETING_DISPLAY, WEIGHTS } from './typography.js'
import { RIPPLE_ATTR } from './ripple.js'

// ------------------------------------------------------------- rationale

/**
 * The component-level stylesheet.
 *
 * WHY A STYLESHEET AT ALL, when `ctx.theme.overrideTokens` already recolours
 * the app: the presenter writes tokens as INLINE styles on `<body>`, and
 * inline styles cannot reach two things this theme needs —
 *
 *   1. `--dsw-elevation-panel|prominent|soft` are declared by the host on
 *      `body, body *`, not on `body`. A rule on `body *` beats an inline
 *      declaration on `body` for descendants, so those have to be emitted from
 *      a stylesheet (with `!important` to outrank the host's own `body *`).
 *   2. Component refinements — the composer's focus treatment, the code block's
 *      dark surface in light mode, the single-stroke border discipline — have
 *      no token at all. They are properties, not variables.
 *
 * TARGETING. Host component styles are CSS Modules with salted class names
 * (`.RlGAzG_card`, `._markdown_1ypvv_5`). Those hashes change on every host
 * build, so nothing here keys on them. Instead this sheet uses, in order of
 * preference:
 *
 *   - stable `data-*` hooks the host renders on purpose (`[data-composer-card]`,
 *     `[data-code-block-banner]`, `[data-sidebar-collapsed]`);
 *   - `[class*="markdown"]`, which survives re-salting because it matches the
 *     hash whatever the salt is (the font plugin learned this the hard way:
 *     `.markdown-body` matched zero elements in the whole app);
 *   - structural pseudo-classes and attribute selectors on the elements the
 *     host already styles (`pre`, `:not(pre) > code`).
 *
 * Anything that would require guessing a hash class is deliberately NOT
 * styled. The `refine` setting exists so a host update that changes a
 * component can be worked around without losing the palette.
 */

// ------------------------------------------------------------------ parts

/** Elevation tokens the presenter cannot reach (declared on `body, body *`). */
function elevationRules(state) {
  const lines = []
  const light = {
    panel: scaleShadow(SHADOWS.light.panel, state.elevation),
    prominent: scaleShadow(SHADOWS.light.prominent, state.elevation),
    soft: scaleShadow(SHADOWS.light.soft, state.elevation),
  }
  const dark = {
    panel: scaleShadow(SHADOWS.dark.panel, state.elevation),
    prominent: scaleShadow(SHADOWS.dark.prominent, state.elevation),
    soft: scaleShadow(SHADOWS.dark.soft, state.elevation),
  }
  const emit = function (shadow) {
    lines.push('  --dsw-elevation-panel: ' + shadow.panel + ' !important;')
    lines.push('  --dsw-elevation-prominent: ' + shadow.prominent + ' !important;')
    lines.push('  --dsw-elevation-soft: ' + shadow.soft + ' !important;')
  }
  lines.push('body, body * {')
  emit(light)
  lines.push('}')
  lines.push('body[data-ds-dark-theme], body[data-ds-dark-theme] * {')
  emit(dark)
  lines.push('}')
  return lines.join('\n')
}

/**
 * The focus ring.
 *
 * The host's `focus.css` draws a flat 2px ring through `outline`, coloured by
 * `--dsw-focus-ring-color`. CDS's ring is a three-layer shadow: an inset hair
 * line in the surface colour (so the ring reads as separated from the control),
 * the solid clay core, and a soft clay glow. Reproducing it needs `box-shadow`,
 * which `outline-color` cannot express, so the ring is re-drawn here and the
 * host outline is suppressed on the same elements.
 *
 * Only `:focus-visible` is targeted — pointer clicks keep the host's behaviour
 * of hiding the ring, which the host implements by zeroing the outline colour
 * under `html[data-input-modality='pointer']`. Because this sheet sets a
 * box-shadow rather than an outline, it must ALSO honour that modality, or a
 * mouse click would paint a ring the host deliberately suppresses.
 */
function focusRules() {
  return [
    'body :focus-visible:not(:read-write) {',
    '  outline-color: transparent !important;',
    '  box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base), 0 0 0 1.5px var(--dsw-focus-ring-color), 0 0 6px 1px var(--dsw-focus-ring-glow) !important;',
    '}',
    // Preserve the host's pointer-modality behaviour: no ring for a mouse
    // click, ring for keyboard traversal.
    "html[data-input-modality='pointer'] body :focus-visible:not(:read-write) {",
    '  box-shadow: none !important;',
    '}',
    // Editable fields keep their own focus feedback (the composer's caret and
    // the field's own styling), so they are excluded above via :read-write.
    'body :focus-visible:read-write {',
    '  outline-color: var(--dsw-focus-ring-color) !important;',
    '}',
  ].join('\n')
}

/** The composer: CDS's signature 20px terminal with a three-state shadow. */
function composerRules() {
  return [
    '/* ---- composer: the signature CDS terminal ------------------------- */',
    '[data-composer-card] {',
    '  border-radius: var(--dsw-radius-panel) !important;',
    '  background: var(--dsw-specific-input-major) !important;',
    '  border: 0 !important;',
    '  box-shadow: var(--dsw-elevation-soft) !important;',
    '  transition: box-shadow ' + CDS_DURATIONS.base + ' ' + EASING.swift + ';',
    '}',
    // Hover and focus strengthen the hairline by moving the host's own stroke
    // variable, not by painting a fixed border token over the card.
    //
    // The card's resting shadow (`--dsw-elevation-soft`, emitted above) draws
    // its hairline from `--dsw-elevation-stroke-color`. The workspace-picker
    // variant of this card sets that variable to `transparent` because it paints
    // a dashed `:after` border of its own. An earlier version replaced the whole
    // `box-shadow` on hover/focus with a hard-coded `border-l3` inset ring, which
    // stacked a solid ring on top of that dashed border. Raising the variable
    // instead leaves the shadow structure alone.
    //
    // The variant must be EXCLUDED explicitly. `[data-composer-card]:hover` has
    // specificity (0,2,0) against the host variant's single class (0,1,0), so
    // without the `:not()` this rule would win and un-transparent the stroke.
    // The variant has no data-* hook, only the salted class, hence the
    // attribute-contains match.
    '[data-composer-card]:not([class*="cardWorkspaceTrigger"]):hover,',
    '[data-composer-card]:not([class*="cardWorkspaceTrigger"]):focus-within {',
    '  --dsw-elevation-stroke-color: var(--dsw-alias-border-l3);',
    '}',
    'body[data-ds-dark-theme] [data-composer-card]:not([class*="cardWorkspaceTrigger"]):focus-within {',
    '  --dsw-elevation-stroke-color: rgba(255, 255, 255, 0.22);',
    '}',
    // The editable area inside an already-bordered shell must not add a second
    // ring (the 1-border rule).
    '[data-composer-input]:focus, [data-composer-input]:focus-visible {',
    '  outline: none !important;',
    '  box-shadow: none !important;',
    '}',
    // Chips and tool buttons inside the shell carry no border of their own.
    '[data-composer-chip] {',
    '  border: 0 !important;',
    '  border-radius: 999px !important;',
    '  transition: background-color ' + CDS_DURATIONS.snap + ' ' + EASING.swift + ', color ' + CDS_DURATIONS.snap + ' ' + EASING.swift + ';',
    '}',
  ].join('\n')
}

/**
 * Code blocks: dark in both palettes, the one near-black CDS allows.
 *
 * The host exposes `.md-code-block` as a literal (unhashed) class and drives
 * the block through its own `--dsl-code-block-*` intermediate variables. Both
 * are deliberate extension points — the host's own stylesheet declares those
 * variables ON `.md-code-block`, so a descendant selector cannot reach them
 * and the literal class (or `!important`) is the supported way in. Using them
 * is far safer than the hashed `_block_7gxqk_4`.
 */
/**
 * The banner font, i.e. the code language tag and its copy control.
 *
 * The host declares `--dsl-code-block-banner-font: 11px/18px var(--dsw-font-family)`
 * ON `.md-code-block` (docs/host-hooks.md:438) and its banner consumes it with
 * `font: var(--dsl-code-block-banner-font)`. Redeclaring it here is the
 * documented seam — a descendant selector cannot reach a variable declared on
 * the block itself. The reference pins the language tag at Medium 500 / 460
 * (`docs/v1/01-…md:449`), which is the `medium` rung; the host's size and
 * family are left alone (this is the weights pass).
 */
function codeBannerFont(weight) {
  return weight + ' 11px/18px var(--dsw-font-family)'
}

function codeRules() {
  return [
    '/* ---- code blocks: surface follows the palette ---------------------- */',
    // Both palettes are declared so the block never ends up with a surface from
    // one palette and syntax colours from the other. The long comment in
    // palette.js (CODE_SURFACE) explains why the block is not forced dark in
    // light mode: Shiki paints each span with an inline `color`, so a forced
    // dark surface has no CSS-only way to bring the text with it.
    '.md-code-block {',
    '  --dsl-code-block-background: ' + CODE_SURFACE.light + ';',
    '  --dsl-code-block-banner-background-color: ' + CODE_BANNER.light + ';',
    '  --dsl-code-block-border-radius: var(--dsw-radius-lg);',
    '  --dsl-code-block-banner-font: ' + codeBannerFont(WEIGHTS.medium.light) + ';',
    '  border-radius: var(--dsw-radius-lg) !important;',
    '  background: ' + CODE_SURFACE.light + ' !important;',
    '  border: 0 !important;',
    '  box-shadow: inset 0 0 0 1px ' + CODE_BORDER.light + ' !important;',
    '  overflow: hidden;',
    '}',
    'body[data-ds-dark-theme] .md-code-block {',
    '  --dsl-code-block-background: ' + CODE_SURFACE.dark + ';',
    '  --dsl-code-block-banner-background-color: ' + CODE_BANNER.dark + ';',
    '  --dsl-code-block-banner-font: ' + codeBannerFont(WEIGHTS.medium.dark) + ';',
    '  background: ' + CODE_SURFACE.dark + ' !important;',
    '  box-shadow: inset 0 0 0 1px ' + CODE_BORDER.dark + ' !important;',
    '}',
    // The banner is the header strip: a single hairline divider, never a
    // closed second frame (the 1-border rule).
    //
    // It must paint the banner colour EXPLICITLY. The block is wrapped in a
    // sticky `_bannerWrap` whose background is `--dsw-alias-bg-base` (the page
    // canvas). Leaving the banner transparent — an earlier version did — lets
    // that canvas colour show through as a lighter band across the top of the
    // block, which reads as a stray white bar rather than a header.
    '.md-code-block [data-code-block-banner] {',
    '  background: var(--dsl-code-block-banner-background-color) !important;',
    '  border-bottom: 1px solid ' + CODE_BORDER.light + ' !important;',
    '}',
    'body[data-ds-dark-theme] .md-code-block [data-code-block-banner] {',
    '  border-bottom: 1px solid ' + CODE_BORDER.dark + ' !important;',
    '}',
    // The wrapper paints the canvas colour for its sticky behaviour; on a
    // themed block that is the wrong colour, so it follows the banner.
    '.md-code-block > [class*="bannerWrap"],',
    '.md-code-block > * > [class*="bannerWrap"] {',
    '  background-color: var(--dsl-code-block-banner-background-color) !important;',
    '}',
    // Shiki also sets a background inline on the <pre>; on a themed block that
    // would punch a rectangle of the OTHER palette's colour through it.
    '.md-code-block pre,',
    '.md-code-block pre[class*="shiki"],',
    '.md-code-block code {',
    '  background: transparent !important;',
    '}',
    // Inline code stays a light chip: it sits inside body text, not in a
    // terminal, so a filled block would punch holes in the prose.
    '[class*="markdown"] :not(pre) > code {',
    '  border-radius: var(--dsw-radius-xs) !important;',
    '  border: 0 !important;',
    '  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l1);',
    '}',
    // Matrix line 446: code blocks carry `tabular-nums` so digits keep their
    // column while diffs scroll. It is a property, not a font token, so it
    // lives here with the rest of the block's treatment.
    '.md-code-block pre,',
    '.md-code-block code {',
    '  font-variant-numeric: tabular-nums;',
    '}',
  ].join('\n')
}

/**
 * Message rows.
 *
 * The user bubble is a hashed class (`cJsG2q_bubble`), so it is NOT targeted
 * here — its radius arrives through `--dsw-radius-xl` (set to 18px in the
 * token layer) and its fill through `--dsw-specific-bubble`. That is the
 * documented-safe path and it survives a host rebuild. Only the flow container,
 * which the host exposes as `[data-chat-flow]`, is styled directly.
 */
function messageRules() {
  return [
    '/* ---- message rows -------------------------------------------------- */',
    // CDS gives a turn breathing room; the host default is tighter.
    '[data-chat-flow] {',
    '  --dsh-chat-turn-gap: 28px;',
    '}',
  ].join('\n')
}

/**
 * Hover-revealed message actions — the reference's "secondary fade" bar.
 *
 * WHAT THE HOST ALREADY DOES (verified, so we keep its geometry):
 * `.repro/css/chat/06-MessageIconActions.module.pretty.css` has
 *   @media (hover:hover) {
 *     [data-actions-reveal=hover] .actions { opacity: 0; transition: opacity 80ms }
 *     [data-actions-reveal=hover]:hover .actions,
 *     [data-actions-reveal=hover]:focus-within .actions { opacity: 1 }
 *   }
 * so the bar already fades on row hover/focus-within with NO layout shift
 * (opacity only). `data-actions-reveal` is set on the turn-tail root
 * (`TurnTailNodeView`, values "hover"/"always") and the action bar is its LAST
 * child — `MessageIconActions` is rendered as the second JSX child after a
 * possibly-null tail slot. This rule therefore does not animate anything new:
 * it only swaps the timing curve for the reference's swift easing and gives
 * the bar the reference's secondary label colour + 12px/16px/500 button type
 * (docs/v1/01-…md:438). Nothing keys on a salted class, and an absent hook
 * simply never matches.
 */
function messageActionsRules() {
  return [
    '/* ---- message actions: hover reveal (host geometry kept) ------------ */',
    '@media (hover: hover) {',
    '  /* The host owns the opacity 0→1 fade; CDS owns only its curve. */',
    '  [data-actions-reveal="hover"] > :last-child {',
    '    transition-timing-function: ' + EASING.swift + ' !important;',
    '  }',
    '  [data-actions-reveal="hover"] > :last-child :where(button) {',
    '    color: var(--dsw-alias-label-secondary) !important;',
    '    font-size: 12px;',
    '    line-height: 16px;',
    '    font-weight: 500;',
    '  }',
    '  [data-actions-reveal="hover"] > :last-child :where(button):hover {',
    '    color: var(--dsw-alias-label-primary) !important;',
    '  }',
    '}',
  ].join('\n')
}

/**
 * Scroll fade masks — the reference's two-edge feathering.
 *
 * WHAT THE HOST ALREADY DOES. The chat group seat (`[data-step-process-body]`,
 * the `overflow-y:auto` element in `.repro/css/chat/02-ChatGroupSeat…css`)
 * already publishes `data-scroll-up` / `data-scroll-down` (chat.js: `edges.
 * canScrollUp/canScrollDown`) and puts a plain 24px mask on it through salted
 * `fadeTop`/`fadeBottom` classes. Those classes are what a theme must not
 * target, so the SAME conditions are re-expressed through the published
 * attributes: the fade appears only on an edge that actually has more content
 * (attribute present), and an end of the list has no attribute → no clip.
 *
 * The alpha ladder is the reference's scroll-fade mask
 * (`docs/v1/04-…md:296-320`, mirrored in `code-examples/cds-theme.css:773-780`):
 * transparent → 0d → 26 → 4d → 80 → b3 → d9 → #000 over the fade size. The
 * host uses 24px for this seat, so the reference curve is evaluated at 24px
 * rather than changing the host's fade geometry.
 *
 * NOTE ON `data-overflow-below`: that hook is the input-trigger MENU's
 * "content below" marker (`MenuView`: `.menu[data-overflow-below]:after` paints
 * a 16px gradient on a NON-scrolling box). Masking that box would feather the
 * menu's own chrome and corners, so it is deliberately left to the host; the
 * chat list's bottom-edge hook is `data-scroll-down`.
 */
function scrollFadeRules() {
  const size = 24
  const px = function (fraction) { return 'calc(' + size + 'px * ' + fraction + ')' }
  const top = 'linear-gradient(to bottom, transparent 0, '
    + '#0000000d ' + px('.15') + ', '
    + '#00000026 ' + px('.3') + ', '
    + '#0000004d ' + px('.45') + ', '
    + '#00000080 ' + px('.6') + ', '
    + '#000000b3 ' + px('.75') + ', '
    + '#000000d9 ' + px('.87') + ', '
    + '#000 ' + size + 'px)'
  const bottom = 'linear-gradient(to bottom, #000 0, '
    + '#000 calc(100% - ' + size + 'px), '
    + '#000000d9 calc(100% - ' + size + 'px * .87), '
    + '#000000b3 calc(100% - ' + size + 'px * .75), '
    + '#00000080 calc(100% - ' + size + 'px * .6), '
    + '#0000004d calc(100% - ' + size + 'px * .45), '
    + '#00000026 calc(100% - ' + size + 'px * .3), '
    + '#0000000d calc(100% - ' + size + 'px * .15), '
    + 'transparent 100%)'
  return [
    '/* ---- scroll fade masks (data-scroll-*) ----------------------------- */',
    '[data-step-process-body][data-scroll-up] {',
    '  mask-image: ' + top + ';',
    '}',
    '[data-step-process-body][data-scroll-down] {',
    '  mask-image: ' + bottom + ';',
    '}',
    '[data-step-process-body][data-scroll-up][data-scroll-down] {',
    '  mask-image: ' + top + ', ' + bottom + ';',
    '}',
  ].join('\n')
}

/**
 * Code-artefact details: banner label, banner hairline and the
 * disclosure/collapse row.
 *
 * HOOKS (verified in .repro, none salted):
 *  - `[data-code-block-banner]` is on the banner of BOTH implementations: the
 *    markdown block's `._banner_7gxqk_24` and the read/card banner
 *    `._header_1pq26_10` (JSX: `"data-code-block-banner": true`). The simple
 *    banner's FIRST child is the language infostring; the card banner's first
 *    child is a heading whose first child is the language span. That is what
 *    makes the reference's artifact language tag (docs/v1/01-…md:449 — Mono
 *    10.5px/12, Medium 500, UPPERCASE, letter-spacing .05em) reachable for the
 *    first time: the banner font VARIABLE cannot express case or tracking, the
 *    hook can.
 *  - `[data-disclosure-header]` is the published collapse-row hook
 *    (DisclosureRow: thinking/tool/read rows). 12px/16, Medium 500,
 *    secondary → primary on hover with the reference swift curve
 *    (docs/v1/01-…md:439).
 *
 * NOT INCLUDED — line numbers. The host mounts `data-line-numbers` only for
 * its own `numbered` code-block variant (`web-frontend-index.js`:
 * `"data-line-numbers": s || void 0`), and the chat markdown renderer never
 * enables that variant. A gutter rule would be unreachable, the chat blocks
 * render no line numbers, and this theme does not fake them.
 *
 * The terminal-dark code surface itself is owned by `codeRules()` and is not
 * touched here.
 */
function codeBlockDetailsRules() {
  return [
    '/* ---- code artefact details: banner, disclosure row ---------------- */',
    // Banner language label. The two container shapes are both addressed: the
    // infostring IS the first child in the simple banner, while the card
    // banner's heading is the first child and its language span the first
    // child of that heading.
    '[data-code-block-banner] > :first-child,',
    '[data-code-block-banner] > :first-child > :first-child {',
    '  font-family: var(--ds-font-family-code) !important;',
    '  font-size: 10.5px !important;',
    '  line-height: 12px !important;',
    '  font-weight: 500 !important;',
    '  text-transform: uppercase !important;',
    '  letter-spacing: 0.05em !important;',
    '}',
    // The card banner may carry a title next to the language: keep the host's
    // casing and metrics so only the LABEL is restyled.
    '[data-code-block-banner] > :first-child > :not(:first-child) {',
    '  font-family: var(--dsw-font-family) !important;',
    '  font-size: 11px !important;',
    '  line-height: 18px !important;',
    '  font-weight: 400 !important;',
    '  text-transform: none !important;',
    '  letter-spacing: normal !important;',
    '}',
    // The banner/body seam is a single half-pixel hairline (the 1-border rule:
    // internal divisions are one-sided lines, never a second frame). The
    // markdown scope is spelled out so it beats codeRules()'s banner divider.
    '.md-code-block [data-code-block-banner],',
    '[data-code-block-banner] {',
    '  border-bottom: .5px solid var(--dsw-alias-border-l2) !important;',
    '}',
    // Disclosure / collapse row.
    '[data-disclosure-header] {',
    '  font-size: 12px;',
    '  line-height: 16px;',
    '  font-weight: 500;',
    '  color: var(--dsw-alias-label-secondary);',
    '  transition: color 120ms ' + EASING.swift + ';',
    '}',
    '[data-disclosure-header] :where(span, div, button) {',
    '  font-size: inherit;',
    '  line-height: inherit;',
    '  font-weight: inherit;',
    '}',
    '[data-disclosure-header]:hover,',
    '[data-disclosure-header]:focus-within {',
    '  color: var(--dsw-alias-label-primary);',
    '}',
  ].join('\n')
}

/**
 * Markdown body: the closed table frame, the header band and the quote rhythm.
 *
 * THE PROBLEM, verbatim from the host's own markdown CSS (installed
 * `dsh-web-frontend` sheet): tables have no outer frame and no header fill, the
 * first column's left padding and the last column's right padding are zeroed,
 * every row including the last carries a bottom hairline, and there is no
 * radius —
 *
 *   ._tableScroll table { border-collapse:collapse; width:max-content; max-width:max-content }
 *   ._tableScroll th { text-align:start; padding:10px 16px; border-bottom:.5px solid …l3; font:… }
 *   ._tableScroll td { padding:10px 16px; border-bottom:.5px solid …l2; font:… }
 *   ._tableScroll th:first-child, td:first-child { padding-left:0 }
 *   ._tableScroll td:last-child { padding-right:0 }
 *
 * THE HOOK. There is no stable selector for that wrapper (salted
 * `_tableScroll_<hash>_<n>`; `md-table-wide` is emitted only on wide tables and
 * `md-table-fill` has no rule at all). `markdown.js` walks from the stable
 * `[data-chat-flow]` anchor, marks the table's wrapper `data-cds-table`, and
 * this block paints that mark. No host class appears in any selector below.
 *
 * THE FRAME LIVES ON THE WRAPPER, NOT ON `table`, and the wrapper is also the
 * CLIP BOX — but the wrapper is NOT where the table is. Three host behaviours
 * conspire against a naive frame:
 *   1. `table { width: max-content }` sizes the table to its own content while
 *      the wrapper stays a full-width block;
 *   2. the wide-table variant sets `overflow-x: hidden` (its scrollbar appears
 *      only on hover), so an over-wide table is CUT at the wrapper's edge with
 *      no visible cue;
 *   3. the same variant BLEEDS the wrapper out of the prose column
 *      (`.v5IAXa_body .md-table-wide`: `width: calc(100% + lead + spare)`,
 *      `margin-left: calc(-1 * lead)`, `padding-left: lead`), so a frame drawn
 *      on it hangs ~100px to the left of the text with an empty gutter inside.
 * The first version of this item framed the wrapper and inherited all three:
 * the frame ran past the columns, the last column's text was chopped mid-glyph,
 * and wide tables grew a dead strip on the left. So the item owns the geometry:
 * the bleed is cancelled (`width/max-width: 100%`, `margin-left/padding-left:
 * 0`), `overflow-x: auto` so nothing is ever clipped silently, `width: 100%` on
 * the table so it fills the frame, and `max-width: none` on the cells because
 * the host caps every column at `min(30vw, 320px)`, which would leave the frame
 * wider than the table again. `box-sizing: border-box` keeps the half-pixel
 * border from widening the column by a pixel.
 *
 * `th` sets no type: the header's font comes from the host's own
 * `--dsw-font-markdown-table-head` token, which the typography layer maps.
 * Declarations that override a host rule carry `!important`, because the host's
 * sheets can land after this one and the host's own selectors have the same
 * specificity.
 */
function markdownBodyRules() {
  return [
    '/* ---- markdown body: table frame + quote rhythm --------------------- */',
    '[data-cds-table] {',
    '  box-sizing: border-box;',
    '  border: .5px solid var(--dsw-alias-border-l1);',
    '  border-radius: var(--dsw-radius-md);',
    '  background: var(--dsw-alias-bg-base);',
    // THE BLEED. The host's wide-table variant (`.v5IAXa_body .md-table-wide`,
    // shipped as a CSS string from dsh-client-ui-chat) pushes the WRAPPER out of
    // the prose column: it widens it to `100% + lead + spare`, shifts it left by
    // `lead`, and pads the left side by the same amount, so the table stays where
    // it always was while the wrapper sticks out into the message padding. A
    // frame drawn on that wrapper inherits a ~100px empty gutter on the left.
    // The frame must trace the prose column, so the bleed is cancelled; the
    // table still fills the frame (`width: 100%` below, against the wrapper's
    // now-unpadded content box).
    '  width: 100% !important;',
    '  max-width: 100% !important;',
    '  margin-left: 0 !important;',
    '  padding-left: 0 !important;',
    // The same variant hides its scrollbar behind `:hover`; a frame that can
    // hide its own content is worse than a visible scrollbar. It also adds a 5px
    // bottom pad that collapses on hover — with the scrollbar always available
    // that pad has no job, and dropping it keeps the rows below from jumping
    // 5px when the pointer crosses the table.
    '  overflow-x: auto !important;',
    '  padding-bottom: 0 !important;',
    '}',
    // Fit the table to the frame. The host's `width: max-content` lets the table
    // outgrow the wrapper, which is what clipped the last column.
    '[data-cds-table] table {',
    '  width: 100% !important;',
    '  max-width: 100% !important;',
    '}',
    // Header band: the reference's tinted `th` row with a single hairline
    // below. The host sets no fill on th and its font token stays untouched.
    '[data-cds-table] th {',
    '  background: var(--dsw-alias-bg-module-platform);',
    '  border-bottom: .5px solid var(--dsw-alias-border-l1) !important;',
    '}',
    // Restore the insets the host zeroes on the first and last column, so text
    // no longer touches the frame; drop the host's per-column width cap (it
    // would keep the table narrower than its frame) and let long tokens break
    // instead of pushing the column past it.
    '[data-cds-table] th,',
    '[data-cds-table] td {',
    '  padding: 10px 14px !important;',
    '  max-width: none !important;',
    '  overflow-wrap: anywhere;',
    '}',
    '[data-cds-table] th:first-child,',
    '[data-cds-table] td:first-child {',
    '  padding-left: 14px !important;',
    '}',
    '[data-cds-table] th:last-child,',
    '[data-cds-table] td:last-child {',
    '  padding-right: 14px !important;',
    '}',
    // The frame is the closing edge: the last row carries no second hairline
    // (the 1-border discipline).
    '[data-cds-table] tbody tr:last-child td {',
    '  border-bottom: none;',
    '}',
    // Reference: every counting region uses tabular numerals, tables included
    // (docs/v1/01-…md:497-505). The host's `font:` shorthand on td resets this
    // longhand, hence !important.
    '[data-cds-table] td {',
    '  font-variant-numeric: tabular-nums !important;',
    '}',
    // The host hard-codes 11px for code inside a table, which reads as a caption
    // next to 14px body text; `.875em` is the same ratio the host's own inline
    // code uses against its body size.
    '[data-cds-table] table code {',
    '  font-size: .875em !important;',
    '}',
    // The host leaves a blockquote's bottom margin at 0 (`margin:16px 0 0`), so
    // a quote butts into the paragraph after it. CDS spaces block blocks
    // symmetrically: the top is already 16px, the bottom now matches.
    '[data-chat-flow] blockquote {',
    '  margin: 16px 0 !important;',
    '}',
  ].join('\n')
}

/**
 * The thinking row's breathing glint.
 *
 * The host sweeps a `currentColor` band across the running label ("Deep diving
 * for 3s…"), which reads as a hard solid bar in clay. This rule keeps the
 * host's sweep GEOMETRY untouched — the transform keyframes, durations, delays
 * and the mask-image all stay on the host's own `.sweep` element — and only
 * softens the decoration's fill: a transparent→clay-shimmer→transparent
 * gradient at 60% opacity with a 1px blur reads as a glint crossing the text.
 *
 * HOOKS. The host publishes `[data-shimmer]` on the shimmer root and
 * `[data-shimmer-decoration]` on its decoration element (evidence:
 * `.repro/css/web-frontend-index.pretty.css` — `[data-shimmer-text]:after`
 * duplicates the text on the highlight pass, and the sweep paints the
 * decoration). The element's host rule is `.sweep [data-shimmer-decoration]`
 * with class+attribute specificity, so the three visual declarations need
 * `!important` to win; nothing here touches `animation-name`,
 * `animation-duration`, `transform`, `mask-image` or the keyframes, so the
 * geometry — and therefore the reference timing — is unchanged.
 *
 * DEGRADATION. A host that stops emitting the hook simply never matches this
 * rule; the theme keeps working and the label keeps the host treatment.
 *
 * The timing function is the reference's `--cds-ease-pulse`
 * (cubic-bezier(.4, 0, .2, 1), cds-theme.css:199 / docs/v1/01-…md:608) — a
 * breathing cadence instead of the host's stepped 48-frame sweep.
 */
function shimmerRules() {
  return [
    '/* ---- thinking shimmer: clay breathing glint ------------------------ */',
    // WHAT THIS ELEMENT ACTUALLY IS. `[data-shimmer-decoration]` is the SEPARATOR
    // span in the reasoning row's collapsed header — `aria-hidden="true"`, a pure
    // decoration next to the 「思考」 label, with the host's own duplicated-text
    // `:after` and a `currentColor` sweep painted over it.
    //
    // WHY THERE IS NO `filter` AND NO `opacity` HERE. An earlier version blurred
    // this layer by 1px at 60% opacity. The row's text is re-rendered
    // continuously while a response streams, and the blurred, half-transparent
    // layer repeatedly ended up over the 「思考」 glyphs for a frame at a time, so
    // the label looked smeared or partially covered DURING output — the artefact
    // the user reported. The element carries no information (aria-hidden, and its
    // only content is decoration), so softening it bought nothing and cost the
    // legibility of the label beside it.
    //
    // What remains is the COLOUR of the glint: the clay shimmer token instead of
    // the host's `currentColor`. Geometry, duration, delay, keyframes and
    // `mask-image` all stay the host's own, so the reference timing is unchanged.
    '[data-shimmer-decoration] {',
    '  background: linear-gradient(90deg, transparent 0%, var(--dsw-alias-label-deep-diving-shimmer) 50%, transparent 100%) !important;',
    '  animation-timing-function: var(--cds-ease-pulse) !important;',
    '}',
  ].join('\n')
}

/**
 * Sidebar.
 *
 * Deliberately almost empty. The sidebar root carries NO stable `data-*` hook
 * — only the hashed `._2H3hWW_root` — and its padding and width are inline
 * styles coupled to the drag/animation machinery. The one thing that matters,
 * its background, is already a token (`--dsw-specific-sidebar-fill`), which the
 * host applies in three places at once (the sidebar column, the sidebar root
 * and the Windows frame background).
 *
 * `data-sidebar-collapsed` is NOT a sidebar selector: the layout puts it on the
 * AppFrame root, so `[data-sidebar-collapsed] button` would match every button
 * in the application. Nothing here keys on it.
 */
function sidebarRules() {
  return [
    '/* ---- sidebar -------------------------------------------------------- */',
    '/* Background and nav fills arrive through tokens; the root has no stable',
    '   hook and its geometry is inline-styled, so nothing is overridden here. */',
  ].join('\n')
}

/** Menus and popovers: CDS's dual-ring popover shadow. */
function overlayRules() {
  return [
    '/* ---- menus & popovers: dual-ring ---------------------------------- */',
    '[data-menu-material] {',
    '  border-radius: var(--dsw-radius-lg) !important;',
    '  border: 0 !important;',
    '  box-shadow: var(--dsw-elevation-prominent) !important;',
    '}',
  ].join('\n')
}

/** Scrollbars: a thin clay-neutral thumb, pill shaped. */
function scrollbarRules() {
  return [
    '/* ---- scrollbars ---------------------------------------------------- */',
    '::-webkit-scrollbar {',
    '  width: 10px;',
    '  height: 10px;',
    '}',
    '::-webkit-scrollbar-track {',
    '  background: transparent;',
    '}',
    '::-webkit-scrollbar-thumb {',
    '  border-radius: 999px !important;',
    '  border: 3px solid transparent !important;',
    '  background-clip: content-box !important;',
    '}',
  ].join('\n')
}

/** Motion: replace the host's generic easing with CDS's swift curve. */
function motionRules() {
  return [
    '/* ---- motion -------------------------------------------------------- */',
    ':root {',
    '  --ds-ease-in-out: ' + EASING.inOut + ';',
    '  --ds-ease-swift: ' + EASING.swift + ';',
    '  --ds-ease-enter: ' + EASING.enter + ';',
    '  --ds-ease-out: ' + EASING.out + ';',
    '  --ds-ease-snap: ' + EASING.snap + ';',
    // The reference's breathing-pulse curve (cds-theme.css:199,
    // docs/v1/01-…md:608). Kept under its reference name; the shimmer rule is
    // its only consumer today.
    '  --cds-ease-pulse: ' + EASING.pulse + ';',
    '}',
    // CDS never animates with `linear`; anything the host left on a generic
    // transition keeps its duration but picks up the swift curve.
    'body [style*="transition"] {',
    '  transition-timing-function: ' + EASING.swift + ';',
    '}',
  ].join('\n')
}

/**
 * The three reference motion curves, declared as TOKENS.
 *
 * They are NOT gated on `buttonSpring`. A curve is vocabulary, not a look: the
 * press transitions that consume them are what the switch controls, and the
 * reference's `--cds-ease-rise` / `--cds-ease-fall` are simply the two curves
 * the token table was missing. This block therefore rides the master switch
 * only (like `themeModeRules`), and is emitted outside `refine` too.
 *
 * Values copied verbatim from the reference `code-examples/cds-theme.css`
 * (15-stop `linear()` spring; the two cubic-béziers).
 */
function motionTokenRules() {
  return [
    '/* ---- motion tokens: the reference spring + the two unused curves ---- */',
    ':root {',
    '  --cds-btn-spring: linear(0, .2459, .6526, .9468, 1.0764, 1.0915, 1.0585, 1.0219, .9993, .9914, .9921, .9957, .9988, 1.0004, 1);',
    '  --cds-ease-rise: cubic-bezier(.3, .7, .4, 1);',
    '  --cds-ease-fall: cubic-bezier(0, 0, .2, 1);',
    '}',
  ].join('\n')
}

/**
 * Footnotes — the generated block (`web-frontend-index.js`: a `section` with
 * `data-footnotes` around an `ol`; reference numbers are `<sup>` in the body).
 *
 * Type scale from `docs/v1/01-…md:363-364`: `calc(0.75rem * scale)` = 12px and
 * `calc(0.9375rem * scale)` = 15px (ratio 1.25). The block's own margin is left
 * alone on purpose — only the type, the colour and the rule above it change.
 */
function footnoteRules() {
  return [
    '/* ---- footnotes: 12/15, tertiary, half-pixel rule above ------------- */',
    '[data-footnotes] {',
    '  font-size: 12px;',
    '  line-height: 15px;',
    '  color: var(--dsw-alias-label-tertiary);',
    '  border-top: .5px solid var(--dsw-alias-border-l2);',
    '  padding-top: 10px;',
    '}',
    // The reference numbers live in the body text, inside the chat flow.
    '[data-chat-flow] sup {',
    '  font-family: var(--ds-font-family-code);',
    '  font-variant-numeric: tabular-nums;',
    '  line-height: 0;',
    '}',
  ].join('\n')
}

/**
 * Usage-number typography — the composer's stat pills and the two usage popovers.
 *
 * HOOKS (`ui-chat`): `data-composer-stat` ×2 on the pill anchors (`PlainPill` /
 * `DialogPill`, value = the stat id), `data-session-stats-details` and
 * `data-turn-usage-details` on the two `<dl>` popovers.
 *
 * WHAT IS NOT REACHABLE, ON PURPOSE. The reference's
 * `ModelSwitcherWithTokenGauge.tsx` draws a four-colour memory gauge as an SVG
 * the host does not render and gives no mount point for. It is NOT attempted;
 * what ships is the part a reader actually scans — the numerals.
 *
 * `tabular-nums` on every value is CDS's counting-region rule
 * (`docs/v1/01-…md:497-505`): proportional digits make a value jitter as it
 * updates. The `<dl>` rows get the CDS two-column treatment, and the pill keeps
 * the host's geometry — only the number typography changes.
 */
function statTypographyRules() {
  return [
    '/* ---- usage numbers: tabular counting + the dt/dd ladder -------------- */',
    '[data-composer-stat] {',
    '  font-variant-numeric: tabular-nums;',
    '}',
    // The two usage popovers: one baseline per row, a fixed 6px column gap, and
    // the reference's dt/dd colour and size split.
    '[data-session-stats-details], [data-turn-usage-details] {',
    '  display: grid;',
    '  grid-template-columns: auto 1fr;',
    '  column-gap: 6px;',
    '  row-gap: 4px;',
    '  align-items: baseline;',
    '}',
    '[data-session-stats-details] dt, [data-turn-usage-details] dt {',
    '  color: var(--dsw-alias-label-tertiary);',
    '  font-size: 12px;',
    '  line-height: 15px;',
    '  font-weight: 400;',
    '}',
    '[data-session-stats-details] dd, [data-turn-usage-details] dd {',
    '  margin: 0;',
    '  color: var(--dsw-alias-label-primary);',
    '  font-size: 12px;',
    '  line-height: 15px;',
    '  font-variant-numeric: tabular-nums;',
    '}',
  ].join('\n')
}

/**
 * Button spring — the three curves are declared by `motionTokenRules()` (always
 * present); this is only the PRESS MOVEMENT that consumes them.
 *
 * REACH: the controls this plugin owns (`.dct-*`), never the host's markdown
 * buttons — those are salted CSS-Modules classes and unreachable by design.
 */
function buttonSpringRules() {
  const press = 'transform 260ms var(--cds-btn-spring)'
  return [
    '/* ---- button spring: press movement on this plugin\'s own controls ---- */',
    '.dct-swatch, .dct-toggle, .dct-mode-cube {',
    '  transition: ' + press + ', box-shadow 120ms ' + EASING.swift + ', background-color 120ms ' + EASING.swift + ';',
    '}',
    '.dct-swatch:active, .dct-toggle:active, .dct-mode-cube:active {',
    '  transform: scale(.96);',
    '}',
  ].join('\n')
}

/**
 * Stock-blue leftovers the token layer cannot reach.
 *
 * The plugin overrides the ALIAS layer only. A handful of host rules read the
 * STATIC palette (`--dsw-static-*`) directly, so they keep DeepSeek blue inside
 * an otherwise clay UI. Overriding the static layer itself is not an option —
 * it is shared by every consumer of every static token.
 *
 * Where the host funnelled a static read through an intermediate variable, that
 * variable is the seam, and rebinding it is free of side effects:
 *
 *   --dsh-file-type-icon-color   consumed as `var(icon-color, default-color)`
 *                                and never assigned anywhere, so assigning it
 *                                outranks every per-type default without
 *                                fighting class specificity.
 *
 * NOT changed, on purpose:
 *   - the context meter's per-category tints (`--meter-tint`) and the file-type
 *     hues (green for spreadsheets, red for PDF, amber for slides). Those are
 *     CATEGORY identity, not brand: collapsing them to one grey makes the meter
 *     and the file icons unreadable at a glance. Keeping a cool hue in a
 *     category swatch is the same decision CDS makes for syntax highlighting.
 *   - the brand loading ring (a conic gradient painted inline) and the KaTeX
 *     error colour. Both are artwork, not theme surface.
 */
function stockBlueRules() {
  return [
    '/* ---- stock-blue leftovers ------------------------------------------ */',
    // File-type icons: .md / .html / code files all default to
    // --dsw-static-deepseek-500. One assignment covers every type, because the
    // consumer reads this variable FIRST and nothing else ever sets it. The
    // per-type hues that carry meaning (green/red/amber) are left alone by
    // scoping the override to the default branch only.
    ':root {',
    '  --dsh-file-type-icon-color: var(--dsw-alias-label-tertiary);',
    '}',
    // Toast action links ("撤销" and friends) hard-code
    // --dsw-static-deepseek-400. The class is salted, so this keys on the
    // toast surface plus the action button inside it (the toast markup has no
    // other <button>; there is no dismiss control).
    //
    // The toast surface is DARK in both palettes (--dsw-alias-toast-bg is
    // #151515 light / #2c2c2a dark), so the link needs the light-on-dark accent
    // in both. `--dsw-alias-link` is palette-aware: in light mode it resolves to
    // the dark-on-white value (#b2563a), only 3.73:1 on #151515.
    '[class*="toast"] button {',
    '  color: ' + CLAY.dark.text + ' !important;',
    '}',
  ].join('\n')
}

/**
 * Dark-mode cards that paint a stock neutral instead of a themed surface.
 *
 * Plan, Schedule and Deliverables cards each declare their own fill variable
 * and, in dark mode, point it at `--dsw-static-neutral-850` (#212123). That
 * value has hue 240 — it is a BLUE-tinted graphite — while this theme's dark
 * ladder is neutral (#151515 / #1a1a19 / #20201f). Side by side the cards read
 * as slightly cold, which is exactly the "cold patch in a warm UI" this whole
 * pass is about.
 *
 * The light halves (`--dsw-static-neutral-50`, #fafafa) are left alone: against
 * the themed canvas #fcfcfb they differ by 1.017:1, i.e. not at all.
 *
 * Each of the three exposes a local variable, so rebinding it in dark mode is
 * contained to that card — no static token is touched.
 */
function stockNeutralCardRules() {
  return [
    '/* ---- dark cards that paint a stock neutral ------------------------- */',
    'body[data-ds-dark-theme] {',
    '  /* plan cards */',
    '  --plan-card-fill: var(--dsw-alias-bg-layer-1);',
    '  --plan-card-hover: var(--dsw-alias-bg-layer-2);',
    '  /* schedule cards */',
    '  --card-fill: var(--dsw-alias-bg-layer-1);',
    '  --card-hover: var(--dsw-alias-bg-layer-2);',
    '  /* deliverables / changes cards */',
    '  --changes-fill: var(--dsw-alias-bg-layer-1);',
    '  --changes-hover: var(--dsw-alias-bg-layer-2);',
    '}',
  ].join('\n')
}

/**
 * Settings rows: match the host's row chrome so plugin rows look native.
 *
 * TWO SLOTS, because the rows live on two pages: the theme-mode cubes and the
 * eight appearance knobs on 「主题定制 / Theme」 (`settings.appearance.item`, the
 * section declared by `section.js`) and the master switch in 「通用 / General」
 * (`settings.general.item`). Both get the same hairline treatment, and each
 * suppresses the line on its own last row — the host does that for its own
 * section with `.section > [data-slot="settings.general.item"] > :last-child`,
 * scoped to a salted class we must not use, so it is re-expressed here on the
 * slot anchors instead.
 */
function settingsRules() {
  return [
    '/* ---- settings rows ------------------------------------------------- */',
    '[data-slot="settings.general.item"] > *,',
    '[data-slot="settings.appearance.item"] > * {',
    '  border-bottom: 0.5px solid var(--dsw-alias-border-l2);',
    '}',
    '[data-slot="settings.general.item"] > *:last-child,',
    '[data-slot="settings.appearance.item"] > *:last-child {',
    '  border-bottom: none;',
    '}',
  ].join('\n')
}

/**
 * Hide the HOST's light/dark cube row in 「通用」, now that 「主题模式」 carries it.
 *
 * EXACTLY ONE ROW, ON PURPOSE. This rule hides the cubes and nothing else. The
 * host's 字号大小 group is NOT hidden and is NOT rebuilt: the user's explicit
 * decision is that font sizing stays in 「通用」, so it is out of scope for this
 * item rather than merely waiting for a replacement. Do not widen this selector
 * to reach it — see README 「已知限制」.
 *
 * WHY CSS AND NOT A DOM MOVE. Removing or reparenting a host-owned node inside
 * React's commit is the `removeChild` crash class this repo already hit once.
 * `display: none` leaves React's tree intact, so a failed pass cannot corrupt
 * the page — the worst case is a row that simply stays visible. There is nothing
 * to restore on dispose either: the rule goes, the DOM was never touched.
 *
 * WHY THE SELECTOR IS SHAPED THIS WAY. Two facts about the shipped renderer
 * decide it (`dsh-client-ui-renderer/lib/client.js:1122-1127`, `:1203-1221`):
 *
 *   1. A list slot renders ONE anchor — `div[data-slot="settings.general.item"]`
 *      with `display: contents` — and every registered row is its DIRECT CHILD.
 *      So `[data-slot=…]:has(> * > button[…])` would match the outlet for ANY
 *      row shape and hide the whole 通用 page. The `:has()` therefore goes on
 *      the child (`> *:has(…)`), i.e. "the row that contains this shape".
 *
 *   2. `aria-pressed` is unique to the host's cube row among every package that
 *      registers into this slot — audited: locale, chat, conversation,
 *      permission-presets, settings-general, settings-session-log, shortcuts,
 *      theme; only `theme` emits `aria-pressed`. `:not([role="switch"])` guards
 *      against a future host switch that also reports pressed state. (`aria-
 *      expanded` was the obvious alternative and is shared by SIX of those
 *      packages, so it would have hidden the language / permission /
 *      composer-enter rows — which is why it is not used at all.)
 *
 * WHAT IT PROVABLY CANNOT MATCH. Scoped to `settings.general.item`, so our
 * accent swatches (`aria-pressed`, on `settings.appearance.item`) and our
 * theme-mode cubes (same page) are out of scope; the `enabled` switch is
 * `role="switch"` + `aria-checked` with no `aria-pressed`; a menu trigger
 * (`aria-haspopup`) or any buttonless row matches nothing. The slot scope is
 * load-bearing rather than incidental — our own rows carry the same
 * `aria-pressed` shape — and `test/thememode.test.mjs` keeps a reverse-proof test
 * that fails if the scope is ever dropped.
 */
function themeModeRules(themeModeAvailable) {
  if (!themeModeAvailable) return null
  return [
    '/* ---- host light/dark row: replaced by the 主题模式 row on our page --- */',
    'body [data-slot="settings.general.item"] > *:has(button[aria-pressed]:not([role="switch"])) {',
    '  display: none !important;',
    '}',
  ].join('\n')
}

/**
 * Selection states that the token layer cannot reach.
 *
 * The appearance picker marks the active cube with
 * `.selected { background: var(--dsw-alias-bg-module-platform);
 * border-color: var(--dsw-static-neutral-bluish-400) }`. Two failures follow
 * from the token model:
 *
 *   1. `border-color` names a STATIC palette token (`--dsw-static-*`). The
 *      theme only overrides the alias layer, so the border stays stock bluish
 *      while everything around it turns warm — a cold ring on a warm card.
 *   2. In light mode `bg-module-platform` resolves to `#f7f7f5`, which against
 *      an unselected white card is a barely-visible fill. With the stock
 *      border also being pale, "跟随系统" rendered as if nothing were selected.
 *
 * Neither is fixable in the token layer: the static palette is off-limits
 * (overriding it would recolour every consumer of every static token) and the
 * selected fill is already an alias. So the selection is re-expressed here on
 * the same element, using the accent.
 *
 * The selector is the hashed `.selected` class, which is the only hook the host
 * renders. It is scoped to the two settings slots the theme owns a stake in —
 * `settings.general.item` (where the host's 浅色/深色/跟随系统 picker lives) and
 * `settings.appearance.item` (our own page, should the picker ever move there) —
 * to keep it from touching unrelated selected states elsewhere in the app.
 * Neither our swatches nor our rows carry a `selected`-ish class, so the extra
 * scope cannot over-match.
 */
function selectionRules(accent) {
  // `accent` is `{ light, dark }` plain colours, never the translucent glow.
  const light = accent === undefined || accent.light === undefined ? '#d97757' : accent.light
  const dark = accent === undefined || accent.dark === undefined ? '#d97757' : accent.dark
  return [
    '/* ---- selection states the token layer cannot reach ----------------- */',
    // Same defect, second site: the agent-preset page marks its active card
    // with `.cardActive { border-color: var(--dsw-static-neutral-bluish-400) }`.
    // That page is not inside either item slot, so it is matched on the stable
    // `data-agent-preset-id` card hook plus the active class.
    '[data-slot="settings.general.item"] [class*="selected"],',
    '[data-slot="settings.appearance.item"] [class*="selected"],',
    '[data-agent-preset-id][class*="cardActive"] {',
    '  border-color: ' + light + ' !important;',
    '  background: color-mix(in srgb, ' + light + ' 10%, transparent) !important;',
    '}',
    'body[data-ds-dark-theme] [data-slot="settings.general.item"] [class*="selected"],',
    'body[data-ds-dark-theme] [data-slot="settings.appearance.item"] [class*="selected"],',
    'body[data-ds-dark-theme] [data-agent-preset-id][class*="cardActive"] {',
    '  border-color: ' + dark + ' !important;',
    '  background: color-mix(in srgb, ' + dark + ' 18%, transparent) !important;',
    '}',
    // Keyboard focus keeps the ring, so the selected cube is not the only cue.
    '[data-slot="settings.general.item"] [class*="selected"]:focus-visible,',
    '[data-slot="settings.appearance.item"] [class*="selected"]:focus-visible {',
    '  box-shadow: 0 0 0 1.5px var(--dsw-focus-ring-color) !important;',
    '}',
  ].join('\n')
}

/** The accent glow used by the focus ring; derived per palette. */
function glowRule(accentGlow) {
  return 'body { --dsw-focus-ring-glow: ' + accentGlow.light + '; }\n' +
    'body[data-ds-dark-theme] { --dsw-focus-ring-glow: ' + accentGlow.dark + '; }'
}

/**
 * The embedded Anthropic faces and the reference's stack tokens.
 *
 * This block is typography, not component refinement: it rides the master
 * switch (`enabled`) but NOT `refine`, so a user who distrusts one component
 * rule still gets the replica type. The `@font-face` sources and the verbatim
 * `--font-anthropic-*` chains come from `fonts.js`; what connects them to the
 * app is the token layer (`--dsw-font-family` / `--ds-font-family-code`, see
 * typography.js), which the presenter writes inline on body.
 *
 * STATIC BY CONSTRUCTION — the block has no state dependency, and in the
 * browser its six `src` values are ~880 KB of inlined `data:font/woff2` base64.
 * It is built ONCE per page and cached at module scope: `buildCss` still embeds
 * it (the artifact-of-record), but `createStyles` slices it back out and keeps
 * it in its own `<style>` tag, so a settings toggle only rewrites the ~10 KB of
 * state-dependent rules. Rebuilding/reparsing 880 KB per toggle is what made
 * the switches feel laggy.
 */
let fontRulesCache = null

/**
 * The cached static font sheet (one build per page). `fontCss()` reads the
 * host-injected font base / document protocol only on its first call, which is
 * exactly the point: those do not change while the page is alive.
 */
export function fontSheet() {
  if (fontRulesCache === null) {
    fontRulesCache = [
      '/* ---- fonts: Anthropic faces + the reference stacks ----------------- */',
      fontCss(),
    ].join('\n')
  }
  return fontRulesCache
}

function fontRules() {
  return fontSheet()
}

/**
 * The hero greeting in the serif.
 *
 * The headline is marked `data-cds-greeting` by hero.js (structural lookup
 * from the host's healthy anchors — its own class is salted and must not be
 * targeted). Every value comes from `GREETING_DISPLAY` in typography.js, which
 * is the reference's display row (`docs/v1/01-设计哲学与设计令牌体系.md:547`):
 * Serif family, `2.375rem` (38px), `1.2` (45.6px), Light `wght 330`, optical
 * size `"opsz" 48`. The reference weight — 330 — is what ships; the host
 * headline's 500 and a semibold title rung are both wrong for this row.
 *
 * The `!important` values exist to beat the host's own `.Hqq-bq_headline`
 * declaration (26px/500/32px). The dark palette does not thin the display
 * weight: the compensation table (`:383-414`) covers 400/500/580/660 only, so
 * 330 is the reference value in both palettes.
 */
function greetingRules() {
  return [
    '/* ---- hero greeting: the reference serif display -------------------- */',
    '[data-cds-greeting] {',
    '  font-family: var(--font-anthropic-serif) !important;',
    '  font-size: ' + GREETING_DISPLAY.size + ' !important;',
    '  line-height: ' + GREETING_DISPLAY.lineHeight + ' !important;',
    '  font-weight: ' + GREETING_DISPLAY.weight + ' !important;',
    '  font-variation-settings: ' + GREETING_DISPLAY.variationSettings + ';',
    '}',
  ].join('\n')
}

/**
 * New-session layout safety, and the ONLY place this plugin caps the composer.
 *
 * WHAT THIS REPLACES. An earlier version ran a compactHero runtime: it measured
 * `[data-composer-seat]` on a blank session and hid the greeting + usage dock
 * once the seat grew past a resting height. The seat wraps the WHOLE hero
 * composerStack — greeting headline, usage panel, workspace row, input — so
 * collapsing the greeting lowered the seat it had just measured, which brought
 * the greeting back, which raised it again: a self-feeding layout loop. That
 * runtime, its `compactHero` setting and its copy are gone. A leftover
 * `compactHero` key in localStorage is dropped by `sanitize()` in constants.js.
 *
 * WHAT REPLACES IT — CSS only, no observer, no measurement:
 *
 *   [data-content-phase="hero"]  the host's own phase attribute on
 *       [data-conversation-content]; the host resolves it as
 *       `hero = shellPhase === 'blank'`, i.e. a NEW/unused session. Every rule
 *       below is scoped to it, so an active conversation is untouched.
 *
 *   --dsh-composer-text-max-height  the host declares it at 336px on the
 *       composer seat and the input's `[data-input-scroll]` uses it as its
 *       `max-height` (08-InputBar `_scroll`). Lowering the variable to eight
 *       host line heights (24px + --dsh-content-font-delta each, so the cap
 *       follows the theme's own line height) or 30vh, whichever is smaller,
 *       keeps [data-input-scroll] the SOLE text scrollport — no extra wrapper,
 *       no JS height writes, nothing to re-measure.
 *
 *   [data-composer-seat]  stays at its natural height (`flex: 0 0 auto`,
 *       static). This is a DEFENSIVE constraint, not a correction: the host
 *       makes the seat sticky only under `[data-phase=active]`
 *       (`.Dc7zOa_root[data-phase=active] .Dc7zOa_composerSeat`,
 *       ConversationRoot.module.css) and leaves it in normal flow on a hero
 *       session, where it also declares `flex: none`. Pinning it static costs
 *       nothing today and keeps a future hero-phase sticky seat from pinning an
 *       oversized stack over the content it is centred in.
 *
 *   [data-conversation-scroll]  the host's `.scrollBody` in the hero phase is
 *       `justify-content: center` + `overflow-y: auto`, selected as
 *       `.root[data-phase=hero] .scrollBody` / `.embeddedBody[data-content-phase=hero]
 *       .scrollBody` — specificity (0,3,0), exactly ours
 *       (`[data-conversation-content][data-content-phase="hero"] >
 *       [data-conversation-scroll]`). Equal specificity means the LATER
 *       stylesheet wins, and the plugin stylesheet is never guaranteed to load
 *       after the host's, so these declarations are `!important` rather than
 *       depending on insertion order. Safe centring keeps every edge reachable
 *       when the stack overflows; `flex-start` is the explicit fallback where
 *       `safe center` is unsupported, so the top never clips. Both are
 *       `!important` together — the cascade then leaves the fallback/supported
 *       pair to the same origin and importance, where the invalid value is
 *       dropped and the later valid one wins. `overflow-y` is declared without
 *       `!important`: it only restates the host's own hero-phase value, so a
 *       host that changes it keeps the last word, and there is no second
 *       useful value to preserve.
 *
 * A tall draft therefore scrolls inside the input at roughly 8 host line
 * heights (up to 30vh on a short window — a wrapped line or the toolbar row can
 * make the visible count land near, not exactly at, 8), and if the page still
 * does not fit, the page itself scrolls from the top down.
 */
function newSessionInputRules() {
  return [
    '/* ---- new-session input: bounded text, reachable page overflow ------ */',
    // The page scrollport: overflow belongs to it, never to the composer seat.
    // Our selector ties the host's (0,3,0), so the winner would otherwise be
    // decided by stylesheet order — which this plugin does not control.
    // IMPORTANT: both justify-content lines, never one, so the fallback and the
    // supported value keep competing on their own merits.
    '[data-conversation-content][data-content-phase="hero"] > [data-conversation-scroll] {',
    '  justify-content: flex-start !important;',
    '  justify-content: safe center !important;',
    '  overflow-y: auto;',
    '}',
    // The seat holds the entire hero stack; keep it in normal flow at its
    // natural height so the page — not the seat — owns any overflow. The host
    // is already static here (its sticky seat is active-phase only); this holds
    // that default rather than overriding it.
    '[data-conversation-content][data-content-phase="hero"] > [data-conversation-scroll] > [data-composer-seat] {',
    '  flex: 0 0 auto;',
    '  position: static;',
    '}',
    // Eight host line heights (24px + the theme's per-line delta) or 30vh,
    // whichever is smaller. Read by the host's own [data-input-scroll].
    '[data-conversation-content][data-content-phase="hero"] [data-composer-card] {',
    '  --dsh-composer-text-max-height: min(30vh, calc(192px + 8 * var(--dsh-content-font-delta, 0px)));',
    '}',
  ].join('\n')
}

/**
 * The blank-session backdrop layer: where the glyph field paints, and how the
 * composer card lets it through.
 *
 * THE LAYER PROMOTION IS THE WHOLE TRICK, so it is spelled out. The field is a
 * canvas mounted as the FIRST child of `[data-conversation-content]` (the
 * conversation body, `docs/host-hooks.md:83`). Two declarations put it BEHIND
 * the hero stack instead of on top of it:
 *
 *   isolation: isolate  on the body, so the body becomes a stacking context.
 *                       Without it, a negative-z child would escape upward and
 *                       drop behind the column background entirely.
 *   z-index: -1         on the layer, so it paints above that stacking context's
 *                       own background and below every in-flow descendant — the
 *                       composer stack, the greeting, the workspace row.
 *
 * The isolation is HERO-SCOPED on purpose. In the active phase the host's sticky
 * composer seat competes at `z-index: 7` with the header's `8`/`9` in the
 * column's stacking order; making the body a stacking context there would
 * re-base that contest and could put the seat over the header. A blank session
 * has none of those z-indexes (the host only assigns them under
 * `[data-phase=active]`), so isolating is free exactly where we need it.
 *
 * THE CARD IS TRANSLUCENT, 82%, ONLY ON A BLANK SESSION. The original effect
 * shows its glyphs THROUGH the folder picker and the prompt bar
 * (anthropics/claude-code#102952); an opaque card would cut the ripple off at the
 * card edge, which is the one place the user's cursor usually is. 82% keeps text
 * contrast intact — the card's own text is `label-primary` on `input-major`, and
 * at 82% the backdrop can shift that surface by at most a few percent of
 * luminance — and never touches an active conversation's composer.
 *
 * NOT GATED ON `refine`, on purpose: the layer's promotion is what keeps the
 * effect from covering text, so turning component refinement off while the
 * backdrop is on must not strand a canvas over the greeting. Both are gated on
 * the master switch only, and the module that mounts the canvas is gated on the
 * `heroRipple` setting — so the two never disagree about whether a layer exists.
 */
function heroRippleRules() {
  return [
    '/* ---- blank-session backdrop: layer promotion + see-through card ---- */',
    '[data-conversation-content][data-content-phase="hero"] {',
    '  isolation: isolate;',
    '}',
    // THE EXPLICIT 100% IS LOAD-BEARING — do not "simplify" it away.
    //
    // `<canvas>` is a REPLACED element. An absolutely positioned replaced element
    // with `width`/`height: auto` is NOT stretched by `inset: 0`: it takes its
    // INTRINSIC size, which for a canvas is the `width`/`height` ATTRIBUTES — the
    // bitmap dimensions. Without these two lines the layout size equals the
    // bitmap size, so a module that measures the element and writes the bitmap
    // back multiplies itself on every resize tick (measured in the running app:
    // a 1000×742 area ended up with a 25973×13013 bitmap, ≈1.3 GB, and the layer
    // then covered a quarter of the screen with nothing drawable in the visible
    // part). The percentages pin the CSS box to the containing block so the
    // bitmap can never feed back into layout.
    '[' + RIPPLE_ATTR + '] {',
    '  position: absolute;',
    '  inset: 0;',
    '  width: 100%;',
    '  height: 100%;',
    '  z-index: -1;',
    '  display: block;',
    '  pointer-events: none;',
    '}',
    // Only the blank-session card sees through. The workspace-picker variant is
    // excluded by the same attribute-contains form `composerRules()` uses, because
    // it has no data-* hook of its own.
    '[data-conversation-content][data-content-phase="hero"] [data-composer-card] {',
    '  background: color-mix(in srgb, var(--dsw-specific-input-major) 82%, transparent) !important;',
    '}',
  ].join('\n')
}

// ------------------------------------------------------------------- main

/**
 * Build the whole stylesheet for one state.
 *
 * `accentGlow` carries the two palette glow colours, computed by the caller so
 * this module needs no colour maths of its own beyond shadow scaling.
 *
 * An empty string is returned when the theme is switched off: the token layer
 * is released separately by the bridge, and the stylesheet must go with it or
 * the elevation tier and the focus ring would survive a "disabled" theme.
 */
/**
 * Build the stylesheet for one state, deriving everything it needs.
 *
 * This is the entry point callers should use: it keeps the accent's two
 * palette values in step with the glow, so a rule that needs a plain accent
 * colour cannot accidentally receive the translucent glow value.
 *
 * `options.themeModeAvailable` says whether the host theme service is present.
 * It gates the rule that hides the host's light/dark row in 「通用」 — the row
 * this plugin rebuilt as 「主题模式」 on its own page. Hiding it WITHOUT a
 * replacement would leave no way to switch themes, so the two always travel
 * together. It defaults to `true` (the shipped composition declares `theme` as a
 * hard dependency); a host without the service passes `false` and keeps the
 * host row, at the cost of one duplicate-looking section.
 */
export function buildCssFor(state, options) {
  const accent = ACCENT_PRESETS.find(function (entry) { return entry.id === state.accent })
  const light = accent === undefined ? CLAY.light.clay : accent.light
  const dark = accent === undefined ? CLAY.dark.clay : accent.dark
  const available = options === undefined || options.themeModeAvailable === undefined
    ? true
    : options.themeModeAvailable !== false
  // `omitFonts` rides through so the live path can skip the 948 KB static block.
  const omitFonts = options !== undefined && options !== null && options.omitFonts === true
  return buildCss(state, buildGlowOf(state, accent), { light, dark }, available, { omitFonts })
}

/** The accent glow, computed here so `buildCssFor` needs no external helper. */
function buildGlowOf(state, preset) {
  const light = preset === undefined ? CLAY.light.clay : preset.light
  const dark = preset === undefined ? CLAY.dark.clay : preset.dark
  return { light: glowOf(light, 0.25), dark: glowOf(dark, 0.35) }
}

function glowOf(base, alpha) {
  const hex = String(base).replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return base
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
}

export function buildCss(state, accentGlow, accent, themeModeAvailable, options) {
  if (!state.enabled) return ''

  // `omitFonts` is how the LIVE path avoids dragging 948 KB through every
  // settings change. The font block is static and cached (`fontSheet()`), so the
  // browser never needs it inside the rebuilt string: `createStyles().apply()`
  // writes it to its own tag once and asks for the rules alone here.
  //
  // WHY THIS EXISTS. `elevationRules()` interpolates the elevation slider into
  // real declarations, so dragging that one slider genuinely changes the sheet —
  // unlike `warmth`/`radiusScale`, which only move tokens and leave the text
  // byte-identical. With the block embedded, every `input` event rebuilt a
  // 964 KB string and then paid a 948 KB `indexOf` to slice the same block back
  // out. Measured by the repo's performance review: 3.9 ms/step at 800 elements,
  // 10.3 ms at 3,140, **24.4 ms at 9,380 — about a second for one full drag**.
  // Omitting the block removes both the concatenation and the scan; all that is
  // left is composing the ~17 KB of state-dependent rules.
  //
  // The default (`omitFonts` unset) keeps the historical string byte-identical,
  // because the artifact-of-record and `verify` compare against it.
  const withFonts = options === undefined || options === null || options.omitFonts !== true

  const parts = [
    '/* ' + PLUGIN_ID + ' — Claude Design System theme; generated, edit the settings panel */',
  ]
  if (withFonts) parts.push(fontRules())
  parts.push(
    greetingRules(),
    elevationRules(state),
    glowRule(accentGlow),
    selectionRules(accent),
    stockBlueRules(),
    stockNeutralCardRules(),
  )
  // Without the font block the `join` above produces one separator fewer, so the
  // omitted string would differ from "full minus the block" by exactly one
  // `'\n\n'`. Insert that separator explicitly to keep the two forms
  // BYTE-IDENTICAL — `test/styles.test.mjs` asserts it, and the artifact of
  // record plus `verify` compare against the historical text.
  if (!withFonts) parts.splice(1, 0, '')

  // Family order is dynamic, font bytes are not. Resolving these composites on
  // body puts the embedded CJK faces before system fallbacks without touching
  // explicit font preferences, tokens or the static 5 MB @font-face sheet.
  const preferredCjk = preferredCjkStackCss(state.preferThemeCjk)
  if (preferredCjk !== '') parts.push(preferredCjk)

  // Which host rows are replaced by this plugin's own page. This is NOT gated on
  // `refine`: hiding the host's light/dark row without our replacement would
  // leave the preference unreachable, and the replacement lives on the settings
  // page rather than in a refined component. It rides the master switch only.
  const themeMode = themeModeRules(themeModeAvailable !== false)
  if (themeMode !== null) parts.push(themeMode)

  // Layout safety is independent of refinement and retired storage settings.
  // The host owns text scrolling; keep the greeting and dock in normal flow.
  parts.push(newSessionInputRules())

  // The blank-session backdrop. Emitted on the switch alone — NOT inside
  // `refine` — because the layer promotion here is what keeps a mounted canvas
  // from painting over the greeting; the canvas itself is mounted only while
  // this switch is on (lifecycle.js), so rule and layer travel together.
  if (state.heroRipple !== false) parts.push(heroRippleRules())

  // The reference's motion curves are TOKENS, not a look, so they are emitted
  // outside `refine` and outside the `buttonSpring` gate — see
  // `motionTokenRules()`.
  parts.push(motionTokenRules())

  if (state.refine) {
    parts.push(
      focusRules(),
      composerRules(),
      codeRules(),
      messageRules(),
      // B-group replication effects. They were user-verified and are kept
      // unconditionally inside `refine` — no per-item switches.
      messageActionsRules(),
      scrollFadeRules(),
      // Both of the following were user-verified and their comparison switches
      // were REMOVED (docs/replication-toggles.md: a switch exists only while
      // the item is being compared). They are now unconditional inside
      // `refine`, exactly like the B-group above; `refine` itself remains the
      // escape hatch that turns every component rule off at once.
      //
      // Code-artefact details: banner label (Mono 10.5/12/500 uppercase .05em),
      // title reset, the half-pixel banner seam and the 12/16/500 disclosure row.
      codeBlockDetailsRules(),
      // Markdown body: closed hairline table frame, tinted header, restored cell
      // insets, last-row hairline drop, tabular numerals, table code size and the
      // blockquote margin. `markdown.js` marks the wrappers this paints.
      markdownBodyRules(),
      shimmerRules(),
      sidebarRules(),
      overlayRules(),
      scrollbarRules(),
      motionRules(),
      settingsRules(),
    )
  }

  // ---- the solidified replication items: ALWAYS ON -------------------------
  //
  // Every per-item switch is gone. These three were accepted, so per
  // docs/replication-toggles.md the comparison switch is removed and the look
  // stays — the same treatment `codeBlockDetails` and `markdownBody` got above,
  // except that those live inside `refine` and these do not.
  //
  // WHY OUTSIDE `refine`: `refine` is the component-refinement escape hatch, and
  // these three are the plugin's own type and motion vocabulary (footnote
  // typography, the usage numerals, the press curve on our own controls). Losing
  // them when a user distrusts a *component* rule would leave the sheet
  // inconsistent. `enabled` remains the single switch that releases everything.
  parts.push(
    footnoteRules(),
    buttonSpringRules(),
    statTypographyRules(),
  )

  return parts.join('\n\n')
}

export function createStyles({ getState, isThemeModeAvailable }) {
  let active = false

  /** Whether the host theme service exists — gates the host-row hide rule. */
  function themeModeAvailable() {
    return typeof isThemeModeAvailable === 'function' ? isThemeModeAvailable() !== false : true
  }

  /** Create (or re-use) the two plugin-owned `<style>` tags. */
  function ensureTag(id) {
    let tag = document.getElementById(id)
    if (tag === null) {
      tag = document.createElement('style')
      tag.id = id
      tag.dataset.plugin = PLUGIN_ID
      document.head.appendChild(tag)
    }
    return tag
  }

  function removeTag(id) {
    const tag = document.getElementById(id)
    if (tag !== null && tag.parentNode) tag.parentNode.removeChild(tag)
  }

  /**
   * Write the static font sheet once, then the state-dependent rules on every
   * apply.
   *
   * The split lives HERE, not in `buildCss`: the exported builder still emits
   * the full byte-identical sheet (tests and tools/verify.mjs assert its
   * content), and `apply()` asks for the rules ALONE via
   * `omitFonts: true` — it never builds the font block and then slices it back
   * out. The two forms are byte-identical to "full minus the block" (asserted in
   * `test/styles.test.mjs`), so the cheap path cannot drift from the recorded
   * one. The fonts tag is only created once per activation; after that its
   * textContent is never touched — not even when the master switch turns the
   * theme off. Removing the faces would make every glyph fall back to a system
   * font and force a full-document font re-layout, which is far more expensive
   * than keeping the unreferenced rules around. Only `teardown()` removes the
   * font tag.
   */
  function apply() {
    if (!active) return
    if (typeof document === 'undefined' || !document.head) return

    // ASK FOR THE RULES ONLY. The static font block lives in its own tag and is
    // built once per page, so there is nothing to gain from having it embedded
    // here — and, for the one slider whose rules genuinely change (elevation),
    // plenty to lose: with it embedded every `input` event rebuilt a 964 KB
    // string and then scanned 948 KB to cut the same block back out (measured
    // 24.4 ms/step at 9,380 elements, ≈1 s per drag).
    const rules = buildCssFor(getState(), {
      themeModeAvailable: themeModeAvailable(),
      omitFonts: true,
    })

    // Master switch off: empty the rules tag, but LEAVE THE FONTS TAG ALONE.
    //
    // THIS IS A PERFORMANCE RULE, NOT A COSMETIC ONE. Removing the six
    // @font-face rules (~880 KB of inlined faces) makes every glyph in the
    // document fall back to a system font, which forces a full-document font
    // re-layout — that teardown was the lag the user felt when switching the
    // theme OFF. With the theme disabled the family tokens revert to the host
    // defaults, so the @font-face rules are simply UNREFERENCED: keeping them
    // costs nothing visually and avoids the global reflow. Only `teardown()`
    // (real dispose) removes the font tag.
    if (rules === '') {
      const empty = document.getElementById(STYLE_ID)
      if (empty !== null && empty.textContent !== '') empty.textContent = ''
      return
    }

    const fontTag = document.getElementById(FONT_STYLE_ID)
    if (fontTag === null) {
      const created = ensureTag(FONT_STYLE_ID)
      created.textContent = fontSheet()
    }

    const rulesTag = ensureTag(STYLE_ID)
    if (rulesTag.textContent !== rules) rulesTag.textContent = rules
  }

  function teardown() {
    active = false
    if (typeof document === 'undefined' || !document.head) return
    removeTag(FONT_STYLE_ID)
    removeTag(STYLE_ID)
  }

  return {
    apply,
    teardown,
    activate() { active = true },
    get active() { return active },
  }
}

export { RADII }

