import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fontStackCss, fontFaceCss, preferredCjkStackCss, CJK_WEIGHT_RANGE } from '../client/src/fonts.js'
import { buildCssFor } from '../client/src/styles.js'
import { DEFAULT_STATE, sanitize } from '../client/src/constants.js'
import { createSettingsStore } from '../client/src/settings.js'
import { buildTokens } from '../client/src/tokens.js'
import { createThemeBridge } from '../client/src/theme.js'
import { createPanel } from '../client/src/panel.js'
import { en, zh, makeTranslator } from '../client/src/locales.js'

function declarations(css, variables = {}) {
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) variables[match[1]] = match[2]
  return variables
}
function expand(value, variables) {
  for (let pass = 0; pass < 12 && /var\(/.test(value); pass += 1) {
    value = value.replace(/var\((--[\w-]+)\)/g, function (_, name) {
      assert.ok(Object.hasOwn(variables, name), 'missing variable ' + name)
      return variables[name]
    })
  }
  assert.ok(!/var\(/.test(value), 'all font-stack variables must resolve')
  return value.split(',').map(function (entry) { return entry.trim().replace(/^"|"$/g, '') })
}
function stacks(preferred) {
  // Model the documented cascade: :root values inherited, then body values
  // resolved alongside the host font tokens. This is not a rendering test.
  const vars = declarations(fontStackCss())
  declarations(preferredCjkStackCss(preferred), vars)
  return {
    sans: expand(vars['--font-anthropic-sans'], vars),
    mono: expand(vars['--font-anthropic-mono'], vars),
    serif: expand(vars['--font-anthropic-serif'], vars),
  }
}

test('Chinese preference defaults on, including old and malformed stored payloads', function () {
  assert.equal(DEFAULT_STATE.preferThemeCjk, true)
  for (const payload of [{}, null, { preferThemeCjk: 0 }, { preferThemeCjk: 'false' }]) {
    assert.equal(sanitize(payload).preferThemeCjk, true)
  }
  assert.equal(sanitize({ preferThemeCjk: false }).preferThemeCjk, false)
  const old = createSettingsStore({ getItem() { return JSON.stringify({ accent: 'sand', refine: false }) } })
  assert.equal(old.getState().preferThemeCjk, true)
  assert.equal(old.getState().accent, 'sand')
  assert.equal(old.getState().refine, false)
})

test('expanded Sans and Mono put calibrated CJK immediately behind Anthropic', function () {
  const on = stacks(true)
  // The Chinese arm comes STRAIGHT after the Latin face. It used to sit behind
  // `system-ui` and `Segoe UI`, so a Latin glyph the Anthropic face lacks fell
  // to Segoe while the Chinese glyph beside it landed in Noto Sans SC — the
  // Latin/Chinese split this switch exists to remove.
  assert.deepEqual(on.sans.slice(0, 2), ['anthropic-sans', 'anthropic-cjk'])
  assert.deepEqual(on.mono.slice(0, 2), ['anthropic-mono', 'anthropic-cjk'])
  assert.ok(on.sans.indexOf('anthropic-cjk') < on.sans.indexOf('system-ui'),
    'the CJK arm must precede every system Latin family: ' + on.sans.slice(0, 6).join(', '))
  assert.ok(on.sans.indexOf('anthropic-cjk') < on.sans.indexOf('Segoe UI'))
  assert.ok(on.mono.indexOf('anthropic-cjk') < on.mono.indexOf('ui-monospace'),
    'mono: the CJK arm precedes the first monospace system family')
  assert.ok(on.mono.indexOf('anthropic-cjk') < on.mono.indexOf('Cascadia Mono'))
  assert.deepEqual(on.serif.slice(0, 2), ['anthropic-serif', 'anthropic-cjk-serif'])
  assert.ok(on.serif.indexOf('anthropic-cjk-serif') < on.serif.indexOf('ui-serif'),
    'serif: the CJK serif arm precedes the generic serif family')
  assert.ok(!on.serif.slice(0, on.serif.indexOf('ui-serif')).includes('anthropic-cjk'))
})

/**
 * REGRESSION — the duplicated rung.
 *
 * `preferredCjkStackCss` expands `var(--font-sans-fallbacks)` and
 * `var(--font-cjk-sans)` to write a complete composite on `body`. Those tokens
 * already contain the embedded face, so the emitted stack carried
 * `anthropic-cjk` TWICE, with `system-ui` between the copies:
 *
 *   anthropic-sans, anthropic-cjk, system-ui, "Segoe UI", ..., anthropic-cjk, ...
 *
 * Rendering still looked right because the first copy matched, which is why it
 * went unnoticed. It is wrong for two reasons: a reader of the stylesheet cannot
 * tell which order is in force, and the Latin run reaches `system-ui` before any
 * CJK arm, so rare Latin glyphs and Chinese render in different typefaces.
 *
 * Verified to fail on the old shape: pointing the composites at
 * `var(--font-cjk-sans)` / `var(--font-sans-fallbacks)` again makes the
 * duplicate assertion red.
 */
test('no family is listed twice in an expanded stack', function () {
  const on = stacks(true)
  for (const role of ['sans', 'mono', 'serif']) {
    const seen = new Set()
    const dupes = []
    for (const family of on[role]) {
      const key = family.toLowerCase()
      if (seen.has(key)) dupes.push(family)
      seen.add(key)
    }
    assert.deepEqual(dupes, [], role + ' lists a family more than once: ' + dupes.join(', '))
  }
  // The embedded face is named exactly once per role.
  assert.equal(on.sans.filter(function (f) { return f === 'anthropic-cjk' }).length, 1)
  assert.equal(on.mono.filter(function (f) { return f === 'anthropic-cjk' }).length, 1)
  assert.equal(on.serif.filter(function (f) { return f === 'anthropic-cjk-serif' }).length, 1)
})

/**
 * REGRESSION — the `-rest` tokens must actually carry the system families.
 *
 * Splitting the embedded face out of `--font-cjk-sans` is only safe because
 * `--font-cjk-sans-rest` keeps every system family the old token had. Dropping
 * one would silently remove a platform from the fallback chain.
 */
test('the rest-tokens keep every system CJK family the full tokens had', function () {
  const vars = declarations(fontStackCss())
  const full = expand(vars['--font-cjk-sans'], vars)
  const rest = expand(vars['--font-cjk-sans-rest'], vars)
  assert.equal(full[0], 'anthropic-cjk', 'the full token still starts with the embedded face')
  assert.deepEqual(full.slice(1), rest, 'the rest token is the full token minus the embedded face')
  assert.ok(rest.includes('PingFang SC'))
  assert.ok(rest.includes('Microsoft YaHei'))
  assert.ok(!rest.includes('anthropic-cjk'))

  const fullSerif = expand(vars['--font-cjk-serif'], vars)
  const restSerif = expand(vars['--font-cjk-serif-rest'], vars)
  assert.equal(fullSerif[0], 'anthropic-cjk-serif')
  assert.ok(!restSerif.includes('anthropic-cjk-serif'))
})

test('off restores the entire original order and every unrelated CSS byte', function () {
  assert.equal(preferredCjkStackCss(false), '')
  const off = stacks(false)
  assert.deepEqual(off.sans.slice(0, 3), ['anthropic-sans', 'system-ui', 'Segoe UI'])
  assert.ok(off.sans.indexOf('anthropic-cjk') > off.sans.indexOf('Arial'))
  assert.deepEqual(off.mono.slice(0, 3), ['anthropic-mono', 'ui-monospace', 'Cascadia Mono'])
  const onSheet = buildCssFor(sanitize({}))
  const block = preferredCjkStackCss(true)
  assert.ok(onSheet.includes(block))
  assert.equal(buildCssFor(sanitize({ preferThemeCjk: false })), onSheet.replace('\n\n' + block, ''))
  assert.ok(buildCssFor(sanitize({ refine: false })).includes(block), 'not gated by refinement')
  assert.equal(buildCssFor(sanitize({ enabled: false })), '')
})

test('complete dynamic composites resolve on body, not root, without changing font faces or axes', function () {
  const css = preferredCjkStackCss(true)
  assert.ok(css.includes('\nbody {'))
  assert.ok(!css.includes(':root'))
  for (const role of ['sans', 'mono', 'serif']) assert.ok(css.includes('--font-anthropic-' + role + ':'))
  assert.ok(!css.includes('@font-face'))
  assert.ok(!css.includes('font-weight'))
  assert.equal(CJK_WEIGHT_RANGE, '300 800')
  assert.equal((fontFaceCss().match(/font-weight: 300 800;/g) || []).length, 8)
  assert.ok(!/--dsh-font-family-|--dsw-font-family:|--ds-font-family-code:/.test(css), 'explicit user picks untouched')
})

test('font preference persists, notifies, and preserves explicit user choices and other preferences', function () {
  let stored = JSON.stringify({ accent: 'ochre', preferThemeCjk: true })
  const storage = { getItem() { return stored }, setItem(key, value) { stored = value } }
  const store = createSettingsStore(storage)
  let notified = 0
  store.subscribe(function () { notified += 1 })
  store.setState({ preferThemeCjk: false })
  assert.equal(notified, 1)
  assert.equal(createSettingsStore(storage).getState().preferThemeCjk, false)
  assert.equal(createSettingsStore(storage).getState().accent, 'ochre')
  store.setState({ preferThemeCjk: true })
  assert.equal(notified, 2)
  assert.equal(createSettingsStore(storage).getState().preferThemeCjk, true)
  for (const preferred of [true, false]) {
    const tokens = buildTokens(sanitize({ preferThemeCjk: preferred }))
    assert.equal(tokens['--dsw-font-family'].light, 'var(--dsh-font-family-text, var(--font-anthropic-sans))')
    assert.equal(tokens['--ds-font-family-code'].light, 'var(--dsh-font-family-code, var(--font-anthropic-mono))')
  }
  const source = readFileSync(new URL('../client/src/fonts.js', import.meta.url), 'utf8')
  assert.ok(!/localStorage|setFontFamily|setItem\(/.test(source), 'stack selection never resets host or font-plugin picks')
})

test('the font-order switch is CSS-only and never re-registers tokens', function () {
  let state = sanitize({})
  let registrations = 0
  const bridge = createThemeBridge({
    getState() { return state },
    getTheme() { return { overrideTokens() { registrations += 1; return function () {} } } },
  })
  bridge.sync()
  state = sanitize({ preferThemeCjk: false })
  bridge.sync()
  state = sanitize({ preferThemeCjk: true })
  bridge.sync()
  assert.equal(registrations, 1)
  assert.deepEqual(buildTokens(sanitize({ preferThemeCjk: true })), buildTokens(sanitize({ preferThemeCjk: false })))
})

function reactStub() {
  return {
    createElement(type, props, ...children) {
      if (typeof type === 'function') return type(Object.assign({}, props, { children }))
      return { type, props: props || {}, children }
    },
    useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot() },
  }
}
function findSwitch(node) {
  if (!node || typeof node !== 'object') return null
  if (node.props && node.props.role === 'switch') return node
  for (const child of node.children || []) { const found = findSwitch(child); if (found) return found }
  return null
}

test('the localized appearance switch at order 43 operates in both directions', function () {
  for (const dictionary of [en, zh]) {
    const settings = createSettingsStore(null)
    const panel = createPanel({ React: reactStub(), primitives: {}, settings })
    const slot = panel.appearanceSlots.find(function (entry) { return entry.key === 'preferThemeCjk' })
    assert.ok(slot)
    assert.equal(slot.id, 'dsh-cds-theme-prefer-theme-cjk')
    assert.equal(slot.order, 43)
    assert.ok(!panel.slots.some(function (entry) { return entry.order === 42 }))
    const t = makeTranslator(dictionary)
    let button = findSwitch(slot.component({ t }))
    assert.equal(button.props['aria-checked'], true)
    assert.equal(button.props['aria-label'], dictionary['preferThemeCjk.title'])
    button.props.onClick()
    assert.equal(settings.getState().preferThemeCjk, false)
    button = findSwitch(slot.component({ t }))
    assert.equal(button.props['aria-checked'], false)
    button.props.onClick()
    assert.equal(settings.getState().preferThemeCjk, true)
  }
})
