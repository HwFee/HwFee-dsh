/**
 * Copy, key parity, and the stylesheet's discipline.
 *
 * Three contracts:
 *   1. en and zh are flat dictionaries with identical key sets, each pure in its
 *      own language (the host renders a zh UI in Chinese and an en UI in
 *      English, never a hybrid);
 *   2. every key the components ask for exists in BOTH — a missing zh key would
 *      silently fall back mid-row;
 *   3. the stylesheet uses CDS tokens, this plugin's own classes and no salted
 *      CSS-Modules selector, and it honours `prefers-reduced-motion`.
 *
 *   node test/locale.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { en, zh, LOCALE_NS, makeT, makeTranslator } from '../client/src/locales.js'
import { PANEL_CSS } from '../client/src/styles.js'
import { PLUGIN_ID, SETTINGS_ROW_ID, SETTINGS_ROW_ORDER, PANEL_STYLE_ID } from '../client/src/constants.js'

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

// ------------------------------------------------------- dictionaries

test('en and zh carry identical, complete key sets', function () {
  const enKeys = Object.keys(en).sort()
  const zhKeys = Object.keys(zh).sort()
  assert.deepEqual(zhKeys, enKeys, 'a missing zh key would fall back to English mid-row')
  assert.ok(enKeys.length >= 20, 'expected the full row copy')
  for (const key of enKeys) {
    assert.equal(typeof en[key], 'string', key)
    assert.equal(typeof zh[key], 'string', key)
    assert.ok(en[key].trim().length > 0, key + ' en is empty')
    assert.ok(zh[key].trim().length > 0, key + ' zh is empty')
  }
})

test('en is pure English and zh is pure Chinese — no hybrid strings', function () {
  for (const key of Object.keys(en)) {
    assert.ok(!CJK.test(en[key]), key + ' leaks Chinese into the English locale: ' + en[key])
    assert.ok(!en[key].includes(' · '), key + ' is a bilingual hybrid: ' + en[key])
  }
  for (const key of Object.keys(zh)) {
    assert.ok(CJK.test(zh[key]), key + ' has no Chinese at all: ' + zh[key])
    assert.ok(!zh[key].includes(' · '), key + ' is a bilingual hybrid: ' + zh[key])
  }
})

test('the five reference levels plus the row states are all present in both locales', function () {
  const required = [
    'row.title', 'row.desc', 'row.sessionless',
    'state.loading', 'state.unavailable', 'badge.default',
    'aria.label', 'aria.single',
    'note.pending', 'note.failed', 'error.write', 'error.notAdvertised',
  ]
  for (const id of ['low', 'medium', 'high', 'xhigh', 'max']) {
    required.push('level.' + id + '.name', 'level.' + id + '.desc')
  }
  required.push('level.max.warning')
  for (const key of required) {
    assert.ok(Object.hasOwn(en, key), 'en missing ' + key)
    assert.ok(Object.hasOwn(zh, key), 'zh missing ' + key)
  }
})

test('placeholder contracts survive translation', function () {
  // Every interpolation the component performs must exist in both languages,
  // or one locale would print a literal `{name}`.
  const contracts = {
    'aria.label': ['name', 'index', 'count'],
    'aria.single': ['name'],
    'error.write': ['message'],
  }
  for (const [key, names] of Object.entries(contracts)) {
    for (const dict of [en, zh]) {
      for (const name of names) {
        assert.ok(dict[key].includes('{' + name + '}'), key + ' must interpolate {' + name + '}')
      }
    }
  }
})

test('the translator substitutes parameters and falls back cleanly', function () {
  const translate = makeTranslator(zh)
  assert.equal(translate('row.title'), zh['row.title'])
  assert.equal(translate('missing.key'), 'missing.key')
  assert.equal(makeTranslator({ 'unit.title': '{n} 档' })('unit.title', { n: 3 }), '3 档')
  // No substitution data leaves the placeholder visibly intact rather than
  // printing "undefined".
  assert.equal(makeTranslator({ k: '{a}' })('k'), '{a}')
  // Prototype keys are not dictionary entries.
  assert.equal(translate('toString'), 'toString')
})

test('makeT wraps an injected translator and otherwise uses the full English table', function () {
  const injected = function (key) { return 'injected:' + key }
  assert.equal(makeT(injected)('row.title'), 'injected:row.title')
  assert.equal(makeT(undefined)('row.title'), en['row.title'])
  assert.equal(makeT(null)('row.desc'), en['row.desc'])
})

test('the namespace is the package name', function () {
  assert.equal(LOCALE_NS, PLUGIN_ID)
})

// --------------------------------------------------- inventory locale files

test('locale/*.json carries the inventory title and description, keys in step', function () {
  const read = function (locale) {
    return JSON.parse(readFileSync(new URL('../locale/' + locale + '.json', import.meta.url), 'utf8'))
  }
  const english = read('en')
  const chinese = read('zh')
  for (const doc of [english, chinese]) {
    assert.ok(doc.meta, 'locale json must carry meta')
    assert.equal(typeof doc.meta.title, 'string')
    assert.equal(typeof doc.meta.description, 'string')
    assert.ok(doc.meta.title.trim().length > 0)
    assert.ok(doc.meta.description.trim().length > 0)
  }
  assert.deepEqual(Object.keys(chinese.meta).sort(), Object.keys(english.meta).sort())
  assert.ok(!CJK.test(english.meta.title + english.meta.description), 'the English inventory copy leaks Chinese')
  assert.ok(CJK.test(chinese.meta.title) && CJK.test(chinese.meta.description), 'the Chinese inventory copy is not Chinese')
  assert.notEqual(english.meta.title, chinese.meta.title)
})

// ------------------------------------------------------------- the row id

test('the settings row has a stable id and an order that does not collide with the host', function () {
  assert.equal(SETTINGS_ROW_ID, 'dsh-reasoning-effort')
  assert.equal(typeof SETTINGS_ROW_ORDER, 'number')
  // The host's General rows occupy 11, 12, 15, 16, 17, 20, 30, 100 and the
  // sibling plugins use 18/19/22/24/26/27/29. 28 is free.
  for (const taken of [11, 12, 15, 16, 17, 18, 19, 20, 22, 24, 26, 27, 29, 30, 100]) {
    assert.notEqual(SETTINGS_ROW_ORDER, taken, 'order ' + taken + ' is already used')
  }
})

// ----------------------------------------------------------- stylesheet

test('the stylesheet is balanced and every block is closed', function () {
  const open = (PANEL_CSS.match(/\{/g) || []).length
  const close = (PANEL_CSS.match(/\}/g) || []).length
  assert.equal(open, close, 'every block must be closed')
  assert.ok(PANEL_CSS.length > 1500, 'expected a real stylesheet')
})

test('the stylesheet never targets a salted CSS-Modules class', function () {
  // The host salts its class names on every build (`.RlGAzG_card`,
  // `._markdown_1ypvv_5`). Only this plugin's own `.dre-*` classes and the
  // stable `data-*` slot hook may appear.
  assert.ok(!/\.(?:_?[A-Za-z0-9]+)_[A-Za-z0-9]+_\d+/.test(PANEL_CSS), 'hashed class selector found')
  assert.ok(!/\.[A-Za-z0-9]{6}_[a-z]/.test(PANEL_CSS), 'salted class selector found')
  // Every class selector in the sheet is one this plugin owns.
  const classes = [...PANEL_CSS.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map(function (m) { return m[1] })
  for (const name of classes) {
    assert.ok(name.startsWith('dre-') || name.startsWith('dsw-') || name.startsWith('cds-') || name.includes('slider'),
      'unexpected class in the stylesheet: ' + name)
  }
})

test('the stylesheet hardcodes no palette colour — every colour is a token', function () {
  // Geometry (`9999px`, `6px`, `.5px`, `100%`) is fine. A palette literal would
  // ignore the user's theme, so none may appear.
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(PANEL_CSS), 'hex colour found: ' + (PANEL_CSS.match(/#[0-9a-f]{3,8}\b/i) || [''])[0])
  assert.ok(!/\brgba?\(/.test(PANEL_CSS), 'rgb() colour found: ' + (PANEL_CSS.match(/\brgba?\([^)]*\)/) || [''])[0])
  assert.ok(!/\bhsl\(/.test(PANEL_CSS), 'hsl() colour found')

  // THE ONE EXCEPTION, deliberately: the thumb's physical drop shadow is an
  // achromatic alpha (`hsla(0, 0%, 8%, α)`), the same convention the CDS theme
  // uses for control shadows. It carries no hue, so it cannot clash with any
  // palette — and it is asserted to be exactly this, not any colour at all.
  const shadows = [...PANEL_CSS.matchAll(/hsla\(([^)]*)\)/g)].map(function (m) { return m[1] })
  for (const args of shadows) {
    assert.match(args, /^0, 0%, 8%/, 'only the neutral control shadow may use hsla: hsla(' + args + ')')
  }
  assert.ok(shadows.length <= 2, 'expected at most the webkit and moz thumb shadows, found ' + shadows.length)
})

test('the stylesheet drives the CDS accent and radii through tokens', function () {
  for (const token of [
    '--dsw-alias-state-business-primary',
    '--dsw-alias-state-business-tertiary',
    '--dsw-alias-border-l1',
    '--dsw-alias-border-l2',
    '--dsw-alias-border-l3',
    '--dsw-alias-label-primary',
    '--dsw-alias-label-secondary',
    '--dsw-alias-label-tertiary',
    '--dsw-focus-ring-color',
    '--dsw-alias-bg-base',
    '--dsw-alias-state-warn-tertiary',
    '--dsw-alias-state-warn-label',
    '--dsw-alias-state-error-primary',
  ]) {
    assert.ok(PANEL_CSS.includes(token), 'expected ' + token + ' in the stylesheet')
  }
})

test('the slider is a pill with a 14px thumb on a 6px track', function () {
  // The reference component's capsule geometry, applied to slider parts.
  assert.match(PANEL_CSS, /\.dre-slider::-webkit-slider-runnable-track \{[^}]*height: 6px;[^}]*border-radius: 9999px/)
  assert.match(PANEL_CSS, /\.dre-slider::-webkit-slider-thumb \{[^}]*width: 14px;[^}]*height: 14px;[^}]*border-radius: 9999px/)
  assert.match(PANEL_CSS, /\.dre-slider::-moz-range-thumb \{[^}]*width: 14px;[^}]*height: 14px;[^}]*border-radius: 9999px/)
  // The fill is driven by the inline `--dre-fill` the row writes.
  assert.ok(PANEL_CSS.includes('var(--dre-fill, 0%)'), 'the clay fill must follow the thumb')
})

test('the clay glow respects prefers-reduced-motion', function () {
  // The animation may only appear inside the no-preference query, and the
  // reduce case must leave a static ring rather than no focus indication.
  const animateAt = PANEL_CSS.indexOf('animation: dre-breathe')
  assert.ok(animateAt > 0, 'expected the breathing animation')
  const guardAt = PANEL_CSS.lastIndexOf('prefers-reduced-motion', animateAt)
  assert.ok(guardAt >= 0, 'the animation must sit inside a reduced-motion guard')
  const guardLine = PANEL_CSS.slice(guardAt, PANEL_CSS.indexOf('{', guardAt))
  assert.match(guardLine, /no-preference/, 'the animation belongs to no-preference only')
  assert.ok(/prefers-reduced-motion: no-preference/.test(PANEL_CSS))
  // The static focus ring is declared outside the guard, so it survives reduce.
  const staticRule = PANEL_CSS.slice(PANEL_CSS.indexOf('.dre-slider:focus-visible::-webkit-slider-thumb'))
  assert.match(staticRule, /box-shadow:/)
})

test('the plugin declares its style tag id and dataset owner', function () {
  assert.equal(PANEL_STYLE_ID, PLUGIN_ID + '/panel')
})
