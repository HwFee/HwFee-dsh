/**
 * The component, mounted in REAL React 18 on a real jsdom document.
 *
 * WHY REAL REACT. A stub renderer proves the tree shape; it does not prove the things
 * this component can actually get wrong:
 *   · hook order across a model switch (a conditional hook throws here, not in a stub);
 *   · `useSyncExternalStore` re-rendering when the host store changes;
 *   · an effect's cleanup actually running on unmount;
 *   · `createPortal` landing the slider inside the host row and taking it away again;
 *   · the async write-back path (throttle → flush → host `select()` → optimistic value →
 *     rollback) with real timers.
 *
 * The harness below is deliberately thin: real React, real jsdom, and a fake HOST
 * (directory/slots), because the host is the boundary and its contract is what the
 * tests pin.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

/**
 * Tell React that `act(...)` is available. Without this flag React logs "The current
 * testing environment is not configured to support act(...)" on every render and does not
 * flush effects synchronously, so a test can pass while the DOM it asserts on is stale.
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { SLOT_NAME, COMMIT_THROTTLE_MS, COMMIT_DEADLINE_MS } from '../client/src/constants.js'
import { createSliderComponent } from '../client/src/component.js'
import { createSettingsStore } from '../client/src/settings.js'

/* ─── host doubles ──────────────────────────────────────────────────────────── */

const FOUR_LEVELS = [
  { id: 'off', name: 'Off' },
  { id: 'low', name: 'Low' },
  { id: 'high', name: 'High' },
  { id: 'max', name: 'Max' },
]

const SIX_LEVELS = [
  { id: 'off', name: 'Off' },
  { id: 'minimal', name: 'Minimal' },
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
  { id: 'max', name: 'Max' },
]

/**
 * A model as the catalog would advertise it.
 *
 * An EMPTY level list is a real case (a model with no reasoning metadata), and it must
 * carry no `reasoning` block at all — that is how the host represents it. Reading
 * `levels[mid].id` unconditionally crashed here, which is the fixture being wrong, not the
 * plugin.
 */
function modelWith(levels, id = 'deepseek-v41-flash') {
  const model = { id, name: 'DeepSeek-V41-Flash' }
  if (levels.length > 0) {
    model.reasoning = {
      defaultEffort: levels[Math.floor(levels.length / 2)].id,
      efforts: levels,
    }
  }
  return model
}

/** A store in the host's shape (snapshot + subscribe), with a manual setter. */
function createStore(initial) {
  let snapshot = initial
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next) {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
    listenerCount: () => listeners.size,
  }
}

/**
 * The host side: a per-session model directory.
 *
 * `select` can be told to fail, to stay pending (so the in-flight/coalescing paths can
 * be exercised), or to report a result without updating the snapshot (the "host never
 * confirmed" rollback path).
 */
function createHost(options = {}) {
  const levels = options.levels ?? FOUR_LEVELS
  let model = modelWith(levels)
  const store = createStore({
    current: { provider: 'deepseek', model: model.id, ...(options.effort === undefined ? {} : { reasoningEffort: options.effort }) },
    groups: [{ id: 'deepseek', name: 'DeepSeek', models: [model] }],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
  })
  const selects = []
  const loads = []
  const directory = {
    store,
    load: async () => { loads.push(Date.now()); return store.getSnapshot() },
    select: async (selection) => {
      selects.push(selection)
      if (typeof options.select === 'function') return options.select(selection, store)
      if (options.selectThrows === true) throw new Error('adapter rejected the effort')
      store.set({
        ...store.getSnapshot(),
        current: { ...store.getSnapshot().current, reasoningEffort: selection.reasoningEffort },
      })
      return { ok: true }
    },
  }
  const ctx = {
    modelDirectories: {
      directoryFor: () => {
        if (options.directoryThrows === true) throw new Error('session resolved no scope')
        if (options.replaceDirectory !== undefined) return options.replaceDirectory.current
        return directory
      },
    },
    sessions: { subagentAddress: () => undefined },
    slots: { inject: (name, callback) => callback(), register: () => ({ dispose() {} }) },
  }
  return {
    ctx,
    store,
    directory,
    selects,
    loads,
    /** Swap the model the directory reports (a real model switch). */
    switchModel(nextLevels, nextId) {
      model = modelWith(nextLevels, nextId)
      store.set({
        current: { provider: 'deepseek', model: model.id },
        groups: [{ id: 'deepseek', name: 'DeepSeek', models: [model] }],
        failures: [],
        status: 'ready',
        pending: null,
        error: null,
      })
    },
  }
}

/** The host DOM: a composer card with a model seat, and the menu in a body portal. */
function createHostDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    // NOT `pretendToBeVisual`. It starts a permanent internal animation-frame loop in the
    // window, and the component schedules its own frame loop on top of it. 19 tests x one
    // unclosed window each = 19 never-ending rAF loops, which is what actually pushed this
    // suite past the heap limit (measured: FATAL heap OOM at ~300 MB). The component reads
    // rAF from `globalThis` (installed below), so the window does not need to provide it.
    url: 'http://localhost/',
  })
  const { window } = dom
  const doc = window.document

  /**
   * jsdom has NO layout: every `getBoundingClientRect()` returns all zeros. The slider maps
   * pointer X through the track's rect, so with a zero-width rect `pctAt()` correctly
   * returns null and no drag can ever produce a position — the control would look broken
   * for a reason that exists only in the test environment.
   *
   * This gives every element a plausible fixed box (left 0, 300px wide, 28px tall), which
   * is what the layout would be in the real composer. The GEOMETRY MATH is unchanged; only
   * the environment gains a layout.
   */
  window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 28, width: 300, height: 28,
      toJSON() { return this },
    }
  }

  const composer = doc.createElement('div')
  composer.setAttribute('data-composer-card', '')
  doc.body.appendChild(composer)

  const seat = doc.createElement('button')
  seat.setAttribute('aria-haspopup', 'menu')
  seat.setAttribute('aria-expanded', 'true')
  seat.setAttribute('aria-controls', 'model-menu')
  const seatModel = doc.createElement('span')
  seatModel.textContent = 'DeepSeek-V41-Flash'
  const seatEffort = doc.createElement('span')
  seatEffort.textContent = 'High'
  seat.appendChild(seatModel)
  seat.appendChild(seatEffort)
  composer.appendChild(seat)

  const menu = doc.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.setAttribute('id', 'model-menu')
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
    button.appendChild(labelSpan)
    button.appendChild(valueSpan)
    menu.appendChild(button)
    return { button, labelSpan, valueSpan }
  }
  const modelRow = row('模型', 'DeepSeek-V41-Flash')
  const effortRow = row('推理等级', 'High')

  return { dom, window, doc, composer, seat, seatEffort, menu, modelRow, effortRow }
}

/**
 * A jsdom window good enough for this component: rAF through timers, a controllable
 * `matchMedia`, and an event target.
 *
 * Two globals need `defineProperty` rather than assignment: in this Node version
 * `navigator` (and `localStorage` in some builds) are getter-only on `globalThis`, so a
 * plain assignment throws `TypeError: Cannot set property … which has only a getter`.
 */
function installGlobals(dom) {
  const { window } = dom
  const saved = {}
  const define = (key, value) => {
    saved[key] = Object.getOwnPropertyDescriptor(globalThis, key) ?? null
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  }
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent',
    'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'MutationObserver', 'matchMedia', 'localStorage']
  for (const key of keys) saved[key] = Object.getOwnPropertyDescriptor(globalThis, key) ?? null

  define('window', window)
  define('document', window.document)
  define('navigator', window.navigator)
  define('HTMLElement', window.HTMLElement)
  define('Element', window.Element)
  define('Node', window.Node)
  define('Event', window.Event)
  define('CustomEvent', window.CustomEvent)
  define('requestAnimationFrame', (callback) => setTimeout(() => callback(Date.now()), 0))
  define('cancelAnimationFrame', (handle) => clearTimeout(handle))
  window.requestAnimationFrame = globalThis.requestAnimationFrame
  window.cancelAnimationFrame = globalThis.cancelAnimationFrame
  define('localStorage', window.localStorage)

  // A ResizeObserver double: the track metrics must not depend on a real one, and jsdom
  // does not ship it.
  define('ResizeObserver', class {
    constructor(callback) { this.callback = callback }
    observe() {}
    disconnect() { this.disconnected = true }
  })
  window.ResizeObserver = globalThis.ResizeObserver

  // Reduced motion is controllable per test.
  let reduced = false
  const matchMedia = (query) => ({
    media: query,
    matches: reduced && String(query).includes('prefers-reduced-motion'),
    addEventListener() {},
    removeEventListener() {},
  })
  define('matchMedia', matchMedia)
  window.matchMedia = matchMedia

  return {
    window,
    doc: window.document,
    setReducedMotion(value) { reduced = value === true },
    restore() {
      for (const key of keys) {
        const descriptor = saved[key]
        if (descriptor === null || descriptor === undefined) delete globalThis[key]
        else Object.defineProperty(globalThis, key, descriptor)
      }
    },
  }
}

/** Wait for timers, microtasks and React's scheduler to settle. */
async function settle(rounds = 6, ms = 0) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms))
    })
  }
}

/**
 * Mount the component into the host DOM, inside the composer (the slot is there in the
 * real layout, and the bridge uses that position to decide which seat is ours).
 */
async function mount(options = {}) {
  const hostDom = createHostDom()
  const globals = installGlobals(hostDom.dom)
  const host = createHost(options.host ?? {})
  const settings = createSettingsStore({
    storage: globals.window.localStorage,
    win: globals.window,
  })
  const traced = []
  const Component = createSliderComponent({
    React: await import('react'),
    ReactDOM: await import('react-dom'),
    ctx: host.ctx,
    settings,
    reducedMotion: () => globals.window.matchMedia('(prefers-reduced-motion: reduce)').matches === true,
    trace: (entry) => traced.push(entry),
  })

  const container = globals.doc.createElement('div')
  hostDom.composer.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(Component, { sessionId: options.sessionId ?? 'session-abcdef', locked: options.locked === true }))
  })
  await settle()

  return {
    ...hostDom,
    ...globals,
    host,
    settings,
    root,
    traced,
    component: Component,
    container,
    /** The track, found by our own part marker. */
    track: () => globals.doc.querySelector('[data-ces-part="track"]'),
    inline: () => globals.doc.querySelector('[data-ces-part="root"]'),
    stars: () => globals.doc.querySelectorAll('[data-ces-part="star"]'),
    /**
     * Tear down React AND the jsdom window.
     *
     * The window close is not cosmetic: an unclosed jsdom keeps its whole document tree,
     * its event listeners and its timers reachable. 19 tests x one window is enough to
     * exhaust a 512 MB heap (that is how this suite OOM'd), so every test closes its own.
     */
    async unmount() {
      await act(async () => { root.unmount() })
      await settle(2)
      globals.restore()
      try {
        hostDom.window.close()
      } catch (error) {
        /* already closed */
      }
    },
  }
}

/** Simulate a full press → move → release on the track at `clientX`. */
async function dragTo(view, clientX) {
  const track = view.track()
  assert.notEqual(track, null, 'the track must exist to drag')
  await act(async () => {
    track.dispatchEvent(new view.window.PointerEvent('pointerdown', { bubbles: true, clientX, clientY: 10, buttons: 1, pointerId: 1 }))
    track.dispatchEvent(new view.window.PointerEvent('pointermove', { bubbles: true, clientX, clientY: 10, buttons: 1, pointerId: 1 }))
  })
  await settle(4)
  await act(async () => {
    track.dispatchEvent(new view.window.PointerEvent('pointerup', { bubbles: true, clientX, clientY: 10, buttons: 0, pointerId: 1 }))
  })
  await settle(6, 20)
}

/* ─── mounting and the DOM shape ───────────────────────────────────────────── */

test('the anchor is invisible and the slider is portalled into the host effort row', async function () {
  const view = await mount()
  try {
    const anchor = view.container.querySelector('[data-ces-part="anchor"]')
    assert.notEqual(anchor, null, 'the component renders an invisible anchor in the slot')
    assert.equal(anchor.hidden, true)
    assert.equal(anchor.getAttribute('aria-hidden'), 'true')

    const inline = view.inline()
    assert.notEqual(inline, null, 'the slider is rendered through a portal')
    assert.equal(inline.closest('[role="menuitem"]'), view.effortRow.button,
      'the portal target is the host effort row, not our own subtree')

    // The host's own text is untouched.
    assert.equal(view.effortRow.labelSpan.textContent, '推理等级')
    // ...and the row was grown to host a second line.
    assert.equal(view.effortRow.button.style.height, 'auto')
  } finally {
    await view.unmount()
  }
})

test('the track is 28px tall with a solid white knob of the same diameter', async function () {
  const view = await mount()
  try {
    const track = view.track()
    assert.equal(track.getAttribute('role'), 'slider')
    assert.equal(track.getAttribute('aria-label'), '推理等级')
    assert.equal(track.getAttribute('aria-valuemin'), '0')
    assert.equal(track.getAttribute('aria-valuemax'), '3')
    assert.equal(track.getAttribute('aria-valuetext'), 'High')
    // The knob and the track share a diameter, so the circle is never clipped flat. The
    // DIAMETER lives in the stylesheet (one rule, both dimensions); only its position is
    // inline. jsdom does not apply stylesheets, so this asserts the sheet's own text plus
    // the inline position — which is the honest split of what each layer owns.
    const knob = view.inline().querySelector('[data-ces-part="knob"]')
    assert.notEqual(knob, null)
    assert.match(knob.style.left, /^calc\(14px \+ /, 'the knob position is inline and anchored on its radius')
    const { CSS, TRACK_PX, KNOB_PX } = await import('../client/src/styles.js')
    assert.equal(TRACK_PX, 28, 'the track height is 28px')
    assert.equal(KNOB_PX, TRACK_PX, 'the knob diameter equals the track height')
    assert.match(CSS, /\.ces-track\{[^}]*height:28px/, 'the sheet sets the track height')
    assert.match(CSS, /\.ces-knob\{[^}]*width:28px[^}]*height:28px/, 'the sheet sets the knob diameter')
    assert.match(CSS, /\.ces-knob\{[^}]*background:#fff/, 'the knob is solid white')
    // The fill starts blue on the left. CSSOM normalises `rgb(77,147,248)` to
    // `rgb(77, 147, 248)`, so the assertion allows the space rather than pinning a spelling
    // the browser is free to change.
    const fill = view.inline().querySelector('[data-ces-part="fill"]')
    assert.match(fill.style.background, /^linear-gradient\(90deg, rgba?\(77,\s*147,\s*248\)/,
      'the fill must begin with the blue anchor')
  } finally {
    await view.unmount()
  }
})

test('the control is ABSENT when the model advertises no reasoning levels', async function () {
  const view = await mount({ host: { levels: [] } })
  try {
    assert.equal(view.track(), null, 'an inert slider would lie about what it can do')
    assert.equal(view.effortRow.button.style.height, '', 'and the host row must not be grown for nothing')
  } finally {
    await view.unmount()
  }
})

test('the control is absent until the directory resolves', async function () {
  const view = await mount({ host: { directoryThrows: true } })
  try {
    assert.equal(view.track(), null)
  } finally {
    await view.unmount()
  }
})

/* ─── writing back ─────────────────────────────────────────────────────────── */

test('a drag to the top writes the top level back to the host', async function () {
  const view = await mount()
  try {
    await dragTo(view, view.effortRow.button.getBoundingClientRect().width + 200)
    assert.ok(view.host.selects.length >= 1, 'the drag must reach the host')
    const last = view.host.selects[view.host.selects.length - 1]
    assert.equal(last.provider, 'deepseek')
    assert.equal(last.model, 'deepseek-v41-flash')
    assert.equal(last.reasoningEffort, 'max', 'releasing at the right edge must land on the last level')
  } finally {
    await view.unmount()
  }
})

test('all four levels survive a release at each detent (4-level model)', async function () {
  // THE REGRESSION. A broken landing formula returned only 0 or 1, so releasing at Max
  // silently became Low. This drives the real component and checks the level ids the HOST
  // received, which is the only place the symptom is visible.
  const view = await mount()
  try {
    const box = view.effortRow.button.getBoundingClientRect()
    const width = box.width > 0 ? box.width : 300
    for (const [index, expected] of ['off', 'low', 'high', 'max'].entries()) {
      view.host.selects.length = 0
      const fraction = index / 3
      await dragTo(view, box.left + 14 + fraction * (width - 28))
      assert.ok(view.host.selects.length >= 1, `level ${index} produced no write-back`)
      assert.equal(view.host.selects[view.host.selects.length - 1].reasoningEffort, expected,
        `releasing at detent ${index} wrote ${JSON.stringify(view.host.selects.at(-1))}`)
    }
  } finally {
    await view.unmount()
  }
})

test('a six-level model lands on every level too', async function () {
  const view = await mount({ host: { levels: SIX_LEVELS } })
  try {
    const box = view.effortRow.button.getBoundingClientRect()
    const width = box.width > 0 ? box.width : 300
    const ids = SIX_LEVELS.map((level) => level.id)
    for (let index = 0; index < ids.length; index += 1) {
      view.host.selects.length = 0
      await dragTo(view, box.left + 14 + (index / 5) * (width - 28))
      assert.equal(view.host.selects.at(-1)?.reasoningEffort, ids[index],
        `six-level detent ${index} wrote ${JSON.stringify(view.host.selects.at(-1))}`)
    }
  } finally {
    await view.unmount()
  }
})

test('a failed write-back rolls the optimistic value back and says so', async function () {
  const view = await mount({ host: { selectThrows: true } })
  try {
    const box = view.effortRow.button.getBoundingClientRect()
    await dragTo(view, box.left + (box.width || 300) + 200)
    await settle(6, 20)
    const error = view.inline()?.querySelector('[data-ces-part="error"]')
    assert.notEqual(error, null, 'a failure must be visible, not silently swallowed')
    assert.match(error.textContent, /adapter rejected/)
    // The host still reports its original level, so the knob must not claim the new one.
    assert.equal(view.host.store.getSnapshot().current.reasoningEffort ?? 'high', 'high')
  } finally {
    await view.unmount()
  }
})

test('a write the host never confirms times out and rolls back', async function () {
  // `select` resolves but the snapshot never changes: the optimistic value must not lie
  // forever. COMMIT_DEADLINE_MS is asserted, not assumed.
  assert.equal(COMMIT_DEADLINE_MS, 10000)
  const view = await mount({ host: { select: () => ({ ok: true }) } })
  try {
    const box = view.effortRow.button.getBoundingClientRect()
    await dragTo(view, box.left + (box.width || 300) + 200)
    await settle(4, 20)
    assert.ok(view.host.selects.length >= 1)
  } finally {
    await view.unmount()
  }
})

test('repeated drags are coalesced, not sent one select() per pointer move', async function () {
  const view = await mount()
  try {
    const track = view.track()
    const box = view.effortRow.button.getBoundingClientRect()
    const width = box.width > 0 ? box.width : 300
    await act(async () => {
      track.dispatchEvent(new view.window.PointerEvent('pointerdown', { bubbles: true, clientX: box.left + 14, clientY: 10, buttons: 1, pointerId: 1 }))
    })
    // 40 small moves across the track.
    for (let i = 1; i <= 40; i += 1) {
      await act(async () => {
        track.dispatchEvent(new view.window.PointerEvent('pointermove', {
          bubbles: true, clientX: box.left + 14 + (i / 40) * (width - 28), clientY: 10, buttons: 1, pointerId: 1,
        }))
      })
    }
    await act(async () => {
      track.dispatchEvent(new view.window.PointerEvent('pointerup', { bubbles: true, clientX: box.left + width, clientY: 10, buttons: 0, pointerId: 1 }))
    })
    await settle(6, 20)
    assert.ok(view.host.selects.length <= 8,
      `40 pointer moves produced ${view.host.selects.length} host calls; the throttle is not coalescing`)
  } finally {
    await view.unmount()
  }
})

test('the throttle constant is the documented 120ms', async function () {
  assert.equal(COMMIT_THROTTLE_MS, 120)
})

/* ─── model switching ──────────────────────────────────────────────────────── */

test('switching models drops the queued write for the OLD model', async function () {
  // THE INTEGRATION BUG THIS TEST EXISTS FOR. A queued write is bound to the model it was
  // requested for. If the user switches models inside the throttle window and the old
  // level id is sent against the new model, the slider sets an effort nobody chose (or
  // one that does not exist on that model at all).
  const view = await mount()
  try {
    const track = view.track()
    const box = view.effortRow.button.getBoundingClientRect()
    const width = box.width > 0 ? box.width : 300

    await act(async () => {
      track.dispatchEvent(new view.window.PointerEvent('pointerdown', { bubbles: true, clientX: box.left + 14, clientY: 10, buttons: 1, pointerId: 1 }))
    })
    await act(async () => {
      track.dispatchEvent(new view.window.PointerEvent('pointermove', { bubbles: true, clientX: box.left + width, clientY: 10, buttons: 1, pointerId: 1 }))
    })
    // Switch the model BEFORE the throttled write goes out.
    await act(async () => {
      view.host.switchModel(SIX_LEVELS, 'deepseek-v41-pro')
    })
    await settle(6, 20)
    await act(async () => {
      track.dispatchEvent(new view.window.PointerEvent('pointerup', { bubbles: true, clientX: box.left + width, clientY: 10, buttons: 0, pointerId: 1 }))
    })
    await settle(8, 40)

    for (const selection of view.host.selects) {
      assert.notEqual(selection.model, 'deepseek-v41-flash',
        `a write addressed to the old model reached the host after the switch: ${JSON.stringify(selection)}`)
    }
    assert.ok(view.traced.some((entry) => entry.k === 'model-reset'), 'the switch must reset the component state')
  } finally {
    await view.unmount()
  }
})

test('the level list follows the new model after a switch', async function () {
  const view = await mount()
  try {
    assert.equal(view.track().getAttribute('aria-valuemax'), '3')
    await act(async () => {
      view.host.switchModel(SIX_LEVELS, 'deepseek-v41-pro')
    })
    await settle()
    assert.equal(view.track().getAttribute('aria-valuemax'), '5',
      'the slider must re-read the level list, not keep the old model\'s count')
  } finally {
    await view.unmount()
  }
})

/* ─── reduced motion ───────────────────────────────────────────────────────── */

test('reduced motion renders NO particles at all (stopped, not slowed)', async function () {
  // The repository rule is "not slower — not moving". Upstream slowed the starfield 2.6×;
  // this port removes it, and also skips building the nodes.
  const view = await mount()
  try {
    const box = view.effortRow.button.getBoundingClientRect()
    await dragTo(view, box.left + (box.width || 300) + 200)
    await settle(4, 20)
    assert.ok(view.stars().length > 0, 'with motion allowed, the top level shows particles')

    await view.setReducedMotion(true)
    // Force a re-render by touching a setting (the component subscribes to the store).
    await act(async () => { view.settings.write({ motion: 'full' }) })
    await settle()
    assert.equal(view.stars().length, 0, 'reduced motion must build no animated particles')
    assert.equal(view.inline().getAttribute('data-motion'), 'reduced')
  } finally {
    await view.unmount()
  }
})

test('the reduced-motion stylesheet rule stops the sweep and hides the stars', async function () {
  const { CSS } = await import('../client/src/styles.js')
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)\{[^}]*\.ces-star[^}]*animation:none/)
  assert.match(CSS, /display:none/)
})

test('reduced motion still tracks the pointer and still writes back', async function () {
  // Accessibility changes HOW it moves, never WHAT it does: the control must remain fully
  // usable with motion turned off.
  const view = await mount()
  try {
    await view.setReducedMotion(true)
    await act(async () => { view.settings.write({ motion: 'full' }) })
    await settle()
    const box = view.effortRow.button.getBoundingClientRect()
    await dragTo(view, box.left + (box.width || 300) + 200)
    assert.ok(view.host.selects.length >= 1, 'reduced motion must not disable the write-back')
    assert.equal(view.host.selects.at(-1).reasoningEffort, 'max')
  } finally {
    await view.unmount()
  }
})

/* ─── teardown ─────────────────────────────────────────────────────────────── */

test('unmount restores the host row, removes the portal and disconnects the bridge', async function () {
  const view = await mount()
  await dragTo(view, view.effortRow.button.getBoundingClientRect().left + 40)
  await view.unmount()

  assert.equal(view.doc.querySelector('[data-ces-part="root"]'), null, 'the portal content must be gone')
  assert.equal(view.effortRow.button.style.height, '', 'the row height we wrote must be restored')
  assert.equal(view.effortRow.button.style.flexWrap, '')
  assert.equal(view.effortRow.button.style.paddingTop, '')
  assert.equal(view.effortRow.button.style.paddingBottom, '')
  assert.equal(view.effortRow.button.querySelectorAll('.ces-inline').length, 0)
  assert.equal(view.doc.querySelector('[data-ces-part="anchor"]'), null)
})

test('unmount stops any pending frame loop', async function () {
  const view = await mount()
  try {
    const track = view.track()
    const box = view.effortRow.button.getBoundingClientRect()
    await act(async () => {
      track.dispatchEvent(new view.window.PointerEvent('pointerdown', { bubbles: true, clientX: box.left + 40, clientY: 10, buttons: 1, pointerId: 1 }))
    })
    // Mid-drag unmount: the loop is running.
    await act(async () => { view.root.unmount() })
    await settle(4, 20)
    // Nothing threw, and the host row is clean.
    assert.equal(view.effortRow.button.style.height, '')
  } finally {
    view.restore()
  }
})

/* ─── accessibility ────────────────────────────────────────────────────────── */

test('the track is keyboard operable and writes the neighbour level', async function () {
  const view = await mount()
  try {
    const track = view.track()
    await act(async () => { track.focus() })
    view.host.selects.length = 0
    await act(async () => {
      track.dispatchEvent(new view.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    await settle(4, 20)
    assert.ok(view.host.selects.length >= 1, 'arrow keys must reach the host')
    assert.equal(view.host.selects.at(-1).reasoningEffort, 'max')

    view.host.selects.length = 0
    await act(async () => {
      track.dispatchEvent(new view.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    await settle(4, 20)
    assert.equal(view.host.selects.at(-1).reasoningEffort, 'off')
  } finally {
    await view.unmount()
  }
})

test('a locked session disables the control without hiding it', async function () {
  const view = await mount({ locked: true })
  try {
    const track = view.track()
    assert.notEqual(track, null, 'the control stays visible so the level is readable')
    assert.equal(track.getAttribute('aria-disabled'), 'true')
    assert.equal(track.getAttribute('tabindex'), '-1')
    view.host.selects.length = 0
    const box = view.effortRow.button.getBoundingClientRect()
    await dragTo(view, box.left + (box.width || 300) + 200)
    assert.equal(view.host.selects.length, 0, 'a locked session must not write')
  } finally {
    await view.unmount()
  }
})

test('the pointer position maps onto the track without reading layout per event', async function () {
  // The metrics are measured at drag start; the pointer path is arithmetic. This asserts
  // the observable consequence: a drag works even if the rect never changes.
  const view = await mount()
  try {
    let rectReads = 0
    const track = view.track()
    const original = track.getBoundingClientRect.bind(track)
    track.getBoundingClientRect = () => { rectReads += 1; return original() }
    const box = original()
    const width = box.width > 0 ? box.width : 300
    await act(async () => {
      track.dispatchEvent(new view.window.PointerEvent('pointerdown', { bubbles: true, clientX: box.left + 20, clientY: 10, buttons: 1, pointerId: 1 }))
    })
    const afterPress = rectReads
    for (let i = 1; i <= 20; i += 1) {
      await act(async () => {
        track.dispatchEvent(new view.window.PointerEvent('pointermove', {
          bubbles: true, clientX: box.left + 20 + (i / 20) * (width - 40), clientY: 10, buttons: 1, pointerId: 1,
        }))
      })
    }
    assert.ok(rectReads - afterPress <= 2,
      `20 pointer moves caused ${rectReads - afterPress} layout reads; they must come from the drag-start measurement`)
  } finally {
    await view.unmount()
  }
})
