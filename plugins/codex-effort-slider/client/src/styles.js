/**
 * The plugin's stylesheet, as a string plus install/remove helpers.
 *
 * COLOUR POLICY (this is the one place the port deliberately differs from a pure
 * copy):
 *   · the SHELL — track background, tick dots, error text, focus ring, the
 *     settings popover and its type — reads the host's own `--dsw-*` tokens, so it
 *     follows light/dark and any theme plugin without knowing about them;
 *   · the ENERGY LAYER — the blue→violet gradient, the white knob, the star dots —
 *     does NOT. That gradient is the feature's encoding (one colour per level,
 *     "energised" toward the right), so remapping it onto theme tokens would delete
 *     the thing the user asked for. Keeping it fixed is the correct choice, not an
 *     oversight.
 *
 * Every rule is scoped under `.ces-` / `.ces-set`, and the stylesheet tag carries
 * `data-plugin-css=<package id>`, so a re-mount replaces rather than stacks.
 */

import {
  KNOB_RADIUS,
  KNOB_SIZE,
  STYLE_MARKER,
  TRACK_HEIGHT,
} from './constants.js'

/** Left-rounded caps: the fill, the energy layer and the star layer share this. */
const FILL_RADIUS = 'border-radius:' + KNOB_RADIUS + 'px 0 0 ' + KNOB_RADIUS + 'px'

/**
 * The UI font stack.
 *
 * `--dsw-font-family-ui` is published by `dsh-system-fonts` (see AGENTS.md §十二)
 * and falls back to the host's text family; the literal stack at the end only
 * exists for a host that publishes neither. Using the token instead of a hardcoded
 * `system-ui` list is what makes the popover follow the user's UI font.
 */
const UI_FONT = "var(--dsw-font-family-ui, var(--dsw-font-family, system-ui, -apple-system, 'Segoe UI', sans-serif))"

/**
 * The opacity fade on the two energy layers.
 *
 * This is the CSS `ease` curve written out rather than named, because the FEEL of the
 * fade is part of the ported interaction: substituting a different curve (or another
 * plugin's easing token, whose value is a different bezier) would change how the
 * energy layer appears. Naming the curve keeps the value identical while making it
 * explicit instead of hiding behind a generic keyword.
 */
const FADE_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)'

/** The sheet. One array entry per rule keeps the diffs readable and reviewable. */
export const CSS_RULES = [
  /* The container appended INTO the host's effort row: wraps to a second line and fills it. */
  '.ces-inline{--ces-accent:var(--dsw-alias-state-business-primary,#4d93f8);box-sizing:border-box;flex-basis:100%;width:100%;min-width:0;font-family:' + UI_FONT + '}',
  '.ces-track{position:relative;box-sizing:border-box;height:' + TRACK_HEIGHT + 'px;margin-top:2px;border-radius:999px;background:var(--dsw-alias-border-l1,rgba(15,17,21,.08));cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}',
  '.ces-track:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--ces-accent));outline-offset:2px}',
  '.ces-track[aria-disabled="true"]{cursor:default}',
  '.ces-fill{position:absolute;top:0;bottom:0;left:0;' + FILL_RADIUS + ';pointer-events:none}',
  '.ces-tick{position:absolute;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:rgba(128,128,128,.30);background:color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 26%,transparent);pointer-events:none}',
  '.ces-tick[data-on="1"]{background:rgba(255,255,255,.5)}',
  /* Knob diameter == track height, so the circle fills the pipe mouth without a clipped flat edge. */
  '.ces-knob{position:absolute;top:50%;width:' + KNOB_SIZE + 'px;height:' + KNOB_SIZE + 'px;margin:' + (-KNOB_RADIUS) + 'px 0 0 ' + (-KNOB_RADIUS) + 'px;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.34),0 0 0 .5px rgba(0,0,0,.06);pointer-events:none}',
  '.ces-error{margin-top:6px;font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary,#e5484d)}',

  /* Energy layer (pure visual). Strength comes from ONE variable, --ces-energy (0..1):
     the outer layers only animate opacity/box-shadow, so the fade-in is a compositor
     colour interpolation rather than per-frame JS style writes. When off, particles are
     paused instead of being left to burn GPU invisibly. */
  '.ces-inline[data-energy="1"] .ces-track{box-shadow:0 0 calc(var(--ces-energy,0) * 16px) rgba(168,85,247,.5)}',
  '.ces-inline[data-energy="0"] .ces-star,.ces-inline[data-energy="0"] .ces-energy__sweep{animation-play-state:paused}',
  /* The energy layer covers the FILLED segment only (same width as the fill), so the
     part of the track right of the knob stays plain. */
  '.ces-energy{position:absolute;top:0;bottom:0;left:0;' + FILL_RADIUS + ';overflow:hidden;pointer-events:none;opacity:var(--ces-energy,0);transition:opacity .2s ' + FADE_EASING + ';background:linear-gradient(90deg,#3b1178 0%,#6d28d9 30%,#9333ea 62%,#c084fc 100%)}',
  /* Stars get their own layer so they do NOT fade in with the nebula (at high the
     nebula is only 0.5 opaque, which would halve every star's visibility). */
  '.ces-stars{position:absolute;top:0;bottom:0;left:0;' + FILL_RADIUS + ';overflow:hidden;pointer-events:none;transition:opacity .2s ' + FADE_EASING + '}',
  /* A star is a full-width track doing the crossing, with the dot at its right edge, so
     the trail only fades at the two ends — which are outside the visible area.

     DURATION AND PHASE ARE INLINE, NOT CSS VARIABLES. Measured in the real host: with
     `animation-delay:var(--ces-delay)` in the sheet a negative phase does not apply, and
     opening the menu piles every star at the start line for ten-odd seconds. `--ces-b`
     is fine as a variable because it does not participate in animation timing. */
  '.ces-star{position:absolute;left:0;right:0;height:3px;margin-top:-1.5px;pointer-events:none;animation-name:ces-star-sweep;animation-timing-function:linear;animation-iteration-count:infinite}',
  '.ces-star__dot{position:absolute;left:100%;top:0;width:3px;height:3px;margin-left:-1.5px;border-radius:50%;background:#fff;box-shadow:0 0 4px rgba(255,255,255,.85);opacity:var(--ces-b,1);transform:scale(var(--ces-b,1))}',
  '@keyframes ces-star-sweep{0%{transform:translate3d(0,0,0);opacity:0}6%{opacity:1}94%{opacity:1}100%{transform:translate3d(-100%,0,0);opacity:0}}',
  '.ces-energy__sweep{position:absolute;inset:0;background:linear-gradient(100deg,transparent 18%,rgba(255,255,255,.30) 50%,transparent 82%);transform:translateX(100%);animation:ces-sweep 2.4s linear infinite}',
  '@keyframes ces-sweep{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}',
  'body[data-ds-dark-theme] .ces-star__dot{background:#f5f3ff;box-shadow:0 0 5px rgba(216,180,254,.95)}',

  /* Reduced motion STOPS, it does not slow down. The repository rule is explicit:
     "not slower — not moving". So the sweep is removed and the stars are not animated
     at all; the caller additionally skips building the star nodes and skips the
     frame loop, so this media query is the last line of defence rather than the only
     one. The knob still tracks the pointer (that is not decoration — it is the
     control's state) but it does so without interpolation. */
  '@media (prefers-reduced-motion: reduce){.ces-star,.ces-energy__sweep{animation:none;display:none}.ces-energy,.ces-stars{transition:none}}',

  /* Settings popover — mounted on body, so its rules must be global (still prefixed).
     The shell (fill, stroke, shadow, type) is the host's: a theme plugin that remaps
     `--dsw-elevation-prominent` or the label tokens restyles this popover too, which is
     the point. The ENERGY colours above stay fixed by design. */
  '.ces-set{position:fixed;z-index:2147483000;min-width:252px;max-width:340px;padding:10px 12px;border-radius:var(--dsw-radius-md,10px);box-sizing:border-box;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1b1c20);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.28));box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.24));font:13px/1.5 ' + UI_FONT + '}',
  '.ces-set__title{font-weight:600;margin:0 0 6px 0}',
  '.ces-set__row{font-size:12px;color:var(--dsw-alias-label-tertiary,#6b6f76);margin-bottom:8px}',
  '.ces-set__group{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;border:0;padding:0;margin-inline:0}',
  '.ces-set__group label{display:flex;gap:6px;align-items:center;cursor:pointer}',
  '.ces-set__legend{font-size:12px;color:var(--dsw-alias-label-tertiary,#6b6f76);margin-bottom:4px;padding:0}',
  '.ces-set__actions{display:flex;justify-content:space-between;gap:8px}',
  '.ces-set button{cursor:pointer;font:inherit;color:inherit;padding:4px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:transparent}',
  '.ces-set button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}',
  '.ces-set button:focus-visible,.ces-set input:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d93f8));outline-offset:2px}',
  '.ces-set input[type="radio"],.ces-set input[type="checkbox"]{accent-color:var(--dsw-alias-state-business-primary,#4d93f8)}',

  /* "Reached level" ticks: dim = same colour as unreached; hidden = gone. */
  '.ces-inline[data-reached-ticks="dim"] .ces-tick[data-on="1"]{background:rgba(128,128,128,.30);background:color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 26%,transparent)}',
  '.ces-inline[data-reached-ticks="hidden"] .ces-tick[data-on="1"]{display:none}',
]

export const CSS = CSS_RULES.join('\n')

/**
 * The two dimensions the sheet owns, re-exported so a test can assert the RELATIONSHIP
 * (knob diameter === track height) rather than restate two literals that could drift.
 */
export { TRACK_HEIGHT as TRACK_PX, KNOB_SIZE as KNOB_PX }

/**
 * Put the sheet in the document (idempotent) and hand back a disposer.
 *
 * The tag is looked up by our own marker first, so two mounts produce one sheet.
 * A failure here only costs looks, never function, so it never throws.
 *
 * @param {Document} doc
 * @returns {{ tag: Element | null, dispose: () => void }}
 */
export function installStyles(doc) {
  const empty = { tag: null, dispose: function () {} }
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return empty
  try {
    const existing = typeof doc.querySelector === 'function'
      ? doc.querySelector('style[data-plugin-css="' + STYLE_MARKER + '"]')
      : null
    if (existing) return { tag: existing, dispose: function () {} }
    const tag = doc.createElement('style')
    tag.setAttribute('data-plugin-css', STYLE_MARKER)
    tag.textContent = CSS
    doc.head.appendChild(tag)
    return {
      tag,
      dispose: function () {
        try {
          if (tag.parentNode) tag.parentNode.removeChild(tag)
        } catch (error) {
          /* the head may already be gone */
        }
      },
    }
  } catch (error) {
    return empty
  }
}
