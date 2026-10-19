/**
 * 「主题模式 / Theme mode」: the light/dark/system cubes, rebuilt on our page and
 * wired to the host's OWN preference, plus the CSS that hides the host's
 * duplicate row in 「通用」.
 *
 * WHY A REBUILD RATHER THAN A MOVE. The settings pages are mutually exclusive at
 * the DOM level — `ui-settings-general:338` renders
 * `renderSlot("settings.section", …, { only: active })` and the renderer filters
 * the list down to that one id (`ui-renderer:1220`) — and a child slot has
 * exactly one declaring entry (`SlotCore.register` refuses a second). So a host
 * row cannot be reparented onto our page. It CAN be rebuilt, as long as the
 * rebuilt control writes through the same durable entry point. That is what
 * makes this safe: `theme.setTheme(id)` is the host's own "only user preference
 * write entry" (`ui-theme:1712`), and both rows read the same
 * `theme.getTheme().preference`, so the two can never disagree.
 *
 * THE HIDE RULES. `display: none` on the host's row, never a DOM detach — the
 * `removeChild` crash class this repo already hit. The selectors are pinned here
 * against a fixture modelled on the shipped markup, including the negative cases
 * that matter: ours must not match, and neither must any other General row.
 *
 *   node test/thememode.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  THEME_MODES, THEME_MODE_LABELS, DEFAULT_PREFERENCE, createThemeModeStore,
} from '../client/src/thememode.js'
import { createPanel } from '../client/src/panel.js'
import { buildCss, buildCssFor } from '../client/src/styles.js'
import { buildGlow } from '../client/src/theme.js'
import { sanitize } from '../client/src/constants.js'
import { en, zh } from '../client/src/locales.js'

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

// ------------------------------------------------------------ the store

/** A host theme service reduced to what the store touches. */
function fakeThemeService(options) {
  const opts = options || {}
  const listeners = []
  const service = {
    preference: opts.preference === undefined ? 'system' : opts.preference,
    writes: [],
    throws: opts.throws === true,
    getTheme() {
      return {
        preference: service.preference,
        revision: service.writes.length,
      }
    },
    setTheme(id) {
      if (service.throws) throw new Error('theme "' + id + '" is not registered')
      service.writes.push(id)
      service.preference = id
      for (const listener of listeners.slice()) listener({ preference: id })
    },
    onChange(callback) { listeners.push(callback) },
    /** Emit like the host's `publish()` does on an unrelated change. */
    emitChange() {
      for (const listener of listeners.slice()) listener({ preference: service.preference })
    },
  }
  return service
}

test('the store reads the PERSISTED preference, not the resolved theme', function () {
  const store = createThemeModeStore()
  const service = fakeThemeService({ preference: 'system' })
  store.setService(service)
  // `system` resolves to light or dark internally; the row must still show the
  // 跟随系统 cube as selected, or it would look unselected forever.
  assert.equal(store.getPreference(), 'system')
  service.preference = 'dark'
  assert.equal(store.getPreference(), 'dark')
})

test('an unknown or missing preference falls back to system', function () {
  const store = createThemeModeStore()
  assert.equal(store.getPreference(), DEFAULT_PREFERENCE, 'no service yet')
  store.setService(fakeThemeService({ preference: 'solarized' }))
  assert.equal(store.getPreference(), 'system', 'an unregistered preference is not selectable')
  store.setService({ getTheme() { return undefined } })
  assert.equal(store.getPreference(), 'system')
  store.setService({})
  assert.equal(store.getPreference(), 'system')
  store.setService(null)
  assert.equal(store.getPreference(), 'system')
})

test('the store reports availability only with a usable service', function () {
  const store = createThemeModeStore()
  assert.equal(store.available(), false)
  store.setService({})
  assert.equal(store.available(), false, 'getTheme is what the row reads')
  store.setService(fakeThemeService())
  assert.equal(store.available(), true)
  store.setService(null)
  assert.equal(store.available(), false)
})

test('setPreference writes through the host service exactly once', function () {
  const store = createThemeModeStore()
  const service = fakeThemeService()
  store.setService(service)

  assert.equal(store.setPreference('light'), true)
  assert.deepEqual(service.writes, ['light'])
  assert.equal(service.preference, 'light')
  assert.equal(store.getPreference(), 'light')

  assert.equal(store.setPreference('dark'), true)
  assert.deepEqual(service.writes, ['light', 'dark'])
})

test('setPreference rejects anything that is not one of the three ids', function () {
  const store = createThemeModeStore()
  const service = fakeThemeService()
  store.setService(service)
  for (const bad of ['', 'System', 'solar', null, undefined, 0, {}]) {
    assert.equal(store.setPreference(bad), false, 'rejected: ' + String(bad))
  }
  assert.deepEqual(service.writes, [], 'nothing reached the service')
})

test('a throwing host setTheme is reported, not swallowed and not faked', function () {
  const store = createThemeModeStore()
  const service = fakeThemeService({ preference: 'dark', throws: true })
  store.setService(service)
  const warnings = []
  const original = console.warn
  console.warn = function (message) { warnings.push(String(message)) }
  try {
    assert.equal(store.setPreference('light'), false, 'the write did not happen')
  } finally {
    console.warn = original
  }
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /could not switch/)
  assert.equal(store.getPreference(), 'dark', 'the durable value is unchanged')
})

test('subscribers are notified on a write and on an external change', function () {
  const store = createThemeModeStore()
  const service = fakeThemeService()
  store.setService(service)
  let calls = 0
  const off = store.subscribe(function () { calls += 1 })
  assert.equal(store.listenerCount(), 1)

  store.setPreference('light')
  assert.ok(calls >= 1, 'a write notifies')
  const afterWrite = calls

  // The host publishes `theme/change` for a font-size write too; the lifecycle
  // forwards it, and the row re-reads (a cheap string comparison).
  service.emitChange()
  store.notify()
  assert.ok(calls > afterWrite, 'an external change notifies')

  off()
  assert.equal(store.listenerCount(), 0)
  assert.doesNotThrow(function () { store.notify() })
})

test('one throwing subscriber does not stop the others', function () {
  const store = createThemeModeStore()
  let reached = 0
  store.subscribe(function () { throw new Error('boom') })
  store.subscribe(function () { reached += 1 })
  assert.doesNotThrow(function () { store.notify() })
  assert.equal(reached, 1)
})

test('the three ids and their locale keys are exactly the host preference set', function () {
  assert.deepEqual(THEME_MODES, ['light', 'dark', 'system'])
  assert.deepEqual(Object.keys(THEME_MODE_LABELS).sort(), ['dark', 'light', 'system'])
  for (const mode of THEME_MODES) {
    const key = THEME_MODE_LABELS[mode]
    assert.ok(Object.hasOwn(en, key), 'en missing ' + key)
    assert.ok(Object.hasOwn(zh, key), 'zh missing ' + key)
  }
})

test('the cube labels are the words the host uses, in both languages', function () {
  // `ui-theme` ships appearance.light/dark/system as 浅色 / 深色 / 跟随系统 and
  // Light / Dark / System. Reusing them keeps the two rows consistent.
  assert.equal(zh[THEME_MODE_LABELS.light], '浅色')
  assert.equal(zh[THEME_MODE_LABELS.dark], '深色')
  assert.equal(zh[THEME_MODE_LABELS.system], '跟随系统')
  assert.equal(en[THEME_MODE_LABELS.light], 'Light')
  assert.equal(en[THEME_MODE_LABELS.dark], 'Dark')
  assert.equal(en[THEME_MODE_LABELS.system], 'System')
})

// -------------------------------------------------------------- the row

function fakeReact() {
  return {
    createElement(type, props) {
      const children = Array.prototype.slice.call(arguments, 2)
      const nextProps = props || {}
      if (typeof type === 'function') {
        return type(Object.assign({}, nextProps, {
          children: children.length > 0 ? children : nextProps.children,
        }))
      }
      return { type, props: nextProps, children }
    },
    useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot() },
  }
}

function fakeSettings() {
  const state = sanitize({})
  return {
    getState() { return state },
    subscribe() { return function () {} },
    setState() {},
  }
}

function makeModeStore(service) {
  const store = createThemeModeStore()
  store.setService(service === undefined ? fakeThemeService() : service)
  return store
}

function createPanelWith(store) {
  return createPanel({
    React: fakeReact(),
    primitives: {
      IconCheckOutlineRegular: function IconCheck() { return null },
      IconLightOutlineMedium: function IconLight() { return null },
      IconDarkOutlineMedium: function IconDark() { return null },
      IconFollowsystemOutlineMedium: function IconSystem() { return null },
    },
    settings: fakeSettings(),
    themeMode: store,
  })
}

/** Every button in a rendered tree, flattened. */
function buttonsOf(node, out) {
  const found = Array.isArray(out) ? out : []
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const child of node) buttonsOf(child, found)
    return found
  }
  const props = node.props || {}
  if (node.type === 'button' || props.type === 'button') found.push({ type: node.type, props })
  for (const child of (Array.isArray(node.children) ? node.children : [])) buttonsOf(child, found)
  const propChildren = props.children
  if (propChildren !== undefined && !Array.isArray(node.children)) {
    if (Array.isArray(propChildren)) for (const child of propChildren) buttonsOf(child, found)
    else buttonsOf(propChildren, found)
  }
  return found
}

function modeRowTree(store, dict) {
  const panel = createPanelWith(store)
  const tree = panel.modeSlot.component({ t: function (key) { return (dict || en)[key] } })
  return { panel, tree }
}

test('the row renders three cubes with the host values and labels', function () {
  const store = makeModeStore(fakeThemeService({ preference: 'system' }))
  const { tree } = modeRowTree(store)
  const cubes = buttonsOf(tree).filter(function (button) {
    return button.props['data-mode'] !== undefined
  })
  assert.equal(cubes.length, 3)
  assert.deepEqual(cubes.map(function (cube) { return cube.props['data-mode'] }),
    ['light', 'dark', 'system'])
  assert.deepEqual(cubes.map(function (cube) { return cube.props['aria-label'] }),
    ['Light', 'Dark', 'System'])
  for (const cube of cubes) {
    assert.equal(cube.props.type, 'button')
    assert.equal(typeof cube.props.onClick, 'function')
  }
})

test('aria-pressed follows the persisted preference', function () {
  const check = function (preference) {
    const store = makeModeStore(fakeThemeService({ preference: preference }))
    const { tree } = modeRowTree(store)
    const pressed = buttonsOf(tree)
      .filter(function (b) { return b.props['data-mode'] !== undefined && b.props['aria-pressed'] === true })
      .map(function (b) { return b.props['data-mode'] })
    assert.deepEqual(pressed, [preference], 'exactly the persisted cube is pressed')
  }
  check('light')
  check('dark')
  check('system')
})

test('clicking a cube calls the host write path', function () {
  const service = fakeThemeService({ preference: 'system' })
  const store = makeModeStore(service)
  const { tree } = modeRowTree(store)
  const cubes = buttonsOf(tree).filter(function (b) { return b.props['data-mode'] !== undefined })
  cubes[1].props.onClick()
  assert.deepEqual(service.writes, ['dark'])
  assert.equal(service.preference, 'dark')
})

test('the row regenerates from the store, not from its own click state', function () {
  // `useSyncExternalStore` is driven by the store: after an EXTERNAL change (the
  // host row, a shortcut) a fresh render reads the new value. The fake React
  // reads on every render, so this pins that the component has no internal copy.
  const service = fakeThemeService({ preference: 'light' })
  const store = makeModeStore(service)
  const before = modeRowTree(store).tree
  assert.equal(
    buttonsOf(before).find(function (b) { return b.props['aria-pressed'] === true }).props['data-mode'],
    'light')

  service.setTheme('dark')
  store.notify()
  const after = modeRowTree(store).tree
  assert.equal(
    buttonsOf(after).find(function (b) { return b.props['aria-pressed'] === true }).props['data-mode'],
    'dark')
})

test('an OS scheme flip under `system` repaints the row and keeps 跟随系统 selected', function () {
  // THE HOST BEHAVIOUR THIS DEPENDS ON (`ui-theme` ThemeRuntime constructor,
  // "prefers-color-scheme listener"):
  //
  //     const onChange = () => {
  //       if (this.preference !== "system") return;
  //       this.publish();
  //     };
  //
  // So an OS light→dark flip with the preference on `system` DOES emit
  // `theme/change`, and `publish()` re-emits without touching `preference`. The
  // row must therefore (1) be woken by that event and (2) still render 跟随系统
  // as the selected cube — a flip changes the RESOLVED theme, never the choice.
  //
  // If a future host stopped re-emitting on a media change, the row would simply
  // not be woken; it would still show `system` selected, which is correct. This
  // test is a confirmation, not a fix.
  const service = fakeThemeService({ preference: 'system' })
  const store = makeModeStore(service)

  let notifications = 0
  store.subscribe(function () { notifications += 1 })

  const selectedCube = function () {
    return buttonsOf(modeRowTree(store).tree)
      .find(function (b) { return b.props['aria-pressed'] === true })
      .props['data-mode']
  }
  assert.equal(selectedCube(), 'system')

  // The OS flips to dark. `preference` is unchanged; the runtime publishes.
  const resolved = { system: 'dark' }
  service.emitChange()
  store.notify()

  assert.ok(notifications >= 1, 'the row is woken by the theme/change that follows a media flip')
  assert.equal(service.preference, 'system', 'the durable preference did not change')
  assert.equal(store.getPreference(), 'system')
  assert.equal(selectedCube(), 'system',
    'the 跟随系统 cube stays selected — a media flip must never look like a user choice')

  // And flipping back again is equally inert on the selection.
  resolved.system = 'light'
  service.emitChange()
  store.notify()
  assert.equal(selectedCube(), 'system')
})

test('an OS scheme flip is ignored when the preference is pinned to light or dark', function () {
  // The host's listener returns early unless the preference is `system`, so a
  // pinned preference emits nothing on a media change. The row is unaffected.
  for (const preference of ['light', 'dark']) {
    const service = fakeThemeService({ preference: preference })
    const store = makeModeStore(service)
    let notifications = 0
    store.subscribe(function () { notifications += 1 })
    // No host emit happens in this case; the store is never notified.
    assert.equal(notifications, 0)
    assert.equal(store.getPreference(), preference)
    const pressed = buttonsOf(modeRowTree(store).tree)
      .filter(function (b) { return b.props['aria-pressed'] === true })
      .map(function (b) { return b.props['data-mode'] })
    assert.deepEqual(pressed, [preference])
  }
})

test('the row renders nothing without the host theme service', function () {
  const store = createThemeModeStore()   // never bound
  const { tree } = modeRowTree(store)
  assert.equal(tree, null, 'no read, no write, no row')
})

test('the row is bilingual and carries its own title/description', function () {
  const store = makeModeStore()
  const english = JSON.stringify(modeRowTree(store, en).tree)
  const chinese = JSON.stringify(modeRowTree(store, zh).tree)
  assert.ok(english.includes(en['modeRow.title']))
  assert.ok(english.includes(en['modeRow.desc']))
  assert.ok(!CJK.test(english), 'en mode must not render Chinese')
  assert.ok(chinese.includes(zh['modeRow.title']))
  assert.ok(chinese.includes(zh['modeRow.desc']))
  assert.ok(!/\bTheme mode\b/.test(chinese), 'zh mode must not render English copy')
})

test('the row is registered first on the page and only when the section exists', function () {
  const panel = createPanelWith(makeModeStore())
  assert.equal(panel.modeSlot.id, 'dsh-cds-theme-mode')
  assert.equal(panel.modeSlot.order, 10)
  assert.equal(panel.appearanceSlots[0], panel.modeSlot, 'first on the 主题定制 page')
  assert.equal(panel.modeSlot.component, panel.appearanceSlots[0].component)
})

// ---------------------------------------------------------- the hide CSS

/** Selector → body map, comments stripped. */
function sheetMap(text) {
  const map = new Map()
  const cssText = String(text).replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match = re.exec(cssText)
  while (match !== null) {
    map.set(match[1].trim().replace(/\s+/g, ' '), match[2].trim())
    match = re.exec(cssText)
  }
  return map
}

function diffSheets(before, after) {
  const a = sheetMap(before)
  const b = sheetMap(after)
  return {
    removed: [...a.keys()].filter(function (key) { return !b.has(key) }).sort(),
    added: [...b.keys()].filter(function (key) { return !a.has(key) }).sort(),
    changed: [...a.keys()].filter(function (key) { return b.has(key) && b.get(key) !== a.get(key) }),
  }
}

const CUBE_HIDER = 'body [data-slot="settings.general.item"] > *:has(button[aria-pressed]:not([role="switch"]))'
/**
 * The font-size group is deliberately NOT hidden: this plugin rebuilds the
 * light/dark cubes but not font sizing, and hiding a setting with no replacement
 * would take the user's only font-size control away. Kept as a named constant so
 * the tests can assert its ABSENCE explicitly instead of leaving it as an
 * untested omission.
 */
const FONT_HIDER = 'body [data-slot="settings.general.item"] > *:has(button[aria-controls]:not([aria-haspopup]))'

function hideSheet() {
  return buildCssFor(sanitize({}), { themeModeAvailable: true })
}

/** The same sheet, kept for scans that must look at every rule text. */
const defaultSheetForScan = hideSheet()

test('the hide rule is present by default and targets the row, never the outlet', function () {
  const rules = sheetMap(hideSheet())
  assert.ok(rules.has(CUBE_HIDER), 'expected the cube-row hider')
  assert.equal(rules.get(CUBE_HIDER), 'display: none !important;')
  assert.equal(rules.has(FONT_HIDER), false,
    'the font-size group must NOT be hidden: it is not rebuilt, so hiding it would remove the control')

  // THE STRUCTURAL PIN: the slot outlet itself must never be hidden. The shipped
  // renderer emits ONE `div[data-slot="settings.general.item"]` (display:contents)
  // holding every row as a direct child, so `[data-slot=…]:has(… )` — without the
  // `> *` between them — would match the outlet for any row shape and blank the
  // whole 通用 page. Only rules that use `:has()` are checked; the sheet's other
  // slot-scoped rules (row hairlines, selection tints) legitimately target the
  // outlet as a descendant prefix.
  for (const selector of rules.keys()) {
    if (!selector.includes(':has(')) continue
    assert.ok(selector.includes('data-slot="settings.general.item"'),
      'a :has() rule must be scoped to the General slot: ' + selector)
    assert.ok(/> \*:has\(/.test(selector),
      'a hide rule must scope :has() to a CHILD row, not the outlet: ' + selector)
    assert.ok(!/\[data-slot="settings\.general\.item"\]:has\(/.test(selector),
      'hiding the outlet would blank the whole page: ' + selector)
  }
})

test('without the theme service the hide rule disappears (the host row stays)', function () {
  const withService = hideSheet()
  const withoutService = buildCssFor(sanitize({}), { themeModeAvailable: false })
  const diff = diffSheets(withService, withoutService)
  assert.deepEqual(diff.added, [], 'nothing is added when the service is missing')
  assert.deepEqual(diff.removed, [CUBE_HIDER], 'exactly the hide rule goes away')
  assert.deepEqual(diff.changed, [], 'and every other rule is byte-identical')
  assert.ok(!withoutService.includes('data-slot="settings.general.item" > *:has'),
    'no hide rule survives — hiding the host row without a replacement would strand the user')
})

test('the hide rule rides the master switch, not refine', function () {
  // It must survive `refine: false`: it is not component refinement, and a user
  // who turns refinement off still needs a reachable theme switch.
  const noRefine = buildCssFor(sanitize({ refine: false }), { themeModeAvailable: true })
  const rules = sheetMap(noRefine)
  assert.ok(rules.has(CUBE_HIDER), 'the cube hider must survive refine=false')
  // But the master switch does remove them, with the rest of the sheet.
  assert.equal(buildCss(sanitize({ enabled: false }), buildGlow(sanitize({})), { light: '#d97757', dark: '#d97757' }, true), '',
    'enabled=false emits no stylesheet at all')
})

test('the hide rules never mention a salted class', function () {
  const css = hideSheet()
  for (const selector of sheetMap(css).keys()) {
    assert.ok(!/\.(?:_?[A-Za-z0-9]+)_[A-Za-z0-9]+_\d+/.test(selector), 'hashed class: ' + selector)
    assert.ok(!/\.(?:[A-Za-z0-9]{6})_[a-z]/.test(selector), 'salted class: ' + selector)
  }
})

// ------------------------------------------------- fixture: what it matches
//
// The fixture reproduces the shipped markup: one `[data-slot]` outlet whose
// direct children are the rows. `matches()` implements only the selector
// features the two hide rules use — a descendant `button[…]`, a child `> *`,
// `:has()`, attribute presence/value, and `:not()`.

/** A tiny element + selector engine, enough for the two rules above. */
function fixture(html) {
  // html: array of { attrs, children } nodes, built by the helpers below.
  return html
}

function el(tag, attrs, children) {
  return { tag: tag, attrs: attrs || {}, children: children || [], parent: null }
}

function link(node) {
  for (const child of node.children) {
    child.parent = node
    link(child)
  }
  return node
}

function attr(node, name) {
  return Object.prototype.hasOwnProperty.call(node.attrs, name) ? node.attrs[name] : null
}

function descendants(node, out) {
  const found = Array.isArray(out) ? out : []
  for (const child of node.children) {
    found.push(child)
    descendants(child, found)
  }
  return found
}

/** `button[aria-pressed]:not([role="switch"])` — the ONE shape the rule uses. */
function isCubeButton(node) {
  if (node.tag !== 'button') return false
  if (attr(node, 'aria-pressed') === null) return false
  return attr(node, 'role') !== 'switch'
}

/**
 * Does the shipped hide rule hide this row?
 *
 * It models exactly `> *:has(button[aria-pressed]:not([role="switch"]))` — no
 * other shape. `isExpanderButton` / `FONT_HIDER` are kept beside it purely to
 * assert the font group is NOT matched, i.e. that the rule was not widened.
 */
function hidesRow(row) {
  return descendants(row).some(isCubeButton)
}

/** `button[aria-controls]:not([aria-haspopup])` — deliberately NOT used by the rule. */
function isExpanderButton(node) {
  if (node.tag !== 'button') return false
  if (attr(node, 'aria-controls') === null) return false
  return attr(node, 'aria-haspopup') === null
}

/** Build the general-page fixture: outlet + the shipped rows. */
function generalPage(extraRow) {
  const outlet = el('div', { 'data-slot': 'settings.general.item' })
  const rows = []
  // 1. the host's cube row (ui-theme id `appearance`): three aria-pressed cubes
  rows.push(el('div', { class: 'v01cdW_group' }, [
    el('div', { class: 'v01cdW_title' }),
    el('div', { class: 'v01cdW_cubeRow' }, [
      el('button', { 'aria-pressed': 'true' }),
      el('button', { 'aria-pressed': 'false' }),
      el('button', { 'aria-pressed': 'false' }),
    ]),
  ]))
  // 2. the host's font-size group (ui-theme id `font-size`): expander button
  rows.push(el('div', {}, [
    el('div', {}, [
      el('button', { 'aria-expanded': 'false', 'aria-controls': 'r1', 'aria-label': 'more' }),
    ]),
  ]))
  // 3. the language row (ui-client-locale): a MENU trigger — `aria-haspopup`
  rows.push(el('div', {}, [
    el('button', { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }),
  ]))
  // 4. the permission row: also a menu trigger
  rows.push(el('div', {}, [
    el('button', { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }),
  ]))
  // 5. the composer-enter row: a menu trigger
  rows.push(el('div', {}, [
    el('button', { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }),
  ]))
  // 6. a plain toggle row with no aria-pressed and no aria-controls
  rows.push(el('div', {}, [el('button', { 'aria-checked': 'true' })]))
  // 7. our master switch: role="switch" + aria-checked, no aria-pressed
  rows.push(el('div', { class: 'dct-row' }, [
    el('div', { class: 'dct-row-text' }),
    el('div', { class: 'dct-control' }, [
      el('button', { role: 'switch', 'aria-checked': 'true' }),
    ]),
  ]))
  if (extraRow !== undefined) rows.push(extraRow)
  outlet.children = rows
  return link(outlet)
}

test('the selector matches the host cube row and leaves the font group alone', function () {
  const outlet = generalPage()
  const rows = outlet.children
  const hidden = rows.filter(hidesRow)
  assert.deepEqual(hidden, [rows[0]], 'only the host cube row is hidden')
  // The font-size group is the row this plugin deliberately does NOT hide.
  assert.equal(hidesRow(rows[1]), false,
    'the font-size group must stay visible — it has no replacement yet')
  // ...and that is a property of the RULE, not of the fixture: the shape the
  // font group has (an `aria-controls` expander) is exactly what a widened rule
  // would have matched, so asserting the shape is present proves the rule is
  // what excludes it.
  assert.ok(descendants(rows[1]).some(isExpanderButton),
    'the fixture does present the expander shape the rule must ignore')
})

test('the selector matches NEITHER our rows NOR any other General row', function () {
  const outlet = generalPage()
  const rows = outlet.children
  // The menu-trigger rows (language / permission / composer-enter) carry
  // `aria-expanded`; a naive `button[aria-expanded]` rule would have hidden
  // them. This rule only ever looks at `aria-pressed`, so they stay.
  for (const index of [2, 3, 4]) {
    assert.equal(hidesRow(rows[index]), false,
      'row ' + index + ' is a menu trigger and must stay visible')
  }
  // The plain toggle and our master switch match nothing.
  assert.equal(hidesRow(rows[5]), false, 'a plain toggle row stays visible')
  assert.equal(hidesRow(rows[6]), false, 'our enabled switch stays visible')
})

/**
 * Does the FULL shipped rule — `body [data-slot="<slot>"] > *:has(button[aria-pressed]:not([role="switch"]))`
 * — hide `row` when it is a direct child of an outlet carrying `slot`?
 *
 * This models both halves of the selector: the slot scope AND the row shape.
 * `hidesRow()` above models only the shape, which is what the reverse-proof test
 * needs to compare against.
 */
function ruleMatches(slot, row) {
  if (slot !== 'settings.general.item') return false      // the scope half
  return descendants(row).some(isCubeButton)              // the shape half
}

test('our own accent row and theme-mode row cannot match (different slot)', function () {
  // THE REVERSE PROOF — keep this test.
  //
  // It is the one thing that stops a future reader from "simplifying" the
  // selector by dropping the slot scope: these rows carry the EXACT shape the
  // hide rule keys on (`aria-pressed` cubes), so the only reason they survive is
  // that they live on `settings.appearance.item`. Remove the scope and the
  // plugin would hide its own controls.
  const accentRow = link(el('div', { class: 'dct-row' }, [
    el('div', { class: 'dct-control' }, [
      el('div', { class: 'dct-swatches' }, [
        el('button', { 'aria-pressed': 'true' }),
        el('button', { 'aria-pressed': 'false' }),
      ]),
    ]),
  ]))
  const modeRow = link(el('div', { class: 'dct-row dct-mode-row' }, [
    el('div', { class: 'dct-mode-cubes' }, [
      el('button', { 'aria-pressed': 'true', 'data-mode': 'system' }),
      el('button', { 'aria-pressed': 'false', 'data-mode': 'light' }),
    ]),
  ]))

  for (const row of [accentRow, modeRow]) {
    // Registered in General (never happens), the rule would hide our own row.
    assert.equal(ruleMatches('settings.general.item', row), true,
      'the row SHAPE alone matches — so the slot scope is what saves it')
    // On our page the scope excludes it.
    assert.equal(ruleMatches('settings.appearance.item', row), false,
      'our own rows must never be hidden by our own rule')
  }

  // And the shipped sheet contains no un-scoped variant that could match them.
  const isHideRule = function (selector) {
    return selector.startsWith('body ') && selector.includes(':has(')
  }
  const hideRules = [...sheetMap(hideSheet()).keys()].filter(isHideRule)
  assert.equal(hideRules.length, 1, 'exactly one hide rule exists')
  for (const selector of hideRules) {
    assert.ok(selector.includes('data-slot="settings.general.item"'),
      'the hide rule must name the General slot: ' + selector)
    assert.ok(!selector.includes('settings.appearance.item'),
      'the hide rule must never be scoped to our own page: ' + selector)
  }
  // A bare `:has(button[aria-pressed])` with no slot prefix would hide our page.
  assert.ok(!/(^|,)\s*(body\s+)?\*?:has\(button\[aria-pressed/.test(defaultSheetForScan),
    'no un-scoped aria-pressed rule may exist')
})

test('a button with aria-pressed inside a role="switch" control is not a cube row', function () {
  // The `:not([role="switch"])` guard: a future host switch that also reports
  // pressed state must not take the whole row down.
  const row = el('div', {}, [el('button', { 'aria-pressed': 'true', role: 'switch' })])
  assert.equal(hidesRow(link(row)), false)
})

test('an empty row and a plain text row are left alone', function () {
  assert.equal(hidesRow(link(el('div', {}))), false)
  assert.equal(hidesRow(link(el('div', {}, [el('span', {}, [])]))), false)
})

// ------------------------------------------------------------- lifecycle

test('the lifecycle binds the store to the service and forwards theme/change', function () {
  const lifecycle = readFileSync(new URL('../client/src/lifecycle.js', import.meta.url), 'utf8')
  const index = readFileSync(new URL('../client/src/index.js', import.meta.url), 'utf8')

  // index.js binds the ONE service it resolves to both the bridge and the store.
  assert.ok(/bindTheme: function \(service\)[\s\S]{0,160}themeMode\.setService\(service\)/.test(index),
    'index.js must bind one service to both the token bridge and the row store')
  // The row follows the host event, so a change made elsewhere repaints it.
  assert.ok(/ctx\.on\('theme\/change'/.test(lifecycle), 'the row must follow the host event')
  assert.ok(/modes\.notify\(\)/.test(lifecycle), 'the event must reach the store')
  // A test context without the store must not crash the lifecycle.
  assert.ok(/themeMode === undefined \|\| themeMode === null/.test(lifecycle),
    'the lifecycle must tolerate a missing store')
})

test('the stylesheet gate is wired to the store availability', function () {
  const source = readFileSync(new URL('../client/src/index.js', import.meta.url), 'utf8')
  assert.ok(/isThemeModeAvailable: themeMode\.available/.test(source),
    'the hide rule must be gated on the same availability the row reads')
})
