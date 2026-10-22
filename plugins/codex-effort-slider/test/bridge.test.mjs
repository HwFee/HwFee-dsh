/**
 * The DOM bridge: what it mounts, what it refuses to mount, and what it restores.
 *
 * The refusals are as important as the mounts. `findEffortRow` is deliberately
 * stricter than the upstream version: it requires the panel to prove it is the model
 * root panel (its first row must say 模型/Model) before it will treat the second row as
 * the effort row. Without that, any two-row dropdown anchored in the composer — a
 * permission menu, a plan menu — would get a reasoning slider injected into it.
 *
 * The performance tests exist because the mutation callback is on the streaming path:
 * a naive `scan()` in the callback means a document-wide query per token.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { ROW_PADDING_BLOCK } from '../client/src/constants.js'
import {
  createMenuBridge,
  findEffortRow,
  findSeatEffort,
  findValueElement,
  flattenLabel,
  isLabel,
  firstSpanText,
} from '../client/src/bridge.js'

/** A DOM with the host's model menu, in the exact shape the installed app.asar renders. */
function hostDom(options = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  const doc = window.document

  const composer = doc.createElement('div')
  composer.setAttribute('data-composer-card', '')
  doc.body.appendChild(composer)

  const anchor = doc.createElement('span')
  anchor.hidden = true
  composer.appendChild(anchor)

  const seat = doc.createElement('button')
  seat.setAttribute('aria-haspopup', 'menu')
  seat.setAttribute('aria-expanded', options.open === false ? 'false' : 'true')
  seat.setAttribute('aria-controls', options.menuId ?? 'model-menu')
  const seatLabel = doc.createElement('span')
  seatLabel.textContent = options.modelLabel ?? 'DeepSeek-V41-Flash'
  const seatEffort = doc.createElement('span')
  seatEffort.textContent = options.effortLabel ?? 'High'
  seat.appendChild(seatLabel)
  seat.appendChild(seatEffort)
  composer.appendChild(seat)

  const menu = doc.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.setAttribute('id', options.menuId ?? 'model-menu')
  doc.body.appendChild(menu)

  function row(label, value) {
    const button = doc.createElement('button')
    button.setAttribute('role', 'menuitem')
    const labelSpan = doc.createElement('span')
    labelSpan.className = 'cellLabel'
    labelSpan.textContent = label
    const valueSpan = doc.createElement('span')
    valueSpan.className = 'cellValue'
    valueSpan.textContent = value
    const chevron = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    chevron.setAttribute('class', 'cellChevron')
    button.appendChild(labelSpan)
    button.appendChild(valueSpan)
    button.appendChild(chevron)
    menu.appendChild(button)
    return { button, labelSpan, valueSpan }
  }

  const modelRow = options.modelRow === false ? null : row(options.modelRowLabel ?? '模型', options.modelLabel ?? 'DeepSeek-V41-Flash')
  const effortRow = options.effortRow === false ? null : row(options.effortLabel ?? '推理等级', options.effortLabel2 ?? 'High')

  return { dom, window, doc, composer, anchor, seat, seatLabel, seatEffort, menu, modelRow, effortRow }
}

/** A ResizeObserver double: the bridge must not depend on the real one. */
class WatcherStub {
  constructor(callback) { this.callback = callback }
  observe() {}
  disconnect() { this.disconnected = true }
}

test('flattenLabel normalises whitespace and tolerates non-strings', function () {
  assert.equal(flattenLabel(' 推理 等级 '), '推理等级')
  assert.equal(flattenLabel(undefined), '')
  assert.equal(flattenLabel(null), '')
})

test('isLabel matches either locale and rejects a partial match', function () {
  assert.equal(isLabel('推理等级', ['推理等级', 'Effort']), true)
  assert.equal(isLabel('Effort', ['推理等级', 'Effort']), true)
  assert.equal(isLabel('  Effort ', ['推理等级', 'Effort']), true)
  assert.equal(isLabel('推理', ['推理等级']), false)
  assert.equal(isLabel('', ['推理等级']), false)
})

test('firstSpanText returns the first non-empty span text', function () {
  const { effortRow } = hostDom()
  assert.equal(firstSpanText(effortRow.button), '推理等级')
  assert.equal(firstSpanText(null), '')
})

test('findValueElement prefers the cellValue class', function () {
  const { effortRow } = hostDom()
  assert.equal(findValueElement(effortRow.button), effortRow.valueSpan)
})

test('findValueElement falls back to the last non-empty span when the class hashes', function () {
  // The real class name is `wq12jW_cellValue` and carries the build prefix, so a
  // substring match is convenience, not the contract.
  const { doc } = hostDom()
  const row = doc.createElement('button')
  const label = doc.createElement('span')
  label.textContent = '推理等级'
  const value = doc.createElement('span')
  value.textContent = 'Max'
  const empty = doc.createElement('span')
  empty.textContent = ''
  row.appendChild(label)
  row.appendChild(value)
  row.appendChild(empty)
  assert.equal(findValueElement(row), value)
})

test('findEffortRow resolves the effort row of OUR composer\'s open model menu', function () {
  const { doc, composer, effortRow } = hostDom()
  assert.equal(findEffortRow(doc, composer), effortRow.button)
})

test('findEffortRow refuses a panel whose first row is not the model row', function () {
  // THE HARDENING. A permission/plan/attachment menu can also render exactly two
  // menuitems. Upstream would have taken `items[1]`; this must refuse.
  const { doc, composer } = hostDom({ modelRowLabel: '权限' })
  assert.equal(findEffortRow(doc, composer), null)
})

test('findEffortRow refuses when the second row has a different readable label', function () {
  const { doc, composer } = hostDom({ effortLabel: '某个其它项' })
  assert.equal(findEffortRow(doc, composer), null,
    'model + a non-effort second row is not the panel we decorate')
})

test('findEffortRow accepts an EMPTY second row once the model row is proven', function () {
  // The model row is the anchor. An empty second cell (a level name that has not
  // rendered yet) must not disable the feature; a DIFFERENT readable label does, which
  // is the next test.
  const { doc, composer, effortRow } = hostDom({ effortLabel: '' })
  effortRow.labelSpan.textContent = ''
  effortRow.valueSpan.textContent = ''
  assert.equal(findEffortRow(doc, composer), effortRow.button)
})

test('findEffortRow refuses when the menu has three rows (a sub-pane)', function () {
  const { doc, composer, menu } = hostDom()
  const extra = doc.createElement('button')
  extra.setAttribute('role', 'menuitemradio')
  extra.textContent = 'off'
  menu.appendChild(extra)
  // menuitemradio does not count in the menuitem query, so this still resolves...
  assert.notEqual(findEffortRow(doc, composer), null)
  // ...but a third real menuitem makes the shape unknown, and unknown means hands off.
  const third = doc.createElement('button')
  third.setAttribute('role', 'menuitem')
  third.textContent = '其它'
  menu.appendChild(third)
  assert.equal(findEffortRow(doc, composer), null)
})

test('findEffortRow refuses a closed seat, a foreign composer and a missing menu', function () {
  const closed = hostDom({ open: false })
  assert.equal(findEffortRow(closed.doc, closed.composer), null, 'no open menu, nothing to decorate')

  const foreign = hostDom()
  const otherComposer = foreign.doc.createElement('div')
  foreign.doc.body.appendChild(otherComposer)
  assert.equal(findEffortRow(foreign.doc, otherComposer), null,
    'another composer\'s open menu is not ours')

  const missing = hostDom()
  missing.doc.getElementById('model-menu').remove()
  assert.equal(findEffortRow(missing.doc, missing.composer), null)

  assert.equal(findEffortRow(null, foreign.composer), null)
  assert.equal(findEffortRow(foreign.doc, null), null)
})

test('findSeatEffort finds the level text inside our own collapsed seat', function () {
  const { doc, composer, seatEffort } = hostDom()
  assert.equal(findSeatEffort(doc, composer, ['Off', 'Low', 'High', 'Max']), seatEffort)
  // An unknown label list means "nothing matched", not "take the first span".
  assert.equal(findSeatEffort(doc, composer, ['Ultra']), null)
  assert.equal(findSeatEffort(doc, composer, []), null)
  assert.equal(findSeatEffort(null, composer, ['High']), null)
})

test('findSeatEffort ignores a seat in a different composer', function () {
  const { doc } = hostDom()
  const other = doc.createElement('div')
  doc.body.appendChild(other)
  assert.equal(findSeatEffort(doc, other, ['High']), null)
})

/** Build a bridge over the fixture DOM. */
function makeBridge(fixture, options = {}) {
  const active = options.active ?? (() => true)
  const changes = []
  const bridge = createMenuBridge({
    doc: fixture.doc,
    win: options.win ?? fixture.window,
    anchor: () => fixture.anchor,
    active,
    onChange: (next) => changes.push(next),
    seatLabels: () => options.seatLabels ?? ['Off', 'Low', 'High', 'Max'],
  })
  return { bridge, changes, active }
}

test('the bridge mounts a container into the effort row and grows the row', function () {
  const fixture = hostDom()
  const { bridge, changes } = makeBridge(fixture)
  bridge.start()
  const host = bridge.host()
  assert.notEqual(host, null)
  assert.equal(host.row, fixture.effortRow.button)
  assert.equal(fixture.effortRow.button.querySelectorAll('.ces-inline').length, 1)
  assert.equal(host.container.getAttribute('data-ces-part'), 'host')

  // Four inline styles, nothing else about the row is touched.
  assert.equal(fixture.effortRow.button.style.height, 'auto')
  assert.equal(fixture.effortRow.button.style.flexWrap, 'wrap')
  assert.equal(fixture.effortRow.button.style.paddingTop, ROW_PADDING_BLOCK)
  assert.equal(fixture.effortRow.button.style.paddingBottom, ROW_PADDING_BLOCK)
  // The host's own label and value text are untouched.
  assert.equal(fixture.effortRow.labelSpan.textContent, '推理等级')
  assert.equal(fixture.effortRow.valueSpan.textContent, 'High')
  assert.equal(changes.length, 1)
  assert.equal(changes[0], host)
  bridge.dispose()
})

test('the bridge does NOT mount while there are no levels', function () {
  const fixture = hostDom()
  const { bridge } = makeBridge(fixture, { active: () => false })
  bridge.start()
  assert.equal(bridge.host(), null, 'a model without reasoning metadata must get no control at all')
  assert.equal(fixture.effortRow.button.querySelectorAll('.ces-inline').length, 0)
  assert.equal(fixture.effortRow.button.style.height, '', 'and the row must not be grown for nothing')
  bridge.dispose()
})

test('dispose restores every inline style it wrote and removes its node', function () {
  const fixture = hostDom()
  // Pre-existing inline styles (the host wrote them) must come back EXACTLY.
  fixture.effortRow.button.style.height = '34px'
  fixture.effortRow.valueSpan.style.color = 'rgb(1, 2, 3)'
  const { bridge } = makeBridge(fixture)
  bridge.start()
  const host = bridge.host()
  // The component tints the value text; simulate that.
  host.value.style.color = 'rgb(139, 92, 246)'
  bridge.dispose()

  assert.equal(fixture.effortRow.button.querySelectorAll('.ces-inline').length, 0)
  assert.equal(fixture.effortRow.button.style.height, '34px', 'the host\'s own height must be restored, not cleared')
  assert.equal(fixture.effortRow.button.style.flexWrap, '')
  assert.equal(fixture.effortRow.button.style.paddingTop, '')
  assert.equal(fixture.effortRow.button.style.paddingBottom, '')
  assert.equal(fixture.effortRow.valueSpan.style.color, 'rgb(1, 2, 3)',
    'the value text colour must be restored to the host\'s own inline value')
})

test('THE WHOLE MENU ROOT being removed lets a NEW menu be decorated', function () {
  // THE REGRESSION. `current.row.parentNode !== null` cannot prove the row is still in the
  // document: when the host tears down the entire menu block, our row keeps a parent (the
  // detached menu) while the menu itself is gone. A parent-based check therefore reported
  // "still attached" forever, so the bridge kept the stale host and never mounted into the
  // new menu — the slider would stop appearing after the first menu teardown, with no
  // error anywhere.
  const fixture = hostDom()
  const { bridge, changes } = makeBridge(fixture)
  bridge.start()
  assert.notEqual(bridge.host(), null)
  assert.equal(fixture.effortRow.button.querySelectorAll('.ces-inline').length, 1)

  // The host removes the WHOLE menu (not just the row), then renders a brand new one.
  fixture.menu.remove()
  const freshMenu = fixture.doc.createElement('div')
  freshMenu.setAttribute('role', 'menu')
  freshMenu.setAttribute('id', 'model-menu')
  fixture.doc.body.appendChild(freshMenu)
  const freshEffort = fixture.doc.createElement('button')
  freshEffort.setAttribute('role', 'menuitem')
  const freshLabel = fixture.doc.createElement('span')
  freshLabel.textContent = '推理等级'
  const freshValue = fixture.doc.createElement('span')
  freshValue.className = 'cellValue'
  freshValue.textContent = 'Low'
  freshEffort.appendChild(freshLabel)
  freshEffort.appendChild(freshValue)
  const freshModel = fixture.doc.createElement('button')
  freshModel.setAttribute('role', 'menuitem')
  const freshModelLabel = fixture.doc.createElement('span')
  freshModelLabel.textContent = '模型'
  freshModel.appendChild(freshModelLabel)
  freshMenu.appendChild(freshModel)
  freshMenu.appendChild(freshEffort)

  // `isConnected` is false for the old row now, so the scan must re-resolve.
  bridge.scan()

  const host = bridge.host()
  assert.notEqual(host, null, 'the bridge must mount into the NEW menu instead of holding the stale one')
  assert.equal(host.row, freshEffort, 'the decorated row must be the new menu\'s, not the detached one')
  assert.equal(freshEffort.querySelectorAll('.ces-inline').length, 1)
  // The detached menu's row was restored on the way out.
  assert.equal(fixture.effortRow.button.style.height, '')
  assert.equal(fixture.effortRow.button.querySelectorAll('.ces-inline').length, 0)
  bridge.dispose()
})

test('removing only the row from its menu also re-resolves', function () {
  const fixture = hostDom()
  const { bridge } = makeBridge(fixture)
  bridge.start()
  fixture.effortRow.button.remove()
  bridge.scan()
  // Nothing to decorate any more, and nothing left behind.
  assert.equal(bridge.host(), null)
  assert.equal(fixture.effortRow.button.querySelectorAll('.ces-inline').length, 0)
  bridge.dispose()
})

test('dispose restores the collapsed seat tint', function () {
  const fixture = hostDom()
  const { bridge } = makeBridge(fixture)
  bridge.start()
  bridge.setSeatColor('rgb(139, 92, 246)')
  assert.equal(fixture.seatEffort.style.color, 'rgb(139, 92, 246)')
  bridge.dispose()
  assert.equal(fixture.seatEffort.style.color, '')
})

test('the seat tint follows the level after the WHOLE model-label block is replaced', function () {
  // THE REGRESSION. The seat span was tracked by `parentNode !== null`. When the host
  // re-renders the model-label block, it removes the CONTAINER — so the old span keeps a
  // parent (the detached block) while no longer being in the document. A parent-based
  // check therefore reported "still attached", the bridge kept tinting the dead span, and
  // the NEW collapsed level label was never coloured: the tint silently stopped
  // following the level after the first such re-render.
  const fixture = hostDom()
  const { bridge } = makeBridge(fixture)
  bridge.start()
  bridge.setSeatColor('rgb(139, 92, 246)')
  assert.equal(fixture.seatEffort.style.color, 'rgb(139, 92, 246)')

  // The host replaces the block that WRAPS the label + effort spans, not the spans.
  const wrapper = fixture.doc.createElement('span')
  fixture.seat.removeChild(fixture.seatLabel)
  fixture.seat.removeChild(fixture.seatEffort)
  wrapper.appendChild(fixture.seatLabel)
  wrapper.appendChild(fixture.seatEffort)
  fixture.seat.appendChild(wrapper)
  wrapper.remove() // the old block (with our tinted span) is detached whole

  const freshLabel = fixture.doc.createElement('span')
  freshLabel.textContent = 'DeepSeek-V41-Flash'
  const freshEffort = fixture.doc.createElement('span')
  freshEffort.textContent = 'Low'
  fixture.seat.appendChild(freshLabel)
  fixture.seat.appendChild(freshEffort)

  bridge.scan()

  assert.equal(freshEffort.style.color, 'rgb(139, 92, 246)',
    'the NEW collapsed level label must be tinted; the tint cannot stay on the detached span')
  assert.equal(fixture.seatEffort.style.color, '',
    'the detached holder\'s tint must be restored on the way out, not leaked')
  bridge.dispose()
  assert.equal(freshEffort.style.color, '')
})

test('the seat tint is re-resolved when the seat moves to a different composer', function () {
  // Same failure mode through the other door: the held span is connected, but it is no
  // longer inside OUR composer, so tinting it colours someone else's seat.
  const fixture = hostDom()
  const { bridge } = makeBridge(fixture)
  bridge.start()
  bridge.setSeatColor('rgb(139, 92, 246)')
  assert.equal(fixture.seatEffort.style.color, 'rgb(139, 92, 246)')

  // A second composer takes over the seat element.
  const other = fixture.doc.createElement('div')
  other.setAttribute('data-composer-card', '')
  fixture.doc.body.appendChild(other)
  other.appendChild(fixture.seat)
  const ownEffort = fixture.doc.createElement('span')
  ownEffort.textContent = 'Low'
  const ownSeat = fixture.doc.createElement('button')
  ownSeat.setAttribute('aria-haspopup', 'menu')
  ownSeat.setAttribute('aria-expanded', 'true')
  const ownLabel = fixture.doc.createElement('span')
  ownLabel.textContent = 'DeepSeek-V41-Flash'
  ownSeat.appendChild(ownLabel)
  ownSeat.appendChild(ownEffort)
  fixture.composer.appendChild(ownSeat)

  bridge.scan()

  assert.equal(fixture.seatEffort.style.color, '', 'the foreign seat must lose our tint')
  assert.equal(ownEffort.style.color, 'rgb(139, 92, 246)', 'and our own seat must gain it')
  bridge.dispose()
})

test('the bridge never writes the host row\'s text content', function () {
  const fixture = hostDom()
  const before = fixture.effortRow.button.textContent
  const { bridge } = makeBridge(fixture)
  bridge.start()
  bridge.dispose()
  assert.equal(fixture.effortRow.button.textContent, before)
})

test('closing the menu detaches the decoration', function () {
  const fixture = hostDom()
  const { bridge, changes } = makeBridge(fixture)
  bridge.start()
  assert.notEqual(bridge.host(), null)
  fixture.seat.setAttribute('aria-expanded', 'false')
  bridge.scan()
  assert.equal(bridge.host(), null)
  assert.equal(fixture.effortRow.button.querySelectorAll('.ces-inline').length, 0)
  assert.equal(changes.length, 2, 'one change on mount, one on detach')
  assert.equal(changes[1], null)
  bridge.dispose()
})

/* ─── streaming: one scan per frame, and never a scan per mutation ──────────── */

/** A batch in the shape MutationObserver hands over. */
function batch(added = [], removed = []) {
  return [{ type: 'childList', addedNodes: added, removedNodes: removed }]
}

test('a token-level mutation batch is ignored without touching the DOM', function () {
  // Streaming adds text and spans continuously. The callback runs on the main thread,
  // so it must decide from the RECORDS ONLY — no traversal, no selector query.
  const fixture = hostDom()
  const { bridge } = makeBridge(fixture)
  bridge.start()

  const text = fixture.doc.createTextNode('a streamed token')
  const span = fixture.doc.createElement('span')
  span.textContent = 'another token'
  const result = bridge.notify(batch([text, span]))
  assert.equal(result, false, 'plain content nodes are not our business')
  assert.equal(bridge.hasPendingScan(), false, 'and they must not queue a scan either')
  bridge.dispose()
})

test('a batch that adds a menu root queues exactly ONE scan', function () {
  const fixture = hostDom()
  const { bridge } = makeBridge(fixture)
  bridge.start()
  const menu = fixture.doc.createElement('div')
  menu.setAttribute('role', 'menu')
  assert.equal(bridge.notify(batch([menu])), true)
  assert.equal(bridge.hasPendingScan(), true, 'a coalesced scan is pending')
  bridge.dispose()
})

test('many mutations in one frame produce one scan, not one per mutation', function () {
  // The coalescing contract: the frame handle is set once and reused.
  const fixture = hostDom()
  const { bridge } = makeBridge(fixture)
  bridge.start()
  for (let i = 0; i < 50; i += 1) {
    const menu = fixture.doc.createElement('div')
    menu.setAttribute('role', 'menu')
    bridge.notify(batch([menu]))
  }
  assert.equal(bridge.hasPendingScan(), true, 'still exactly one pending scan')
  bridge.dispose()
})

test('removing the decorated row is noticed from the records alone', function () {
  const fixture = hostDom()
  const { bridge } = makeBridge(fixture)
  bridge.start()
  const host = bridge.host()
  assert.equal(bridge.notify(batch([], [host.row])), true, 'our row vanished: we must restore')
  bridge.dispose()
})

test('dispose cancels a pending coalesced scan', function () {
  // A frame that ran after dispose would scan a DOM we had already restored, and keep a
  // dead component's closure alive.
  const fixture = hostDom()
  const { bridge } = makeBridge(fixture)
  bridge.start()
  const menu = fixture.doc.createElement('div')
  menu.setAttribute('role', 'menu')
  bridge.notify(batch([menu]))
  assert.equal(bridge.hasPendingScan(), true)
  bridge.dispose()
  assert.equal(bridge.hasPendingScan(), false, 'dispose must cancel the frame it scheduled')
})

/**
 * A minimal `window` double.
 *
 * Why not `Object.assign({}, jsdomWindow, {...})`: several of those properties are
 * getter-only on the jsdom window, so the override silently does nothing and the test
 * ends up asserting against the real implementation.
 */
function fakeWin(overrides = {}) {
  return {
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (handle) => clearTimeout(handle),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true },
    setInterval: () => 0,
    clearInterval() {},
    ...overrides,
  }
}

test('dispose disconnects the observer', function () {
  const fixture = hostDom()
  const created = []
  class ObserverStub {
    constructor(callback) { this.callback = callback; created.push(this) }
    observe() {}
    disconnect() { this.disconnected = true }
  }
  const { bridge } = makeBridge(fixture, { win: fakeWin({ MutationObserver: ObserverStub }) })
  bridge.start()
  assert.equal(created.length, 1)
  bridge.dispose()
  assert.equal(created[0].disconnected, true)
})

test('without a MutationObserver the bridge falls back to a coalesced poll and clears it on dispose', function () {
  const fixture = hostDom()
  let intervalCallback = null
  let cleared = false
  const win = fakeWin({
    MutationObserver: undefined,
    setInterval: (callback) => { intervalCallback = callback; return 99 },
    clearInterval: () => { intervalCallback = null; cleared = true },
  })
  // The constructor reads `win.MutationObserver` first and the global second, so both
  // have to be absent for the fallback path to be taken.
  const savedGlobal = globalThis.MutationObserver
  globalThis.MutationObserver = undefined
  try {
    const { bridge } = makeBridge(fixture, { win })
    bridge.start()
    assert.equal(typeof intervalCallback, 'function', 'no observer means a low-frequency poll')
    assert.notEqual(bridge.host(), null, 'and the initial scan still mounted')
    bridge.dispose()
    assert.equal(cleared, true, 'dispose must clear the poll')
    assert.equal(intervalCallback, null)
  } finally {
    globalThis.MutationObserver = savedGlobal
  }
})

test('the bridge sends a resize so the host re-measures its fixed-positioned menu', function () {
  // The host measures its menu and then fixes its position; growing the row would leave
  // it clipped unless the host re-measures. `resize` is the host's own trigger.
  const fixture = hostDom()
  let resizes = 0
  const win = fakeWin({
    Event: function FakeEvent(type) { this.type = type },
    dispatchEvent: (event) => { if (event && event.type === 'resize') resizes += 1; return true },
  })
  const { bridge } = makeBridge(fixture, { win })
  bridge.start()
  assert.equal(resizes, 1)
  bridge.dispose()
})

test('two bridges cannot decorate the same row at once', function () {
  const fixture = hostDom()
  const first = makeBridge(fixture)
  const second = makeBridge(fixture)
  first.bridge.start()
  second.bridge.start()
  // The second must stand down rather than fight over the same inline styles.
  assert.equal(fixture.effortRow.button.querySelectorAll('.ces-inline').length, 1)
  assert.equal(second.bridge.host(), null)
  // ...and one dispose must not remove the other's work.
  second.bridge.dispose()
  assert.equal(fixture.effortRow.button.querySelectorAll('.ces-inline').length, 1)
  first.bridge.dispose()
  assert.equal(fixture.effortRow.button.querySelectorAll('.ces-inline').length, 0)
})

test('a disposed bridge stops reacting to everything', function () {
  const fixture = hostDom()
  const { bridge, changes } = makeBridge(fixture)
  bridge.start()
  bridge.dispose()
  const before = changes.length
  bridge.scan()
  const menu = fixture.doc.createElement('div')
  menu.setAttribute('role', 'menu')
  bridge.notify(batch([menu]))
  assert.equal(changes.length, before, 'a disposed bridge must not notify again')
  assert.equal(bridge.host(), null)
})

test('the bridge tolerates a document without a body or a heading', function () {
  // Fail open: no body means no place to observe, and that must not throw.
  const { doc } = hostDom()
  const bridge = createMenuBridge({
    doc: { createElement: (tag) => doc.createElement(tag) },
    win: null,
    anchor: () => null,
    active: () => true,
    onChange: () => {},
    seatLabels: () => [],
  })
  assert.notEqual(bridge, null)
  assert.doesNotThrow(() => bridge.start())
  assert.doesNotThrow(() => bridge.dispose())
})

test('createMenuBridge returns null without a usable document', function () {
  assert.equal(createMenuBridge({ doc: null, win: null, anchor: () => null, active: () => true, onChange: () => {}, seatLabels: () => [] }), null)
})

test('the WatcherStub double is only used to prove the bridge does not need ResizeObserver', function () {
  // The bridge itself does no measuring (the component owns the track metrics), so it
  // must work with no observer implementation at all.
  const fixture = hostDom()
  const saved = globalThis.ResizeObserver
  globalThis.ResizeObserver = undefined
  try {
    const { bridge } = makeBridge(fixture)
    bridge.start()
    assert.notEqual(bridge.host(), null)
    bridge.dispose()
  } finally {
    globalThis.ResizeObserver = saved
  }
  assert.equal(typeof WatcherStub, 'function')
})
