/**
 * Settings: validation, version migration, and the popover's disposability.
 *
 * The migration and disposal tests are the two that matter beyond correctness of
 * validation:
 *   · the storage key and schema version are the UPSTREAM ones, so an existing install
 *     keeps its animation mode across the rename to @hwfee/...;
 *   · everything the popover installs (document listeners, the node, timers) comes back
 *     out, because "disable the plugin and the host's context menu behaves as before"
 *     is not true if a listener survives.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { SETTINGS_EVENT, SETTINGS_KEY, SETTINGS_VERSION } from '../client/src/constants.js'
import {
  SETTINGS_SCHEMA,
  createSettingsStore,
  createSettingsUi,
  motionMode,
  normalizeSettings,
  schemaDefaults,
} from '../client/src/settings.js'

/** A storage double with the two methods this plugin uses, plus a call log. */
function fakeStorage(initial) {
  const data = new Map(initial === undefined ? [] : initial)
  const calls = []
  return {
    getItem(key) { calls.push(['get', key]); return data.has(key) ? data.get(key) : null },
    setItem(key, value) { calls.push(['set', key]); data.set(key, value) },
    dump() { return new Map(data) },
    calls,
    raw(key) { return data.get(key) },
  }
}

test('the schema declares the three animation modes and the tick visibility options', function () {
  const motion = SETTINGS_SCHEMA.find((item) => item.key === 'motion')
  assert.deepEqual(motion.options.map((option) => option.value), ['fast', 'quick', 'full'])
  assert.equal(motion.default, 'full', 'the default is the author\'s own loose parameters')
  const ticks = SETTINGS_SCHEMA.find((item) => item.key === 'reachedTicks')
  assert.deepEqual(ticks.options.map((option) => option.value), ['highlight', 'dim', 'hidden'])
  assert.equal(ticks.default, 'hidden')
})

test('schemaDefaults covers every key, so no reader has to defend against undefined', function () {
  const defaults = schemaDefaults()
  assert.deepEqual(Object.keys(defaults).sort(), ['motion', 'reachedTicks'])
  assert.equal(defaults.motion, 'full')
  assert.equal(defaults.reachedTicks, 'hidden')
})

test('normalizeSettings replaces an unknown value with the default and keeps known ones', function () {
  const normalized = normalizeSettings({ motion: 'nonsense', reachedTicks: 'dim' })
  assert.equal(normalized.motion, 'full')
  assert.equal(normalized.reachedTicks, 'dim')
  assert.deepEqual(Object.keys(normalized).sort(), ['motion', 'reachedTicks'],
    'the result is always COMPLETE — a missing key reads as a component bug later')
})

test('normalizeSettings survives garbage without throwing', function () {
  for (const raw of [null, undefined, 42, 'text', [], { motion: null }]) {
    const normalized = normalizeSettings(raw)
    assert.equal(normalized.motion, 'full')
    assert.equal(normalized.reachedTicks, 'hidden')
  }
})

test('the store reads defaults when storage is unavailable', function () {
  const store = createSettingsStore({ storage: undefined, win: undefined })
  assert.equal(store.read().motion, 'full')
  assert.equal(store.read().v, SETTINGS_VERSION)
})

test('the store falls back to defaults when storage throws (private mode / quota)', function () {
  const store = createSettingsStore({
    storage: {
      getItem() { throw new Error('SecurityError') },
      setItem() { throw new Error('QuotaExceededError') },
    },
  })
  assert.doesNotThrow(() => store.read())
  assert.doesNotThrow(() => store.write({ motion: 'fast' }))
  assert.equal(store.read().motion, 'fast', 'the write still took effect in memory')
})

test('a write persists under the upstream storage key and broadcasts once', function () {
  const storage = fakeStorage()
  const events = []
  const store = createSettingsStore({
    storage,
    win: { dispatchEvent: (event) => events.push(event.type) },
  })
  store.write({ reachedTicks: 'highlight' })
  const raw = JSON.parse(storage.raw(SETTINGS_KEY))
  assert.equal(raw.reachedTicks, 'highlight')
  assert.equal(raw.v, SETTINGS_VERSION)
  assert.equal(events.length, 1)
  assert.equal(events[0], SETTINGS_EVENT)
})

test('an OLD version blob keeps its valid values and is stamped with the new version', function () {
  // THE MIGRATION. An existing upstream install has `{ motion: 'fast', v: 2 }`. Dropping
  // it would silently revert the user's animation mode on upgrade; keeping it means the
  // rename to @hwfee/... is invisible to them.
  assert.equal(SETTINGS_KEY, 'dsh-codex-effort-slider.settings',
    'the storage key must stay the upstream one, or every existing install loses its settings')
  assert.equal(SETTINGS_VERSION, 3, 'the schema version must stay the upstream one')

  const storage = fakeStorage([[SETTINGS_KEY, JSON.stringify({ motion: 'fast', reachedTicks: 'dim', v: 2 })]])
  const store = createSettingsStore({ storage })
  const settings = store.read()
  assert.equal(settings.motion, 'fast', 'a version bump must not discard the user\'s choice')
  assert.equal(settings.reachedTicks, 'dim')
  assert.equal(settings.v, SETTINGS_VERSION)
  // ...and the migrated blob is written back with the new stamp.
  assert.equal(JSON.parse(storage.raw(SETTINGS_KEY)).v, SETTINGS_VERSION)
})

test('a CURRENT version blob is not rewritten on read', function () {
  const storage = fakeStorage([[SETTINGS_KEY, JSON.stringify({ motion: 'quick', v: SETTINGS_VERSION })]])
  const store = createSettingsStore({ storage })
  store.read()
  const writes = storage.calls.filter((call) => call[0] === 'set')
  assert.equal(writes.length, 0, 'reading current settings must not touch storage')
})

test('a corrupt blob falls back to defaults instead of throwing', function () {
  const storage = fakeStorage([[SETTINGS_KEY, '{not json']])
  const store = createSettingsStore({ storage })
  assert.equal(store.read().motion, 'full')
})

test('the cache is invalidated on demand, so another writer is picked up', function () {
  const storage = fakeStorage([[SETTINGS_KEY, JSON.stringify({ motion: 'quick', v: SETTINGS_VERSION })]])
  const store = createSettingsStore({ storage })
  assert.equal(store.read().motion, 'quick')
  storage.setItem(SETTINGS_KEY, JSON.stringify({ motion: 'fast', v: SETTINGS_VERSION }))
  assert.equal(store.read().motion, 'quick', 'still the cached value…')
  store.invalidate()
  assert.equal(store.read().motion, 'fast', '…and a fresh read after invalidation')
})

/** Push the store's event the way the browser would, when the UI is wired to a real window. */
function makeUi(options = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  const storage = options.storage ?? fakeStorage()
  const store = createSettingsStore({ storage, win: window })
  const copied = []
  const ui = createSettingsUi({
    doc: window.document,
    win: window,
    store,
    copy: (text) => { copied.push(text); if (options.copyThrows === true) throw new Error('denied') },
    diagnostics: () => options.diagnostics ?? 'diag-text',
  })
  return { dom, window, doc: window.document, store, ui, storage, copied }
}

/** A slider-shaped element the popover's hit test will accept. */
function sliderHost(doc) {
  const host = doc.createElement('div')
  host.className = 'ces-inline'
  const track = doc.createElement('div')
  track.className = 'ces-track'
  host.appendChild(track)
  doc.body.appendChild(host)
  return { host, track }
}

test('the popover renders one control per schema entry and no markup strings', function () {
  const { doc, ui } = makeUi()
  ui.install()
  ui.openPanel({ left: 10, bottom: 40 }, null)
  const panel = ui.panel()
  assert.notEqual(panel, null)
  assert.equal(panel.getAttribute('role'), 'dialog')
  assert.equal(panel.querySelectorAll('input[type="radio"]').length, 6, 'two groups of three options')
  assert.notEqual(panel.querySelector('[data-ces-trace]'), null)
  assert.notEqual(panel.querySelector('[data-ces-reset]'), null)
  assert.notEqual(panel.querySelector('[data-ces-close]'), null)
  ui.dispose()
})

test('changing a radio writes the setting and re-syncs the panel', function () {
  const { doc, ui, store } = makeUi()
  ui.install()
  ui.openPanel({ left: 0, bottom: 0 }, null)
  const input = ui.panel().querySelector('[data-ces-key="motion"][value="quick"]')
  input.checked = true
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }))
  assert.equal(store.read().motion, 'quick')
  ui.dispose()
})

test('reset restores every default', function () {
  const { ui, store } = makeUi()
  ui.install()
  store.write({ motion: 'fast', reachedTicks: 'highlight' })
  ui.openPanel({ left: 0, bottom: 0 }, null)
  ui.panel().querySelector('[data-ces-reset]').click()
  assert.equal(store.read().motion, 'full')
  assert.equal(store.read().reachedTicks, 'hidden')
  ui.dispose()
})

test('THE REGRESSION: the system line says reduced motion STOPS the animation', function () {
  // The copy is a claim about behaviour, and the port inherited upstream's claim that the
  // OS preference changes nothing. It is false here: `component.js:127-131` forces
  // `mode = 'reduced'` whenever the OS asks for reduced motion, whatever the stored mode
  // is. A settings row promising "unaffected" while the stars actually stop sends the
  // user looking for the fault in the wrong place.
  //
  // This test pins the SENTENCE, not the wording around it: it fails if the line starts
  // claiming the modes are unaffected again. Whoever changes the behaviour must change
  // this line (and therefore this assertion) in the same commit.
  const { ui } = makeUi()
  ui.install()
  ui.openPanel({ left: 0, bottom: 0 }, null)
  const line = ui.panel().querySelector('[data-ces-system]')
  assert.notEqual(line, null, 'the panel must carry the system-motion line')
  const text = line.textContent
  assert.ok(text.length > 0, 'an empty line tells the user nothing')
  assert.ok(!/不受系统/.test(text),
    'the copy must not claim the three modes ignore the system preference — component.js:128 overrides the mode to "reduced"')
  assert.match(text, /停止|不渲染|禁用/, 'it must say that motion actually stops')
  assert.match(text, /减少动态/, 'it must name the system preference it is talking about')
  ui.dispose()
})

test('right-click on the slider opens the popover and suppresses the host menu', function () {
  const { doc, ui, window } = makeUi()
  ui.install()
  const { track } = sliderHost(doc)
  const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  track.dispatchEvent(event)
  assert.equal(event.defaultPrevented, true, 'the host context menu must not also appear')
  assert.equal(ui.isOpen(), true)
  ui.dispose()
})

test('right-click elsewhere does NOT open the popover', function () {
  const { doc, ui, window } = makeUi()
  ui.install()
  const outside = doc.createElement('div')
  doc.body.appendChild(outside)
  outside.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
  assert.equal(ui.panel(), null)
  ui.dispose()
})

test('a drag across the slider does NOT open the popover; a still press does', async function () {
  // The long press exists so a keyboard-less user can reach the settings, but a drag is
  // the primary gesture — it must never be captured by the popover.
  const { doc, ui, window } = makeUi()
  ui.install()
  const { track } = sliderHost(doc)
  track.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
  track.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: 10 }))
  await new Promise((resolve) => setTimeout(resolve, 700))
  assert.equal(ui.panel(), null, 'moving the pointer must cancel the long press')

  track.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }))
  await new Promise((resolve) => setTimeout(resolve, 700))
  assert.equal(ui.isOpen(), true, 'a still press opens it')
  ui.dispose()
})

test('Escape closes the popover and a press outside dismisses it', function () {
  const { doc, ui, window } = makeUi()
  ui.install()
  sliderHost(doc)
  ui.openPanel({ left: 0, bottom: 0 }, null)
  assert.equal(ui.isOpen(), true)
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(ui.isOpen(), false, 'Escape must close it')

  ui.openPanel({ left: 0, bottom: 0 }, null)
  const outside = doc.createElement('div')
  doc.body.appendChild(outside)
  outside.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  assert.equal(ui.isOpen(), false, 'a press outside must dismiss it')
  ui.dispose()
})

test('the keyboard equivalent of right-click opens the popover', function () {
  const { doc, ui, window } = makeUi()
  ui.install()
  const { track } = sliderHost(doc)
  track.setAttribute('tabindex', '0')
  track.focus()
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }))
  assert.equal(ui.isOpen(), true, 'a keyboard user cannot right-click, so Shift+F10 must work')
  ui.dispose()
})

test('copy diagnostics reports failure instead of pretending success', function () {
  const { ui } = makeUi({ copyThrows: true })
  ui.install()
  ui.openPanel({ left: 0, bottom: 0 }, null)
  const button = ui.panel().querySelector('[data-ces-trace]')
  button.click()
  assert.equal(button.textContent, '无法复制')
  ui.dispose()
})

test('copy diagnostics writes the text when a clipboard exists', function () {
  const { ui, copied } = makeUi({ diagnostics: 'trace-body' })
  ui.install()
  ui.openPanel({ left: 0, bottom: 0 }, null)
  ui.panel().querySelector('[data-ces-trace]').click()
  assert.deepEqual(copied, ['trace-body'])
  ui.dispose()
})

test('dispose removes the popover node AND every listener it installed', function () {
  // THE DISPOSAL CONTRACT. If a `contextmenu` listener survives, right-clicking the
  // host's composer keeps being swallowed after the plugin is disabled — the host looks
  // broken and nothing points at the plugin.
  const { doc, ui, window } = makeUi()
  ui.install()
  const { track } = sliderHost(doc)
  ui.openPanel({ left: 0, bottom: 0 }, null)
  ui.dispose()

  assert.equal(doc.querySelector('.ces-set'), null, 'the popover node must be gone')

  const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  track.dispatchEvent(event)
  assert.equal(event.defaultPrevented, false, 'a disposed UI must not swallow the context menu')
  assert.equal(ui.panel(), null, 'and must not reopen')

  // A second dispose is harmless.
  assert.doesNotThrow(() => ui.dispose())
})

test('dispose clears a pending long-press timer instead of firing later', async function () {
  const { doc, ui, window } = makeUi()
  ui.install()
  const { track } = sliderHost(doc)
  track.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }))
  ui.dispose()
  await new Promise((resolve) => setTimeout(resolve, 700))
  assert.equal(doc.querySelector('.ces-set'), null, 'a timer that outlived dispose would open a ghost panel')
})

test('motionMode always returns one of the three known values', function () {
  const store = createSettingsStore({ storage: fakeStorage() })
  assert.equal(motionMode(store), 'full')
  store.write({ motion: 'fast' })
  assert.equal(motionMode(store), 'fast')
  store.write({ motion: 'quick' })
  assert.equal(motionMode(store), 'quick')
  // Even with a hostile stored value.
  const hostile = createSettingsStore({ storage: fakeStorage([[SETTINGS_KEY, JSON.stringify({ motion: 'sideways' })]]) })
  assert.equal(motionMode(hostile), 'full')
})
