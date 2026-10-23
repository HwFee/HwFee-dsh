import { PLUGIN_ID, STYLE_ID, FONT_STYLE_ID } from './constants.js'
import {
  SHADOWS, CODE_SURFACE, CODE_BORDER, CODE_BANNER, CODE_TOKENS, INLINE_CODE,
  EASING, CDS_DURATIONS, RADII, ACCENT_PRESETS, CLAY,
} from './palette.js'
import { scaleShadow } from './tokens.js'
import { fontCss, preferredCjkStackCss } from './fonts.js'
import { GREETING_DISPLAY, WEIGHTS } from './typography.js'
import { RIPPLE_ATTR } from './ripple.js'
import { markdownScopeRules } from './markdown-scope.js'
import { toolChromeRules } from './tool-chrome-styles.js'

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
    // Dark mode carries a wider, stronger glow (`css:340`: 8px blur, 2px
    // spread) because the same ring reads weaker on the near-black canvas.
    'body[data-ds-dark-theme] :focus-visible:not(:read-write) {',
    '  box-shadow: inset 0 0 0 1px var(--dsw-alias-bg-base), 0 0 0 1.5px var(--dsw-focus-ring-color), 0 0 8px 2px var(--dsw-focus-ring-glow) !important;',
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
    '  transition: box-shadow 220ms ' + EASING.swift + ';',
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
    '/* ---- code blocks: Claude app surfaces and syntax palette ----------- */',
    // Values come from the installed Claude desktop app (2.42304.2):
    // `app/resources/ion-dist/js/c5d464fa3-Dlv8sG-j.js` defines `claude-light`
    // and `claude-dark`. Shiki emits `color: var(--shiki-token-*)`, so the
    // host's variables are remapped on the block; the light block is WHITE on
    // the warm canvas, the dark block is #1a1a19 (not the reconstruction's
    // #0d0d0c). See docs/cds-spec.md §8.5 for the extracted table.
    '.md-code-block {',
    '  --dsl-code-block-background: ' + CODE_SURFACE.light + ';',
    '  --dsl-code-block-banner-background-color: ' + CODE_BANNER.light + ';',
    '  --dsl-code-block-border-radius: var(--dsw-radius-lg);',
    '  --dsl-code-block-banner-font: ' + codeBannerFont(WEIGHTS.medium.light) + ';',
    '  --shiki-foreground: ' + CODE_TOKENS.light.foreground + ';',
    '  --shiki-background: ' + CODE_SURFACE.light + ';',
    '  --shiki-token-constant: ' + CODE_TOKENS.light.number + ';',
    '  --shiki-token-string: ' + CODE_TOKENS.light.string + ';',
    '  --shiki-token-comment: ' + CODE_TOKENS.light.comment + ';',
    '  --shiki-token-keyword: ' + CODE_TOKENS.light.keyword + ';',
    '  --shiki-token-parameter: ' + CODE_TOKENS.light.parameter + ';',
    '  --shiki-token-function: ' + CODE_TOKENS.light.function + ';',
    '  --shiki-token-string-expression: ' + CODE_TOKENS.light.string + ';',
    '  --shiki-token-punctuation: ' + CODE_TOKENS.light.punctuation + ';',
    '  --shiki-token-link: ' + CODE_TOKENS.light.number + ';',
    '  border-radius: var(--dsw-radius-lg) !important;',
    '  background: ' + CODE_SURFACE.light + ' !important;',
    '  border: 0 !important;',
    '  box-shadow: inset 0 0 0 1px ' + CODE_BORDER.light + ' !important;',
    '  overflow: hidden;',
    '  position: relative;',
    '  margin: 16px 0 !important;',
    '}',
    // The host's pre padding is 6px top / 20px bottom / 22px sides, which pins
    // the code to the top edge and leaves a band below it.
    //
    // 8 / 8 / 17.2 / 72.2 — the reverse-engineered inset, in the table's
    // top / bottom / left / right order.
    //
    // LEFT is 10px + 1ch (7.2px at the 12px code size): the reference's code
    // starts one character past the block's own edge, so the first glyph lines
    // up with the text column rather than the frame.
    //
    // RIGHT IS THE TOOLBAR'S RESERVATION, and it is NOT a padding anyone chose
    // by eye. The rail is absolutely positioned over the code, so the block has
    // to stop short of it or a long line runs underneath the button. The
    // reference's rail is at `right: 7px` with 24px buttons, 3px gaps and 4px
    // side padding: 24n + 3(n-1) + 12 + 2, i.e. 65px of rail for TWO buttons,
    // plus 1ch of breathing room = 72.2px.
    //
    // OUR RAIL SHIPS THE COPY BUTTON ALONE (the host's wrap toggle is hidden by
    // the rule above, and `display: none` takes it out of the flex row, so the
    // rail is one button wide). This is therefore the ONE-BUTTON value:
    // 24*1 + 3*0 + 12 + 2 = 38px of rail, + 1ch = 45.2px. Using 72.2 here would
    // reserve 27px of empty gutter for a control that does not exist.
    //
    // RESIDUAL, stated rather than hidden: ours is an 18px button inside an
    // 18px box at `right: 8px`, not a 24px button at `right: 7px`, so the real
    // rail occupies 26px and this reserves 45.2px — 19.2px more than strictly
    // needed. That is deliberate: the table's constant is the reference's, and
    // keeping the table's arithmetic (rail width + 1ch) means the day a second
    // button returns, only this one number changes to 72.2.
    '.md-code-block pre,',
    '.md-code-block pre[class*="shiki"] {',
    '  padding: 8px 45.2px 8px 17.2px !important;',
    '}',
    'body[data-ds-dark-theme] .md-code-block {',
    '  --dsl-code-block-background: ' + CODE_SURFACE.dark + ';',
    '  --dsl-code-block-banner-background-color: ' + CODE_BANNER.dark + ';',
    '  --dsl-code-block-banner-font: ' + codeBannerFont(WEIGHTS.medium.dark) + ';',
    '  --shiki-foreground: ' + CODE_TOKENS.dark.foreground + ';',
    '  --shiki-background: ' + CODE_SURFACE.dark + ';',
    '  --shiki-token-constant: ' + CODE_TOKENS.dark.number + ';',
    '  --shiki-token-string: ' + CODE_TOKENS.dark.string + ';',
    '  --shiki-token-comment: ' + CODE_TOKENS.dark.comment + ';',
    '  --shiki-token-keyword: ' + CODE_TOKENS.dark.keyword + ';',
    '  --shiki-token-parameter: ' + CODE_TOKENS.dark.parameter + ';',
    '  --shiki-token-function: ' + CODE_TOKENS.dark.function + ';',
    '  --shiki-token-string-expression: ' + CODE_TOKENS.dark.string + ';',
    '  --shiki-token-punctuation: ' + CODE_TOKENS.dark.punctuation + ';',
    '  --shiki-token-link: ' + CODE_TOKENS.dark.number + ';',
    '  background: ' + CODE_SURFACE.dark + ' !important;',
    '  box-shadow: inset 0 0 0 1px ' + CODE_BORDER.dark + ' !important;',
    '}',
    // The real app has NO header strip: the copy control floats in the
    // top-right and appears on hover, over the code itself. The host always
    // renders a banner, so collapse its wrapper and keep only the actions
    // (copy / wrap) as an overlay; the language label is hidden. This keeps
    // the copy button functional instead of deleting it with the header.
    '.md-code-block > [class*="bannerWrap"],',
    '.md-code-block > * > [class*="bannerWrap"] {',
    '  position: static !important;',
    '  background: transparent !important;',
    '  border: 0 !important;',
    '  padding: 0 !important;',
    '  min-height: 0 !important;',
    '}',
    // GLOBAL HOVER GATE. This used to be scoped to two containers — the
    // markdown block and the tool row — which meant every OTHER surface that
    // renders a banner (an artifact preview, a nested card, a surface the host
    // adds later) showed its copy control permanently. The user reported
    // exactly that twice. A control that is only ever revealed by hover is a
    // property of the CONTROL, not of the container it happens to sit in, so
    // the hide rule is now unconditional and the reveal is a whitelist of the
    // containers we know: hovering the code surface.
    'body[data-ds-dark-theme] [data-conversation-content] {',
    '  --cds-card-surface: #1a1a19;',
    '}',
    '[data-code-block-banner] {',
    '  opacity: 0 !important;',
    '  pointer-events: none !important;',
    '  transition: opacity var(--cds-copy-reveal, 120ms) ' + EASING.swift + ';',
    '}',
    // HOVER ONLY. A focus-within member (on the block, the code-wrap or the
    // tool slot) kept the rail painted after a row was clicked open, until the
    // user clicked elsewhere, because expanding a row moves focus into it.
    // Focus must not reveal the banner, including focus retained by a copy
    // button after clicking it. Pointer exit always hides the controls.
    '.md-code-block:hover [data-code-block-banner],',
    '[data-code-wrap]:hover [data-code-block-banner],',
    '[data-slot="tool.call.toolview"]:hover [data-code-block-banner] {',
    '  opacity: 1 !important;',
    '  pointer-events: auto !important;',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  [data-code-block-banner] {',
    '    transition: none;',
    '  }',
    '}',
    '.md-code-block [data-code-block-banner] {',
    '  position: absolute !important;',
    '  top: 8px !important;',
    '  right: 8px !important;',
    '  left: auto !important;',
    '  width: auto !important;',
    '  height: auto !important;',
    '  margin: 0 !important;',
    '  padding: 0 !important;',
    '  background: transparent !important;',
    '  border: 0 !important;',
    // The opacity / pointer-events / transition pair is NOT repeated here: the
    // global gate above owns it, so there is exactly one place to change.
    '  z-index: 2;',
    '}',
    '.md-code-block [data-code-block-banner] > :first-child {',
    '  display: none !important;',
    '}',
    // (The button's colour used to be pinned here with `!important`. It now
    // comes from the shared `--cds-copy-ink` pair declared in
    // `toolRowsRules()`, so the tool-row rail, the markdown banner and the
    // shell card's command box cannot drift apart again. Keeping a second,
    // `!important` colour here would silently win and defeat that.)
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
    // Plain (untokenised) code takes the same foreground the Shiki theme does;
    // tokenised spans carry their own inline `color: var(--shiki-token-*)`.
    '  color: var(--shiki-foreground) !important;',
    '}',
    // Inline code stays a light chip: it sits inside body text, not in a
    // terminal, so a filled block would punch holes in the prose.
    //
    // Geometry from the reference's typography table (`v1-01:447`): 1px line,
    // 3px radius, 1px 4px padding. The line is drawn as an inset ring rather
    // than a border so the chip keeps the line box it sits in — same 1px edge,
    // no 2px growth that would shift the prose around it.
    '[class*="markdown"] :not(pre) > code:not(:where(h1, h2, h3, h4, h5, h6) code) {',
    // The host's own rule ends with `font-size: .875em !important`, which made
    // the chip 12.25px at the default body size. The reference/real app says
    // 12px, and the code-size setting should drive it, so pin the token size.
    // Heading code keeps the host's `font: inherit` (hence the :not above).
    '  font-size: var(--dsw-font-markdown-code-font-size) !important;',
    // Chip geometry measured from the app: alpha-1 fill, half-pixel alpha-3
    // edge, 4px radius. The LETTERS ARE RED: Claude's prose rule colours
    // `code:not(pre code)` with `--cds-text-danger` (red-600 `#8e2626` light /
    // red-300 `#ec7e7e` dark), and a transcript screenshot measures every chip
    // at exactly that value against `#0b0b0b` body ink. Leaving `color` unset
    // — what this rule did before — made the chip inherit the body ink and
    // read as plain black, which is the difference the user spotted.
    '  color: ' + INLINE_CODE.light.ink + ' !important;',
    '  background-color: ' + INLINE_CODE.light.background + ' !important;',
    '  border: .5px solid ' + INLINE_CODE.light.border + ' !important;',
    '  border-radius: 4px !important;',
    '  padding: 1px 4px !important;',
    '  box-shadow: none !important;',
    '}',
    'body[data-ds-dark-theme] [class*="markdown"] :not(pre) > code:not(:where(h1, h2, h3, h4, h5, h6) code) {',
    '  color: ' + INLINE_CODE.dark.ink + ' !important;',
    '  background-color: ' + INLINE_CODE.dark.background + ' !important;',
    '  border-color: ' + INLINE_CODE.dark.border + ' !important;',
    '}',
    // Terminal line-heights are pinned in px by the host (22px for the chat
    // command block, 18px for a tool row). Add the code-size delta so raising
    // the code font does not squeeze the leading shut. `[data-terminal]` is a
    // published hook; the tool row only offers the stable `terminalBody`
    // segment of its salted class (docs/host-hooks.md).
    '[data-terminal] {',
    '  --dsl-terminal-line-height: 22px !important;',
    '}',
    '[class*="terminalBody"] {',
    '  --dsl-terminal-line-height: 18px !important;',
    '}',
    // Matrix line 446: code blocks carry `tabular-nums` so digits keep their
    // column while diffs scroll. It is a property, not a font token, so it
    // lives here with the rest of the block's treatment.
    '.md-code-block pre,',
    '.md-code-block code {',
    '  font-variant-numeric: tabular-nums;',
    '  font-feature-settings: "tnum" 1;',
    '}',
    // ---- ALWAYS WRAP ------------------------------------------------------
    // The host ships a per-block "wrap lines" toggle whose state lives in
    // storage and defaults to OFF, so every long line starts life in a
    // horizontal scroller. The theme's decision is the opposite: code wraps by
    // default and the toggle is gone. `pre-wrap` is forced here rather than
    // flipped in the host store because the host writes the flag as an
    // attribute on the block, and a CSS default must also cover blocks that
    // re-render from a stale stored preference.
    '.md-code-block pre,',
    '.md-code-block pre[class*="shiki"],',
    '.md-code-block code {',
    '  white-space: pre-wrap !important;',
    '  overflow-wrap: anywhere;',
    '  word-break: break-word;',
    '}',
    // EVERY OTHER <pre> IN A CODE SURFACE. The rule above only reaches the
    // markdown block; the read card's expanded body, the terminal card and the
    // generic payload render bare `<pre>`/`<code>` outside it, so a long line
    // there still started life in a horizontal scroller. This is the same
    // decision applied to the rest of the surface, scoped to the places the
    // host renders code rather than to every `pre` on the page (a diff and a
    // terminal both set their own `white-space`, and a blanket rule would also
    // catch prose widgets that happen to use `pre` for alignment).
    '[data-slot="tool.call.toolview"] pre,',
    '[data-slot="tool.call.toolview"] pre code,',
    '[data-read] pre,',
    '[data-diff] pre,',
    '[class*="_terminalBody"] pre,',
    '[class*="_ioText"],',
    '.md-code-block pre code {',
    '  white-space: pre-wrap !important;',
    '  overflow-wrap: anywhere !important;',
    '  word-break: break-word;',
    '}',
    // The wrap toggle is the only banner button carrying `aria-pressed`; the
    // copy button has none. Keying on that attribute keeps the rule
    // language-independent (the aria-label is localised).
    '[data-code-block-banner] button[aria-pressed] {',
    '  display: none !important;',
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
/**
 * The UI font role: chrome follows `--dsw-font-family-ui`, conversation text
 * keeps `--dsw-font-family`.
 *
 * WHY A RULE IS NEEDED AT ALL. The host has three font roles (`text`, `code`,
 * `terminal`) and one family property, `--dsw-font-family`, which every element
 * inherits from `body`. So today a settings button and a paragraph share one
 * family, and a font picker cannot separate them. `typography.js` publishes a
 * fourth role (`--dsw-font-family-ui`) whose default FALLS BACK to
 * `--dsw-font-family`, so with nothing set this rule is a no-op and the UI keeps
 * tracking the text role.
 *
 * THE SPLIT. `body` takes the UI role; the conversation CONTENT takes the text
 * role back. Without the second half, setting a UI family would also change
 * every reply. The content scope is spelled with the host's own
 * `[data-conversation-content]` hook — a data attribute it renders deliberately
 * — rather than a CSS-Modules class, which is salted per build.
 *
 * Only the FAMILY moves. Sizes, weights and line heights stay with the host's
 * own tokens, because a UI family that also changed the scale would fight the
 * "font size" setting next to it.
 *
 * @returns {string} the rules
 */
function uiFontRules() {
  return [
    // Chrome. `body` is where every control inherits from, so this one
    // declaration reaches the sidebar, the settings panel, menus and buttons
    // without naming any of them.
    'body {',
    '  font-family: var(--dsw-font-family-ui) !important;',
    '}',
    // Conversation content takes the TEXT role back, so the two can differ.
    // `[data-conversation-content]` is the host's own marker for the message
    // column (docs/host-hooks.md §1.4), and the selector is repeated on its
    // descendants because the host sets `font` (a shorthand, family included) on
    // markdown elements further in.
    '[data-conversation-content],',
    '[data-conversation-content] :not(code):not(pre):not(kbd):not(samp) {',
    '  font-family: var(--dsw-font-family) !important;',
    '}',
  ].join('\n')
}

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
 * Tool rows: one inset card, a boxed request, a flowing response.
 *
 * THE REFERENCE. Claude Code desktop renders a tool call as a plain description
 * row with a chevron, and — when expanded — one inset card. Inside that card a
 * shell call shows the command as a boxed code surface prefixed with `$`, and
 * then its output as BARE text with no label and no second frame (the
 * transcript renders the result through `Pw bare`). File calls (read / write /
 * edit) show their body in the same card without the markdown block's language
 * banner.
 *
 * WHAT THE HOST DRAWS INSTEAD. Tools without a registered view fall back to the
 * generic card: a two-column grid with `输入` / `输出` labels, a divider, and the
 * raw argument JSON inside the same box as the result. The labels and the
 * divider are chrome the reference never draws, so this block removes them and
 * re-frames what is left: the request becomes the bordered code block, the
 * response becomes flowing secondary text under it.
 *
 * HOOKS. `[data-slot="tool.call.toolview"]` and the row's `data-tool` /
 * `data-state` are host-published. The card's own class names are CSS-Modules
 * with a per-build salt, so they are matched by their stable local segment
 * (`[class*="_ioCard"]`) — the same tolerance the stylesheet already uses for
 * `bannerWrap` and `terminalBody`.
 *
 * @returns {string} the rules
 */
function toolRowsRules() {
  return [
    '/* ---- tool rows: inset card, boxed request, flowing response --------- */',
    // CODE GETS ITS MONOSPACE BACK. `uiFontRules()` pins the TEXT family on
    // every descendant of the conversation with `!important` (excluding
    // `code`/`pre`/`kbd`/`samp`), but every code surface in a tool card is
    // built out of plain DIVs:
    //
    //   diff rows   ._body_17vb8_5 { font: var(--dsw-font-markdown-code-block) }
    //               ._line_17vb8_13 { … }            ← a div
    //   read rows   ._body_1pq26_79 { font: var(--dsw-font-markdown-code-block) }
    //               ._content_1ay0u_16 { … }         ← a div
    //
    // A plain declaration loses to that `!important`, so those cards rendered
    // in the TEXT family while the markdown block beside them stayed
    // monospace — the "some code is Mono, some is Sans" report. This rule
    // matches the `!important` and sits later in the sheet, so it wins without
    // touching prose. It lives here (not in `uiFontRules`) because that
    // function's output is inside a byte-pinned baseline slice.
    // SPECIFICITY IS LOAD-BEARING. The prose rule this fights is
    // `[data-conversation-content] :not(code):not(pre):not(kbd):not(samp)`
    // (0,2,1) with `!important`; a bare `[data-diff] *` is (0,1,0) and loses
    // even with `!important`. Measured live before this change: the diff rows
    // computed to anthropic-sans. Prefixing with the conversation hook puts
    // these at (0,2,0)+ and lets the code family win.
    '[data-conversation-content] [data-diff], [data-conversation-content] [data-diff] *,',
    '[data-conversation-content] [data-read], [data-conversation-content] [data-read] *,',
    '[data-conversation-content] [data-code-wrap], [data-conversation-content] [data-code-wrap] *,',
    // The theme's own diff card is NOT `[data-diff]` (it deliberately avoids
    // that hook so the host's counter never double-numbers it), so it needs to
    // be named here or it inherits the TEXT family from the rule above and the
    // code inside it renders in prose type.
    '[data-conversation-content] [data-cds-diffcard], [data-conversation-content] [data-cds-diffcard] *,',
    '[data-slot="tool.call.toolview"] pre, [data-slot="tool.call.toolview"] pre *,',
    '.md-code-block, .md-code-block * {',
    '  font-family: var(--ds-font-family-code) !important;',
    '}',
    // The row seat. Our own `run_shell` view and the host's rows share it, so
    // the group's rhythm does not change when a tool gets its own card.
    '[data-slot="tool.call.toolview"] [data-disclosure-row] {',
    '  min-height: 24px;',
    '}',
    // THE ROW OWNS THE TRAILING CORNER. The copy rail below is absolutely
    // positioned, so it resolves against the nearest POSITIONED ancestor — and
    // that used to be the payload card, not the row. Two host rules make the
    // card positioned: `._card_1pq26_1 { position: relative }` (the read/diff
    // card root, `.repro/css/web-frontend-index.pretty.css:2527`) and
    // `._block_7gxqk_4 { position: relative }` (the `.md-code-block` root,
    // `:2793`). Declaring the row `relative` alone therefore changed nothing:
    // the card, being nearer, still won.
    //
    // So the payload card is demoted to `static` inside a tool row and the row
    // becomes the containing block. That is what lets ONE control sit on the
    // row's own 24px line for read, write and edit alike instead of at three
    // different x-positions decided by each card's own inset (`_bodyWrap` is
    // pushed 22px right, so a card-anchored rail drifted away from the row
    // text).
    //
    // ONLY THE TWO PAYLOAD CARDS ARE DEMOTED, deliberately. `_card_1pq26_1`
    // wraps `[data-read]` and `[data-diff]` and nothing else, and the payload
    // card is the one whose top edge IS the top of the expanded seat. A
    // `.md-code-block` is NOT demoted: one can sit hundreds of pixels down
    // inside a long `details` body, and anchoring its rail to the row would
    // detach the copy button from the block it copies. Those blocks keep their
    // own `position: relative` — and their rail keeps the `top: 8px / right:
    // 8px` that `codeRules()` sets with `!important`, which is exactly why
    // that rule is untouched here.
    //
    // Nothing is lost by demoting the payload card: the only absolutely
    // positioned descendant it has is the banner itself, and the frame rule's
    // `overflow: hidden` still clips the in-flow body exactly as before — an
    // element whose containing block is outside the clipper is not clipped by
    // it, which is precisely the behaviour wanted for the rail.
    '[data-slot="tool.call.toolview"] [data-tool] {',
    '  position: relative;',
    '}',
    '[data-slot="tool.call.toolview"] [data-tool] [data-read],',
    '[data-slot="tool.call.toolview"] [data-tool] [data-diff] {',
    '  position: static;',
    '}',
    // RESERVE THE RAIL'S CELL on the disclosure line, or a long summary runs
    // under the button.
    //
    // WHY NOT `:has([data-code-block-banner])`. That is the honest selector, but
    // `thememode.test.mjs` pins that EVERY `:has()` in this sheet is scoped to
    // the General settings slot — the pin that stops a future hide rule from
    // blanking a settings page — and it is worth more than a selector nicety
    // (the same trade-off `settingsRules()` documents at the end of its list).
    //
    // `data-variant` is the next-best exact hook: the host renders it from JSX
    // on the SAME element that carries `data-tool` (`"data-variant": variant`,
    // whose value comes from `TOOL_VARIANTS[toolName] ?? "others"`). `read`,
    // `write` and `edit` are the three variants whose expanded body is a
    // `[data-read]` / `[data-diff]` payload card — the only cards that own a
    // `[data-code-block-banner]`.
    //
    // IT OVER-MATCHES SLIGHTLY, and that is accepted. `TOOL_VARIANTS` also maps
    // `read_image`, `web_fetch` and the two `cordis_*_inspect` tools onto
    // `read`; those render an image / web / details body with no banner, so they
    // get 30px of extra trailing reservation they do not need — a summary that
    // ellipsises 30px early, on a row whose summary is a path. Buying exactness
    // here would cost the `:has()` pin above, which guards a much worse failure
    // (a hidden settings page). `bash` is NOT included: it renders a
    // TerminalBlock whose copy control lives in its own header
    // (`_header_8z71b_32`), so it has no banner to reserve for.
    '[data-slot="tool.call.toolview"] [data-tool][data-variant="read"] [data-disclosure-row],',
    '[data-slot="tool.call.toolview"] [data-tool][data-variant="write"] [data-disclosure-row],',
    '[data-slot="tool.call.toolview"] [data-tool][data-variant="edit"] [data-disclosure-row] {',
    '  padding-right: 30px;',
    '}',
    // The expanded seat is inset under the row (reference: `mx-2.5 mt-1`).
    //
    // THESE ARE THE TABLE'S MARGINS, NOT AN ESTIMATE. `docs/tool-cards-*.md`
    // reach the read/write/edit content inset as margin + padding:
    //   10px horizontal + 12px padding = the 22px left/right inset
    //    4px top        + 12px padding = the 16px top inset
    //    8px bottom     + 12px padding = the 20px bottom inset
    // so the MARGIN half belongs here and the 12px half belongs on the frame
    // below. It was `4px 0 8px 22px`, i.e. the whole 22px paid as margin on one
    // side only: the cards were flush against the row's right edge and 26px in
    // on the left once the host's own 4px frame margin was added, so every
    // payload card sat visibly off-centre under its row.
    '[data-slot="tool.call.toolview"] [class*="_bodyWrap"] {',
    '  margin: 4px 10px 8px 10px;',
    '}',
    // The generic fallback: kill the labelled grid, keep two stacked blocks.
    '[data-slot="tool.call.toolview"] [class*="_ioCard"] {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 10px;',
    '  margin: 0;',
    '  padding: 0;',
    '  border: 0;',
    '  background: none;',
    '  font: 12px/1.6 var(--ds-font-family-code, ui-monospace, monospace);',
    '}',
    '[data-slot="tool.call.toolview"] [class*="_ioSection"] {',
    '  display: block;',
    '  max-height: none;',
    '  padding: 0;',
    '  overflow: visible;',
    '}',
    // The request: the reference's boxed code surface.
    '[data-slot="tool.call.toolview"] [class*="_ioSection"]:first-of-type {',
    '  max-height: 220px;',
    '  padding: 10px 12px;',
    '  overflow: auto;',
    // Same double-ring hairline as the command card: a 0.5px border cannot be
    // carved, but two inset shadows can. See the git-bash card for the anatomy.
    '  position: relative;',
    '  border-radius: var(--dsw-radius-lg);',
    '  background: var(--dsw-alias-markdown-code-block);',
    '  color: var(--dsw-alias-label-primary);',
    '}',
    // The response: bare flowing text, capped instead of pushing the page.
    '[data-slot="tool.call.toolview"] [class*="_ioSection"]:last-of-type {',
    '  max-height: 280px;',
    '  overflow: auto;',
    '  color: var(--dsw-alias-label-secondary);',
    '}',
    '[data-slot="tool.call.toolview"] [class*="_ioLabel"],',
    '[data-slot="tool.call.toolview"] [class*="_ioDivider"] {',
    '  display: none;',
    '}',
    '[data-slot="tool.call.toolview"] [class*="_ioText"] {',
    '  white-space: pre-wrap;',
    '  overflow-wrap: anywhere;',
    '}',
    // Diff and read bodies are line ROWS, not a <pre>: the host writes each
    // line into its own element with `white-space: pre`, so the block-level
    // `pre-wrap` above never reaches them and long lines are clipped at the
    // card edge. `[data-code-wrap]` is the host's own wrap state on those
    // blocks; the theme wraps regardless of the stored preference.
    '[data-code-wrap] [class*="_line_"] {',
    '  min-width: 0;',
    '  white-space: pre-wrap !important;',
    '  overflow-wrap: anywhere !important;',
    '}',
    // ---- the read card's number column --------------------------------
    //
    // THE HOST REFERENCES A TOKEN IT NEVER DECLARES. Its read module is
    //
    //   ._gutter_1ay0u_7 { flex: none; width: var(--dsl-read-gutter);
    //                      margin-right: 12px; text-align: right; … }
    //   ._expand_1ay0u_29 { padding: 0 0 0 calc(var(--dsl-read-gutter) + 12px); … }
    //
    // and `--dsl-read-gutter` appears nowhere in the shipped sheet's
    // declarations — only in those two references. An undefined custom property
    // makes the whole declaration invalid at computed-value time, so the
    // gutter's `width` and the expand button's `padding-left` are both DROPPED:
    // the number column collapses to its content width and the expander loses
    // its indent. That is a real chunk of the "the read panel looks too big /
    // misaligned" impression.
    //
    // The reference's own gutter is a 3ch number cell with 1ch of inner pad
    // (`[data-gutter-buffer] { padding-left: 2ch; padding-right: 1ch }` plus
    // `:before { min-width: 3ch }`). 4ch holds that cell at our 13px code size
    // and leaves the 12px margin the host already applies.
    '[data-slot="tool.call.toolview"] [data-read] {',
    '  --dsl-read-gutter: 4ch;',
    '}',
    // The read rows are `min-height: 1lh` with a themed 19px leading; pinning
    // the line box keeps a wrapped row from growing a second leading's worth of
    // slack, which is what made the card look padded out below its content.
    '[data-slot="tool.call.toolview"] [data-read] [class*="_line_"] {',
    '  line-height: 16px !important;',
    '}',
    // The diff body is a GRID whose implicit column sizes to the widest line's
    // max-content, so a long line still stretches the column past the card even
    // when the line itself may wrap. Pin the column to the card width.
    '[data-slot="tool.call.toolview"] [data-diff] > [class*="_body_"] {',
    '  grid-template-columns: minmax(0, 1fr);',
    // FULL BLEED. The reference's diff rows run edge to edge inside the card —
    // the tint behind a changed line reaches the frame on both sides — so the
    // body carries no inline padding and each line supplies its own inset.
    '  padding: 0;',
    // THE TWO NUMBER COUNTERS LIVE ON THIS BODY. `-old` is not decoration: the
    // reference's unified view shows the NEW number and falls back to the OLD
    // one on a deleted row (`docs/tool-cards-diff.md` §2.4), which one counter
    // cannot express — a deletion must not advance the new-file numbering.
    // Both start at 0 here, so a card that knows nothing about its file numbers
    // hunk-relative lines; `diffnumbers.js` overwrites the seeds in place when
    // the card publishes a start (below).
    '  counter-reset: cds-diff-line 0 cds-diff-line-old 0;',
    // THE SEED OFFSETS ARE DECLARED HERE, AT 0, and overwritten inline by the
    // marker. Two reasons this is a declaration and not just a `var(…, 0)`
    // fallback: `tools/check-tokens.mjs` requires every `--cds-*` the sheet
    // READS to be declared IN the sheet (a fallback does not satisfy it, because
    // a fallback can hide a renamed token forever), and an inline custom
    // property wins over this declaration, so the marker needs no `!important`.
    // With no start published these are the values that are used: offset 0 means
    // the first row prints 1.
    '  --cds-diff-reset: 0;',
    '  --cds-diff-old-reset: 0;',
    '}',
    // A KNOWN START SEEDS THE COUNTER AT THE FILE'S LINE. The module writes
    // `data-cds-diff-start` plus `--cds-diff-reset` (= start − 1, because the
    // row increments on top of the seed) onto the body — for a card that is one
    // contiguous region — or onto each segment's FIRST ROW for a card whose
    // hunks are separated by a `⋯` row, in which case `counter-reset` on a row
    // re-seeds the counter for that row and every following sibling, which is
    // exactly a segment. Both carriers are matched here because they are the
    // same declaration.
    //
    // The host publishes no such attribute today (its `DiffBlock` renders only
    // `data-diff` and `data-code-wrap`), so this rule is inert on the shipped
    // build and the seeds above stand. That is the degradation, and it is
    // honest: row numbers that restart at 1 rather than file numbers invented
    // from nothing.
    '[data-slot="tool.call.toolview"] [data-diff] [data-cds-diff-start] {',
    '  counter-reset: cds-diff-line var(--cds-diff-reset, 0) cds-diff-line-old var(--cds-diff-old-reset, 0);',
    '}',
    // NO PATH LINE IN THE CARD. The tool row above it already names the file
    // (`Edit .work\capture-rows.mjs 1KB +2 -1`), and the read tool's own row
    // does the same, so the card's first line repeated it verbatim. The host
    // renders the path as the first `_line_` of the body; hiding it also keeps
    // it out of the number counter below, which is what a body of code rows
    // expects.
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_path_"],',
    '[data-slot="tool.call.toolview"] [data-read] [class*="_path_"] {',
    '  display: none !important;',
    '}',
    // THE 3px GUTTER BAR IS *NOT* IN THE TRANSCRIPT CARD. The reference's diff
    // component can paint one (`data-indicators="bars"`), but the sheet the app
    // actually injects into a transcript diff is the plain one: a tinted row and
    // a `+`/`-` glyph, no stripe. The host adds
    // `box-shadow: inset 3px 0 0 <state>` to every changed row, which is the
    // red/green rule down the left edge; clearing it is the whole fix.
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_add_"],',
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_del_"] {',
    '  box-shadow: none !important;',
    '}',
    // THE WASH IS STRONGER THAN THE HOST'S. The reference mixes the line
    // background with 12% of the diff ink (`color-mix(in lab, var(--diffs-bg)
    // 88%, var(--diffs-addition-base))`); the host's token is 10%/8% alpha over
    // the card, which reads as a hint rather than a block. Re-mix at the
    // reference's ratio from the theme's own state colours, so dark mode
    // follows without a second pair.
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_add_"] {',
    '  background-color: var(--cds-bg-git-added) !important;',
    '}',
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_del_"] {',
    '  background-color: var(--cds-bg-git-removed) !important;',
    '}',
    // ---- the line-number gutter ------------------------------------------
    //
    // GEOMETRY, FROM THE REFERENCE'S OWN SHEET (`c49d7f557-*.js`):
    //   [data-gutter-buffer] { padding-left: 2ch; padding-right: 1ch }
    //   :before { min-width: var(--diffs-min-number-column-width, 3ch) }
    // and a changed line's NUMBER takes the diff ink:
    //   &[data-line-type="change-addition"]:where([data-column-number]) {
    //     color: var(--diffs-fg-number-addition-override, var(--diffs-addition-base)) }
    // …which is why an added line's number is green and a removed one's is red.
    //
    // The host renders no gutter element, so the counter below fills that cell:
    // 6ch of padding-left holds 2ch pad + 3ch digits + 1ch pad, and the number
    // is drawn right-aligned inside it in the line's own ink.
    //
    // GEOMETRY IS EVERY ROW; COUNTING IS ONLY CODE ROWS. All five of the host's
    // row kinds carry `_line_` (`className: de(Nn.line, F8[kind])`, kinds
    // `path|del|add|context|gap`), so the inset below must keep covering them
    // all — the `⋯` gap row is visible and would jump left without it. But two
    // kinds are SEPARATORS and must not consume a number: `_path_` (the file
    // header, hidden above) and `_gap_` (the `⋯` between the hunks of one file).
    // A separator that counted would make a two-hunk card jump a line at every
    // `⋯`, which is exactly the kind of quiet wrongness this task is about. So
    // the counters are scoped to code rows by class, unconditionally.
    //
    // The `… N more lines` expander needs no exclusion here: it is a `<button>`
    // with only `_expand_`, written as a direct child of the body, so it never
    // matches `_line_` at all. (The block below pins it anyway, so a host that
    // moves the control onto a row cannot hand it a number.)
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_line_"] {',
    '  position: relative;',
    // 5.5ch = 2ch inset + 3ch digits + half a cell of breathing room before the
    // `+`/`-` glyph; the old 6ch + 22px left a visible canyon between the number
    // and the glyph.
    '  padding-left: calc(5.5ch + 10px) !important;',
    '}',
    // EVERY COMPOUND BELOW CARRIES SPECIFICITY (0,5,0), and their ORDER is what
    // decides them. That is deliberate: `[class*="_line_"][class*="_add_"]` on
    // its own is (0,4,0) and would LOSE to the code-row selector no matter where
    // it sits. Counting rules therefore spell out the same two `:not()`s.
    //
    // A context row advances BOTH numberings: it exists in the old file and in
    // the new one.
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_line_"]:not([class*="_path_"]):not([class*="_gap_"]) {',
    '  counter-increment: cds-diff-line cds-diff-line-old;',
    '}',
    // AN ADDED LINE EXISTS ONLY IN THE NEW FILE: it advances the new counter and
    // must NOT advance the old one.
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_line_"][class*="_add_"]:not([class*="_path_"]):not([class*="_gap_"]) {',
    '  counter-increment: cds-diff-line;',
    '}',
    // A DELETED LINE IS THE MIRROR: it advances the OLD counter and must not
    // advance the new one. Skipping it for `cds-diff-line` is what lets the row
    // after a deletion keep the file's real numbering instead of drifting.
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_line_"][class*="_del_"]:not([class*="_path_"]):not([class*="_gap_"]) {',
    '  counter-increment: cds-diff-line-old;',
    '}',
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_line_"]:not([class*="_path_"]):not([class*="_gap_"])::after {',
    '  content: counter(cds-diff-line);',
    '  position: absolute;',
    '  top: 0;',
    '  left: 2ch;',
    '  width: 3ch;',
    '  text-align: right;',
    '  color: var(--dsw-alias-label-caption);',
    '  font-size: 11px;',
    '  line-height: inherit;',
    '  font-variant-numeric: tabular-nums;',
    '  pointer-events: none;',
    '  user-select: none;',
    '}',
    // A DELETED ROW FALLS BACK TO THE OLD FILE NUMBER, exactly as the reference's
    // unified view does (`docs/tool-cards-diff.md` §2.4: the gutter shows the new
    // number, "有 addition 用 addition 行号，否则用 deletion 行号"): a deleted line
    // has no new-file number at all, so printing the new counter would repeat or
    // skip a value. Both counters are seeded from the same pair, so the fallback
    // stays aligned with the rest of the card.
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_line_"][class*="_del_"]:not([class*="_path_"]):not([class*="_gap_"])::after {',
    '  content: counter(cds-diff-line-old);',
    '}',
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_line_"][class*="_add_"]:not([class*="_path_"]):not([class*="_gap_"])::after {',
    '  color: var(--dsw-alias-state-success-primary);',
    '}',
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_line_"][class*="_del_"]:not([class*="_path_"]):not([class*="_gap_"])::after {',
    '  color: var(--dsw-alias-state-error-primary);',
    '}',
    // A SEPARATOR ROW NEVER GETS A NUMBER. It is already excluded from the
    // counters above; this also clears the number CELL, so even a host that
    // starts counting separators again cannot print one. The `… N more lines`
    // expander is covered by the second selector for the same reason: the host's
    // control is a `<button>` today, but the reference puts its control on an
    // in-flow row, and that shape must not inherit a gutter.
    //
    // KNOWN LIMITATION, DELIBERATELY NOT "FIXED". While the expander is showing,
    // the host renders the FIRST `maxLines/2` rows and the LAST `maxLines/2` rows
    // as siblings around it (`DiffBlock`: `F` = head slice, `D` = tail slice of
    // one flattened list), so the tail's numbers continue from the head's instead
    // of jumping over the hidden middle. That was already true of the pure
    // counter, and it stays true: the only ways to close it are (a) parse the
    // hidden count out of the button's LOCALISED label, or (b) read
    // `aria-expanded` and re-seed — both fragile, and both worse than a number
    // that is off only while a collapsed card is mid-list. Expanding the card
    // renders the full run and the numbering is exact, and once the host
    // publishes a hunk start the row mode below re-seeds per segment anyway.
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_line_"][class*="_path_"]::after,',
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_line_"][class*="_gap_"]::after,',
    '[data-slot="tool.call.toolview"] [data-diff] [class*="_expand_"]::after {',
    '  content: none;',
    '}',
    // Every non-input/output body (diff, read, terminal) becomes the same
    // inset card the reference draws around a tool's payload: a hairline frame,
    // the code surface, a 12px radius. `border: 0 !important` on the host's
    // markdown block would beat a plain border, so this one carries the weight.
    //
    // THE 12px PADDING HALF OF THE TABLE'S INSET. `docs/tool-cards-*.md` reaches
    // the read/write/edit content inset as margin + padding on this pair of
    // boxes: 10+12 = 22px left/right, 4+12 = 16px top, 8+12 = 20px bottom, with
    // the margins on `_bodyWrap` above. Only the padding lives here, so the two
    // halves stay legible against the table instead of being pre-summed into a
    // single number nobody can check.
    //
    // `margin: 0` IS PART OF THE SUM, not decoration. The host's own card class
    // carries `margin: 4px 0 4px 4px`; leaving it would make the left edge
    // 10+4+12 = 26 against a 22px target and the top 4+4+12 = 20 against 16,
    // i.e. 4px of drift on two of the four sides, in the direction the eye
    // reads as "off-centre under its row". Zeroing it here is what makes the
    // margin half below exact rather than approximate.
    '[data-conversation-content] [data-slot="tool.call.toolview"] [class*="_bodyWrap"] > *:not([class*="_ioCard"]):not([data-cds-tool-inspect]):not([data-cds-search-recovery]) {',
    '  margin: 0;',
    '  padding: 12px;',
    '  overflow: hidden;',
    // l2 (10%), not l1 (6%): Claude draws these cards with `--cds-border`, which
    // resolves to `--cds-alpha-2` = 10% alpha. Our l1 was one rung too faint.
    '  border: .5px solid var(--dsw-alias-border-l2) !important;',
    '  border-radius: var(--dsw-radius-lg) !important;',
    // SAME FAMILY AS THE CODE BLOCK, ONE STEP APART FROM IT.
    //
    // The card wraps a code surface, so an unrelated colour makes the two
    // planes fight; the code colour EXACTLY makes the inner block vanish into
    // its own container. This is the code-block colour held at 94% and mixed
    // 6% toward the page canvas: same hue, same lightness family, and just
    // enough separation that the block inside still reads as its own piece of
    // paper. 6% is the smallest step that survives both themes against
    // `--dsw-alias-markdown-code-block` (#fcfcfb light / #151515 dark).
    '  background: var(--cds-card-surface) !important;',
    '}',
    // THE COPY CONTROL, AS THE REFERENCE ACTUALLY RENDERS IT.
    //
    // Reverse-engineered from the installed app
    // (`ion-dist/assets/v1/c19e90103-VYuLVu9R.js`, `wg`/`Sg`):
    //
    //   <div class="pointer-events-none absolute inset-y-0 right-1.75
    //               flex items-start overflow-y-clip pb-0.5">
    //     <div class="pointer-events-auto sticky flex gap-0.75 top-[…+5px]">
    //       <GhostButton icon="Copy" aria-label="Copy code" />
    //
    // Three facts follow, and each one was wrong in the previous version:
    //
    //  1. It lives INSIDE the code card, 7px from its right edge — not on the
    //     row header and not floating over the first line of code.
    //  2. It is NOT hover-gated. The rail only renders once the block is
    //     settled, and the whole card only exists while the row is expanded —
    //     which is why the control "appears when you click the row": there is
    //     nothing to hover before that.
    //  3. It is `sticky` inside the scroll area, so it stays pinned while the
    //     code scrolls underneath.
    //
    // The card is the positioning context (the host gives it `position:
    // relative`), and the body scrolls inside it, so an absolutely positioned
    // rail pinned to the card's top-right reproduces the same behaviour here.
    //
    // ONE CORRECTION TO THE ABOVE, and it is why the row rules at the top of
    // this block demote the card: in the reference the rail sits on the CARD,
    // but in this host the card is INSET (`_bodyWrap` carries `margin: 4px 0
    // 8px 22px`), so a card-anchored rail lands 22px right of where the row's
    // own control belongs and its y drifts with the card's top padding. The
    // tool row is the element the user reads as "this call", so the rail is
    // pinned to the ROW's trailing corner instead — 5px / 7px from the row,
    // on the row's 24px line — while the card is forced `static` so the row is
    // the actual containing block. That is why <read>, <write> and <edit> all
    // line up despite their three different card insets.
    '[data-slot="tool.call.toolview"] [data-code-block-banner] {',
    '  position: absolute;',
    // TOP-RIGHT CORNER OF THE ROW, the same corner the markdown block's rail
    // uses (`top: 8px; right: 8px`). An earlier revision pinned this to
    // `top: 0; bottom: 0` and centred it vertically, which put the control on
    // the row's midline instead of its corner — on a 24px row the two look
    // almost identical, but the moment the row grows (a long summary wraps on a
    // narrow window) the centred rail drifts away from the corner while the
    // code block's stays put.
    '  top: 8px;',
    '  right: 8px;',
    '  left: auto;',
    '  width: auto;',
    '  height: auto;',
    '  display: flex;',
    '  align-items: center;',
    '  margin: 0;',
    '  padding: 0;',
    '  background: transparent;',
    '  border: 0;',
    // HOVER-GATED ON THE ROW, on the user's instruction: the control is not
    // painted until the pointer is on the tool row (or something inside it has
    // focus). It stays `pointer-events: auto` while visible so the click lands.
    '  opacity: 0;',
    '  pointer-events: none;',
    '  transition: opacity 100ms ' + EASING.swift + ';',
    '  z-index: 2;',
    '}',
    '[data-slot="tool.call.toolview"]:hover [data-code-block-banner] {',
    '  opacity: 1 !important;',
    '  pointer-events: auto !important;',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  [data-slot="tool.call.toolview"] [data-code-block-banner] {',
    '    transition: none;',
    '  }',
    '}',
    // ---- the shared copy control -----------------------------------------
    //
    // ONE DEFINITION FOR THREE PLACES. The copy button appears on the tool
    // row's rail (read / write / edit, via `[data-code-block-banner]`), inside
    // the markdown block's own banner, and — in the git-bash plugin's shell
    // card — inside the command box. Those three were drifting: 24px here, 18px
    // there, a filled plate in one and bare in another. Every value now comes
    // from these custom properties, declared once on the conversation content,
    // so a future tweak is one edit instead of three.
    '[data-conversation-content] {',
    // ONE SURFACE FOR EVERY CARD: the prose code block, the tool cards, the
    // command box and this theme's own diff card were resolving to three
    // different colours because each was keyed off a different variable.
    '  --cds-card-surface: #ffffff;',
    // The reference paints diff rows with DEDICATED git tokens, not with the
    // state colours, and leaves context rows transparent:
    //   var(--cds-bg-git-added) / var(--cds-bg-git-removed).
    '  --cds-bg-git-added: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);',
    '  --cds-bg-git-removed: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);',
    '  --cds-copy-size: 18px;',
    '  --cds-copy-icon: 12px;',
    '  --cds-copy-radius: var(--dsw-radius-xs);',
    '  --cds-copy-ink: var(--dsw-alias-label-tertiary);',
    '  --cds-copy-ink-hover: var(--dsw-alias-label-primary);',
    '  --cds-copy-reveal: 100ms;',
    '}',
    // TRANSPARENT, ALWAYS. The control is a glyph on the code surface, not a
    // chip of its own: a filled plate inside an already-tinted block reads as a
    // second surface and is what made it look like a button bolted on. The
    // `!important` is load-bearing — the tool-row rule used to paint
    // `--dsw-alias-markdown-code-block` here, and the host's own banner button
    // carries a hover fill that is more specific than a single class.
    '[data-slot="tool.call.toolview"] [data-code-block-banner] button,',
    // The diff card's copy control joins the shared rail rather than repeating
    // its geometry: size, radius, transparent fill and ink are one definition.
    '[data-cds-diff-copy],',
    '[data-cds-native-copy],',
    '.md-code-block [data-code-block-banner] button {',
    '  width: var(--cds-copy-size);',
    '  height: var(--cds-copy-size);',
    '  border-radius: var(--cds-copy-radius);',
    '  background: transparent !important;',
    '  color: var(--cds-copy-ink);',
    '  transition: color var(--cds-copy-reveal) ' + EASING.swift + ';',
    '}',
    '[data-slot="tool.call.toolview"] [data-code-block-banner] button svg,',
    '[data-cds-diff-copy] svg,',
    '.md-code-block [data-code-block-banner] button svg {',
    '  width: var(--cds-copy-icon);',
    '  height: var(--cds-copy-icon);',
    '}',
    '[data-slot="tool.call.toolview"] [data-code-block-banner] button:hover,',
    '[data-slot="tool.call.toolview"] [data-code-block-banner] button:focus-visible,',
    '[data-cds-diff-copy]:hover,',
    '[data-cds-diff-copy]:focus-visible,',
    '[data-cds-native-copy]:hover,',
    '[data-cds-native-copy]:focus-visible,',
    '.md-code-block [data-code-block-banner] button:hover,',
    '.md-code-block [data-code-block-banner] button:focus-visible {',
    '  background: transparent !important;',
    '  color: var(--cds-copy-ink-hover);',
    '}',
    // Text stays in the DOM for native feedback and accessibility; no React
    // children or handlers are replaced. Only the owned mark enables the icon.
    '[data-cds-native-copy] {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  box-sizing: border-box;',
    '  flex: none;',
    '  padding: 0;',
    '  margin: 0;',
    '  border: 0;',
    '  font-size: 0 !important;',
    '  cursor: pointer;',
    '  opacity: 0;',
    '  pointer-events: none;',
    '}',
    '[data-search]:hover [data-cds-native-copy],',
    '[data-read]:hover [data-cds-native-copy],',
    '[data-diff]:hover [data-cds-native-copy],',
    '[data-terminal]:hover [data-cds-native-copy] {',
    '  opacity: 1;',
    '  pointer-events: auto;',
    '}',
    '[data-cds-native-copy]::before {',
    '  content: "";',
    '  width: var(--cds-copy-icon);',
    '  height: var(--cds-copy-icon);',
    '  background: currentColor;',
    '  mask: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%3Crect%20x%3D%221.52075%22%20y%3D%224.07373%22%20width%3D%2210.3932%22%20height%3D%2210.3932%22%20rx%3D%222%22%20stroke%3D%22black%22%2F%3E%3Cpath%20d%3D%22M11.9792%201.53296C13.36%201.53296%2014.4792%202.65225%2014.4792%204.03296V9.42847C14.4792%2010.3756%2013.9521%2011.1987%2013.1755%2011.6228V10.3298C13.3652%2010.0787%2013.4792%209.7674%2013.4792%209.42847V4.03296C13.4792%203.20453%2012.8077%202.53296%2011.9792%202.53296H6.58374C6.27966%202.53301%205.99684%202.6235%205.7605%202.77905H4.42358C4.85652%202.03463%205.66056%201.53304%206.58374%201.53296H11.9792Z%22%20fill%3D%22black%22%2F%3E%3C%2Fsvg%3E") center / contain no-repeat;',
    '}',
    '[data-cds-native-copy="copied"] { color: var(--dsw-alias-state-success-primary); }',
    '[data-cds-native-copy="copied"]::before {',
    '  mask-image: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M3.5%208.5l3%203%206-6%22%20stroke%3D%22black%22%20stroke-width%3D%221.2%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E");',
    '}',
    // NOTHING IN THE BANNER BUT THE BUTTONS. Inside a tool card the banner's
    // label block is chrome the reference never draws, so every direct child
    // that is not the button container goes: the language label AND the read
    // card's "Showing 70 of 4639 lines" window label disappear together, while
    // the copy / wrap buttons stay.
    //
    // `[class*="_action"]`, NOT `[class*="_actions"]`, and the extra letter is
    // load-bearing. The host ships TWO banner shapes and their button
    // containers differ by that one character:
    //
    //   card banner (`d4`, the read / diff / code card)  `._actions_1pq26_43`
    //   simple banner (the markdown block)               `._action_7gxqk_56`
    //                                                    (`:2672` in the sheet;
    //                                                    JSX: `Mn.action`)
    //
    // A `"_actions"` substring does not occur in `_action_7gxqk_56`, so the
    // plural-only form would hide the simple banner's copy cell together with
    // its `._infostring_7gxqk_45` label — deleting the control it is meant to
    // preserve. `"_action"` is a prefix of both, so one rule keeps the buttons
    // in either shape.
    //
    // This REPLACES the older `> :first-child` rule rather than sitting next to
    // it: the heading was always the first child, so that rule was the same
    // hiding with a narrower reach. (`.md-code-block`'s own `> :first-child`
    // rule in `codeRules()` is untouched — it serves markdown blocks, where the
    // label sits next to no `_heading` block at all.)
    '[data-slot="tool.call.toolview"] [data-code-block-banner] > *:not([class*="_action"]) {',
    '  display: none;',
    '}',
    // …AND THE READ CARD'S LINE-WINDOW LABEL IS NOT IN THE HEADING.
    //
    // The brief assumed `_heading` carried both the language label and the
    // "Showing 70 of 4639 lines" read label. The shipped banner does not:
    // `_heading` holds only `_language` + `_title`, and the window count is
    // `_status`, rendered as the FIRST CHILD OF `_actions`:
    //
    //   <div class={wn.actions}>
    //     {status !== undefined && <span class={wn.status}>{status}</span>}
    //     {wrap} {copy}
    //   </div>
    //
    // (`web-frontend-index.js`, banner `d4`; `._status_1pq26_50` is
    // `margin-right: 8px; white-space: nowrap` in
    // `.repro/css/web-frontend-index.pretty.css:2570`.)
    //
    // So hiding the heading alone leaves exactly the label this change is
    // about, pinned to the left of the buttons. `_status` is the salt-tolerant
    // local name and the ONLY status cell a banner has, so it is safe to hit.
    '[data-slot="tool.call.toolview"] [data-code-block-banner] [class*="_status"] {',
    '  display: none;',
    '}',
    // The +N / −N counts are NOT styled here. They have to survive
    // `refine: false` (where the host's own card is back on screen), so they
    // live in `diffStatFamilyRules()`, emitted outside the component half.
  ].join('\n')
}

/**
 * The `+N` / `−N` change counts: code family and joined diff backgrounds, in BOTH card
 * states.
 *
 * WHY TWO HOOKS. Which card draws those counts depends on `refine`:
 *
 *   refine ON   the theme replaces the host card (`diffview.js`, registered at
 *               priority -1 in `lifecycle.js`), and its counts are
 *               `[data-cds-diffrow-stats]` — a marker of our own.
 *   refine OFF  the host's `FileMutationRow` draws them. Its cell carries
 *               `.pFy1Ka_diffStat` (`web-frontend bundle, ToolRow module:
 *               ".pFy1Ka_diffStat{font-family:var(--ds-font-family-code);…}"`),
 *               so the salt-tolerant `[class*="diffStat"]` is the hook — the
 *               same technique `[class*="_ioCard"]` and `[class*="markdown"]`
 *               already use. The host's counter has no `data-*` attribute.
 *
 * WHY IT CANNOT LIVE INSIDE `refine`. The refine-OFF state is the one the host
 * cell appears in; a rule inside the component half never reaches it. So this
 * block is appended after the always-on group, outside the `refine` gate.
 *
 * SAME FAMILY AS THE DIFF GUTTER. Use the code-font token rather than a
 * hardcoded face, so a user's code-font choice reaches both sets of numbers.
 * The conversation text rule sets font-family with !important on descendants,
 * so both the group and its number spans must explicitly restore the code role.
 *
 * SCOPED TO A TOOL ROW, twice: `[data-slot="tool.call.toolview"]` is the host's
 * outlet for the row, and `[data-tool]` is set on the row itself (and on the
 * theme's own `[data-cds-diffrow]`). So this can reach a tool row's stat cell
 * and nothing else — never a markdown block, a settings row, or the read card.
 *
 * ONE JOINED GROUP. The two counts touch, with one radius around the outside.
 * Their backgrounds use the SAME tokens as the diff rows: --cds-bg-git-added
 * and --cds-bg-git-removed. When refinement is off those custom tokens are not
 * emitted, so each falls back to the corresponding native file-diff token.
 *
 * The plate is a WASH BEHIND THE INK, never a replacement for it: `+N` keeps the
 * host's green and `−N` its red, hover states included — no `color`, no
 * `opacity`, exactly as before. `inline-block` (not `inline`) is what gives the
 * tint a box to fill; `flex: none` keeps the pair from being squeezed when the
 * summary is long, and `tabular-nums` keeps the two counts from jittering as
 * their width changes while a file is being edited.
 *
 * LEFT-ALIGNED AFTER THE TITLE. The pair is a sibling of the summary in the
 * host's flex row, and the summary is what absorbs the free space (`flex:auto`),
 * so nothing here may take `margin-left: auto` or `order` — a plate pushed to
 * the right edge would read as a separate column instead of a suffix.
 *
 * @returns {string} the rules
 */
function diffStatFamilyRules() {
  return [
    '/* ---- the ±N change counts: code family + joined diff backgrounds ------------- */',
    '[data-slot="tool.call.toolview"] [data-tool] [class*="diffStat"],',
    '[data-slot="tool.call.toolview"] [data-tool] [data-cds-diffrow-stats] {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 0;',
    '  flex: none;',
    '  border-radius: var(--dsw-radius-xs);',
    '  overflow: hidden;',
    '  white-space: nowrap;',
    '  font-family: var(--ds-font-family-code) !important;',
    '  font-variant-numeric: tabular-nums;',
    '}',
    // The host's cell holds both numbers; the theme's own marker holds two spans.
    // The plate therefore goes on the LEAVES in each: `[class*="diffAdded"]` /
    // `[class*="diffRemoved"]` for the host (salt-tolerant, the same technique
    // the cell uses), `[data-cds-diff-stat]` for ours.
    //
    // `line-height: 16px` is what keeps the wash a chip rather than a band: the
    // row's own box is 24px, and an inherited `calc(24px + delta)` would make the
    // plate span the full height of the line.
    '[data-slot="tool.call.toolview"] [data-tool] [class*="diffAdded"],',
    '[data-slot="tool.call.toolview"] [data-tool] [data-cds-diff-stat="add"] {',
    '  display: inline-block;',
    '  flex: none;',
    '  border-radius: 0;',
    '  margin: 0;',
    '  padding: 0 4px;',
    '  line-height: 16px;',
    '  font-family: var(--ds-font-family-code) !important;',
    '  background: var(--cds-bg-git-added, var(--dsw-alias-file-diff-added-bg));',
    '  font-variant-numeric: tabular-nums;',
    '}',
    '[data-slot="tool.call.toolview"] [data-tool] [class*="diffRemoved"],',
    '[data-slot="tool.call.toolview"] [data-tool] [data-cds-diff-stat="del"] {',
    '  display: inline-block;',
    '  flex: none;',
    '  border-radius: 0;',
    '  margin: 0;',
    '  padding: 0 4px;',
    '  line-height: 16px;',
    '  font-family: var(--ds-font-family-code) !important;',
    '  background: var(--cds-bg-git-removed, var(--dsw-alias-file-diff-deleted-bg));',
    '  font-variant-numeric: tabular-nums;',
    '}',
  ].join('\n')
}

/**
 * The diff card the theme draws for `edit` / `write` (`diffview.js`).
 *
 * WHY A SECOND BLOCK INSTEAD OF EXTENDING `toolRowsRules()`. That block styles
 * the HOST's diff card: counter-numbered rows, `_line_`/`_add_`/`_del_` classes
 * with their per-build salt, and the `[data-diff]` root. This card is the
 * theme's own DOM — `[data-cds-diffcard]`, `[data-cds-diff-row]`,
 * `[data-cds-tok]` — so it needs its own hooks. The two never overlap: this
 * card carries no `data-diff`, which is also why `diffnumbers.js` leaves it
 * alone (its sweep only visits `[data-slot="tool.call.toolview"] [data-diff]`).
 *
 * SYNTAX COLOUR. The token spans carry `data-cds-tok="<kind>"` and are painted
 * from `--shiki-token-*` — the same host seam `codeRules()` drives. The
 * variables are redeclared ON THE CARD for the same reason they are declared on
 * `.md-code-block`: a descendant selector cannot recolour a variable that is
 * only declared further up, and the theme's Claude palette must reach this
 * surface too. No token colour is written as a literal here.
 *
 * NUMBERS. `data-numbered` says whether the hunk knew its file line numbers
 * (`meta.diffs[].oldStart`/`newStart`, from the asar patch). The gutter prints
 * the same shape either way; the flag exists so a probe can tell 1..n apart from
 * a real file number, which is the one thing a reader cannot see.
 *
 * @returns {string} the rules
 */
function diffCardRules() {
  const tokenVars = function (mode) {
    const t = CODE_TOKENS[mode]
    return [
      '  --shiki-foreground: ' + t.foreground + ';',
      '  --shiki-token-keyword: ' + t.keyword + ';',
      '  --shiki-token-string: ' + t.string + ';',
      '  --shiki-token-comment: ' + t.comment + ';',
      '  --shiki-token-function: ' + t.function + ';',
      '  --shiki-token-constant: ' + t.number + ';',
      '  --shiki-token-punctuation: ' + t.punctuation + ';',
    ]
  }
  return [
    '/* ---- diff card: tokenised rows, owned by the theme ---------------- */',
    // The row: one 24px line, the seat the host's tool rows use, so a
    // conversation that mixes host rows and this card keeps one rhythm.
    '[data-cds-diffrow] { position: relative; }',
    '[data-cds-diffrow-head] {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  min-height: 24px;',
    // Room for the copy control in the row's trailing corner, exactly like the
    // host cards' rail reservation (`toolRowsRules`).
    '  padding-right: 30px;',
    '  color: var(--dsw-alias-label-tertiary);',
    '  font-size: var(--dsh-content-font-size-secondary, 13px);',
    '  line-height: 18px;',
    '  cursor: pointer;',
    '  transition: color 100ms ' + EASING.swift + ';',
    '}',
    '[data-cds-diffrow-head]:hover,',
    '[data-cds-diffrow-head]:focus-visible {',
    '  color: var(--dsw-alias-label-secondary);',
    '  outline: none;',
    '}',
    '[data-cds-diffrow][data-state="error"] [data-cds-diffrow-head] {',
    '  color: var(--dsw-alias-state-error-primary);',
    '}',
    '[data-cds-diffrow][data-state="stopped"] [data-cds-diffrow-head] {',
    '  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-label-tertiary));',
    '}',
    // The chevron points right while the card is closed and down once it opens,
    // matching the host's disclosure rows.
    '[data-cds-diff-chevron] {',
    '  display: inline-flex;',
    '  flex: none;',
    // COLLAPSED POINTS RIGHT, EXPANDED POINTS DOWN, the host's own convention.
    // The base used to rotate the glyph -90deg, which pointed it UP while the
    // row was closed, and `none` pointed it right again when open: backwards
    // at both ends.
    '  transform: none;',
    '  transition: transform 160ms ' + EASING.swift + ';',
    '}',
    '[data-cds-diffrow][data-expanded="true"] [data-cds-diff-chevron] { transform: rotate(90deg); }',
    '[data-cds-diffrow-title] {',
    '  min-width: 0;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  white-space: nowrap;',
    '}',
    '[data-cds-diffrow-stats] {',
    '  display: inline-flex;',
    '  gap: 0;',
    '  flex: none;',
    '  font-size: 12px;',
    '  font-variant-numeric: tabular-nums;',
    '}',
    '[data-cds-diff-stat="add"] { color: var(--dsw-alias-state-success-primary); }',
    '[data-cds-diff-stat="del"] { color: var(--dsw-alias-state-error-primary); }',
    // The copy control's SEAT. Its size, radius, ink and hover colour come from
    // the shared rail in `toolRowsRules()` — one definition for every copy
    // affordance in the theme; this rule adds only what the rail does not: the
    // row's corner and the hover-only reveal.
    '[data-cds-diff-copy] {',
    '  position: absolute;',
    '  top: 3px;',
    '  right: 0;',
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  padding: 0;',
    '  border: 0;',
    '  font: inherit;',
    '  line-height: 1;',
    '  cursor: pointer;',
    '  opacity: 0;',
    '  pointer-events: none;',
    '  transition: opacity var(--cds-copy-reveal, 100ms) ' + EASING.swift + ',' +
      ' color var(--cds-copy-reveal, 100ms) ' + EASING.swift + ';',
    '  z-index: 2;',
    '}',
    // Opening a diff focuses its header. Focus persists after pointer exit.
    '[data-cds-diffrow]:hover [data-cds-diff-copy] {',
    '  opacity: 1 !important;',
    '  pointer-events: auto !important;',
    '}',
    '[data-cds-diff-copy][data-copied="true"] { color: var(--dsw-alias-state-success-primary); }',
    // The card: the inset frame the host payload cards get (hairline, 12px
    // radius, code surface), plus the height cap the theme applies to every tool
    // payload so a 4000-line diff cannot push the conversation.
    '[data-cds-diffcard] {',
    ...tokenVars('light'),
    '  max-height: 280px;',
    // Match the host payload seat: symmetric 10px margins under the row.
    '  margin: 4px 10px 8px 10px;',
    // 8px BLOCK PADDING, ZERO INLINE. Reverse-engineered from the reference's
    // diff container (`docs/tool-cards-diff.md`): it carries
    // `padding-block: var(--diffs-gap-block, 8px)` and
    // `padding-bottom: max(0px, calc(gap - scrollbar-gutter))`, and NO
    // padding-inline. The horizontal indent is not the container's job: each
    // row supplies `padding-inline: 1ch` on its own cells and the 5ch number
    // gutter in front of the text IS the left inset. Adding container padding
    // double-counts it — the number column drifts 8px right of where the row
    // tints begin, and the add/del wash no longer reaches the frame edge, which
    // is the whole point of the full-bleed rows below.
    '  padding: 8px 0;',
    '  overflow: auto;',
    // Full-bleed diff rows need no extra outline around the card.
    '  border-radius: var(--dsw-radius-lg);',
    // One step off the code surface, same as the host cards: the frame rule that
    // tints _bodyWrap > * never reaches this card because we render it.
    '  background: var(--cds-card-surface, #ffffff);',
    '  color: var(--shiki-foreground);',
    '  font: var(--dsw-font-markdown-code-block-small, 12px/1.6 var(--ds-font-family-code));',
    '  font-family: var(--ds-font-family-code);',
    '}',
    'body[data-ds-dark-theme] [data-cds-diffcard] {',
    ...tokenVars('dark'),
    '}',
    // FULL BLEED ROWS. The reference's tint reaches the frame on both sides, so
    // each row supplies its own inset through its three grid cells.
    '[data-cds-diffcard] [data-cds-diff-row] {',
    '  display: grid;',
    '  grid-template-columns: 5ch 1.2ch minmax(0, 1fr);',
    '  align-items: start;',
    '  min-height: 1lh;',
    '  white-space: pre-wrap;',
    '  overflow-wrap: anywhere;',
    '  tab-size: 2;',
    '}',
    // The wash is the reference's 12% mix — the same ratio the host card's rows
    // get in `toolRowsRules()`. One value, two surfaces.
    '[data-cds-diffcard] [data-cds-diff-row][data-kind="add"] {',
    '  background-color: var(--cds-bg-git-added);',
    '}',
    '[data-cds-diffcard] [data-cds-diff-row][data-kind="del"] {',
    '  background-color: var(--cds-bg-git-removed);',
    '}',
    '[data-cds-diffcard] [data-cds-diff-row][data-kind="context"] {',
    '  /* transparent, per --diffs-bg-context-override */',
    '  background-color: transparent;',
    '}',
    // THE GUTTER MUST NOT WRAP. Without an explicit width the span is a flex
    // item that shrinks below its content, so a four-digit file line breaks
    // between the digits: `1451` rendered as `145` on one line and `1` on the
    // next, which reads as two columns of numbers. `white-space: nowrap` stops
    // the break; the `min-width` in ch keeps the column steady while the numbers
    // grow from 1 to 4 digits, so the code text does not shift sideways mid-hunk.
    // THE GUTTER: FIXED WIDTH, NO WRAP, AND THE DIGITS MUST NOT TOUCH THE GLYPH.
    //
    // Three defects met here, each with its own fix:
    //   1. no width → the span is a flex item that shrinks below its content, so
    //      `1451` broke between the digits and read as two columns of numbers;
    //   2. `white-space: nowrap` stops the break, but with `min-width: 5ch` and
    //      `content-box` a four-digit number fills the whole box, the 1ch of
    //      right padding is consumed, and the last digit lands ON the `+`/`-`
    //      glyph (measured at 4x: the ink ended 4px past the glyph's left edge);
    //   3. widening the box made it worse, because `text-align: right` moves the
    //      digits outward — the padding has to come out of the width, not add to
    //      it.
    // `border-box` is what ties the two together: the 5ch floor INCLUDES the 8px
    // right pad, so the digits keep their clearance at every digit count.
    '[data-cds-diffcard] [data-cds-diff-num] {',
    '  padding: 0 8px 0 2px;',
    '  text-align: right;',
    '  color: var(--dsw-alias-label-caption);',
    '  font-size: 11px;',
    '  font-variant-numeric: tabular-nums;',
    '  user-select: none;',
    '  white-space: nowrap;',
    '  flex: none;',
    '  min-width: 5ch;',
    '  box-sizing: border-box;',
    '}',
    '[data-cds-diffcard] [data-kind="add"] [data-cds-diff-num] { color: var(--dsw-alias-state-success-primary); }',
    '[data-cds-diffcard] [data-kind="del"] [data-cds-diff-num] { color: var(--dsw-alias-state-error-primary); }',
    '[data-cds-diffcard] [data-cds-diff-glyph] {',
    '  color: var(--shiki-token-punctuation);',
    '  user-select: none;',
    '}',
    '[data-cds-diffcard] [data-cds-diff-text] {',
    '  display: block;',
    '  min-width: 0;',
    '  font: inherit;',
    '  white-space: inherit;',
    '  overflow-wrap: inherit;',
    '}',
    // ---- the token palette ----------------------------------------------
    //
    // `number` maps onto `--shiki-token-constant`: Shiki's css-variables theme
    // paints a numeric literal with the `constant` scope, so reusing the
    // variable is the mapping, not a shortcut. `plain` keeps the card's ink.
    '[data-cds-diffcard] [data-cds-tok="keyword"] { color: var(--shiki-token-keyword); }',
    '[data-cds-diffcard] [data-cds-tok="string"] { color: var(--shiki-token-string); }',
    '[data-cds-diffcard] [data-cds-tok="number"],',
    '[data-cds-diffcard] [data-cds-tok="constant"] { color: var(--shiki-token-constant); }',
    '[data-cds-diffcard] [data-cds-tok="comment"] { color: var(--shiki-token-comment); }',
    '[data-cds-diffcard] [data-cds-tok="function"] { color: var(--shiki-token-function); }',
    '[data-cds-diffcard] [data-cds-tok="punctuation"] { color: var(--shiki-token-punctuation); }',
    '[data-cds-diffcard] [data-cds-tok="plain"] { color: var(--shiki-foreground); }',
    // ---- token-level emphasis -------------------------------------------
    //
    // The reason this card exists. A changed token gets a wash of the row's own
    // hue rather than a second text colour, so the syntax palette survives: the
    // reader sees "this WORD changed", not "this word is another language now".
    // `box-decoration-break: clone` keeps the radius at both ends of a wrapped
    // token.
    '[data-cds-diffcard] [data-cds-tok-diff="add"] {',
    '  background-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 28%, transparent);',
    '  border-radius: 3px;',
    '  box-decoration-break: clone;',
    '}',
    '[data-cds-diffcard] [data-cds-tok-diff="del"] {',
    '  background-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 28%, transparent);',
    '  border-radius: 3px;',
    '  box-decoration-break: clone;',
    '}',
    // The `⋯` between two hunks of one file.
    '[data-cds-diffcard] [data-cds-diff-gap] {',
    '  padding: 2px 0;',
    '  color: var(--dsw-alias-label-caption);',
    '  font-size: 11px;',
    '  text-align: center;',
    '  user-select: none;',
    '}',
    // The expander is a full-width row, so a click anywhere on it works, and it
    // is indented to the text column.
    '[data-cds-diffcard] [data-cds-diff-more] {',
    '  display: block;',
    '  width: 100%;',
    '  margin: 0;',
    '  padding: 3px 0 3px 6.2ch;',
    '  border: 0;',
    '  background: transparent;',
    '  color: var(--dsw-alias-label-secondary);',
    '  font: inherit;',
    '  font-size: 12px;',
    '  text-align: left;',
    '  cursor: pointer;',
    '  transition: background-color 100ms ' + EASING.swift + ';',
    '}',
    '[data-cds-diffcard] [data-cds-diff-more]:hover,',
    '[data-cds-diffcard] [data-cds-diff-more]:focus-visible {',
    '  background: var(--dsw-alias-interactive-bg-hover);',
    '  color: var(--dsw-alias-label-primary);',
    '  outline: none;',
    '}',
    // The failure state renders the tool's own error text, with no rows: a diff
    // built from a failed call would be fiction. The no-metadata fallback is the
    // result text verbatim; both are plain blocks, so they share the box.
    '[data-cds-diffcard] [data-cds-diff-error],',
    '[data-cds-diffcard] [data-cds-diff-plain] {',
    '  margin: 0;',
    '  padding: 10px 12px;',
    '  white-space: pre-wrap;',
    '  overflow-wrap: anywhere;',
    '}',
    '[data-cds-diffcard] [data-cds-diff-error] { color: var(--dsw-alias-state-error-primary); }',
    '[data-cds-diffcard] [data-cds-diff-plain] { color: var(--dsw-alias-label-secondary); }',
    '@media (prefers-reduced-motion: reduce) {',
    '  [data-cds-diff-chevron],',
    '  [data-cds-diff-copy],',
    '  [data-cds-diff-more],',
    '  [data-cds-diffrow-head] {',
    '    transition: none;',
    '  }',
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
 *
 * WHY THE SELECTORS DROP THE `="hover"` QUALIFIER (measured live). The value is
 * `"always"` on a tail that ends a response and `"hover"` otherwise, and only
 * the NEWEST tail stays mounted: a probe of a live conversation found exactly
 * one `[data-actions-reveal]` element, value `"always"`, whose four buttons
 * computed `13.33px/400` in the primary label colour — the type this rule asks
 * for never applied, for any turn. Both values mark the same bar as the last
 * child, so the styling must not care which one arrived; keying on `"hover"`
 * was a rule that could only match a tail the renderer does not keep.
 */
function messageActionsRules() {
  return [
    '/* ---- message actions: hover reveal (host geometry kept) ------------ */',
    '@media (hover: hover) {',
    '  /* The host owns the opacity 0→1 fade; CDS owns only its curve. */',
    '  [data-actions-reveal] > :last-child {',
    '    transition-timing-function: ' + EASING.swift + ' !important;',
    '  }',
    '  [data-actions-reveal] > :last-child :where(button) {',
    '    color: var(--dsw-alias-label-secondary) !important;',
    '    font-size: 12px;',
    '    line-height: 16px;',
    '    font-weight: 500;',
    '  }',
    '  [data-actions-reveal] > :last-child :where(button):hover {',
    '    color: var(--dsw-alias-label-primary) !important;',
    '  }',
    '}',
  ].join('\n')
}

/**
 * Scroll fade masks — the reference's feathering, BOTTOM EDGE ONLY.
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
 * WHY THE TOP EDGE IS NOT FEATHERED (this is a bug fix, not a preference).
 * Two facts about this container, both measured on the real renderer:
 *
 *  1. Its rows are 24px tall (a collapsed reasoning row is exactly
 *     `height: calc(24px + var(--dsh-content-font-delta,0px))`,
 *     `.repro/css/chat/08-ReasoningRow…css:6-8`). A 24px feather is therefore
 *     a whole row wide: whatever sits at the top edge is dimmed end to end.
 *  2. A reasoning row that is expanded pins its own header at that edge —
 *     `[data-expanded] [data-open] [data-disclosure-header] { position:sticky;
 *     top:0 }` (`08-ReasoningRow…css:13-18`) — so the pinned 「思考」 label and
 *     the first line of its reasoning text land INSIDE the mask. The user
 *     reported exactly that: during thinking output the label and the line
 *     under it looked smeared/covered.
 *
 * A CSS mask cannot exempt a descendant, and the host's own `.fadeTop` class
 * fades the same edge. Overriding that class with "no top fade" is therefore
 * the only shape that keeps the label legible; it is also why these rules
 * carry two attribute selectors (0,2,0) instead of one class (0,1,0) — ours
 * must win wherever the host also masks. Verified live: identical DOM, mask
 * removed → label sharp; mask present → label washed out (A/B screenshots in
 * `.work/think/ab-01-masked.png` / `ab-02-mask-off.png`).
 *
 * The BOTTOM ladder is unchanged and is the reference's scroll-fade mask
 * (`docs/v1/04-…md:296-320`, mirrored in `code-examples/cds-theme.css:773-780`):
 * opaque → d9 → b3 → 80 → 4d → 26 → 0d → transparent over the fade size. The
 * reference's 28px fade size is used here (C12); an earlier build evaluated
 * the same curve at the host's 24px seat.
 *
 * NOTE ON `data-overflow-below`: that hook is the input-trigger MENU's
 * "content below" marker (`MenuView`: `.menu[data-overflow-below]:after` paints
 * a 16px gradient on a NON-scrolling box). Masking that box would feather the
 * menu's own chrome and corners, so it is deliberately left to the host; the
 * chat list's bottom-edge hook is `data-scroll-down`.
 */
function scrollFadeRules() {
  const size = 28
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
    '/* ---- scroll fade masks (data-scroll-*): bottom edge only ----------- */',
    // `none`, not a gradient: this also cancels the host's own `.fadeTop` class
    // (our 0,2,0 selector beats its 0,1,0 class). See the header comment.
    '[data-step-process-body][data-scroll-up] {',
    '  mask-image: none;',
    '}',
    // INLINE CODE INSIDE THINKING TAKES THE THINKING BODY'S SIZE.
    //
    // The global chip rule above pins every inline `<code>` to the code-size
    // token (13px) with `!important`. In prose that is right, but the reasoning
    // body is compact Markdown at 13/20 with a muted, secondary ink — a 13px
    // medium-weight chip with its own fill reads as a heading inside a
    // paragraph and pulls the eye off the reasoning itself. `1em` restates the
    // body size so the chip follows whatever the body is set to (including the
    // user's content-size setting) instead of fighting it.
    '[data-step-process-body] :not(pre) > code {',
    '  font-size: 1em !important;',
    '  font-weight: inherit !important;',
    '}',
    '[data-step-process-body][data-scroll-down] {',
    '  mask-image: ' + bottom + ';',
    '}',
    // Both edges scrollable: keep the bottom feather, still never the top.
    '[data-step-process-body][data-scroll-up][data-scroll-down] {',
    '  mask-image: ' + bottom + ';',
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
    '/* ---- code artefact details: disclosure row ------------------------- */',
    // The banner is no longer a header strip: codeRules() turns it into a
    // floating copy control and hides the language label, so there is no
    // label typography or seam to style here. The real Claude app has no
    // header — see docs/cds-spec.md §8.5.
    // Disclosure / collapse row.
    //
    // 14/20 and 400, NOT 12/16/500 — and the family is the TEXT role, not mono.
    // The reference's tool row is one component (`TurnStatusStep`) whose root
    // declares the type outright:
    //
    //   className="flex min-w-0 items-start gap-xs font-sans text-body
    //              font-normal text-secondary not-italic"       (c734f318c)
    //
    // → `font-sans` + `text-body` (14px/20px) + `font-normal` (400) + secondary
    // ink. Only the terminal card switches to mono (§5.4 of
    // docs/typography-cross-check.md). This sheet had the disclosure row at
    // 12/16/500, which is why tool rows read as a different, tighter breed of
    // text than the prose around them.
    '[data-disclosure-header] {',
    '  font-size: 12px;',
    '  line-height: 16px;',
    '  font-weight: 500;',
    '  color: var(--dsw-alias-label-secondary);',
    '  transition: color 120ms ' + EASING.swift + ';',
    '}',
    '[data-disclosure-header] :where(span, div, button) {',
    '  font-family: inherit;',
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
 * (cubic-bezier(.4, 0, .2, 1), cds-theme.css:211 / docs/v1/01-…md:608) — a
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
    // The reference's breathing-pulse curve (cds-theme.css:211,
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
 *
 * THE HAIRLINE BELONGS TO A ROW, NOT TO A SLOT CELL. A slot entry that threw is
 * replaced by the host with an EMPTY `div[data-slot-error]` (renderer
 * `SlotErrorBoundary`), and an entry that renders nothing can leave an empty
 * child too. Both are zero-height but are still direct children of the outlet,
 * so a plain `> *` painted a second 0.5px line one device pixel under the row
 * above — which reads as "the line under Default shell is twice as thick as
 * every other one", not as "a row is missing". `:not(:empty)` is the structural
 * test: a row always has content, a dead cell has none. `[data-slot-error]` is
 * excluded by name as well, so a future crash face that renders content still
 * cannot claim spacing it does not occupy.
 *
 * The same reasoning applies at the END of the list, where the line is cleared on
 * the last cell as before. A dead cell that happens to be last keeps that line
 * (the row before it is then the last visible one) — the same blind spot the
 * host's own `> :last-child` rule has. It is accepted rather than expressed with
 * a `:has(~ …)` guard because `thememode.test.mjs` pins that every `:has()` in
 * this sheet is scoped to a CHILD row, and that pin is worth more than a
 * one-line cosmetic edge case.
 *
 * WHY `:where()`. The guard must not raise the hairline's specificity: at
 * `(0,1,0)` the host's own last-child rule `(0,2,0)` and the clearing rule below
 * still win, exactly as they did before. A plain `:not(…)` guard is `(0,3,0)`
 * and put a line under the final row of every section — the browser fixture
 * caught that; the text-level unit test cannot.
 */
function settingsRules() {
  return [
    '/* ---- settings rows ------------------------------------------------- */',
    '[data-slot="settings.general.item"] > *:where(:not(:empty):not([data-slot-error])),',
    '[data-slot="settings.appearance.item"] > *:where(:not(:empty):not([data-slot-error])) {',
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

  // The UI font role. OUTSIDE `refine` on purpose: it is a token-level split,
  // not a component restyle — turning the CDS look off must not also take away
  // the user's separate UI family.
  parts.push(uiFontRules())

  if (state.refine) {
    parts.push(
      focusRules(),
      composerRules(),
      codeRules(),
      messageRules(),
      // Tool call cards: one inset card, the request boxed, the response
      // flowing. Applies to the host's per-tool views and to the generic
      // input/output fallback alike.
      toolRowsRules(),
      // The theme's OWN edit/write card (`diffview.js`): tokenised rows and
      // token-level change emphasis, which the host's row model cannot express.
      diffCardRules(),
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

    // ---- fixed assistant markdown styling -------------------------------
    //
    // THE MARKDOWN SCOPE paints only the assistant's lists/task lists,
    // emphasis and links; code blocks, inline chips, tool cards and genui cards
    // are excluded inside the rule text itself (`markdown-scope.js`). Everything
    // there is plain CSS. Its comparison switch was retired; old saved values
    // no longer affect whether these rules are emitted.
    parts.push(markdownScopeRules())
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

  // The `+N` / `−N` change counts. OUTSIDE `refine` for the same class of reason
  // the block above is: the host's own card is what comes back when refinement
  // is off, so a rule inside the component half would be emitted exactly in the
  // state that does not need it. See `diffStatFamilyRules()`.
  //
  // APPENDED AT THE END on purpose: `motionTokenRules()` and the A/B-tier
  // baselines (`test/rule-baseline.mjs`) are byte-pinned slices of the sheet,
  // and inserting this block anywhere before them would break those slices.
  if (state.refine !== false) parts.push(toolChromeRules())
  parts.push(diffStatFamilyRules())

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

