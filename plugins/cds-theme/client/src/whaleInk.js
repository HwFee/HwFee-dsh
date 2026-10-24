/**
 * The pigment for the glyph whales in the blank-session backdrop.
 *
 * WHAT IT IS FOR. The ocean (`ocean.js`, rendering through `sharks/renderer.js`)
 * paints three animals. Their colour is a user choice with exactly three
 * values, and this module is the whole policy:
 *
 *   `black`  the shipped default: the page's own ink — pure black on a light
 *            page, a light ink on a dark one. It is a SILHOUETTE, the way a
 *            printed whale would be, and it is the least conspicuous of the
 *            three on a busy page;
 *   `blue`   the DeepSeek brand blue (`#4176e6` light / `#7aaaff` dark);
 *   `live`   the same blue walk around the hue wheel, `HUE_PERIOD_S` per turn.
 *
 * WHY NOT A CSS TOKEN. The glyphs are canvas fills, one `fillStyle` per cell
 * class per frame; there is no element to hand a token to. The colours are
 * therefore plain `{ r, g, b }` triples — but they are still DERIVED from the
 * theme mode (light/dark), so a dark theme moves them without an edit here.
 *
 * WHY THREE FUNCTIONS AND NO CLASS. `readPalette()` already returns the live
 * theme; this module turns (mode, time) into a colour and holds no state. The
 * animated mode is a pure function of the clock, so a test can ask "what colour
 * at t=0 and t=7.3s" without a canvas, and the renderer stays a pure painter.
 *
 * LIGHT AND DARK ARE NOT THE SAME PIGMENT. Black ink on a near-black page
 * (#1a1a18) is invisible, so `black` inverts to the page's light ink there: the
 * same choice means "the page's own ink", which is what the row offers.
 */

/** One full trip around the hue wheel in `live` mode, in seconds. */
export const HUE_PERIOD_S = 42

/**
 * The fixed palettes, per surface mode.
 *
 * `black` is the page ink at full strength: `{0,0,0}` on a light page and the
 * host's light-ink grey on a dark one (pure black would vanish there).
 *
 * `blue` is the DeepSeek brand blue: `rgb(65,118,230)` in light, the fixed
 * `#4176e6` the token layer also uses for `deepseek-500` (see the ramp note in
 * `tokens.js`); `rgb(122,170,255)` is its lifted counterpart for the dark
 * surface. These are the values the removed `deepseek` entry carried, so the row
 * offers the product's blue under its own name.
 *
 * `deepseek` IS GONE AS AN ID, NOT AS A COLOUR. The row offers three values and
 * a stored `deepseek` preference belongs on `blue` (see `normalizedInk` in
 * `ocean.js` and `clampWhaleInk` in `constants.js`), which is now literally the
 * same ink — so a saved preference keeps its exact colour.
 */
export const WHALE_BASE = {
  black: {
    light: { r: 0, g: 0, b: 0 },
    dark: { r: 238, g: 237, b: 232 },
  },
  blue: {
    light: { r: 65, g: 118, b: 230 },
    dark: { r: 122, g: 170, b: 255 },
  },
}

/** HSV → RGB, used only by the animated mode. */
function hsv(h, s, v) {
  const c = v * s
  const hh = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs(hh % 2 - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hh < 1) { r = c; g = x } else if (hh < 2) { r = x; g = c } else if (hh < 3) { g = c; b = x }
  else if (hh < 4) { g = x; b = c } else if (hh < 5) { r = x; b = c } else { r = c; b = x }
  const m = v - c
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

/**
 * The whale colour for a mode at a moment.
 *
 * @param ink `black` | `blue` | `live`; anything else paints black.
 * @param options.dark paint for the dark surface (lifts the colour).
 * @param options.time seconds; only `live` reads it. Anything non-finite is 0,
 *        so a first frame at an undefined timestamp still paints a colour.
 * @returns `{ r, g, b }`
 */
export function whaleInkColor(ink, options) {
  const opts = options || {}
  const dark = opts.dark === true
  // EXACTLY THREE VALUES. An unknown value is the DEFAULT, not the animated
  // mode: falling through to the hue walk would make a hand-edited storage or a
  // preset from another build show a colour the row cannot name (and a stored
  // `deepseek`, which this row no longer offers, must not come back as a walk).
  const fixed = WHALE_BASE[ink] || WHALE_BASE.black
  if (ink !== 'live') {
    const base = dark ? fixed.dark : fixed.light
    return { r: base.r, g: base.g, b: base.b }
  }
  // `live`: the hue walk. Saturation/value are FIXED and mode-aware rather than
  // cycling: a hue wheel at constant V drops a bright yellow next to a dark
  // indigo, and the animals would pulse in brightness as they change colour.
  // Holding S/V makes the change a pure hue rotation.
  const raw = Number(opts.time)
  const time = Number.isFinite(raw) ? raw : 0
  const hue = (time / HUE_PERIOD_S) * 360
  return dark ? hsv(hue, 0.52, 0.95) : hsv(hue, 0.78, 0.62)
}

/**
 * `{ r, g, b }` → the `rgba(...)` string a canvas `fillStyle` wants.
 *
 * Kept here beside the colour maths so the renderer never re-derives it, and so
 * a whale cell and a whale edge cannot drift into two different string formats.
 */
export function whaleCss(color, alpha) {
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1
  return 'rgba(' + Math.round(color.r) + ',' + Math.round(color.g) + ',' + Math.round(color.b)
    + ',' + a.toFixed(3) + ')'
}
