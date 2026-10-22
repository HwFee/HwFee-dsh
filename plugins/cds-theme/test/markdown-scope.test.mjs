/**
 * The assistant markdown scope: an opt-in look, and the wiring that makes the
 * switch actually reach the sheet.
 *
 * The look shipped as dead code once — the state key, the `sanitize` whitelist
 * and the rule module existed, but nothing called them, so flipping the row in
 * the panel changed exactly nothing. This file is the regression that would have
 * caught it: it asserts the STATE, the CSS and the CLEANUP, on the real entry
 * points (`buildCssFor`, `createStyles().apply()`), rather than on the rule text
 * alone.
 *
 * It also carries the two `+N / −N` count tests, which belong to the same part of
 * the sheet: that rule is emitted outside `refine`, so it has to be checked in
 * both card states.
 *
 *   node test/markdown-scope.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildCssFor, createStyles } from '../client/src/styles.js'
import { sanitize, DEFAULT_STATE, STYLE_ID, FONT_STYLE_ID, STORAGE_KEY } from '../client/src/constants.js'
import { createSettingsStore } from '../client/src/settings.js'
import { createPanel } from '../client/src/panel.js'
import { markdownScopeRules, MARKDOWN_ROOT, EXCLUDE } from '../client/src/markdown-scope.js'

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

test('the markdown look defaults to OFF and survives sanitize', function () {
  assert.equal(DEFAULT_STATE.markdownScope, false)
  // Every key of DEFAULT_STATE must come back through sanitize: the whitelist
  // rebuilds the object, so a key missing here is silently dropped on every
  // save — the failure mode that made `uiFontFamily` invisible once.
  const clean = sanitize({})
  for (const key of Object.keys(DEFAULT_STATE)) {
    assert.ok(Object.hasOwn(clean, key), 'sanitize dropped ' + key)
    assert.deepEqual(clean[key], DEFAULT_STATE[key], key + ' changed by an empty sanitize')
  }
  assert.equal(sanitize({ markdownScope: true }).markdownScope, true)
  // Opt-in only: a truthy non-boolean must not light the look.
  assert.equal(sanitize({ markdownScope: 'yes' }).markdownScope, false)
  // A stored payload from an older version cannot turn it on.
  assert.equal(sanitize({ warmth: 40 }).markdownScope, false)
  assert.equal(sanitize(null).markdownScope, false)
})

test('the settings store persists the key and reads it back', function () {
  const memory = new Map()
  const storage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null },
    setItem(key, value) { memory.set(key, value) },
  }
  const store = createSettingsStore(storage)
  assert.equal(store.getState().markdownScope, false)
  store.setState({ markdownScope: true })
  const stored = JSON.parse(memory.get(STORAGE_KEY))
  assert.equal(stored.markdownScope, true, 'the markdown key must survive a save')
  const reloaded = createSettingsStore(storage)
  assert.equal(reloaded.getState().markdownScope, true)
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
  // A stale key from an old payload must be dropped by `sanitize`, and it must not
  // drag the markdown block in: the block reads its own key only. `viewTabsPill`
  // and `composerSplit` were removed with their features; a saved payload that
  // still carries them has to behave exactly like one that does not.
  const stale = { markdownScope: false, viewTabsPill: true, composerSplit: true }
  assert.ok(!rules(stale).includes(marker), 'removed keys cannot emit the block')
  assert.deepEqual(sanitize(stale), sanitize({}),
    'a payload with removed keys sanitizes to the default state')
})

test('the settings sheet rewrites when the flag flips, and cleans up on teardown', function () {
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

    state = sanitize({})
    styles.apply()
    assert.equal(tag.textContent, offText, 'turning it off restores the byte-identical sheet')
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

// ---------------------------------------------------------------- the rows

test('the markdown row renders OFF at the default state and flips to ON', function () {
  // THE BUG THIS PINS. `ToggleRow` used to read `state[key] !== false`, which is
  // correct for every row that defaults ON (all the older ones) and WRONG for an
  // opt-in row: `false !== false` is false, so the switch already looked ON, and
  // the first click wrote `false` again — the control appeared stuck. The row
  // therefore declares `offByDefault`, and this test drives the real component
  // through the real store.
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

// ------------------------------------------------------- +N / −N counts

/**
 * The rule that matches `needle`, as `{ selector, body }`.
 *
 * The sheet is emitted one declaration per line, so a block is "the selector
 * lines up to `{`, then everything until the closing `}` on its own line". A
 * plain `indexOf('}')` is enough for the blocks read here — none of them nests.
 */
function ruleFor(css, needle) {
  const lines = css.split('\n')
  const at = lines.findIndex(function (line) { return line.includes(needle) })
  if (at < 0) return null
  // The `{` closes the LAST selector line, not a line of its own.
  let open = at
  while (open < lines.length && !lines[open].trimEnd().endsWith('{')) open += 1
  if (open >= lines.length) return null
  const close = lines.findIndex(function (line, index) {
    return index > open && line.trim() === '}'
  })
  if (close < 0) return null
  return {
    selector: lines.slice(at, open + 1).join('\n'),
    body: lines.slice(open + 1, close).join('\n'),
  }
}

test('the file-change counts use the UI family in BOTH card states', function () {
  const css = rules({})
  const rule = ruleFor(css, '[class*="diffStat"]')
  assert.ok(rule, 'expected a diffStat rule')
  // A grouped selector: both the host's cell and the theme's own stats span.
  assert.ok(rule.selector.includes('[data-slot="tool.call.toolview"]'),
    'it must be scoped to a tool row')
  assert.ok(rule.selector.includes('[data-tool]'), 'and to the tool summary, not to every stat cell')
  assert.ok(rule.selector.includes('[data-cds-diffrow-stats]'),
    'the theme\'s own card draws its counts with this marker — it needs the rule too')
  // `!important` is load-bearing: the conversation-content prose rule is itself
  // !important, and this rule has to beat it or the counts stay on the text
  // family (which is exactly the Mono the user reported).
  assert.ok(rule.body.includes('font-family: var(--dsw-font-family-ui, var(--dsw-font-family)) !important;'),
    'the counts take the UI family, falling back to the text role, with !important')
  assert.ok(rule.body.includes('font-variant-numeric: tabular-nums;'))
  // The colours are the host's: no color, no opacity.
  for (const banned of ['color:', 'opacity']) {
    assert.ok(!rule.body.includes(banned), 'the diffStat rule must not write ' + banned)
  }
})

test('each count sits on its own tinted plate, and the host ink is left alone', function () {
  const css = rules({})
  const cases = [
    { needle: '[class*="diffAdded"]', token: '--dsw-alias-file-diff-added-bg' },
    { needle: '[class*="diffRemoved"]', token: '--dsw-alias-file-diff-deleted-bg' },
  ]
  for (const entry of cases) {
    const rule = ruleFor(css, entry.needle)
    assert.ok(rule, 'expected a plate rule for ' + entry.needle)
    // Both hooks are named in the same block: the host's own leaves and the
    // theme's marker, so one declaration covers either card.
    assert.ok(rule.selector.includes('[data-slot="tool.call.toolview"] [data-tool]'),
      'the plate stays scoped to a tool row: ' + rule.selector)
    assert.ok(rule.selector.includes('[data-cds-diff-stat'),
      'the theme card\'s own count rides the same block')
    assert.ok(rule.body.includes('background: var(' + entry.token + ');'),
      entry.needle + ' must take ' + entry.token)
    assert.ok(rule.body.includes('border-radius: var(--dsw-radius-xs);'),
      'a small radius, from the theme\'s own rung')
    assert.ok(/\bpadding: 0 4px;/.test(rule.body), 'tight inline padding only')
    // The row's line box is 24px; an inherited one would stretch the wash into a
    // band across the row, so the plate pins its own 16px.
    assert.ok(rule.body.includes('line-height: 16px;'), 'a chip, not a band')
    assert.ok(rule.body.includes('font-variant-numeric: tabular-nums;'))
    assert.ok(rule.body.includes('flex: none;'), 'the plate must not be squeezed by a long summary')
    assert.ok(rule.body.includes('display: inline-block;'),
      'inline-block is what gives the wash a box to fill')
    // A wash BEHIND the ink: the host green/red stays the text colour, so a
    // `color` here would replace the very signal the numbers carry.
    assert.ok(!rule.body.includes('color:'), 'no colour: the ink is the host\'s')
    assert.ok(!rule.body.includes('opacity'))
    // Left-aligned right after the title. A `margin-left: auto` would push the
    // pair to the row's right edge and read as a separate column.
    assert.ok(!/margin-left:\s*auto/.test(rule.body), 'the plate must not be pushed to the right edge')
    assert.ok(!/\border:/.test(rule.body), 'order would move it away from the title')
  }
})

test('the counts rule survives refine=false, where the host card is back', function () {
  // The rule exists for the HOST card, and the host card is what appears when
  // refinement is off — so it must NOT sit inside the `if (state.refine)` block.
  // A rule there would be present exactly in the state that does not need it.
  const off = rules({ refine: false })
  const rule = ruleFor(off, '[class*="diffStat"]')
  assert.ok(rule, 'the counts rule must be emitted with refine off')
  assert.ok(rule.selector.includes('[data-cds-diffrow-stats]'),
    'the theme card variant rides the same block')
  assert.ok(ruleFor(off, '[class*="diffAdded"]'), 'and so does the plate')
  assert.ok(!off.includes('[data-composer-card]:not('),
    'and refine=false still drops the component half around it')
})

// ------------------------------------------------------------- the wiring

test('the lifecycle leaves the markdown scope to CSS and mounts no removed look', function () {
  const source = readFileSync(new URL('../client/src/lifecycle.js', import.meta.url), 'utf8')
  // The markdown scope is pure CSS: no marker, no observer, no runtime.
  assert.ok(!source.includes('markdownScopeRules'), 'the markdown scope needs no lifecycle code')
  // The removed looks must be gone from the wiring, not merely un-imported: a
  // dangling `ctx.effect` would register a controller the build no longer has.
  for (const gone of ['createTabsStyleController', 'createComposerLayoutController',
    'view tab style', 'composer split layout', 'send button inside the frame']) {
    assert.ok(!source.includes(gone), 'the removed look must leave no effect behind: ' + gone)
  }
  const styles = readFileSync(new URL('../client/src/styles.js', import.meta.url), 'utf8')
  assert.ok(/state\.markdownScope === true\)\s*parts\.push\(markdownScopeRules\(\)\)/.test(styles),
    'buildCss must emit the markdown block on the flag')
  for (const gone of ['tabsStyleRules', 'composerLayoutRules', 'sendButtonRules']) {
    assert.ok(!styles.includes(gone), 'buildCss must not emit a removed look: ' + gone)
  }
})
