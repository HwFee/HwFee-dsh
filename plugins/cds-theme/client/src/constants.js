export const PLUGIN_ID = 'dsh-cds-theme'
export const STORAGE_KEY = 'dsh-cds-theme/settings'
export const STYLE_ID = PLUGIN_ID + '/style'
/** The STATIC @font-face sheet; written once per activation (never toggled). */
export const FONT_STYLE_ID = STYLE_ID + '/fonts'
export const PANEL_STYLE_ID = PLUGIN_ID + '/panel'

/** The user message bubble radius, distinct from the composer's 20px. */
export const BUBBLE_RADIUS = 18

// ---------------------------------------------------------------- defaults

/**
 * `warmth`   0–100. How far the surface ladder moves from the host's cold
 *            grays to CDS's warm grays. 100 is CDS.
 * `accent`   one of `ACCENT_PRESETS`. Clay is the CDS default.
 * `radiusScale` 0.5–1.5 multiplier over the CDS radius table. 1 = CDS.
 * `elevation` 0–200 shadow opacity percentage. 100 = CDS.
 * `refine`   whether the component-level stylesheet is active. Turning it off
 *            leaves the token remap in place — useful when a host update
 *            changes a component the stylesheet refines.
 * `thinkingLabelBlue` only the "Deep diving for Ns…" label: true restores the
 *            host's original blue (label + shimmer) instead of the CDS clay.
 *            It changes exactly two tokens and nothing else.
 * `pasteAsFile` a long plain-text paste (≥ 2000 characters or ≥ 30 lines)
 *            becomes a .txt attachment through the host's own file intake
 *            instead of stretching the composer. Off is the host's ordinary
 *            paste, unchanged.
 * `preferThemeCjk` prefers the embedded, calibrated Chinese faces before system
 *            fallbacks in the default font stacks. Explicit font picks still win.
 * `heroRipple` the blank-session backdrop: a field of faint code glyphs behind
 *            the hero with a water ripple spreading from every click. On by
 *            default because it is a replication of the shipped look; off
 *            removes the canvas, the listener and the see-through composer card.
 * `markdownScope` the three markdown families the user asked this theme to
 *            paint — lists and task lists, bold/italic/strikethrough, links —
 *            scoped to `[data-chat-flow-kind="assistant-step"]` alone. Off
 *            leaves those three exactly as the host draws them.
 * `viewTabsPill` the 「对话 / 轨迹」 strip's look: false is the host's own
 *            underline tabs (the default), true is the reference's segmented
 *            pill. It does NOT decide whether the strip exists — the host's
 *            「显示代码工作视图」 setting does, and this theme never writes it.
 * `composerSplit` the composer's layout: false keeps the shipped single card
 *            (the default); true lifts the controls onto a line outside the
 *            text box as the reference does. No node moves; see
 *            `composer-layout.js`.
 * `enabled`  master switch; off means the plugin releases its token layer.
 *
 * THERE ARE NO PER-ITEM REPLICATION SWITCHES ANY MORE. Seven shipped during the
 * replication work and every one of them has now been retired, in two groups:
 *
 * SOLIDIFIED — the user accepted the look and asked for the switch to go, so the
 * rules stayed as unconditional parts of the sheet (see `buildCss`):
 *
 *   `codeBlockDetails`, `markdownBody` — accepted first.
 *   `footnotes` — the generated footnote block at 12/15 tertiary with a
 *       half-pixel rule above it and superscript references in tabular Mono. The
 *       host draws NO styling of its own on `.footnotes`, so this is the only
 *       treatment that block has ever had.
 *   `statTypography` — tabular figures in the composer's stat pills and the CDS
 *       dt/dd ladder in the two usage popovers.
 *   `buttonSpring` — the reference's 15-stop spring on this plugin's own controls
 *       (`.dct-swatch` / `.dct-toggle` / `.dct-mode-cube`). Its three curve tokens
 *       were always unconditional; now the consuming transitions are too.
 *
 * DELETED — the user could not see a difference, and each measurement agreed:
 *
 *   `attachments` — a 10px radius and a `bg-layer-2` fill, against a host that
 *       already ships 12px and a near-white fill: a 2px arc and one tint step.
 *   `concentricRadius` — one declaration, `border-radius: calc(sm + 4px)` on the
 *       menu material: a 4px arc on a surface the eye already reads as rounded.
 *   `statusPulse` — the hooks were real, but the target is the whale icon, which
 *       the host renders with `contain: strict`, so the scale animation is
 *       clipped by its own container.
 *   `disclosurePolish` — seven rules on `[data-disclosure-*]`; six were absorbed
 *       by the host's row metrics and the seventh ADDED a hairline the host never
 *       drew, which the user called ugly.
 *
 * A legacy payload may still carry any of these fields; `sanitize()` only ever
 * returns the known shape, so a retired key is dropped and a stored `false` can
 * never resurrect as an invisible mode.
 */
export const DEFAULT_STATE = {
  enabled: true,
  warmth: 100,
  accent: 'clay',
  radiusScale: 1,
  elevation: 100,
  refine: true,
  thinkingLabelBlue: false,
  pasteAsFile: true,
  preferThemeCjk: true,
  heroRipple: true,
  // The three looks the user asked for, each OFF at the start so installing
  // this version cannot change the interface on its own: the scope rules paint
  // the assistant's lists/emphasis/links, the pill restyles the view tabs, and
  // the split lifts the composer's toolbar out of the text box.
  markdownScope: false,
  viewTabsPill: false,
  composerSplit: false,
}

export const ACCENT_IDS = ['clay', 'ochre', 'sand', 'graphite']

// Panel copy lives in `locales.js`: pure Chinese or pure English per the host
// language, registered with `ctx.locale` under LOCALE_NS and injected as `t`
// by the slot outlet (`locale:` on the registration). The old `中文 · English`
// hybrid strings that lived here are gone — a zh UI shows only Chinese and an
// en UI only English.

export function clampWarmth(value) {
  const n = Math.round(Number(value))
  if (!isFinite(n)) return DEFAULT_STATE.warmth
  return Math.min(100, Math.max(0, n))
}

export function clampRadiusScale(value) {
  const n = Number(value)
  if (!isFinite(n)) return DEFAULT_STATE.radiusScale
  // Two decimals is finer than a pixel at every radius in the table.
  return Math.min(1.5, Math.max(0.5, Math.round(n * 100) / 100))
}

export function clampElevation(value) {
  const n = Math.round(Number(value))
  if (!isFinite(n)) return DEFAULT_STATE.elevation
  return Math.min(200, Math.max(0, n))
}

export function clampAccent(value) {
  return ACCENT_IDS.indexOf(value) >= 0 ? value : DEFAULT_STATE.accent
}

/** Coerce anything read back from storage into a complete, in-range state. */
export function sanitize(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  return {
    enabled: input.enabled === undefined ? DEFAULT_STATE.enabled : input.enabled !== false,
    warmth: clampWarmth(input.warmth === undefined ? DEFAULT_STATE.warmth : input.warmth),
    accent: clampAccent(input.accent),
    radiusScale: clampRadiusScale(input.radiusScale === undefined ? DEFAULT_STATE.radiusScale : input.radiusScale),
    elevation: clampElevation(input.elevation === undefined ? DEFAULT_STATE.elevation : input.elevation),
    refine: input.refine === undefined ? DEFAULT_STATE.refine : input.refine !== false,
    // Old storage payloads have no field; only an explicit boolean `true`
    // turns the original blue thinking label back on.
    thinkingLabelBlue: input.thinkingLabelBlue === true,
    // Long-paste conversion defaults on; only an explicit false turns it off.
    pasteAsFile: input.pasteAsFile === undefined ? DEFAULT_STATE.pasteAsFile : input.pasteAsFile !== false,
    // Existing profiles adopt the corrected default; only boolean false opts out.
    preferThemeCjk: input.preferThemeCjk === undefined ? DEFAULT_STATE.preferThemeCjk : input.preferThemeCjk !== false,
    // The blank-session backdrop defaults on; a stored false turns it off.
    heroRipple: input.heroRipple === undefined ? DEFAULT_STATE.heroRipple : input.heroRipple !== false,
    // The three new looks are opt-in: only an explicit `true` turns one on, so
    // a payload written by an older version can never light them up.
    markdownScope: input.markdownScope === true,
    viewTabsPill: input.viewTabsPill === true,
    composerSplit: input.composerSplit === true,
    // Any other key in an old payload is ignored. Every retired switch field is
    // dropped here: `compactHero` (its runtime is gone — the new-session layout
    // is CSS-only, see `newSessionInputRules` in styles.js, and a stored value
    // is harmless), `desktopTitlebar`, the four SOLIDIFIED into unconditional
    // rules (`codeBlockDetails`, `markdownBody`, `footnotes`, `statTypography`,
    // `buttonSpring`) and the four DELETED (`attachments`, `statusPulse`,
    // `concentricRadius`, `disclosurePolish`). The solid ones no longer have an
    // off state to read, and the deleted ones have no rules to gate — so a
    // stored value for any of them can never resurrect as an invisible mode.
  }
}
