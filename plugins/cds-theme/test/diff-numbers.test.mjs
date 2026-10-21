/**
 * Real file line numbers in the diff card, and how they degrade.
 *
 * WHAT THIS FILE PINS, in three groups:
 *
 *   1. THE PURE HELPER. `normalizeStartLine` is the only place a start line is
 *      interpreted, and every bad shape has to land on 1 — a missing value, a
 *      zero, a negative, a float, a hex string, `+12`, `1e3`, garbage. A number
 *      that is silently wrong is worse than no number, because a file number is
 *      something the reader acts on.
 *
 *   2. THE STYLESHEET. Two counters seeded by one declaration, scope limited to
 *      code rows, and the separator / expander rows explicitly excluded. The
 *      colour rules are the reference's (`docs/tool-cards-diff.md` §2.3: added
 *      green `#1e9e3c`, deleted red `#cd2054`, context muted).
 *
 *   3. THE OBSERVER, on a fake DOM modelled on `test/hero.test.mjs`: it marks
 *      the body when a start is published, leaves a card alone when none is,
 *      and `stop()` removes every attribute it wrote AND disconnects.
 *
 * The fake DOM below mirrors the real card, read out of the installed host
 * bundle (`web-frontend-index.js`, `yF(…)` → `DiffBlock`, and the CSS-Modules
 * maps `Nn` / `wn`):
 *
 *   div[data-slot="tool.call.toolview"]
 *   └ div[data-tool="edit"]
 *      └ div._card_1pq26_1[data-diff][data-code-wrap]
 *         ├ div._header_1pq26_10[data-code-block-banner]
 *         └ div._body_17vb8_5                       ← numbered here
 *            ├ div._line_17vb8_13._path_17vb8_29    (hidden)
 *            ├ div._line_17vb8_13._context_17vb8_58
 *            ├ div._line_17vb8_13._del_17vb8_38
 *            ├ div._line_17vb8_13._add_17vb8_48
 *            ├ div._line_17vb8_13._gap_17vb8_34     (`⋯` between hunks)
 *            ├ button._expand_17vb8_66              (`… N more lines`)
 *            └ …
 *
 *   node test/diff-numbers.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  START_ATTR, OLD_START_ATTR, NUMBERED_ATTR, RESET_VAR, OLD_RESET_VAR,
  TOOL_VIEW, DIFF_CARD, NEW_START_ATTRS, OLD_START_ATTRS,
  normalizeStartLine, resolveStart, isCodeRow, segmentsOf, findDiffBodies,
  numberBody, sweepDiffNumbers, createDiffNumberMarker,
} from '../client/src/diffnumbers.js'
import { buildCssFor } from '../client/src/styles.js'
import { sanitize } from '../client/src/constants.js'

// ---------------------------------------------------------------- fake DOM

/** The hash suffix the host salts per build. A stable prefix is what we match. */
const SALT = '_17vb8_'

/**
 * The host's own local class names and their line numbers in the shipped
 * module's CSS-Modules map (`Nn` in `web-frontend-index.js`). Kept verbatim so
 * a reader can grep the bundle and find them.
 */
const LOCAL = {
  card: '_card_1pq26_1',
  header: '_header_1pq26_10',
  body: '_body_17vb8_5',
  line: '_line_17vb8_13',
  path: '_path_17vb8_29',
  gap: '_gap_17vb8_34',
  del: '_del_17vb8_38',
  add: '_add_17vb8_48',
  context: '_context_17vb8_58',
  expand: '_expand_17vb8_66',
}

/** Inline-style stand-in: only the three methods this module calls. */
function fakeStyle() {
  const values = new Map()
  return {
    values,
    setProperty(name, value) { values.set(name, String(value)) },
    removeProperty(name) { values.delete(name) },
    getPropertyValue(name) { return values.has(name) ? values.get(name) : '' },
  }
}

class FakeElement {
  constructor(attrs) {
    this.attrs = attrs || {}
    this.children = []
    this.parentElement = null
    this.style = fakeStyle()
  }

  appendChild(node) {
    node.parentElement = this
    this.children.push(node)
    return node
  }

  append() {
    for (const node of arguments) this.appendChild(node)
    return this
  }

  get classList() {
    const value = this.getAttribute('class')
    return value === null ? [] : value.split(/\s+/).filter(Boolean)
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name)
  }

  getAttribute(name) {
    return this.hasAttribute(name) ? String(this.attrs[name]) : null
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value)
  }

  removeAttribute(name) {
    delete this.attrs[name]
  }

  get firstElementChild() {
    return this.children.length > 0 ? this.children[0] : null
  }

  /**
   * The subset of selector syntax this module uses: `[attr]`, `[attr="v"]`,
   * `[class*="_x"]`, and one class attribute holding several space-separated
   * names (that is how a compound `[class*="_line_"][class*="_add_"]` is
   * expressed in a real `class` string).
   */
  matches(selector) {
    for (const part of String(selector).split(',').map(function (s) { return s.trim() })) {
      if (this.matchesOne(part)) return true
    }
    return false
  }

  matchesOne(selector) {
    const re = /\[([A-Za-z0-9-]+)(?:(\*?=)"([^"]*)")?\]/g
    const parts = []
    let match = re.exec(selector)
    while (match !== null) {
      parts.push({ name: match[1], op: match[2], value: match[3] })
      match = re.exec(selector)
    }
    if (parts.length === 0) throw new Error('fake DOM: unsupported selector ' + selector)
    for (const part of parts) {
      if (!this.hasAttribute(part.name)) return false
      const actual = this.getAttribute(part.name)
      if (part.op === '=' && actual !== part.value) return false
      if (part.op === '*=' && actual.indexOf(part.value) < 0) return false
    }
    return true
  }

  closest(selector) {
    let node = this
    while (node) {
      if (typeof node.matches === 'function' && node.matches(selector)) return node
      node = node.parentElement
    }
    return null
  }

  querySelectorAll(selector) {
    const out = []
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) out.push(child)
        walk(child)
      }
    }
    walk(this)
    return out
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null
  }
}

const el = function (attrs) { return new FakeElement(attrs) }
const row = function (kind) {
  const classes = [LOCAL.line]
  if (kind !== 'context') classes.push(LOCAL[kind])
  else classes.push(LOCAL.context)
  return el({ class: classes.join(' ') })
}

/** A root document stand-in: itself an element, with a `body`. */
function fakeDocument() {
  const doc = new FakeElement()
  doc.body = doc
  return doc
}

/**
 * Build one tool row around one diff card — the structure the module has to
 * find, including the pieces it must NOT touch.
 */
function buildCard(options) {
  const opts = options || {}
  const doc = fakeDocument()
  const toolView = el({ 'data-slot': 'tool.call.toolview' })
  const tool = el({ 'data-tool': 'edit', 'data-variant': 'edit' })
  const card = el({ class: LOCAL.card, 'data-diff': '', 'data-code-wrap': '' })
  const header = el({ class: LOCAL.header, 'data-code-block-banner': '' })
  const body = el({ class: LOCAL.body })

  if (opts.cardStart !== undefined) {
    for (const [name, value] of Object.entries(opts.cardStart)) card.setAttribute(name, value)
  }

  body.append(row('path'))
  for (const line of opts.lines || ['context', 'context', 'del', 'add', 'context']) body.append(row(line))
  if (opts.withGap) {
    body.append(row('gap'))
    for (const line of opts.tailLines || ['context', 'add']) body.append(row(line))
  }
  if (opts.withExpander) body.append(el({ class: LOCAL.expand }))

  card.append(header, body)
  tool.append(card)
  toolView.append(tool)
  doc.append(toolView)
  return { doc, toolView, tool, card, header, body }
}

/** The card body of a card built WITHOUT a tool row (must be ignored). */
function buildOrphanCard() {
  const doc = fakeDocument()
  const card = el({ class: LOCAL.card, 'data-diff': '' })
  const body = el({ class: LOCAL.body })
  body.append(row('context'))
  card.append(body)
  doc.append(card)
  return { doc, card, body }
}

/** Counter state of one fake element, read back through the style shim. */
const seedOf = function (node) {
  return {
    start: node.getAttribute(START_ATTR),
    oldStart: node.getAttribute(OLD_START_ATTR),
    reset: node.style.getPropertyValue(RESET_VAR),
    oldReset: node.style.getPropertyValue(OLD_RESET_VAR),
  }
}

// ------------------------------------------------------- 1. the pure helper

test('normalizeStartLine accepts only real 1-based line numbers', function () {
  // The shapes a host could actually publish.
  for (const [value, expected] of [
    [1, 1], [2, 2], [42, 42], [9999, 9999],
    ['1', 1], ['42', 42], [' 42 ', 42], ['0042', 42],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ]) {
    assert.equal(normalizeStartLine(value), expected, JSON.stringify(value) + ' is a line number')
  }
})

test('normalizeStartLine degrades every unusable shape to 1', function () {
  // 1, not 0 and not NaN: a start of 1 means "first line of the file", which is
  // the same rendering as "the card does not know", and it never prints a line
  // number a file cannot have.
  for (const value of [
    undefined, null, '',
    '   ',
    0, -1, -42, '0', '-1',
    1.5, '1.5', '12.0',
    '0x10', '1e3', '+12', '12px', 'line 12',
    'twelve', 'Infinity', NaN, Infinity, -Infinity,
    true, false,
    [], {}, [12], function () { return 12 },
  ]) {
    assert.equal(normalizeStartLine(value), 1,
      JSON.stringify(String(value)) + ' must degrade to 1, not to a wrong number')
  }
})

test('normalizeStartLine lands on 1 for a value with no parent or type', function () {
  // A defensive pin: the helper is called from a MutationObserver callback, where
  // a host-rendered node can be detached and its attributes can vanish between
  // two reads.
  assert.equal(normalizeStartLine(), 1)
})

test('the observer never wakes on its own attributes', function () {
  // The filter is the contract: if our own marks were watched, every sweep would
  // queue the next frame's sweep forever.
  const watched = NEW_START_ATTRS.concat(OLD_START_ATTRS)
  for (const own of [START_ATTR, OLD_START_ATTR, NUMBERED_ATTR]) {
    assert.ok(watched.indexOf(own) < 0, own + ' must not be watched — it is written by this plugin')
  }
  // …and the host-side names really are watched, in both spellings.
  for (const name of ['data-diff-new-start', 'data-diff-old-start', 'data-new-start', 'data-old-start']) {
    assert.ok(watched.indexOf(name) >= 0, name + ' must be watched')
  }
})

// -------------------------------------------------------- 2. the resolver

test('resolveStart reads the body, then the card, and mirrors a lone side', function () {
  const both = buildCard({ cardStart: { 'data-diff-new-start': '12', 'data-diff-old-start': '9' } })
  assert.deepEqual(resolveStart(both.card), { newStart: 12, oldStart: 9 })

  // Only a new start: the old side mirrors it rather than collapsing to 1, which
  // keeps a deletion on the same line as the addition it came from.
  const onlyNew = buildCard({ cardStart: { 'data-diff-new-start': '40' } })
  assert.deepEqual(resolveStart(onlyNew.card), { newStart: 40, oldStart: 40 })

  // The body's own attribute wins over the card's (the host is likelier to put
  // it next to the code it describes).
  const bodyWins = buildCard({ cardStart: { 'data-diff-new-start': '12' } })
  bodyWins.body.setAttribute('data-diff-new-start', '77')
  assert.deepEqual(resolveStart(bodyWins.body), { newStart: 77, oldStart: 77 })

  // Nothing published: null, which is the signal to stay a no-op.
  assert.equal(resolveStart(buildCard({}).card), null)
  assert.equal(resolveStart(null), null)
  assert.equal(resolveStart({}), null)
})

// ---------------------------------------------------- 3. what gets marked

test('a card with no start is left completely alone', function () {
  // THE SHIPPED HOST. `DiffBlock` renders `data-diff` and `data-code-wrap` and
  // nothing else, so this is the path every real edit / write card takes today:
  // the stylesheet's sequential counter draws the numbers, and this module must
  // not write a single attribute that suggests otherwise.
  const ui = buildCard({})
  assert.deepEqual(sweepDiffNumbers(ui.doc), [ui.body], 'the body is still found')

  assert.equal(ui.body.hasAttribute(START_ATTR), false, 'no start attribute')
  assert.equal(ui.body.hasAttribute(OLD_START_ATTR), false)
  assert.equal(ui.body.style.getPropertyValue(RESET_VAR), '', 'no counter seed')
  for (const child of ui.body.children) {
    assert.equal(child.hasAttribute(NUMBERED_ATTR), false, 'no row may be marked numbered')
  }
  assert.equal(numberBody(ui.body), 'none', 'the outcome names the degradation')
})

test('a published start seeds the body and marks every code row', function () {
  const ui = buildCard({ cardStart: { 'data-diff-new-start': '118', 'data-diff-old-start': '115' } })
  assert.equal(numberBody(ui.body), 'body')

  // The seed is start − 1: the row increments on top of it, so the first row
  // prints 118 and not 119.
  assert.deepEqual(seedOf(ui.body), {
    start: '118', oldStart: '115', reset: '117', oldReset: '114',
  })

  // Every code row is numbered; the separators are not.
  const numbered = ui.body.children.filter(function (child) { return child.hasAttribute(NUMBERED_ATTR) })
  const codeRows = ui.body.children.filter(function (child) { return isCodeRow(child) })
  assert.equal(numbered.length, codeRows.length)
  for (const child of ui.body.children) {
    const separator = child.matches('[class*="_path_"]') || child.matches('[class*="_gap_"]')
    assert.equal(child.hasAttribute(NUMBERED_ATTR), !separator,
      (separator ? 'a separator row' : 'a code row') + ' must ' + (separator ? 'not ' : '') + 'be numbered')
  }
})

test('one start on each side of a lone attribute is not invented twice', function () {
  // A card that publishes only the OLD start (a deletion-only hunk) must number
  // from that side instead of falling back to 1.
  const ui = buildCard({ cardStart: { 'data-diff-old-start': '31' } })
  assert.equal(numberBody(ui.body), 'body')
  assert.deepEqual(seedOf(ui.body), { start: '31', oldStart: '31', reset: '30', oldReset: '30' })
})

test('a multi-hunk card is numbered per segment or not at all', function () {
  // `⋯` is the host's separator between the hunks of ONE file (`gF` pushes
  // `{kind: 'gap', text: '⋯'}`). A card with one covers two discontinuous file
  // regions, so a single seed would be wrong for the second half.
  const ui = buildCard({ withGap: true })
  assert.equal(segmentsOf(ui.body).length, 2, 'precondition: two segments')

  // No per-segment starts → left alone. Guessing would print a number that
  // silently skips a region of the file.
  assert.equal(numberBody(ui.body), 'none')
  assert.equal(ui.body.hasAttribute(START_ATTR), false)
  for (const child of ui.body.children) {
    assert.equal(child.hasAttribute(NUMBERED_ATTR), false)
  }

  // Both segments publish their first line → every segment start is seeded and
  // every code row in both segments is numbered.
  const segments = segmentsOf(ui.body)
  segments[0].startRow.setAttribute('data-diff-new-start', '10')
  segments[0].startRow.setAttribute('data-diff-old-start', '8')
  segments[1].startRow.setAttribute('data-diff-new-start', '120')
  segments[1].startRow.setAttribute('data-diff-old-start', '118')
  assert.equal(numberBody(ui.body), 'rows')

  assert.deepEqual(seedOf(segments[0].startRow),
    { start: '10', oldStart: '8', reset: '9', oldReset: '7' })
  assert.deepEqual(seedOf(segments[1].startRow),
    { start: '120', oldStart: '118', reset: '119', oldReset: '117' })
  for (const segment of segments) {
    for (const node of segment.rows) {
      assert.ok(node.hasAttribute(NUMBERED_ATTR), 'every code row of both segments is numbered')
    }
  }
})

test('a card outside a tool row is never numbered', function () {
  // The deliverables package renders its own diff with `data-diff-line`, and
  // artifact previews can show a diff too. The stylesheet scopes to the tool row
  // and so does this module — an unrelated diff must keep its own numbering.
  const orphan = buildOrphanCard()
  orphan.card.setAttribute('data-diff-new-start', '5')
  assert.deepEqual(findDiffBodies(orphan.doc), [], 'the orphan is not a tool-row diff')
  assert.deepEqual(sweepDiffNumbers(orphan.doc), [])
  assert.equal(orphan.body.hasAttribute(START_ATTR), false)
  assert.equal(orphan.card.hasAttribute(START_ATTR), false)
})

test('degenerate roots and nodes are safe no-ops', function () {
  for (const root of [null, undefined, {}, { querySelectorAll: null }]) {
    assert.deepEqual(findDiffBodies(root), [])
    assert.deepEqual(sweepDiffNumbers(root), [])
  }
  assert.equal(numberBody(null), 'none')
  assert.deepEqual(segmentsOf(null), [])
  assert.equal(isCodeRow(null), false)
})

test('a card that loses its start loses its numbers', function () {
  // React can re-render the same card with different metadata (an edit that was
  // re-applied). A stale seed would keep numbering from the old hunk, so the
  // pass is a recompute, not an accumulation.
  const ui = buildCard({ cardStart: { 'data-diff-new-start': '50' } })
  sweepDiffNumbers(ui.doc)
  assert.equal(seedOf(ui.body).start, '50')

  ui.card.removeAttribute('data-diff-new-start')
  sweepDiffNumbers(ui.doc)
  assert.deepEqual(seedOf(ui.body), { start: null, oldStart: null, reset: '', oldReset: '' },
    'every trace of the previous seed must be gone')
  for (const child of ui.body.children) {
    assert.equal(child.hasAttribute(NUMBERED_ATTR), false)
  }
})

test('the sweep is idempotent: a second pass writes nothing new', function () {
  const ui = buildCard({ cardStart: { 'data-diff-new-start': '118', 'data-diff-old-start': '115' } })
  sweepDiffNumbers(ui.doc)
  const first = JSON.stringify(seedOf(ui.body))
  const marks = ui.body.children.map(function (child) { return child.getAttribute(NUMBERED_ATTR) })

  sweepDiffNumbers(ui.doc)
  sweepDiffNumbers(ui.doc)
  assert.equal(JSON.stringify(seedOf(ui.body)), first, 'the seed must not drift')
  assert.deepEqual(ui.body.children.map(function (child) { return child.getAttribute(NUMBERED_ATTR) }), marks)
})

test('two cards in one document are numbered independently', function () {
  const doc = fakeDocument()
  const first = buildCard({ cardStart: { 'data-diff-new-start': '10' } })
  const second = buildCard({ cardStart: { 'data-diff-new-start': '200' } })
  // Graft both tool rows into one document.
  doc.append(first.toolView)
  doc.body.appendChild(second.toolView)

  const bodies = sweepDiffNumbers(doc)
  assert.equal(bodies.length, 2)
  assert.equal(seedOf(first.body).start, '10')
  assert.equal(seedOf(second.body).start, '200')
})

// ------------------------------------------------------ 4. the observer

test('the marker starts, sweeps, and stop() clears every attribute it wrote', function () {
  const ui = buildCard({ cardStart: { 'data-diff-new-start': '118', 'data-diff-old-start': '115' } })
  const observer = { disconnect() { observer.disconnected = true }, observe() {} }
  class FakeObserver {
    constructor(callback) { this.callback = callback }
    observe(target, options) { this.target = target; this.options = options; observer.instance = this }
    disconnect() { observer.disconnected = true }
  }

  const marker = createDiffNumberMarker(ui.doc, FakeObserver)
  marker.start()
  assert.equal(marker.started, true)
  assert.equal(observer.instance.target, ui.doc.body, 'observes the body, where React mounts rows')
  assert.equal(observer.instance.options.childList, true)
  assert.equal(observer.instance.options.subtree, true)
  assert.equal(observer.instance.options.attributes, true)
  assert.deepEqual(observer.instance.options.attributeFilter,
    NEW_START_ATTRS.concat(OLD_START_ATTRS),
    'the filter must be the host-side names only')

  assert.equal(seedOf(ui.body).start, '118', 'start() sweeps at once')

  marker.stop()
  assert.equal(marker.started, false)
  assert.equal(observer.disconnected, true, 'stop() must disconnect')
  assert.equal(ui.body.hasAttribute(START_ATTR), false)
  assert.equal(ui.body.hasAttribute(OLD_START_ATTR), false)
  assert.equal(ui.body.style.getPropertyValue(RESET_VAR), '')
  assert.equal(ui.body.style.getPropertyValue(OLD_RESET_VAR), '')
  for (const child of ui.body.children) {
    assert.equal(child.hasAttribute(NUMBERED_ATTR), false)
  }
})

test('the marker re-sweeps when the host publishes a start later', async function () {
  // THE SERVER PATCH ARRIVES LATE. The card renders first (no start, no numbers),
  // then a later React commit fills the attribute in. The observer's attribute
  // subscription is what makes that take effect without a reload.
  const ui = buildCard({})
  const callbacks = []
  class FakeObserver {
    constructor(callback) { callbacks.push(callback) }
    observe() {}
    disconnect() {}
  }
  const marker = createDiffNumberMarker(ui.doc, FakeObserver)
  marker.start()
  assert.equal(ui.body.hasAttribute(START_ATTR), false, 'nothing to number yet')

  ui.card.setAttribute('data-diff-new-start', '64')
  callbacks[0]([{ type: 'attributes', attributeName: 'data-diff-new-start', addedNodes: [] }])
  await new Promise(function (resolve) { setTimeout(resolve, 5) })
  assert.equal(seedOf(ui.body).start, '64', 'the late start must seed the counters')
  assert.equal(seedOf(ui.body).reset, '63')

  marker.stop()
})

test('the marker ignores streaming text churn', async function () {
  // A streamed token is a character-data mutation and cannot change where a hunk
  // starts. Sweeping on it would run a document-wide query per frame for the
  // whole duration of every response.
  const ui = buildCard({ cardStart: { 'data-diff-new-start': '9' }, withExpander: true })
  const callbacks = []
  class FakeObserver {
    constructor(callback) { callbacks.push(callback) }
    observe() {}
    disconnect() {}
  }
  const marker = createDiffNumberMarker(ui.doc, FakeObserver)
  marker.start()
  assert.equal(seedOf(ui.body).start, '9', 'precondition: start() swept once')

  // Clear the mark by hand, so "did it sweep?" is observable as "did the mark
  // come back?". (The observer holds the internal sweep, not `marker.sweep`.)
  ui.body.removeAttribute(START_ATTR)
  const text = { nodeType: 3, nodeValue: 'streamed token' }
  callbacks[0]([{ type: 'childList', addedNodes: [text] }])
  await new Promise(function (resolve) { setTimeout(resolve, 10) })
  assert.equal(ui.body.hasAttribute(START_ATTR), false,
    'a text-only batch must not sweep — the mark stays cleared')

  // An added ELEMENT that can hold a card still wakes it: rows can arrive before
  // the metadata that numbers them.
  const card = el({ class: LOCAL.card, 'data-diff': '', 'data-diff-new-start': '3' })
  card.append(el({ class: LOCAL.header }), el({ class: LOCAL.body }).append(row('context')))
  callbacks[0]([{ type: 'childList', addedNodes: [card] }])
  await new Promise(function (resolve) { setTimeout(resolve, 10) })
  assert.equal(ui.body.hasAttribute(START_ATTR), true, 'an element addition must still sweep')
  marker.stop()
})

test('a callback with no records still sweeps (degradation over silence)', async function () {
  const ui = buildCard({ cardStart: { 'data-diff-new-start': '7' } })
  const callbacks = []
  class FakeObserver {
    constructor(callback) { callbacks.push(callback) }
    observe() {}
    disconnect() {}
  }
  const marker = createDiffNumberMarker(ui.doc, FakeObserver)
  marker.start()
  ui.body.removeAttribute(START_ATTR)
  // A hand-built host or a test double may invoke the callback with nothing.
  callbacks[0]()
  await new Promise(function (resolve) { setTimeout(resolve, 10) })
  assert.equal(ui.body.hasAttribute(START_ATTR), true, 'a recordless callback re-sweeps')
  marker.stop()
})

test('start without a document is a safe no-op', function () {
  const marker = createDiffNumberMarker(null)
  assert.doesNotThrow(function () { marker.start() })
  assert.equal(marker.started, false)
  assert.doesNotThrow(function () { marker.stop() })
})

// ------------------------------------------------------- 5. the stylesheet

/** Minimal rule parser, matching `test/css.test.mjs`. */
function parseRules(css) {
  const out = []
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match = re.exec(text)
  while (match !== null) {
    out.push({ selector: match[1].trim().replace(/\s+/g, ' '), body: match[2].trim() })
    match = re.exec(text)
  }
  return out
}

test('the diff body resets two independent counters', function () {
  // One counter cannot express the reference's rule (new number, old number for a
  // deletion): a deletion must not advance the new-file numbering, so both sides
  // need their own counter and their own seed.
  const body = parseRules(buildCssFor(sanitize({}))).find(function (rule) {
    return rule.selector === '[data-slot="tool.call.toolview"] [data-diff] > [class*="_body_"]'
  })
  assert.ok(body, 'expected the diff body rule')
  assert.match(body.body, /counter-reset:\s*cds-diff-line 0 cds-diff-line-old 0/)
  assert.match(body.body, /grid-template-columns:\s*minmax\(0, 1fr\)/,
    'the max-content grid pin must survive: it is what stops a long line stretching the card')
})

test('a published start re-seeds both counters from the element that carries it', function () {
  const rule = parseRules(buildCssFor(sanitize({}))).find(function (candidate) {
    return candidate.selector === '[data-slot="tool.call.toolview"] [data-diff] [data-cds-diff-start]'
  })
  assert.ok(rule, 'expected the seed rule on [data-cds-diff-start]')
  // The offsets come from the module's custom properties, with 0 as the fallback
  // so a hand-written attribute that forgot them still numbers from 1.
  assert.match(rule.body,
    /counter-reset:\s*cds-diff-line var\(--cds-diff-reset, 0\) cds-diff-line-old var\(--cds-diff-old-reset, 0\)/)
})

test('the number gutter targets only code rows', function () {
  const rules = parseRules(buildCssFor(sanitize({})))

  const numbers = rules.filter(function (rule) {
    return /::after/.test(rule.selector) && /content:\s*counter\(cds-diff-line/.test(rule.body)
      && rule.selector.indexOf('[data-diff]') >= 0
  })
  assert.ok(numbers.length >= 1, 'expected at least one numbered ::after rule')

  for (const rule of numbers) {
    // A separator must never be numbered: the hidden path row and the `⋯` between
    // hunks both live in the same body and both would otherwise consume a line.
    assert.ok(!/\[class\*="_path_"\]|\[class\*="_gap_"\]/.test(rule.body),
      'a numbered rule must not be restated inside the exclusion list: ' + rule.selector)
    assert.ok(/:not\(\[class\*="_path_"\]\)/.test(rule.selector),
      'the path row must be excluded from numbering: ' + rule.selector)
    assert.ok(/:not\(\[class\*="_gap_"\]\)/.test(rule.selector),
      'the `⋯` gap row must be excluded from numbering: ' + rule.selector)
    assert.ok(!rule.selector.includes('_expand_'),
      'the line counter must not reach the expander: ' + rule.selector)
  }
})

test('the expander row cannot wear a number', function () {
  const rules = parseRules(buildCssFor(sanitize({}))).filter(function (rule) {
    return rule.selector.indexOf('_expand_') >= 0 && /::after/.test(rule.selector)
  })
  assert.equal(rules.length, 1, 'expected exactly one rule pinning the expander')
  assert.match(rules[0].body, /content:\s*none/,
    'the `… N more lines` control must not print a fake line number')
})

test('a deleted row falls back to the old counter', function () {
  // `docs/tool-cards-diff.md` §2.4: the unified gutter shows the NEW number, and
  // a deleted row — which has no new line — shows the OLD one.
  const rule = parseRules(buildCssFor(sanitize({}))).find(function (candidate) {
    return candidate.selector.indexOf('[class*="_del_"]') >= 0
      && /content:\s*counter\(cds-diff-line-old\)/.test(candidate.body)
  })
  assert.ok(rule, 'expected a `_del_` rule printing counter(cds-diff-line-old)')
  assert.match(rule.selector, /\[class\*="_line_"\]/, 'it must be a row rule, not a bare `_del_`')
})

test('each row kind advances the counters the reference says it should', function () {
  const rules = parseRules(buildCssFor(sanitize({})))
  const increment = function (selectorPattern) {
    const rule = rules.find(function (candidate) {
      return selectorPattern.test(candidate.selector) && /counter-increment:/.test(candidate.body)
    })
    return rule === undefined ? null : rule
  }

  // Context: exists in both files → both counters advance.
  const context = increment(/\[class\*="_line_"\]/)
  assert.ok(context, 'expected a default counter-increment on code rows')
  assert.match(context.body, /counter-increment:\s*cds-diff-line cds-diff-line-old/)
  // …and a SEPARATOR must not advance either counter. Pinning the increment
  // selector as well as the `::after` one is not redundant: the `⋯` row is a
  // real, visible row, and counting it is exactly the silent off-by-one this
  // whole block exists to prevent.
  assert.ok(/:not\(\[class\*="_path_"\]\)/.test(context.selector),
    'the path row must not advance a counter: ' + context.selector)
  assert.ok(/:not\(\[class\*="_gap_"\]\)/.test(context.selector),
    'the `⋯` gap row must not advance a counter: ' + context.selector)

  // Addition: only in the new file → the old counter must NOT advance.
  const added = increment(/\[class\*="_add_"\]/)
  assert.ok(added, 'expected an addition override')
  assert.match(added.body, /counter-increment:\s*cds-diff-line;/)
  assert.ok(!/cds-diff-line-old/.test(added.body), 'an added line does not exist in the old file')
  // A compound override must carry the same specificity as the rule it overrides,
  // or it loses by specificity and never applies — a failure mode that looks
  // exactly like "the extra selectors are not needed".
  assert.ok(/:not\(\[class\*="_path_"\]\)/.test(added.selector),
    'the addition override must match the base rule\'s specificity: ' + added.selector)

  // Deletion: only in the old file → the new counter must NOT advance, or every
  // line after the hunk would drift by the number of deleted lines.
  const deleted = increment(/\[class\*="_del_"\]/)
  assert.ok(deleted, 'expected a deletion override')
  assert.match(deleted.body, /counter-increment:\s*cds-diff-line-old;/)
  assert.ok(!/cds-diff-line(?!-old)/.test(deleted.body.replace('cds-diff-line-old', '')),
    'a deleted line does not exist in the new file')
  assert.ok(/:not\(\[class\*="_path_"\]\)/.test(deleted.selector),
    'the deletion override must match the base rule\'s specificity: ' + deleted.selector)
})

test('the numbers are coloured like the reference, and context stays muted', function () {
  // `docs/tool-cards-diff.md` §2.3: added `#1e9e3c` / deleted `#cd2054` in the
  // reference's own palette; here they ride the theme's state tokens so dark mode
  // follows without a second pair. Context takes the muted caption ink.
  const rules = parseRules(buildCssFor(sanitize({})))
  const withColor = function (predicate) {
    return rules.find(function (candidate) {
      return predicate(candidate.selector) && /(^|[;\s])color:\s*var\(/.test(candidate.body)
    })
  }

  const muted = withColor(function (selector) {
    return selector.indexOf('_line_') >= 0 && selector.indexOf('::after') >= 0
      && selector.indexOf('_add_') < 0 && selector.indexOf('_del_') < 0
  })
  assert.ok(muted, 'expected the base number colour rule')
  assert.match(muted.body, /color:\s*var\(--dsw-alias-label-caption\)/,
    'a context line\'s number is muted')

  const added = withColor(function (selector) { return selector.indexOf('_add_') >= 0 })
  assert.ok(added, 'expected an addition colour rule')
  assert.match(added.body, /color:\s*var\(--dsw-alias-state-success-primary\)/,
    'an added line\'s number is green')

  const deleted = withColor(function (selector) { return selector.indexOf('_del_') >= 0 })
  assert.ok(deleted, 'expected a deletion colour rule')
  assert.match(deleted.body, /color:\s*var\(--dsw-alias-state-error-primary\)/,
    'a deleted line\'s number is red')
})

test('no gutter rule names a salted class', function () {
  // The repo-wide rule (`test/css.test.mjs` enforces it for the whole sheet):
  // the host salts these names on every build, so only the tolerant
  // `[class*="_local_"]` form is legal.
  for (const rule of parseRules(buildCssFor(sanitize({})))) {
    if (rule.selector.indexOf('data-diff') < 0) continue
    assert.ok(!/\.(?:_?[A-Za-z0-9]+)_[A-Za-z0-9]+_\d+/.test(rule.selector),
      'salted class selector: ' + rule.selector)
    assert.ok(!/\.(?:[A-Za-z0-9]{6})_[a-z]/.test(rule.selector), 'salted class selector: ' + rule.selector)
  }
})

test('the numbering rules follow refine like every other component rule', function () {
  // A marker is installed only under `enabled && refine` (lifecycle.js), so a
  // rule that survived `refine: false` would paint a gutter nothing marks.
  const off = buildCssFor(sanitize({ refine: false }))
  assert.ok(!off.includes('cds-diff-line'), 'refine=false must drop the counter rules')
  assert.ok(!off.includes(START_ATTR), 'refine=false must drop the seed rule')
})

test('the diff body still hides the in-card path line', function () {
  // Unchanged by this task, pinned because the row-exclusion work above touches
  // the same block: the tool row already names the file.
  const rules = parseRules(buildCssFor(sanitize({})))
  const path = rules.find(function (rule) {
    return rule.selector.includes('[data-diff] [class*="_path_"]') && /display:\s*none/.test(rule.body)
  })
  assert.ok(path, 'the in-card path line must stay hidden')
})

// ------------------------------------------------- 6. against the real card

test('the shipped host card shape is recognised and left alone', function () {
  // THE REGRESSION GUARD FOR "DOES THIS EVEN DO ANYTHING TODAY". The card below
  // is the one the installed `DiffBlock` renders — card root with `data-diff` and
  // `data-code-wrap`, header, body of five row kinds plus an expander — and it
  // publishes no start. The expected outcome is the honest one: the body is
  // found (so the selector is right) and NOTHING is written (so the CSS keeps
  // counting rows).
  const ui = buildCard({ withExpander: true })
  assert.deepEqual(findDiffBodies(ui.doc), [ui.body],
    'the real card shape must be found — otherwise the module is dead code')

  const outcome = numberBody(ui.body)
  assert.equal(outcome, 'none',
    'with no start published the module must be a no-op, not an invention')

  // And the stylesheet really does still number those rows sequentially.
  const bodyRule = parseRules(buildCssFor(sanitize({}))).find(function (rule) {
    return rule.selector === '[data-slot="tool.call.toolview"] [data-diff] > [class*="_body_"]'
  })
  assert.match(bodyRule.body, /counter-reset:\s*cds-diff-line 0/,
    'the fallback seed is 0, so the first row prints 1')
})

test('a hunk start and its card agree on what the first row prints', function () {
  // The seed is `start - 1` because the row increments before its `::after` is
  // generated. Asserted directly so a future "simplification" to `start` cannot
  // pass the CSS tests while printing every line one too high.
  for (const start of [1, 2, 57, 1000]) {
    const ui = buildCard({ cardStart: { 'data-diff-new-start': String(start) } })
    numberBody(ui.body)
    assert.equal(Number(ui.body.style.getPropertyValue(RESET_VAR)), start - 1,
      'start ' + start + ' must seed ' + (start - 1))
  }
})
