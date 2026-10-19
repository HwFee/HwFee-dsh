import { PLUGIN_ID } from './constants.js'
import { buildTokens } from './tokens.js'
import { ACCENT_PRESETS, CLAY } from './palette.js'
import { mixColor } from './color.js'

/**
 * The bridge between the plugin's state and `ctx.theme.overrideTokens`.
 *
 * WHY `overrideTokens` RATHER THAN A STYLESHEET. The layout presenter applies
 * the active theme's tokens as INLINE custom properties on `<body>`:
 *
 *     for (const [name, value] of Object.entries(snapshot.active.tokens))
 *       body.style.setProperty(name, value)
 *
 * Inline declarations outrank any author stylesheet of equal importance, so a
 * `body { --dsw-alias-bg-base: … }` rule in a plugin sheet loses to whatever
 * the presenter wrote. There is no CSS-only way to recolour the app; the token
 * map itself has to change. `overrideTokens` stacks a partial layer over the
 * active theme per colour scheme, and the presenter consumes the composed
 * snapshot with no awareness that a layer exists. It also survives the user
 * flipping light/dark, because the layer carries both values.
 *
 * `overrideTokens` throws on a bare string — every entry must be a
 * `{ light, dark }` pair. `buildTokens` only ever emits pairs, and
 * `assertPairs` below re-checks before the call so a bug surfaces here rather
 * than inside the theme service.
 */

/** Fail loudly with the offending token name rather than inside the service. */
export function assertPairs(tokens) {
  for (const name of Object.keys(tokens)) {
    const value = tokens[name]
    if (value === null || typeof value !== 'object'
      || typeof value.light !== 'string' || typeof value.dark !== 'string') {
      throw new TypeError('dsh-cds-theme: token "' + name + '" must be a { light, dark } pair of strings')
    }
  }
  return tokens
}

/**
 * The two focus-glow colours, derived from the accent so a non-clay accent
 * still glows in its own hue instead of glowing orange.
 *
 * The alpha values come from CDS's own focus shadow: 0.25 in light mode and
 * 0.35 in dark, where a dark canvas needs more bloom for the ring to read.
 */
export function buildGlow(state) {
  const preset = ACCENT_PRESETS.find(function (entry) { return entry.id === state.accent })
  const lightBase = preset === undefined ? CLAY.light.clay : preset.light
  const darkBase = preset === undefined ? CLAY.dark.clay : preset.dark
  return {
    light: glow(lightBase, 0.25),
    dark: glow(darkBase, 0.35),
  }
}

function glow(base, alpha) {
  const hex = String(base).replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return base
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
}

/**
 * Own the override layer for one plugin lifetime.
 *
 * `sync()` recomputes the layer and re-registers it. Re-registering with the
 * same source replaces that source's whole layer and restacks it on top, which
 * is exactly the behaviour a settings change needs: no accumulation, no stale
 * tokens left behind from a previous accent.
 */
export function createThemeBridge({ getState, getTheme }) {
  let dispose = null
  let warned = false
  let lastSignature = ''
  // The host theme service publishes `theme/change` SYNCHRONOUSLY from inside
  // `overrideTokens()` (and from the disposer). Our own `theme/change`
  // listener calls `sync()`, so a registration would otherwise re-enter this
  // function *before* the outer call has stored the disposer it just got back:
  // the nested call registers a second layer, the outer assignment then stores
  // the disposer of the now-replaced layer, and the disposer's identity guard
  // makes every later release a silent no-op — i.e. "turning the theme OFF does
  // nothing". One sync at a time is enough; the nested pass is always a no-op
  // by construction (same state, work already in flight).
  let syncing = false

  function signatureOf(state) {
    // Everything that changes the TOKEN MAP belongs here. `thinkingLabelBlue`
    // swaps the two deep-diving label tokens, so a toggle that did not
    // re-register the layer would look dead.
    return [
      state.enabled, state.warmth, state.accent, state.radiusScale,
      state.elevation, state.thinkingLabelBlue,
    ].join('|')
  }

  function sync() {
    if (syncing) return
    syncing = true
    try {
      syncOnce()
    } finally {
      syncing = false
    }
  }

  function syncOnce() {
    const theme = getTheme()
    if (theme === null || typeof theme.overrideTokens !== 'function') {
      // No service: stylesheet-only. Warn ONCE, but do NOT latch a "gave up"
      // flag — every later sync retries, so a service that registers a moment
      // after this plugin still gets picked up. An earlier version latched and
      // silently never applied a token.
      if (!warned) {
        console.warn('dsh-cds-theme: ctx.theme unavailable; colour tokens not applied')
        warned = true
      }
      return
    }
    // The service is here now; re-arm the warning for a future outage.
    warned = false

    const state = getState()
    const signature = signatureOf(state)
    if (dispose !== null && signature === lastSignature) return

    if (!state.enabled) {
      // Disabling must RELEASE the layer, not set it to something neutral:
      // the composed snapshot then falls back to the active theme's own
      // tokens and the stock UI returns exactly.
      if (dispose !== null) { dispose(); dispose = null }
      lastSignature = signature
      return
    }

    const tokens = assertPairs(buildTokens(state))
    // `overrideTokens` returns a disposer that only removes the layer it
    // created; a newer registration for the same source wins. Dropping the old
    // disposer is therefore correct — calling it after a re-registration is a
    // documented no-op. The disposer MUST be stored before anything can
    // re-enter `sync()`; the `syncing` guard above is what guarantees it is.
    dispose = theme.overrideTokens(PLUGIN_ID, tokens)
    lastSignature = signature
  }

  function release() {
    if (dispose !== null) {
      dispose()
      dispose = null
    }
    lastSignature = ''
  }

  return { sync, release }
}
