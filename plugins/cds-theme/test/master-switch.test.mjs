/**
 * The master switch ("启用 CDS 主题") must converge.
 *
 * Two real defects are pinned here:
 *
 *  1. OFF used to be slow because the fonts `<style>` tag was removed and
 *     rebuilt; the split styles now keep it mounted for the page's lifetime.
 *  2. ON used to hang/crash: the host theme service publishes
 *     `theme/change` SYNCHRONOUSLY from inside `overrideTokens()`, our own
 *     listener re-entered `bridge.sync()`, the nested registration replaced
 *     the layer before the outer call stored its disposer, and the stored
 *     disposer then belonged to a replaced layer — so the next OFF could not
 *     release anything ("only turning it ON has an effect"). The bridge's
 *     re-entrancy guard makes one sync at a time; this test drives the whole
 *     settings-listener → sync → apply chain through repeated ON/OFF cycles.
 *
 *   node test/master-switch.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createSettingsStore } from '../client/src/settings.js'
import { createThemeBridge } from '../client/src/theme.js'
import { createStyles, buildCssFor, fontSheet } from '../client/src/styles.js'
import { sanitize, STYLE_ID, FONT_STYLE_ID } from '../client/src/constants.js'

// ------------------------------------------------------------- fake DOM

function makeElement(tagName) {
  const node = {
    tagName: String(tagName).toUpperCase(),
    id: '',
    dataset: {},
    parentNode: null,
    children: [],
    writes: 0,
    appendChild(child) { child.parentNode = node; node.children.push(child); return child },
    removeChild(child) {
      const index = node.children.indexOf(child)
      if (index >= 0) node.children.splice(index, 1)
      child.parentNode = null
      return child
    },
  }
  let text = ''
  Object.defineProperty(node, 'textContent', {
    enumerable: true,
    get() { return text },
    set(value) { text = String(value); node.writes += 1 },
  })
  return node
}

function fakeDocument() {
  const head = makeElement('head')
  return {
    head,
    body: makeElement('body'),
    documentElement: makeElement('html'),
    createElement(tagName) { return makeElement(tagName) },
    getElementById(id) {
      return head.children.find(function (node) { return node.id === id }) || null
    },
  }
}

/**
 * A host-accurate theme service: `overrideTokens` publishes `theme/change`
 * synchronously before returning, and a disposer only removes the layer it
 * created (identity guard), exactly like the real theme runtime.
 */
function reentrantThemeService() {
  const listeners = []
  const layers = new Map()
  let seq = 0
  return {
    layers,
    registrations: 0,
    onChange(callback) { listeners.push(callback) },
    overrideTokens(source, tokens) {
      const layer = { id: ++seq, tokens: tokens }
      this.registrations += 1
      layers.set(source, layer)
      for (const callback of listeners.slice()) callback()
      return function disposeLayer() {
        if (layers.get(source) === layer) layers.delete(source)
      }
    },
  }
}

function expectedRules(full) {
  const staticCss = fontSheet()
  const at = full.indexOf(staticCss)
  assert.ok(at >= 0)
  return full.slice(0, at) + full.slice(at + staticCss.length)
}

// ----------------------------------------------------- lifecycle simulation

test('enabled OFF → ON → OFF → ON converges (fonts written once, one layer)', function () {
  const doc = fakeDocument()
  const previous = globalThis.document
  globalThis.document = doc
  try {
    const storage = { getItem: function () { return null }, setItem: function () {} }
    const settings = createSettingsStore(storage)
    const service = reentrantThemeService()
    const bridge = createThemeBridge({ getState: settings.getState, getTheme: function () { return service } })
    const styles = createStyles({ getState: settings.getState })

    // Lifecycle order, mirrored exactly:
    //   1. activation effect: activate → sync → apply
    //   2. settings subscription: sync → apply
    //   3. theme/change listener: sync (registered AFTER the mount sync)
    styles.activate()
    bridge.sync()
    styles.apply()
    settings.subscribe(function () { bridge.sync(); styles.apply() })
    service.onChange(function () { bridge.sync() })

    const fontTag = doc.getElementById(FONT_STYLE_ID)
    const rulesTag = doc.getElementById(STYLE_ID)
    assert.ok(fontTag, 'mount creates the fonts tag')
    assert.ok(rulesTag, 'mount creates the rules tag')
    assert.equal(fontTag.writes, 1, 'font sheet written once at mount')
    assert.equal(rulesTag.writes, 1)
    assert.equal(service.layers.size, 1, 'mount registers one token layer')
    assert.equal(service.registrations, 1)

    // OFF → ON → OFF → ON. Each flip is one store write; no step may throw.
    const flips = [false, true, false, true]
    flips.forEach(function (enabled) {
      assert.doesNotThrow(function () { settings.setState({ enabled: enabled }) },
        'toggling enabled=' + enabled + ' must not throw')
      if (enabled) {
        assert.equal(service.layers.size, 1, 'ON leaves exactly one active layer')
      } else {
        assert.equal(service.layers.size, 0, 'OFF releases the layer')
      }
      assert.equal(doc.getElementById(FONT_STYLE_ID), fontTag,
        'the fonts tag survives every flip (same node)')
      assert.equal(fontTag.writes, 1,
        'the 880 KB font sheet is never rebuilt on a master-switch flip')
    })

    // Bounded writes: mount + 4 flips, one rewrite each — no thrash/loop.
    assert.equal(rulesTag.writes, 5, 'one rules-tag write per transition, no re-trigger loop')
    assert.equal(rulesTag.textContent, expectedRules(buildCssFor(settings.getState())),
      'the rules tag matches the current state exactly')
    // Each ON registers exactly one layer (no double-registration from the
    // synchronous theme/change re-entry).
    assert.equal(service.registrations, 3, 'mount + two ONs = three registrations total')
    assert.equal(fontTag.textContent, fontSheet())

    // Sanity: the final enabled state really is applied.
    assert.equal(settings.getState().enabled, true)
    assert.ok(service.layers.has('dsh-cds-theme'))

    // A stylesheet-only change (`refine`) must NOT re-register the token layer,
    // must NOT touch the font sheet, and must rewrite the rules tag once. The
    // B-group effects (hover reveal, scroll fades) live inside that gate and are
    // unconditional there — they no longer have switches of their own.
    assert.doesNotThrow(function () { settings.setState({ refine: false }) })
    assert.equal(service.registrations, 3,
      'a CSS-only change must not push a token layer')
    assert.equal(service.layers.size, 1)
    assert.equal(fontTag.writes, 1, 'a CSS-only change must not rebuild the font sheet')
    assert.equal(rulesTag.writes, 6, 'exactly one rules-tag write for the CSS change')
    assert.equal(rulesTag.textContent, expectedRules(buildCssFor(settings.getState())))
    assert.ok(!rulesTag.textContent.includes('data-actions-reveal'))
    assert.ok(!rulesTag.textContent.includes('data-step-process-body'))

    // The remaining switches are CSS-only too: turning `refine` back on must
    // neither re-register the token layer nor rebuild the font sheet. The two
    // verified per-item switches are gone, so a legacy payload carrying their
    // fields must be inert — dropped by sanitize, no rewrite, no token push.
    assert.doesNotThrow(function () { settings.setState({ refine: true }) })
    assert.equal(service.registrations, 3,
      'per-item switches must not push a token layer')
    assert.equal(service.layers.size, 1)
    assert.equal(fontTag.writes, 1, 'per-item switches must not rebuild the font sheet')
    assert.equal(rulesTag.writes, 7, 'exactly one rules-tag write for refine coming back on')

    const beforeRetired = rulesTag.writes
    const beforeText = rulesTag.textContent
    assert.doesNotThrow(function () { settings.setState({ codeBlockDetails: false }) })
    assert.doesNotThrow(function () { settings.setState({ markdownBody: false }) })
    assert.equal(service.registrations, 3, 'retired fields must not push a token layer')
    assert.equal(fontTag.writes, 1, 'retired fields must not rebuild the font sheet')
    assert.equal(rulesTag.writes, beforeRetired,
      'retired fields must not even trigger a rules-tag rewrite')
    assert.equal(rulesTag.textContent, beforeText,
      'and must not change the emitted rules')
  } finally {
    if (previous === undefined) delete globalThis.document
    else globalThis.document = previous
  }
})

test('disabling leaves the fonts tag mounted and only teardown removes it', function () {
  const doc = fakeDocument()
  const previous = globalThis.document
  globalThis.document = doc
  try {
    const settings = createSettingsStore({ getItem: function () { return null }, setItem: function () {} })
    const service = reentrantThemeService()
    const bridge = createThemeBridge({ getState: settings.getState, getTheme: function () { return service } })
    const styles = createStyles({ getState: settings.getState })
    styles.activate()
    bridge.sync()
    styles.apply()
    settings.subscribe(function () { bridge.sync(); styles.apply() })
    service.onChange(function () { bridge.sync() })
    const fontTag = doc.getElementById(FONT_STYLE_ID)

    settings.setState({ enabled: false })
    assert.equal(doc.getElementById(FONT_STYLE_ID), fontTag, 'font tag survives OFF')
    assert.equal(fontTag.writes, 1)
    assert.equal(doc.getElementById(STYLE_ID).textContent, '', 'rules tag emptied')

    settings.setState({ enabled: true })
    assert.equal(doc.getElementById(FONT_STYLE_ID), fontTag, 'font tag reused on ON')
    assert.equal(fontTag.writes, 1)
    assert.ok(service.layers.size === 1)

    styles.teardown()
    assert.equal(doc.getElementById(FONT_STYLE_ID), null)
    assert.equal(doc.getElementById(STYLE_ID), null)
  } finally {
    if (previous === undefined) delete globalThis.document
    else globalThis.document = previous
  }
})
