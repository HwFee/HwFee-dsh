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
  assert.deepEqual(on.sans.slice(0, 3), ['anthropic-sans', 'anthropic-cjk', 'system-ui'])
  assert.deepEqual(on.mono.slice(0, 3), ['anthropic-mono', 'anthropic-cjk', 'ui-monospace'])
  assert.ok(on.sans.indexOf('anthropic-cjk') < on.sans.indexOf('Segoe UI'))
  assert.ok(on.mono.indexOf('anthropic-cjk') < on.mono.indexOf('Cascadia Mono'))
  assert.deepEqual(on.serif.slice(0, 3), ['anthropic-serif', 'anthropic-cjk-serif', 'ui-serif'])
  assert.ok(!on.serif.slice(0, on.serif.indexOf('ui-serif')).includes('anthropic-cjk'))
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
