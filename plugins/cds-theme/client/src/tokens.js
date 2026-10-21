import { PLUGIN_ID } from './constants.js'
import {
  LIGHT_SURFACES, DARK_SURFACES, LIGHT_TEXT, DARK_TEXT,
  LIGHT_BORDERS, DARK_BORDERS, CLAY, ACCENT_PRESETS,
  LIGHT_STATE, DARK_STATE, RADII, SHADOWS, EASING, DURATIONS,
  CODE_SURFACE,
} from './palette.js'
import { resolveSurface, mixColor } from './color.js'
import { buildTypographyTokens, TYPOGRAPHY_TOKEN_NAMES } from './typography.js'

// --------------------------------------------------------------- helpers

/** The accent ladder for the active preset and colour scheme. */
function accentOf(state, scheme) {
  const preset = ACCENT_PRESETS.find(function (entry) { return entry.id === state.accent })
  if (preset === undefined) {
    return {
      brand: CLAY[scheme].brand,
      clay: CLAY[scheme].clay,
      fill: CLAY[scheme].fill,
      fillHover: CLAY[scheme].fillHover,
      text: CLAY[scheme].text,
      subtle: CLAY[scheme].subtle,
      subtleStrong: CLAY[scheme].subtleStrong,
    }
  }
  const base = scheme === 'light' ? preset.light : preset.dark
  const brand = scheme === 'light' ? preset.brandLight : preset.brandDark
  // `fill` is the solid rung that carries white text; the preset ships an
  // explicit value per palette because the required contrast differs between
  // them (see the CLAY comment in palette.js).
  const fill = scheme === 'light' ? preset.fillLight : preset.fillDark
  // The FILL always deepens on hover, in both palettes. CDS's
  // brighten-on-hover rule (docs/cds-spec.md C5) applies to the *accent* —
  // rings, borders, breathing lights — which carries no text. A solid button
  // fill carries a white label, and lifting it in dark mode drops that label to
  // 3.96:1, below AA. So the fill and the accent deliberately diverge here.
  // Recorded as D6 in `docs/cds-spec.md` §9.3; see §2.4 for the contrast figures.
  const toward = '#000000'
  return {
    brand: brand,
    clay: base,
    fill: fill,
    fillHover: mixColor(fill, toward, 0.10),
    text: scheme === 'light' ? mixColor(base, '#000000', 0.24) : mixColor(base, '#ffffff', 0.20),
    subtle: alphaOf(base, scheme === 'light' ? 0.12 : 0.16),
    subtleStrong: alphaOf(base, scheme === 'light' ? 0.20 : 0.26),
  }
}

/** `rgba()`/`hsla()` at an explicit alpha, from any parseable hex base. */
function alphaOf(base, alpha) {
  const hex = String(base).replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return base
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
}

/** Scale every alpha inside a shadow string by a 0–200 percentage. */
export function scaleShadow(shadow, percent) {
  const k = Math.min(200, Math.max(0, Number(percent))) / 100
  if (k === 1) return shadow
  return String(shadow).replace(/rgba\(([^)]+)\)/g, function (whole, inner) {
    const parts = inner.split(',').map(function (piece) { return piece.trim() })
    if (parts.length !== 4) return whole
    const alpha = parseFloat(parts[3])
    if (!isFinite(alpha)) return whole
    const next = Math.round(alpha * k * 1000) / 1000
    return 'rgba(' + parts[0] + ', ' + parts[1] + ', ' + parts[2] + ', ' + next + ')'
  })
}

// ------------------------------------------------------- the token sheet

/**
 * Build the complete `{ token: { light, dark } }` map handed to
 * `ctx.theme.overrideTokens`.
 *
 * WHY THIS IS THE MAIN VEHICLE. The layout presenter applies the active
 * theme's tokens with `body.style.setProperty(name, value)` and then swaps the
 * `body[data-ds-dark-theme]` attribute for the palette. An inline declaration
 * on `body` outranks any stylesheet rule of equal importance, so the only
 * correct way to recolour the app is to hand the presenter a different token
 * map. `overrideTokens` is exactly that seam: it composes per colour scheme
 * over the active theme, and the presenter needs no knowledge of it.
 *
 * The stylesheet is still needed for what the presenter does NOT own —
 * `--dsw-elevation-*` is declared on `body, body *`, which an inline body
 * style cannot reach, and component-level refinement has no token at all. See
 * `styles.js`.
 *
 * Radii and motion ride the same sheet because they are also declared on
 * `:root`/`body` by the host, and because the presenter will happily write a
 * non-colour value into an inline custom property.
 */
export function buildTokens(state) {
  const out = {}
  const warmth = state.warmth

  const lightSurf = {}
  const darkSurf = {}
  for (const key of Object.keys(LIGHT_SURFACES)) {
    lightSurf[key] = resolveSurface(LIGHT_SURFACES[key], warmth)
    darkSurf[key] = resolveSurface(DARK_SURFACES[key], warmth)
  }

  const lightAccent = accentOf(state, 'light')
  const darkAccent = accentOf(state, 'dark')

  const lightShadow = {}
  const darkShadow = {}
  for (const key of ['lv1', 'lv2', 'lv3']) {
    lightShadow[key] = scaleShadow(SHADOWS.light[key], state.elevation)
    darkShadow[key] = scaleShadow(SHADOWS.dark[key], state.elevation)
  }

  const radius = function (px) { return Math.round(px * state.radiusScale) + 'px' }
  const pair = function (name, light, dark) {
    out[name] = { light: String(light), dark: String(dark) }
  }

  // ------------------------------------------------------------ surfaces
  pair('--dsw-alias-bg-base', lightSurf.canvas, darkSurf.canvas)
  pair('--dsw-alias-bg-layer-1', lightSurf.raised, darkSurf.raised)
  pair('--dsw-alias-bg-layer-2', lightSurf.nested, darkSurf.nested)
  pair('--dsw-alias-bg-layer-3', lightSurf.raised, darkSurf.raised)
  pair('--dsw-alias-bg-overlay', lightSurf.raised, darkSurf.raised)
  pair('--dsw-alias-bg-module-platform', lightSurf.module, darkSurf.module)
  pair('--dsw-alias-bg-multi-select', lightSurf.hover, darkSurf.hover)
  pair('--dsw-alias-bg-skeleton', LIGHT_BORDERS.l1, DARK_BORDERS.l1)
  pair('--dsw-alias-bg-document-preview', lightSurf.nested, darkSurf.nested)

  // Masks are a physical scrim, not a themed surface: they stay dark in both
  // palettes. Only their opacity follows the palette's contrast needs.
  pair('--dsw-alias-bg-mask-1', 'rgba(0, 0, 0, 0.24)', 'rgba(0, 0, 0, 0.50)')
  pair('--dsw-alias-bg-mask-2', 'rgba(0, 0, 0, 0.12)', 'rgba(0, 0, 0, 0.32)')
  pair('--dsw-alias-bg-mask-3', 'rgba(0, 0, 0, 0.48)', 'rgba(0, 0, 0, 0.72)')
  pair('--dsw-alias-bg-mask-photo', 'rgba(0, 0, 0, 0.88)', 'rgba(0, 0, 0, 0.90)')
  pair('--dsw-alias-bg-mask-drop', 'rgba(255, 255, 255, 0.72)', 'rgba(0, 0, 0, 0.60)')

  // Document selection stays blue in both palettes. This is the one place CDS
  // keeps a cold hue on purpose: a clay selection over clay-tinted text is
  // unreadable, and users expect the OS selection colour here.
  pair('--dsw-alias-bg-document-selection', 'rgba(65, 118, 230, 0.30)', 'rgba(122, 170, 255, 0.34)')

  // ------------------------------------------------------------- borders
  pair('--dsw-alias-border-l1', LIGHT_BORDERS.l1, DARK_BORDERS.l1)
  pair('--dsw-alias-border-l2', LIGHT_BORDERS.l2, DARK_BORDERS.l2)
  pair('--dsw-alias-border-l2-darkmode-thin', LIGHT_BORDERS.l2, DARK_BORDERS.l1)
  pair('--dsw-alias-border-l3', LIGHT_BORDERS.l3, DARK_BORDERS.l3)
  pair('--dsw-alias-border-l4', LIGHT_BORDERS.l4, DARK_BORDERS.l4)
  pair('--dsw-alias-border-inverted', 'rgba(255, 255, 255, 0.10)', 'rgba(0, 0, 0, 0.10)')
  pair('--dsw-alias-border-inverted2', 'rgba(255, 255, 255, 0.18)', 'rgba(0, 0, 0, 0.18)')

  // ---------------------------------------- static neutral ramp → warm grey
  // Some host components bypass the alias layer and paint a
  // `--dsw-static-neutral-bluish-*` step directly (the theme package does this
  // ~15 times, e.g. the theme-card selected border and several settings
  // surfaces), so remapping only the alias tokens leaves them visibly COOL
  // blue-grey inside an otherwise warm interface.
  //
  // CDS ships its own neutral ladder (`--cds-gray-0 … --cds-gray-900`,
  // `.reference/open-claude-ui/code-examples/cds-theme.css`), so every host
  // step is replaced by the CDS step with the NEAREST lightness: contrast is
  // preserved, the hue turns warm, and no value is invented.
  //
  // The host declares these steps once for both palettes (they are not
  // mode-dependent), so each pair carries the same value in both halves on
  // purpose. Spot checks of the lightness mapping:
  //   bluish-800 #353638 → gray-700 #383835  (identical lightness)
  //   bluish-500 #979da6 → gray-300 #a5a49a
  //   bluish-200 #e1e5ee → gray-70  #eae9e4
  const WARM_NEUTRAL_BLUISH = {
    '00': '#ffffff', // gray-0
    50: '#fcfcfb', // gray-10
    60: '#f6f6f4', // gray-30
    75: '#f3f3f0', // gray-40
    100: '#f0efec', // gray-50
    150: '#edece8', // gray-60
    200: '#eae9e4', // gray-70
    300: '#d2d1c7', // gray-150
    400: '#b4b3a8', // gray-250
    500: '#a5a49a', // gray-300
    600: '#898781', // gray-400
    700: '#6d6b67', // gray-500
    750: '#454442', // gray-650
    800: '#383835', // gray-700
    850: '#2c2c2a', // gray-750
    875: '#20201f', // gray-800
    900: '#1c1c1b', // gray-820
    950: '#151515', // gray-850
    1000: '#111111', // gray-870
  }
  for (const step of Object.keys(WARM_NEUTRAL_BLUISH)) {
    const warm = WARM_NEUTRAL_BLUISH[step]
    pair('--dsw-static-neutral-bluish-' + step, warm, warm)
  }

  // The plain (non-bluish) neutral ramp has the same problem in a milder form:
  // it is a cool grey ladder (`#fafafa … #0f0f0f`) and a few components paint
  // it directly. Same method, same source: the CDS `--cds-gray-*` step with the
  // nearest lightness. (`#000` maps to `gray-900 #0b0b0b`, CDS's darkest ink.)
  const WARM_NEUTRAL_RAMP = {
    '00': '#ffffff', // gray-0
    50: '#fcfcfb', // gray-10
    100: '#f6f6f4', // gray-30
    150: '#f0efec', // gray-50
    200: '#e7e6e1', // gray-80
    250: '#e1e0d9', // gray-100
    300: '#d2d1c7', // gray-150
    400: '#a5a49a', // gray-300
    500: '#898781', // gray-400
    550: '#6d6b67', // gray-500
    600: '#52514e', // gray-600
    700: '#383835', // gray-700
    800: '#2c2c2a', // gray-750
    850: '#20201f', // gray-800
    900: '#0f0f0f', // gray-880
    1000: '#0b0b0b', // gray-900
  }
  for (const step of Object.keys(WARM_NEUTRAL_RAMP)) {
    const warm = WARM_NEUTRAL_RAMP[step]
    pair('--dsw-static-neutral-' + step, warm, warm)
  }

  // ------------------------------------- static brand blue ramp → clay ramp
  // The host's brand track is a blue ladder (`--dsw-static-deepseek-*`, also
  // consumed directly in a handful of components and mixed into
  // `--dsw-alias-label-deep-diving`). CDS has ONE brand hue — the clay orange —
  // and ships only four clay values (`--cds-clay`, `-hover`, `-light`, `--brand`).
  //
  // The ramp is therefore re-tinted rather than copied: every step keeps its
  // LIGHTNESS (so contrast pairing with text and surfaces is unchanged) and
  // takes the clay hue with its saturation scaled by clay/deepseek-500
  // (`0.63 / 0.77`). The method reproduces the reference at both anchors:
  //   deepseek-500 #4176e6 → #d77150  (reference --cds-clay #d97757)
  //   deepseek-50  #edf3fe → #fcf2ef  (reference --cds-clay-light #fbf3ef)
  //
  // `--dsw-static-blue-*` is deliberately NOT touched: blue keeps its "info /
  // link — not brand" reading in host components. Declared once for both
  // palettes, hence identical halves.
  const CLAY_DEEPSEEK_RAMP = {
    50: '#fcf2ef',
    100: '#fbebe6',
    200: '#fbe0d7',
    300: '#f8ccbd',
    400: '#f3a186',
    450: '#ef8765',
    500: '#d77150',
    600: '#a96751',
    800: '#583f37',
    900: '#40302a',
  }
  for (const step of Object.keys(CLAY_DEEPSEEK_RAMP)) {
    const clay = CLAY_DEEPSEEK_RAMP[step]
    pair('--dsw-static-deepseek-' + step, clay, clay)
  }

  // ---------------------------------------------------------------- text
  pair('--dsw-alias-label-primary', LIGHT_TEXT.primary, DARK_TEXT.primary)
  pair('--dsw-alias-label-primary-bluish', LIGHT_TEXT.primary, DARK_TEXT.primary)
  pair('--dsw-alias-label-primary-dimmed', LIGHT_TEXT.secondary, DARK_TEXT.secondary)
  pair('--dsw-alias-label-primary-foreground', LIGHT_TEXT.onBrand, DARK_TEXT.onBrand)
  pair('--dsw-alias-label-primary-inverted', LIGHT_TEXT.onBrand, DARK_TEXT.onBrand)
  pair('--dsw-alias-label-secondary', LIGHT_TEXT.secondary, DARK_TEXT.secondary)
  pair('--dsw-alias-label-tertiary', LIGHT_TEXT.tertiary, DARK_TEXT.tertiary)
  pair('--dsw-alias-label-caption', LIGHT_TEXT.caption, DARK_TEXT.caption)
  pair('--dsw-alias-label-dimmed', LIGHT_TEXT.tertiary, DARK_TEXT.tertiary)
  pair('--dsw-alias-label-document-preview', LIGHT_TEXT.secondary, DARK_TEXT.secondary)
  pair('--dsw-alias-menu-icon', LIGHT_TEXT.secondary, DARK_TEXT.secondary)

  // A shimmer is a sheen travelling across text, so its direction inverts
  // with the palette.
  pair('--dsw-alias-label-shimmer', 'rgba(0, 0, 0, 0.30)', 'rgba(255, 255, 255, 0.45)')

  // ------------------------------------------------- CDS a11y / motion extras
  // Focus ring WIDTH. The stylesheet paints CDS's three-layer ring (1.5px clay)
  // for the components it refines, but the host's own token stayed 2px, so
  // everything it sizes from the token had a thicker ring than the rest. CDS's
  // `--cds-focus-shadow` measures the ring at 1.5px (docs/cds-spec.md §4).
  pair('--dsw-focus-ring-width', '1.5px', '1.5px')

  // `--dsw-shadow-lv1-blur` is the wide/diffuse sibling of lv1 (the host uses
  // it under translucent bars). CDS forbids single-layer hard shadows, so the
  // nearest CDS layer of the same "wide and soft" character is `soft`.
  pair('--dsw-shadow-lv1-blur', lightShadow.soft, darkShadow.soft)

  // The thinking label's gradient mixes. The host mixes
  // `--dsw-static-deepseek-*` with `--dsw-static-blue-*`; the blue half is
  // deliberately untouched (see the brand ramp above), so both halves are
  // restated here over the WARM ramps to drop the last blue out of the
  // interface. Same mix ratios as the host, resolved to literals: a theme
  // token must never point at a host static (that is an invariant, see
  // test/tokens.test.mjs) — the values below are the mixes of the warm ramp
  // steps those statics now hold.
  //   light = 55% deepseek-450 (#ef8765) + 45% bluish-400 (#b4b3a8)
  //   dark  = 70% deepseek-500 (#d77150) + 30% bluish-900 (#1c1c1b)
  //   light = 65% bluish-200 (#eae9e4) + 35% deepseek-400 (#f3a186)
  //   dark  = 55% deepseek-450 (#ef8765) + 45% bluish-800 (#383735)
  //
  // THE ONLY THING `thinkingLabelBlue` DOES. The "Deep diving for Ns…" line is
  // the one place a user may still want DSH's original blue. The switch swaps
  // EXACTLY these two tokens to the host's original values
  // (`color-mix(deepseek-500 70%/30%, blue-950)` resolved to literals —
  // `.repro/asar/theme-client.js`); every other token, including the shimmer
  // RULE's gradient endpoints (it reads this token), keeps the clay value.
  const thinkingLabelBlue = state.thinkingLabelBlue === true
  pair('--dsw-alias-label-deep-diving',
    thinkingLabelBlue ? '#7d9ade' : '#d49b83',
    thinkingLabelBlue ? '#3a61b5' : '#9f5840')
  pair('--dsw-alias-label-deep-diving-shimmer',
    thinkingLabelBlue ? '#a2befe' : '#edd0c3',
    thinkingLabelBlue ? '#4767b5' : '#9d634f')

  // The thinking block's vertical fades are hardcoded #fff / #151517 /
  // #f5f6f7 / #232325 in the host. Repaint them on CDS's warm surfaces so a
  // sticky thinking header does not read as a cold white strip over a warm
  // canvas. `transparent` interpolates in premultiplied alpha, so the fade
  // carries no grey cast.
  pair(
    '--dsw-linear-gradient-think',
    'linear-gradient(180deg, #fcfcfb 20.19%, transparent 100%)',
    'linear-gradient(180deg, #151515 20.19%, transparent 100%)')
  pair(
    '--dsw-linear-think-select',
    'linear-gradient(180deg, #f6f6f4 20.19%, transparent 100%)',
    'linear-gradient(180deg, #20201f 20.19%, transparent 100%)')

  // --------------------------------------------------------------- brand
  // Two tracks (C5): `brand-primary` is the solid brand fill, and the host's
  // "business" state token is the interactive accent. Keeping them on
  // different clay values is what stops the UI reading as flat orange.
  pair('--dsw-alias-brand-primary', lightAccent.brand, darkAccent.brand)
  pair('--dsw-alias-brand-primary-invert', LIGHT_TEXT.primary, DARK_TEXT.primary)
  pair('--dsw-alias-brand-primary-new-colorprimary-new-color', lightAccent.clay, darkAccent.clay)
  pair('--dsw-alias-brand-text', lightAccent.text, darkAccent.text)

  // The interactive accent: carets, selected pills, the pending dot, the
  // focus-ring fallback. This one change is the most visible in the whole
  // theme — the UI stops being blue.
  pair('--dsw-alias-state-business-primary', lightAccent.clay, darkAccent.clay)
  pair('--dsw-alias-state-business-tertiary', lightAccent.subtle, darkAccent.subtle)

  pair('--dsw-alias-link', lightAccent.text, darkAccent.text)

  // ------------------------------------------------------------- buttons
  // `button-primary-fill` carries white label text, so it uses the deeper
  // "fill" rung rather than `--brand` (see palette.js CLAY.fill).
  pair('--dsw-alias-button-primary-fill', lightAccent.fill, darkAccent.fill)
  pair('--dsw-alias-button-primary-hover', lightAccent.fillHover, darkAccent.fillHover)
  pair('--dsw-alias-button-primary-dimmed', lightAccent.subtle, darkAccent.subtle)
  pair('--dsw-alias-button-contrast-fill', LIGHT_TEXT.primary, DARK_TEXT.primary)
  pair('--dsw-alias-button-elevated-fill', lightSurf.raised, darkSurf.raised)
  pair('--dsw-alias-button-floating-fill', lightSurf.raised, darkSurf.raised)
  pair('--dsw-alias-button-floating-hover', lightSurf.hover, darkSurf.hover)
  pair('--dsw-alias-button-ghost-active-border', lightAccent.clay, darkAccent.clay)
  pair('--dsw-alias-button-ghost-active-fill', lightAccent.subtle, darkAccent.subtle)
  pair('--dsw-alias-button-ghost-active-hover', lightAccent.subtleStrong, darkAccent.subtleStrong)
  // The composer's send button also renders a white glyph on this fill.
  pair('--dsw-alias-button-info-fill', lightAccent.fill, darkAccent.fill)
  pair('--dsw-alias-button-info-hover', lightAccent.fillHover, darkAccent.fillHover)
  pair('--dsw-alias-button-tool-bar-fill', 'rgba(82, 82, 82, 0.50)', 'rgba(245, 245, 245, 0.16)')
  pair('--dsw-alias-button-tool-bar-fill-invisible', 'rgba(82, 82, 82, 0.36)', 'rgba(245, 245, 245, 0.10)')
  pair('--dsw-alias-button-tool-bar-hover', 'rgba(82, 82, 82, 0.60)', 'rgba(245, 245, 245, 0.24)')

  // --------------------------------------------------------- interaction
  pair('--dsw-alias-interactive-bg-hover', 'hsla(0, 0%, 8%, 0.05)', 'hsla(0, 0%, 100%, 0.05)')
  pair('--dsw-alias-interactive-bg-hover-solid', lightSurf.hover, darkSurf.hover)
  pair('--dsw-alias-interactive-bg-hover-accent', lightAccent.subtle, darkAccent.subtle)
  pair('--dsw-alias-interactive-bg-hover-danger', LIGHT_STATE.errorSubtle, DARK_STATE.errorSubtle)
  pair('--dsw-alias-interactive-bg-active', 'hsla(0, 0%, 8%, 0.09)', 'hsla(0, 0%, 100%, 0.09)')

  // ----------------------------------------------------------- markdown
  pair('--dsw-alias-markdown-inline-code', lightSurf.nested, darkSurf.nested)
  // Code/tool-body surface from the installed Claude app (tool-row expanded
  // command: #fcfcfb / #151515), not the generic nested rung.
  pair('--dsw-alias-markdown-code-block', '#fcfcfb', '#151515')
  pair('--dsw-alias-markdown-code-block-banner', CODE_SURFACE.light, CODE_SURFACE.dark)
  pair('--dsw-alias-markdown-code-segment-selected', lightSurf.raised, darkSurf.raised)
  pair('--dsw-alias-markdown-code-segment-unselected', lightSurf.nested, darkSurf.nested)
  pair('--dsw-alias-markdown-citation', lightSurf.nested, darkSurf.nested)
  pair('--dsw-alias-markdown-tag', lightSurf.hover, darkSurf.hover)
  pair('--dsw-alias-markdown-placeholder', LIGHT_TEXT.caption, DARK_TEXT.caption)

  // --------------------------------------------------------- state hues
  pair('--dsw-alias-state-success-primary', LIGHT_STATE.success, DARK_STATE.success)
  pair('--dsw-alias-state-success-secondary', LIGHT_STATE.successSecondary, DARK_STATE.successSecondary)
  pair('--dsw-alias-state-success-tertiary', LIGHT_STATE.successSubtle, DARK_STATE.successSubtle)
  pair('--dsw-alias-state-warn-primary', LIGHT_STATE.warn, DARK_STATE.warn)
  pair('--dsw-alias-state-warn-secondary', LIGHT_STATE.warnSecondary, DARK_STATE.warnSecondary)
  pair('--dsw-alias-state-warn-tertiary', LIGHT_STATE.warnSubtle, DARK_STATE.warnSubtle)
  // THE LABEL IS THE HOST'S AMBER, NOT THE THEME'S ORANGE.
  //
  // The host consumes this token as its "amber category", not only for real
  // warnings: `.toolAmber` colours a TOOL CALL SUMMARY with it, `.subtoolAmber`
  // its children, and the trajectory's `[data-timeline-span="tool"]` bars. The
  // host's own value is `var(--dsw-static-amber-600)` (#dd8629).
  //
  // Overriding it with the CDS warning orange (#e8590c) made every tool summary
  // look like a warning — reported as "工具调用摘要文字变橙". CDS has no warn
  // token at all (docs/cds-spec.md §1.4: the nearest documented state colour is
  // Tailwind amber), and this token's consumers expect amber, so the label keeps
  // the host's own pair. The primary/secondary/tertiary tokens stay themed:
  // they drive actual warning borders/chips, where the theme's palette is
  // intentional.
  // The literals ARE the host's `--dsw-static-amber-600` (#dd8629) and
  // `--dsw-static-amber-400` (#f7ad31). They are written out because this
  // theme's token contract forbids leaking host static ramp names into the
  // override map — a static that disappears would leave the token unresolved.
  pair('--dsw-alias-state-warn-label', '#dd8629', '#f7ad31')
  pair('--dsw-alias-state-error-primary', LIGHT_STATE.error, DARK_STATE.error)
  pair('--dsw-alias-state-error-secondary', LIGHT_STATE.errorSecondary, DARK_STATE.errorSecondary)
  // The host defines an error TERTIARY too (`var(--dsw-static-red-100/900)` in
  // its own sheet); success and warn already had one here, error was the odd
  // one out — without it, an error badge's tint stayed DSH red while every
  // other error surface followed CDS.
  pair('--dsw-alias-state-error-tertiary', LIGHT_STATE.errorSubtle, DARK_STATE.errorSubtle)
  pair('--dsw-alias-state-idle-primary', LIGHT_STATE.idle, DARK_STATE.idle)

  // ---------------------------------------------------------- code diff
  pair('--dsw-alias-code-diff-added', LIGHT_STATE.successSubtle, DARK_STATE.successSubtle)
  pair('--dsw-alias-code-diff-deleted', LIGHT_STATE.errorSubtle, DARK_STATE.errorSubtle)
  pair('--dsw-alias-file-diff-added-bg', 'rgba(47, 158, 68, 0.10)', 'rgba(78, 209, 126, 0.14)')
  pair('--dsw-alias-file-diff-added-gutter', 'rgba(47, 158, 68, 0.16)', 'rgba(78, 209, 126, 0.20)')
  pair('--dsw-alias-file-diff-added-marker', LIGHT_STATE.success, DARK_STATE.success)
  pair('--dsw-alias-file-diff-deleted-bg', 'rgba(186, 39, 35, 0.08)', 'rgba(242, 90, 90, 0.12)')
  pair('--dsw-alias-file-diff-deleted-gutter', 'rgba(186, 39, 35, 0.14)', 'rgba(242, 90, 90, 0.18)')
  pair('--dsw-alias-file-diff-deleted-marker', LIGHT_STATE.error, DARK_STATE.error)

  // -------------------------------------------------- overlays & chrome
  // Menus keep the host's translucent material; only the fill moves onto the
  // CDS ladder so a menu over a CDS canvas does not read as cold.
  pair('--dsw-specific-menu', 'rgba(252, 252, 251, 0.92)', 'rgba(44, 44, 42, 0.94)')
  pair('--dsw-menu-surface-fill', 'rgba(252, 252, 251, 0.92)', 'rgba(44, 44, 42, 0.94)')
  pair('--dsw-alias-menu-group-header-fill', 'rgba(252, 252, 251, 0.94)', 'rgba(44, 44, 42, 0.94)')
  pair('--dsw-specific-input-major', lightSurf.raised, darkSurf.raised)
  pair('--dsw-specific-login-input', lightSurf.nested, darkSurf.nested)
  pair('--dsw-specific-selector', lightSurf.hover, darkSurf.hover)
  pair('--dsw-specific-tip', lightSurf.hover, darkSurf.nested)

  pair('--dsw-specific-sidebar-fill', lightSurf.sidebar, darkSurf.sidebar)
  pair('--dsw-specific-sidebar-nav-item-hover', 'hsla(0, 0%, 8%, 0.05)', 'hsla(0, 0%, 100%, 0.05)')
  pair('--dsw-specific-sidebar-nav-item-active', 'hsla(0, 0%, 8%, 0.08)', 'hsla(0, 0%, 100%, 0.09)')
  pair('--dsw-specific-sidebar-nav-item-active-accent', lightAccent.subtle, darkAccent.subtle)

  // The user bubble is tinted, never outlined (CDS 1-border rule).
  pair('--dsw-specific-bubble', lightSurf.hover, darkSurf.nested)
  pair('--dsw-specific-bubble-highlight', lightAccent.subtle, darkAccent.subtle)

  pair('--dsw-alias-toast-bg', LIGHT_TEXT.primary, '#2c2c2a')
  pair('--dsw-alias-toast-label', LIGHT_TEXT.onBrand, DARK_TEXT.primary)
  pair('--dsw-alias-tooltip-bg', LIGHT_TEXT.primary, '#2c2c2a')
  pair('--dsw-alias-tooltip-key-bg', 'rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.18)')

  pair('--dsw-alias-turn-trigger-bg', lightSurf.nested, darkSurf.nested)
  pair('--dsw-alias-turn-trigger-bg-hover', 'hsla(0, 0%, 8%, 0.05)', 'hsla(0, 0%, 100%, 0.05)')

  // ----------------------------------------------------------- settings
  pair('--dsw-alias-settings-card-fill', lightSurf.raised, darkSurf.raised)
  pair('--dsw-alias-settings-card-stroke', LIGHT_BORDERS.l2, DARK_BORDERS.l2)

  // ---------------------------------------------------------- scrollbar
  pair('--dsw-alias-scrollbar-bg-l1', 'hsla(0, 0%, 8%, 0.16)', 'hsla(0, 0%, 100%, 0.16)')
  pair('--dsw-alias-scrollbar-bg-l2', 'hsla(0, 0%, 8%, 0.16)', 'hsla(0, 0%, 100%, 0.16)')
  pair('--dsw-alias-scrollbar-hover-l1', 'hsla(0, 0%, 8%, 0.28)', 'hsla(0, 0%, 100%, 0.28)')
  pair('--dsw-alias-scrollbar-hover-l2', 'hsla(0, 0%, 8%, 0.28)', 'hsla(0, 0%, 100%, 0.28)')

  // --------------------------------------------------------- onboarding
  pair('--dsw-alias-onboarding-accent', lightAccent.clay, darkAccent.clay)
  pair('--dsw-alias-onboarding-card-fill', lightSurf.raised, darkSurf.raised)
  pair('--dsw-alias-onboarding-checkbox-border', LIGHT_BORDERS.l4, DARK_BORDERS.l4)
  pair('--dsw-alias-onboarding-secondary-fill', lightSurf.nested, darkSurf.nested)

  // The welcome/login page spins three gradient rings behind a translucent
  // card. The host ships them as blue / cyan / violet four-stop lists
  // (`onboarding.css.mjs`), which sit cold on top of the now-warm card and
  // accent. Each ring keeps the host's GRAMMAR — `[deep, mid, light, deep]` at
  // the same stop positions, so the rotation reads identically — and only
  // swaps the colours for the reference's own clay family:
  //   brand #c6613f · clay #d97757 · clay-hover #cc5a36 ·
  //   dark hover #e08264 · clay-light #fbf3ef
  // The host declares these once (no dark block), hence identical halves.
  pair(
    '--dsw-gradient-onboarding-violet-stops',
    '#c6613f 33.102%, #d97757 50.954%, #fbf3ef 85.326%, #c6613f',
    '#c6613f 33.102%, #d97757 50.954%, #fbf3ef 85.326%, #c6613f')
  pair(
    '--dsw-gradient-onboarding-blue-stops',
    '#cc5a36 18.75%, #e08264 51.78%, #fcf2ef 86.252%, #cc5a36',
    '#cc5a36 18.75%, #e08264 51.78%, #fcf2ef 86.252%, #cc5a36')
  pair(
    '--dsw-gradient-onboarding-cyan-stops',
    '#a96751 21.154%, #d77150 50.954%, #fbf3ef 85.326%, #a96751',
    '#a96751 21.154%, #d77150 50.954%, #fbf3ef 85.326%, #a96751')

  // -------------------------------------------------- switch / misc
  // In dark mode the thumb stays lighter than the track without the glare of
  // pure white.
  pair('--dsw-alias-switch-thumb', '#ffffff', '#b4b2ac')

  // ------------------------------------------------- shape & motion
  // Non-colour tokens travel the same seam: the host declares them on
  // `:root`/`body`, and the presenter writes whatever string it is given.
  pair('--dsw-radius-xs', radius(RADII.xs), radius(RADII.xs))
  pair('--dsw-radius-sm', radius(RADII.sm), radius(RADII.sm))
  pair('--dsw-radius-md', radius(RADII.md), radius(RADII.md))
  pair('--dsw-radius-lg', radius(RADII.lg), radius(RADII.lg))
  pair('--dsw-radius-xl', radius(RADII.xl), radius(RADII.xl))
  pair('--dsw-radius-panel', radius(RADII.panel), radius(RADII.panel))

  pair('--dsw-shadow-lv1', lightShadow.lv1, darkShadow.lv1)
  pair('--dsw-shadow-lv2', lightShadow.lv2, darkShadow.lv2)
  pair('--dsw-shadow-lv3', lightShadow.lv3, darkShadow.lv3)

  pair('--ds-ease-in-out', EASING.inOut, EASING.inOut)
  pair('--ds-transition-duration', DURATIONS.base, DURATIONS.base)
  pair('--ds-transition-duration-fast', DURATIONS.fast, DURATIONS.fast)
  pair('--ds-transition-duration-slow', DURATIONS.slow, DURATIONS.slow)

  // focus.css reads `var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))`.
  // Naming it explicitly means a future host that stops falling back to the
  // business token still gets the clay ring.
  pair('--dsw-focus-ring-color', lightAccent.clay, darkAccent.clay)

  // ---------------------------------------------------------- typography
  // The Claude ladder remap: every `--dsw-font-markdown-*` value plus the two
  // family roles the whole app renders through (`--dsw-font-family`,
  // `--ds-font-family-code`). Same seam as the colours — the presenter writes
  // these inline on body, which is what outranks the theme package's own
  // `body { --dsw-font-markdown-*: … }` declarations. The { light, dark }
  // pairs here carry the dark-mode weight thinning (400→360 …). See
  // typography.js for the value table and its citations.
  const typography = buildTypographyTokens()
  for (const name of Object.keys(typography)) {
    out[name] = typography[name]
  }

  return out
}

/** Token names whose values are lengths/curves/families rather than colours. */
export const NON_COLOR_TOKENS = [
  '--dsw-radius-xs', '--dsw-radius-sm', '--dsw-radius-md', '--dsw-radius-lg',
  '--dsw-radius-xl', '--dsw-radius-panel',
  '--dsw-shadow-lv1', '--dsw-shadow-lv2', '--dsw-shadow-lv3',
  '--ds-ease-in-out', '--ds-transition-duration',
  '--ds-transition-duration-fast', '--ds-transition-duration-slow',
].concat(TYPOGRAPHY_TOKEN_NAMES)

export { PLUGIN_ID }
