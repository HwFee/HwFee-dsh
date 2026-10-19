import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildTokens, NON_COLOR_TOKENS, scaleShadow } from '../client/src/tokens.js'
import { buildGlow, assertPairs } from '../client/src/theme.js'
import { buildCssFor } from '../client/src/styles.js'
import { sanitize, DEFAULT_STATE, clampWarmth, clampRadiusScale, clampElevation, clampAccent } from '../client/src/constants.js'
import { parseColor, formatColor, mixColor, resolveSurface, contrast, composite } from '../client/src/color.js'
import { ACCENT_PRESETS, LIGHT_SURFACES, DARK_SURFACES, CLAY, RADII } from '../client/src/palette.js'

// ---------------------------------------------------------------- colour

test('parseColor accepts every form the host tokens use', function () {
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 })
  assert.deepEqual(parseColor('#d97757'), { r: 217, g: 119, b: 87, a: 1 })
  assert.deepEqual(parseColor('#0000000a'), { r: 0, g: 0, b: 0, a: 10 / 255 })
  assert.deepEqual(parseColor('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0, a: 0.5 })
  assert.deepEqual(parseColor('rgb(12, 34, 56)'), { r: 12, g: 34, b: 56, a: 1 })
  assert.equal(parseColor(''), null)
  assert.equal(parseColor('not-a-colour'), null)
  // The host's own static ramp uses 8-digit hex with alpha.
  assert.equal(parseColor('#f25a5a1f').a.toFixed(2), (31 / 255).toFixed(2))
})

test('formatColor round-trips and shortens translucent values', function () {
  assert.equal(formatColor({ r: 217, g: 119, b: 87, a: 1 }), '#d97757')
  assert.equal(formatColor({ r: 0, g: 0, b: 0, a: 0.5 }), 'rgba(0, 0, 0, 0.5)')
  // Three decimals, no trailing zero noise.
  assert.equal(formatColor({ r: 1, g: 2, b: 3, a: 0.12345 }), 'rgba(1, 2, 3, 0.123)')
})

test('mixColor interpolates and clamps its ratio', function () {
  assert.equal(mixColor('#000000', '#ffffff', 0), '#000000')
  assert.equal(mixColor('#000000', '#ffffff', 1), '#ffffff')
  assert.equal(mixColor('#000000', '#ffffff', 0.5), '#808080')
  // Out-of-range ratios clamp rather than extrapolate.
  assert.equal(mixColor('#000000', '#ffffff', 5), '#ffffff')
  assert.equal(mixColor('#000000', '#ffffff', -5), '#000000')
})

test('contrast matches known WCAG values', function () {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21)
  assert.equal(Math.round(contrast('#ffffff', '#ffffff')), 1)
  // Symmetric.
  assert.equal(contrast('#123456', '#abcdef'), contrast('#abcdef', '#123456'))
})

// -------------------------------------------------------------- surfaces

test('warmth 0 reproduces the host surface, 100 the CDS one', function () {
  for (const key of Object.keys(LIGHT_SURFACES)) {
    assert.equal(resolveSurface(LIGHT_SURFACES[key], 0), LIGHT_SURFACES[key].host)
    assert.equal(resolveSurface(LIGHT_SURFACES[key], 100), LIGHT_SURFACES[key].cds)
  }
  for (const key of Object.keys(DARK_SURFACES)) {
    assert.equal(resolveSurface(DARK_SURFACES[key], 0), DARK_SURFACES[key].host)
    assert.equal(resolveSurface(DARK_SURFACES[key], 100), DARK_SURFACES[key].cds)
  }
})

test('intermediate warmth produces a real blend, not a snap', function () {
  const mid = resolveSurface(LIGHT_SURFACES.canvas, 50)
  assert.notEqual(mid, LIGHT_SURFACES.canvas.host)
  assert.notEqual(mid, LIGHT_SURFACES.canvas.cds)
  assert.notEqual(parseColor(mid), null)
})

// ----------------------------------------------------------------- tokens

test('every token is a { light, dark } pair of strings', function () {
  const tokens = buildTokens(sanitize({}))
  assert.ok(Object.keys(tokens).length > 100, 'expected the full alias surface')
  // This is the exact contract ctx.theme.overrideTokens enforces: a bare
  // string throws a teaching error inside the service, so it must never get
  // that far.
  assertPairs(tokens)
  for (const name of Object.keys(tokens)) {
    assert.equal(typeof tokens[name].light, 'string', name + ' light')
    assert.equal(typeof tokens[name].dark, 'string', name + ' dark')
    assert.ok(tokens[name].light.length > 0, name + ' light is empty')
    assert.ok(tokens[name].dark.length > 0, name + ' dark is empty')
    // A token declared as a colour must not leak an unresolved var() that
    // points at a host static ramp we do not control.
    if (NON_COLOR_TOKENS.indexOf(name) < 0) {
      assert.ok(!/var\(--dsw-static-/.test(tokens[name].light), name + ' light leaks a host static token')
      assert.ok(!/var\(--dsw-static-/.test(tokens[name].dark), name + ' dark leaks a host static token')
    }
  }
})

test('assertPairs rejects a bare string with a useful message', function () {
  assert.throws(function () {
    assertPairs({ '--dsw-alias-bg-base': '#ffffff' })
  }, /must be a \{ light, dark \} pair/)
  assert.throws(function () {
    assertPairs({ '--dsw-alias-bg-base': { light: '#fff' } })
  }, /must be a \{ light, dark \} pair/)
})

test('colour tokens stay legible in BOTH palettes', function () {
  const tokens = buildTokens(sanitize({}))
  const cases = [
    ['--dsw-alias-label-primary', '--dsw-alias-bg-base', 4.5],
    ['--dsw-alias-label-secondary', '--dsw-alias-bg-base', 4.5],
    ['--dsw-alias-label-tertiary', '--dsw-alias-bg-base', 3.0],
    // The caption tier is the composer placeholder AND the code banner text.
    // It must not be lighter than tertiary: an earlier version made it #a5a5a5
    // (2.40:1) to look "quieter", which is below the 3.0 large-text floor.
    ['--dsw-alias-label-caption', '--dsw-alias-bg-base', 3.0],
    // The composer placeholder and every settings description are body-size
    // text on the INPUT/CARD surface, so they need AA, not the large-text floor.
    // Measured there, the spec's #8a8a8a was 3.45:1 and dark #7d7b76 was 4.12:1.
    ['--dsw-alias-label-caption', '--dsw-specific-input-major', 4.5],
    ['--dsw-alias-label-tertiary', '--dsw-specific-input-major', 4.5],
    ['--dsw-alias-label-tertiary', '--dsw-alias-settings-card-fill', 4.5],
    ['--dsw-alias-label-primary', '--dsw-specific-sidebar-fill', 4.5],
    ['--dsw-alias-label-primary', '--dsw-specific-input-major', 4.5],
    ['--dsw-alias-label-primary', '--dsw-alias-bg-layer-1', 4.5],
    ['--dsw-alias-link', '--dsw-alias-bg-base', 3.0],
    ['--dsw-alias-brand-text', '--dsw-alias-bg-base', 3.0],
    // White label text on a solid accent fill is the pair most likely to
    // regress when an accent preset changes.
    ['--dsw-alias-label-primary-foreground', '--dsw-alias-button-primary-fill', 4.5],
    ['--dsw-alias-label-primary-foreground', '--dsw-alias-button-info-fill', 4.5],
  ]
  for (const mode of ['light', 'dark']) {
    for (const [fg, bg, min] of cases) {
      // Composite onto the canvas: several fills (hover washes, bubbles) are
      // translucent, and a ratio measured against an uncomposited alpha value
      // is meaningless — that mistake once reported a 16:1 bubble as 1.15:1.
      const backdrop = tokens['--dsw-alias-bg-base'][mode]
      const ratio = contrast(tokens[fg][mode], tokens[bg][mode], backdrop)
      assert.ok(ratio >= min,
        mode + ': ' + fg + ' on ' + bg + ' is ' + ratio.toFixed(2) + ':1, needs ' + min + ':1')
    }
  }
})

test('diff row text clears AA over its own wash, on the canvas AND inside a card', function () {
  // THE REGRESSION: the host paints added/removed lines with
  // `color: state-success|error-primary` over a wash of the same hue. Light
  // success measured 2.89:1 and dark error 4.28:1 over the tool card's nested
  // fill, which is the worst case, so that is the one asserted.
  const tokens = buildTokens(sanitize({}))
  const rows = [
    ['--dsw-alias-state-success-primary', '--dsw-alias-code-diff-added'],
    ['--dsw-alias-state-error-primary', '--dsw-alias-code-diff-deleted'],
  ]
  for (const mode of ['light', 'dark']) {
    for (const [text, wash] of rows) {
      for (const surface of ['--dsw-alias-bg-base', '--dsw-alias-bg-layer-2']) {
        const under = tokens[surface][mode]
        const fill = composite(tokens[wash][mode], under)
        const ratio = contrast(tokens[text][mode], fill)
        assert.ok(ratio >= 4.5,
          mode + ': ' + text + ' over ' + wash + ' on ' + surface + ' is ' + ratio.toFixed(2) + ':1')
      }
    }
  }
})

test('translucent surfaces keep their text legible over the canvas', function () {
  // The user bubble is a 5% ink wash in light mode: it has no contrast of its
  // own, only a contrast over what it sits on. Same for the hover washes the
  // sidebar and menu rows use.
  const tokens = buildTokens(sanitize({}))
  const surfaces = [
    '--dsw-specific-bubble',
    '--dsw-specific-sidebar-nav-item-hover',
    '--dsw-alias-interactive-bg-hover',
    '--dsw-alias-markdown-code-block',
    '--dsw-alias-markdown-inline-code',
  ]
  for (const mode of ['light', 'dark']) {
    const canvas = tokens['--dsw-alias-bg-base'][mode]
    for (const surface of surfaces) {
      const ratio = contrast(tokens['--dsw-alias-label-primary'][mode], tokens[surface][mode], canvas)
      assert.ok(ratio >= 4.5,
        mode + ': text on ' + surface + ' is ' + ratio.toFixed(2) + ':1, needs 4.5:1')
    }
  }
})

test('the colour parser handles every format the host emits', function () {
  // The host authors its border ladder as hsla() and several fills as
  // 8-digit hex. A parser that silently returns null for those turns every
  // contrast assertion into a false pass.
  assert.equal(parseColor('hsla(0, 0%, 8%, 0.05)').a, 0.05)
  assert.equal(parseColor('hsla(0, 0%, 8%, 0.05)').r, 20, '8% lightness is #141414, not black')
  assert.equal(parseColor('hsl(210, 50%, 50%)').a, 1)
  assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 1 })
  assert.deepEqual(parseColor('hsl(120, 100%, 25%)'), { r: 0, g: 128, b: 0, a: 1 })
  assert.equal(parseColor('#ffffff0f').a, 15 / 255)

  // Round-trip through the compositor: a 50% white over black is mid-grey.
  const half = composite('rgba(255, 255, 255, 0.5)', '#000000')
  assert.equal(Math.round(half.r), 128)
  assert.equal(half.a, 1)
})

test('every accent preset keeps white label text legible', function () {
  for (const preset of ACCENT_PRESETS) {
    for (const accent of [preset.id]) {
      const tokens = buildTokens(sanitize({ accent: accent }))
      for (const mode of ['light', 'dark']) {
        const ratio = contrast(
          tokens['--dsw-alias-label-primary-foreground'][mode],
          tokens['--dsw-alias-button-primary-fill'][mode],
        )
        assert.ok(ratio >= 4.5,
          preset.id + ' ' + mode + ' fill carries ' + ratio.toFixed(2) + ':1')
      }
    }
  }
})

test('the solid accent fill deepens on hover in BOTH palettes', function () {
  // The fill carries a white label, so it can only ever get darker on hover.
  // CDS's brighten-on-hover rule belongs to the accent (rings, dots), which
  // carries no text — see the divergence documented in tokens.js.
  const tokens = buildTokens(sanitize({}))
  const luma = function (hex) {
    const c = parseColor(hex)
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  }
  for (const mode of ['light', 'dark']) {
    const fill = tokens['--dsw-alias-button-primary-fill'][mode]
    const hover = tokens['--dsw-alias-button-primary-hover'][mode]
    assert.ok(luma(hover) < luma(fill), mode + ': hover should deepen the fill')
  }
})

test('hover never drops the white label below AA', function () {
  // A hover state that fails contrast is worse than no hover state.
  for (const preset of ACCENT_PRESETS) {
    const tokens = buildTokens(sanitize({ accent: preset.id }))
    for (const mode of ['light', 'dark']) {
      const ratio = contrast(
        tokens['--dsw-alias-label-primary-foreground'][mode],
        tokens['--dsw-alias-button-primary-hover'][mode],
      )
      assert.ok(ratio >= 4.5,
        preset.id + ' ' + mode + ' hover carries ' + ratio.toFixed(2) + ':1')
    }
  }
})

test('code blocks stay dark in both palettes', function () {
  // Code blocks are painted from CODE_BACKGROUND by the stylesheet rather than
  // a token, but the markdown tokens they sit next to must not fight it: the
  // inline-code chip stays light so it does not punch a hole in prose.
  const tokens = buildTokens(sanitize({}))
  const luma = function (value) {
    const c = parseColor(value)
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  }
  assert.ok(luma(tokens['--dsw-alias-markdown-inline-code'].light) > 200,
    'inline code must stay a light chip in the light palette')
})

// --------------------------------------------------------------- shaping

test('radius scale multiplies the CDS table', function () {
  const base = buildTokens(sanitize({ radiusScale: 1 }))
  assert.equal(base['--dsw-radius-panel'].light, RADII.panel + 'px')
  assert.equal(base['--dsw-radius-xs'].light, RADII.xs + 'px')

  const doubled = buildTokens(sanitize({ radiusScale: 1.5 }))
  assert.equal(doubled['--dsw-radius-panel'].light, Math.round(RADII.panel * 1.5) + 'px')

  const halved = buildTokens(sanitize({ radiusScale: 0.5 }))
  assert.equal(halved['--dsw-radius-panel'].light, Math.round(RADII.panel * 0.5) + 'px')
})

test('the composer radius is CDS 20px, not the host 28px', function () {
  const tokens = buildTokens(sanitize({}))
  assert.equal(tokens['--dsw-radius-panel'].light, '20px')
  assert.equal(tokens['--dsw-radius-panel'].dark, '20px')
})

test('elevation scales every alpha in a shadow string', function () {
  // scaleShadow shortens the alpha it writes, so compare numerically rather
  // than on exact formatting.
  const alphas = function (shadow) {
    const out = []
    const re = /rgba\([^)]*?,\s*([\d.]+)\)/g
    let match = re.exec(shadow)
    while (match !== null) {
      out.push(Number(match[1]))
      match = re.exec(shadow)
    }
    return out
  }

  const full = scaleShadow('0 1px 2px 0 rgba(0, 0, 0, 0.40), 0 2px 8px 0 rgba(0, 0, 0, 0.20)', 100)
  assert.deepEqual(alphas(full), [0.4, 0.2])

  const half = scaleShadow('0 1px 2px 0 rgba(0, 0, 0, 0.40), 0 2px 8px 0 rgba(0, 0, 0, 0.20)', 50)
  assert.deepEqual(alphas(half), [0.2, 0.1])

  const zero = scaleShadow('0 1px 2px 0 rgba(0, 0, 0, 0.40)', 0)
  assert.deepEqual(alphas(zero), [0])

  // Above 100 amplifies, and the clamp stops runaway values.
  const amplified = scaleShadow('0 1px 2px 0 rgba(0, 0, 0, 0.40)', 150)
  assert.deepEqual(alphas(amplified), [0.6])
  const clamped = scaleShadow('0 1px 2px 0 rgba(0, 0, 0, 0.40)', 1000)
  assert.deepEqual(alphas(clamped), [0.8])

  // A shadow without rgba() is returned untouched.
  assert.equal(scaleShadow('0 0 0 1px red', 50), '0 0 0 1px red')
})

test('elevation 0 removes shadow opacity but keeps the structure', function () {
  const tokens = buildTokens(sanitize({ elevation: 0 }))
  assert.ok(/rgba\(0, 0, 0, 0\)/.test(tokens['--dsw-shadow-lv1'].light))
})

// ---------------------------------------------------------------- settings

test('sanitize clamps every out-of-range value', function () {
  const state = sanitize({
    warmth: 500,
    radiusScale: 99,
    elevation: -20,
    accent: 'not-a-real-accent',
    refine: 'yes',
  })
  assert.equal(state.warmth, 100)
  assert.equal(state.radiusScale, 1.5)
  assert.equal(state.elevation, 0)
  assert.equal(state.accent, DEFAULT_STATE.accent)
  assert.equal(state.refine, true)
})

test('sanitize fills in every missing field', function () {
  assert.deepEqual(sanitize({}), DEFAULT_STATE)
  assert.deepEqual(sanitize(null), DEFAULT_STATE)
  assert.deepEqual(sanitize('garbage'), DEFAULT_STATE)
})

test('clamps accept numeric strings and reject NaN', function () {
  assert.equal(clampWarmth('42'), 42)
  assert.equal(clampWarmth('abc'), DEFAULT_STATE.warmth)
  assert.equal(clampRadiusScale('1.25'), 1.25)
  assert.equal(clampElevation('150'), 150)
  assert.equal(clampAccent('graphite'), 'graphite')
  assert.equal(clampAccent(undefined), DEFAULT_STATE.accent)
})

test('disabling the theme is expressible and survives a round trip', function () {
  const off = sanitize({ enabled: false })
  assert.equal(off.enabled, false)
  assert.equal(sanitize(JSON.parse(JSON.stringify(off))).enabled, false)
})

// ------------------------------------------------------------------ glow

test('the focus glow follows the chosen accent', function () {
  const clay = buildGlow(sanitize({ accent: 'clay' }))
  const graphite = buildGlow(sanitize({ accent: 'graphite' }))
  assert.notEqual(clay.light, graphite.light)
  assert.match(clay.light, /^rgba\(\d+, \d+, \d+, 0\.25\)$/)
  assert.match(clay.dark, /^rgba\(\d+, \d+, \d+, 0\.35\)$/)
})

test('the clay glow is the clay hue', function () {
  const glow = buildGlow(sanitize({ accent: 'clay' }))
  const parsed = parseColor(glow.light)
  assert.equal(parsed.r, 217)
  assert.equal(parsed.g, 119)
  assert.equal(parsed.b, 87)
})

// -------------------------------------------------------------- coherence

test('no token is left pointing at a host bluish static', function () {
  // The host's static ramp is the thing being replaced. A leaked reference
  // would keep a patch of stock blue alive in an otherwise CDS surface.
  const tokens = buildTokens(sanitize({}))
  for (const name of Object.keys(tokens)) {
    if (NON_COLOR_TOKENS.indexOf(name) >= 0) continue
    assert.ok(!/--dsw-static-neutral-bluish/.test(tokens[name].light), name)
    assert.ok(!/--dsw-static-neutral-bluish/.test(tokens[name].dark), name)
  }
})

test('CLAY and the accent presets share a fill that passes AA', function () {
  // CLAY is the fallback when a preset id is unknown; it must be as safe as
  // the presets themselves.
  assert.ok(contrast(CLAY.light.fill, '#ffffff') >= 4.5)
  assert.ok(contrast(CLAY.dark.fill, '#ffffff') >= 4.5)
})

// ------------------------------- "original blue" for the thinking label

/**
 * THE THINKING-LABEL SWITCH. It exists for exactly one line of copy — the
 * "Deep diving for Ns…" label — and touches exactly two tokens. The host's
 * original blue values are `.repro/asar/theme-client.js`'s
 * `color-mix(deepseek-500 70%/30%, blue-950)` resolved to literals.
 */
const THINKING_BLUE_TOKENS = [
  '--dsw-alias-label-deep-diving',
  '--dsw-alias-label-deep-diving-shimmer',
]
const THINKING_CLAY = {
  '--dsw-alias-label-deep-diving': { light: '#d49b83', dark: '#9f5840' },
  '--dsw-alias-label-deep-diving-shimmer': { light: '#edd0c3', dark: '#9d634f' },
}
const THINKING_HOST_BLUE = {
  '--dsw-alias-label-deep-diving': { light: '#7d9ade', dark: '#3a61b5' },
  '--dsw-alias-label-deep-diving-shimmer': { light: '#a2befe', dark: '#4767b5' },
}

test('thinkingLabelBlue defaults off and sanitize tolerates old payloads', function () {
  assert.equal(DEFAULT_STATE.thinkingLabelBlue, false)
  assert.equal(sanitize({}).thinkingLabelBlue, false)
  // Old localStorage payloads have no field at all.
  assert.equal(sanitize({ warmth: 40, refine: false }).thinkingLabelBlue, false)
  assert.equal(sanitize({ thinkingLabelBlue: true }).thinkingLabelBlue, true)
  // A hand-edited payload must not turn a truthy string into "on".
  assert.equal(sanitize({ thinkingLabelBlue: 'yes' }).thinkingLabelBlue, false)
  assert.equal(sanitize({ thinkingLabelBlue: 1 }).thinkingLabelBlue, false)
  assert.equal(sanitize(JSON.parse(JSON.stringify({ thinkingLabelBlue: true }))).thinkingLabelBlue, true)
})

test('OFF keeps exactly the clay thinking-label values', function () {
  const tokens = buildTokens(sanitize({}))
  for (const name of THINKING_BLUE_TOKENS) {
    assert.deepEqual(tokens[name], THINKING_CLAY[name], name)
  }
})

test('ON restores exactly the host blue thinking-label values', function () {
  const tokens = buildTokens(sanitize({ thinkingLabelBlue: true }))
  for (const name of THINKING_BLUE_TOKENS) {
    assert.deepEqual(tokens[name], THINKING_HOST_BLUE[name], name)
  }
})

test('the thinking-label switch changes two tokens and nothing else', function () {
  const clay = buildTokens(sanitize({ thinkingLabelBlue: false }))
  const blue = buildTokens(sanitize({ thinkingLabelBlue: true }))
  const names = new Set(Object.keys(clay).concat(Object.keys(blue)))
  const changed = []
  for (const name of names) {
    const a = clay[name]
    const b = blue[name]
    if (a === undefined || b === undefined || a.light !== b.light || a.dark !== b.dark) changed.push(name)
  }
  assert.deepEqual(changed.sort(), THINKING_BLUE_TOKENS.slice().sort())
  assert.equal(changed.length, 2, 'the label and its shimmer only — no accent, ramp or rings')
})

test('both thinking-label states keep {light,dark} pairs and pass assertPairs', function () {
  for (const thinkingLabelBlue of [false, true]) {
    const tokens = buildTokens(sanitize({ thinkingLabelBlue: thinkingLabelBlue }))
    assertPairs(tokens)
    for (const name of THINKING_BLUE_TOKENS) {
      assert.equal(typeof tokens[name].light, 'string', name + ' light')
      assert.equal(typeof tokens[name].dark, 'string', name + ' dark')
      assert.ok(tokens[name].light.length > 0)
      assert.ok(tokens[name].dark.length > 0)
    }
  }
})

test('no other setting — or legacy key — touches the accent/brand blue track', function () {
  // The big keepBrandBlue feature was removed: the accent track is always the
  // CDS clay mapping and only the accent-preset row changes it.
  assert.equal(Object.hasOwn(DEFAULT_STATE, 'keepBrandBlue'), false)
  assert.equal(Object.hasOwn(sanitize({ keepBrandBlue: true }), 'keepBrandBlue'), false,
    'an old payload must not resurrect the removed switch')

  const variants = [
    {},
    { warmth: 0, radiusScale: 0.5, elevation: 0 },
    { warmth: 50, radiusScale: 1.5, elevation: 200 },
    { refine: false },
    { enabled: false },
    { thinkingLabelBlue: true },
    { thinkingLabelBlue: false },
  ]
  for (const variant of variants) {
    const tokens = buildTokens(sanitize(variant))
    assert.equal(tokens['--dsw-alias-state-business-primary'].light, '#d97757',
      'accent stays clay for ' + JSON.stringify(variant))
    assert.equal(tokens['--dsw-alias-link'].light, '#a55a42',
      'link stays clay for ' + JSON.stringify(variant))
    assert.equal(tokens['--dsw-static-deepseek-500'].light, '#d77150',
      'brand ramp stays clay for ' + JSON.stringify(variant))
    assert.ok(tokens['--dsw-gradient-onboarding-violet-stops'].light.startsWith('#c6613f'),
      'onboarding rings stay warm for ' + JSON.stringify(variant))
    assert.equal(tokens['--dsw-alias-onboarding-accent'].light, '#d97757',
      'onboarding accent stays clay for ' + JSON.stringify(variant))
  }

  // The accent preset is still the one thing that drives the accent track.
  const graphite = buildTokens(sanitize({ accent: 'graphite' }))
  assert.notEqual(graphite['--dsw-alias-state-business-primary'].light, '#d97757')
})

// --------------------------- retired per-item switches load and are ignored

test('legacy payloads carrying retired switches load fine', function () {
  // User decisions: the hover-reveal and scroll-fade effects kept, their two
  // switches removed; the Windows-titlebar feature deleted outright. Old
  // localStorage payloads still contain the fields; they must load without
  // error and be dropped by sanitize.
  const legacy = sanitize({
    warmth: 40,
    revealActions: false,
    scrollFades: false,
    desktopTitlebar: false,
    someOtherRetiredKey: true,
  })
  assert.equal(legacy.warmth, 40)
  assert.equal(Object.hasOwn(legacy, 'revealActions'), false)
  assert.equal(Object.hasOwn(legacy, 'scrollFades'), false)
  assert.equal(Object.hasOwn(legacy, 'desktopTitlebar'), false)
  assert.equal(Object.hasOwn(DEFAULT_STATE, 'revealActions'), false)
  assert.equal(Object.hasOwn(DEFAULT_STATE, 'scrollFades'), false)
  assert.equal(Object.hasOwn(DEFAULT_STATE, 'desktopTitlebar'), false)
  // The token map is untouched by a payload carrying the old fields: it equals
  // the same sanitized state WITHOUT those fields.
  assert.deepEqual(buildTokens(legacy), buildTokens(sanitize({ warmth: 40 })))
})

// ---------------------- retired per-item switches stay token-free

test('the retired codeBlockDetails field never reaches the token layer', function () {
  // The switch was deleted after the user verified the look, so it is no longer
  // state at all. What still matters: a legacy payload carrying it must produce
  // the same token map as one without it — these style-only items have never had
  // a token of their own, and a stale field must not become one.
  const base = buildTokens(sanitize({}))
  const key = 'codeBlockDetails'
  assert.equal(Object.hasOwn(DEFAULT_STATE, key), false, key + ' is no longer state')
  for (const value of [false, true, 'no', 0]) {
    const payload = sanitize({ [key]: value })
    assert.equal(Object.hasOwn(payload, key), false, 'the retired field is dropped')
    assert.deepEqual(buildTokens(payload), base, key + ' must not move one token')
  }
})

test('the retired markdownBody field never reaches the token layer', function () {
  // Same contract for the marker + stylesheet item: the marker still runs (now
  // gated on `enabled && refine`), but the token map is untouched.
  const base = buildTokens(sanitize({}))
  const key = 'markdownBody'
  assert.equal(Object.hasOwn(DEFAULT_STATE, key), false, key + ' is no longer state')
  for (const value of [false, true, 'no', 0]) {
    const payload = sanitize({ [key]: value })
    assert.equal(Object.hasOwn(payload, key), false, 'the retired field is dropped')
    assert.deepEqual(buildTokens(payload), base, key + ' must not move one token')
  }
})

// ------------------------------------------- the replication batch, solidified

test('no replication switch remains, and every solid one is still in the sheet', function () {
  const base = buildTokens(sanitize({}))

  // NO per-item switch is state any more. All seven were retired: two accepted
  // early, four deleted as invisible, three solidified on the last round.
  for (const retired of ['codeBlockDetails', 'markdownBody',
    'attachments', 'statusPulse', 'concentricRadius', 'disclosurePolish',
    'footnotes', 'statTypography', 'buttonSpring']) {
    assert.equal(retired in DEFAULT_STATE, false, retired + ' is no longer state')
    assert.equal(retired in sanitize({ [retired]: false }), false,
      retired + ' must not reach the sanitized state')
    // A stale stored `false` must not change the sheet either.
    assert.equal(buildCssFor(sanitize({ [retired]: false })), buildCssFor(sanitize({})),
      retired + ' must be inert in an old payload')
  }

  // The three SOLIDIFIED looks are unconditional parts of the sheet now, and
  // they survive `refine: false` (they are type/motion vocabulary, not component
  // refinement). `enabled: false` is the only thing that removes them.
  const solid = [
    ['footnotes', '[data-footnotes]'],
    ['buttonSpring', '.dct-toggle:active'],
    ['statTypography', '[data-composer-stat]'],
  ]
  for (const [name, marker] of solid) {
    assert.ok(String(buildCssFor(sanitize({}))).includes(marker), name + ' must be in the default sheet')
    assert.ok(String(buildCssFor(sanitize({ refine: false }))).includes(marker),
      name + ' must survive refine=false — it is not component refinement')
    assert.equal(buildCssFor(sanitize({ enabled: false })), '',
      name + ' leaves with the master switch')
  }

  // And none of this moves the token layer.
  assert.deepEqual(buildTokens(sanitize({ refine: false })), base,
    'the solid rules are stylesheet-only')
})
