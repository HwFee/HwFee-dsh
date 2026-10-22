/**
 * The hero input height budget: the arithmetic, the feedback property, and the
 * DOM adapter's write/restore contract.
 *
 * WHY THIS SUITE EXISTS. The user's report was that the classic usage panel was
 * still pushed away once the input box held a lot of text. The mechanics: a long
 * draft grew the host's composer toward its own 336px cap, the panel above it
 * pushed the hero stack past the scrollport, and the host's centred stack left
 * the panel above scroll position 0 where it could not be reached. Four things
 * have to hold for the fix to be a fix:
 *
 *   1. on a roomy window the budget IS the host's own 336px, so a short draft
 *      looks and behaves exactly as it did before;
 *   2. the budget is measured by SUBTRACTING the growing text from the stack, so
 *      applying it cannot reseat itself (the compactHero feedback loop that was
 *      removed from cds-theme: measure the seat, hide something, measure again);
 *   3. the floor is ONE line of the real editor, not a round number of lines, so
 *      a short window lets the page scroll instead of squeezing the editor;
 *   4. everything the adapter writes is removed on unmount — including a frame
 *      that was already queued when `dispose()` ran.
 *
 *   node test/input-budget.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  BUDGET_RESERVE,
  CARD_ATTR,
  HOST_TEXT_MAX,
  INPUT_BUDGET_VAR,
  SCROLL_ATTR,
  SINGLE_LINE_FALLBACK,
  SINGLE_LINE_MAX,
  attachInputBudget,
  chromeFrom,
  inputBudgetFor,
  lineFloorFor,
} from '../client/src/input-budget.js'
import { PANEL_CSS } from '../client/src/styles.js'

// ------------------------------------------------------------------ the arithmetic

test('a roomy window leaves the host 336px cap in charge', function () {
  // 900px scrollport, 400px of chrome: 900 − 400 − 12 = 488, which the ceiling
  // truncates to the host's own cap. This is the "short draft is unchanged" case.
  assert.equal(inputBudgetFor({ available: 900, chrome: 400 }), HOST_TEXT_MAX)
  // Even a window with no chrome cannot raise it: the host cap is a ceiling.
  assert.equal(inputBudgetFor({ available: 2000, chrome: 0 }), HOST_TEXT_MAX)
})

test('a short window lowers the budget below the host cap', function () {
  // 700px scrollport, 400px chrome → 288px for the editor.
  assert.equal(inputBudgetFor({ available: 700, chrome: 400 }), 288)
  assert.ok(288 < HOST_TEXT_MAX, 'the panel plus chrome must be able to win')
})

test('the floor defaults to ONE editor line, not a round number of lines', function () {
  // The default floor is the host's own 36px minimum line.
  assert.equal(inputBudgetFor({ available: 420, chrome: 400 }), SINGLE_LINE_FALLBACK)
  assert.equal(inputBudgetFor({ available: 50, chrome: 400 }), SINGLE_LINE_FALLBACK)
  // A caller cannot ask for a floor above the ceiling.
  assert.equal(inputBudgetFor({ available: 50, chrome: 0, floor: 500 }), HOST_TEXT_MAX)
  // A measured line floor is honoured.
  assert.equal(inputBudgetFor({ available: 420, chrome: 400, floor: 56 }), 56)
})

test('an unreadable scrollport falls back to the host behaviour, not to the floor', function () {
  assert.equal(inputBudgetFor({ available: undefined, chrome: 400 }), HOST_TEXT_MAX)
  assert.equal(inputBudgetFor({ available: 0, chrome: 400 }), HOST_TEXT_MAX)
  assert.equal(inputBudgetFor(null), HOST_TEXT_MAX)
})

test('the reserve is part of the contract, not a magic number in the adapter', function () {
  // A raised ceiling so the reserve is what the assertion actually sees.
  assert.equal(inputBudgetFor({ available: 800, chrome: 400, ceiling: 900 }),
    800 - 400 - BUDGET_RESERVE)
  assert.equal(inputBudgetFor({ available: 800, chrome: 400, reserve: 0, ceiling: 900 }), 400)
})

// ------------------------------------------------------------------ the line floor

test('the line floor is one visible line plus the port own padding', function () {
  // A 24px line with 8px of caret room when the port declares no padding.
  assert.equal(lineFloorFor({ lineHeight: 24 }), 36)
  // A padded split seat: 24px line inside 16px of padding top and bottom.
  assert.equal(lineFloorFor({ lineHeight: 24, paddingTop: 16, paddingBottom: 16 }), SINGLE_LINE_MAX)
  // A single-sided pad still adds to the line.
  assert.equal(lineFloorFor({ lineHeight: 24, paddingTop: 4, paddingBottom: 4 }), 36)
  // No measurement at all → the fallback, never zero and never four lines.
  assert.equal(lineFloorFor({}), SINGLE_LINE_FALLBACK)
  assert.equal(lineFloorFor({ lineHeight: 0 }), SINGLE_LINE_FALLBACK)
  // Bounded on both sides whatever it is handed.
  assert.equal(lineFloorFor({ lineHeight: 1 }), SINGLE_LINE_FALLBACK)
  assert.equal(lineFloorFor({ lineHeight: 200 }), SINGLE_LINE_MAX)
  assert.equal(lineFloorFor({ lineHeight: 12, paddingTop: 400, paddingBottom: 400 }), SINGLE_LINE_MAX)
})

// ------------------------------------------------------------------ no feedback

test('chrome is unchanged when the text grows, so the budget cannot reseat itself', function () {
  // The stack is one subtraction: everything minus the editor. A short draft and
  // an 80-line draft differ ONLY in the editor, so the chrome is identical and
  // the budget cannot move.
  const fixed = 92 + 344 + 32 + 68 // shell + panel + workspace row + card chrome
  const chromeShort = chromeFrom({ stackHeight: fixed + 60, textPortHeight: 60 })
  const chromeLong = chromeFrom({ stackHeight: fixed + 240, textPortHeight: 240 })

  assert.equal(chromeShort, chromeLong,
    'chrome must be a function of the fixed parts only')
  assert.equal(chromeShort, fixed)

  // And therefore the budget is identical before and after the draft grows.
  const before = inputBudgetFor({ available: 700, chrome: chromeShort })
  const after = inputBudgetFor({ available: 700, chrome: chromeLong })
  assert.equal(before, after, 'a growing draft must not move its own cap')
})

test('an attachment or a wrapped toolbar lowers the budget, because chrome grew', function () {
  // A chip row adds 32px that is NOT the text port, so the stack grows without
  // the subtrahend following — the difference picks it up.
  const chromeWithout = chromeFrom({ stackHeight: 400 + 68 + 96, textPortHeight: 96 })
  const chromeWith = chromeFrom({ stackHeight: 400 + 68 + 32 + 96, textPortHeight: 96 })
  assert.equal(chromeWith - chromeWithout, 32, 'only the grown part counts')

  const before = inputBudgetFor({ available: 700, chrome: chromeWithout })
  const after = inputBudgetFor({ available: 700, chrome: chromeWith })
  assert.equal(before - after, 32, 'the attachment comes out of the editor budget')
})

test('a taller panel lowers the budget, which is the reported failure', function () {
  const short = chromeFrom({ stackHeight: 92 + 344 + 32 + 128, textPortHeight: 60 })
  const tall = chromeFrom({ stackHeight: 92 + 520 + 32 + 128, textPortHeight: 60 })
  assert.equal(tall - short, 176, '344 → 520 is 176px off the editor budget')
})

// ------------------------------------------------------------------ the stylesheet

test('the stylesheet combines our budget with the host cap and never self-references', function () {
  const parts = PANEL_CSS.split('[data-composer-card] [data-input-scroll] {')
  assert.equal(parts.length, 2, 'the input scrollport rule must exist exactly once')
  const declaration = parts[1].split('}')[0]
  assert.match(declaration, /max-height: min\(var\(--dsh-composer-text-max-height/,
    'the host cap stays the first operand')
  assert.match(declaration, /var\(--dus-input-budget/, 'our own property is the second')
  // A self-reference (our var read inside its own definition) or a nested
  // `min(min(...))` would be a cycle / unbounded string growth. Neither may
  // appear more than once in this declaration.
  const ourVarUses = declaration.split(INPUT_BUDGET_VAR).length - 1
  assert.equal(ourVarUses, 1, 'exactly one read of our own property')
  assert.equal(declaration.split('min(').length - 1, 1, 'no nested min()')
})

test('the hero scrollport is marked and gets safe centring', function () {
  const parts = PANEL_CSS.split('[data-conversation-scroll][data-dus-hero-scroll] {')
  assert.equal(parts.length, 2, 'the scrollport rule must be scoped to OUR marker')
  const rule = parts[1].split('}')[0]
  assert.match(rule, /justify-content: flex-start !important/, 'fallback without safe')
  assert.match(rule, /justify-content: safe center !important/, 'top stays reachable')
  // This fix sizes the INPUT; the panel's own height rules must stay untouched.
  assert.equal(PANEL_CSS.indexOf('--dus-body-height: min('), -1)
})

// ------------------------------------------------------------------ a fake DOM

/**
 * The smallest tree `attachInputBudget` walks: our root inside the dock outlet
 * (which the host renders as `display: contents`), the composer stack, and the
 * scrollport above it — the shape in `docs/host-hooks.md` §1 and
 * `.repro/css/conversation/05-ConversationRoot.module.pretty.css`.
 */
function node(spec) {
  const attrs = Object.assign({}, spec.attrs || {})
  const element = {
    children: [],
    parentNode: null,
    clientHeight: spec.clientHeight || 0,
    height: spec.height || 0,
    style: {
      values: {},
      setProperty(name, value) { this.values[name] = value },
      removeProperty(name) { delete this.values[name] },
      getPropertyValue(name) { return this.values[name] },
    },
    getAttribute(name) { return name in attrs ? attrs[name] : null },
    setAttribute(name, value) { attrs[name] = String(value === undefined ? '' : value) },
    removeAttribute(name) { delete attrs[name] },
    hasAttribute(name) { return name in attrs },
    getBoundingClientRect() {
      return { width: 700, height: element.height, top: 0, left: 0, right: 700, bottom: element.height }
    },
  }
  return element
}

function contain(parent, child) {
  parent.children.push(child)
  child.parentNode = parent
  return parent
}

/**
 * The live hero layout: the scrollport, the composer stack and its children, and
 * the composer card that owns the text port. Heights are the host's real ones
 * where they matter (the card's 68px of padding/toolbar, the panel's 344px).
 *
 * `typeLines` / `setPanel` / `setViewport` are what a browser would report after
 * a reflow; nothing is written back, so the fixture cannot "help" the module.
 */
function seat() {
  const scroller = node({ attrs: { 'data-conversation-scroll': '' }, clientHeight: 700 })
  const stack = node({})
  contain(scroller, stack)
  const shell = node({})
  contain(stack, shell)
  const dockOutlet = node({}) // display: contents — measures 0, holds our root
  contain(stack, dockOutlet)
  const workspaceRow = node({})
  contain(stack, workspaceRow)
  const card = node({ attrs: { 'data-composer-card': '' } })
  contain(stack, card)
  const textPort = node({ attrs: { 'data-input-scroll': '' } })
  contain(card, textPort)
  const toolbar = node({})
  contain(card, toolbar)

  const root = node({}) // our `.dus-root`
  contain(dockOutlet, root)

  const CARD_CHROME = 68
  const SHELL = 92
  const ROW = 32
  let panelHeight = 344
  let textHeight = 60
  let chipRow = 0

  const layout = function () {
    shell.height = SHELL
    workspaceRow.height = ROW
    root.height = panelHeight
    dockOutlet.height = 0 // display: contents
    toolbar.height = CARD_CHROME
    textPort.height = textHeight
    card.height = CARD_CHROME + chipRow + textHeight
    stack.height = SHELL + panelHeight + ROW + card.height
  }
  layout()

  return {
    scroller: scroller,
    stack: stack,
    card: card,
    textPort: textPort,
    root: root,
    /** A long draft: only the editor grows. */
    typeLines(px) { textHeight = px; layout() },
    /** A different panel height setting (240 / 344 / 520). */
    setPanel(px) { panelHeight = px; layout() },
    /** An attachment chip row: the card grows, the editor does not. */
    addChips(px) { chipRow = px; layout() },
    /** A shorter window. */
    setViewport(px) { scroller.clientHeight = px },
  }
}

/** A ResizeObserver double that records observations and can fire on demand. */
function observerSpy() {
  const created = []
  function FakeObserver(callback) {
    this.callback = callback
    this.observed = []
    this.disconnected = false
    created.push(this)
  }
  FakeObserver.prototype.observe = function (target) { this.observed.push(target) }
  FakeObserver.prototype.disconnect = function () { this.disconnected = true }
  return { Observer: FakeObserver, created }
}

/**
 * An ASYNC frame scheduler: callbacks are queued and only run on `flush()`.
 *
 * This is the double the queued-frame regression needs. A synchronous stub (run
 * the callback immediately) cannot show that a frame scheduled BEFORE `dispose()`
 * is cancelled — it would have run before the dispose ever happened.
 */
function frameQueue() {
  const queued = new Map()
  let next = 1
  return {
    requestAnimationFrame(callback) {
      const id = next++
      queued.set(id, callback)
      return id
    },
    cancelAnimationFrame(id) { queued.delete(id) },
    /** Run everything that is currently queued, in scheduling order. */
    flush() {
      const pending = Array.from(queued.entries())
      queued.clear()
      for (const [, callback] of pending) callback()
      return pending.length
    },
    get size() { return queued.size },
  }
}

function viewWith(Observer, frames) {
  const style = {
    paddingTop: '0px',
    paddingBottom: '0px',
    marginTop: '0px',
    marginBottom: '0px',
    lineHeight: '24px',
  }
  const view = {
    ResizeObserver: Observer,
    requestAnimationFrame: frames
      ? function (callback) { return frames.requestAnimationFrame(callback) }
      : function (callback) { callback(); return 1 },
    cancelAnimationFrame: frames ? function (id) { frames.cancelAnimationFrame(id) } : function () {},
    /** Every node reports the same box style unless a test overrides it. */
    getComputedStyle(node) { return node.computed || style },
  }
  return view
}

function attach(layout, spy, frames) {
  return attachInputBudget(layout.root, {
    view: viewWith(spy.Observer, frames),
    ResizeObserver: spy.Observer,
  })
}

// ------------------------------------------------------------------ the adapter

test('the adapter writes its budget on the composer card and marks the scrollport', function () {
  const layout = seat()
  const spy = observerSpy()
  const dispose = attach(layout, spy)
  assert.equal(typeof dispose, 'function')

  // The 60px port is treated as one line of 24 plus 36 of padding, so the floor
  // is 36; 700 − (596 − 60 = 536) − 12 = 152, which sits above it.
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), '152px')
  assert.equal(layout.card.hasAttribute(CARD_ATTR), true)
  assert.equal(layout.scroller.hasAttribute(SCROLL_ATTR), true)
  // The panel's own box is never touched by this module.
  assert.deepEqual(layout.root.style.values, {})
  assert.equal(layout.root.hasAttribute(CARD_ATTR), false)

  dispose()
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), undefined)
  assert.equal(layout.card.hasAttribute(CARD_ATTR), false)
  assert.equal(layout.scroller.hasAttribute(SCROLL_ATTR), false)
  assert.equal(spy.created.length, 1)
  assert.equal(spy.created[0].disconnected, true, 'the observer must be released')
})

test('a short draft keeps the host cap, so the default look is unchanged', function () {
  const layout = seat()
  const spy = observerSpy()
  layout.setPanel(240) // chrome 92+240+32+68 = 432
  layout.setViewport(900)
  const dispose = attach(layout, spy)
  // 900 − 432 − 12 = 456 → the host's own 336 wins, i.e. nothing changes for a
  // short draft on a normal window.
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), '336px')
  dispose()
})

test('an 80-line draft does not move its own budget (the reported failure)', function () {
  const layout = seat()
  const spy = observerSpy()
  const frames = frameQueue()
  const dispose = attach(layout, spy, frames)
  const initial = layout.card.style.getPropertyValue(INPUT_BUDGET_VAR)
  assert.equal(initial, '152px')

  // The draft grows to the cap the browser is holding, then the observer fires
  // and the queued frame runs.
  layout.typeLines(152)
  spy.created[0].callback()
  frames.flush()
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), initial,
    'growing text must not shrink the cap that bounds it')

  // A shrink back to one line fires again and still holds the same value.
  layout.typeLines(24)
  spy.created[0].callback()
  frames.flush()
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), initial)

  dispose()
})

test('observer bursts coalesce into ONE frame', function () {
  const layout = seat()
  const spy = observerSpy()
  const frames = frameQueue()
  const dispose = attach(layout, spy, frames)
  // Five deliveries before any frame runs.
  for (let i = 0; i < 5; i += 1) {
    layout.typeLines(60 + i * 8)
    spy.created[0].callback()
  }
  assert.equal(frames.size, 1, 'one queued frame, not five')
  frames.flush()
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), '152px')
  dispose()
})

test('a frame queued before dispose never writes again', function () {
  const layout = seat()
  const spy = observerSpy()
  const frames = frameQueue()
  const dispose = attach(layout, spy, frames)

  // Queue a frame, then unmount before it runs — the real-world sequence when a
  // blank session becomes active mid-resize.
  layout.setViewport(600)
  spy.created[0].callback()
  assert.equal(frames.size, 1, 'the frame is queued')
  dispose()
  assert.equal(frames.size, 0, 'dispose cancels the queued frame')

  // Even if a scheduler ran a callback it had already handed out, `sync` is
  // guarded — so the property and BOTH markers must stay off.
  frames.flush()
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), undefined)
  assert.equal(layout.card.hasAttribute(CARD_ATTR), false)
  assert.equal(layout.scroller.hasAttribute(SCROLL_ATTR), false)
})

test('an observer delivery after dispose schedules nothing', function () {
  const layout = seat()
  const spy = observerSpy()
  const frames = frameQueue()
  const dispose = attach(layout, spy, frames)
  dispose()
  // A genuinely late delivery (an observer that fires in its last batch).
  spy.created[0].callback()
  assert.equal(frames.size, 0)
  frames.flush()
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), undefined)
  assert.equal(layout.scroller.hasAttribute(SCROLL_ATTR), false)
})

test('repeated syncs write one plain px property and never nest min()', function () {
  const layout = seat()
  const spy = observerSpy()
  const frames = frameQueue()
  const dispose = attach(layout, spy, frames)
  for (let i = 0; i < 5; i += 1) {
    layout.typeLines(60 + i * 24)
    spy.created[0].callback()
    frames.flush()
  }
  const written = layout.card.style.getPropertyValue(INPUT_BUDGET_VAR)
  assert.equal(written, '152px')
  assert.equal(written.indexOf('min('), -1, 'the value stays a plain px length')
  dispose()
})

test("the scrollport's own padding comes out of the usable height", function () {
  const layout = seat()
  const spy = observerSpy()
  const frames = frameQueue()
  // clientHeight INCLUDES padding, but content cannot be laid out in it.
  layout.scroller.computed = { paddingTop: '10px', paddingBottom: '10px', lineHeight: '24px' }
  const dispose = attach(layout, spy, frames)
  // 700 − 20 = 680 usable, chrome 536, reserve 12 → 132.
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), '132px')
  dispose()
  assert.equal(frames.size, 0)
})

test("the stack's own vertical margins count as chrome", function () {
  const layout = seat()
  const spy = observerSpy()
  const frames = frameQueue()
  layout.stack.computed = { marginTop: '6px', marginBottom: '6px', lineHeight: '24px' }
  const dispose = attach(layout, spy, frames)
  // 700 − (536 + 12) − 12 = 140.
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), '140px')
  dispose()
})

test('a short window floors the editor at one line and lets the page scroll', function () {
  const layout = seat()
  const spy = observerSpy()
  const frames = frameQueue()
  const dispose = attach(layout, spy, frames)
  layout.setViewport(620)
  layout.setPanel(520)
  spy.created[0].callback()
  frames.flush()
  // 620 − (772 − 60 = 712) − 12 is negative → the ONE-LINE floor (36px), not a
  // four-line squeeze, and the scrollport carries our marker so `safe center`
  // start-aligns the stack and the page scrolls.
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), SINGLE_LINE_FALLBACK + 'px')
  assert.equal(layout.scroller.hasAttribute(SCROLL_ATTR), true)

  // On a 600px window with the DEFAULT panel the editor still gets what is left
  // (600 − 536 − 12 = 52px, about two lines) and the page scrolls for the rest —
  // the case a fixed 96px floor got wrong, because it squeezed the panel out
  // before the page had any need to scroll.
  layout.setViewport(600)
  layout.setPanel(344)
  spy.created[0].callback()
  frames.flush()
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), '52px')
  assert.equal(layout.scroller.hasAttribute(SCROLL_ATTR), true)

  // A tall window hands the cap back to the host, i.e. the classic look returns.
  layout.setViewport(1400)
  spy.created[0].callback()
  frames.flush()
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), '336px')
  dispose()
})

test('a padded split seat gets a one-line floor that includes its padding', function () {
  const layout = seat()
  const spy = observerSpy()
  const frames = frameQueue()
  // A split composer's port carries 16px of padding top and bottom around a
  // 24px line: the floor is one full line including that padding.
  layout.textPort.computed = { paddingTop: '16px', paddingBottom: '16px', lineHeight: '24px' }
  layout.setViewport(560)
  layout.setPanel(520)
  const dispose = attach(layout, spy, frames)
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), SINGLE_LINE_MAX + 'px')
  dispose()
})

test('an attachment row lowers the budget without touching the panel', function () {
  const layout = seat()
  const spy = observerSpy()
  const frames = frameQueue()
  const dispose = attach(layout, spy, frames)
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), '152px')
  // A chip row inside the card: the stack grows, the text port does not.
  layout.addChips(32)
  spy.created[0].callback()
  frames.flush()
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), '120px')
  dispose()
})

test('an unrecognised seat is left untouched instead of throwing', function () {
  // A stack with no composer card at all.
  const noCard = (function () {
    const scroller = node({ attrs: { 'data-conversation-scroll': '' }, clientHeight: 700 })
    const stack = node({})
    contain(scroller, stack)
    const outlet = node({})
    contain(stack, outlet)
    const root = node({})
    contain(outlet, root)
    return { root: root, scroller: scroller }
  })()
  assert.equal(attachInputBudget(noCard.root), undefined)
  assert.equal(noCard.scroller.hasAttribute(SCROLL_ATTR), false)

  // No marked scrollport ancestor (an embedded seat, or a host that renamed the
  // hook): nothing to divide, so nothing is written.
  const loose = seat()
  loose.scroller.removeAttribute('data-conversation-scroll')
  assert.equal(attachInputBudget(loose.root), undefined)
  assert.equal(loose.card.style.getPropertyValue(INPUT_BUDGET_VAR), undefined)
  assert.equal(loose.scroller.hasAttribute(SCROLL_ATTR), false)

  // Our own root detached from the tree (an unmounting frame).
  assert.equal(attachInputBudget(node({})), undefined)
  assert.equal(attachInputBudget(null), undefined)
  // A card without a text scrollport (a host that renamed the hook): no-op, and
  // crucially no attribute left behind on the scrollport.
  const noPort = seat()
  noPort.card.children = []
  assert.equal(attachInputBudget(noPort.root), undefined)
  assert.equal(noPort.scroller.hasAttribute(SCROLL_ATTR), false)
})

test('without a ResizeObserver the first measurement still applies and still restores', function () {
  const layout = seat()
  const dispose = attachInputBudget(layout.root, { view: {} })
  assert.equal(typeof dispose, 'function')
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), '152px')
  dispose()
  assert.equal(layout.card.style.getPropertyValue(INPUT_BUDGET_VAR), undefined)
  assert.equal(layout.scroller.hasAttribute(SCROLL_ATTR), false)
})
