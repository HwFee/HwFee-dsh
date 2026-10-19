/**
 * The hero greeting hook: structural lookup (no salted classes), idempotent
 * marking, cleanup on dispose, and graceful no-change when the host layout
 * differs.
 *
 * The fake DOM below mirrors the real one extracted from
 * `@deepseek-ai/dsh-client-ui-conversation`:
 *
 *   composerStack
 *   ├─ heroShell (HeroShell root; always first child)
 *   │   └─ heroStack
 *   │       ├─ headline  ← marked
 *   │       │   ├─ fishHitbox > [data-slot="conversation.hero.brand.mark"]
 *   │       │   └─ titleGroup
 *   │       └─ heroBody
 *   ├─ heroWorkspaceRow > [data-slot="conversation.hero.workspace"]
 *   ├─ [data-slot="conversation.input.dock"]      (or hoisted before the row)
 *   └─ inputBar
 *
 *   node test/hero.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  GREETING_ATTR, findGreetingHeadline, sweepGreeting, createGreetingMarker,
} from '../client/src/hero.js'
import { buildCssFor } from '../client/src/styles.js'
import { sanitize } from '../client/src/constants.js'

// ------------------------------------------------------------- fake DOM

const ATTR = /^\[([A-Za-z0-9-]+)(?:="([^"]*)")?\]$/

class FakeElement {
  constructor(attrs) {
    this.attrs = attrs || {}
    this.children = []
    this.parentElement = null
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

  matches(selector) {
    const match = ATTR.exec(selector)
    if (match === null) throw new Error('fake DOM: unsupported selector ' + selector)
    const name = match[1]
    if (!this.hasAttribute(name)) return false
    return match[2] === undefined || this.getAttribute(name) === match[2]
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

/** A root document stand-in: itself an element, with a `body`. */
function fakeDocument() {
  const doc = new FakeElement()
  doc.body = doc
  return doc
}

/**
 * Build the host's hero structure. Options drive the layout variations the
 * lookup has to survive or degrade from.
 */
function buildHero(options) {
  const opts = options || {}
  const doc = fakeDocument()
  const stack = el()

  const heroShell = el()
  const heroStack = el()
  const headline = el()
  const fishHitbox = el()
  if (opts.withBrand !== false) fishHitbox.append(el({ 'data-slot': 'conversation.hero.brand.mark' }))
  const titleGroup = el().append(el(), el())
  headline.append(fishHitbox, titleGroup)
  if (opts.withComposer) headline.append(el({ 'data-composer-card': '' }))
  const heroBody = el()
  heroStack.append(headline, heroBody)
  heroShell.append(heroStack)

  const workspaceRow = el()
  workspaceRow.append(el({ 'data-slot': 'conversation.hero.workspace' }))
  const dock = el({ 'data-slot': 'conversation.input.dock' })
  const inputBar = el()

  if (opts.shellFirst === false) {
    // A slot wrapper in the hero's seat: the layout moved on.
    stack.append(el({ 'data-slot': 'some.other.plugin' }), heroShell, dock, workspaceRow, inputBar)
  } else if (opts.hoistDock) {
    // usage-stats' insertBefore(outlet, workspaceRow).
    stack.append(heroShell, dock, workspaceRow, inputBar)
  } else {
    stack.append(heroShell, workspaceRow, dock, inputBar)
  }

  if (opts.dockElsewhere) {
    // Dock nested one level deeper than the composer stack.
    const wrapper = el()
    wrapper.append(dock)
    stack.appendChild(wrapper)
  }

  if (opts.noDock) {
    const index = stack.children.indexOf(dock)
    if (index >= 0) stack.children.splice(index, 1)
  }
  if (opts.noWorkspace) {
    workspaceRow.children = []
  }

  doc.append(stack)
  return { doc, stack, heroShell, heroStack, headline, workspaceRow, dock }
}

// ------------------------------------------------------------ the lookup

test('finds the real headline in the shipped sibling order', function () {
  const ui = buildHero({})
  assert.equal(findGreetingHeadline(ui.doc), ui.headline)
})

test('finds the headline when usage-stats hoists the dock above the row', function () {
  // usage-stats moves the dock outlet with insertBefore(outlet, workspaceRow),
  // so `workspaceRow.previousElementSibling` is the dock, not the hero.
  const ui = buildHero({ hoistDock: true })
  assert.equal(ui.stack.children[1], ui.dock, 'precondition: dock is hoisted')
  assert.equal(findGreetingHeadline(ui.doc), ui.headline)
})

test('accepts the brand-mark slot outlet INSIDE the headline', function () {
  // Every slot outlet the host renders carries data-slot (display:contents).
  // A blanket "headline has no data-slot" check would reject the real headline
  // and the serif would never apply — the bug this test exists for.
  const ui = buildHero({})
  assert.ok(ui.headline.querySelector('[data-slot]'),
    'precondition: the real headline hosts the brand-mark outlet')
  assert.equal(findGreetingHeadline(ui.doc), ui.headline)
})

test('marks and styles the real headline element, not a wrapper', function () {
  const ui = buildHero({ hoistDock: true })
  const marked = sweepGreeting(ui.doc)
  assert.equal(marked, ui.headline)
  assert.ok(ui.headline.hasAttribute(GREETING_ATTR))
  // The slot width wrappers must stay untouched.
  assert.ok(!ui.headline.firstElementChild.hasAttribute(GREETING_ATTR))
  assert.ok(!ui.workspaceRow.hasAttribute(GREETING_ATTR))
  assert.ok(!ui.dock.hasAttribute(GREETING_ATTR))
})

// -------------------------------------------------------- degradation

test('returns null when there is no conversation in the page at all', function () {
  assert.equal(findGreetingHeadline(fakeDocument()), null)
  assert.equal(findGreetingHeadline(null), null)
  assert.equal(findGreetingHeadline({}), null)
})

test('finds the headline before a session exists (no dock outlet)', function () {
  // The conversation renders the dock outlet only when a session exists
  // (`zone !== undefined`). The landing-page hero has the workspace row but no
  // dock, so the workspace anchor has to be the primary locator.
  const ui = buildHero({ noDock: true })
  assert.equal(findGreetingHeadline(ui.doc), ui.headline)
})

test('returns null when the workspace anchor is missing', function () {
  assert.equal(findGreetingHeadline(buildHero({ noWorkspace: true }).doc), null)
})

test('returns null when the hero is no longer the stack first child', function () {
  assert.equal(findGreetingHeadline(buildHero({ shellFirst: false }).doc), null)
})

test('returns null when the headline signature is gone', function () {
  // No brand-mark outlet: a titled div is not enough evidence.
  assert.equal(findGreetingHeadline(buildHero({ withBrand: false }).doc), null)
})

test('returns null when the candidate hosts the composer', function () {
  assert.equal(findGreetingHeadline(buildHero({ withComposer: true }).doc), null)
})

test('returns null when a rendered dock is in a different column', function () {
  assert.equal(findGreetingHeadline(buildHero({ dockElsewhere: true }).doc), null)
})

test('a layout that does not match gets no mark', function () {
  // Sanity: sweeping a page that does not match must not invent a mark.
  const doc = fakeDocument()
  const stray = el()
  doc.append(stray)
  assert.equal(sweepGreeting(doc), null)
  assert.ok(!stray.hasAttribute(GREETING_ATTR))
})

// ------------------------------------------------------------- lifecycle

test('the mark is idempotent', function () {
  const ui = buildHero({})
  sweepGreeting(ui.doc)
  sweepGreeting(ui.doc)
  sweepGreeting(ui.doc)
  const marks = ui.doc.querySelectorAll('[' + GREETING_ATTR + ']')
  assert.equal(marks.length, 1)
  assert.equal(marks[0], ui.headline)
})

test('a re-rendered headline is marked instead of leaving a stale mark', function () {
  const first = buildHero({})
  sweepGreeting(first.doc)
  assert.ok(first.headline.hasAttribute(GREETING_ATTR))

  // Simulate React recreating the whole subtree in an empty page.
  const doc = fakeDocument()
  const fresh = buildHero({})
  doc.append(fresh.stack)
  // The previous hero was detached with its document; a stale mark survives
  // only when its element is still in the tree, so graft it in.
  doc.append(first.stack)
  sweepGreeting(doc)
  assert.ok(fresh.headline.hasAttribute(GREETING_ATTR))
  assert.equal(first.headline.hasAttribute(GREETING_ATTR), false,
    'the detached hero must lose the stale mark')
  assert.equal(doc.querySelectorAll('[' + GREETING_ATTR + ']').length, 1)
})

test('a stale mark on another element is removed by the next sweep', function () {
  const ui = buildHero({})
  const stray = el()
  ui.doc.append(stray)
  stray.setAttribute(GREETING_ATTR, '')
  sweepGreeting(ui.doc)
  assert.equal(stray.hasAttribute(GREETING_ATTR), false)
  assert.ok(ui.headline.hasAttribute(GREETING_ATTR))
})

test('marker.start marks at once and stop removes every mark', function () {
  const ui = buildHero({})
  const marker = createGreetingMarker(ui.doc, null)
  marker.start()
  assert.equal(marker.started, true)
  assert.ok(ui.headline.hasAttribute(GREETING_ATTR))

  marker.stop()
  assert.equal(marker.started, false)
  assert.equal(ui.doc.querySelectorAll('[' + GREETING_ATTR + ']').length, 0)
  // A late scheduled sweep after stop must not re-mark.
  marker.sweep()
  assert.equal(ui.doc.querySelectorAll('[' + GREETING_ATTR + ']').length, 0)
})

test('the observer re-sweeps when React rebuilds the hero', async function () {
  const ui = buildHero({ withBrand: false })
  const callbacks = []
  class FakeObserver {
    constructor(callback) { this.callback = callback; callbacks.push(callback) }
    observe(target, options) { this.target = target; this.options = options }
    disconnect() { this.disconnected = true }
  }
  const marker = createGreetingMarker(ui.doc, FakeObserver)
  marker.start()
  assert.equal(ui.headline.hasAttribute(GREETING_ATTR), false, 'nothing to mark yet')

  // React swaps in a complete headline while the observer watches.
  ui.headline.appendChild(el({ 'data-slot': 'conversation.hero.brand.mark' }))
  assert.equal(callbacks.length, 1)
  callbacks[0]()
  await new Promise(function (resolve) { setTimeout(resolve, 5) })
  assert.ok(ui.headline.hasAttribute(GREETING_ATTR),
    'the observer callback must re-run the structural sweep')

  marker.stop()
  assert.equal(callbacks.length, 1, 'one observer for one lifetime')
})

test('start without a document is a safe no-op', function () {
  const marker = createGreetingMarker(null)
  assert.doesNotThrow(function () { marker.start() })
  assert.equal(marker.started, false)
  assert.doesNotThrow(function () { marker.stop() })
})

/**
 * Streaming churn must not cost a document sweep per frame.
 *
 * The observer used to be handed `schedule` directly, so every mutation batch —
 * including the text-node churn of a streaming answer — queued a full sweep: one
 * `findGreetingHeadline` walk plus a document-wide
 * `querySelectorAll('[data-cds-greeting]')`. Streaming can never ADD an element
 * that becomes the hero (the shell is mounted once), so that work was pure waste
 * for the whole duration of every response. `markdown.js` and `navicon.js`
 * already filter their records; this pins the same contract for the hero.
 */
test('a text-only mutation batch does not schedule a sweep', async function () {
  const ui = buildHero({ withBrand: false })
  const callbacks = []
  class FakeObserver {
    constructor(callback) { this.callback = callback; callbacks.push(callback) }
    observe() {}
    disconnect() { this.disconnected = true }
  }
  const marker = createGreetingMarker(ui.doc, FakeObserver)
  marker.start()
  assert.equal(ui.headline.hasAttribute(GREETING_ATTR), false,
    'precondition: no brand mark yet, so nothing is markable')

  // A streamed token is a character-data addition: it cannot create a headline.
  const text = { nodeType: 3, nodeValue: 'streamed token' }
  callbacks[0]([{ addedNodes: [text] }])
  await new Promise(function (resolve) { setTimeout(resolve, 10) })
  assert.equal(ui.headline.hasAttribute(GREETING_ATTR), false,
    'a text-only batch must not have swept — and there was nothing to mark anyway')

  // An ELEMENT addition is the one case that can carry the headline, so it must
  // still sweep — this is the half that keeps the optimisation honest.
  const brand = el({ 'data-slot': 'conversation.hero.brand.mark' })
  ui.headline.appendChild(brand)
  callbacks[0]([{ addedNodes: [brand] }])
  await new Promise(function (resolve) { setTimeout(resolve, 10) })
  assert.ok(ui.headline.hasAttribute(GREETING_ATTR),
    'an element addition still re-runs the structural sweep')
  marker.stop()
})

test('a callback with no records still sweeps (degradation over silence)', async function () {
  const ui = buildHero({ withBrand: false })
  const callbacks = []
  class FakeObserver {
    constructor(callback) { this.callback = callback; callbacks.push(callback) }
    observe() {}
    disconnect() {}
  }
  const marker = createGreetingMarker(ui.doc, FakeObserver)
  marker.start()
  ui.headline.appendChild(el({ 'data-slot': 'conversation.hero.brand.mark' }))
  // A hand-built host or test double may invoke the callback with nothing.
  callbacks[0]()
  await new Promise(function (resolve) { setTimeout(resolve, 10) })
  assert.ok(ui.headline.hasAttribute(GREETING_ATTR))
  marker.stop()
})

// -------------------------------------------------------------- styling

test('the stylesheet paints the mark with the reference serif display', function () {
  const css = buildCssFor(sanitize({}))
  const block = css.split('[data-cds-greeting] {')[1]
  assert.ok(block, 'expected a [data-cds-greeting] rule')
  const body = block.split('}')[0]
  assert.match(body, /font-family: var\(--font-anthropic-serif\)/)
  // docs/v1/01-…md:547 — the greeting display row.
  assert.match(body, /font-size: 38px/)
  assert.match(body, /line-height: 1\.2/)
  assert.match(body, /font-weight: 330/)
  assert.match(body, /font-variation-settings: "opsz" 48/)
  // The hook is the plugin's own attribute, never a host class.
  assert.ok(!/Hqq|_\w+_\d+/.test(css), 'no salted host class may appear in the sheet')
})
