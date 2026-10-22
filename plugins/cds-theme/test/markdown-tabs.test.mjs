/**
 * The two opt-in looks of this wave: the assistant markdown scope, and the
 * 「对话 / 轨迹」 pill.
 *
 * Both shipped as dead code once — the state keys, the `sanitize` whitelist and
 * the two rule modules existed, but nothing called them, so flipping the row in
 * the panel changed exactly nothing. This file is the regression that would have
 * caught it: it asserts the STATE, the CSS and the CLEANUP, on the real entry
 * points (`buildCssFor`, `createStyles().apply()`, the tab controller), rather
 * than on the rule text alone.
 *
 *   node test/markdown-tabs.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildCssFor, createStyles } from '../client/src/styles.js'
import { sanitize, DEFAULT_STATE, STYLE_ID, FONT_STYLE_ID, STORAGE_KEY } from '../client/src/constants.js'
import { createSettingsStore } from '../client/src/settings.js'
import { createPanel } from '../client/src/panel.js'
import { markdownScopeRules, MARKDOWN_ROOT, EXCLUDE } from '../client/src/markdown-scope.js'
import {
  tabsStyleRules, createTabsStyleController, applyTabsStyle, TABS_ATTR, TABS_PILL, TABS_SELECTOR,
} from '../client/src/viewtabs.js'
import {
  composerLayoutRules, createComposerLayoutController, COMPOSER_LAYOUT_ATTR, COMPOSER_LAYOUT_SPLIT,
  COMPOSER_STACK_ATTR, COMPOSER_ROW_ATTR, COMPOSER_NARROW_ATTR,
  ROW_TOP_VAR, ROW_HEIGHT_VAR, DOCK_INSET_LEFT_VAR, DOCK_INSET_RIGHT_VAR,
  findCluster, measureDockContent, MIN_CENTRE_GAP,
} from '../client/src/composer-layout.js'

const LEFT_SLOT = '[data-slot="conversation.input.permission"]'
const RIGHT_SLOT = '[data-slot="conversation.input.model"]'
const PLAN_SLOT = '[data-slot="conversation.input.plan"]'
const TEXT_PORT = '[data-input-scroll]'
const CARD = '[data-composer-card]'
const DOCK = '[data-composer-dock]'

/** The panel's row factory, with just enough React and store to render. */
function createRowPanel(store) {
  const memory = new Map()
  const settings = store || createSettingsStore({
    getItem(key) { return memory.has(key) ? memory.get(key) : null },
    setItem(key, value) { memory.set(key, value) },
  })
  const React = {
    createElement(type, props) {
      const children = Array.prototype.slice.call(arguments, 2)
      if (typeof type === 'function') {
        return type(Object.assign({}, props, { children: children.length > 0 ? children : props.children }))
      }
      return { type, props: props || {}, children }
    },
    useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot() },
  }
  return createPanel({
    React,
    primitives: { IconCheckOutlineRegular: function () { return null } },
    settings,
    themeMode: null,
  })
}

const rules = function (patch) { return buildCssFor(sanitize(patch || {}), { omitFonts: true }) }

// ------------------------------------------------------------- fake DOM

function makeElement(tagName) {
  const node = {
    tagName: String(tagName).toUpperCase(),
    id: '',
    dataset: {},
    parentNode: null,
    children: [],
    attributes: {},
    writes: 0,
    appendChild(child) { child.parentNode = node; node.children.push(child); return child },
    removeChild(child) {
      const index = node.children.indexOf(child)
      if (index >= 0) node.children.splice(index, 1)
      child.parentNode = null
      return child
    },
    setAttribute(name, value) { node.attributes[name] = String(value) },
    getAttribute(name) { return Object.hasOwn(node.attributes, name) ? node.attributes[name] : null },
    hasAttribute(name) { return Object.hasOwn(node.attributes, name) },
    removeAttribute(name) { delete node.attributes[name] },
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
    getElementById(id) { return head.children.find(function (node) { return node.id === id }) || null },
  }
}

function withDocument(fn) {
  const doc = fakeDocument()
  const previous = globalThis.document
  globalThis.document = doc
  try {
    return fn(doc)
  } finally {
    if (previous === undefined) delete globalThis.document
    else globalThis.document = previous
  }
}

// ------------------------------------------------------------------ state

test('both looks default to OFF and survive sanitize', function () {
  assert.equal(DEFAULT_STATE.markdownScope, false)
  assert.equal(DEFAULT_STATE.viewTabsPill, false)
  // Every key of DEFAULT_STATE must come back through sanitize: the whitelist
  // rebuilds the object, so a key missing here is silently dropped on every
  // save — the failure mode that made `uiFontFamily` invisible once.
  const clean = sanitize({})
  for (const key of Object.keys(DEFAULT_STATE)) {
    assert.ok(Object.hasOwn(clean, key), 'sanitize dropped ' + key)
    assert.deepEqual(clean[key], DEFAULT_STATE[key], key + ' changed by an empty sanitize')
  }
  assert.equal(sanitize({ markdownScope: true }).markdownScope, true)
  assert.equal(sanitize({ viewTabsPill: true }).viewTabsPill, true)
  // Opt-in only: a truthy non-boolean must not light either look.
  assert.equal(sanitize({ markdownScope: 'yes' }).markdownScope, false)
  assert.equal(sanitize({ viewTabsPill: 1 }).viewTabsPill, false)
  // A stored payload from an older version cannot turn them on.
  assert.equal(sanitize({ warmth: 40 }).markdownScope, false)
  assert.equal(sanitize(null).viewTabsPill, false)
})

test('the settings store persists both keys and reads them back', function () {
  const memory = new Map()
  const storage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null },
    setItem(key, value) { memory.set(key, value) },
  }
  const store = createSettingsStore(storage)
  assert.equal(store.getState().markdownScope, false)
  store.setState({ markdownScope: true, viewTabsPill: true })
  const stored = JSON.parse(memory.get(STORAGE_KEY))
  assert.equal(stored.markdownScope, true)
  assert.equal(stored.viewTabsPill, true, 'the pill key must survive a save')
  const reloaded = createSettingsStore(storage)
  assert.equal(reloaded.getState().markdownScope, true)
  assert.equal(reloaded.getState().viewTabsPill, true)
  // And an unsubscribe exists, so a lifecycle can detach.
  const off = store.subscribe(function () {})
  assert.equal(typeof off, 'function')
  off()
})

// -------------------------------------------------------------------- css

test('the markdown scope is emitted only when enabled && refine && its flag', function () {
  const marker = 'markdown scope: lists, tasks, emphasis, links'
  assert.ok(!rules({}).includes(marker), 'default state must emit nothing')
  assert.ok(rules({ markdownScope: true }).includes(marker), 'on + refine emits the block')
  assert.ok(!rules({ markdownScope: true, refine: false }).includes(marker),
    'refine off must drop it — it is a component rule')
  assert.ok(!rules({ markdownScope: true, enabled: false }).includes(marker),
    'the master switch releases everything')
  assert.ok(!rules({ markdownScope: false, viewTabsPill: true }).includes(marker),
    'the two switches are independent')
})

test('the view-tabs pill is emitted only when enabled && refine && its flag', function () {
  const marker = 'view tabs: the reference pill'
  assert.ok(!rules({}).includes(marker), 'default state must emit nothing')
  assert.ok(rules({ viewTabsPill: true }).includes(marker))
  assert.ok(!rules({ viewTabsPill: true, refine: false }).includes(marker))
  assert.ok(!rules({ viewTabsPill: true, enabled: false }).includes(marker))
  assert.ok(!rules({ viewTabsPill: false, markdownScope: true }).includes(marker))
  // The rules key on the body mark, not on the strip: without the attribute
  // nothing matches, which is what makes the host style the default.
  assert.ok(rules({ viewTabsPill: true }).includes('body[' + TABS_ATTR + '="' + TABS_PILL + '"] ' + TABS_SELECTOR))
})

test('the settings sheet rewrites when either flag flips, and cleans up on teardown', function () {
  withDocument(function (doc) {
    let state = sanitize({})
    const styles = createStyles({ getState: function () { return state } })
    styles.activate()
    styles.apply()
    const tag = doc.getElementById(STYLE_ID)
    assert.ok(tag)
    const offText = tag.textContent
    assert.ok(!offText.includes('markdown scope'))

    state = sanitize({ markdownScope: true })
    styles.apply()
    const onText = tag.textContent
    assert.notEqual(onText, offText, 'flipping the flag must rewrite the rules tag')
    assert.ok(onText.includes('markdown scope'))
    assert.ok(tag.writes >= 2)

    state = sanitize({ markdownScope: true, viewTabsPill: true })
    styles.apply()
    assert.ok(tag.textContent.includes('view tabs: the reference pill'))

    state = sanitize({})
    styles.apply()
    assert.equal(tag.textContent, offText, 'turning both off restores the byte-identical sheet')
    assert.equal(doc.getElementById(FONT_STYLE_ID).writes, 1, 'the font sheet is never rebuilt')

    styles.teardown()
    assert.equal(doc.getElementById(STYLE_ID), null)
  })
})

// -------------------------------------------------------------- markdown

test('the scope is the assistant row, not a salted class', function () {
  assert.equal(MARKDOWN_ROOT, '[data-chat-flow] [data-chat-flow-kind="assistant-step"]')
  assert.ok(!/\[class\*=/.test(markdownScopeRules()),
    'no [class*="markdown"] salt fragment — the row type is the anchor')
  assert.ok(!/_[a-z0-9]{5}_\d+/.test(markdownScopeRules()), 'no hashed class either')
})

test('every scoped subject excludes code, tool cards and genui cards', function () {
  const text = markdownScopeRules()
  const bodies = text.split('\n').filter(function (line) { return /\{$/.test(line) })
  assert.ok(bodies.length > 5, 'expected the block to have several rules')
  for (const selector of bodies) {
    assert.ok(selector.includes(EXCLUDE), 'missing the exclusion: ' + selector)
  }
  for (const part of ['pre', 'pre *', 'code', 'code *',
    '[data-slot="tool.call.toolview"]', '[data-slot="tool.call.toolview"] *',
    '.dsh-genui-card', '.dsh-genui-card *']) {
    assert.ok(EXCLUDE.includes(part), 'the exclusion must name ' + part)
  }
  assert.ok(EXCLUDE.includes(':where('), ':where keeps the exclusion at zero specificity')
})

test('the block leaves code chips, code blocks and leading alone', function () {
  const text = markdownScopeRules()
  // No re-paint of an inline chip inside a link: the codeRules() chip is the
  // only thing allowed to colour code, and `!important` there would win.
  assert.ok(!/a\[href\]\s+code/.test(text), 'the a[href] code override must be gone')

  // Strip the exclusion groups before looking for a code SUBJECT: the words
  // "code" and "pre" appear legitimately inside `:not(:where(…))`, so a plain
  // regex over the whole selector would flag every rule in the block.
  const pairs = text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)
  let checked = 0
  for (const pair of pairs) {
    const selector = pair[1].replace(/:not\(:where\([^)]*\)\)/g, '').trim()
    const body = pair[2]
    checked += 1
    for (const subject of selector.split(',')) {
      const s = subject.trim()
      assert.ok(!/(^|[\s>])code(\s*\*)?$/.test(s), 'no rule may target a code element: ' + s)
      assert.ok(!/(^|[\s>])pre(\s*\*)?$/.test(s), 'no rule may target a pre element: ' + s)
      if (/(^|[\s>])(code|pre)(\s*\*)?$/.test(s)) {
        assert.ok(!/(^|[;\s])color\s*:/.test(body), 'and none may colour one: ' + s)
      }
    }
  }
  assert.ok(checked > 5, 'expected the block to have several rules')
  // Leading is inherited from the host's markdown root, not pinned per item.
  const li = text.split('\n').filter(function (line) { return /\bli\b.*\{\s*$/.test(line) })
  assert.ok(li.length > 0, 'expected li rules')
  for (const rule of li) assert.ok(!/line-height/.test(rule))
  assert.ok(!/^\s*line-height:/m.test(text), 'no pinned line-height anywhere in this block')
  // The native task box keeps its tick and its disabled state: only paint
  // properties are written.
  const box = text.slice(text.indexOf('input[type="checkbox"]'))
  const body = box.slice(box.indexOf('{') + 1, box.indexOf('}'))
  for (const banned of ['appearance', 'pointer-events', 'opacity', 'display', 'checked']) {
    assert.ok(!body.includes(banned), 'the task box must not write ' + banned)
  }
  assert.ok(body.includes('accent-color'), 'accent-color is what paints the tick')
})

// ------------------------------------------------------------------ tabs

test('the pill trough hugs its tabs instead of stretching across the header', function () {
  // The host renders the strip as a GRID ITEM
  // (`.Dc7zOa_header { display: grid; grid-template-columns: auto minmax(0,1fr) }`,
  // `.Dc7zOa_tabs { grid-column: 1/-1; display: flex }`). A grid item stretches
  // by default and `inline-flex` does not stop it, so the trough spanned the
  // whole header with an empty right half. `justify-self: start` is the
  // grid-level shrink.
  const pill = tabsStyleRules()
  const lines = pill.split('\n')
  const stripAt = lines.findIndex(function (line) {
    return line.trim() === 'body[' + TABS_ATTR + '="' + TABS_PILL + '"] ' + TABS_SELECTOR + ' {'
  })
  assert.ok(stripAt >= 0, 'expected the strip rule')
  const close = lines.indexOf('}', stripAt)
  const strip = lines.slice(stripAt, close + 1).join('\n')
  assert.ok(strip.includes('justify-self: start;'),
    'the strip must shrink to its content as a grid item')
  assert.ok(strip.includes('display: inline-flex;'))
  // The theme's 2px gap must replace the host's 36px between tabs. It wins on
  // specificity — `body[attr] [data-conversation-tabs]` (0,2,0) against the
  // host's single class (0,1,0) — so no !important is involved.
  assert.ok(strip.includes('gap: 2px;'), 'the pill gap replaces the host 36px')
  assert.ok(!strip.includes('!important'),
    'the pill must not need !important to outrank a single host class')
  // The type scale is deliberately the host's 13px, not the reference's 12px.
  assert.ok(pill.includes('font-size: 13px;'), 'the host step is kept on purpose')

  // The host look (attribute absent) emits none of this: every selector is
  // scoped to the body mark, and the default state emits nothing at all.
  const hostLook = rules({})
  assert.ok(!hostLook.includes('justify-self: start'),
    'the host look must not carry the shrink')
  assert.ok(!hostLook.includes(TABS_SELECTOR), 'and must not name the strip at all')
})

test('the pill rules carry tokens only — no literal colour, and motion is optional', function () {
  const text = tabsStyleRules()
  assert.ok(!/rgba?\(/.test(text), 'no raw rgba: colour must come from tokens')
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(text), 'no literal hex either')
  assert.ok(text.includes('var(--dsw-specific-selector)'), 'the trough is a token')
  assert.ok(text.includes('var(--dsw-alias-bg-overlay)'), 'the selected plate is a token')
  assert.ok(text.includes('var(--dsw-elevation-soft)'), 'the lift is the elevation tier')
  assert.ok(text.includes('@media (prefers-reduced-motion: reduce)'),
    'the crossfade must be switchable off entirely')
  assert.ok(text.includes('transition: none;'))
})

test('the body mark follows the switch, is idempotent and is removed on stop', function () {
  const doc = fakeDocument()
  let state = sanitize({})
  const listeners = []
  const tabs = createTabsStyleController({
    doc,
    getState: function () { return state },
    subscribe: function (fn) { listeners.push(fn); return function () { listeners.splice(listeners.indexOf(fn), 1) } },
  })

  tabs.start()
  assert.equal(tabs.applied, false, 'default state writes no mark')
  assert.equal(doc.body.getAttribute(TABS_ATTR), null)

  // Flipping the setting through the store must reach the mark.
  state = sanitize({ viewTabsPill: true })
  for (const fn of listeners.slice()) fn()
  assert.equal(tabs.applied, true)
  assert.equal(doc.body.getAttribute(TABS_ATTR), TABS_PILL)

  // Idempotent: a second sync with the same value is not a DOM mutation.
  let writes = 0
  const set = doc.body.setAttribute
  doc.body.setAttribute = function (name, value) { writes += 1; set.call(doc.body, name, value) }
  tabs.sync()
  assert.equal(writes, 0, 'writing the value the body already carries must be skipped')

  // The master switch takes the mark away as well.
  state = sanitize({ viewTabsPill: true, enabled: false })
  for (const fn of listeners.slice()) fn()
  assert.equal(tabs.applied, false, 'a disabled theme must not leave the pill mark on')

  // And so does flipping the setting back off.
  state = sanitize({ viewTabsPill: true })
  for (const fn of listeners.slice()) fn()
  assert.equal(tabs.applied, true)
  state = sanitize({})
  for (const fn of listeners.slice()) fn()
  assert.equal(tabs.applied, false)

  // stop() is the cleanup: mark gone, store untouched.
  state = sanitize({ viewTabsPill: true })
  for (const fn of listeners.slice()) fn()
  assert.equal(tabs.applied, true)
  tabs.stop()
  assert.equal(doc.body.getAttribute(TABS_ATTR), null, 'dispose must remove the mark')
  assert.equal(doc.body.hasAttribute(TABS_ATTR), false)
  assert.equal(listeners.length, 0, 'the store subscription is released')
})

test('a document without a body degrades instead of throwing', function () {
  assert.equal(applyTabsStyle(null, TABS_PILL), false)
  assert.equal(applyTabsStyle({}, TABS_PILL), false)
  assert.equal(applyTabsStyle({ body: {} }, TABS_PILL), false)
  const tabs = createTabsStyleController({ doc: null, getState: function () { return { viewTabsPill: true } } })
  assert.doesNotThrow(function () { tabs.start(); tabs.stop() })
  assert.equal(tabs.applied, false)
})

// ---------------------------------------------------------------- the rows

test('the two rows render OFF at the default state and flip to ON', function () {
  // THE BUG THIS PINS. `ToggleRow` used to read `state[key] !== false`, which is
  // correct for every row that defaults ON (all the older ones) and WRONG for an
  // opt-in row: `false !== false` is false, so the switch already looked ON, and
  // the first click wrote `false` again — the control appeared stuck. Both new
  // rows therefore declare `offByDefault`, and this test drives the real
  // component through the real store.
  const memory = new Map()
  const store = createSettingsStore({
    getItem(key) { return memory.has(key) ? memory.get(key) : null },
    setItem(key, value) { memory.set(key, value) },
  })
  function element(type, props) {
    const children = Array.prototype.slice.call(arguments, 2)
    if (typeof type === 'function') {
      return type(Object.assign({}, props, { children: children.length > 0 ? children : props.children }))
    }
    return { type, props: props || {}, children }
  }
  const React = {
    createElement: element,
    useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot() },
  }
  const panel = createPanel({
    React,
    primitives: { IconCheckOutlineRegular: function () { return null } },
    settings: store,
    themeMode: null,
  })

  /** The switch element of one row, rendered through its own bound component. */
  function switchOf(id) {
    const slot = panel.slots.find(function (entry) { return entry.id === id })
    assert.ok(slot, 'missing row ' + id)
    const tree = slot.component({ t: function (key) { return key } })
    // row → control → button[role=switch]
    const control = tree.children[1]
    const button = control.children[0]
    assert.equal(button.props.role, 'switch')
    return button
  }

  for (const entry of [
    { id: 'dsh-cds-theme-markdown-scope', key: 'markdownScope' },
    { id: 'dsh-cds-theme-view-tabs-pill', key: 'viewTabsPill' },
  ]) {
    assert.equal(store.getState()[entry.key], false, entry.key + ' must default off')
    let button = switchOf(entry.id)
    assert.equal(button.props['aria-checked'], false,
      entry.id + ' must render OFF at the default state, not ON')

    // One click turns it on…
    button.props.onClick()
    assert.equal(store.getState()[entry.key], true, entry.id + ' click must write true')
    button = switchOf(entry.id)
    assert.equal(button.props['aria-checked'], true, entry.id + ' must render ON after one click')

    // …and the next click turns it off again.
    button.props.onClick()
    assert.equal(store.getState()[entry.key], false)
    button = switchOf(entry.id)
    assert.equal(button.props['aria-checked'], false)
  }
  // The older rows keep reading ON, so the fix is scoped to the opt-in ones.
  assert.equal(switchOf('dsh-cds-theme-enabled').props['aria-checked'], true)
  assert.equal(switchOf('dsh-cds-theme-refine').props['aria-checked'], true)
})

// --------------------------------------------------------------- composer

test('the composer split is wired, defaults OFF, and emits no rule until flipped', function () {
  const marker = 'composer: split layout (box, then one toolbar line)'
  assert.equal(DEFAULT_STATE.composerSplit, false)
  assert.equal(sanitize({}).composerSplit, false)
  assert.equal(sanitize({ composerSplit: 'yes' }).composerSplit, false)
  assert.ok(!rules({}).includes(marker), 'default state must emit nothing')
  assert.ok(rules({ composerSplit: true }).includes(marker), 'on + refine emits the rules')
  assert.ok(!rules({ composerSplit: true, refine: false }).includes(marker))
  assert.ok(!rules({ composerSplit: true, enabled: false }).includes(marker))
  // The row exists, so the audit's "boolean state key with no settings row" is
  // not a live regression any more.
  const panel = createRowPanel()
  const row = panel.slots.find(function (slot) { return slot.key === 'composerSplit' })
  assert.ok(row, 'composerSplit must have a settings row')
  assert.equal(row.id, 'dsh-cds-theme-composer-split')
  assert.equal(row.order, 47)
})

test('the split lifts the dock from the stack, never from the card', function () {
  const text = composerLayoutRules()
  // The containing block must be the stack: the dock is the card's SIBLING, so a
  // coordinate written on the card could never reach it or position it.
  assert.ok(text.includes('[' + COMPOSER_STACK_ATTR + '] {\n  position: relative;'),
    'the stack is the positioned containing block')
  assert.ok(text.includes('position: absolute;'), 'the dock is lifted onto the band')
  assert.ok(text.includes('top: var(' + ROW_TOP_VAR), 'the band comes from the stack property')
  assert.ok(text.includes('height: var(' + ROW_HEIGHT_VAR),
    'the band height comes from the stack property')
  // …and it is the dock that is lifted, selected as a CHILD of the stack.
  assert.ok(text.includes('[' + COMPOSER_STACK_ATTR + '] > [data-composer-dock]'))
  // Click-through: the dock lets the host's buttons underneath stay clickable.
  assert.ok(/pointer-events: none;/.test(text))
  assert.ok(/\[data-composer-dock\] > \* \{\n  pointer-events: auto;/.test(text))
})

test('the split never reintroduces the two defects of the first draft', function () {
  const text = composerLayoutRules()
  // ① No fixed horizontal inset: cluster widths are measured, so a narrow window
  //    cannot overlap them.
  assert.ok(!/padding:\s*0?\s*168px/.test(text), 'the hard 168px inset must be gone')
  assert.ok(!/168/.test(text), 'nothing may hard-code 168px')
  // The insets come from measured cluster widths…
  assert.ok(text.includes('var(' + DOCK_INSET_LEFT_VAR))
  assert.ok(text.includes('var(' + DOCK_INSET_RIGHT_VAR))
  // …and a measured narrow mode takes the dock back to its own line.
  assert.ok(text.includes('[' + COMPOSER_NARROW_ATTR + ']'))
  assert.ok(/\[data-cds-composer-narrow\] > \[data-composer-dock\] \{\n  position: static;/.test(text))
  // ② The text box keeps the two budget owners' ceiling: no max-height, no
  //    overflow, no min-height on the host's scrollport.
  const box = text.slice(text.indexOf(' [data-input-scroll] {'))
  const body = box.slice(box.indexOf('{') + 1, box.indexOf('}'))
  for (const banned of ['max-height', 'overflow', 'min-height']) {
    assert.ok(!body.includes(banned),
      'the split must not write ' + banned + ' on the host\'s scrollport')
  }
  // And it must not name the token budget owners at all.
  assert.ok(!text.includes('--dus-input-budget'), 'usage-stats owns that variable')
  assert.ok(!text.includes('--dsh-composer-text-max-height'), 'the host owns that one')
})

test('the measurement watches card, row AND text port, coalesced onto one frame', function () {
  const source = readFileSync(new URL('../client/src/composer-layout.js', import.meta.url), 'utf8')
  const body = source.slice(source.indexOf('export function createRowAlignment'))
  assert.ok(/observe\(card\)/.test(body), 'the card must be observed (short/long text changes its height)')
  assert.ok(/observe\(row\)/.test(body), 'the row must be observed')
  assert.ok(/card\.querySelector\(TEXT_PORT\)/.test(body),
    'the TEXT PORT must be observed: a growing draft moves the row without resizing it')
  assert.ok(/requestFrame/.test(body), 'readings coalesce onto one animation frame')
  assert.ok(/cancelFrame/.test(body), 'a pending frame is cancelled on stop')
  assert.ok(/disconnect\(\)/.test(body), 'the observer is disconnected')
  for (const name of [ROW_TOP_VAR, ROW_HEIGHT_VAR, DOCK_INSET_LEFT_VAR, DOCK_INSET_RIGHT_VAR]) {
    assert.ok(body.includes('removeProperty'), 'stop() must remove ' + name)
  }
  assert.ok(source.includes('findComposerParts'), 'the stack is found by walking parentElement')
  assert.ok(!/classList|className/.test(source), 'no salted class may be used to find the stack')
})

test('the controller marks, measures and cleans up on the live DOM', function () {
  // A hand-built stack: root → [card → row(clusters), dock]. The dock is the
  // card's SIBLING, which is the shape that broke the first draft.
  function node(box, children) {
    const el = {
      children: children || [],
      attributes: {},
      parentElement: null,
      style: {
        props: {},
        setProperty(name, value) { el.style.props[name] = value },
        removeProperty(name) { delete el.style.props[name] },
      },
      setAttribute(name, value) { el.attributes[name] = value === undefined ? '' : String(value) },
      getAttribute(name) { return Object.hasOwn(el.attributes, name) ? el.attributes[name] : null },
      hasAttribute(name) { return Object.hasOwn(el.attributes, name) },
      removeAttribute(name) { delete el.attributes[name] },
      getBoundingClientRect() { return box },
      querySelector(selector) {
        return el.children.find(function (child) { return child.matches(selector) }) || null
      },
      matches(selector) { return (el.selectors || []).includes(selector) },
      contains(other) {
        let found = false
        const walk = function (current) {
          for (const child of current.children) {
            if (child === other) found = true
            walk(child)
          }
        }
        walk(el)
        return found
      },
    }
    for (const child of el.children) child.parentElement = el
    return el
  }

  // The host's real row shape: a left cluster wrapping the permission seat AND
  // the plan seat, and a right cluster wrapping the model seat and Send. The
  // plan seat is what the permission-only measurement could not see.
  const row = node({ top: 60, left: 0, right: 500, width: 500, height: 32 })
  const left = node({ top: 60, left: 8, right: 48, width: 40, height: 32 })
  left.selectors = [LEFT_SLOT]
  const plan = node({ top: 60, left: 56, right: 66, width: 10, height: 32 })
  plan.selectors = [PLAN_SLOT]
  // The wrapper's right edge (72) is PAST the plan seat's (66): a measurement
  // taken from the permission slot alone would stop at 48.
  const leftCluster = node({ top: 60, left: 0, right: 72, width: 72, height: 32 }, [left, plan])
  const right = node({ top: 60, left: 420, right: 492, width: 72, height: 32 })
  right.selectors = [RIGHT_SLOT]
  const rightCluster = node({ top: 60, left: 420, right: 500, width: 80, height: 32 }, [right])
  row.children = [leftCluster, rightCluster]
  for (const child of row.children) child.parentElement = row
  function deepFind(root, selector) {
    for (const child of root.children) {
      if (child.matches && child.matches(selector)) return child
      const deeper = deepFind(child, selector)
      if (deeper !== null) return deeper
    }
    return null
  }
  row.querySelector = function (selector) { return deepFind(row, selector) }
  const port = node({ top: 0, left: 0, right: 500, width: 500, height: 60 })
  port.selectors = [TEXT_PORT]
  const card = node({ top: 0, left: 0, right: 500, width: 500, height: 100 }, [port, row])
  card.selectors = [CARD]
  card.querySelector = function (selector) { return deepFind(card, selector) }
  const dock = node({ top: 100, left: 0, right: 500, width: 500, height: 24 }, [node({ top: 100, left: 0, right: 10, width: 10, height: 24 })])
  dock.selectors = [DOCK]
  const stack = node({ top: 0, left: 0, right: 500, width: 500, height: 124 }, [card, dock])

  const observed = []
  let observerCallback = null
  function FakeRO(callback) {
    observerCallback = callback
    return {
      observe(target) { observed.push(target) },
      disconnect() { observed.length = 0 },
    }
  }
  const doc = {
    body: node({}),
    defaultView: null,
    querySelector(selector) {
      if (selector === CARD) return card
      if (selector === DOCK) return dock
      return null
    },
  }
  const frames = []
  const controller = createComposerLayoutController({
    doc: doc,
    getState: function () { return sanitize({ composerSplit: true }) },
    ResizeObserver: FakeRO,
    requestFrame: function (run) { frames.push(run); return frames.length },
    cancelFrame: function () {},
  })

  controller.start()
  assert.equal(doc.body.getAttribute(COMPOSER_LAYOUT_ATTR), COMPOSER_LAYOUT_SPLIT)
  assert.ok(stack.hasAttribute(COMPOSER_STACK_ATTR), 'the stack is marked')
  assert.ok(row.hasAttribute(COMPOSER_ROW_ATTR), 'the row is marked')
  // THE POINT: the numbers live on the STACK, the dock's ancestor — not the card.
  assert.equal(stack.style.props[ROW_TOP_VAR], '60px')
  assert.equal(stack.style.props[ROW_HEIGHT_VAR], '32px')
  assert.equal(card.style.props[ROW_TOP_VAR], undefined, 'nothing may be written on the card')
  // The insets come from the CLUSTERS, never a constant and never one slot: the
  // wrapper's right edge (72) is past the permission seat's (48) and past the
  // plan seat's (66), because that is where the host's buttons really end.
  assert.equal(stack.style.props[DOCK_INSET_LEFT_VAR], String(72 - 0 + 8) + 'px',
    'the left inset is measured from the CLUSTER, so the plan seat is behind it')
  assert.equal(stack.style.props[DOCK_INSET_RIGHT_VAR], String(500 - 420 + 8) + 'px')
  // 500 - 80 - 88 = 332 ≥ the dock's 10px child span + 2*8, so one line is honest.
  assert.equal(stack.hasAttribute(COMPOSER_NARROW_ATTR), false,
    'a row that can hold the statistics keeps them on the band')
  // All three elements are observed, including the text port.
  assert.deepEqual(observed, [card, row, port])

  // An observer callback schedules exactly one frame; a second call is coalesced.
  observerCallback()
  observerCallback()
  assert.equal(frames.length, 1, 'callbacks coalesce onto one frame')
  frames[0]()

  // A narrow row flips the measured mode, which puts the dock back in flow. The
  // clusters move with the row here because that is what a shrinking row does:
  // the right cluster is pinned to its right edge, not left behind at x=420.
  row.getBoundingClientRect = function () { return { top: 60, left: 0, right: 200, width: 200, height: 32 } }
  rightCluster.getBoundingClientRect = function () { return { top: 60, left: 120, right: 200, width: 80, height: 32 } }
  controller.measure()
  assert.equal(stack.hasAttribute(COMPOSER_NARROW_ATTR), true,
    'a measured gap under the minimum must switch to the narrow layout')
  assert.equal(stack.style.props[ROW_HEIGHT_VAR], '32px', 'the band is still measured')
  // Still the clusters, not the slots: 72 (not 48) and 200 - 120 (not 200 - 420).
  assert.equal(stack.style.props[DOCK_INSET_LEFT_VAR], '80px',
    'the insets stay the measured cluster extents')
  assert.equal(stack.style.props[DOCK_INSET_RIGHT_VAR], '88px')

  // stop() removes every mark and property it wrote.
  controller.stop()
  assert.equal(doc.body.getAttribute(COMPOSER_LAYOUT_ATTR), null)
  assert.equal(stack.hasAttribute(COMPOSER_STACK_ATTR), false)
  assert.equal(stack.hasAttribute(COMPOSER_NARROW_ATTR), false)
  assert.equal(row.hasAttribute(COMPOSER_ROW_ATTR), false)
  for (const name of [ROW_TOP_VAR, ROW_HEIGHT_VAR, DOCK_INSET_LEFT_VAR, DOCK_INSET_RIGHT_VAR]) {
    assert.equal(stack.style.props[name], undefined, name + ' must be removed on stop')
  }
})

/**
 * A composer whose left cluster holds BOTH seats, laid out like the host's:
 *   row → [leftCluster → (add, permission, plan), rightCluster → (model, send)]
 * and the dock as the card's sibling.
 *
 * `dockSpans` is the list of children the dock renders, each `{ left, right }`,
 * so a test can decide how much content the statistics actually occupy.
 */
function clusterComposer(spec) {
  const options = spec || {}
  const rowBox = options.row || { top: 60, left: 0, right: 500, width: 500, height: 32 }
  function node(box, children) {
    const el = {
      children: children || [],
      attributes: {},
      parentElement: null,
      selectors: [],
      style: {
        props: {},
        setProperty(name, value) { el.style.props[name] = value },
        removeProperty(name) { delete el.style.props[name] },
      },
      setAttribute(name, value) { el.attributes[name] = value === undefined ? '' : String(value) },
      getAttribute(name) { return Object.hasOwn(el.attributes, name) ? el.attributes[name] : null },
      hasAttribute(name) { return Object.hasOwn(el.attributes, name) },
      removeAttribute(name) { delete el.attributes[name] },
      getBoundingClientRect() { return el.box },
      matches(selector) { return el.selectors.includes(selector) },
      contains(other) {
        let found = false
        const walk = function (current) {
          for (const child of current.children) {
            if (child === other) found = true
            walk(child)
          }
        }
        walk(el)
        return found
      },
    }
    el.box = box
    for (const child of el.children) child.parentElement = el
    return el
  }
  function label(selector) {
    return function (el) { el.selectors = el.selectors.concat([selector]); return el }
  }

  const add = node({ top: 60, left: 4, right: 24, width: 20, height: 28 })
  const permission = label(LEFT_SLOT)(node({ top: 60, left: 30, right: 90, width: 60, height: 28 }))
  const plan = label(PLAN_SLOT)(node({ top: 60, left: 96, right: 160, width: 64, height: 28 }))
  // The wrapper is what the host's flex row is: its right edge is past every
  // seat inside it, so it — not the permission slot — is where buttons end.
  const leftCluster = node({ top: 60, left: 0, right: 168, width: 168, height: 32 },
    [add, permission, plan])
  const model = label(RIGHT_SLOT)(node({ top: 60, left: 0, right: 0, width: 70, height: 28 }))
  const send = node({ top: 60, left: 0, right: 0, width: 22, height: 32 })
  // The right cluster hugs the row's right edge, as the host's `margin-left: auto`
  // trailing group does; `rightGap` is how much of the row's right side it takes.
  const rightGap = options.rightGap === undefined ? 104 : options.rightGap
  const rightLeft = rowBox.right - rightGap
  const rightCluster = node({ top: 60, left: rightLeft, right: rowBox.right, width: rightGap, height: 32 },
    [model, send])
  model.box = { top: 60, left: rightLeft + 4, right: rightLeft + 74, width: 70, height: 28 }
  send.box = { top: 60, left: rowBox.right - 22, right: rowBox.right, width: 22, height: 32 }
  const row = node(rowBox, [leftCluster, rightCluster])
  // querySelector walks the tree, so the seats are found where they really live.
  row.querySelector = function (selector) { return deepFind(row, selector) }

  const port = label(TEXT_PORT)(node({ top: 0, left: 0, right: rowBox.right, width: rowBox.width, height: 60 }))
  const card = label(CARD)(node({ top: 0, left: 0, right: rowBox.right, width: rowBox.width, height: 100 },
    [port, row]))
  card.querySelector = function (selector) { return deepFind(card, selector) }

  const dockKids = (options.dockSpans === undefined ? [] : options.dockSpans).map(function (span) {
    return node({ top: 60, left: span.left, right: span.right, width: span.right - span.left, height: 18 })
  })
  const dock = label(DOCK)(node({ top: 100, left: 0, right: rowBox.right, width: rowBox.width, height: 24 },
    dockKids))
  dock.selectors = [DOCK]
  const stack = node({ top: 0, left: 0, right: rowBox.right, width: rowBox.width, height: 124 }, [card, dock])

  const observed = []
  let observerCallback = null
  function FakeRO(callback) {
    observerCallback = callback
    return {
      observe(target) { observed.push(target) },
      disconnect() { observed.length = 0 },
    }
  }
  const doc = {
    body: node({}),
    defaultView: null,
    querySelector(selector) {
      if (selector === CARD) return card
      if (selector === DOCK) return dock
      return null
    },
  }
  const controller = createComposerLayoutController({
    doc: doc,
    getState: function () { return sanitize({ composerSplit: true }) },
    ResizeObserver: FakeRO,
    requestFrame: function (run) { return 1 },
    cancelFrame: function () {},
  })
  return {
    row: row, leftCluster: leftCluster, rightCluster: rightCluster,
    permission: permission, plan: plan, model: model,
    card: card, dock: dock, stack: stack, doc: doc,
    observed: observed,
    controller: controller,
    observer() { return observerCallback },
  }
}

/** Depth-first `querySelector`, so a seat is found inside its cluster. */
function deepFind(root, selector) {
  for (const child of root.children) {
    if (child.matches && child.matches(selector)) return child
    const nested = deepFind(child, selector)
    if (nested !== null) return nested
  }
  return null
}

test('the left inset comes from the CLUSTER, so a second seat is never overlapped', function () {
  // THE REGRESSION. The plan seat sits to the RIGHT of permission inside a shared
  // wrapper, and the wrapper's right edge is past the plan seat's. Measuring from
  // the permission slot alone (right = 90) leaves everything from 90 to 168 — the
  // plan chip included — under the dock, which is the 35px overlap the fixture
  // caught at 1280.
  const dom = clusterComposer({ dockSpans: [{ left: 220, right: 260 }, { left: 268, right: 300 }] })
  dom.controller.start()

  const insetLeft = Number(String(dom.stack.style.props[DOCK_INSET_LEFT_VAR]).replace('px', ''))
  // The wrapper's right edge is 168 and the air is 8, so the dock starts at 176.
  assert.equal(dom.stack.style.props[DOCK_INSET_LEFT_VAR], '176px',
    'the inset is the CLUSTER right edge plus air')
  // The permission-only measurement would have produced 98 — and that is the bug.
  const permissionOnly = 90 - 0 + 8
  assert.notEqual(insetLeft, permissionOnly,
    'a permission-only measurement must not be what the dock is inset by')
  assert.ok(insetLeft > permissionOnly + (dom.plan.box.right - dom.permission.box.right),
    'the inset must clear the plan seat, not stop at the permission seat')
  // And the dock's padding really starts to the right of every seat in the cluster.
  assert.ok(insetLeft >= dom.plan.box.right, 'the dock starts past the plan seat')

  // The right side is the cluster too: 500 - 396 + 8, not 500 - 470 + 8.
  assert.equal(dom.stack.style.props[DOCK_INSET_RIGHT_VAR], '112px')
  dom.controller.stop()
})

test('the narrow switch is the dock\'s measured width, not a fixed 220px', function () {
  // An 800px row puts the centre gap at 800 - 176 - 112 = 512, comfortably above
  // the old fixed threshold, while the statistics span 600px — wider than the gap.
  const dom = clusterComposer({
    row: { top: 60, left: 0, right: 800, width: 800, height: 32 },
    // 600px of content between the first and last statistic.
    dockSpans: [{ left: 100, right: 400 }, { left: 420, right: 700 }],
  })
  dom.controller.start()

  const centre = 800 - 176 - 112
  assert.ok(centre >= MIN_CENTRE_GAP,
    'the fixture must keep the gap above the old fixed threshold, or it proves nothing')
  const content = measureDockContent(dom.dock)
  assert.equal(content, 600, 'the dock content is measured from its own children')
  assert.ok(content > centre, 'the statistics are wider than the gap')
  // The fixed 220px test would leave this UNSET and let the dock overlap.
  assert.equal(dom.stack.hasAttribute(COMPOSER_NARROW_ATTR), true,
    'a dock wider than the measured gap must fall back, even above 220px')
  dom.controller.stop()
})

test('an EMPTY dock falls back to MIN_CENTRE_GAP as its floor', function () {
  // Nothing to measure: one child (or none) means no content span, so the floor
  // is the only honest threshold left.
  const empty = clusterComposer({ dockSpans: [] })
  assert.equal(measureDockContent(empty.dock), 0, 'no children, no content span')
  empty.controller.start()
  // 500 - 176 - 112 = 212 < 220, so an empty dock still falls back.
  assert.equal(empty.stack.hasAttribute(COMPOSER_NARROW_ATTR), true)
  empty.controller.stop()

  // …and a single child is also unmeasurable: one element has no span between two.
  const single = clusterComposer({ dockSpans: [{ left: 200, right: 260 }] })
  assert.equal(measureDockContent(single.dock), 0, 'one child has no span')
  single.controller.start()
  assert.equal(single.stack.hasAttribute(COMPOSER_NARROW_ATTR), true)
  single.controller.stop()

  // A gap that clears the floor keeps an empty dock on the band.
  const wide = clusterComposer({ row: { top: 60, left: 0, right: 800, width: 800, height: 32 }, dockSpans: [] })
  wide.controller.start()
  assert.equal(wide.stack.hasAttribute(COMPOSER_NARROW_ATTR), false,
    'with nothing to place, the 220px floor decides')
  wide.controller.stop()
})

test('findCluster falls back to the slot when the walk never reaches the row', function () {
  // Degenerate shapes must not throw and must not invent an ancestor: a slot that
  // already IS a row child, and a slot detached from the row entirely.
  const direct = { parentElement: null }
  const row = { children: [direct] }
  direct.parentElement = row
  assert.equal(findCluster(row, direct), direct, 'a direct child is its own cluster')

  const orphan = { parentElement: null }
  assert.equal(findCluster(row, orphan), orphan, 'a detached slot falls back to itself')
  assert.equal(findCluster(row, null), null, 'no slot, no cluster')
})

test('the split degrades when the host renders no dock or no stack', function () {
  const doc = { body: { attributes: {}, setAttribute(n, v) { this.attributes[n] = v }, getAttribute(n) { return this.attributes[n] || null }, hasAttribute(n) { return Object.hasOwn(this.attributes, n) }, removeAttribute(n) { delete this.attributes[n] } }, querySelector() { return null } }
  const controller = createComposerLayoutController({
    doc: doc,
    getState: function () { return sanitize({ composerSplit: true }) },
    ResizeObserver: null,
  })
  assert.doesNotThrow(function () { controller.start(); controller.measure(); controller.stop() })
  assert.equal(doc.body.getAttribute(COMPOSER_LAYOUT_ATTR), null)
})

// ------------------------------------------------------------ +N / −N font

test('the file-change counts use the UI family in BOTH card states', function () {
  const css = rules({})
  const rule = css.split('\n')
  const at = rule.findIndex(function (line) {
    return line.includes('[class*="diffStat"]')
  })
  assert.ok(at >= 0, 'expected a diffStat rule')
  // A grouped selector: both the host's cell and the theme's own stats span.
  const selector = rule.slice(at, at + 2).join('\n')
  assert.ok(selector.includes('[data-slot="tool.call.toolview"]'),
    'it must be scoped to a tool row')
  assert.ok(selector.includes('[data-tool]'), 'and to the tool summary, not to every stat cell')
  assert.ok(selector.includes('[data-cds-diffrow-stats]'),
    'the theme\'s own card draws its counts with this marker — it needs the rule too')
  const body = rule.slice(at, at + 6).join('\n')
  // `!important` is load-bearing: the conversation-content prose rule is itself
  // !important, and this rule has to beat it or the counts stay on the text
  // family (which is exactly the Mono the user reported).
  assert.ok(body.includes('font-family: var(--dsw-font-family-ui, var(--dsw-font-family)) !important;'),
    'the counts take the UI family, falling back to the text role, with !important')
  assert.ok(body.includes('font-variant-numeric: tabular-nums;'))
  // The colours are the host's: no color, no opacity.
  for (const banned of ['color:', 'opacity']) {
    assert.ok(!body.includes(banned), 'the diffStat rule must not write ' + banned)
  }
})

test('the counts rule survives refine=false, where the host card is back', function () {
  // The rule exists for the HOST card, and the host card is what appears when
  // refinement is off — so it must NOT sit inside the `if (state.refine)` block.
  // A rule there would be present exactly in the state that does not need it.
  const off = rules({ refine: false })
  const at = off.split('\n').findIndex(function (line) {
    return line.includes('[class*="diffStat"]')
  })
  assert.ok(at >= 0, 'the counts rule must be emitted with refine off')
  const selector = off.split('\n').slice(at, at + 2).join('\n')
  assert.ok(selector.includes('[data-cds-diffrow-stats]'),
    'the theme card variant rides the same block')
  assert.ok(!off.includes('[data-composer-card]:not('),
    'and refine=false still drops the component half around it')
})

// ------------------------------------------------------------- the wiring

test('the lifecycle mounts and disposes all three looks', function () {
  const source = readFileSync(new URL('../client/src/lifecycle.js', import.meta.url), 'utf8')
  assert.ok(source.includes('createTabsStyleController'), 'the tab mark must be wired, not just imported')
  assert.ok(source.includes("'dsh-cds-theme: view tab style'"), 'it must be its own effect')
  assert.ok(source.includes('createComposerLayoutController'), 'the split must be wired too')
  assert.ok(source.includes("'dsh-cds-theme: composer split layout'"), 'and be its own effect')
  // The markdown scope is pure CSS: no marker, no observer, no runtime.
  assert.ok(!source.includes('markdownScopeRules'), 'the markdown scope needs no lifecycle code')
  assert.ok(!/MutationObserver/.test(source.split('dsh-cds-theme: view tab style')[0].split('heroRipple')[1] || ''),
    'the tab mark must not add an observer')
  // The split's only observer belongs to its own module, and its readings are
  // frame-coalesced; nothing watches per frame.
  const composer = readFileSync(new URL('../client/src/composer-layout.js', import.meta.url), 'utf8')
  assert.ok(!/requestAnimationFrame\(function \(\) \{\s*measure/.test(composer),
    'no per-frame measurement loop')
  assert.ok(!/setInterval|setTimeout\(.*measure/.test(composer), 'no timer may re-measure')
  const styles = readFileSync(new URL('../client/src/styles.js', import.meta.url), 'utf8')
  assert.ok(/state\.markdownScope === true\)\s*parts\.push\(markdownScopeRules\(\)\)/.test(styles),
    'buildCss must emit the markdown block on the flag')
  assert.ok(/state\.viewTabsPill === true\)\s*parts\.push\(tabsStyleRules\(\)\)/.test(styles),
    'buildCss must emit the pill on the flag')
  assert.ok(/state\.composerSplit === true\)\s*parts\.push\(composerLayoutRules\(\)\)/.test(styles),
    'buildCss must emit the split on the flag')
})
