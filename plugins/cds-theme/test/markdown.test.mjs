/**
 * The markdown table hook: structural marking (no salted classes), idempotency,
 * cleanup on dispose, and graceful no-change when the host layout differs.
 *
 * The fake DOM below mirrors the real one extracted from
 * `web-frontend-index.js` — the table view renders each table inside a scroll
 * wrapper whose class is a salted CSS-Modules name:
 *
 *   div[data-chat-flow]                       (the message flow column)
 *   └ div                                     (row / markdown body)
 *      └ div.markdownRoot                    (salted; compact adds
 *         │                                    data-markdown-variant)
 *         └ div.tableScroll [md-table-wide]  ← marked with data-cds-table
 *            └ table > thead/tbody > th/td
 *
 *   node test/markdown.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  TABLE_ATTR, isTableWrapper, findTableWrappers, sweepMarkdownTables, createTableMarker,
} from '../client/src/markdown.js'
import { sanitize, DEFAULT_STATE } from '../client/src/constants.js'

// ------------------------------------------------------------- fake DOM

const ATTR = /^\[([A-Za-z0-9-]+)(?:="([^"]*)")?\]$/
const TAG = /^([A-Za-z][A-Za-z0-9-]*)$/

class FakeElement {
  constructor(tag, attrs) {
    this.tagName = String(tag === undefined ? 'div' : tag).toUpperCase()
    this.attrs = attrs || {}
    this.children = []
    this.parentElement = null
    this.nodeType = 1
    this.setAttributeWrites = 0
  }

  appendChild(node) {
    if (node.parentElement) node.parentElement.removeChild(node)
    node.parentElement = this
    this.children.push(node)
    return node
  }

  append() {
    for (const node of arguments) this.appendChild(node)
    return this
  }

  removeChild(node) {
    const index = this.children.indexOf(node)
    if (index >= 0) this.children.splice(index, 1)
    node.parentElement = null
    return node
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name)
  }

  getAttribute(name) {
    return this.hasAttribute(name) ? String(this.attrs[name]) : null
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value)
    this.setAttributeWrites += 1
  }

  removeAttribute(name) {
    delete this.attrs[name]
  }

  get firstElementChild() {
    return this.children.length > 0 ? this.children[0] : null
  }

  matches(selector) {
    const tag = TAG.exec(selector)
    if (tag !== null) return this.tagName === tag[1].toUpperCase()
    const attr = ATTR.exec(selector)
    if (attr === null) throw new Error('fake DOM: unsupported selector ' + selector)
    if (!this.hasAttribute(attr[1])) return false
    return attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]
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

const el = function (tag, attrs) { return new FakeElement(tag, attrs) }

/** A root document stand-in: itself an element, with a `body`. */
function fakeDocument() {
  const doc = el('html')
  doc.body = doc
  return doc
}

/** A table + its host-shaped scroll wrapper. */
function tableWrapper() {
  const table = el('table')
  const wrapper = el('div')
  wrapper.appendChild(table)
  return { wrapper, table }
}

/**
 * Build a chat flow with `count` tables inside one markdown body.
 * `outside` adds a second markdown body that is NOT inside the flow.
 */
function buildFlow(options) {
  const opts = options || {}
  const doc = fakeDocument()
  const flow = el('div', { 'data-chat-flow': '' })
  const markdown = el('div')
  flow.appendChild(markdown)
  doc.appendChild(flow)

  const inFlow = []
  for (let i = 0; i < (opts.count === undefined ? 1 : opts.count); i += 1) {
    const pair = tableWrapper()
    markdown.appendChild(pair.wrapper)
    inFlow.push(pair)
  }

  let outside = null
  if (opts.outside) {
    const region = el('div')
    const markdownOut = el('div')
    outside = tableWrapper()
    markdownOut.appendChild(outside.wrapper)
    region.appendChild(markdownOut)
    doc.appendChild(region)
  }

  return { doc, flow, markdown, inFlow, outside }
}

/** A fake MutationObserver: records the callback so tests can drive it. */
function fakeObservers() {
  const instances = []
  class FakeObserver {
    constructor(callback) {
      this.callback = callback
      instances.push(this)
    }
    observe(target, options) {
      this.target = target
      this.options = options
    }
    disconnect() {
      this.disconnected = true
    }
  }
  return { Observer: FakeObserver, instances }
}

const tick = function () {
  return new Promise(function (resolve) { setTimeout(resolve, 5) })
}

// ------------------------------------------------------------ the lookup

test('finds the scroll wrapper of a table inside [data-chat-flow]', function () {
  const ui = buildFlow({})
  assert.deepEqual(findTableWrappers(ui.doc), [ui.inFlow[0].wrapper])
})

test('marks the wrapper only — not the table, the markdown root or the flow', function () {
  const ui = buildFlow({})
  const marked = sweepMarkdownTables(ui.doc)
  assert.deepEqual(marked, [ui.inFlow[0].wrapper])
  assert.ok(ui.inFlow[0].wrapper.hasAttribute(TABLE_ATTR))
  assert.ok(!ui.inFlow[0].table.hasAttribute(TABLE_ATTR))
  assert.ok(!ui.markdown.hasAttribute(TABLE_ATTR))
  assert.ok(!ui.flow.hasAttribute(TABLE_ATTR))
})

test('marks every table in the flow', function () {
  const ui = buildFlow({ count: 3 })
  sweepMarkdownTables(ui.doc)
  for (const pair of ui.inFlow) assert.ok(pair.wrapper.hasAttribute(TABLE_ATTR))
  assert.equal(ui.doc.querySelectorAll('[' + TABLE_ATTR + ']').length, 3)
})

test('tables outside [data-chat-flow] are never marked', function () {
  // Artifact previews, settings copy and plugin READMEs render markdown too;
  // this item is the chat body, so the marker must not touch them.
  const ui = buildFlow({ count: 2, outside: true })
  const marked = sweepMarkdownTables(ui.doc)
  assert.equal(marked.length, 2)
  assert.equal(ui.outside.wrapper.hasAttribute(TABLE_ATTR), false)
})

// -------------------------------------------------------- degradation

test('a table whose parent is not a dedicated wrapper is left alone', function () {
  // A future host could render the table straight into the markdown root. The
  // root has siblings, so framing it would put a border around the whole
  // message — the marker skips it instead.
  const ui = buildFlow({ count: 0 })
  const region = el('div')
  const table = el('table')
  region.append(table, el('p'))
  ui.markdown.appendChild(region)
  assert.equal(findTableWrappers(ui.doc).length, 0)
  assert.equal(sweepMarkdownTables(ui.doc).length, 0)
  assert.equal(table.hasAttribute(TABLE_ATTR), false)
})

test('a table that IS the flow root’s child is not wrapped by the flow itself', function () {
  const doc = fakeDocument()
  const flow = el('div', { 'data-chat-flow': '' })
  const table = el('table')
  flow.appendChild(table)
  doc.appendChild(flow)
  assert.equal(findTableWrappers(doc).length, 0)
  assert.equal(table.hasAttribute(TABLE_ATTR), false)
  assert.equal(flow.hasAttribute(TABLE_ATTR), false)
})

test('no conversation at all is a safe no-op', function () {
  assert.deepEqual(findTableWrappers(fakeDocument()), [])
  assert.deepEqual(findTableWrappers(null), [])
  assert.deepEqual(findTableWrappers({}), [])
  assert.doesNotThrow(function () { sweepMarkdownTables(null) })
})

test('isTableWrapper requires the one-child wrapper signature', function () {
  const table = el('table')
  const wrapper = el('div')
  wrapper.appendChild(table)
  assert.equal(isTableWrapper(wrapper, table), true)
  assert.equal(isTableWrapper(null, table), false)
  assert.equal(isTableWrapper(el('div'), table), false)
  wrapper.appendChild(el('p'))
  assert.equal(isTableWrapper(wrapper, table), false)
})

// ------------------------------------------------------------- lifecycle

test('the mark is idempotent (no DOM write when already marked)', function () {
  const ui = buildFlow({})
  sweepMarkdownTables(ui.doc)
  sweepMarkdownTables(ui.doc)
  sweepMarkdownTables(ui.doc)
  assert.equal(ui.inFlow[0].wrapper.setAttributeWrites, 1,
    'a wrapper that already carries the mark must get no write')
  assert.equal(ui.doc.querySelectorAll('[' + TABLE_ATTR + ']').length, 1)
})

test('a stale mark is removed when the table leaves the flow', function () {
  const ui = buildFlow({})
  sweepMarkdownTables(ui.doc)
  const wrapper = ui.inFlow[0].wrapper
  assert.ok(wrapper.hasAttribute(TABLE_ATTR))

  // React (or a sibling plugin) moves the wrapper into a non-flow surface.
  const outside = el('div')
  ui.doc.appendChild(outside)
  outside.appendChild(wrapper)
  assert.ok(wrapper.hasAttribute(TABLE_ATTR), 'precondition: the mark travelled with the node')

  sweepMarkdownTables(ui.doc)
  assert.equal(wrapper.hasAttribute(TABLE_ATTR), false)
})

test('a re-rendered table is marked instead of leaving a stale mark', function () {
  const ui = buildFlow({})
  sweepMarkdownTables(ui.doc)
  const old = ui.inFlow[0].wrapper

  ui.markdown.removeChild(old)
  const fresh = tableWrapper()
  ui.markdown.appendChild(fresh.wrapper)
  sweepMarkdownTables(ui.doc)

  assert.ok(fresh.wrapper.hasAttribute(TABLE_ATTR))
  assert.equal(ui.doc.querySelectorAll('[' + TABLE_ATTR + ']').length, 1,
    'the detached wrapper is off-tree, so the document carries one mark')
})

test('marker.start marks at once, stop removes every mark', function () {
  const ui = buildFlow({ count: 2 })
  const observers = fakeObservers()
  const marker = createTableMarker(ui.doc, observers.Observer)
  marker.start()
  assert.equal(marker.started, true)
  assert.equal(ui.doc.querySelectorAll('[' + TABLE_ATTR + ']').length, 2)

  marker.stop()
  assert.equal(marker.started, false)
  assert.equal(ui.doc.querySelectorAll('[' + TABLE_ATTR + ']').length, 0)
  // A late scheduled sweep after stop must not re-mark.
  marker.sweep()
  assert.equal(ui.doc.querySelectorAll('[' + TABLE_ATTR + ']').length, 0)
})

test('the observer watches body and re-sweeps only for table-bearing additions', async function () {
  const ui = buildFlow({ count: 0 })
  const observers = fakeObservers()
  const marker = createTableMarker(ui.doc, observers.Observer)
  marker.start()
  assert.equal(observers.instances.length, 1)
  assert.equal(observers.instances[0].target, ui.doc.body)
  assert.deepEqual(observers.instances[0].options, { childList: true, subtree: true })
  assert.equal(ui.doc.querySelectorAll('[' + TABLE_ATTR + ']').length, 0)

  // A streamed token (text node) cannot create a table: no sweep.
  const fresh = tableWrapper()
  ui.markdown.appendChild(fresh.wrapper)
  observers.instances[0].callback([{ addedNodes: [{ nodeType: 3, textContent: 'x' }] }])
  await tick()
  assert.equal(fresh.wrapper.hasAttribute(TABLE_ATTR), false,
    'a text mutation must not trigger the sweep')

  // The wrapper React actually appends schedules a sweep.
  observers.instances[0].callback([{ addedNodes: [fresh.wrapper] }])
  await tick()
  assert.ok(fresh.wrapper.hasAttribute(TABLE_ATTR),
    'the observer callback must re-run the structural sweep')

  // A callback without records (a hand-built host) still sweeps.
  const second = tableWrapper()
  ui.markdown.appendChild(second.wrapper)
  observers.instances[0].callback()
  await tick()
  assert.ok(second.wrapper.hasAttribute(TABLE_ATTR))
})

test('start is idempotent and stop disconnects exactly one observer', function () {
  const ui = buildFlow({})
  const observers = fakeObservers()
  const marker = createTableMarker(ui.doc, observers.Observer)
  marker.start()
  marker.start()
  assert.equal(observers.instances.length, 1, 'one observer for one lifetime')
  marker.stop()
  marker.stop()
  assert.equal(observers.instances[0].disconnected, true)
})

test('start without a document is a safe no-op', function () {
  const marker = createTableMarker(null)
  assert.doesNotThrow(function () { marker.start() })
  assert.equal(marker.started, false)
  assert.doesNotThrow(function () { marker.stop() })
})

// ---------------------------------------------------------------- state

test('the markdownBody switch is retired: a legacy payload cannot disable the item', function () {
  // The user verified the markdown body, so its comparison switch was deleted and
  // the rules + this marker are permanent inside `refine`. The state key is gone
  // from DEFAULT_STATE and from sanitize(), so a stored `false` is dropped.
  assert.equal(Object.hasOwn(DEFAULT_STATE, 'markdownBody'), false,
    'the retired switch must not be part of the default state')
  assert.equal(Object.hasOwn(sanitize({}), 'markdownBody'), false,
    'sanitize must not return the retired field')

  // A legacy payload carrying it loads cleanly and leaves the rest intact.
  let legacy
  assert.doesNotThrow(function () {
    legacy = sanitize({ markdownBody: false, codeBlockDetails: false, warmth: 40 })
  })
  assert.equal(Object.hasOwn(legacy, 'markdownBody'), false,
    'a stored false must not resurrect as a hidden mode')
  assert.equal(Object.hasOwn(legacy, 'codeBlockDetails'), false)
  assert.equal(legacy.warmth, 40, 'the rest of the payload still loads')
  // Truthy strings and numbers are equally irrelevant now.
  for (const value of ['no', 0, true, null]) {
    assert.equal(Object.hasOwn(sanitize({ markdownBody: value }), 'markdownBody'), false)
  }
  // Any other retired/unknown key keeps its old behaviour too.
  assert.equal(Object.hasOwn(sanitize({ retiredThing: true }), 'retiredThing'), false)
})

test('the lifecycle starts the marker on `enabled && refine` only', function () {
  // The marker used to be gated on `enabled && refine && markdownBody`. With the
  // switch removed the third term is gone — NOT pinned to `true`, gone — so no
  // stored value and no future edit can switch the table frame back off.
  const source = readFileSync(new URL('../client/src/lifecycle.js', import.meta.url), 'utf8')
  const predicate = /const wanted = function \(\) \{[\s\S]*?return ([^\n]+)\n/.exec(source)
  assert.ok(predicate, 'expected the marker predicate in lifecycle.js')
  const body = predicate[1]
  assert.match(body, /state\.enabled !== false/)
  assert.match(body, /state\.refine !== false/)
  assert.ok(!/markdownBody/.test(body),
    'the retired switch term must not appear in the marker predicate: ' + body)
  // It is still started and stopped on the state subscription.
  assert.ok(/marker\.start\(\)/.test(source) && /marker\.stop\(\)/.test(source))
})

// -------------------------------------------------------- no host classes

test('the marker source names no host table class', function () {
  const source = readFileSync(new URL('../client/src/markdown.js', import.meta.url), 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.ok(!/_tableScroll_|_tableFill_|\bmd-table-(?:wide|fill)\b/.test(code),
    'the marker must locate tables structurally, never by a host class')
})
