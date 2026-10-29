import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { composerInset, MIN_CONTENT_WIDTH, RAIL_WIDTH, railFits } from '../client/src/geometry.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ARTIFACT = join(ROOT, 'client/client.js')
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/**
 * A layout harness: a stub DOM plus a minimal hook runtime.
 *
 * WHY. The rail's reservation is invisible to pure logic tests: it only appears
 * after the geometry effect measures the scroller, sets state, re-renders and
 * the reservation effect writes two CSS custom properties. A bug there is
 * silent, and the two review findings were exactly of that shape. This runtime
 * runs the component's own hooks (state + effects with dependency comparison),
 * so the assertions below are about values React actually produced.
 *
 * The DOM is modelled on the host's structure:
 *
 *   [data-conversation-content]
 *     [data-conversation-scroll]      <- owns the scrollbar gutter
 *       [data-composer-seat]          (absolute only while a trajectory
 *                                      overlay is mounted; CSS handles the
 *                                      offset, asserted in styles.test.mjs)
 */
function createEnvironment({ viewport = 1600, scrollbar = 5 } = {}) {
  const scroller = {
    rect: { left: 400, top: 120, width: 900, height: 780, right: 1300 },
    offsetWidth: 900,
    clientWidth: 900 - scrollbar,
    getBoundingClientRect() { return this.rect },
  }
  const content = {
    rect: { left: 400, top: 120, width: 902, height: 780, right: 1302 },
    querySelector: (selector) => (selector === '[data-conversation-scroll]' ? scroller : null),
    getBoundingClientRect() { return this.rect },
  }

  const bodyStyle = new Map()
  const body = {
    dataset: {},
    style: {
      setProperty(name, value) { bodyStyle.set(name, value) },
      removeProperty(name) { bodyStyle.delete(name) },
    },
  }

  const observers = []
  const resizeListeners = []
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.dead = false; observers.push(this) }
    observe() {}
    disconnect() { this.dead = true }
  }
  globalThis.document = {
    body,
    head: { appendChild: () => {} },
    createElement: () => ({ dataset: {}, textContent: '', parentNode: null }),
    querySelector: (selector) => (selector === '[data-conversation-content]' ? content : null),
  }
  globalThis.window = {
    innerWidth: viewport,
    setTimeout: (fn) => { fn(); return 0 },
    clearTimeout: () => {},
    addEventListener: (type, fn) => { if (type === 'resize') resizeListeners.push(fn) },
    removeEventListener: () => {},
    localStorage: { getItem: () => '1', setItem: () => {} },
    __ModuleLoader__: null,
  }

  return {
    body, bodyStyle, content, scroller, observers,
    resizeTo(width) {
      content.rect.width = width
      scroller.rect.width = width
      scroller.offsetWidth = width
      scroller.clientWidth = width - scrollbar
      for (const observer of observers) if (!observer.dead) observer.callback()
      for (const listener of resizeListeners) listener()
    },
  }
}

/** Minimal hook runtime: positional state, dependency-compared effects. */
function createRuntime() {
  const state = []
  const ranDeps = []
  const cleanups = []
  let pending = []
  let index = 0
  let dirty = false

  const sameDeps = (left, right) => left.length === right.length && left.every((value, i) => Object.is(value, right[i]))

  const React = {
    Fragment: 'fragment',
    Component: class { constructor(props) { this.props = props } },
    createElement: (type, props, ...children) => ({ type, props, children }),
    createPortal: (node) => node,
    useState(initial) {
      const slot = index++
      if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial
      return [state[slot], (next) => {
        const value = typeof next === 'function' ? next(state[slot]) : next
        if (!Object.is(value, state[slot])) { state[slot] = value; dirty = true }
      }]
    },
    useEffect(fn, deps = []) {
      const slot = index++
      pending.push({ slot, fn, deps })
    },
    useSyncExternalStore: () => undefined,
  }

  return {
    React,
    run(component, props) {
      let guard = 0
      do {
        dirty = false
        index = 0
        pending = []
        const element = component(props)
        for (const effect of pending) {
          const previous = ranDeps[effect.slot]
          if (previous !== undefined && sameDeps(previous, effect.deps)) continue
          if (typeof cleanups[effect.slot] === 'function') cleanups[effect.slot]()
          const cleanup = effect.fn()
          cleanups[effect.slot] = typeof cleanup === 'function' ? cleanup : undefined
          ranDeps[effect.slot] = effect.deps
        }
        guard += 1
      } while (dirty && guard < 20)
      return guard
    },
  }
}

/** Load the committed bundle and return the component apply() registered. */
function loadComponent(React) {
  let exported = null
  const window = globalThis.window
  window.__ModuleLoader__ = {
    load(registration) {
      assert.equal(registration.id, MANIFEST.name)
      exported = registration.factory((name) => {
        if (name === 'react') return React
        if (name === 'react-dom') return { createPortal: (node) => node }
        throw new Error('unexpected require: ' + name)
      })
    },
  }
  // eslint-disable-next-line no-new-func
  new Function('window', readFileSync(ARTIFACT, 'utf8'))(window)

  let component = null
  exported.apply({
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject: (_name, factory) => factory(),
      register: (_options, registered) => { component = registered; return () => {} },
    },
    effect: (fn) => { fn(); return () => {} },
  })
  assert.equal(typeof component, 'function')
  return component
}

function mount(options = {}) {
  const env = createEnvironment(options)
  const runtime = createRuntime()
  const component = loadComponent(runtime.React)
  const props = {
    sessionId: 'session-test',
    useProjection: () => undefined,
    useSessions: (selector) => selector({ byId: {} }),
    t: (key) => key,
  }
  runtime.run(component, props)
  return { env, runtime, component, props }
}

test('an open rail reserves its width and a composer inset that clears it', () => {
  const { env } = mount({ viewport: 1600, scrollbar: 5 })
  assert.equal(env.body.dataset.dcrOpen, 'true')
  assert.equal(env.bodyStyle.get('--dcr-rail-width'), '328px')
  // The seat is positioned against the scroller's padding box: rail + gutter.
  assert.equal(env.bodyStyle.get('--dcr-composer-inset'), '333px')
  // The rail's left edge and the seat's right edge land on the same pixel:
  // rail left = viewport - right offset - width; seat right = padding-box
  // right - inset. Both are 967 here.
  const gutter = env.scroller.offsetWidth - env.scroller.clientWidth
  const railLeft = 1600 - (1600 - env.scroller.rect.right + gutter) - RAIL_WIDTH
  const seatRight = env.scroller.rect.right - Number.parseFloat(env.bodyStyle.get('--dcr-composer-inset'))
  assert.equal(railLeft, seatRight)
})

test('a narrow column closes the rail and releases both reservations', () => {
  const { env, runtime, component, props } = mount({ viewport: 1600, scrollbar: 5 })
  assert.ok(env.bodyStyle.has('--dcr-rail-width'))

  env.resizeTo(RAIL_WIDTH + MIN_CONTENT_WIDTH - 1)
  // The observer's setState needs a render pass to reach the reservation
  // effect, exactly like React's scheduler would give it one.
  runtime.run(component, props)
  assert.equal(env.body.dataset.dcrOpen, undefined)
  assert.equal(env.bodyStyle.has('--dcr-rail-width'), false)
  assert.equal(env.bodyStyle.has('--dcr-composer-inset'), false)
  assert.equal(railFits(RAIL_WIDTH + MIN_CONTENT_WIDTH - 1), false)

  // Back to a wide column: the rail returns with fresh reservations.
  env.resizeTo(900)
  runtime.run(component, props)
  assert.equal(env.body.dataset.dcrOpen, 'true')
  assert.equal(env.bodyStyle.get('--dcr-rail-width'), '328px')
  assert.equal(env.bodyStyle.get('--dcr-composer-inset'), '333px')
})

test('the composer inset is rail plus the measured gutter, at any gutter width', () => {
  assert.equal(composerInset(5), 333)
  assert.equal(composerInset(0), 328)
  assert.equal(composerInset(11), 339)
  assert.equal(composerInset(Number.NaN), 328)
  assert.equal(composerInset(undefined), 328)

  // A scrollbar-less scroller still has to clear the whole rail.
  const { env } = mount({ viewport: 1600, scrollbar: 0 })
  assert.equal(env.bodyStyle.get('--dcr-composer-inset'), '328px')
})
